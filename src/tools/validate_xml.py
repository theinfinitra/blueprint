"""Draw.io XML validation tool — two-tier: hard errors + soft warnings."""

import json
import re
from lxml import etree
from strands import tool


@tool
def validate_drawio_xml(xml_content: str) -> str:
    """Validate draw.io XML structure. Returns JSON with status and any warnings.

    Hard errors (status=error) must be fixed before saving.
    Soft warnings (status=valid with warnings) are reported but don't block saving.

    Parameters:
        xml_content: Raw draw.io XML string to validate

    Returns:
        JSON string with validation results
    """
    errors = []
    warnings = []

    # Hard: well-formed XML
    try:
        root = etree.fromstring(xml_content.encode("utf-8"))
    except etree.XMLSyntaxError as e:
        return json.dumps({"status": "error", "details": f"Malformed XML: {e}", "warnings": []})

    # Hard: root must be <mxfile>
    if root.tag != "mxfile":
        errors.append(f"Root element is '{root.tag}', expected 'mxfile'")

    # Hard: at least one <diagram>
    diagrams = root.findall("diagram")
    if not diagrams:
        errors.append("No <diagram> elements found")

    for diag in diagrams:
        # Hard: each diagram needs <mxGraphModel> → <root>
        model = diag.find("mxGraphModel")
        if model is None:
            errors.append(f"Diagram '{diag.get('id', '?')}' missing <mxGraphModel>")
            continue
        graph_root = model.find("root")
        if graph_root is None:
            errors.append(f"Diagram '{diag.get('id', '?')}' missing <root> inside <mxGraphModel>")
            continue

        cells = graph_root.findall("mxCell")
        cell_ids = set()
        edge_refs = []

        for cell in cells:
            cid = cell.get("id")
            if not cid:
                continue

            # Hard: duplicate IDs
            if cid in cell_ids:
                errors.append(f"Duplicate cell ID: '{cid}'")
            cell_ids.add(cid)

            # Collect edge source/target for reference check
            if cell.get("edge") == "1":
                src = cell.get("source")
                tgt = cell.get("target")
                if src:
                    edge_refs.append(("source", src, cid))
                if tgt:
                    edge_refs.append(("target", tgt, cid))

            # Soft: check style properties
            style = cell.get("style", "")
            geom = cell.find("mxGeometry")

            if geom is not None and cell.get("vertex") == "1" and "group" not in style and "edgeLabel" not in style and "text;" not in style:
                w = geom.get("width")
                h = geom.get("height")
                if w and h and "container" not in style:
                    if w != "78" or h != "78":
                        warnings.append(f"Cell '{cid}': size is {w}x{h}, expected 78x78")

            if "fontSize=" in style and "edgeLabel" not in style and "text;" not in style:
                fs_match = re.search(r"fontSize=(\d+)", style)
                if fs_match and fs_match.group(1) != "14":
                    warnings.append(f"Cell '{cid}': fontSize={fs_match.group(1)}, expected 14")

            if "strokeWidth=" in style and cell.get("edge") == "1":
                sw_match = re.search(r"strokeWidth=(\d+)", style)
                if sw_match and sw_match.group(1) != "3":
                    warnings.append(f"Edge '{cid}': strokeWidth={sw_match.group(1)}, expected 3")

        # Hard: broken edge references
        for ref_type, ref_id, edge_id in edge_refs:
            if ref_id not in cell_ids:
                errors.append(f"Edge '{edge_id}' {ref_type}='{ref_id}' references non-existent cell")

    if errors:
        return json.dumps({"status": "error", "details": "; ".join(errors), "warnings": warnings})

    return json.dumps({"status": "valid", "warnings": warnings})
