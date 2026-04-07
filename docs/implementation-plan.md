# Diagram Agent — Implementation Plan

**Project:** diagram-agent  
**Owner:** Infinitra  
**Date:** April 2026  
**Status:** Planning

---

## 1. Overview

A conversational AI agent that generates editable draw.io architecture diagrams. Users describe what they want in natural language, the agent generates a `.drawio` XML file, and users can iteratively refine it through conversation ("now add a DR region", "change the database to Aurora").

**Key differentiator:** Conversational iteration — not a one-shot generator.

## 2. Architecture

```
User → AgentCore Endpoint (HTTPS)
         → Strands Agent (AgentCore Runtime microVM)
              ├── System Prompt: draw.io generation rules + icon reference table
              ├── @tool validate_xml — checks draw.io XML (hard errors + soft warnings)
              ├── @tool save_diagram — stores .drawio to S3 (user-isolated), returns presigned URL
              ├── @tool load_diagram — retrieves existing .drawio from S3 for editing
              └── Session Memory — AgentCore-managed (30 min TTL, configurable)
```

**AWS Services:**
- Amazon Bedrock AgentCore Runtime — serverless agent hosting (session TTL: 30 min default, configurable up to 8 hrs)
- Amazon Bedrock — Claude Sonnet for XML generation
- Amazon S3 — diagram file storage (user-isolated key prefixes)
- Amazon Cognito — user authentication (via AgentCore Identity)
- Amazon CloudWatch — observability (via AgentCore, automatic)

## 3. Tech Stack

| Component | Choice | Rationale |
|---|---|---|
| Agent framework | Strands Agents SDK (Python) | AWS-native, `@tool` decorator, built-in Bedrock integration, MCP-ready |
| Runtime | Bedrock AgentCore Runtime | Serverless, scales to zero, session isolation, up to 8hr sessions |
| LLM | Claude Sonnet (via Bedrock) | Best at structured XML generation, strong instruction following |
| XML validation | lxml | Fast, reliable XML parsing and validation |
| File storage | S3 | Presigned URLs for download, tenant-isolated prefixes |
| Auth | Cognito (via AgentCore Identity) | Consistent with NoOne platform |

## 4. Project Structure

```
diagram-agent/
├── docs/
│   └── implementation-plan.md      ← this file
├── src/
│   ├── agent.py                    ← agent definition + handler
│   ├── prompts/
│   │   ├── __init__.py
│   │   └── drawio_system_prompt.py ← draw.io generation rules + icon reference table
│   └── tools/
│       ├── __init__.py
│       ├── validate_xml.py         ← XML validation tool (hard errors + soft warnings)
│       ├── save_diagram.py         ← S3 storage tool (user-isolated keys)
│       └── load_diagram.py         ← S3 retrieval tool (load existing diagram)
├── tests/
│   ├── test_validate_xml.py
│   └── test_agent_local.py
├── requirements.txt
├── pyproject.toml
├── .gitignore
└── README.md
```

## 5. Implementation Items

### Day 1 — Agent + Tools + Prompt

| # | File | Description |
|---|---|---|
| 1 | `src/prompts/drawio_system_prompt.py` | The draw.io generation prompt (from `docs/drawio-generation-rules.md`) as a Python constant. Includes a comprehensive AWS icon reference table mapping ~50 common service names to their exact draw.io shape/resIcon names. Also includes the context management instruction: "On refinement, output the complete updated XML — never output diffs or partial XML." |
| 2 | `src/tools/validate_xml.py` | `@tool validate_drawio_xml(xml_content: str) -> str`. Two-tier validation: **Hard errors** (malformed XML, missing `<mxfile>`/`<diagram>`/`<mxGraphModel>`, duplicate cell IDs, broken source/target references) return error details for self-correction. **Soft warnings** (wrong font size, wrong icon size, wrong strokeWidth) are reported but don't block saving. Returns JSON: `{"status": "valid", "warnings": [...]}` or `{"status": "error", "details": "..."}`. |
| 3 | `src/tools/save_diagram.py` | `@tool save_diagram(xml_content: str, filename: str, user_id: str) -> str`. Uploads to S3 key `diagrams/{user_id}/{timestamp}-{filename}.drawio`. Content-Type: application/xml. Returns presigned download URL (1hr expiry). |
| 4 | `src/tools/load_diagram.py` | `@tool load_diagram(s3_key: str) -> str`. Retrieves an existing `.drawio` file from S3 and returns its XML content. Enables cross-session editing ("load my diagram from yesterday and add a caching layer"). |
| 5 | `src/agent.py` | Agent definition: Bedrock model config (Claude Sonnet, retry with exponential backoff on throttling), system prompt, tool registration, handler function. Context management: on refinement turns, only the latest XML version is included in history (prior XML versions are dropped to stay within token budget). ~60 lines. |
| 6 | `requirements.txt` | `strands-agents`, `strands-agents-tools`, `lxml`, `boto3` |
| 7 | `pyproject.toml` | Project metadata, Python 3.13, uv-compatible |
| 8 | `.gitignore` | Python defaults: `__pycache__/`, `.venv/`, `*.pyc`, `.env`, `dist/`, `*.egg-info/` |
| 9 | `tests/test_validate_xml.py` | Unit tests for XML validator: valid drawio, malformed XML, missing elements, duplicate IDs, broken edge refs, soft warnings (wrong font size passes but warns) |
| 10 | `tests/test_agent_local.py` | Local integration test: send a prompt, verify agent returns valid draw.io XML |

