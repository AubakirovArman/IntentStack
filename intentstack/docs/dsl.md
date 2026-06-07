# DSL

The source of truth is `intent/app.intent.yaml`.

Top-level sections:

- `version`
- `project`
- `theme`
- `entities`
- `actions`
- `pages`
- optional reserved extension sections such as `api`

Supported field types:

- `string`
- `text`
- `number`
- `boolean`
- `enum`
- `datetime`

Supported components are target capabilities. Use `intentstack list_capabilities --target web_ts_minimal` to inspect the authoritative list.

Agents should prefer patch files over rewriting the full intent. Patch operations are semantic commands such as `section.add`, `entity.field.add`, `form.bind_submit`, and `table.column.remove`.
