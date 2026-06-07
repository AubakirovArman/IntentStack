# IntentStack v0.1 — AI-native fullstack compiler (working prototype)

![CI](https://github.com/AubakirovArman/IntentStack/actions/workflows/ci.yml/badge.svg)

> One declarative intent file -> a real, running fullstack app.
> The AI writes **intent**; the compiler writes the **code**.
> And the SAME intent compiles to **two different stacks** by changing one flag.

This is a runnable proof-of-concept of the IntentStack PRD. A single `app.intent.yaml`
is compiled by `intentstack` into a complete application — frontend, backend, database
schema, API and form/table wiring — all generated from one source of truth.

```
                      intent/app.intent.yaml   (one source of truth)
                                 |
              parse -> normalize -> validate -> Core IR -> plan -> emit -> format -> verify
                                 |
               +------------------+-------------------+
              v                                      v
   target: web_ts_minimal                  target: next_shadcn
   Vite + React + daisyUI                  Next.js App Router + shadcn/ui
   Hono API                                Route handlers
   Drizzle + SQLite  <----- shared data layer -----> Drizzle + SQLite
```

## What's here

| Path | What it is |
|------|------------|
| `intentstack/` | The compiler (reference implementation, plain ESM JS — runs on Node, no build step). Stands in for the eventual Rust compiler so the thesis can be proven fast. |
| `demo/intent/app.intent.yaml` | The canonical example: a VoiceAgent landing page (navbar, hero, features, lead form, footer) + a leads dashboard, backed by a `Lead` entity and `create_lead` / `list_leads` actions. |
| `demo/intent/broken.example.yaml` | A deliberately broken intent that shows the validator catching mistakes (with "did you mean?" suggestions and `fix_hint`s) **before any code is generated**. |
| `demo/app/` | Generated app, target **web_ts_minimal** (Vite/React/daisyUI + Hono). |
| `demo/app-next/` | Generated app, target **next_shadcn** (Next.js + shadcn/ui) — from the *same* intent. |
| `AGENTS.md` | The contract an AI agent follows: edit intent, never the generated code. |

## Try it

From this folder:

```bash
# install the compiler's one dependency (a YAML parser)
cd intentstack && npm install && cd ..

# validate — no code generated
node intentstack/src/index.js check --project demo

# watch the validator reject a broken intent
node intentstack/src/index.js check --project demo --intent demo/intent/broken.example.yaml

# compile the SAME intent to two different stacks (only --target changes)
node intentstack/src/index.js build --project demo --out app                       # -> demo/app      (Vite/React/daisyUI + Hono)
node intentstack/src/index.js build --project demo --target next_shadcn --out app-next   # -> demo/app-next (Next.js + shadcn/ui)
```

Run either app:

```bash
cd demo/app      && npm install && npm run dev   # web :5173, api :8787
# or
cd demo/app-next && npm install && npm run dev   # http://localhost:3000
```

Submit the demo form, then open the dashboard — the lead travels
form -> API -> SQLite -> table, with zero hand-written React or backend code.

## The point

Not that it generates React (many tools do). It's that:

- the agent writes stable, typed **semantic commands**, not framework code;
- the **validator** rejects bad references (`Leadx`, `craete_lead`, an unknown component)
  with a suggested fix before a single file is emitted;
- the same intent is **portable** — `web_ts_minimal` and `next_shadcn` are produced from
  one file; the Drizzle/SQLite data layer is *byte-identical* across both, and only the
  framing (React/Hono vs Next/route-handlers, daisyUI vs shadcn) differs;
- regeneration is **idempotent** and touches only `generated/`-style zones, so hand-written
  code is preserved.

## Adding a target

A target adapter is one module exporting `managedZones` + `planFiles(graph)`
(`intentstack/src/targets/*.js`), registered in `targets/index.js` and `registry.js`.
The Core IR and the shared data-model codegen (`emit/shared/datamodel.js`) are reused as-is.

## Status / scope (v0.1)

Implemented: `new`, `check`, `build`, `plan`, `diff`, `apply`, `explain`, `doctor`,
`migrate`, `list_capabilities`, `schema`, `graph`, `editor`, `openapi`, `testgen`, `deploy`, `themes`, `marketplace`, `stats`, `verify`; two target adapters;
entities -> Drizzle schema + SQL migration + zod validators; record actions -> Hono routes /
Next route handlers; shared top-level `navigation`; pages/sections -> `navbar`, `hero`, `card_grid`, `stats`,
`pricing_cards`, `content`, `form`, `table`, `record_detail`, `footer`, `custom_component`; derived API clients; inline
table detail/edit/delete row actions; dynamic detail pages; embedded docs examples via `content.example.add` +
`embed_only` sections; normalize phase for compact field refs; generated Prettier formatting; generated `npm run build`
verification; JSON Schema; visual graph HTML export; patch history; basic auth guards; workflow/integration metadata and
webhook dispatch; realtime `subscribe_records` streams; visual editor export; generated health/metrics endpoints; generated API contract tests; deploy config generation; local theme packs and marketplace listing; GitHub Actions CI for compiler lint/tests, Rust wrapper tests, and generated app build matrix.

Still partial: Rust compiler core, production sessions/login, durable workflow jobs,
provider-specific integration clients and a visual editor.

## The agent loop (patches)

Agents change the app with small **patches**, not full rewrites:

```bash
intentstack apply demo/patches/001-add-email-and-pricing.yaml --project demo --write
```

`apply` prints a **semantic diff**, re-validates the result, and refuses to write if the
patch would introduce errors. The bundled patch is one step that retitles the hero, adds
`email` to the `Lead` entity + lead form + dashboard table, inserts a `pricing` section and
a navbar item. Rebuilding regenerates both targets: the new `email` column and `pricing`
section appear in the Vite/daisyUI and Next/shadcn apps alike, and the SQLite migration
stays identical across them. The result is saved as `demo/intent/app.patched.example.yaml`.

Use `node intentstack/src/index.js list_capabilities --json` for the current patch op list.
