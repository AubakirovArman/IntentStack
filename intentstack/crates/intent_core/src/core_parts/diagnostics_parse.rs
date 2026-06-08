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
