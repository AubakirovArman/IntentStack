pub fn validate_document(document: &IntentDocument) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    validate_version(document, &mut diagnostics);
    validate_project(document, &mut diagnostics);
    validate_entities(document, &mut diagnostics);
    validate_actions(document, &mut diagnostics);
    validate_pages(document, &mut diagnostics);
    validate_integrations(document, &mut diagnostics);
    validate_workflows(document, &mut diagnostics);
    validate_dashboard_auth(document, &mut diagnostics);
    diagnostics
}

fn validate_version(document: &IntentDocument, diagnostics: &mut Vec<Diagnostic>) {
    let Some(version) = version_string(document) else {
        diagnostics.push(Diagnostic::error(
            "E0001",
            "version",
            "intent version is required",
        ));
        return;
    };
    if !SUPPORTED_DSL_VERSIONS.contains(&version.as_str()) {
        diagnostics.push(
            Diagnostic::error(
                "E0002",
                "version",
                format!(
                    "unsupported DSL version {version}; supported versions: {}",
                    SUPPORTED_DSL_VERSIONS.join(", ")
                ),
            )
            .with_suggestion("Set version: 0.1 or run intentstack migrate when available."),
        );
    }
}

fn validate_project(document: &IntentDocument, diagnostics: &mut Vec<Diagnostic>) {
    let Some(project) = &document.project else {
        diagnostics.push(Diagnostic::error("E2001", "project", "project is required"));
        return;
    };
    if project.id.trim().is_empty() {
        diagnostics.push(Diagnostic::error(
            "E2002",
            "project.id",
            "project.id is required",
        ));
    }
    if project.target.trim().is_empty() {
        diagnostics.push(Diagnostic::error(
            "E2003",
            "project.target",
            "project.target is required",
        ));
    } else if !SUPPORTED_TARGETS.contains(&project.target.as_str()) {
        diagnostics.push(
            Diagnostic::error(
                "E4001",
                "project.target",
                format!("unknown target {}", project.target),
            )
            .with_suggestion(format!("Use one of: {}", SUPPORTED_TARGETS.join(", "))),
        );
    }
}

fn validate_entities(document: &IntentDocument, diagnostics: &mut Vec<Diagnostic>) {
    let mut entity_ids = HashSet::new();
    for (entity_index, entity) in document.entities.iter().enumerate() {
        let path = format!("entities[{entity_index}]");
        if entity.id.trim().is_empty() {
            diagnostics.push(Diagnostic::error("E3001", path, "entity.id is required"));
            continue;
        }
        if !entity_ids.insert(entity.id.as_str()) {
            diagnostics.push(Diagnostic::error(
                "E3002",
                format!("entities[{entity_index}].id"),
                format!("duplicate entity id {}", entity.id),
            ));
        }
        let mut field_ids = HashSet::new();
        for (field_index, field) in entity.fields.iter().enumerate() {
            let field_path = format!("entities[{entity_index}].fields[{field_index}]");
            if field.id.trim().is_empty() {
                diagnostics.push(Diagnostic::error(
                    "E3003",
                    field_path,
                    "field.id is required",
                ));
                continue;
            }
            if !field_ids.insert(field.id.as_str()) {
                diagnostics.push(Diagnostic::error(
                    "E3004",
                    format!("entities[{entity_index}].fields[{field_index}].id"),
                    format!("duplicate field id {} on entity {}", field.id, entity.id),
                ));
            }
            if field.field_type.trim().is_empty() {
                diagnostics.push(Diagnostic::error(
                    "E3005",
                    format!("entities[{entity_index}].fields[{field_index}].type"),
                    format!("field {} on entity {} needs a type", field.id, entity.id),
                ));
            } else if !SUPPORTED_FIELD_TYPES.contains(&field.field_type.as_str()) {
                diagnostics.push(
                    Diagnostic::error(
                        "E4002",
                        format!("entities[{entity_index}].fields[{field_index}].type"),
                        format!("unsupported field type {}", field.field_type),
                    )
                    .with_suggestion(format!("Use one of: {}", SUPPORTED_FIELD_TYPES.join(", "))),
                );
            }
        }
    }
}
