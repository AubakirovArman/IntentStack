fn page_for_web_path<'a>(graph: &'a AppGraph, path: &str) -> Option<&'a Page> {
    let stem = path_basename(path).trim_end_matches("Page.tsx").to_string();
    graph.pages.iter().find(|page| pascal(&page.id) == stem)
}

fn page_for_next_path<'a>(graph: &'a AppGraph, path: &str) -> Option<&'a Page> {
    graph.pages.iter().find(|page| next_page_file(page) == path)
}

fn section_for_component_path<'a>(graph: &'a AppGraph, path: &str) -> Option<&'a Section> {
    let stem = path_basename(path).trim_end_matches(".tsx").to_string();
    graph
        .pages
        .iter()
        .flat_map(|page| page.sections.iter())
        .find(|section| pascal(&section.id) == stem)
}

fn resolved_section_fields(section: &Section, graph: &AppGraph) -> Vec<Field> {
    let entity = section
        .entity
        .as_deref()
        .and_then(|id| graph.entities.iter().find(|entity| entity.id == id));
    let Some(entity) = entity else {
        return Vec::new();
    };
    let refs = section_field_refs(section);
    if refs.is_empty() {
        return entity.fields.clone();
    }
    refs.iter()
        .filter_map(|field_ref| {
            let id = field_ref.id()?;
            entity.fields.iter().find(|field| field.id == id).cloned()
        })
        .collect()
}

fn section_prop(section: &Section, key: &str) -> Option<String> {
    section.props.get(key).and_then(value_string)
}

fn value_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        Value::Bool(value) => Some(value.to_string()),
        _ => None,
    }
}

fn prop_items(section: &Section) -> Vec<BTreeMap<String, Value>> {
    section
        .props
        .get("items")
        .and_then(Value::as_sequence)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_mapping())
                .map(|mapping| {
                    mapping
                        .iter()
                        .filter_map(|(key, value)| {
                            key.as_str().map(|key| (key.to_string(), value.clone()))
                        })
                        .collect::<BTreeMap<_, _>>()
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn item_string(item: &BTreeMap<String, Value>, key: &str, fallback: &str) -> String {
    item.get(key)
        .and_then(value_string)
        .unwrap_or_else(|| fallback.to_string())
}

fn optional_heading(section: &Section) -> String {
    section_prop(section, "title")
        .map(|title| format!("<h2>{}</h2>", jsx_text(&title)))
        .unwrap_or_default()
}

fn field_label(field: &Field) -> String {
    field.label.clone().unwrap_or_else(|| field.id.clone())
}

fn sample_field_value(field: &Field) -> String {
    match field.field_type.as_str() {
        "number" => "42".to_string(),
        "boolean" => "true".to_string(),
        "datetime" => "2026-01-01".to_string(),
        _ => format!("Sample {}", field_label(field)),
    }
}

fn sql_type(field_type: &str) -> &'static str {
    match field_type {
        "number" => "real",
        "boolean" => "integer",
        "datetime" => "integer",
        _ => "text",
    }
}

fn path_basename(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn js_str(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn jsx_text(value: &str) -> String {
    format!("{{{}}}", js_str(value))
}

fn snakeish(value: &str) -> String {
    let mut out = String::new();
    let mut prev_lower = false;
    for ch in value.chars() {
        if ch.is_ascii_uppercase() {
            if prev_lower {
                out.push('_');
            }
            out.push(ch.to_ascii_lowercase());
            prev_lower = false;
        } else if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_lower = true;
        } else if !out.ends_with('_') {
            out.push('_');
            prev_lower = false;
        }
    }
    out.trim_matches('_').to_string()
}

fn entity_action_types(graph: &AppGraph) -> BTreeMap<String, BTreeSet<String>> {
    let mut out = BTreeMap::new();
    for action in &graph.actions {
        if ENTITY_ACTION_TYPES.contains(&action.action_type.as_str()) {
            if let Some(entity) = &action.entity {
                out.entry(entity.clone())
                    .or_insert_with(BTreeSet::new)
                    .insert(action.action_type.clone());
            }
        }
    }
    out
}

fn has_auth(graph: &AppGraph) -> bool {
    graph.auth.is_some()
        || graph.pages.iter().any(|page| page.auth.is_some())
        || graph.actions.iter().any(|action| action.auth.is_some())
}

fn has_global_navigation(graph: &AppGraph) -> bool {
    graph
        .navigation
        .as_ref()
        .map(|navigation| navigation.enabled != Some(false))
        .unwrap_or(false)
        && graph
            .pages
            .iter()
            .any(|page| page.navigation != Some(false))
}

fn next_page_file(page: &Page) -> String {
    if page.path == "/" || page.path.trim().is_empty() {
        return "app/page.tsx".to_string();
    }
    let route = page
        .path
        .trim_matches('/')
        .split('/')
        .filter(|part| !part.is_empty())
        .map(|part| {
            if let Some(param) = part.strip_prefix(':') {
                format!("[{param}]")
            } else {
                part.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("/");
    format!("app/{route}/page.tsx")
}

fn managed_zone(target: &str, path: &str) -> String {
    if target == "next_shadcn" {
        for zone in ["app", "components", "lib", "migrations"] {
            if path == zone || path.starts_with(&format!("{zone}/")) {
                return zone.to_string();
            }
        }
    }
    for zone in ["src/generated", "server/generated", "migrations"] {
        if path == zone || path.starts_with(&format!("{zone}/")) {
            return zone.to_string();
        }
    }
    "project".to_string()
}

fn file_kind(path: &str) -> &str {
    if path.contains("/api/") || path.contains("/routes/") {
        "api_route"
    } else if path.contains("/db/") || path.starts_with("migrations/") {
        "database"
    } else if path.contains("/ui/") {
        "ui_primitive"
    } else if path.ends_with("middleware.ts") {
        "middleware"
    } else if path.ends_with(".tsx") {
        "frontend"
    } else {
        "project"
    }
}

fn pascal(value: &str) -> String {
    let mut out = String::new();
    let mut upper = true;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            if upper {
                out.push(ch.to_ascii_uppercase());
                upper = false;
            } else {
                out.push(ch);
            }
        } else {
            upper = true;
        }
    }
    if out.is_empty() {
        "Generated".to_string()
    } else {
        out
    }
}
