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


def compute_layout(spec: DiagramSpec, direction: str = "LR",
                   prior_positions: dict[str, list[float]] | None = None) -> LayoutResult:
    """Compute layout. If prior_positions is provided, pin existing nodes and
    use dot-computed deltas to place only the new nodes."""

    dot_layout = _dot_layout(spec, direction)

    # No prior positions → fresh layout, return dot result directly
    if not prior_positions:
        return dot_layout

    new_nodes = {nid for nid in spec.nodes if nid not in prior_positions}
    if not new_nodes:
        # All nodes have prior positions — use them as-is, recompute cluster bounds
        positions = {nid: (round(prior_positions[nid][0]), round(prior_positions[nid][1]))
                     for nid in spec.nodes if nid in prior_positions}
        return LayoutResult(positions=positions, node_size=(NODE_W, NODE_H),
                            cluster_bounds=_compute_cluster_bounds(spec, positions),
                            graph_width=dot_layout.graph_width, graph_height=dot_layout.graph_height)

    # Hybrid: pin existing nodes, place new nodes using dot deltas
    positions: dict[str, tuple[float, float]] = {}
    for nid in spec.nodes:
        if nid in prior_positions:
            positions[nid] = (round(prior_positions[nid][0]), round(prior_positions[nid][1]))

    for nid in new_nodes:
        # Find a connected neighbor that has a prior position (anchor)
        anchor_id = _find_anchor(nid, spec, prior_positions)
        if anchor_id and anchor_id in dot_layout.positions and nid in dot_layout.positions:
            # Apply the delta dot computed between anchor and new node
            ax, ay = dot_layout.positions[anchor_id]
            nx, ny = dot_layout.positions[nid]
            dx, dy = nx - ax, ny - ay
            px, py = prior_positions[anchor_id]
            positions[nid] = (round(px + dx), round(py + dy))
        elif nid in dot_layout.positions:
            positions[nid] = dot_layout.positions[nid]
        else:
            positions[nid] = (0, 0)

    return LayoutResult(positions=positions, node_size=(NODE_W, NODE_H),
                        cluster_bounds=_compute_cluster_bounds(spec, positions),
                        graph_width=dot_layout.graph_width, graph_height=dot_layout.graph_height)


def _find_anchor(nid: str, spec: DiagramSpec, prior: dict[str, list[float]]) -> str | None:
    """Find the best connected neighbor with a known position to anchor a new node."""
    # Prefer source (upstream) neighbors, then targets
    for edge in spec.edges.values():
        if edge.target == nid and edge.source in prior:
            return edge.source
        if edge.source == nid and edge.target in prior:
            return edge.target
    return None


def _compute_cluster_bounds(spec: DiagramSpec, positions: dict[str, tuple[float, float]],
                            ) -> dict[str, tuple[float, float, float, float]]:
    """Compute cluster bounding boxes from node positions, bottom-up."""
    PAD = 55
    PAD_TOP = 75  # extra top padding for cluster label
    bounds: dict[str, tuple[float, float, float, float]] = {}

    # Process clusters bottom-up (leaf clusters first, then parents)
    sorted_clusters = _topo_sort_clusters_bottomup(spec)

    for cid in sorted_clusters:
        cluster = spec.clusters[cid]
        child_positions = []
        for child in cluster.children:
            if child in positions:
                child_positions.append((positions[child][0], positions[child][1]))
                child_positions.append((positions[child][0] + NODE_W, positions[child][1] + NODE_H))
            elif child in bounds:
                bx, by, bw, bh = bounds[child]
                child_positions.append((bx, by))
                child_positions.append((bx + bw, by + bh))
        if not child_positions:
            continue
        xs = [p[0] for p in child_positions]
        ys = [p[1] for p in child_positions]
        x0, y0 = min(xs) - PAD, min(ys) - PAD_TOP
        x1, y1 = max(xs) + PAD, max(ys) + PAD
        bounds[cid] = (round(x0), round(y0), round(x1 - x0), round(y1 - y0))
    return bounds


def _topo_sort_clusters_bottomup(spec: DiagramSpec) -> list[str]:
    """Sort clusters so children come before parents (bottom-up)."""
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
        visited.add(cid)
        # Visit children first
        cluster = spec.clusters[cid]
        for child in cluster.children:
            if child in spec.clusters:
                visit(child)
        sorted_ids.append(cid)

    for cid in spec.clusters:
        visit(cid)
    return sorted_ids


def _dot_layout(spec: DiagramSpec, direction: str) -> LayoutResult:
    """Run standard dot layout on the full spec."""
    g = graphviz.Digraph(engine="dot", format="json")

    n = len(spec.nodes)
    nodesep = "3.2" if n > 12 else "2.8" if n > 6 else "2.5"
    ranksep = "3.8" if n > 12 else "3.5" if n > 6 else "3.0"

    g.attr(
        rankdir=direction,
        nodesep=nodesep,
        ranksep=ranksep,
        pad="0.8",
        splines="polyline",
        concentrate="false",
        newrank="true",
        compound="true",
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
            sg.attr(label=cluster.label, style="rounded", penwidth="2", margin="40")
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

    # Source/sink rank pinning: pin nodes with no incoming edges to min rank,
    # nodes with no outgoing edges to max rank
    sources = set(spec.nodes.keys())
    sinks = set(spec.nodes.keys())
    for edge in spec.edges.values():
        sinks.discard(edge.source)
        sources.discard(edge.target)

    if sources:
        with g.subgraph() as s:
            s.attr(rank="min")
            for nid in sources:
                s.node(nid)

    if sinks:
        with g.subgraph() as s:
            s.attr(rank="max")
            for nid in sinks:
                s.node(nid)

    # Auxiliary node rank constraints: push monitoring/error nodes to sink rank
    auxiliary_nodes = [nid for nid, node in spec.nodes.items()
                       if getattr(node, "role", None) == "auxiliary"]
    if auxiliary_nodes:
        with g.subgraph() as s:
            s.attr(rank="max")
            for nid in auxiliary_nodes:
                s.node(nid)

    for eid, edge in spec.edges.items():
        attrs: dict[str, str] = {}
        if edge.label:
            attrs["label"] = edge.label
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
