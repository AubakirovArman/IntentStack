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
    #[serde(flatten)]
    pub props: BTreeMap<String, Value>,
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
