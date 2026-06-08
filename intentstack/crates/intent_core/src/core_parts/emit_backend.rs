fn custom_body(section: &Section) -> String {
    let component =
        section_prop(section, "component").unwrap_or_else(|| "CustomComponent".to_string());
    format!("    <section id={} style={{{{padding:'48px 24px'}}}}><p>Custom component: {}</p></section>", js_str(&section.id), jsx_text(&component))
}

fn web_server_index(graph: &AppGraph) -> String {
    format!("{RUST_EMIT_BANNER}import {{ createServer }} from 'node:http'\n\nconst port = Number(process.env.PORT || 8787)\nconst project = {}\nconst server = createServer((req, res) => {{\n  if (req.url === '/api/health') {{\n    res.writeHead(200, {{ 'Content-Type': 'application/json' }})\n    res.end(JSON.stringify({{ ok: true, project }}))\n    return\n  }}\n  res.writeHead(404, {{ 'Content-Type': 'application/json' }})\n  res.end(JSON.stringify({{ error: 'not_found' }}))\n}})\nserver.listen(port, () => console.log(`IntentStack server listening on ${{port}}`))\n", js_str(&graph.project.id))
}

fn db_schema_ts(graph: &AppGraph) -> String {
    let entities = graph
        .entities
        .iter()
        .map(|entity| {
            let fields = entity
                .fields
                .iter()
                .map(|field| format!("    {}: {},", field.id, js_str(&field.field_type)))
                .collect::<Vec<_>>()
                .join("\n");
            format!(
                "  {}: {{\n    table: {},\n    fields: {{\n{fields}\n    }}\n  }}",
                entity.id,
                js_str(entity.table.as_deref().unwrap_or(&entity.id))
            )
        })
        .collect::<Vec<_>>()
        .join(",\n");
    format!("{RUST_EMIT_BANNER}export const schema = {{\n{entities}\n}} as const\n")
}

fn db_client_ts() -> String {
    format!("{RUST_EMIT_BANNER}export const db = {{}}\nexport async function runIntentStackMigrations() {{}}\nexport function ensureIntentStackMigrations() {{ return runIntentStackMigrations() }}\n")
}

