use std::process::Command;
use std::{env, fs};

#[test]
fn rust_cli_runs_schema_command() {
    let out = Command::new(env!("CARGO_BIN_EXE_intentstack"))
        .arg("schema")
        .output()
        .expect("run intentstack schema");
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("IntentStack Intent DSL v0.1"));
}

#[test]
fn rust_cli_runs_capabilities_command() {
    let out = Command::new(env!("CARGO_BIN_EXE_intentstack"))
        .args(["list_capabilities", "--target", "web_ts_minimal", "--json"])
        .output()
        .expect("run intentstack list_capabilities");
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("web_ts_minimal"));
    assert!(stdout.contains("record_detail"));
}

#[test]
fn rust_cli_runs_core_inspect_command() {
    let dir = env::temp_dir().join(format!("intentstack-core-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("create temp dir");
    let intent = dir.join("app.intent.yaml");
    fs::write(
        &intent,
        r#"
version: 0.1
project:
  id: rust_core_app
  target: web_ts_minimal
entities:
  - id: Lead
    fields:
      - id: name
        type: string
actions:
  - id: create_lead
    type: create_record
    entity: Lead
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
"#,
    )
    .expect("write intent");

    let out = Command::new(env!("CARGO_BIN_EXE_intentstack"))
        .args([
            "core",
            "inspect",
            intent.to_str().expect("utf8 path"),
            "--json",
        ])
        .output()
        .expect("run intentstack core inspect");
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("\"ok\": true"));
    assert!(stdout.contains("\"project_id\": \"rust_core_app\""));
    assert!(stdout.contains("\"symbols\""));
    assert!(stdout.contains("\"resolved\""));
    assert!(stdout.contains("\"bindings\""));

    let _ = fs::remove_dir_all(&dir);
}
