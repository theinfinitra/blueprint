"""S3 retrieval tool for loading existing diagrams + their specs."""

import json
import os
import boto3
from strands import tool

S3_BUCKET = os.environ.get("S3_BUCKET", "blueprint-diagrams")
_s3 = None


def _get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _s3


@tool
def load_diagram(s3_key: str) -> str:
    """Load an existing diagram and its JSON spec from S3 for editing.

    This restores the spec into memory so subsequent render_drawio calls
    can accept JSON patches against it.

    Parameters:
        s3_key: The S3 key of the diagram (e.g., diagrams/local/20260403-diagram.drawio)

    Returns:
        JSON with the spec (if available) and the raw XML
    """
    s3 = _get_s3()

    # Load the spec first (for patching)
    spec_key = s3_key.replace(".drawio", ".spec.json")
    spec = None
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=spec_key)
        spec = json.loads(obj["Body"].read())
        from src.tools.render_drawio import set_current_spec
        set_current_spec(spec)
    except Exception:
        pass

    # Load the XML
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        xml = obj["Body"].read().decode("utf-8")
    except s3.exceptions.NoSuchKey:
        return json.dumps({"error": f"No diagram found at '{s3_key}'"})
    except Exception as e:
        return json.dumps({"error": f"Error loading diagram: {e}"})

    result = {"s3_key": s3_key, "xml_length": len(xml)}
    if spec:
        result["spec"] = spec
        result["message"] = "Spec loaded — you can now use JSON patches to modify this diagram."
    else:
        result["message"] = "No spec found — generate a full spec to enable patching."

    return json.dumps(result)
