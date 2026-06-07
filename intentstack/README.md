# IntentStack Compiler

Reference implementation of the IntentStack v0.1 compiler.

The compiler reads `intent/app.intent.yaml`, assembles included modules, normalizes compact intent
into Core IR shape, validates semantic intent, emits a generated fullstack app, formats generated
files, and verifies the app for a selected target.

## Commands

```bash
node src/index.js new <dir> --target web_ts_minimal
node src/index.js new <dir> --single-file   # legacy/export-style monolith
node src/index.js check --project <dir> --json
node src/index.js build --project <dir>              # emit + format + npm run build when deps exist
node src/index.js diff --project <dir> --verbose
node src/index.js apply <patch.yaml> --project <dir> --write
node src/index.js split --project <dir> --write
node src/index.js list_capabilities --json
node src/index.js schema --out schema/intent.v0.1.schema.json
node src/index.js graph --project <dir> --html graph.html
node src/index.js editor --project <dir> --out editor.html
node src/index.js openapi --project <dir> --out openapi.yaml
node src/index.js testgen --project <dir> --out tests/generated
node src/index.js deploy --project <dir> --platform vercel --out app
node src/index.js themes --json
node src/index.js themes enterprise --project <dir> --write
node src/index.js stats --project <dir> --json
node src/index.js verify --examples examples --targets web_ts_minimal,next_shadcn
node src/index.js verify --examples examples --targets web_ts_minimal,next_shadcn --npm-build
node src/index.js docs --out docs-site
```

The Rust crate under `crates/intent_cli` is a CLI wrapper around this Node reference
compiler. It is intentionally not a full Rust port yet.

## Targets

- `web_ts_minimal`: Vite + React + Tailwind/daisyUI, Hono API, Drizzle + SQLite.
- `next_shadcn`: Next.js App Router + shadcn-style primitives, route handlers, Drizzle + SQLite.

## Current UI Contract

- Top-level `navigation` generates one shared nav component reused across pages.
- `page.navigation: false` opts a page out of shared navigation.
- `content` sections generate structured docs/content blocks: headings, paragraphs, lists, code, links, callouts, tables, and embedded examples.
- `example` content blocks render a generated section preview and its patch code together; set the referenced section to `embed_only: true` to avoid standalone page rendering.
- `content.example.add` adds embedded docs examples as a semantic patch op.
- Modular intent is the default project structure. Keep `intent/app.intent.yaml` thin with `includes`; put behavior under `shared/`, `backend/`, and `frontend/`.
- `apply --write` preserves modular structure by writing changes back to owner files.
- `section.module.add` creates new section modules and inserts page refs in one patch op.
- `split --write` migrates a monolith intent into modular files.
- `graph --html` shows module source files and ownership for modular projects.
- `editor` exports the same visual graph plus Patch Builder as an explicit visual editing entrypoint.
- Generated apps expose `/api/health` and `/api/metrics` for basic runtime checks.
- `themes` lists local theme packs and can apply one back into modular intent.

## Modular Example

```bash
node src/index.js new my-app
node src/index.js check --project examples/modular_site
node src/index.js graph --project examples/modular_site --html modular-graph.html
node src/index.js build --project examples/modular_site --out app-modular
```

Read `docs/modular-intent.md` for the module layout and patch writeback contract.

## Test Gates

```bash
npm run lint
npm test
cargo test
node ../intentstack/src/index.js check --project ../demo
node ../intentstack/src/index.js check --project examples/modular_site
node ../intentstack/src/index.js build --project ../demo
node ../intentstack/src/index.js build --project ../demo --target next_shadcn --out app-next
node ../intentstack/src/index.js verify --examples examples --targets web_ts_minimal,next_shadcn
```

`intentstack build` runs generated `npm run build` automatically when `node_modules` exists. Run
generated `npm run typecheck` as an additional local gate when needed.
GitHub Actions runs compiler lint/tests, Rust tests, and generated app `--npm-build` verification
for both supported targets.
