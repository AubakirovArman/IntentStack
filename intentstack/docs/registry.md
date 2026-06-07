# Registry

The registry defines what the DSL can legally ask the target adapter to emit.

Files:

- `registry/components/*.yaml`
- `registry/targets/*.yaml`
- `registry/modules.yaml`

The in-code registry in `src/registry.js` is currently authoritative for the compiler. Tests verify that registry files match target capabilities.

Current component set:

- `navbar`
- `hero`
- `card_grid`
- `pricing_cards`
- `stats`
- `form`
- `table`
- `footer`
- `custom_component`

Current record actions:

- `create_record`
- `list_records`
- `get_record`
- `update_record`
- `delete_record`

Domain module metadata is exposed through `intentstack list_capabilities --json`.
