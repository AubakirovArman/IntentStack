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

pub fn emit_generated_files(graph: &AppGraph) -> GeneratedFiles {
    let plan = plan_generated_files(graph);
    let files = plan
        .files
        .iter()
        .map(|file| GeneratedFile {
            path: file.path.clone(),
            kind: file.kind.clone(),
            managed_zone: file.managed_zone.clone(),
            content: emit_file_content(graph, file),
        })
        .collect::<Vec<_>>();
    GeneratedFiles {
        target: graph.project.target.clone(),
        passes: vec![
            PassReport::ok("emit_plan", plan.files.len()),
            PassReport::ok("emit_files", files.len()),
        ],
        files,
    }
}

pub fn write_generated_files(
    generated: &GeneratedFiles,
    out_dir: impl AsRef<Path>,
) -> Result<(), std::io::Error> {
    let out_dir = out_dir.as_ref();
    for file in &generated.files {
        let path = out_dir.join(&file.path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, &file.content)?;
    }
    Ok(())
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
    for (entity_id, types) in entity_action_types(graph) {
        let entity = graph.entities.iter().find(|entity| entity.id == entity_id);
        if let Some(entity) = entity {
            planner.add(
                format!("server/generated/routes/{}.ts", entity.id.to_lowercase()),
                "api_route",
            );
            if types.contains("subscribe_records") {
                planner.add(
                    format!("server/generated/realtime/{}.ts", entity.id.to_lowercase()),
                    "realtime",
                );
            }
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
