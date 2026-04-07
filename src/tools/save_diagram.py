"""S3 storage tool for saving draw.io diagrams + their JSON specs."""

import json
import os
from datetime import datetime, timezone
import boto3
from strands import tool

S3_BUCKET = os.environ.get("S3_BUCKET", "infinitra-diagram-agent-dev")
_s3 = None

# Set by the Lambda proxy when editing an existing diagram
_current_diagram_key: str | None = None


def _get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _s3


def set_current_diagram_key(key: str | None):
    global _current_diagram_key
    _current_diagram_key = key


def get_current_diagram_key() -> str | None:
    return _current_diagram_key


@tool
def save_diagram(xml_content: str, filename: str, user_id: str = "local") -> str:
    """Save a .drawio file to S3 and return a presigned download URL.

    If editing an existing diagram, updates it in place.
    Also saves the current JSON spec alongside it for future editing.

    Parameters:
        xml_content: The complete draw.io XML content
        filename: Name for the diagram file (without extension)
        user_id: User identifier for S3 key isolation

    Returns:
        JSON with the S3 key and presigned download URL
    """
    # Update in place if editing, otherwise create new
    if _current_diagram_key:
        s3_key = _current_diagram_key
    else:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        safe_name = "".join(c if c.isalnum() or c in "-_" else "-" for c in filename)
        s3_key = f"diagrams/{user_id}/{ts}-{safe_name}.drawio"

    s3 = _get_s3()
    s3.put_object(
        Bucket=S3_BUCKET, Key=s3_key,
        Body=xml_content.encode("utf-8"),
        ContentType="application/xml",
    )

    # Also save the JSON spec for future patching
    from src.tools.render_drawio import get_current_spec
    spec = get_current_spec()
    if spec:
        spec_key = s3_key.replace(".drawio", ".spec.json")
        s3.put_object(
            Bucket=S3_BUCKET, Key=spec_key,
            Body=json.dumps(spec, indent=2).encode("utf-8"),
            ContentType="application/json",
        )

    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": s3_key},
        ExpiresIn=3600,
    )

    return json.dumps({"s3_key": s3_key, "download_url": url})
