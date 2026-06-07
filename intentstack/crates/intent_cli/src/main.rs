use std::env;
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::{exit, Command};

fn default_script_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("src")
        .join("index.js")
}

fn script_path() -> PathBuf {
    env::var_os("INTENTSTACK_JS")
        .map(PathBuf::from)
        .unwrap_or_else(default_script_path)
}

fn print_json<T: serde::Serialize>(value: &T) -> i32 {
    match serde_json::to_string_pretty(value) {
        Ok(json) => {
            println!("{json}");
            0
        }
        Err(err) => {
            eprintln!("failed to serialize Rust core output: {err}");
            2
        }
    }
}

fn has_flag(args: &[OsString], flag: &str) -> bool {
    args.iter().any(|arg| arg == flag)
}

fn run_core(args: &[OsString]) -> i32 {
    let Some(command) = args.first().and_then(|arg| arg.to_str()) else {
        eprintln!("usage: intentstack core <version|check|inspect|plan> [intent-file] [--json]");
        return 2;
    };
    match command {
        "version" => {
            if has_flag(args, "--json") {
                print_json(&serde_json::json!({
                    "core_version": intent_core::CORE_VERSION,
                    "supported_dsl_versions": intent_core::SUPPORTED_DSL_VERSIONS,
                    "supported_targets": intent_core::SUPPORTED_TARGETS,
                }))
            } else {
                println!("IntentStack Rust core {}", intent_core::CORE_VERSION);
                println!(
                    "Supported DSL versions: {}",
                    intent_core::SUPPORTED_DSL_VERSIONS.join(", ")
                );
                0
            }
        }
        "check" | "inspect" | "plan" => {
            let Some(path) = args
                .iter()
                .skip(1)
                .find(|arg| !arg.to_string_lossy().starts_with("--"))
            else {
                eprintln!("usage: intentstack core {command} <intent-file> [--json]");
                return 2;
            };
            let json = has_flag(args, "--json");
            match intent_core::compile_file(path) {
                Ok(compiled) if command == "plan" => {
                    let plan = intent_core::plan_generated_files(&compiled.graph);
                    if json {
                        print_json(&serde_json::json!({
                            "ok": true,
                            "diagnostics": compiled.diagnostics,
                            "summary": compiled.graph.summary(),
                            "emit_plan": plan,
                        }))
                    } else {
                        println!(
                            "IntentStack Rust emit plan: target={} files={}",
                            plan.target,
                            plan.files.len()
                        );
                        for file in plan.files {
                            println!("{}  {}  {}", file.kind, file.managed_zone, file.path);
                        }
                        0
                    }
                }
                Ok(compiled) if command == "check" => {
                    if json {
                        print_json(&serde_json::json!({
                            "ok": true,
                            "diagnostics": compiled.diagnostics,
                            "summary": compiled.graph.summary(),
                        }))
                    } else {
                        println!("ok Rust core check passed");
                        for diagnostic in compiled.diagnostics {
                            println!(
                                "{} {:?}: {}",
                                diagnostic.code, diagnostic.severity, diagnostic.message
                            );
                        }
                        0
                    }
                }
                Ok(compiled) => {
                    if json {
                        print_json(&serde_json::json!({
                            "ok": true,
                            "diagnostics": compiled.diagnostics,
                            "summary": compiled.graph.summary(),
                            "symbols": compiled.graph.symbol_table,
                            "types": compiled.graph.types,
                            "resolved": compiled.graph.resolved,
                            "bindings": compiled.graph.bindings,
                            "passes": compiled.passes,
                        }))
                    } else {
                        let summary = compiled.graph.summary();
                        println!(
                            "IntentStack Rust core graph: {} target={} symbols={} bindings={}",
                            summary.project_id, summary.target, summary.symbols, summary.bindings
                        );
                        for pass in summary.passes {
                            println!("pass {}: {} ({})", pass.name, pass.status, pass.items);
                        }
                        0
                    }
                }
                Err(diagnostics) => {
                    if json {
                        print_json(&serde_json::json!({
                            "ok": false,
                            "diagnostics": diagnostics,
                        }));
                    } else {
                        for diagnostic in diagnostics {
                            eprintln!(
                                "{} {:?}: {}",
                                diagnostic.code, diagnostic.severity, diagnostic.message
                            );
                        }
                    }
                    1
                }
            }
        }
        _ => {
            eprintln!("unknown Rust core command {command}");
            eprintln!(
                "usage: intentstack core <version|check|inspect|plan> [intent-file] [--json]"
            );
            2
        }
    }
}

fn main() {
    let args = env::args_os().skip(1).collect::<Vec<_>>();
    if args.first().and_then(|arg| arg.to_str()) == Some("core") {
        exit(run_core(&args[1..]));
    }
    let script = script_path();
    let status = Command::new("node")
        .arg(script)
        .args(args)
        .status()
        .unwrap_or_else(|err| {
            eprintln!("failed to launch IntentStack reference compiler via node: {err}");
            exit(2);
        });
    exit(status.code().unwrap_or(1));
}

#[cfg(test)]
mod tests {
    use super::default_script_path;

    #[test]
    fn default_script_points_to_reference_cli() {
        let path = default_script_path();
        assert!(path.ends_with("src/index.js"));
    }
}
