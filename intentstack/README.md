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
node src/index.js collab --project <dir> --incoming feature-branch --json
node src/index.js editor --project <dir> --out editor.html
node src/index.js editor --project <dir> --serve --port 4321
node src/index.js openapi --project <dir> --out openapi.yaml
node src/index.js testgen --project <dir> --out tests/generated   # API contract + Playwright E2E flows
node src/index.js deploy --project <dir> --platform vercel --out app
node src/index.js deploy --project <dir> --platform vercel --out app --execute
node src/index.js themes --json
node src/index.js themes enterprise --project <dir> --write
node src/index.js marketplace --json
node src/index.js stats --project <dir> --json
node src/index.js verify --examples examples --targets web_ts_minimal,next_shadcn
node src/index.js verify --examples examples --targets web_ts_minimal,next_shadcn --npm-build
node src/index.js docs --out docs-site
cargo run -p intent_cli -- core inspect ../demo/intent/app.intent.yaml --json
cargo run -p intent_cli -- core plan ../demo/intent/app.intent.yaml --json
```

The Rust workspace includes `crates/intent_core`, which parses YAML/JSON intent into a typed
Core IR with diagnostics, a symbol table, resolved references, inferred action/section types,
bindings, pass summaries, and a Rust-native generated file plan for both shipped targets.
`crates/intent_cli` still forwards normal app generation commands to the Node reference emitter,
while `intentstack core check|inspect|plan|version` exercises the Rust core directly. Full Rust
file-content emitter parity is intentionally still future work.

## Targets

- `web_ts_minimal`: Vite + React + Tailwind/daisyUI, Hono API, Drizzle + SQLite.
- `next_shadcn`: Next.js App Router + shadcn-style primitives, route handlers, Drizzle + SQLite.

Both targets consume the same `db_driver` contract. The shipped driver is `sqlite`; it owns
Drizzle imports, SQL migration text, migration manifest checksums, generated DB client code,
package dependencies, env examples, gitignore entries, and generated app README database notes.
When a project is rebuilt into an existing output directory, the compiler preserves previous
SQL migration files and adds `0001_update.sql`, `0002_update.sql`, and so on for detected schema
changes instead of rewriting `0000_init.sql`.

## Current UI Contract

- Top-level `navigation` generates one shared nav component reused across pages.
- `page.navigation: false` opts a page out of shared navigation.
- `content` sections generate structured docs/content blocks: headings, paragraphs, lists, code, links, callouts, tables, and embedded examples.
- `example` content blocks render a generated section preview and its patch code together; set the referenced section to `embed_only: true` to avoid standalone page rendering.
- `content.example.add` adds embedded docs examples as a semantic patch op.
- `custom_component` sources must stay under `src/custom/`, export the named component, avoid unsafe code patterns, and generated apps include CSP headers/meta.
- Modular intent is the default project structure. Keep `intent/app.intent.yaml` thin with `includes`; put behavior under `shared/`, `backend/`, and `frontend/`.
- `apply --write` preserves modular structure by writing changes back to owner files.
- `section.module.add` creates new section modules and inserts page refs in one patch op.
- `split --write` migrates a monolith intent into modular files.
- `graph --html` shows module source files and ownership for modular projects.
- `editor` exports the same visual graph plus Patch Builder as an explicit visual editing entrypoint.
- Served editor mode supports drag/drop section reorder through generated `section.move` patches.
- Generated apps expose `/api/health` and `/api/metrics` for basic runtime checks.
- Generated apps export request spans to an OTLP/HTTP OpenTelemetry collector when
  `OTEL_EXPORTER_OTLP_ENDPOINT` or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set.
- `subscribe_records` actions generate `/api/<table>/stream` server-sent event endpoints.
- `themes` lists local theme packs and can apply one back into modular intent.
- `marketplace` lists local targets, theme packs, and domain modules available in this compiler build.

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
