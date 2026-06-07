# IntentStack - Agent Rules

You are working in an IntentStack project. The application is defined by intent, not by
hand-written framework code. Edit the intent and let the compiler own generated code.

## Main Rule

Modify application behavior through `intent/app.intent.yaml`, included intent modules, or a
patch file. Modular intent is the baseline. The root intent should stay thin and behavior should
live in owner modules under:

- `intent/shared/`
- `intent/backend/`
- `intent/frontend/`

Do not directly edit files under:

- `src/generated/`
- `server/generated/`
- `migrations/`

These are regenerated on every `intentstack build`. Hand-written code belongs in
`src/custom/` and `server/custom/`.

## Workflow

1. Read `intent/app.intent.yaml`.
2. Find the owner module for the requested page, section, entity, action, navigation, theme, or
   auth change.
3. Make the smallest semantic change that satisfies the request.
4. Run `intentstack check`.
5. Run `intentstack build`; it normalizes, emits, formats, and runs generated `npm run build` when dependencies are installed.
6. Run generated `npm run typecheck` as an extra gate when the change affects TypeScript contracts.

## Diagnostics

Errors are machine-readable with `--json`:

```json
{ "code": "...", "severity": "...", "message": "...", "path": "...", "file": "...", "suggestion": "...", "fix_hint": {} }
```

Prefer applying `fix_hint` over guessing. In modular projects, use `file` to locate the owner
module. Codes: `E1xxx` parse, `E2xxx` schema, `E3xxx` semantic refs, `E4xxx` target capability,
`Wxxxx` warnings.

## Capabilities

Target `web_ts_minimal` supports:

- components: `navbar`, `hero`, `card_grid`, `stats`, `pricing_cards`, `content`, `form`, `table`, `record_detail`, `footer`, `custom_component`
- content blocks: `heading`, `paragraph`, `list`, `code`, `link`, `callout`, `table`, `example`
- actions: `create_record`, `list_records`, `get_record`, `update_record`, `delete_record`
- field types: `string`, `text`, `number`, `boolean`, `enum`, `datetime`
- shared layout: top-level `navigation`; set `page.navigation: false` to opt out

Do not invent components, actions, field types, or content block types outside capabilities. If a
new primitive is needed, that is a target-adapter/compiler change, not an intent-only change.

## Preferred Edits

Good: add one `card_grid` section after `features`; add field `email` to `Lead`; update one
content block in `frontend/sections/docs/content.section.yaml`.

Bad: rewrite the whole root intent for a one-line text change; flatten a modular app into one
root YAML without being explicitly asked.

For new page sections in modular projects, prefer `section.module.add` over `section.add`. It
creates the section owner file and keeps the page module as an ordered list of `ref`s.
When a section should only appear inside a docs `example` block, keep its page `ref` but set
`embed_only: true` on the section module.
Use `content.example.add` to insert the docs block that pairs that live preview with patch code.

## Patches

```bash
intentstack apply <patch.yaml> --project .            # dry run
intentstack apply <patch.yaml> --project . --write    # persist
intentstack new <dir>                                 # creates modular intent by default
intentstack new <dir> --single-file                   # legacy monolith only
intentstack split --project . --write                 # split monolith into modules
intentstack graph --project . --html graph.html       # inspect graph and module owners
```

A patch file is `{ version, patch: [ { op, ... }, ... ] }`. `apply` validates the result and
refuses to write on errors. For modular projects, `apply --write` preserves module structure and
writes existing objects back to owner files. Use `--out-intent <file>` only when intentionally
exporting one assembled intent file.

Use `intentstack list_capabilities --json` for the current complete patch op list.
