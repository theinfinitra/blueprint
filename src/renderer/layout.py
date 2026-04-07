"""Compute node positions using Graphviz layout engine."""

from __future__ import annotations
import json
import graphviz
from dataclasses import dataclass
from .schema import DiagramSpec


@dataclass
class LayoutResult:
    """Positioned nodes and graph dimensions."""
    positions: dict[str, tuple[float, float]]  # node_id → (x, y) top-left corner
    node_size: tuple[float, float]  # (width, height) for icons
    cluster_bounds: dict[str, tuple[float, float, float, float]]  # cluster_id → (x, y, w, h)
    graph_width: float
    graph_height: float


# Icon size in draw.io
NODE_W, NODE_H = 78, 78


def compute_layout(spec: DiagramSpec, direction: str = "LR") -> LayoutResult:
    """Run Graphviz dot layout and extract coordinates."""
    g = graphviz.Digraph(engine="dot", format="json")
    g.attr(rankdir=direction, nodesep="1.5", ranksep="2.0", pad="0.5")

    # Build child→parent cluster map
    node_to_cluster: dict[str, str] = {}
    cluster_to_cluster: dict[str, str] = {}
    for cid, cluster in spec.clusters.items():
        for child in cluster.children:
            if child in spec.nodes:
                node_to_cluster[child] = cid
            elif child in spec.clusters:
                cluster_to_cluster[child] = cid

    # Recursively add clusters as subgraphs
    def _add_cluster(parent_graph, cid):
        cluster = spec.clusters[cid]
        with parent_graph.subgraph(name=f"cluster_{cid}") as sg:
            sg.attr(label=cluster.label, style="rounded", penwidth="2")
            for child in cluster.children:
                if child in spec.nodes:
                    sg.node(child, label=spec.nodes[child].label,
                            width=str(NODE_W / 72), height=str(NODE_H / 72),
                            shape="box", fixedsize="true")
                elif child in spec.clusters:
                    _add_cluster(sg, child)

    # Add top-level clusters
    for cid in spec.clusters:
        if cid not in cluster_to_cluster:
            _add_cluster(g, cid)

    # Add orphan nodes
    for nid, node in spec.nodes.items():
        if nid not in node_to_cluster:
            g.node(nid, label=node.label,
                   width=str(NODE_W / 72), height=str(NODE_H / 72),
                   shape="box", fixedsize="true")

    # Add edges
    for eid, edge in spec.edges.items():
        g.edge(edge.source, edge.target, label=edge.label or "")

    # Run layout (suppress Graphviz label-size warnings)
    import logging
    logging.getLogger("graphviz").setLevel(logging.ERROR)
    raw = g.pipe(format="json", encoding="utf-8", quiet=True)
    data = json.loads(raw)

    # Parse bounding box
    bb = [float(x) for x in data.get("bb", "0,0,0,0").split(",")]
    graph_h = bb[3] - bb[1]

    # Graphviz JSON: "objects" is a flat list. Clusters and nodes are both in it.
    # Clusters have "bb" and "nodes" (list of integer indices into objects).
    # Nodes have "pos" and "name".
    objects = data.get("objects", [])

    positions: dict[str, tuple[float, float]] = {}
    cluster_bounds: dict[str, tuple[float, float, float, float]] = {}

    for obj in objects:
        name = obj.get("name", "")

        # Node with position
        if "pos" in obj and name in spec.nodes:
            cx, cy = [float(v) for v in obj["pos"].split(",")]
            x = cx - NODE_W / 2
            y = (graph_h - cy) - NODE_H / 2
            positions[name] = (round(x), round(y))

        # Cluster with bounding box
        if name.startswith("cluster_") and "bb" in obj:
            cid = name[len("cluster_"):]
            cbb = [float(v) for v in obj["bb"].split(",")]
            x = cbb[0]
            y = graph_h - cbb[3]  # flip y
            w = cbb[2] - cbb[0]
            h = cbb[3] - cbb[1]
            cluster_bounds[cid] = (round(x), round(y), round(w), round(h))

    return LayoutResult(
        positions=positions,
        node_size=(NODE_W, NODE_H),
        cluster_bounds=cluster_bounds,
        graph_width=bb[2] - bb[0],
        graph_height=graph_h,
    )
