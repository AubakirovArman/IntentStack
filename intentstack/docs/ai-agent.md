# AI Agent Workflow

Default loop:

1. Read `intent/app.intent.yaml`.
   - Treat `includes` as the normal structure, not a special case.
   - Inspect the relevant owner module under `shared/`, `backend/`, or `frontend/` before editing.
2. Make the smallest semantic patch.
3. Run `intentstack apply <patch> --project <dir>`.
4. Run `intentstack check --project <dir>`.
5. Run `intentstack diff --project <dir>`.
6. Run `intentstack build --project <dir>`; it normalizes, emits, formats, and runs generated `npm run build` when dependencies are installed.
7. Run generated app typecheck when TypeScript contracts changed.

Rules:

- Prefer intent patches over generated code edits.
- Never edit generated zones by hand.
- Trust diagnostics and `fix_hint` before guessing.
- Use `list_capabilities` before adding new component or action types.
- Prefer top-level `navigation` over duplicating `navbar` sections across pages.
- Use `content` sections for docs-style copy instead of forcing documentation into `card_grid`.
- Use `example` content blocks when docs need a live generated component and the patch code in the same article block.
- Prefer `content.example.add` over hand-editing a docs content module for embedded examples.
- For modular projects, prefer `apply --write`; it writes changes back to owner module files.
- Do not flatten a modular app into one root YAML unless explicitly exporting with `--out-intent`.
- `intentstack new` creates modular projects by default; `--single-file` is only for legacy monoliths.
- Use `section.module.add` for new sections so the page gets a `ref` and the section gets its own module file.
- Set `embed_only: true` on sections that are referenced by a docs `example` block and should not render as standalone page bands.

Discovery and verification:

- `intentstack list_capabilities --json` shows targets, components, actions, field types, patch ops and domain modules.
- `intentstack schema` prints the DSL JSON Schema.
- `intentstack graph --html graph.html` writes a visual graph with pages, sections, entities, actions, modules, workflows, integrations and patch history.
- `intentstack stats --json` prints project metrics and warning/error codes.
- `intentstack verify --examples examples --targets web_ts_minimal,next_shadcn` validates and generates every example/target pair.
- `intentstack verify --npm-build` also runs `npm install` and `npm run build` for each generated app.
- `intentstack split --project . --write` migrates a monolith intent into modular files.

Diagnostics:

- In modular projects, diagnostics include `file` provenance in addition to semantic `path`.
- Apply `fix_hint` directly when present; otherwise edit the module file named by `file`.
