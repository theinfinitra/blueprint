# diagram-agent

Conversational AI agent that generates editable draw.io architecture diagrams.

## What It Does

Describe an architecture in natural language → get a `.drawio` file → refine it through conversation.

```
You: "Create an AWS architecture with ALB, EKS with 3 microservices, RDS PostgreSQL, and S3"
Agent: [generates diagram] → Download: https://s3.../diagram.drawio

You: "Add a CloudFront CDN in front of the ALB"
Agent: [updates diagram] → Download: https://s3.../diagram.drawio (updated)
```

## Architecture

- **Strands Agents SDK** — agent framework with `@tool` decorator
- **Bedrock AgentCore Runtime** — serverless deployment, scales to zero
- **Claude Sonnet** (via Bedrock) — LLM for XML generation
- **S3** — diagram file storage

## Quick Start

### Prerequisites

- Python 3.13+
- AWS credentials configured
- Bedrock model access enabled (Claude Sonnet)

### Local Development

```bash
cd diagram-agent
uv init --python 3.13
uv add strands-agents strands-agents-tools lxml boto3
uv add --dev pytest bedrock-agentcore-starter-toolkit

# Run locally
python src/agent.py
```

### Deploy to AgentCore

```bash
pip install bedrock-agentcore
agentcore configure --entrypoint src/agent.py --name diagram-agent
agentcore launch
```

## Docs

- [Implementation Plan](docs/implementation-plan.md)
- [Draw.io Generation Rules](docs/drawio-generation-rules.md)
