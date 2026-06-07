# Modular Intent

IntentStack can load one root manifest plus focused module files. The root file stays small and declares `includes`; modules own pages, sections, entities, actions, shared navigation, theme, and auth.

## Root Manifest

```yaml
version: 0.1

project:
  id: modular_site
  target: web_ts_minimal

includes:
  - shared/*.yaml
  - backend/entities/*.yaml
  - backend/actions/*.yaml
  - frontend/pages/*.yaml
  - frontend/sections/**/*.yaml
```

The compiler assembles all included files into the same Core IR as a monolith intent. Validation, build, diff, graph, stats, security, and verify work against the assembled graph.

## Module Shapes

Use singular documents for focused files:

```yaml
page:
  id: docs
  path: /docs
  layout: docs
  sections:
    - ref: docs_content
```

```yaml
section:
  id: docs_content
  type: content
  title: Docs
  blocks:
    - id: intro
      type: paragraph
      text: This section lives in its own file.
```

Backend modules use the same pattern:

```yaml
entity:
  id: Lead
  table: leads
  fields:
    - id: email
      type: string
      required: true
```

```yaml
action:
  id: create_lead
  type: create_record
  entity: Lead
```

Shared modules can contain `theme`, `navigation`, or `auth`.

## Patch Writeback

`intentstack apply <patch.yaml> --write` preserves modular structure. Existing objects are written back to their owner files:

- navigation edits write to the navigation module;
- content block edits write to the section module;
- entity/action edits write to backend modules;
- page section ordering writes to the page module while section definitions stay in section files.

If `--out-intent` points to a different file, the CLI exports a single assembled intent copy instead.

## Diagnostics

For modular projects diagnostics include file provenance:

```text
[ERROR E2233] Unsupported content block type "quote".
    file: C:\...\intent\frontend\sections\docs\content.yaml
    at:  pages[0].sections[0].blocks[0].type
```

Use `--json` when an agent needs machine-readable `{ code, severity, message, path, file, suggestion, fix_hint }`.

## Split Command

Use `split` to migrate a monolith intent:

```bash
intentstack split --project .          # dry run
intentstack split --project . --write  # write modular files
```

The command writes a thin root manifest plus `shared/`, `backend/`, and `frontend/` module folders. It does not delete unrelated files.

## Graph

`intentstack graph --json` exposes `modules` metadata with source files and owners. `intentstack graph --html graph.html` renders a Modules panel for inspection.

See `examples/modular_site` for a complete modular app with shared modules, backend modules, frontend pages/sections, content blocks, and generated CRUD APIs.
