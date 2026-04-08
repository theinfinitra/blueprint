# Contributing to Blueprint

## Setup

1. Fork and clone the repo
2. Install dependencies:
   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   brew install graphviz  # macOS
   cd frontend && npm install
   ```
3. Copy config files:
   ```bash
   cp frontend/.env.example frontend/.env
   cp infra/config/stg.env.example infra/config/stg.env
   ```
4. Test the renderer locally (no AWS needed):
   ```bash
   python -c "
   from src.renderer.schema import parse_spec, normalize_spec
   from src.renderer.layout import compute_layout
   from src.renderer.emitter import emit_drawio
   spec = parse_spec({'title':'Test','nodes':{'a':{'type':'lambda','label':'API'}},'edges':{},'clusters':{}})
   spec = normalize_spec(spec)
   print(emit_drawio(spec, compute_layout(spec))[:200])
   "
   ```

## Pull Requests

- One feature/fix per PR
- Run `cd frontend && npx tsc --noEmit` before submitting
- Run `pytest tests/` for backend tests
- Keep PRs small — large changes should be discussed in an issue first

## Code Style

- **Python**: Standard library conventions, type hints where helpful
- **TypeScript**: Strict mode, no `any`
- **Styles**: All in `frontend/src/styles.ts` — don't add inline style objects in components

## Adding AWS Services

To add a new service icon, edit `src/renderer/icons.py`:
```python
"new_service": IconDef(_resource("new_service", _CATEGORY_COLOR), "category"),
```
The icon name must match a `mxgraph.aws4.*` stencil in draw.io.

## Architecture

See [README.md](README.md) for the full architecture overview. Key principle: the LLM generates a JSON spec, the renderer produces draw.io XML. Never let the LLM touch XML directly.
