use std::process::Command;

#[test]
fn rust_cli_runs_schema_command() {
    let out = Command::new(env!("CARGO_BIN_EXE_intentstack"))
        .arg("schema")
        .output()
        .expect("run intentstack schema");
    assert!(out.status.success(), "stderr: {}", String::from_utf8_lossy(&out.stderr));
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("IntentStack Intent DSL v0.1"));
}

#[test]
fn rust_cli_runs_capabilities_command() {
    let out = Command::new(env!("CARGO_BIN_EXE_intentstack"))
        .args(["list_capabilities", "--target", "web_ts_minimal", "--json"])
        .output()
        .expect("run intentstack list_capabilities");
    assert!(out.status.success(), "stderr: {}", String::from_utf8_lossy(&out.stderr));
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("web_ts_minimal"));
    assert!(stdout.contains("record_detail"));
}
