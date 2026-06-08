fn validate_section_fields(
    page_index: usize,
    section_index: usize,
    section: &Section,
    entity: &Entity,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let field_ids = entity
        .fields
        .iter()
        .map(|field| field.id.as_str())
        .collect::<HashSet<_>>();
    let refs = section_field_refs(section);
    for (ref_index, field_ref) in refs.iter().enumerate() {
        let Some(field_id) = field_ref.id() else {
            diagnostics.push(Diagnostic::error(
                "E3502",
                format!("pages[{page_index}].sections[{section_index}].fields[{ref_index}]"),
                format!("section {} has a field reference without id", section.id),
            ));
            continue;
        };
        if !field_ids.contains(field_id) {
            diagnostics.push(Diagnostic::error(
                "E3503",
                format!("pages[{page_index}].sections[{section_index}].fields[{ref_index}]"),
                format!(
                    "section {} references unknown field {} on entity {}",
                    section.id, field_id, entity.id
                ),
            ));
        }
    }
}

fn validate_section_action(
    binding_name: &str,
    binding: Option<&ActionBinding>,
    page_index: usize,
    section_index: usize,
    actions: &HashMap<&str, &Action>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let Some(binding) = binding else { return };
    if binding.action.trim().is_empty() {
        diagnostics.push(Diagnostic::error(
            "E3601",
            format!("pages[{page_index}].sections[{section_index}].{binding_name}.action"),
            format!("{binding_name}.action is required"),
        ));
    } else if !actions.contains_key(binding.action.as_str()) {
        diagnostics.push(Diagnostic::error(
            "E3602",
            format!("pages[{page_index}].sections[{section_index}].{binding_name}.action"),
            format!(
                "{binding_name} references unknown action {}",
                binding.action
            ),
        ));
    }
}

fn validate_integrations(document: &IntentDocument, diagnostics: &mut Vec<Diagnostic>) {
    let mut integration_ids = HashSet::new();
    for (index, integration) in document.integrations.iter().enumerate() {
        if integration.id.trim().is_empty() {
            diagnostics.push(Diagnostic::error(
                "E3701",
                format!("integrations[{index}]"),
                "integration.id is required",
            ));
            continue;
        }
        if !integration_ids.insert(integration.id.as_str()) {
            diagnostics.push(Diagnostic::error(
                "E3702",
                format!("integrations[{index}].id"),
                format!("duplicate integration id {}", integration.id),
            ));
        }
    }
}

fn validate_workflows(document: &IntentDocument, diagnostics: &mut Vec<Diagnostic>) {
    let actions = action_index(document);
    let integrations = document
        .integrations
        .iter()
        .map(|integration| integration.id.as_str())
        .collect::<HashSet<_>>();
    let mut workflow_ids = HashSet::new();
    for (workflow_index, workflow) in document.workflows.iter().enumerate() {
        if workflow.id.trim().is_empty() {
            diagnostics.push(Diagnostic::error(
                "E3801",
                format!("workflows[{workflow_index}]"),
                "workflow.id is required",
            ));
            continue;
        }
        if !workflow_ids.insert(workflow.id.as_str()) {
            diagnostics.push(Diagnostic::error(
                "E3802",
                format!("workflows[{workflow_index}].id"),
                format!("duplicate workflow id {}", workflow.id),
            ));
        }
        match workflow
            .trigger
            .as_ref()
            .map(|trigger| trigger.action.as_str())
        {
            Some(action_id) if actions.contains_key(action_id) => {}
            Some(action_id) if !action_id.trim().is_empty() => diagnostics.push(Diagnostic::error(
                "E3803",
                format!("workflows[{workflow_index}].trigger.action"),
                format!(
                    "workflow {} references unknown trigger action {}",
                    workflow.id, action_id
                ),
            )),
            _ => diagnostics.push(Diagnostic::error(
                "E3804",
                format!("workflows[{workflow_index}].trigger.action"),
                format!("workflow {} needs trigger.action", workflow.id),
            )),
        }
        for (step_index, step) in workflow.steps.iter().enumerate() {
            if let Some(integration_id) = step.integration.as_deref() {
                if !integrations.contains(integration_id) {
                    diagnostics.push(Diagnostic::error(
                        "E3805",
                        format!("workflows[{workflow_index}].steps[{step_index}].integration"),
                        format!(
                            "workflow {} references unknown integration {}",
                            workflow.id, integration_id
                        ),
                    ));
                }
            }
        }
    }
}

fn validate_dashboard_auth(document: &IntentDocument, diagnostics: &mut Vec<Diagnostic>) {
    for page in &document.pages {
        if page.path.starts_with("/dashboard") && page.auth.is_none() && document.auth.is_none() {
            diagnostics.push(Diagnostic::warning(
                "W2001",
                format!("pages.{}", page.id),
                format!(
                    "dashboard page {} is public; add auth before production",
                    page.path
                ),
            ));
        }
    }
}
