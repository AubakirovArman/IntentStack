use std::env;
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

fn main() {
    let script = script_path();
    let status = Command::new("node")
        .arg(script)
        .args(env::args_os().skip(1))
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
