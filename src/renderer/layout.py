"""Compute node positions using Graphviz layout engine."""

from __future__ import annotations
import json
import logging
import graphviz
from dataclasses import dataclass
from .schema import DiagramSpec


@dataclass
class LayoutResult:
    positions: dict[str, tuple[float, float]]
    node_size: tuple[float, float]
    cluster_bounds: dict[str, tuple[float, float, float, float]]
    graph_width: float
    graph_height: float


NODE_W, NODE_H = 78, 78


def compute_layout(spec: DiagramSpec, direction: str = "LR") -> LayoutResult:
    g = graphviz.Digraph(engine="dot", format="json")

    n = len(spec.nodes)
    nodesep = "1.8" if n > 12 else "1.5" if n > 6 else "1.2"
    ranksep = "2.2" if n > 12 else "1.8" if n > 6 else "1.5"

    g.attr(
        rankdir=direction,
        nodesep=nodesep,
        ranksep=ranksep,
        pad="0.8",
        splines="polyline",    # cleaner than ortho, less spacing bloat
        concentrate="false",
        newrank="true",
        compound="true",       # allow edges between clusters
    )

    # Build child→parent maps
    node_to_cluster: dict[str, str] = {}
    cluster_to_cluster: dict[str, str] = {}
    for cid, cluster in spec.clusters.items():
        for child in cluster.children:
            if child in spec.nodes:
                node_to_cluster[child] = cid
            elif child in spec.clusters:
                cluster_to_cluster[child] = cid

    def _add_cluster(parent_graph, cid):
        cluster = spec.clusters[cid]
        with parent_graph.subgraph(name=f"cluster_{cid}") as sg:
            sg.attr(label=cluster.label, style="rounded", penwidth="2", margin="20")
            for child in cluster.children:
                if child in spec.nodes:
                    sg.node(child, label=spec.nodes[child].label,
                            width=str(NODE_W / 72), height=str(NODE_H / 72),
                            shape="box", fixedsize="true")
                elif child in spec.clusters:
                    _add_cluster(sg, child)

    for cid in spec.clusters:
        if cid not in cluster_to_cluster:
            _add_cluster(g, cid)

    for nid, node in spec.nodes.items():
        if nid not in node_to_cluster:
            g.node(nid, label=node.label,
                   width=str(NODE_W / 72), height=str(NODE_H / 72),
                   shape="box", fixedsize="true")

    # Add edges with weights — primary flow edges get higher weight to stay straight
    for eid, edge in spec.edges.items():
        attrs: dict[str, str] = {}
        if edge.label:
            attrs["label"] = edge.label
        # Dashed edges (monitoring, secondary) get lower weight — can bend more
        if edge.style == "dashed":
            attrs["weight"] = "1"
            attrs["style"] = "dashed"
        else:
            attrs["weight"] = "3"
        g.edge(edge.source, edge.target, **attrs)

    logging.getLogger("graphviz").setLevel(logging.ERROR)
    raw = g.pipe(format="json", encoding="utf-8", quiet=True)
    data = json.loads(raw)

    bb = [float(x) for x in data.get("bb", "0,0,0,0").split(",")]
    graph_h = bb[3] - bb[1]

    objects = data.get("objects", [])
    positions: dict[str, tuple[float, float]] = {}
    cluster_bounds: dict[str, tuple[float, float, float, float]] = {}

    for obj in objects:
        name = obj.get("name", "")
        if "pos" in obj and name in spec.nodes:
            cx, cy = [float(v) for v in obj["pos"].split(",")]
            positions[name] = (round(cx - NODE_W / 2), round((graph_h - cy) - NODE_H / 2))
        if name.startswith("cluster_") and "bb" in obj:
            cid = name[len("cluster_"):]
            cbb = [float(v) for v in obj["bb"].split(",")]
            cluster_bounds[cid] = (round(cbb[0]), round(graph_h - cbb[3]),
                                   round(cbb[2] - cbb[0]), round(cbb[3] - cbb[1]))

    return LayoutResult(positions=positions, node_size=(NODE_W, NODE_H),
                        cluster_bounds=cluster_bounds, graph_width=bb[2] - bb[0], graph_height=graph_h)
