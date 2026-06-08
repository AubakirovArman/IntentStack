fn validate_actions(document: &IntentDocument, diagnostics: &mut Vec<Diagnostic>) {
    let entities = document
        .entities
        .iter()
        .map(|entity| entity.id.as_str())
        .collect::<HashSet<_>>();
    let mut action_ids = HashSet::new();
    for (action_index, action) in document.actions.iter().enumerate() {
        if action.id.trim().is_empty() {
            diagnostics.push(Diagnostic::error(
                "E3101",
                format!("actions[{action_index}]"),
                "action.id is required",
            ));
            continue;
        }
        if !action_ids.insert(action.id.as_str()) {
            diagnostics.push(Diagnostic::error(
                "E3102",
                format!("actions[{action_index}].id"),
                format!("duplicate action id {}", action.id),
            ));
        }
        if !SUPPORTED_ACTION_TYPES.contains(&action.action_type.as_str()) {
            diagnostics.push(
                Diagnostic::error(
                    "E4003",
                    format!("actions[{action_index}].type"),
                    format!("unsupported action type {}", action.action_type),
                )
                .with_suggestion(format!("Use one of: {}", SUPPORTED_ACTION_TYPES.join(", "))),
            );
        }
        if ENTITY_ACTION_TYPES.contains(&action.action_type.as_str()) {
            match action.entity.as_deref() {
                Some(entity_id) if entities.contains(entity_id) => {}
                Some(entity_id) => diagnostics.push(Diagnostic::error(
                    "E3201",
                    format!("actions[{action_index}].entity"),
                    format!(
                        "action {} references unknown entity {}",
                        action.id, entity_id
                    ),
                )),
                None => diagnostics.push(Diagnostic::error(
                    "E3202",
                    format!("actions[{action_index}].entity"),
                    format!("action {} requires an entity", action.id),
                )),
            }
        }
    }
}

fn validate_pages(document: &IntentDocument, diagnostics: &mut Vec<Diagnostic>) {
    let entities = entity_index(document);
    let actions = action_index(document);
    if document.pages.is_empty() {
        diagnostics.push(Diagnostic::error(
            "E3300",
            "pages",
            "at least one page is required",
        ));
    }
    let mut page_ids = HashSet::new();
    for (page_index, page) in document.pages.iter().enumerate() {
        if page.id.trim().is_empty() {
            diagnostics.push(Diagnostic::error(
                "E3301",
                format!("pages[{page_index}]"),
                "page.id is required",
            ));
            continue;
        }
        if !page_ids.insert(page.id.as_str()) {
            diagnostics.push(Diagnostic::error(
                "E3302",
                format!("pages[{page_index}].id"),
                format!("duplicate page id {}", page.id),
            ));
        }
        if page.path.trim().is_empty() {
            diagnostics.push(Diagnostic::error(
                "E3303",
                format!("pages[{page_index}].path"),
                format!("page {} needs a path", page.id),
            ));
        }
        let mut section_ids = HashSet::new();
        for (section_index, section) in page.sections.iter().enumerate() {
            let base = format!("pages[{page_index}].sections[{section_index}]");
            if section.id.trim().is_empty() {
                diagnostics.push(Diagnostic::error("E3401", base, "section.id is required"));
                continue;
            }
            if !section_ids.insert(section.id.as_str()) {
                diagnostics.push(Diagnostic::error(
                    "E3402",
                    format!("pages[{page_index}].sections[{section_index}].id"),
                    format!("duplicate section id {} on page {}", section.id, page.id),
                ));
            }
            if !SUPPORTED_SECTION_TYPES.contains(&section.section_type.as_str()) {
                diagnostics.push(
                    Diagnostic::error(
                        "E4004",
                        format!("pages[{page_index}].sections[{section_index}].type"),
                        format!("unsupported section type {}", section.section_type),
                    )
                    .with_suggestion(format!(
                        "Use one of: {}",
                        SUPPORTED_SECTION_TYPES.join(", ")
                    )),
                );
            }
            if let Some(entity_id) = section.entity.as_deref() {
                match entities.get(entity_id) {
                    Some(entity) => validate_section_fields(
                        page_index,
                        section_index,
                        section,
                        entity,
                        diagnostics,
                    ),
                    None => diagnostics.push(Diagnostic::error(
                        "E3501",
                        format!("pages[{page_index}].sections[{section_index}].entity"),
                        format!(
                            "section {} references unknown entity {}",
                            section.id, entity_id
                        ),
                    )),
                }
            }
            validate_section_action(
                "submit",
                section.submit.as_ref(),
                page_index,
                section_index,
                &actions,
                diagnostics,
            );
            validate_section_action(
                "source",
                section.source.as_ref(),
                page_index,
                section_index,
                &actions,
                diagnostics,
            );
        }
    }
}
