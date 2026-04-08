"""Lambda — async pattern with direct Strands agent (no AgentCore).

POST /generate  → starts async job, returns job_id
GET  /result    → polls for completion
GET  /diagrams  → list saved diagrams
PUT  /diagrams  → update existing diagram
"""

import json
import os
import sys
import uuid

import boto3

# Add project root to path so src/ imports work
sys.path.insert(0, os.path.dirname(__file__))

REGION = os.environ.get("AWS_REGION", "us-east-1")
BUCKET = os.environ.get("S3_BUCKET", "blueprint-diagrams")

s3 = boto3.client("s3", region_name=REGION)
lam = boto3.client("lambda", region_name=REGION)

# Lazy-init agent (only in async worker path, not on cold start for API calls)
_agent = None

def _get_agent():
    global _agent
    if _agent is None:
        from strands import Agent
        from strands.models.bedrock import BedrockModel
        from src.prompts.spec_system_prompt import get_system_prompt
        from src.tools.render_drawio import render_drawio
        from src.tools.load_diagram import load_diagram

        model = BedrockModel(
            model_id=os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"),
            region_name=REGION,
            max_tokens=4096,
        )
        _agent = Agent(
            model=model,
            system_prompt=get_system_prompt(),
            tools=[render_drawio, load_diagram],
        )
    return _agent


def handler(event, context):
    # ── Async worker path (self-invoked) ──────────────────────────────────
    if isinstance(event, dict) and "_async_job" in event:
        job_id = event["_async_job"]
        prompt = event["prompt"]
        diagram_key = event.get("diagram_key")

        from datetime import datetime, timezone
        job_start = datetime.now(timezone.utc)

        try:
            agent = _get_agent()

            # If editing an existing diagram, load its spec first
            if diagram_key:
                from src.tools.render_drawio import set_current_spec, set_current_diagram_key
                set_current_diagram_key(diagram_key)
                spec_key = diagram_key.replace(".drawio", ".spec.json")
                try:
                    obj = s3.get_object(Bucket=BUCKET, Key=spec_key)
                    spec = json.loads(obj["Body"].read())
                    set_current_spec(spec)
                    prompt = f"The current diagram spec is:\n```json\n{json.dumps(spec, indent=2)}\n```\n\nUser request: {prompt}"
                except Exception:
                    pass  # No spec found — agent will generate fresh

            result = str(agent(prompt))

            # Find diagram created during this job
            diagram_key = None
            diagram_url = None
            diagram_xml = None
            try:
                objs = s3.list_objects_v2(Bucket=BUCKET, Prefix="diagrams/", MaxKeys=100)
                for obj in sorted(objs.get("Contents", []), key=lambda x: x["LastModified"], reverse=True):
                    if obj["LastModified"].replace(tzinfo=timezone.utc) >= job_start:
                        diagram_key = obj["Key"]
                        break
            except Exception as e:
                print(f"S3 list error: {e}")

            if diagram_key:
                diagram_url = s3.generate_presigned_url(
                    "get_object", Params={"Bucket": BUCKET, "Key": diagram_key}, ExpiresIn=3600,
                )
                # Also include the XML directly so frontend doesn't need a separate fetch
                try:
                    xml_obj = s3.get_object(Bucket=BUCKET, Key=diagram_key)
                    diagram_xml = xml_obj["Body"].read().decode("utf-8")
                except Exception:
                    diagram_xml = None

            s3.put_object(
                Bucket=BUCKET,
                Key=f"jobs/{job_id}.json",
                Body=json.dumps({
                    "status": "complete",
                    "response": result,
                    "diagram_key": diagram_key,
                    "diagram_url": diagram_url,
                    "diagram_xml": diagram_xml,
                }),
                ContentType="application/json",
            )
        except Exception as e:
            s3.put_object(
                Bucket=BUCKET,
                Key=f"jobs/{job_id}.json",
                Body=json.dumps({"status": "error", "error": str(e)}),
                ContentType="application/json",
            )
        return

    # ── API Gateway path ──────────────────────────────────────────────────
    method = event.get("requestContext", {}).get("http", {}).get("method", "POST")
    path = event.get("rawPath", "/generate")

    if method == "OPTIONS":
        return resp(200, {})

    try:
        body = json.loads(event.get("body", "{}"))
    except (json.JSONDecodeError, TypeError):
        body = {}

    # POST /generate
    if path == "/generate" and method == "POST":
        prompt = body.get("prompt", "")
        if not prompt:
            return resp(400, {"error": "prompt is required"})

        job_id = str(uuid.uuid4())
        s3.put_object(
            Bucket=BUCKET,
            Key=f"jobs/{job_id}.json",
            Body=json.dumps({"status": "processing"}),
            ContentType="application/json",
        )

        payload = {"_async_job": job_id, "prompt": prompt}
        if body.get("diagram_key"):
            payload["diagram_key"] = body["diagram_key"]

        lam.invoke(
            FunctionName=context.function_name,
            InvocationType="Event",
            Payload=json.dumps(payload),
        )

        return resp(202, {"job_id": job_id, "status": "processing"})

    # GET /result?job_id=xxx
    if path == "/result" and method == "GET":
        job_id = (event.get("queryStringParameters") or {}).get("job_id", "")
        if not job_id:
            return resp(400, {"error": "job_id is required"})
        try:
            obj = s3.get_object(Bucket=BUCKET, Key=f"jobs/{job_id}.json")
            return resp(200, json.loads(obj["Body"].read()))
        except s3.exceptions.NoSuchKey:
            return resp(404, {"error": "job not found"})

    # GET /diagrams
    if path == "/diagrams" and method == "GET":
        try:
            objs = s3.list_objects_v2(Bucket=BUCKET, Prefix="diagrams/", MaxKeys=50)
            items = []
            for obj in sorted(objs.get("Contents", []), key=lambda x: x["LastModified"], reverse=True):
                key = obj["Key"]
                url = s3.generate_presigned_url("get_object", Params={"Bucket": BUCKET, "Key": key}, ExpiresIn=3600)
                items.append({"key": key, "name": key.split("/")[-1], "size": obj["Size"],
                              "modified": obj["LastModified"].isoformat(), "url": url})
            return resp(200, {"diagrams": items})
        except Exception as e:
            return resp(500, {"error": str(e)})

    # PUT /diagrams
    if path == "/diagrams" and method == "PUT":
        xml = body.get("xml", "")
        key = body.get("key", "")
        if not xml or not key:
            return resp(400, {"error": "xml and key are required"})
        s3.put_object(Bucket=BUCKET, Key=key, Body=xml.encode("utf-8"), ContentType="application/xml")
        return resp(200, {"key": key, "status": "saved"})

    # DELETE /diagrams?key=xxx
    if path == "/diagrams" and method == "DELETE":
        key = (event.get("queryStringParameters") or {}).get("key", "")
        if not key:
            return resp(400, {"error": "key is required"})
        try:
            s3.delete_object(Bucket=BUCKET, Key=key)
            spec_key = key.replace(".drawio", ".spec.json")
            s3.delete_object(Bucket=BUCKET, Key=spec_key)
            return resp(200, {"status": "deleted"})
        except Exception as e:
            return resp(500, {"error": str(e)})

    return resp(404, {"error": "not found"})


def resp(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,GET,PUT,DELETE,OPTIONS",
        },
        "body": json.dumps(body) if isinstance(body, dict) else body,
    }
