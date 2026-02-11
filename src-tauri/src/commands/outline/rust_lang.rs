use super::*;

pub(super) fn build_rust_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
) -> Option<OutlineNode> {
    let source_text = source
        .get(node.start_byte()..node.end_byte())
        .unwrap_or("")
        .trim_start();

    match node.kind() {
        "mod_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Rust, &mut children);
            }

            Some(build_outline_node(
                format!("mod {}", name),
                "module",
                node,
                children,
            ))
        }
        "const_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("const {}", name),
                "const",
                node,
                Vec::new(),
            ))
        }
        "static_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let static_label = if source_text.contains("static mut") {
                format!("static mut {}", name)
            } else {
                format!("static {}", name)
            };

            Some(build_outline_node(static_label, "static", node, Vec::new()))
        }
        "type_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("type {}", name),
                "type",
                node,
                Vec::new(),
            ))
        }
        "union_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Rust, &mut children);
            }

            Some(build_outline_node(
                format!("union {}", name),
                "union",
                node,
                children,
            ))
        }
        "macro_definition" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("macro {}!", name),
                "macro",
                node,
                Vec::new(),
            ))
        }
        "extern_crate_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let alias = node
                .child_by_field_name("alias")
                .map(|alias_node| get_node_text_preview(alias_node, source, 80))
                .filter(|value| !value.trim().is_empty());

            let label = if let Some(alias_name) = alias {
                format!("extern crate {} as {}", name, alias_name)
            } else {
                format!("extern crate {}", name)
            };

            Some(build_outline_node(label, "extern_crate", node, Vec::new()))
        }
        "function_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Rust, &mut children);
            }

            Some(build_outline_node(
                format!("fn {}()", name),
                "function",
                node,
                children,
            ))
        }
        "impl_item" => {
            let target = node
                .child_by_field_name("type")
                .map(|type_node| get_node_text_preview(type_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Rust, &mut children);
            }

            Some(build_outline_node(
                format!("impl {}", target),
                "impl",
                node,
                children,
            ))
        }
        "struct_item" | "enum_item" | "trait_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let type_label = if node.kind() == "enum_item" {
                "enum"
            } else if node.kind() == "trait_item" {
                "trait"
            } else {
                "struct"
            };

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Rust, &mut children);
            }

            Some(build_outline_node(
                format!("{} {}", type_label, name),
                type_label,
                node,
                children,
            ))
        }
        _ => None,
    }
}