### Day 2 — Deploy + Integrate

| # | Task | Description |
|---|---|---|
| 11 | S3 bucket | Create `infinitra-diagram-agent-{env}` bucket with SSE-S3 encryption, lifecycle policy (auto-delete after 90 days), CORS for presigned URL downloads |
| 12 | AgentCore deployment | `agentcore configure --entrypoint src/agent.py --name diagram-agent` → `agentcore launch`. Configure session TTL (30 min default). Configure retry: exponential backoff on Bedrock `ThrottlingException` (3 retries, 1s/2s/4s). |
| 13 | Cognito integration | Configure AgentCore Identity with existing NoOne Cognito user pool. User ID from Cognito token used as S3 key prefix for tenant isolation. |
| 14 | End-to-end test | Generate a diagram via the AgentCore endpoint, download the `.drawio`, open in draw.io, verify. Test refinement (2nd message modifies diagram). Test session timeout recovery (load_diagram after session expires). |
| 15 | README.md | Setup instructions, local dev, deployment, usage examples, session timeout behavior |

## 6. Agent Behavior

### System Prompt Strategy

The agent receives three system prompt components:
1. **Role prompt:** "You are an architecture diagram generator. You produce draw.io XML files. On every generation or refinement, output the complete XML — never output diffs or partial XML."
2. **Rules prompt:** The full draw.io generation rules (icon styles, sizing, edge routing, etc.)
3. **Icon reference table:** A mapping of ~50 common AWS service names to their exact draw.io shape/resIcon names, so the agent doesn't guess.

### Context Management (Token Budget)

Draw.io XML is verbose (~5-10K tokens per diagram). To prevent context window exhaustion during multi-turn refinement:

- The agent always outputs the **complete updated XML**, not diffs
- On each refinement turn, only the **latest XML version** is kept in conversation history — prior XML versions are dropped
- The conversation text (user messages + agent explanations) is preserved across all turns
- This keeps the context at roughly: system prompt (~3K) + latest XML (~8K) + conversation text (~2K per turn) = manageable within 100K context window for 10+ refinement turns

### Conversation Flow

**First message:**
1. User describes the architecture
2. Agent generates draw.io XML following the rules
3. Agent calls `validate_drawio_xml` to check the XML
4. If hard error → agent self-corrects and re-generates (max 2 retries)
5. If valid (with or without soft warnings) → agent calls `save_diagram` to store in S3
6. Agent returns the diagram description + download URL + any soft warnings

**Refinement messages (same session):**
1. User says "add a CloudFront CDN" or "move the database to a private subnet"
2. Agent has conversation history + latest XML in context
3. Agent modifies the XML (complete output, not diff)
4. Validate → save → return updated download URL

**Cross-session editing:**
1. User starts a new session and says "load my previous diagram and add a caching layer"
2. Agent calls `load_diagram` with the S3 key (user provides it or agent lists recent files)
3. Loaded XML becomes the context for refinement
4. Normal refinement flow continues

### Session Timeout Behavior

- AgentCore session TTL: 30 minutes (configurable up to 8 hours)
- If session expires mid-conversation, user gets a new session
- User can resume by providing the download URL or S3 key from the previous session → `load_diagram` retrieves it
- Every saved diagram is persistent in S3 (90-day lifecycle) regardless of session state

### Self-Correction Loop

The `validate_drawio_xml` tool returns structured feedback:
- **Hard errors** (malformed XML, missing required elements, broken references): Agent must fix and re-validate. Max 2 self-correction attempts before returning an error to the user.
- **Soft warnings** (wrong font size on one element, icon slightly off-size): Diagram is saved anyway. Warnings are reported to the user so they can manually fix in draw.io if needed.

