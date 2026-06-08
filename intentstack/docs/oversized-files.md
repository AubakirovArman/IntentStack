# Oversized Source Files Audit

Current active-development source files above 300 lines: none.

The enforced audit is:

```bash
npm run lint:lines:enforce
```

It checks `src`, `test`, and `crates/intent_core/src` for `.js`, `.ts`, `.tsx`, and `.rs` files
above 300 lines. Large source documents such as `prd.md` should be split as part of the docs
modularization track, but they are outside the enforced source-code gate.
