"""AWS service type → draw.io icon style mapping.

Node types use short names (e.g. "lambda", "s3", "ec2").
The renderer looks up the full draw.io style string here.
"""

from dataclasses import dataclass


@dataclass
class IconDef:
    style: str  # complete draw.io style string (minus geometry/label bits)
    category: str


# Shared style fragments
_COMMON = "sketch=0;outlineConnect=0;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=1;aspect=fixed;strokeWidth=3;"

def _resource(icon: str, fill: str) -> str:
    return f"{_COMMON}shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.{icon};fillColor={fill};strokeColor=#ffffff;"

def _standalone(shape: str, fill: str) -> str:
    return f"{_COMMON}pointerEvents=1;shape=mxgraph.aws4.{shape};fillColor={fill};strokeColor=none;gradientColor=none;"


# Category colors
_COMPUTE = "#ED7100"
_NETWORK = "#8C4FFF"
_DATABASE = "#C925D1"
_STORAGE = "#7AA116"
_SECURITY = "#DD344C"
_MGMT = "#E7157B"
_AI = "#01A88D"
_GENERAL = "#232F3E"

# ── Icon catalog ──────────────────────────────────────────────────────────────
# Key = short type name the LLM uses in the JSON spec
# Value = IconDef with full draw.io style

ICONS: dict[str, IconDef] = {
    # Compute
    "ec2":          IconDef(_resource("ec2", _COMPUTE), "compute"),
    "lambda":       IconDef(_resource("lambda", _COMPUTE), "compute"),
    "ecs":          IconDef(_resource("ecs", _COMPUTE), "compute"),
    "eks":          IconDef(_resource("eks", _COMPUTE), "compute"),
    "fargate":      IconDef(_resource("fargate", _COMPUTE), "compute"),
    "batch":        IconDef(_resource("batch", _COMPUTE), "compute"),
    "lightsail":    IconDef(_resource("lightsail", _COMPUTE), "compute"),
    "app_runner":   IconDef(_resource("app_runner", _COMPUTE), "compute"),

    # Networking
    "cloudfront":   IconDef(_resource("cloudfront", _NETWORK), "network"),
    "route_53":     IconDef(_resource("route_53", _NETWORK), "network"),
    "api_gateway":  IconDef(_resource("api_gateway", _NETWORK), "network"),
    "direct_connect": IconDef(_resource("direct_connect", _NETWORK), "network"),
    "global_accelerator": IconDef(_resource("global_accelerator", _NETWORK), "network"),
    "transit_gateway": IconDef(_resource("transit_gateway", _NETWORK), "network"),
    "vpc_endpoints": IconDef(_resource("vpc_endpoints", _NETWORK), "network"),
    "privatelink":  IconDef(_resource("privatelink", _NETWORK), "network"),
    "alb":          IconDef(_standalone("application_load_balancer", _NETWORK), "network"),
    "nlb":          IconDef(_standalone("network_load_balancer", _NETWORK), "network"),
    "nat_gateway":  IconDef(_standalone("nat_gateway", _NETWORK), "network"),
    "endpoints":    IconDef(_standalone("endpoints", _NETWORK), "network"),

    # Database
    "rds":          IconDef(_resource("aurora", _DATABASE), "database"),
    "rds_postgresql": IconDef(_standalone("rds_postgresql_instance", _DATABASE), "database"),
    "rds_mysql":    IconDef(_standalone("rds_mysql_instance", _DATABASE), "database"),
    "rds_mariadb":  IconDef(_standalone("rds_mariadb_instance", _DATABASE), "database"),
    "aurora":       IconDef(_resource("aurora", _DATABASE), "database"),
    "dynamodb":     IconDef(_resource("dynamodb", _DATABASE), "database"),
    "elasticache":  IconDef(_resource("elasticache", _DATABASE), "database"),
    "redshift":     IconDef(_resource("redshift", _DATABASE), "database"),
    "neptune":      IconDef(_resource("neptune", _DATABASE), "database"),
    "documentdb":   IconDef(_resource("documentdb", _DATABASE), "database"),
    "timestream":   IconDef(_resource("timestream", _DATABASE), "database"),
    "keyspaces":    IconDef(_resource("keyspaces", _DATABASE), "database"),

    # Storage
    "s3":           IconDef(_resource("s3", _STORAGE), "storage"),
    "efs":          IconDef(_resource("efs", _STORAGE), "storage"),
    "fsx":          IconDef(_resource("fsx", _STORAGE), "storage"),
    "backup":       IconDef(_resource("backup", _STORAGE), "storage"),
    "s3_glacier":   IconDef(_resource("s3_glacier", _STORAGE), "storage"),

    # Security
    "kms":          IconDef(_resource("key_management_service", _SECURITY), "security"),
    "iam":          IconDef(_resource("identity_and_access_management", _SECURITY), "security"),
    "acm":          IconDef(_resource("certificate_manager_3", _SECURITY), "security"),
    "waf":          IconDef(_resource("waf", _SECURITY), "security"),
    "shield":       IconDef(_resource("shield", _SECURITY), "security"),
    "secrets_manager": IconDef(_resource("secrets_manager", _SECURITY), "security"),
    "guardduty":    IconDef(_resource("guardduty", _SECURITY), "security"),
    "inspector":    IconDef(_resource("inspector", _SECURITY), "security"),
    "security_hub": IconDef(_resource("security_hub", _SECURITY), "security"),
    "cognito":      IconDef(_resource("cognito", _SECURITY), "security"),

    # Management & Integration
    "cloudtrail":   IconDef(_resource("cloudtrail", _MGMT), "management"),
    "cloudwatch":   IconDef(_resource("cloudwatch_2", _MGMT), "management"),
    "eventbridge":  IconDef(_resource("eventbridge", _MGMT), "management"),
    "config":       IconDef(_resource("config", _MGMT), "management"),
    "sns":          IconDef(_resource("sns", _MGMT), "management"),
    "sqs":          IconDef(_resource("sqs", _MGMT), "management"),
    "step_functions": IconDef(_resource("step_functions", _MGMT), "management"),
    "systems_manager": IconDef(_resource("systems_manager", _MGMT), "management"),
    "appsync":      IconDef(_resource("appsync", _MGMT), "management"),
    "mq":           IconDef(_resource("mq", _MGMT), "management"),
    "ses":          IconDef(_resource("simple_email_service", _MGMT), "management"),

    # AI/ML
    "bedrock":      IconDef(_resource("bedrock", _AI), "ai"),
    "sagemaker":    IconDef(_resource("sagemaker", _AI), "ai"),
    "comprehend":   IconDef(_resource("comprehend", _AI), "ai"),
    "rekognition":  IconDef(_resource("rekognition", _AI), "ai"),
    "textract":     IconDef(_resource("textract", _AI), "ai"),

    # Analytics
    "kinesis":      IconDef(_resource("kinesis", _NETWORK), "analytics"),
    "athena":       IconDef(_resource("athena", _NETWORK), "analytics"),
    "glue":         IconDef(_resource("glue", _NETWORK), "analytics"),
    "emr":          IconDef(_resource("emr", _NETWORK), "analytics"),
    "opensearch":   IconDef(_resource("opensearch_service", _NETWORK), "analytics"),
    "quicksight":   IconDef(_resource("quicksight", _NETWORK), "analytics"),
    "msk":          IconDef(_resource("managed_streaming_for_kafka", _NETWORK), "analytics"),

    # General
    "users":        IconDef(_standalone("users", _GENERAL), "general"),
    "client":       IconDef(_resource("client", _GENERAL), "general"),
    "internet":     IconDef(_resource("internet_alt2", _GENERAL), "general"),
    "server":       IconDef(_resource("traditional_server", _GENERAL), "general"),
    "mobile":       IconDef(_resource("mobile_client", _GENERAL), "general"),
}


def get_icon_style(node_type: str) -> str:
    """Get draw.io style string for a node type. Falls back to generic resource icon."""
    icon = ICONS.get(node_type)
    if icon:
        return icon.style
    # Fallback: try as a raw mxgraph.aws4 resource icon
    return _resource(node_type, _GENERAL)


def list_types() -> list[str]:
    """Return all known node type names (for system prompt reference)."""
    return sorted(ICONS.keys())
