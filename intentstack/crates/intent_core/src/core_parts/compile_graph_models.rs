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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedFiles {
    pub target: String,
    pub files: Vec<GeneratedFile>,
    pub passes: Vec<PassReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GeneratedFile {
    pub path: String,
    pub kind: String,
    pub managed_zone: String,
    pub content: String,
}
