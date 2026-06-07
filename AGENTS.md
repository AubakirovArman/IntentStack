# IntentStack — Agent Rules

You are working in an IntentStack project. The application is defined by **intent**, not by
hand-written framework code. Your job is to edit the intent and let the compiler own the code.

## Main rule

Modify application behaviour through `intent/app.intent.yaml` (or a patch file).
Do **not** directly edit files under:

- `src/generated/`
- `server/generated/`
- `migrations/`

These are regenerated on every `intentstack build` and your edits will be lost.
Hand-written code belongs in `src/custom/` and `server/custom/` (never overwritten).

## Workflow (small, safe steps)

1. Read the current `intent/app.intent.yaml`.
2. Make the smallest change that satisfies the request (one section / entity / action).
3. Run `intentstack check` — fix any `E####` diagnostics. Each error carries a
   `suggestion` and often a `fix_hint` you can apply directly.
4. Run `intentstack build`.
5. Run `npm run typecheck` (or `npm run build`) in the generated app.

## Diagnostics contract

Errors are machine-readable (`--json`): `{ code, severity, message, path, suggestion, fix_hint }`.
Prefer applying `fix_hint` over guessing. Codes: `E1xxx` parse · `E2xxx` schema ·
`E3xxx` semantic refs · `E4xxx` target capability · `Wxxxx` warnings (non-blocking).

## Capabilities (target: web_ts_minimal)

- components: `navbar`, `hero`, `card_grid`, `stats`, `pricing_cards`, `content`, `form`, `table`, `record_detail`, `footer`, `custom_component`
- actions: `create_record`, `list_records`, `get_record`, `update_record`, `delete_record`
- field types: `string`, `text`, `number`, `boolean`, `enum`, `datetime`
- shared layout: top-level `navigation` can define one generated nav reused across pages; set `page.navigation: false` to opt out.

Do not invent components or actions outside this list — the validator will reject them
before any code is written. If you need something new, that is a target-adapter change,
not an intent change.

## Prefer

Good: "add one `card_grid` section after `features`" · "add field `email` to `Lead`".
Bad: rewriting the whole intent for a one-line text change.

## Applying patches (preferred over editing the intent by hand)

```bash
intentstack apply <patch.yaml> --project .            # dry run: prints the semantic diff
intentstack apply <patch.yaml> --project . --write    # persist back to the project intent
```

A patch file is `{ version, patch: [ { op, ... }, ... ] }`. `apply` validates the *result*
and refuses to write on any error. Diagnostic `fix_hint`s are themselves valid ops
(e.g. `form.bind_entity`, `action.update`) — apply them directly.

Use `intentstack list_capabilities --json` for the current complete patch op list.
