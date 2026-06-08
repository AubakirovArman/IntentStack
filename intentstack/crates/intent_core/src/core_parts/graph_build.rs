pub fn build_graph(document: &IntentDocument) -> AppGraph {
    let entity_by_id = entity_index(document);
    let action_by_id = action_index(document);
    let integration_by_id = integration_index(document);
    let symbols = build_symbols(document);
    let symbol_table = symbols.values().cloned().collect::<Vec<_>>();
    AppGraph {
        version: version_string(document).unwrap_or_else(|| "0.1".to_string()),
        project: document.project.clone().unwrap_or_default(),
        navigation: document.navigation.clone(),
        auth: document.auth.clone(),
        tenancy: document.tenancy.clone(),
        entities: document.entities.clone(),
        actions: document.actions.clone(),
        pages: document.pages.clone(),
        workflows: document.workflows.clone(),
        integrations: document.integrations.clone(),
        symbols,
        symbol_table,
        types: build_types(document, &entity_by_id),
        resolved: build_resolved(document, &entity_by_id, &action_by_id, &integration_by_id),
        bindings: build_bindings(document),
        passes: Vec::new(),
    }
}

fn build_symbols(document: &IntentDocument) -> BTreeMap<String, Symbol> {
    let mut symbols = BTreeMap::new();
    let mut insert = |symbol: Symbol| {
        symbols.insert(symbol.ref_path.clone(), symbol);
    };
    for entity in &document.entities {
        insert(Symbol::new(
            format!("Entity.{}", entity.id),
            "entity",
            &entity.id,
        ));
        for field in &entity.fields {
            let mut attrs = BTreeMap::new();
            attrs.insert("type".to_string(), field.field_type.clone());
            attrs.insert(
                "required".to_string(),
                (field.required == Some(true)).to_string(),
            );
            insert(Symbol {
                ref_path: format!("Entity.{}.field.{}", entity.id, field.id),
                kind: "field".to_string(),
                id: field.id.clone(),
                owner: Some(format!("Entity.{}", entity.id)),
                attrs,
            });
        }
    }
    for action in &document.actions {
        let mut attrs = BTreeMap::new();
        attrs.insert("type".to_string(), action.action_type.clone());
        if let Some(entity) = &action.entity {
            attrs.insert("entity".to_string(), entity.clone());
        }
        insert(Symbol {
            ref_path: format!("Action.{}", action.id),
            kind: "action".to_string(),
            id: action.id.clone(),
            owner: None,
            attrs,
        });
    }
    for page in &document.pages {
        let mut attrs = BTreeMap::new();
        attrs.insert("path".to_string(), page.path.clone());
        insert(Symbol {
            ref_path: format!("Page.{}", page.id),
            kind: "page".to_string(),
            id: page.id.clone(),
            owner: None,
            attrs,
        });
        for section in &page.sections {
            let mut attrs = BTreeMap::new();
            attrs.insert("type".to_string(), section.section_type.clone());
            insert(Symbol {
                ref_path: section_ref(&page.id, &section.id),
                kind: "section".to_string(),
                id: section.id.clone(),
                owner: Some(format!("Page.{}", page.id)),
                attrs,
            });
        }
    }
    for workflow in &document.workflows {
        insert(Symbol::new(
            format!("Workflow.{}", workflow.id),
            "workflow",
            &workflow.id,
        ));
    }
    for integration in &document.integrations {
        let mut attrs = BTreeMap::new();
        attrs.insert("type".to_string(), integration.integration_type.clone());
        insert(Symbol {
            ref_path: format!("Integration.{}", integration.id),
            kind: "integration".to_string(),
            id: integration.id.clone(),
            owner: None,
            attrs,
        });
    }
    symbols
}

impl Symbol {
    fn new(ref_path: String, kind: &str, id: &str) -> Self {
        Self {
            ref_path,
            kind: kind.to_string(),
            id: id.to_string(),
            owner: None,
            attrs: BTreeMap::new(),
        }
    }
}

fn build_types(document: &IntentDocument, entity_by_id: &HashMap<&str, &Entity>) -> TypeSystem {
    let mut types = TypeSystem::default();
    for entity in &document.entities {
        let mut fields = BTreeMap::new();
        for field in &entity.fields {
            fields.insert(
                field.id.clone(),
                FieldType {
                    kind: field.field_type.clone(),
                    required: field.required == Some(true),
                    values: field.values.clone(),
                    default: field.default.clone(),
                },
            );
        }
        types.entities.insert(
            entity.id.clone(),
            EntityType {
                table: entity
                    .table
                    .clone()
                    .unwrap_or_else(|| entity.id.to_lowercase()),
                fields,
            },
        );
    }
    for action in &document.actions {
        types.actions.insert(
            action.id.clone(),
            ActionType {
                action_type: action.action_type.clone(),
                entity_ref: action
                    .entity
                    .as_ref()
                    .map(|entity| format!("Entity.{entity}")),
                input: action_input_type(action),
                output: action_output_type(action),
            },
        );
    }
    for page in &document.pages {
        for section in &page.sections {
            let entity = section
                .entity
                .as_deref()
                .and_then(|entity_id| entity_by_id.get(entity_id).copied());
            let fields = resolve_fields(entity, section_field_refs(section))
                .into_iter()
                .map(|field| (field.id.clone(), field))
                .collect::<BTreeMap<_, _>>();
            types.sections.insert(
                section_ref(&page.id, &section.id),
                SectionType {
                    section_type: section.section_type.clone(),
                    entity_ref: section
                        .entity
                        .as_ref()
                        .map(|entity| format!("Entity.{entity}")),
                    fields,
                },
            );
        }
    }
    types
}
