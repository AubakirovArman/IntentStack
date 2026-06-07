# Epic Status

Status legend:

- `done`: implemented and covered by tests or generated builds.
- `partial`: useful implementation exists, but PRD scope is not fully closed.
- `planned`: no meaningful implementation yet.

## v0.1

1. Rust CLI: `done`. Cargo workspace and `intent_cli` binary exist; unit and integration tests prove the Rust entrypoint runs compiler commands (`schema`, `list_capabilities`) and Rust-native core commands (`check`, `inspect`, `plan`).
2. DSL schema and strict validation: `done`. Semantic validator exists, unsupported versions are rejected, and `intentstack schema` plus `schema/intent.v0.1.schema.json` expose the JSON Schema contract.
3. Component and target registry: `done`. Registry files exist and are tested against in-code capabilities.
4. Full patch command set: `done`. The PRD command surface is implemented and exposed through `patchOps()`/`list_capabilities`.
5. UI component catalog: `done`. `navbar`, `hero`, `card_grid`, `pricing_cards`, `stats`, `form`, `table`, `record_detail`, `footer`, `custom_component` are supported.
6. CRUD completeness: `done`. CRUD routes and clients are generated; dashboard row actions support detail/edit/delete, and dedicated dynamic record detail pages are generated for both targets.
7. CLI completeness: `done`. `new`, `check`, `build`, `apply`, `plan`, `diff`, `explain`, `doctor`, `migrate`, `list_capabilities`, `schema`, `graph`, `editor`, `openapi`, `testgen`, `deploy`, `themes`, `marketplace`, `stats`, `verify`, and `docs` exist; `build` now includes normalize, format, and generated build verification phases.
8. Generated/custom extension model: `done`. `custom_component` validates source/export, validates declared props schemas, and emits wrappers with typed props for both targets.
9. Testing system: `done`. Unit, patch, golden, registry, CLI, diff, generated API contract tests, and examples x targets verify tests exist; GitHub Actions runs lint, Node tests, Rust tests, and generated app build matrix for both targets.
10. Docs and AI-agent protocol: `done`. Core docs exist, AGENTS/README are current, and `intentstack docs --out` generates a static documentation site.
11. Security, verification, metrics: `done`. Validation, safe CRUD basics, secret checks, auth guards, sessions, generated health/metrics endpoints, `verify`, `stats`, and `security` audit gates exist and are tested.

## Roadmap

12. Auth + permissions: `done`. Users, roles, env-backed passwords, sessions/login/logout/me, protected pages, protected API and RBAC guards are generated and validated for both targets.
13. Workflows: `done`. Workflow triggers and steps validate; generated dispatch runs after mutating CRUD actions, logs durable local runs, handles email/background/state/approval steps, and webhook steps can POST to env-backed URLs.
14. Integrations: `done`. Integration declarations validate, inline secrets are rejected, generated registries are emitted, env-backed dispatch exists, and provider helper clients cover webhook/email/CRM/Telegram/WhatsApp/payment/external API.
15. Multi-target expansion: `done`. `next_shadcn` exists as the second target proof; more targets remain roadmap extensions, and the Rust core now plans generated file topology for both shipped targets.
16. Visual graph: `done`. `intentstack graph` exports JSON and an HTML graph with pages, sections, entities, actions, workflows, integrations, patch history, component tree and an interactive semantic patch builder.

## v0.2 Extensions

