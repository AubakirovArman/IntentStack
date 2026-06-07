# Compiler

Pipeline:

```text
load intent -> parse YAML/JSON -> normalize -> validate -> build Core IR -> plan target files -> emit -> format -> verify -> report
```

Current commands:

- `check`: parse and validate only.
- `build`: normalize, validate, plan, write generated files, format them, and run `npm run build` when dependencies are installed.
- `plan`: print the target file plan.
- `diff`: compare planned files with files on disk.
- `apply`: apply semantic patches, then validate the result.
- `explain`: explain how a section maps to a target component.
- `new`: create a starter intent project.
- `doctor`: validate the project and compiler plan.
- `graph`: print a Core IR summary for graph tooling.
- `editor`: export a visual graph and semantic patch builder HTML file.
- `openapi`: export an OpenAPI 3.1 spec from intent entities and record actions.
- `testgen`: generate API contract tests from intent record actions.
- `deploy`: prepare provider deployment config for Vercel, Netlify, or Render.
- `themes`: list local theme packs and apply them through intent writeback.
- `marketplace`: list local targets, theme packs, and domain modules.
- `collab`: inspect changed module owners and detect semantic owner conflicts against an incoming git ref.
- `migrate`: currently no-op for DSL `0.1`.
- `list_capabilities`: print targets, components, actions, field types and patch ops.

Rust core commands:

- `cargo run -p intent_cli -- core check <intent-file>`: parse and validate through Rust Core.
- `cargo run -p intent_cli -- core inspect <intent-file> --json`: emit typed Core IR diagnostics, symbols, resolved references, types and bindings.
- `cargo run -p intent_cli -- core plan <intent-file> --json`: emit the Rust-native generated file plan for the target.

`build --no-format` skips formatter execution. `build --no-verify` skips generated app verification.
`build --verify-install` runs `npm install` before generated `npm run build`.

`subscribe_records` actions generate server-sent event streams at `/api/<table>/stream`
and matching API client helpers.

Generated apps emit trace context headers, structured request logs, health/metrics endpoints,
and optional OTLP/HTTP OpenTelemetry span export when `OTEL_EXPORTER_OTLP_ENDPOINT` or
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set.

Generated zones are target-owned. Do not hand-edit files under managed zones.
