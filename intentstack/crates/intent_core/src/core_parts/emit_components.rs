fn web_page_tsx(graph: &AppGraph, path: &str) -> String {
    let Some(page) = page_for_web_path(graph, path) else {
        return format!("{RUST_EMIT_BANNER}export function MissingPage() {{ return null }}\n");
    };
    let imports = page
        .sections
        .iter()
        .filter(|section| section.embed_only != Some(true))
        .map(|section| {
            format!(
                "import {{ {} }} from '../components/{}'",
                pascal(&section.id),
                pascal(&section.id)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let sections = page
        .sections
        .iter()
        .filter(|section| section.embed_only != Some(true))
        .map(|section| format!("      <{} />", pascal(&section.id)))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "{RUST_EMIT_BANNER}{imports}\n\nexport function {}Page() {{\n  return (\n    <>\n{sections}\n    </>\n  )\n}}\n",
        pascal(&page.id)
    )
}

fn next_page_tsx(graph: &AppGraph, path: &str) -> String {
    let Some(page) = page_for_next_path(graph, path) else {
        return format!(
            "{RUST_EMIT_BANNER}export default function MissingPage() {{ return null }}\n"
        );
    };
    let imports = page
        .sections
        .iter()
        .filter(|section| section.embed_only != Some(true))
        .map(|section| {
            format!(
                "import {{ {} }} from '@/components/generated/{}'",
                pascal(&section.id),
                pascal(&section.id)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let sections = page
        .sections
        .iter()
        .filter(|section| section.embed_only != Some(true))
        .map(|section| format!("      <{} />", pascal(&section.id)))
        .collect::<Vec<_>>()
        .join("\n");
    format!("{RUST_EMIT_BANNER}{imports}\n\nexport default function Page() {{\n  return <main>\n{sections}\n  </main>\n}}\n")
}

fn web_component_file(graph: &AppGraph, path: &str) -> String {
    let Some(section) = section_for_component_path(graph, path) else {
        return format!("{RUST_EMIT_BANNER}export function Generated() {{ return null }}\n");
    };
    component_tsx(section, graph)
}

fn next_component_file(graph: &AppGraph, path: &str) -> String {
    let Some(section) = section_for_component_path(graph, path) else {
        return format!("{RUST_EMIT_BANNER}export function Generated() {{ return null }}\n");
    };
    component_tsx(section, graph)
}

fn component_tsx(section: &Section, graph: &AppGraph) -> String {
    let name = pascal(&section.id);
    let body = match section.section_type.as_str() {
        "navbar" => navbar_body(section),
        "hero" => hero_body(section),
        "card_grid" => card_grid_body(section),
        "stats" => stats_body(section),
        "pricing_cards" => pricing_body(section),
        "form" => form_body(section, graph),
        "table" => table_body(section, graph),
        "record_detail" => detail_body(section, graph),
        "footer" => footer_body(section, graph),
        "content" => content_body(section),
        "custom_component" => custom_body(section),
        _ => format!(
            "    <section id={}><h2>{{{}}}</h2></section>",
            js_str(&section.id),
            js_str(&section.id)
        ),
    };
    format!("{RUST_EMIT_BANNER}export function {name}() {{\n  return (\n{body}\n  )\n}}\n")
}

fn navbar_body(section: &Section) -> String {
    let logo = section_prop(section, "logo").unwrap_or_else(|| "App".to_string());
    let items = prop_items(section)
        .iter()
        .map(|item| {
            format!(
                "        <a href={}>{}</a>",
                js_str(&item_string(item, "href", "#")),
                jsx_text(&item_string(item, "label", "Link"))
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("    <nav id={} style={{{{display:'flex',gap:16,padding:16,borderBottom:'1px solid #ddd'}}}}>\n      <strong>{}</strong>\n      <div style={{{{display:'flex',gap:12}}}}>\n{items}\n      </div>\n    </nav>", js_str(&section.id), jsx_text(&logo))
}

fn hero_body(section: &Section) -> String {
    let title = section_prop(section, "title").unwrap_or_else(|| section.id.clone());
    let subtitle = section_prop(section, "subtitle").unwrap_or_default();
    format!("    <section id={} style={{{{padding:'72px 24px',textAlign:'center'}}}}>\n      <h1>{}</h1>\n      <p>{}</p>\n    </section>", js_str(&section.id), jsx_text(&title), jsx_text(&subtitle))
}

fn card_grid_body(section: &Section) -> String {
    let title = optional_heading(section);
    let cards = prop_items(section)
        .iter()
        .map(|item| format!("        <article style={{{{border:'1px solid #ddd',borderRadius:8,padding:16}}}}><h3>{}</h3><p>{}</p></article>", jsx_text(&item_string(item, "title", "Card")), jsx_text(&item_string(item, "text", ""))))
        .collect::<Vec<_>>()
        .join("\n");
    format!("    <section id={} style={{{{padding:'48px 24px'}}}}>\n      {title}\n      <div style={{{{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16}}}}>\n{cards}\n      </div>\n    </section>", js_str(&section.id))
}

fn stats_body(section: &Section) -> String {
    let title = optional_heading(section);
    let stats = prop_items(section)
        .iter()
        .map(|item| {
            format!(
                "        <article><p>{}</p><strong>{}</strong><p>{}</p></article>",
                jsx_text(&item_string(item, "label", "Metric")),
                jsx_text(&item_string(item, "value", "0")),
                jsx_text(&item_string(item, "text", ""))
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("    <section id={} style={{{{padding:'48px 24px'}}}}>\n      {title}\n      <div style={{{{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:16}}}}>\n{stats}\n      </div>\n    </section>", js_str(&section.id))
}

fn pricing_body(section: &Section) -> String {
    let title = optional_heading(section);
    let plans = prop_items(section)
        .iter()
        .map(|item| format!("        <article style={{{{border:'1px solid #ddd',borderRadius:8,padding:16}}}}><h3>{}</h3><strong>{}</strong><p>{}</p></article>", jsx_text(&item_string(item, "title", "Plan")), jsx_text(&item_string(item, "price", "")), jsx_text(&item_string(item, "text", ""))))
        .collect::<Vec<_>>()
        .join("\n");
    format!("    <section id={} style={{{{padding:'48px 24px'}}}}>\n      {title}\n      <div style={{{{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16}}}}>\n{plans}\n      </div>\n    </section>", js_str(&section.id))
}

fn form_body(section: &Section, graph: &AppGraph) -> String {
    let title = optional_heading(section);
    let fields = resolved_section_fields(section, graph)
        .iter()
        .map(|field| format!("        <label style={{{{display:'grid',gap:6}}}}><span>{}</span><input name={} /></label>", jsx_text(&field_label(field)), js_str(&field.id)))
        .collect::<Vec<_>>()
        .join("\n");
    format!("    <section id={} style={{{{padding:'48px 24px'}}}}>\n      {title}\n      <form style={{{{display:'grid',gap:12,maxWidth:640}}}}>\n{fields}\n        <button type=\"button\">Submit</button>\n      </form>\n    </section>", js_str(&section.id))
}

fn table_body(section: &Section, graph: &AppGraph) -> String {
    let title = optional_heading(section);
    let fields = resolved_section_fields(section, graph);
    let headers = fields
        .iter()
        .map(|field| format!("<th>{}</th>", jsx_text(&field_label(field))))
        .collect::<Vec<_>>()
        .join("");
    let row = fields
        .iter()
        .map(|field| format!("<td>{}</td>", jsx_text(&sample_field_value(field))))
        .collect::<Vec<_>>()
        .join("");
    format!("    <section id={} style={{{{padding:'48px 24px'}}}}>\n      {title}\n      <table><thead><tr>{headers}</tr></thead><tbody><tr>{row}</tr></tbody></table>\n    </section>", js_str(&section.id))
}

fn detail_body(section: &Section, graph: &AppGraph) -> String {
    let title = optional_heading(section);
    let cards = resolved_section_fields(section, graph)
        .iter()
        .map(|field| {
            format!(
                "        <article><strong>{}</strong><p>{}</p></article>",
                jsx_text(&field_label(field)),
                jsx_text(&sample_field_value(field))
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("    <section id={} style={{{{padding:'48px 24px'}}}}>\n      {title}\n      <div style={{{{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:16}}}}>\n{cards}\n      </div>\n    </section>", js_str(&section.id))
}

fn footer_body(section: &Section, graph: &AppGraph) -> String {
    let text = section_prop(section, "text")
        .or_else(|| section_prop(section, "title"))
        .unwrap_or_else(|| {
            graph
                .project
                .name
                .clone()
                .unwrap_or_else(|| graph.project.id.clone())
        });
    format!(
        "    <footer id={} style={{{{padding:24,borderTop:'1px solid #ddd'}}}}>{}</footer>",
        js_str(&section.id),
        jsx_text(&text)
    )
}

fn content_body(section: &Section) -> String {
    let title = optional_heading(section);
    format!("    <section id={} style={{{{padding:'48px 24px'}}}}>\n      {title}\n      <p>{}</p>\n    </section>", js_str(&section.id), jsx_text(&section_prop(section, "text").unwrap_or_else(|| "Generated content section".to_string())))
}
