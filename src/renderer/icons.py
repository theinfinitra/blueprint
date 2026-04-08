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
_DEV = "#C7131F"

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
    "lake_formation": IconDef(_resource("lake_formation", _NETWORK), "analytics"),
    "data_pipeline": IconDef(_resource("data_pipeline", _NETWORK), "analytics"),
    "data_exchange": IconDef(_resource("data_exchange", _NETWORK), "analytics"),
    "clean_rooms":  IconDef(_resource("clean_rooms", _NETWORK), "analytics"),

    # Developer Tools
    "codecommit":   IconDef(_resource("codecommit", _DEV), "developer"),
    "codebuild":    IconDef(_resource("codebuild", _DEV), "developer"),
    "codedeploy":   IconDef(_resource("codedeploy", _DEV), "developer"),
    "codepipeline": IconDef(_resource("codepipeline", _DEV), "developer"),
    "codestar":     IconDef(_resource("codestar", _DEV), "developer"),
    "cloud9":       IconDef(_resource("cloud9", _DEV), "developer"),
    "xray":         IconDef(_resource("xray", _DEV), "developer"),
    "codeartifact":  IconDef(_resource("codeartifact", _DEV), "developer"),
    "codeguru":     IconDef(_resource("codeguru", _DEV), "developer"),
    "corretto":     IconDef(_resource("corretto", _DEV), "developer"),
    "fault_injection_simulator": IconDef(_resource("fault_injection_simulator", _DEV), "developer"),

    # Management (additional)
    "cloudformation": IconDef(_resource("cloudformation", _MGMT), "management"),
    "organizations": IconDef(_resource("organizations", _MGMT), "management"),
    "trusted_advisor": IconDef(_resource("trusted_advisor", _MGMT), "management"),
    "control_tower": IconDef(_resource("control_tower", _MGMT), "management"),
    "service_catalog": IconDef(_resource("service_catalog", _MGMT), "management"),
    "license_manager": IconDef(_resource("license_manager", _MGMT), "management"),
    "well_architected_tool": IconDef(_resource("well_architected_tool", _MGMT), "management"),
    "health":       IconDef(_resource("health", _MGMT), "management"),
    "chatbot":      IconDef(_resource("chatbot", _MGMT), "management"),
    "proton":       IconDef(_resource("proton", _MGMT), "management"),
    "resilience_hub": IconDef(_resource("resilience_hub", _MGMT), "management"),
    "launch_wizard": IconDef(_resource("launch_wizard", _MGMT), "management"),
    "compute_optimizer": IconDef(_resource("compute_optimizer", _MGMT), "management"),

    # Networking (additional)
    "cloud_map":    IconDef(_resource("cloud_map", _NETWORK), "network"),
    "verified_access": IconDef(_resource("verified_access", _NETWORK), "network"),
    "gateway_load_balancer": IconDef(_standalone("gateway_load_balancer", _NETWORK), "network"),
    "elastic_load_balancing": IconDef(_resource("elastic_load_balancing", _NETWORK), "network"),

    # Storage (additional)
    "storage_gateway": IconDef(_resource("storage_gateway", _STORAGE), "storage"),
    "snowball":     IconDef(_resource("snowball", _STORAGE), "storage"),
    "snowcone":     IconDef(_resource("snowcone", _STORAGE), "storage"),
    "ebs":          IconDef(_resource("ebs", _STORAGE), "storage"),
    "file_cache":   IconDef(_resource("file_cache", _STORAGE), "storage"),

    # Database (additional)
    "rds_oracle":   IconDef(_standalone("rds_oracle_instance", _DATABASE), "database"),
    "rds_sql_server": IconDef(_standalone("rds_sql_server_instance", _DATABASE), "database"),
    "qldb":         IconDef(_resource("qldb", _DATABASE), "database"),
    "memorydb":     IconDef(_resource("memorydb", _DATABASE), "database"),
    "database_migration_service": IconDef(_resource("database_migration_service", _DATABASE), "database"),

    # Security (additional)
    "detective":    IconDef(_resource("detective", _SECURITY), "security"),
    "macie":        IconDef(_resource("macie", _SECURITY), "security"),
    "firewall_manager": IconDef(_resource("firewall_manager", _SECURITY), "security"),
    "network_firewall": IconDef(_resource("network_firewall", _SECURITY), "security"),
    "sso":          IconDef(_resource("sso", _SECURITY), "security"),
    "directory_service": IconDef(_resource("directory_service", _SECURITY), "security"),
    "cloudhsm":     IconDef(_resource("cloudhsm", _SECURITY), "security"),
    "audit_manager": IconDef(_resource("audit_manager", _SECURITY), "security"),
    "artifact":     IconDef(_resource("artifact", _SECURITY), "security"),
    "verified_permissions": IconDef(_resource("verified_permissions", _SECURITY), "security"),

    # AI/ML (additional)
    "polly":        IconDef(_resource("polly", _AI), "ai"),
    "transcribe":   IconDef(_resource("transcribe", _AI), "ai"),
    "translate":    IconDef(_resource("translate", _AI), "ai"),
    "lex":          IconDef(_resource("lex", _AI), "ai"),
    "personalize":  IconDef(_resource("personalize", _AI), "ai"),
    "forecast":     IconDef(_resource("forecast", _AI), "ai"),
    "kendra":       IconDef(_resource("kendra", _AI), "ai"),
    "healthlake":   IconDef(_resource("healthlake", _AI), "ai"),

    # App Integration (additional)
    "connect":      IconDef(_resource("connect", _MGMT), "app_integration"),
    "pinpoint":     IconDef(_resource("pinpoint", _MGMT), "app_integration"),
    "appflow":      IconDef(_resource("appflow", _MGMT), "app_integration"),
    "mwaa":         IconDef(_resource("managed_workflows_for_apache_airflow", _MGMT), "app_integration"),

    # Compute (additional)
    "elastic_beanstalk": IconDef(_resource("elastic_beanstalk", _COMPUTE), "compute"),
    "outposts":     IconDef(_resource("outposts", _COMPUTE), "compute"),
    "wavelength":   IconDef(_resource("wavelength", _COMPUTE), "compute"),
    "parallel_cluster": IconDef(_resource("parallel_cluster", _COMPUTE), "compute"),

    # IoT
    "iot_core":     IconDef(_resource("iot_core", "#1B660F"), "iot"),
    "iot_greengrass": IconDef(_resource("iot_greengrass", "#1B660F"), "iot"),
    "iot_analytics": IconDef(_resource("iot_analytics", "#1B660F"), "iot"),
    "iot_events":   IconDef(_resource("iot_events", "#1B660F"), "iot"),
    "iot_sitewise":  IconDef(_resource("iot_sitewise", "#1B660F"), "iot"),
    "iot_twinmaker": IconDef(_resource("iot_twinmaker", "#1B660F"), "iot"),

    # Migration
    "migration_hub": IconDef(_resource("migration_hub", _COMPUTE), "migration"),
    "application_discovery_service": IconDef(_resource("application_discovery_service", _COMPUTE), "migration"),

    # General
    "users":        IconDef(_standalone("users", _GENERAL), "general"),
    "client":       IconDef(_resource("client", _GENERAL), "general"),
    "internet":     IconDef(_resource("internet_alt2", _GENERAL), "general"),
    "server":       IconDef(_resource("traditional_server", _GENERAL), "general"),
    "mobile":       IconDef(_resource("mobile_client", _GENERAL), "general"),
}

