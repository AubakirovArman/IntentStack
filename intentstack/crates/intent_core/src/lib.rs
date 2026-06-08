mod core_impl {
    include!("core_parts/model.rs");
    include!("core_parts/diagnostics_parse.rs");
    include!("core_parts/validation_document.rs");
    include!("core_parts/validation_routes.rs");
    include!("core_parts/validation_integrations.rs");
    include!("core_parts/compile_graph_models.rs");
    include!("core_parts/emit_plan.rs");
    include!("core_parts/emit_templates.rs");
    include!("core_parts/emit_components.rs");
    include!("core_parts/emit_backend.rs");
    include!("core_parts/emit_helpers.rs");
    include!("core_parts/graph_build.rs");
    include!("core_parts/graph_resolve.rs");
    include!("core_parts/tests.rs");
}

pub use core_impl::*;
