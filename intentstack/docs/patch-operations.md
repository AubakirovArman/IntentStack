# Patch Operations

Patch files are semantic edit transactions:

```yaml
version: 0.1
patch:
  - op: section.module.add
    page: docs
    section:
      id: preview_cards
      type: card_grid
      embed_only: true
      items:
        - title: Preview
          text: Embedded in a docs example.
```

The machine-readable source of truth is:

```bash
intentstack list_capabilities --json
```

The JSON payload includes:

- `patch_ops`: sorted operation names implemented by the compiler.
- `patch_catalog`: per-operation category, summary, required fields, optional fields, and an operation JSON Schema fragment.
- `patch_schema`: JSON Schema for a patch document using all registered operations.

Patch tooling should validate against `patch_schema` before applying a patch, then call `intentstack apply <patch.yaml>` for semantic validation and writeback.

To generate a semantic patch from one intent state to another, use the experimental optimizer:

```bash
intentstack diff --project . --semantic --to-intent updated.intent.yaml
```

This emits patch operations only; generated-file diffs remain available through plain `intentstack diff`.