# ── Category color guessing for fallback ──────────────────────────────────────
_CATEGORY_KEYWORDS = [
    (["ec2", "lambda", "ecs", "eks", "fargate", "batch", "compute", "beanstalk", "runner"], _COMPUTE),
    (["s3", "efs", "fsx", "backup", "glacier", "storage", "snow", "ebs"], _STORAGE),
    (["rds", "aurora", "dynamo", "elasticache", "redshift", "neptune", "documentdb", "timestream", "keyspaces", "qldb", "memorydb", "database"], _DATABASE),
    (["vpc", "cloudfront", "route", "api_gateway", "direct_connect", "global_accelerator", "transit", "privatelink", "load_balancer", "nat", "endpoint", "network"], _NETWORK),
    (["iam", "cognito", "guardduty", "inspector", "macie", "detective", "security", "waf", "shield", "firewall", "kms", "secrets", "certificate", "sso", "directory", "hsm", "audit"], _SECURITY),
    (["cloudwatch", "cloudtrail", "config", "systems_manager", "cloudformation", "organization", "trusted", "control_tower", "catalog", "license", "health", "proton"], _MGMT),
    (["sqs", "sns", "eventbridge", "step_functions", "appsync", "mq", "ses", "connect", "pinpoint", "appflow"], _MGMT),
    (["kinesis", "athena", "glue", "emr", "opensearch", "quicksight", "lake", "msk", "kafka", "analytics"], _NETWORK),
    (["bedrock", "sagemaker", "comprehend", "rekognition", "textract", "polly", "transcribe", "translate", "lex", "personalize", "forecast", "kendra", "ml", "ai"], _AI),
    (["codecommit", "codebuild", "codedeploy", "codepipeline", "codestar", "cloud9", "xray", "codeguru", "developer"], _DEV),
    (["iot", "greengrass"], "#1B660F"),
]


def _guess_color(node_type: str) -> str:
    """Guess the category color from the node type name."""
    for keywords, color in _CATEGORY_KEYWORDS:
        for kw in keywords:
            if kw in node_type:
                return color
    return _GENERAL


def get_icon_style(node_type: str) -> str:
    """Get draw.io style string for a node type. Falls back with smart color guessing."""
    icon = ICONS.get(node_type)
    if icon:
        return icon.style
    # Fallback: try the name as a mxgraph.aws4 resource icon with guessed color
    color = _guess_color(node_type)
    return _resource(node_type, color)


def list_types() -> list[str]:
    """Return all known node type names (for system prompt reference)."""
    return sorted(ICONS.keys())
