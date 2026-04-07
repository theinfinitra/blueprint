"""Emit draw.io XML from positioned diagram spec."""

from __future__ import annotations
from xml.sax.saxutils import escape
from .schema import DiagramSpec
from .icons import get_icon_style
from .layout import LayoutResult


# Cluster type → draw.io group style
_CLUSTER_STYLES = {
    "aws_cloud": "shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_aws_cloud;strokeColor=#232F3E;fillColor=none;fontColor=#232F3E;dashed=0;",
    "region": "shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_region;strokeColor=#00A4A6;fillColor=none;fontColor=#147EBA;dashed=1;",
    "vpc": "shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc2;strokeColor=#8C4FFF;fillColor=none;fontColor=#AAB7B8;dashed=0;",
    "public_subnet": "shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;grStroke=0;strokeColor=#7AA116;fillColor=#F2F6E8;fontColor=#248814;dashed=0;",
    "private_subnet": "shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;grStroke=0;strokeColor=#00A4A6;fillColor=#E6F6F7;fontColor=#147EBA;dashed=0;",
    "generic": "rounded=1;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#666666;dashed=1;",
}

_CLUSTER_COMMON = "points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=14;fontStyle=1;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;strokeWidth=3;verticalAlign=top;align=left;spacingLeft=30;fontFamily=Inter;"

_EDGE_STYLE = "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeWidth=3;strokeColor=#0066CC;exitX=1;exitY=0.5;entryX=0;entryY=0.5;"
_EDGE_DASHED = "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeWidth=3;strokeColor=#999999;dashed=1;exitX=1;exitY=0.5;entryX=0;entryY=0.5;"


def emit_drawio(spec: DiagramSpec, layout: LayoutResult) -> str:
    """Generate complete draw.io XML from spec + layout positions."""
    cells: list[str] = []
    cell_id = 2  # 0 and 1 are reserved

    cluster_cell_ids: dict[str, int] = {}

    # Build child→parent map
    child_to_parent: dict[str, str] = {}
    for cid, cluster in spec.clusters.items():
        for child in cluster.children:
            child_to_parent[child] = cid

    # Emit clusters (topo-sorted: parents before children)
    for cid in _topo_sort_clusters(spec):
        cluster = spec.clusters[cid]
        parent_cid = child_to_parent.get(cid)
        parent_cell = cluster_cell_ids.get(parent_cid, 1) if parent_cid else 1

        bounds = layout.cluster_bounds.get(cid)
        if bounds:
            x, y, w, h = bounds
            # Make coordinates relative to parent cluster
            if parent_cid and parent_cid in layout.cluster_bounds:
                px, py, _, _ = layout.cluster_bounds[parent_cid]
                x -= px
                y -= py
        else:
            x, y, w, h = 0, 0, 400, 300

        ctype = cluster.type if cluster.type in _CLUSTER_STYLES else "generic"
        style = _CLUSTER_STYLES[ctype] + _CLUSTER_COMMON

        cells.append(
            f'      <mxCell id="{cell_id}" value="{escape(cluster.label)}" '
            f'style="{style}" vertex="1" parent="{parent_cell}">\n'
            f'        <mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry" />\n'
            f'      </mxCell>'
        )
        cluster_cell_ids[cid] = cell_id
        cell_id += 1

    # Emit nodes
    node_cell_ids: dict[str, int] = {}
    nw, nh = layout.node_size
    for nid, node in spec.nodes.items():
        parent_cid = child_to_parent.get(nid)
        parent_cell = cluster_cell_ids.get(parent_cid, 1) if parent_cid else 1

        pos = layout.positions.get(nid, (0, 0))
        x, y = pos

        # Make coordinates relative to parent cluster
        if parent_cid and parent_cid in layout.cluster_bounds:
            px, py, _, _ = layout.cluster_bounds[parent_cid]
            x -= px
            y -= py

        style = get_icon_style(node.type)

        cells.append(
            f'      <mxCell id="{cell_id}" value="{escape(node.label)}" '
            f'style="{style}" vertex="1" parent="{parent_cell}">\n'
            f'        <mxGeometry x="{x}" y="{y}" width="{nw}" height="{nh}" as="geometry" />\n'
            f'      </mxCell>'
        )
        node_cell_ids[nid] = cell_id
        cell_id += 1

    # Emit edges
    for eid, edge in spec.edges.items():
        src_cell = node_cell_ids.get(edge.source)
        tgt_cell = node_cell_ids.get(edge.target)
        if not src_cell or not tgt_cell:
            continue

        style = _EDGE_DASHED if edge.style == "dashed" else _EDGE_STYLE
        label = escape(edge.label) if edge.label else ""

        cells.append(
            f'      <mxCell id="{cell_id}" value="{label}" '
            f'style="{style}" edge="1" parent="1" '
            f'source="{src_cell}" target="{tgt_cell}">\n'
            f'        <mxGeometry relative="1" as="geometry" />\n'
            f'      </mxCell>'
        )
        cell_id += 1

    cells_xml = "\n".join(cells)

    return f'''<mxfile host="diagram-agent" modified="" agent="diagram-agent" version="1">
  <diagram id="page-1" name="{escape(spec.title)}">
    <mxGraphModel dx="0" dy="0" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1920" pageHeight="1400" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
{cells_xml}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>'''


def _topo_sort_clusters(spec: DiagramSpec) -> list[str]:
    """Sort clusters so parents come before children."""
    child_to_parent: dict[str, str] = {}
    for cid, cluster in spec.clusters.items():
        for child in cluster.children:
            if child in spec.clusters:
                child_to_parent[child] = cid

    sorted_ids: list[str] = []
    visited: set[str] = set()

    def visit(cid: str):
        if cid in visited:
            return
        parent = child_to_parent.get(cid)
        if parent:
            visit(parent)
        visited.add(cid)
        sorted_ids.append(cid)

    for cid in spec.clusters:
        visit(cid)

    return sorted_ids