fn validator_ts(graph: &AppGraph, path: &str) -> String {
    let name = path_basename(path).trim_end_matches(".ts").to_string();
    let entity = graph
        .entities
        .iter()
        .find(|entity| entity.id.to_lowercase() == name);
    let fields = entity
        .map(|entity| {
            entity
                .fields
                .iter()
                .map(|field| format!("  {},", js_str(&field.id)))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    format!("{RUST_EMIT_BANNER}export const fields = [\n{fields}\n] as const\nexport function validate(input: unknown) {{ return input }}\n")
}

fn hono_route_ts(graph: &AppGraph, path: &str) -> String {
    let name = path_basename(path).trim_end_matches(".ts").to_string();
    let entity = graph
        .entities
        .iter()
        .find(|entity| entity.id.to_lowercase() == name);
    format!("{RUST_EMIT_BANNER}export const entity = {}\nexport async function list() {{ return [] }}\nexport async function create(input: unknown) {{ return input }}\n", js_str(entity.map(|entity| entity.id.as_str()).unwrap_or(name.as_str())))
}

fn realtime_ts(_graph: &AppGraph, _path: &str) -> String {
    format!("{RUST_EMIT_BANNER}export function mountWebSocket() {{}}\n")
}

fn next_api_route(_graph: &AppGraph, path: &str) -> String {
    if path.ends_with("/[id]/route.ts") {
        format!("{RUST_EMIT_BANNER}export async function GET(_request: Request, context: {{ params: Promise<{{ id: string }}> }}) {{ return Response.json({{ id: (await context.params).id }}) }}\nexport async function PUT(request: Request) {{ return Response.json(await request.json().catch(() => ({{}}))) }}\nexport async function DELETE() {{ return Response.json({{ ok: true }}) }}\n")
    } else {
        next_json_route("{ items: [] }")
    }
}

fn next_json_route(body: &str) -> String {
    format!("{RUST_EMIT_BANNER}export async function GET() {{ return Response.json({body}) }}\nexport async function POST(request: Request) {{ return Response.json(await request.json().catch(() => ({{}})), {{ status: 201 }}) }}\n")
}

fn next_layout(graph: &AppGraph) -> String {
    format!("{RUST_EMIT_BANNER}import './globals.css'\nimport type {{ ReactNode }} from 'react'\n\nexport const metadata = {{ title: {} }}\n\nexport default function RootLayout(props: {{ children: ReactNode }}) {{\n  return <html lang=\"en\"><body>{{props.children}}</body></html>\n}}\n", js_str(&graph.project.name.clone().unwrap_or_else(|| graph.project.id.clone())))
}

fn ui_primitive(name: &str, tag: &str) -> String {
    format!("{RUST_EMIT_BANNER}import type {{ ComponentProps }} from 'react'\n\nexport function {name}(props: ComponentProps<'{tag}'>) {{ return <{tag} {{...props}} /> }}\n")
}

fn ui_card() -> String {
    format!("{RUST_EMIT_BANNER}import type {{ HTMLAttributes }} from 'react'\n\nexport function Card(props: HTMLAttributes<HTMLDivElement>) {{ return <div {{...props}} /> }}\nexport function CardHeader(props: HTMLAttributes<HTMLDivElement>) {{ return <div {{...props}} /> }}\nexport function CardContent(props: HTMLAttributes<HTMLDivElement>) {{ return <div {{...props}} /> }}\n")
}

fn ui_table() -> String {
    format!("{RUST_EMIT_BANNER}import type {{ HTMLAttributes }} from 'react'\n\nexport function Table(props: HTMLAttributes<HTMLTableElement>) {{ return <table {{...props}} /> }}\nexport function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>) {{ return <thead {{...props}} /> }}\nexport function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {{ return <tbody {{...props}} /> }}\nexport function TableRow(props: HTMLAttributes<HTMLTableRowElement>) {{ return <tr {{...props}} /> }}\nexport function TableCell(props: HTMLAttributes<HTMLTableCellElement>) {{ return <td {{...props}} /> }}\n")
}

fn api_client_ts() -> String {
    format!("{RUST_EMIT_BANNER}export async function apiGet<T>(path: string): Promise<T> {{\n  const res = await fetch(path)\n  if (!res.ok) throw new Error(`Request failed: ${{res.status}}`)\n  return res.json() as Promise<T>\n}}\n")
}

fn migration_sql(graph: &AppGraph) -> String {
    let mut out = String::from("-- @generated by IntentStack Rust core\n\n");
    for entity in &graph.entities {
        out.push_str(&format!(
            "CREATE TABLE IF NOT EXISTS {} (\n  id integer PRIMARY KEY",
            entity.table.as_deref().unwrap_or(&entity.id).to_lowercase()
        ));
        for field in &entity.fields {
            out.push_str(&format!(
                ",\n  {} {}",
                snakeish(&field.id),
                sql_type(&field.field_type)
            ));
        }
        out.push_str("\n);\n\n");
    }
    out
}

fn migration_manifest_json(graph: &AppGraph) -> String {
    format!(
        "{{\n  \"version\": 1,\n  \"driver\": \"sqlite\",\n  \"project\": {},\n  \"migrations\": [{{ \"id\": \"0000_init\", \"file\": \"0000_init.sql\" }}]\n}}\n",
        js_str(&graph.project.id)
    )
}

fn generated_readme(graph: &AppGraph, stack: &str) -> String {
    format!(
        "# {}\n\nGenerated by IntentStack Rust core for `{}`.\n\nStack: {stack}\n\nRun `npm install` and `npm run build` in this directory.\n",
        graph.project.name.as_deref().unwrap_or(&graph.project.id),
        graph.project.target
    )
}

fn package_name(graph: &AppGraph) -> String {
    let raw = graph
        .project
        .id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    raw.trim_matches('-').to_string()
}
