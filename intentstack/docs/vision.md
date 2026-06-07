# IntentStack Vision

IntentStack is an AI-native fullstack compiler. The AI agent writes typed intent and semantic patches; the compiler owns framework code.

Core invariant:

```text
Intent DSL describes what.
Target adapters describe how.
Generated code is secondary.
```

The first production target is `web_ts_minimal`: Vite, React, Tailwind CSS, daisyUI, Hono, SQLite, Drizzle and Zod. The current prototype also includes `next_shadcn` as a portability proof.
