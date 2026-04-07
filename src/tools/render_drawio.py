"""Strands tool: render a JSON diagram spec into draw.io XML.

Supports both full specs and JSON patches (RFC 6902) against a stored spec.
"""

import json
import os
import boto3
import jsonpatch
from strands import tool
from src.renderer.schema import parse_spec, validate_spec, normalize_spec
from src.renderer.layout import compute_layout
from src.renderer.emitter import emit_drawio

S3_BUCKET = os.environ.get("S3_BUCKET", "infinitra-diagram-agent-dev")
_s3 = None

def _get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _s3

# In-memory spec cache (survives across tool calls within one agent invocation)
_current_spec: dict | None = None


def _save_spec_to_s3(spec_dict: dict, diagram_key: str):
    """Save the JSON spec alongside the .drawio file for future patching."""
    spec_key = diagram_key.replace(".drawio", ".spec.json")
    _get_s3().put_object(
        Bucket=S3_BUCKET, Key=spec_key,
        Body=json.dumps(spec_dict, indent=2).encode("utf-8"),
        ContentType="application/json",
    )


def _load_spec_from_s3(diagram_key: str) -> dict | None:
    """Load a previously saved spec from S3."""
    spec_key = diagram_key.replace(".drawio", ".spec.json")
    try:
        obj = _get_s3().get_object(Bucket=S3_BUCKET, Key=spec_key)
        return json.loads(obj["Body"].read())
    except Exception:
        return None


@tool
def render_drawio(spec_json: str) -> str:
    """Render a JSON diagram spec into draw.io XML with proper AWS icons and auto-layout.

    Accepts EITHER a full spec OR a JSON patch array (RFC 6902) to modify the current diagram.

    ## Full spec format:
        {"title": "...", "nodes": {...}, "edges": {...}, "clusters": {...}}

    ## JSON patch format (for modifications):
        [{"op": "add", "path": "/nodes/cf", "value": {"type": "cloudfront", "label": "CDN"}},
         {"op": "add", "path": "/edges/e8", "value": {"source": "cf", "target": "alb"}},
         {"op": "remove", "path": "/nodes/old_node"}]

    Parameters:
        spec_json: JSON string — either a full diagram spec or a JSON patch array.

    Node types: ec2, lambda, ecs, eks, fargate, s3, rds, rds_postgresql,
        dynamodb, aurora, elasticache, cloudfront, route_53, api_gateway, alb, nlb,
        nat_gateway, sqs, sns, eventbridge, step_functions, cognito, waf, iam, kms,
        cloudwatch, cloudtrail, bedrock, sagemaker, kinesis, athena, glue, opensearch,
        users, client, internet, server, mobile.
    Cluster types: aws_cloud, region, vpc, public_subnet, private_subnet, generic.
    Edge styles: "solid" (default) or "dashed".

    Returns:
        JSON with status, the draw.io XML, and the resolved spec for reference.
    """
    global _current_spec

    try:
        data = json.loads(spec_json)
    except json.JSONDecodeError as e:
        return json.dumps({"status": "error", "details": f"Invalid JSON: {e}"})

    # Detect: is this a patch (array) or a full spec (object)?
    if isinstance(data, list):
        # JSON patch — apply against current spec
        if _current_spec is None:
            return json.dumps({"status": "error", "details": "No current diagram to patch. Generate a full spec first."})
        try:
            patch = jsonpatch.JsonPatch(data)
            spec_dict = patch.apply(_current_spec)
        except (jsonpatch.JsonPatchException, jsonpatch.JsonPointerException) as e:
            return json.dumps({"status": "error", "details": f"Patch failed: {e}"})
    else:
        spec_dict = data

    try:
        spec = parse_spec(spec_dict)
    except (TypeError, KeyError) as e:
        return json.dumps({"status": "error", "details": f"Invalid spec structure: {e}"})

    spec = normalize_spec(spec)

    errors = validate_spec(spec)
    if errors:
        return json.dumps({"status": "error", "details": "; ".join(errors)})

    layout = compute_layout(spec)
    xml = emit_drawio(spec, layout)

    # Cache the resolved spec for future patches
    _current_spec = spec_dict

    return json.dumps({"status": "ok", "xml": xml, "spec": spec_dict})


def get_current_spec() -> dict | None:
    """Get the current in-memory spec (used by save_diagram to persist it)."""
    return _current_spec


def set_current_spec(spec: dict):
    """Set the current spec (used when loading from S3)."""
    global _current_spec
    _current_spec = spec
