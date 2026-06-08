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
  - id: subscribe_leads
    type: subscribe_records
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
            .any(|file| file.path == "server/generated/realtime/lead.ts"));
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
    fn emits_generated_file_contents_for_supported_targets() {
        let web = compile_str(VALID).expect("compile web intent");
        let web_plan = plan_generated_files(&web.graph);
        let web_generated = emit_generated_files(&web.graph);
        let planned_paths = web_plan
            .files
            .iter()
            .map(|file| file.path.clone())
            .collect::<BTreeSet<_>>();
        let emitted_paths = web_generated
            .files
            .iter()
            .map(|file| file.path.clone())
            .collect::<BTreeSet<_>>();
        assert_eq!(emitted_paths, planned_paths);
        assert!(web_generated
            .files
            .iter()
            .all(|file| !file.content.trim().is_empty()));
        assert!(web_generated
            .files
            .iter()
            .any(|file| file.path == "package.json"
                && file.content.contains("\"build\": \"vite build\"")));
        assert!(web_generated
            .files
            .iter()
            .any(|file| file.path == "src/generated/components/LeadForm.tsx"
                && file.content.contains("export function LeadForm")));

        let out =
            std::env::temp_dir().join(format!("intentstack-rust-core-emit-{}", std::process::id()));
        let _ = fs::remove_dir_all(&out);
        write_generated_files(&web_generated, &out).expect("write Rust generated files");
        assert!(out.join("src/generated/components/LeadForm.tsx").exists());
        let _ = fs::remove_dir_all(&out);

        let next_source = VALID.replace("target: web_ts_minimal", "target: next_shadcn");
        let next = compile_str(&next_source).expect("compile next intent");
        let next_generated = emit_generated_files(&next.graph);
        assert!(next_generated
            .files
            .iter()
            .any(|file| file.path == "app/page.tsx"
                && file.content.contains("export default function Page")));
        assert!(next_generated
            .files
            .iter()
            .any(|file| file.path == "components/generated/LeadForm.tsx"
                && file.content.contains("export function LeadForm")));
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
