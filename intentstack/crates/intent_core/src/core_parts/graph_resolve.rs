fn build_resolved(
    document: &IntentDocument,
    entity_by_id: &HashMap<&str, &Entity>,
    action_by_id: &HashMap<&str, &Action>,
    integration_by_id: &HashMap<&str, &Integration>,
) -> ResolvedRefs {
    let mut resolved = ResolvedRefs::default();
    for action in &document.actions {
        resolved.actions.insert(
            action.id.clone(),
            ResolvedAction {
                entity_ref: action
                    .entity
                    .as_deref()
                    .filter(|entity_id| entity_by_id.contains_key(*entity_id))
                    .map(|entity_id| format!("Entity.{entity_id}")),
            },
        );
    }
    for page in &document.pages {
        for section in &page.sections {
            let entity = section
                .entity
                .as_deref()
                .and_then(|entity_id| entity_by_id.get(entity_id).copied());
            resolved.sections.insert(
                section_ref(&page.id, &section.id),
                ResolvedSection {
                    entity_ref: entity.map(|entity| format!("Entity.{}", entity.id)),
                    submit_action_ref: section
                        .submit
                        .as_ref()
                        .and_then(|binding| action_by_id.get(binding.action.as_str()))
                        .map(|action| format!("Action.{}", action.id)),
                    source_action_ref: section
                        .source
                        .as_ref()
                        .and_then(|binding| action_by_id.get(binding.action.as_str()))
                        .map(|action| format!("Action.{}", action.id)),
                    fields: resolve_fields(entity, section_field_refs(section)),
                },
            );
        }
    }
    for workflow in &document.workflows {
        resolved.workflows.insert(
            workflow.id.clone(),
            ResolvedWorkflow {
                trigger_action_ref: workflow
                    .trigger
                    .as_ref()
                    .and_then(|trigger| action_by_id.get(trigger.action.as_str()))
                    .map(|action| format!("Action.{}", action.id)),
                integration_refs: workflow
                    .steps
                    .iter()
                    .filter_map(|step| step.integration.as_deref())
                    .filter(|integration_id| integration_by_id.contains_key(*integration_id))
                    .map(|integration_id| format!("Integration.{integration_id}"))
                    .collect(),
            },
        );
    }
    resolved
}

fn build_bindings(document: &IntentDocument) -> Vec<BindingNode> {
    let mut bindings = Vec::new();
    for action in &document.actions {
        if let Some(entity) = &action.entity {
            bindings.push(BindingNode {
                kind: "action.entity".to_string(),
                from: format!("Action.{}", action.id),
                to: format!("Entity.{entity}"),
            });
        }
    }
    for page in &document.pages {
        for section in &page.sections {
            let from = section_ref(&page.id, &section.id);
            if let Some(entity) = &section.entity {
                bindings.push(BindingNode {
                    kind: "section.entity".to_string(),
                    from: from.clone(),
                    to: format!("Entity.{entity}"),
                });
            }
            if let Some(submit) = &section.submit {
                if !submit.action.is_empty() {
                    bindings.push(BindingNode {
                        kind: "form.submit".to_string(),
                        from: from.clone(),
                        to: format!("Action.{}", submit.action),
                    });
                }
            }
            if let Some(source) = &section.source {
                if !source.action.is_empty() {
                    bindings.push(BindingNode {
                        kind: format!("{}.source", section.section_type),
                        from: from.clone(),
                        to: format!("Action.{}", source.action),
                    });
                }
            }
        }
    }
    for workflow in &document.workflows {
        if let Some(trigger) = &workflow.trigger {
            if !trigger.action.is_empty() {
                bindings.push(BindingNode {
                    kind: "workflow.trigger".to_string(),
                    from: format!("Workflow.{}", workflow.id),
                    to: format!("Action.{}", trigger.action),
                });
            }
        }
        for step in &workflow.steps {
            if let Some(integration) = &step.integration {
                bindings.push(BindingNode {
                    kind: "workflow.integration".to_string(),
                    from: format!("Workflow.{}", workflow.id),
                    to: format!("Integration.{integration}"),
                });
            }
        }
    }
    bindings
}

fn resolve_fields(entity: Option<&Entity>, refs: &[FieldUse]) -> Vec<ResolvedField> {
    let Some(entity) = entity else {
        return Vec::new();
    };
    let fields = entity
        .fields
        .iter()
        .map(|field| (field.id.as_str(), field))
        .collect::<HashMap<_, _>>();
    refs.iter()
        .filter_map(|field_ref| {
            let id = field_ref.id()?;
            let field = fields.get(id)?;
            Some(ResolvedField {
                id: id.to_string(),
                ref_path: field_ref
                    .normalized_ref(&entity.id)
                    .unwrap_or_else(|| format!("Entity.{}.field.{id}", entity.id)),
                field_type: field.field_type.clone(),
                required: field.required == Some(true),
            })
        })
        .collect()
}

fn action_input_type(action: &Action) -> Option<String> {
    let entity = action.entity.as_ref()?;
    match action.action_type.as_str() {
        "create_record" | "update_record" => Some(format!("Entity.{entity}.input")),
        _ => None,
    }
}

fn action_output_type(action: &Action) -> Option<String> {
    let entity = action.entity.as_ref()?;
    match action.action_type.as_str() {
        "list_records" => Some(format!("Array<Entity.{entity}>")),
        "subscribe_records" => Some(format!("Stream<Array<Entity.{entity}>>")),
        "create_record" | "get_record" | "update_record" => Some(format!("Entity.{entity}")),
        "delete_record" => Some("{ ok: boolean }".to_string()),
        _ => None,
    }
}

fn optimize_bindings(bindings: &mut Vec<BindingNode>) -> usize {
    let before = bindings.len();
    let mut seen = BTreeSet::new();
    bindings.retain(|binding| {
        seen.insert((
            binding.kind.clone(),
            binding.from.clone(),
            binding.to.clone(),
        ))
    });
    before.saturating_sub(bindings.len())
}

fn count_normalized_field_refs(document: &IntentDocument) -> usize {
    document
        .pages
        .iter()
        .flat_map(|page| page.sections.iter())
        .map(|section| section_field_refs(section).len())
        .sum()
}

fn section_field_refs(section: &Section) -> &[FieldUse] {
    match section.section_type.as_str() {
        "form" | "record_detail" => section.fields.as_slice(),
        "table" => section.columns.refs(),
        _ => &[],
    }
}

fn version_string(document: &IntentDocument) -> Option<String> {
    match document.version.as_ref()? {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        value => serde_yaml::to_string(value)
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
    }
}

fn section_ref(page_id: &str, section_id: &str) -> String {
    format!("Page.{page_id}.section.{section_id}")
}

fn entity_index(document: &IntentDocument) -> HashMap<&str, &Entity> {
    document
        .entities
        .iter()
        .map(|entity| (entity.id.as_str(), entity))
        .collect()
}

fn action_index(document: &IntentDocument) -> HashMap<&str, &Action> {
    document
        .actions
        .iter()
        .map(|action| (action.id.as_str(), action))
        .collect()
}

fn integration_index(document: &IntentDocument) -> HashMap<&str, &Integration> {
    document
        .integrations
        .iter()
        .map(|integration| (integration.id.as_str(), integration))
        .collect()
}
