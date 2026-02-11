use super::*;

pub(super) fn build_kotlin_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
) -> Option<OutlineNode> {
    match node.kind() {
        "class_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let source_text = source
                .get(node.start_byte()..node.end_byte())
                .unwrap_or("")
                .trim_start();
            let (type_label, node_type) = if source_text.starts_with("interface ") {
                ("interface", "interface")
            } else if source_text.starts_with("enum class ") {
                ("enum class", "enum")
            } else {
                ("class", "class")
            };

            let mut children = Vec::new();
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if !child.is_named() {
                    continue;
                }

                if child.kind() == "class_body" || child.kind() == "enum_class_body" {
                    collect_symbol_outline_nodes(
                        child,
                        source,
                        OutlineFileType::Kotlin,
                        &mut children,
                    );
                    break;
                }
            }

            Some(build_outline_node(
                format!("{} {}", type_label, name),
                node_type,
                node,
                children,
            ))
        }
        "object_declaration" | "companion_object" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| {
                    if node.kind() == "companion_object" {
                        "companion".to_string()
                    } else {
                        "anonymous".to_string()
                    }
                });

            let mut children = Vec::new();
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if !child.is_named() {
                    continue;
                }

                if child.kind() == "class_body" {
                    collect_symbol_outline_nodes(
                        child,
                        source,
                        OutlineFileType::Kotlin,
                        &mut children,
                    );
                    break;
                }
            }

            Some(build_outline_node(
                format!("object {}", name),
                "object",
                node,
                children,
            ))
        }
        "function_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if !child.is_named() {
                    continue;
                }

                if child.kind() == "function_body" {
                    collect_symbol_outline_nodes(
                        child,
                        source,
                        OutlineFileType::Kotlin,
                        &mut children,
                    );
                    break;
                }
            }

            Some(build_outline_node(
                format!("fun {}()", name),
                "function",
                node,
                children,
            ))
        }
        "secondary_constructor" => {
            let mut children = Vec::new();
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if !child.is_named() {
                    continue;
                }

                if child.kind() == "block" {
                    collect_symbol_outline_nodes(
                        child,
                        source,
                        OutlineFileType::Kotlin,
                        &mut children,
                    );
                    break;
                }
            }

            Some(build_outline_node(
                "constructor()".to_string(),
                "constructor",
                node,
                children,
            ))
        }
        "property_declaration" => {
            let mut names = Vec::new();
            let mut declarations = Vec::new();
            collect_named_descendants_by_kind(node, "variable_declaration", &mut declarations);
            for declaration in declarations {
                let mut identifiers = Vec::new();
                collect_named_descendants_by_kind(declaration, "identifier", &mut identifiers);
                identifiers.sort_by_key(|candidate| candidate.start_byte());

                if let Some(identifier) = identifiers.first() {
                    let name = get_node_text_preview(*identifier, source, 80);
                    push_unique_name(&mut names, name);
                }
            }

            if names.is_empty() {
                return None;
            }

            Some(build_outline_node(
                format!("property {}", names.join(", ")),
                "property",
                node,
                Vec::new(),
            ))
        }
        "type_alias" => {
            let name = node
                .child_by_field_name("type")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("typealias {}", name),
                "type_alias",
                node,
                Vec::new(),
            ))
        }
        "enum_entry" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("enum {}", name),
                "enum_entry",
                node,
                Vec::new(),
            ))
        }
        _ => None,
    }
}
