use super::*;

pub(super) fn build_csharp_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
) -> Option<OutlineNode> {
    match node.kind() {
        "namespace_declaration" | "file_scoped_namespace_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Csharp, &mut children);
            }

            Some(build_outline_node(
                format!("namespace {}", name),
                "namespace",
                node,
                children,
            ))
        }
        "class_declaration"
        | "interface_declaration"
        | "struct_declaration"
        | "record_declaration"
        | "enum_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let (type_label, node_type) = match node.kind() {
                "interface_declaration" => ("interface", "interface"),
                "struct_declaration" => ("struct", "struct"),
                "record_declaration" => ("record", "record"),
                "enum_declaration" => ("enum", "enum"),
                _ => ("class", "class"),
            };

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Csharp, &mut children);
            }

            Some(build_outline_node(
                format!("{} {}", type_label, name),
                node_type,
                node,
                children,
            ))
        }
        "method_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Csharp, &mut children);
            }

            Some(build_outline_node(
                format!("method {}()", name),
                "method",
                node,
                children,
            ))
        }
        "constructor_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Csharp, &mut children);
            }

            Some(build_outline_node(
                format!("ctor {}()", name),
                "constructor",
                node,
                children,
            ))
        }
        "delegate_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("delegate {}", name),
                "delegate",
                node,
                Vec::new(),
            ))
        }
        "property_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("property {}", name),
                "property",
                node,
                Vec::new(),
            ))
        }
        "field_declaration" | "event_field_declaration" => {
            let mut names = Vec::new();
            let mut declarators = Vec::new();
            collect_named_descendants_by_kind(node, "variable_declarator", &mut declarators);
            for declarator in declarators {
                if let Some(name_node) = declarator.child_by_field_name("name") {
                    let name = get_node_text_preview(name_node, source, 80);
                    push_unique_name(&mut names, name);
                }
            }

            if names.is_empty() {
                return None;
            }

            let type_label = if node.kind() == "event_field_declaration" {
                "event"
            } else {
                "field"
            };

            Some(build_outline_node(
                format!("{} {}", type_label, names.join(", ")),
                type_label,
                node,
                Vec::new(),
            ))
        }
        "global_statement" => {
            let mut children = Vec::new();
            collect_symbol_outline_nodes(node, source, OutlineFileType::Php, &mut children);

            if children.len() == 1 {
                return children.into_iter().next();
            }

            None
        }
        "enum_member_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("member {}", name),
                "enum_member",
                node,
                Vec::new(),
            ))
        }
        _ => None,
    }
}
