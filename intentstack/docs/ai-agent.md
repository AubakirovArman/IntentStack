# AI Agent Workflow

Default loop:

1. Read `intent/app.intent.yaml`.
2. Make the smallest semantic patch.
3. Run `intentstack apply <patch> --project <dir>`.
4. Run `intentstack check --project <dir>`.
5. Run `intentstack diff --project <dir>`.
6. Run `intentstack build --project <dir>`.
7. Run generated app typecheck/build.

Rules:

- Prefer intent patches over generated code edits.
- Never edit generated zones by hand.
- Trust diagnostics and `fix_hint` before guessing.
- Use `list_capabilities` before adding new component or action types.
- Prefer top-level `navigation` over duplicating `navbar` sections across pages.
- Use `content` sections for docs-style copy instead of forcing documentation into `card_grid`.

Discovery and verification:

- `intentstack list_capabilities --json` shows targets, components, actions, field types, patch ops and domain modules.
- `intentstack schema` prints the DSL JSON Schema.
- `intentstack graph --html graph.html` writes a visual graph with pages, sections, entities, actions, workflows, integrations and patch history.
- `intentstack stats --json` prints project metrics and warning/error codes.
- `intentstack verify --examples examples --targets web_ts_minimal,next_shadcn` validates and generates every example/target pair.
- `intentstack verify --npm-build` also runs `npm install` and `npm run build` for each generated app.
