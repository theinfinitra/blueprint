"""Diagram Agent v2 — JSON spec → rendered draw.io diagrams."""

import os
from strands import Agent
from strands.models.bedrock import BedrockModel

from src.prompts.spec_system_prompt import get_system_prompt
from src.tools.render_drawio import render_drawio
from src.tools.save_diagram import save_diagram
from src.tools.load_diagram import load_diagram

model = BedrockModel(
    model_id=os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0"),
    region_name=os.environ.get("BEDROCK_REGION", "us-east-1"),
    max_tokens=16384,  # JSON specs are much smaller than raw XML
)

agent = Agent(
    model=model,
    system_prompt=get_system_prompt(),
    tools=[render_drawio, save_diagram, load_diagram],
)


def handler(event, context=None):
    """Lambda/AgentCore handler."""
    prompt = event.get("prompt", "") if isinstance(event, dict) else str(event)
    response = agent(prompt)
    return {"response": str(response)}


if __name__ == "__main__":
    import sys
    prompt = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else input("Describe your architecture: ")
    result = agent(prompt)
    print(result)