17. Global navigation/layout: `done`. Top-level `navigation` is validated, exposed in schema/capabilities, editable through semantic patch ops, and generated as one shared nav component across pages for both targets.
18. Docs/content component: `done`. `content` sections validate structured heading/paragraph/list/code/example blocks, generate docs-style content with optional table of contents, and are available in both target registries.
19. Multi-target support for shared nav/content: `done`. `web_ts_minimal` and `next_shadcn` both emit shared `AppNav`, docs routes, and generated content sections from the same intent.
20. Tests/examples/schema for nav/content: `done`. Unit, patch, validation, CLI/schema, golden, registry, and `docs_content` example coverage are present; `verify --npm-build` passes the example matrix.
21. Visual starter migration: `done`. `playground/visual-starter` now uses shared navigation and a `content` docs page; web and Next generated apps pass typecheck/build.
22. Modular intent manifest: `done`. Root manifests can declare `includes`, and the loader assembles focused module files into one validated Core IR.
23. Frontend intent modules: `done`. Page modules can reference section modules by `ref`; examples and tests cover Web and Next generation.
24. Backend intent modules: `done`. Entity and action modules assemble into generated database schema, API routes, and API clients.
25. Shared intent modules: `done`. Theme, navigation, and auth can live in `shared/*.yaml`, with owners tracked in loader metadata.
26. Module patch writeback: `done`. `apply --write` preserves modular projects and writes edits back to owner files instead of flattening the root manifest.
27. Provenance diagnostics: `done`. Modular diagnostics include source file provenance in text and JSON output.
28. Split command: `done`. `intentstack split` dry-runs or writes modular files from a monolith intent.
29. Content authoring improvements: `done`. Content blocks now support links, callouts, and tables; patch ops include `content.blocks.set` and `content.block.move`.
30. Module graph UI: `done`. `graph --json` and `graph --html` expose module source files and ownership.
31. Modular-first default: `done`. `intentstack new` creates modular projects by default, `--single-file` is reserved for legacy monoliths, and `playground/visual-starter` now uses root includes plus shared/frontend modules.
32. Section module patch op: `done`. `section.module.add` creates a focused section module and inserts a page `ref`, keeping modular pages from accumulating inline sections.
33. Embedded docs examples: `done`. `example` content blocks can render a live generated section and patch code inside the same docs article block; `embed_only` keeps referenced sections out of standalone page rendering; `content.example.add` inserts these blocks through semantic patches.
34. OpenAPI generation: `done`. `intentstack openapi` exports OpenAPI 3.1 JSON/YAML from Core IR entities and CRUD record actions, including request/response schemas, item/collection paths, auth cookies, CSRF headers, and CLI tests.
35. Next adapter modularization: `done`. The `next_shadcn` target now delegates project scaffolding, UI primitives, data layer, API routes, and frontend rendering to focused modules instead of one monolithic adapter file.
36. Generated test framework: `done`. `intentstack testgen` writes Node `node:test` API contract tests from CRUD record actions, including target-aware base URLs, auth token support, ID-driven item tests, and opt-in mutating tests.
37. Deploy preparation: `done`. `intentstack deploy --platform vercel|netlify|render` validates intent, can prepare the generated app, writes provider config files, and prints the next provider command without triggering remote login by default.
38. Observability surface: `done`. Generated Web/Hono and Next apps expose `/api/health` and `/api/metrics`; Web tracks request counts by path and last request duration, Next exposes runtime uptime/counts for the metrics route, and both targets can export request spans to an OTLP/HTTP OpenTelemetry collector when OTEL env vars are set.
39. Theme marketplace v0: `done`. A local `themes` registry exposes reusable theme packs, `intentstack themes --json` lists them, and `intentstack themes <preset> --write` applies a pack through modular intent writeback.
40. Visual editor v0: `done`. `intentstack editor --out editor.html` exports the visual graph plus semantic Patch Builder as a dedicated editor entrypoint for non-code intent changes, and served editor mode can reorder page sections by drag/drop through semantic `section.move` patches.
41. Plugin/target marketplace v0: `done`. `intentstack marketplace` exposes the local catalog of targets, theme packs, and domain modules in text or JSON, giving agents one product-level discovery command before future third-party installs.
42. Realtime subscriptions v0: `done`. Action type `subscribe_records` is validated, exposed in capabilities/schema, represented in Core IR as a stream output, emitted as `/api/<table>/stream` server-sent event endpoints for Web/Hono and Next, documented in OpenAPI, and covered by generated API clients/tests.