### Bedrock Throttling / Timeout Handling

- Retry strategy: exponential backoff on `ThrottlingException` — 3 retries at 1s, 2s, 4s intervals
- If all retries fail: return a user-friendly error ("Service is busy, please try again in a moment")
- Expected response time: 10-30 seconds for initial generation, 5-15 seconds for refinement
- AgentCore microVM timeout: 60 seconds per invocation (sufficient for diagram generation)

## 7. Tool Specifications

### validate_drawio_xml

```
Input:  xml_content (str) — raw draw.io XML
Output: JSON string — {"status": "valid"|"error", "warnings": [...], "details": "..."}

Hard errors (status="error", triggers self-correction):
- Malformed XML (lxml parse failure)
- Root element is not <mxfile>
- No <diagram> child elements
- Missing <mxGraphModel> → <root> structure
- Duplicate cell IDs
- Edge source/target referencing non-existent cell IDs

Soft warnings (status="valid", reported but diagram is saved):
- Icon not 78x78 (width/height mismatch)
- Text not fontSize=14 or fontStyle=1
- Line not strokeWidth=3
- Label placed on icon instead of below (verticalLabelPosition != bottom)
```

### save_diagram

```
Input:  xml_content (str), filename (str), user_id (str)
Output: presigned download URL (str)

Behavior:
- S3 key: diagrams/{user_id}/{YYYYMMDD-HHmmss}-{filename}.drawio
- Content-Type: application/xml
- Presigned URL expires in 1 hour
- Returns the URL + S3 key (so user can reference it later for load_diagram)
```

### load_diagram

```
Input:  s3_key (str) — full S3 key of an existing .drawio file
Output: XML content (str) — the raw draw.io XML

Behavior:
- Retrieves the file from S3
- Returns the XML content for the agent to use as context
- Agent can then modify it based on user instructions
- Returns error if key doesn't exist or user doesn't have access
```

## 8. Configuration

Environment variables:

| Variable | Description | Example |
|---|---|---|
| `BEDROCK_MODEL_ID` | LLM model for generation | `us.anthropic.claude-sonnet-4-20250514-v1:0` |
| `BEDROCK_REGION` | Bedrock region | `us-east-1` |
| `S3_BUCKET` | Diagram storage bucket | `infinitra-diagram-agent-prd` |
| `LOG_LEVEL` | Logging level | `INFO` |

## 9. Cost Estimate

| Component | Usage (est. 50 diagrams/day) | Monthly Cost |
|---|---|---|
| AgentCore Runtime | ~50 sessions × 2 min avg | ~$5 |
| Bedrock (Claude Sonnet) | ~50 × 3 turns × 4K tokens | ~$15 |
| S3 | ~1500 files × 50KB avg | < $1 |
| **Total** | | **~$21/month** |

Scales to zero when not in use. No idle cost.

## 10. Future Enhancements (Not in v1)

| Feature | Description |
|---|---|
| MCP server exposure | Expose as MCP tool for Kiro CLI, VS Code, Claude Desktop |
| Diagram templates | Pre-built starting points (3-tier web app, serverless, microservices) |
| Image export | Convert .drawio to PNG/SVG server-side |
| Team sharing | Share diagrams via NoOne platform |
| Version history | Track diagram revisions per conversation |
| Multi-provider icons | GCP, Azure, Kubernetes icon sets |
| Frontend UI | Chat interface in NoOne web app |

## 11. Success Criteria

- [ ] Agent generates valid draw.io XML that opens correctly in draw.io
- [ ] Follows all style rules (78pt icons, 14px bold text, 3pt lines, labels below icons)
- [ ] Uses correct AWS 2024/2026 icon set (verified against icon reference table)
- [ ] No lines pass through unrelated icons
- [ ] Conversational refinement works (modify existing diagram, not regenerate from scratch)
- [ ] Self-correction: agent validates and fixes hard XML errors before returning (max 2 retries)
- [ ] Soft warnings reported to user without blocking diagram delivery
- [ ] Download URL works and file opens in draw.io desktop / app.diagrams.net
- [ ] Cross-session editing works via `load_diagram` (load previous diagram into new session)
- [ ] S3 files are user-isolated (user A cannot access user B's diagrams)
- [ ] Bedrock throttling handled gracefully (retry + user-friendly error message)
- [ ] Deployed on AgentCore, scales to zero, responds within 30 seconds for refinement, 60 seconds for initial generation
- [ ] 10+ refinement turns work without context window exhaustion
