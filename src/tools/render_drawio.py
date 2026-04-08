"""Strands tool: render a JSON diagram spec into draw.io XML and save to S3.

Combines rendering + saving into a single tool call to eliminate one LLM round-trip.
"""

import json
import os
from datetime import datetime, timezone
import boto3
import jsonpatch
from strands import tool
from src.renderer.schema import parse_spec, validate_spec, normalize_spec
from src.renderer.layout import compute_layout
from src.renderer.emitter import emit_drawio

S3_BUCKET = os.environ.get("S3_BUCKET", "blueprint-diagrams")
_s3 = None

def _get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _s3

# In-memory state
_current_spec: dict | None = None
_current_diagram_key: str | None = None


def set_current_spec(spec: dict):
    global _current_spec
    _current_spec = spec

def get_current_spec() -> dict | None:
    return _current_spec

def set_current_diagram_key(key: str | None):
    global _current_diagram_key
    _current_diagram_key = key

def get_current_diagram_key() -> str | None:
    return _current_diagram_key


@tool
def render_drawio(spec_json: str, filename: str = "diagram") -> str:
    """Render a JSON diagram spec into a draw.io file, save to S3, and return the download URL.

    Accepts EITHER a full spec OR a JSON patch array (RFC 6902).

    Full spec: {"title": "...", "nodes": {...}, "edges": {...}, "clusters": {...}}
    JSON patch: [{"op": "add", "path": "/nodes/cf", "value": {"type": "cloudfront", "label": "CDN"}}]

    Parameters:
        spec_json: JSON string — full spec or patch array.
        filename: Short name for the file (no extension).

    Returns:
        JSON with status, s3_key, download_url, and the diagram XML.
    """
    global _current_spec, _current_diagram_key

    try:
        data = json.loads(spec_json)
    except json.JSONDecodeError as e:
        return json.dumps({"status": "error", "details": f"Invalid JSON: {e}"})

    # Patch or full spec?
    if isinstance(data, list):
        if _current_spec is None:
            return json.dumps({"status": "error", "details": "No current diagram to patch. Generate a full spec first."})
        try:
            spec_dict = jsonpatch.apply_patch(_current_spec, data)
        except (jsonpatch.JsonPatchException, jsonpatch.JsonPointerException) as e:
            return json.dumps({"status": "error", "details": f"Patch failed: {e}"})
    else:
        spec_dict = data

    try:
        spec = parse_spec(spec_dict)
    except (TypeError, KeyError) as e:
        return json.dumps({"status": "error", "details": f"Invalid spec: {e}"})

    spec = normalize_spec(spec)
    errors = validate_spec(spec)
    if errors:
        return json.dumps({"status": "error", "details": "; ".join(errors)})

    # Render
    layout = compute_layout(spec, direction=spec.direction)
    xml = emit_drawio(spec, layout)

    # Save to S3 (update in place if editing)
    s3 = _get_s3()
    if _current_diagram_key:
        s3_key = _current_diagram_key
    else:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        title = spec_dict.get("title", filename)
        safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in title.lower().strip())
        safe = safe.strip("-") or "diagram"
        s3_key = f"diagrams/local/{ts}-{safe}.drawio"

    s3.put_object(Bucket=S3_BUCKET, Key=s3_key, Body=xml.encode("utf-8"), ContentType="application/xml")

    # Save spec for future patching
    spec_key = s3_key.replace(".drawio", ".spec.json")
    s3.put_object(Bucket=S3_BUCKET, Key=spec_key, Body=json.dumps(spec_dict, indent=2).encode("utf-8"), ContentType="application/json")

    url = s3.generate_presigned_url("get_object", Params={"Bucket": S3_BUCKET, "Key": s3_key}, ExpiresIn=3600)

    # Update state
    _current_spec = spec_dict
    _current_diagram_key = s3_key

    return json.dumps({"status": "ok", "s3_key": s3_key, "download_url": url, "xml": xml})
