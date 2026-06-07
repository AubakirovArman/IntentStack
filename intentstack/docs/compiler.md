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
- `migrate`: currently no-op for DSL `0.1`.
- `list_capabilities`: print targets, components, actions, field types and patch ops.

`build --no-format` skips formatter execution. `build --no-verify` skips generated app verification.
`build --verify-install` runs `npm install` before generated `npm run build`.

Generated zones are target-owned. Do not hand-edit files under managed zones.
