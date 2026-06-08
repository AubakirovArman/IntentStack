# IntentStack Epics (100)

This is a practical roadmap focused on:
- compiler/runtime correctness,
- security and production readiness,
- modularity and scalability,
- demo application quality,
- developer experience and ecosystem growth.

Legend:
- Priority: P0 (critical), P1 (high), P2 (normal), P3 (future)
- Effort: XS, S, M, L, XL
- Status: done / partial / planned

## 1) Core correctness and language quality (1-25)

1. [done] Normalize entity fields to IR refs (`fields: [name] -> {id, ref}`) to close semantic gaps in normalization.
2. [done] Persist normalized AST output (including id/ref conversion) to avoid implicit behavior at validation time.
3. [done] Implement full reference graph resolver for entities, actions, sections, pages, and intent includes.
4. [done] Add schema-level cycle detection for cross-entity and include references.
5. [done] Detect ambiguous field names in entities and report line-precise diagnostics.
6. [done] Add typed symbol table for entity, action, section, and page namespaces.
7. [done] Add IR-level type inference for computed / expression-like values.
8. [done] Track resolved references in emitted IR so downstream codegen can use canonical links.
9. [done] Add semantic validation stage for `content.example` placement + embed-only constraints.
10. [done] Add deterministic module ordering for patch writes to avoid nondeterministic diffs.
11. [done] Add atomic patch execution with rollback when any op fails.
12. [done] Fix operation ordering for operations that mutate IDs/references (race-safe patch semantics).
13. [done] Add patch idempotency checks to prevent duplicated side effects.
14. [done] Add patch dry-run preview diff with semantic + file modes.
15. [done] Expose conflict explanation for partial failures (where to look, what to fix).
16. [done] Add capability-aware patch pre-check before mutation.
17. [done] Add support for multi-op patch transactions across files.
18. [done] Add first-class IR docs and JSON schema for `patch` operations.
19. [done] Add strict and clear unsupported version checks in parser/validator.
20. [done] Add version migration command for intent schemas across breaking changes.
21. [done] Enable compiler plugin hooks for custom validators.
22. [done] Add structured error codes for all compiler warnings (not just free text).
23. [done] Add machine-readable warning catalog and rule IDs.
24. [done] Add experimental diff optimizer (semantic minimal patches only).
25. [done] Add compile-time diagnostics for include cycles and unresolved references.

## 2) Emission pipeline, adapters, and generators (26-45)

26. [done] Create shared registry-based section mapping (remove adapter-specific hardcoding).
27. [done] Unify backend/frontend codegen by section type map and adapter contracts.
28. [done] Refactor Next adapter codegen to consume registry metadata for class/style mapping.
29. [done] Add component registry loader contract tests for all built-in components.
30. [done] Add generated import deduplication optimization pass.
31. [done] Add formatting step in build pipeline (`prettier` / `rustfmt` integration).
32. [done] Auto-run build verification for generated apps (`npm run build`) after emit.
33. [done] Add generated API contract snapshot generation (OpenAPI + JSON Schema).
34. [done] Split openapi generation into stable pluggable modules.
35. [done] Add OpenAPI operation tests for every action and edge-case route.
36. [done] Add stable deterministic file ordering in output emit.
37. [done] Add partial emit mode for preview without full regeneration.
38. [done] Create single source for auth middleware generation in backend.
39. [done] Add generated frontend route guarding for policy-protected pages.
40. [done] Generate target capability manifests from registry.
41. [done] Modularize emitter helpers across all major targets.
42. [done] Add observability hooks in generated code by section type.
43. [done] Generate client SDK stubs from actions for demo consumption.
44. [done] Add adapter coverage matrix tests (web_ts_minimal + next_shadcn).
45. [done] Add incremental generation cache keyed by intent digest.

## 3) Backend architecture and data layer (46-65)

46. [done] Replace in-memory sessions with durable backend store (Redis/Postgres).
47. [done] Add session expiration + rotation + revocation support.
48. [done] Production-grade auth hardening (`bcrypt`, JWT/session model, secure cookies).
49. [done] Add CSRF protection for mutation endpoints.
50. [done] Enforce HTTPS / secure redirect in generated servers.
51. [done] Add password policy and optional account lockout in auth flow.
52. [done] Enforce role/policy validation on every request path.
53. [done] Remove trust on client-provided role headers (server-only auth context).
54. [done] Add audit trail for login and policy decisions.
55. [done] Add configurable rate limiting middleware per route.
56. [done] Add graceful shutdown handling (SIGTERM/SIGINT) in server entrypoints.
57. [done] Ensure DB connections close on shutdown + startup health checks.
58. [done] Extract database adapter layer (`sqlite` hardcode -> pluggable drivers).
59. [done] Add transaction wrappers for mutation handlers.
60. [done] Add tenant isolation strategy (schema or RLS-driven).
61. [done] Replace migration bootstrap with managed migration flow and rollback support.
62. [done] Add schema drift detection and reporting.
63. [done] Add configurable CORS policy generation per environment.
64. [done] Add structured request logging with request IDs.
65. [done] Add request correlation IDs across action -> DB -> response.

## 4) Frontend and demo app quality (66-85)

66. [done] Add navigation menu in application UI.
67. [done] Add Documentation page route.
68. [done] Add table examples section with realistic seed content and sort filters.
69. [done] Add form examples (text, textarea, enum/select, checkbox, datetime).
70. [done] Add card and metrics sections with reusable component examples.
71. [done] Create integrated docs blocks where preview and code are in one section.
72. [done] Add syntax-highlighted snippet rendering for docs.
73. [done] Add docs "live patch" flow: edit intent + preview + generated code in one block.
74. [done] Add responsive visual regression checks for core layouts.
75. [done] Add accessible navigation patterns and keyboard support.
76. [done] Add error boundaries for generated section rendering.
77. [done] Add global error UI with retry/recover actions.
78. [done] Add user feedback and toast system for actions.
79. [done] Add loading and empty states for list/table/form actions.
80. [done] Add filtering, search, and sorting to table examples.
81. [done] Add pagination for list and table components.
82. [done] Add table export actions (CSV/JSON) for demo pages.
83. [done] Add chart component as first non-core UI extension.
84. [done] Add theme switcher + theme pack switching in demo runtime.
85. [done] Build consistent iconography and microinteractions for form controls.

## 5) Security, validation, and resilience (86-95)

86. [done] Validate version in pipeline before load.
87. [done] Normalize all loader include paths against allowlist.
88. [done] Restrict includes to trusted roots and block path traversal.
89. [done] Sandbox boundaries for custom component source/build execution.
90. [done] Add integrity checks for custom component sources (hash + signature).
91. [done] Add file-size/lint gates to CI pipeline.
92. [done] Add strict CSP headers in generated frontend/server templates.
93. [done] Add runtime exception telemetry endpoint and alerts.
94. [done] Add per-route timeout controls and cancellation behavior.
95. [done] Add automated dependency vulnerability scans in CI.

## 6) Ecosystem, workflow, and future capabilities (96-100)

96. [done] Add plugin/target marketplace contract and discovery.
97. [done] Add visual editor MVP for intent graph editing + in-browser patch apply.
98. [done] Add collaboration workflow (locking and conflict detection).
99. [done] Add one-click deploy to Vercel/Netlify/Render.
100. [done] Add AI-assisted intent authoring (autocompletion + patch suggestions).
