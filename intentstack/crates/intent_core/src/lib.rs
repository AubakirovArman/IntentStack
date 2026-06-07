use serde::{Deserialize, Serialize};
use serde_yaml::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::Path;

pub const CORE_VERSION: &str = "0.1.0";
pub const SUPPORTED_DSL_VERSIONS: &[&str] = &["0.1"];
pub const SUPPORTED_TARGETS: &[&str] = &["web_ts_minimal", "next_shadcn"];
pub const SUPPORTED_FIELD_TYPES: &[&str] =
    &["string", "text", "number", "boolean", "enum", "datetime"];
pub const SUPPORTED_ACTION_TYPES: &[&str] = &[
    "create_record",
    "list_records",
    "get_record",
    "update_record",
    "delete_record",
    "subscribe_records",
    "navigate",
    "open_modal",
    "close_modal",
    "show_toast",
];
pub const ENTITY_ACTION_TYPES: &[&str] = &[
    "create_record",
    "list_records",
    "get_record",
    "update_record",
    "delete_record",
    "subscribe_records",
];
pub const SUPPORTED_SECTION_TYPES: &[&str] = &[
    "navbar",
    "hero",
    "card_grid",
    "form",
    "table",
    "record_detail",
    "footer",
    "stats",
    "pricing_cards",
    "content",
    "custom_component",
];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IntentDocument {
    #[serde(default)]
    pub version: Option<Value>,
    #[serde(default)]
    pub project: Option<Project>,
    #[serde(default)]
    pub theme: BTreeMap<String, Value>,
    #[serde(default)]
    pub navigation: Option<Navigation>,
    #[serde(default)]
    pub tenancy: Option<Value>,
    #[serde(default)]
    pub auth: Option<Value>,
    #[serde(default)]
    pub entities: Vec<Entity>,
    #[serde(default)]
    pub actions: Vec<Action>,
    #[serde(default)]
    pub pages: Vec<Page>,
    #[serde(default)]
    pub workflows: Vec<Workflow>,
    #[serde(default)]
    pub integrations: Vec<Integration>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Project {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Navigation {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub logo: Option<String>,
    #[serde(default)]
    pub items: Vec<NavigationItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NavigationItem {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub href: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Entity {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub table: Option<String>,
    #[serde(default)]
    pub fields: Vec<Field>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Field {
    #[serde(default)]
    pub id: String,
    #[serde(rename = "type", default)]
    pub field_type: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub required: Option<bool>,
    #[serde(default)]
    pub values: Option<Vec<String>>,
    #[serde(default)]
    pub default: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Action {
    #[serde(default)]
    pub id: String,
    #[serde(rename = "type", default)]
    pub action_type: String,
    #[serde(default)]
    pub entity: Option<String>,
    #[serde(default)]
    pub auth: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Page {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub layout: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub navigation: Option<bool>,
    #[serde(default)]
    pub auth: Option<Value>,
    #[serde(default)]
    pub sections: Vec<Section>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Section {
    #[serde(default)]
    pub id: String,
    #[serde(rename = "type", default)]
    pub section_type: String,
    #[serde(default)]
    pub entity: Option<String>,
    #[serde(default)]
    pub fields: Vec<FieldUse>,
    #[serde(default)]
    pub columns: SectionColumns,
    #[serde(default)]
    pub submit: Option<ActionBinding>,
    #[serde(default)]
    pub source: Option<ActionBinding>,
    #[serde(default)]
    pub embed_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(untagged)]
pub enum SectionColumns {
    Refs(Vec<FieldUse>),
    Count(u32),
    #[default]
    Empty,
}

impl SectionColumns {
    pub fn refs(&self) -> &[FieldUse] {
        match self {
            SectionColumns::Refs(refs) => refs.as_slice(),
            SectionColumns::Count(_) | SectionColumns::Empty => &[],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FieldUse {
    Id(String),
    Object {
        #[serde(default)]
        id: Option<String>,
        #[serde(default)]
        name: Option<String>,
        #[serde(rename = "ref", default)]
        ref_path: Option<String>,
        #[serde(default)]
        label: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ActionBinding {
    #[serde(default)]
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Workflow {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub trigger: Option<WorkflowTrigger>,
    #[serde(default)]
    pub steps: Vec<WorkflowStep>,
    #[serde(default)]
    pub retry: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkflowTrigger {
    #[serde(default)]
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkflowStep {
    #[serde(rename = "type", default)]
    pub step_type: String,
    #[serde(default)]
    pub integration: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Integration {
    #[serde(default)]
    pub id: String,
    #[serde(rename = "type", default)]
    pub integration_type: String,
    #[serde(default)]
    pub config: BTreeMap<String, Value>,
}

impl FieldUse {
    pub fn id(&self) -> Option<&str> {
        match self {
            FieldUse::Id(id) => Some(id.as_str()),
            FieldUse::Object {
                id, name, ref_path, ..
            } => id.as_deref().or(name.as_deref()).or_else(|| {
                ref_path
                    .as_deref()
                    .and_then(|value| value.rsplit('.').next())
            }),
        }
    }

    pub fn normalized_ref(&self, entity_id: &str) -> Option<String> {
        match self {
            FieldUse::Object {
                ref_path: Some(value),
                ..
            } => Some(value.clone()),
            _ => self.id().map(|id| format!("Entity.{entity_id}.field.{id}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Diagnostic {
    pub code: String,
    pub severity: Severity,
    pub message: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

impl Diagnostic {
    pub fn error(code: &str, path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            severity: Severity::Error,
            message: message.into(),
            path: path.into(),
            suggestion: None,
        }
    }

    pub fn warning(code: &str, path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            severity: Severity::Warning,
            message: message.into(),
            path: path.into(),
            suggestion: None,
        }
    }

    pub fn with_suggestion(mut self, suggestion: impl Into<String>) -> Self {
        self.suggestion = Some(suggestion.into());
        self
    }
}

pub fn parse_intent_str(source: &str) -> Result<IntentDocument, Diagnostic> {
    serde_yaml::from_str(source).map_err(|err| {
        Diagnostic::error(
            "E1001",
            "intent",
            format!("failed to parse intent YAML/JSON: {err}"),
        )
        .with_suggestion("Check YAML indentation and scalar quoting.")
    })
}

pub fn parse_intent_file(path: impl AsRef<Path>) -> Result<IntentDocument, Diagnostic> {
    let path = path.as_ref();
    let source = fs::read_to_string(path).map_err(|err| {
        Diagnostic::error(
            "E1000",
            path.display().to_string(),
            format!("failed to read intent file: {err}"),
        )
    })?;
    parse_intent_str(&source)
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Compilation {
    pub graph: AppGraph,
    pub diagnostics: Vec<Diagnostic>,
    pub passes: Vec<PassReport>,
}

pub fn compile_str(source: &str) -> Result<Compilation, Vec<Diagnostic>> {
    let document = parse_intent_str(source).map_err(|diagnostic| vec![diagnostic])?;
    compile_document(document)
}

pub fn compile_file(path: impl AsRef<Path>) -> Result<Compilation, Vec<Diagnostic>> {
    let document = parse_intent_file(path).map_err(|diagnostic| vec![diagnostic])?;
    compile_document(document)
}

pub fn compile_document(document: IntentDocument) -> Result<Compilation, Vec<Diagnostic>> {
    let diagnostics = validate_document(&document);
    if diagnostics
        .iter()
        .any(|diag| diag.severity == Severity::Error)
    {
        return Err(diagnostics);
    }
    let mut graph = build_graph(&document);
    let mut passes = vec![
        PassReport::ok("parse", 1),
        PassReport::ok("normalize", count_normalized_field_refs(&document)),
        PassReport::ok("validate", diagnostics.len()),
        PassReport::ok("resolve", graph.resolved.total_count()),
        PassReport::ok("typecheck", graph.types.total_count()),
        PassReport::ok("bind", graph.bindings.len()),
    ];
    let removed = optimize_bindings(&mut graph.bindings);
    passes.push(PassReport::ok("optimize", removed));
    graph.passes = passes.clone();
    Ok(Compilation {
        graph,
        diagnostics,
        passes,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PassReport {
    pub name: String,
    pub status: String,
    pub items: usize,
}

impl PassReport {
    pub fn ok(name: &str, items: usize) -> Self {
        Self {
            name: name.to_string(),
            status: "ok".to_string(),
            items,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppGraph {
    pub version: String,
    pub project: Project,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub navigation: Option<Navigation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tenancy: Option<Value>,
    pub entities: Vec<Entity>,
    pub actions: Vec<Action>,
    pub pages: Vec<Page>,
    pub workflows: Vec<Workflow>,
    pub integrations: Vec<Integration>,
    pub symbols: BTreeMap<String, Symbol>,
    pub symbol_table: Vec<Symbol>,
    pub types: TypeSystem,
    pub resolved: ResolvedRefs,
    pub bindings: Vec<BindingNode>,
    pub passes: Vec<PassReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Symbol {
    pub ref_path: String,
    pub kind: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub attrs: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TypeSystem {
    pub entities: BTreeMap<String, EntityType>,
    pub actions: BTreeMap<String, ActionType>,
    pub sections: BTreeMap<String, SectionType>,
}

impl TypeSystem {
    pub fn total_count(&self) -> usize {
        self.entities.len() + self.actions.len() + self.sections.len()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EntityType {
    pub table: String,
    pub fields: BTreeMap<String, FieldType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldType {
    pub kind: String,
    pub required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionType {
    pub action_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SectionType {
    pub section_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_ref: Option<String>,
    pub fields: BTreeMap<String, ResolvedField>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResolvedRefs {
    pub actions: BTreeMap<String, ResolvedAction>,
    pub sections: BTreeMap<String, ResolvedSection>,
    pub workflows: BTreeMap<String, ResolvedWorkflow>,
}

impl ResolvedRefs {
    pub fn total_count(&self) -> usize {
        self.actions.len() + self.sections.len() + self.workflows.len()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResolvedAction {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResolvedSection {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub submit_action_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_action_ref: Option<String>,
    pub fields: Vec<ResolvedField>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResolvedWorkflow {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trigger_action_ref: Option<String>,
    pub integration_refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResolvedField {
    pub id: String,
    pub ref_path: String,
    pub field_type: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct BindingNode {
    pub kind: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphSummary {
    pub core_version: String,
    pub version: String,
    pub project_id: String,
    pub target: String,
    pub counts: BTreeMap<String, usize>,
    pub passes: Vec<PassReport>,
    pub symbols: usize,
    pub bindings: usize,
}

impl AppGraph {
    pub fn summary(&self) -> GraphSummary {
        let mut counts = BTreeMap::new();
        counts.insert("entities".to_string(), self.entities.len());
        counts.insert("actions".to_string(), self.actions.len());
        counts.insert("pages".to_string(), self.pages.len());
        counts.insert(
            "sections".to_string(),
            self.pages.iter().map(|page| page.sections.len()).sum(),
        );
        counts.insert("workflows".to_string(), self.workflows.len());
        counts.insert("integrations".to_string(), self.integrations.len());
        GraphSummary {
            core_version: CORE_VERSION.to_string(),
            version: self.version.clone(),
            project_id: self.project.id.clone(),
            target: self.project.target.clone(),
            counts,
            passes: self.passes.clone(),
            symbols: self.symbol_table.len(),
            bindings: self.bindings.len(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmitPlan {
    pub target: String,
    pub files: Vec<PlannedFile>,
    pub passes: Vec<PassReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlannedFile {
    pub path: String,
    pub kind: String,
    pub managed_zone: String,
}

pub fn plan_generated_files(graph: &AppGraph) -> EmitPlan {
    let mut planner = EmitPlanner::new(&graph.project.target);
    match graph.project.target.as_str() {
        "web_ts_minimal" => plan_web_ts_minimal(graph, &mut planner),
        "next_shadcn" => plan_next_shadcn(graph, &mut planner),
        _ => {}
    }
    let files = planner.into_files();
    EmitPlan {
        target: graph.project.target.clone(),
        passes: vec![PassReport::ok("emit_plan", files.len())],
        files,
    }
}

struct EmitPlanner {
    target: String,
    files: BTreeMap<String, PlannedFile>,
}

impl EmitPlanner {
    fn new(target: &str) -> Self {
        Self {
            target: target.to_string(),
            files: BTreeMap::new(),
        }
    }

    fn add(&mut self, path: impl Into<String>, kind: &str) {
        let path = path.into();
        self.files.insert(
            path.clone(),
            PlannedFile {
                managed_zone: managed_zone(&self.target, &path),
                path,
                kind: kind.to_string(),
            },
        );
    }

    fn into_files(self) -> Vec<PlannedFile> {
        self.files.into_values().collect()
    }
}

fn plan_web_ts_minimal(graph: &AppGraph, planner: &mut EmitPlanner) {
    for path in [
        "package.json",
        "tsconfig.json",
        "vite.config.ts",
        "tailwind.config.js",
        "postcss.config.js",
        ".gitignore",
        ".env.example",
        "README.md",
        "index.html",
        "src/main.tsx",
        "src/routes.tsx",
        "src/generated/ErrorBoundary.tsx",
        "src/generated/api/client.ts",
        "server/index.ts",
        "server/generated/otel.ts",
        "server/generated/db/schema.ts",
        "server/generated/db/client.ts",
        "server/generated/db/migrate.ts",
        "migrations/0000_init.sql",
        "migrations/manifest.json",
    ] {
        planner.add(path, file_kind(path));
    }
    if has_auth(graph) {
        planner.add("server/generated/auth.ts", "auth");
        planner.add("src/generated/auth.ts", "auth");
    }
    if !graph.workflows.is_empty() {
        planner.add("server/generated/workflows.ts", "workflow");
    }
    if !graph.integrations.is_empty() {
        planner.add("server/generated/integrations.ts", "integration");
    }
    for entity in &graph.entities {
        let lower = entity.id.to_lowercase();
        planner.add(
            format!("server/generated/validators/{lower}.ts"),
            "validator",
        );
    }
    for (entity_id, _types) in entity_action_types(graph) {
        let entity = graph.entities.iter().find(|entity| entity.id == entity_id);
        if let Some(entity) = entity {
            planner.add(
                format!("server/generated/routes/{}.ts", entity.id.to_lowercase()),
                "api_route",
            );
        }
    }
    if has_global_navigation(graph) {
        planner.add("src/generated/components/AppNav.tsx", "component");
    }
    for page in &graph.pages {
        planner.add(
            format!("src/generated/pages/{}Page.tsx", pascal(&page.id)),
            "page",
        );
        for section in &page.sections {
            planner.add(
                format!("src/generated/components/{}.tsx", pascal(&section.id)),
                "component",
            );
        }
    }
}

fn plan_next_shadcn(graph: &AppGraph, planner: &mut EmitPlanner) {
    for path in [
        "package.json",
        "tsconfig.json",
        "next.config.mjs",
        "next-env.d.ts",
        "postcss.config.mjs",
        "tailwind.config.ts",
        "app/globals.css",
        "app/error.tsx",
        "app/layout.tsx",
        "middleware.ts",
        "components.json",
        ".gitignore",
        ".env.example",
        "README.md",
        "lib/utils.ts",
        "lib/otel.ts",
        "lib/api/client.ts",
        "lib/db/schema.ts",
        "lib/db/client.ts",
        "lib/db/migrate.ts",
        "app/api/health/route.ts",
        "app/api/metrics/route.ts",
        "migrations/0000_init.sql",
        "migrations/manifest.json",
        "components/ui/button.tsx",
        "components/ui/input.tsx",
        "components/ui/textarea.tsx",
        "components/ui/card.tsx",
        "components/ui/table.tsx",
    ] {
        planner.add(path, file_kind(path));
    }
    if has_auth(graph) {
        planner.add("lib/auth.ts", "auth");
        planner.add("components/generated/ProtectedPage.tsx", "auth");
    }
    if !graph.workflows.is_empty() {
        planner.add("lib/workflows.ts", "workflow");
    }
    if !graph.integrations.is_empty() {
        planner.add("lib/integrations.ts", "integration");
    }
    for entity in &graph.entities {
        planner.add(
            format!("lib/validators/{}.ts", entity.id.to_lowercase()),
            "validator",
        );
    }
    for (entity_id, types) in entity_action_types(graph) {
        let Some(entity) = graph.entities.iter().find(|entity| entity.id == entity_id) else {
            continue;
        };
        let base = entity.table.as_deref().unwrap_or(&entity.id).to_lowercase();
        if types.contains("create_record") || types.contains("list_records") {
            planner.add(format!("app/api/{base}/route.ts"), "api_route");
        }
        if types.contains("get_record")
            || types.contains("update_record")
            || types.contains("delete_record")
        {
            planner.add(format!("app/api/{base}/[id]/route.ts"), "api_route");
        }
        if types.contains("subscribe_records") {
            planner.add(format!("app/api/{base}/stream/route.ts"), "api_route");
        }
    }
    if has_global_navigation(graph) {
        planner.add("components/generated/AppNav.tsx", "component");
    }
    for page in &graph.pages {
        planner.add(next_page_file(page), "page");
        for section in &page.sections {
            planner.add(
                format!("components/generated/{}.tsx", pascal(&section.id)),
                "component",
            );
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    const VALID: &str = r#"
version: 0.1
project:
  id: voice_agent_site
  target: web_ts_minimal
entities:
  - id: Lead
    table: leads
    fields:
      - id: name
        type: string
        required: true
      - id: status
        type: enum
        values: [new, closed]
actions:
  - id: create_lead
    type: create_record
    entity: Lead
  - id: list_leads
    type: list_records
    entity: Lead
integrations:
  - id: notify
    type: webhook
workflows:
  - id: lead_created
    trigger:
      action: create_lead
    steps:
      - type: webhook
        integration: notify
pages:
  - id: home
    path: /
    sections:
      - id: lead_form
        type: form
        entity: Lead
        fields: [name]
        submit:
          action: create_lead
      - id: leads_table
        type: table
        entity: Lead
        columns:
          - id: status
            ref: Entity.Lead.field.status
        source:
          action: list_leads
"#;

    #[test]
    fn compiles_typed_graph_with_symbols_resolved_refs_types_and_bindings() {
        let compiled = compile_str(VALID).expect("compile valid intent");
        let graph = compiled.graph;
        assert_eq!(graph.project.id, "voice_agent_site");
        assert!(graph.symbols.contains_key("Entity.Lead.field.name"));
        assert_eq!(
            graph.resolved.actions["create_lead"].entity_ref.as_deref(),
            Some("Entity.Lead")
        );
        assert_eq!(
            graph.resolved.sections["Page.home.section.lead_form"]
                .submit_action_ref
                .as_deref(),
            Some("Action.create_lead")
        );
        assert_eq!(
            graph.types.actions["list_leads"].output.as_deref(),
            Some("Array<Entity.Lead>")
        );
        assert!(graph
            .bindings
            .iter()
            .any(|binding| binding.kind == "form.submit"
                && binding.from == "Page.home.section.lead_form"
                && binding.to == "Action.create_lead"));
        assert!(graph.passes.iter().any(|pass| pass.name == "optimize"));
    }

    #[test]
    fn plans_generated_files_for_supported_targets() {
        let web = compile_str(VALID).expect("compile web intent");
        let web_plan = plan_generated_files(&web.graph);
        assert!(web_plan
            .files
            .iter()
            .any(|file| file.path == "server/generated/otel.ts" && file.kind == "project"));
        assert!(web_plan
            .files
            .iter()
            .any(|file| file.path == "server/generated/routes/lead.ts"));
        assert!(web_plan
            .files
            .iter()
            .any(|file| file.path == "src/generated/components/LeadForm.tsx"));

        let next_source = VALID.replace("target: web_ts_minimal", "target: next_shadcn");
        let next = compile_str(&next_source).expect("compile next intent");
        let next_plan = plan_generated_files(&next.graph);
        assert!(next_plan
            .files
            .iter()
            .any(|file| file.path == "lib/otel.ts"));
        assert!(next_plan
            .files
            .iter()
            .any(|file| file.path == "app/api/leads/route.ts"));
        assert!(next_plan
            .files
            .iter()
            .any(|file| file.path == "components/generated/LeadForm.tsx"));
    }

    #[test]
    fn normalizes_compact_field_refs_into_stable_ir_refs() {
        let compiled = compile_str(VALID).expect("compile valid intent");
        let section = &compiled.graph.resolved.sections["Page.home.section.lead_form"];
        assert_eq!(section.fields[0].id, "name");
        assert_eq!(section.fields[0].ref_path, "Entity.Lead.field.name");
    }

    #[test]
    fn accepts_layout_numeric_columns_without_field_resolution() {
        let source = r#"
version: 0.1
project:
  id: layout_columns
  target: web_ts_minimal
pages:
  - id: home
    path: /
    sections:
      - id: features
        type: card_grid
        columns: 3
"#;
        let compiled = compile_str(source).expect("numeric layout columns should compile");
        assert_eq!(
            compiled.graph.resolved.sections["Page.home.section.features"]
                .fields
                .len(),
            0
        );
    }

    #[test]
    fn rejects_unsupported_version() {
        let mut document = parse_intent_str(VALID).expect("parse intent");
        document.version = Some(Value::String("0.3".to_string()));
        let diagnostics = validate_document(&document);
        assert!(diagnostics.iter().any(|diag| diag.code == "E0002"));
    }

    #[test]
    fn catches_unknown_refs_before_graph_build() {
        let source = VALID
            .replace("entity: Lead", "entity: Missing")
            .replace("fields: [name]", "fields: [email]");
        let diagnostics = compile_str(&source).expect_err("broken refs should fail");
        assert!(diagnostics.iter().any(|diag| diag.code == "E3201"));
        assert!(diagnostics.iter().any(|diag| diag.code == "E3501"));
    }
}
