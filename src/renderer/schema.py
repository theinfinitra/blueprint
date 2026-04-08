"""JSON spec schema for architecture diagrams."""

from __future__ import annotations
from dataclasses import dataclass, field
import json

# ── Constants ─────────────────────────────────────────────────────────────────
VALID_CLUSTER_TYPES = {"aws_cloud", "region", "vpc", "public_subnet", "private_subnet", "generic"}
VALID_EDGE_STYLES = {"solid", "dashed"}
MAX_LABEL_LENGTH = 25
VALID_DIRECTIONS = {"LR", "TB", "RL", "BT"}


@dataclass
class Node:
    type: str
    label: str

@dataclass
class Edge:
    source: str
    target: str
    label: str = ""
    style: str = "solid"

@dataclass
class Cluster:
    label: str
    type: str = "generic"
    children: list[str] = field(default_factory=list)

@dataclass
class DiagramSpec:
    title: str
    direction: str = "LR"  # LR, TB, RL, BT
    nodes: dict[str, Node] = field(default_factory=dict)
    edges: dict[str, Edge] = field(default_factory=dict)
    clusters: dict[str, Cluster] = field(default_factory=dict)


def parse_spec(raw: str | dict) -> DiagramSpec:
    """Parse a JSON string or dict into a DiagramSpec."""
    data = json.loads(raw) if isinstance(raw, str) else raw

    nodes = {k: Node(**v) for k, v in data.get("nodes", {}).items()}
    edges = {k: Edge(**v) for k, v in data.get("edges", {}).items()}
    clusters = {k: Cluster(**v) for k, v in data.get("clusters", {}).items()}

    return DiagramSpec(
        title=data.get("title", "Architecture"),
        direction=data.get("direction", "LR"),
        nodes=nodes,
        edges=edges,
        clusters=clusters,
    )


def normalize_spec(spec: DiagramSpec) -> DiagramSpec:
    """Enforce style guide rules regardless of what the LLM produced.

    This is the guardrail — anything the LLM gets wrong, we fix here.
    """
    # Truncate long labels
    for node in spec.nodes.values():
        if len(node.label) > MAX_LABEL_LENGTH:
            node.label = node.label[:MAX_LABEL_LENGTH - 1] + "…"

    for cluster in spec.clusters.values():
        if len(cluster.label) > MAX_LABEL_LENGTH:
            cluster.label = cluster.label[:MAX_LABEL_LENGTH - 1] + "…"

    for edge in spec.edges.values():
        if len(edge.label) > MAX_LABEL_LENGTH:
            edge.label = edge.label[:MAX_LABEL_LENGTH - 1] + "…"

    # Clamp edge styles to valid values
    for edge in spec.edges.values():
        if edge.style not in VALID_EDGE_STYLES:
            edge.style = "solid"

    # Clamp direction
    spec.direction = spec.direction.upper()
    if spec.direction not in VALID_DIRECTIONS:
        spec.direction = "LR"

    # Clamp cluster types to valid values
    for cluster in spec.clusters.values():
        if cluster.type not in VALID_CLUSTER_TYPES:
            cluster.type = "generic"

    # Normalize node types to lowercase with underscores
    for node in spec.nodes.values():
        node.type = node.type.lower().replace("-", "_").replace(" ", "_")

    return spec


def validate_spec(spec: DiagramSpec) -> list[str]:
    """Return list of errors. Empty = valid."""
    errors = []
    all_ids = set(spec.nodes) | set(spec.clusters)

    if not spec.nodes:
        errors.append("Spec has no nodes")

    for eid, edge in spec.edges.items():
        if edge.source not in spec.nodes:
            errors.append(f"Edge '{eid}' source '{edge.source}' not found in nodes")
        if edge.target not in spec.nodes:
            errors.append(f"Edge '{eid}' target '{edge.target}' not found in nodes")

    for cid, cluster in spec.clusters.items():
        for child in cluster.children:
            if child not in all_ids:
                errors.append(f"Cluster '{cid}' child '{child}' not found")

    # Check for orphan clusters (children referencing themselves)
    for cid, cluster in spec.clusters.items():
        if cid in cluster.children:
            errors.append(f"Cluster '{cid}' contains itself")

    return errors
