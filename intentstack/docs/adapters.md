# Target Adapters

Adapters translate Core IR into concrete framework files.

Current targets:

- `web_ts_minimal`: Vite + React + Tailwind CSS + daisyUI + Hono + Drizzle/SQLite.
- `next_shadcn`: Next.js App Router + shadcn-style primitives + Drizzle/SQLite.

Both targets share the data-model emitter for Drizzle schema, migrations and validators. UI/API framing is target-specific.

Adapter contract:

```text
capabilities -> planFiles(graph) -> managed zones -> emitted files
```

Target capability metadata is mirrored in `registry/targets/*.yaml`.
