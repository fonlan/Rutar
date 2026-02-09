use super::*;

pub(super) fn build_c_family_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
    file_type: OutlineFileType,
) -> Option<OutlineNode> {
    match node.kind() {
        "type_definition" => {
            let mut names = Vec::new();
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if !child.is_named() {
                    continue;
                }

                if child.kind().contains("declarator") {
                    if let Some(identifier) = find_first_identifier_text(child, source) {
                        push_unique_name(&mut names, identifier);
                    }
                }
            }

            if names.is_empty() {
                let mut identifiers = Vec::new();
                collect_named_descendants_by_kind(node, "identifier", &mut identifiers);
                collect_named_descendants_by_kind(node, "type_identifier", &mut identifiers);

                identifiers.sort_by_key(|candidate| candidate.start_byte());
                if let Some(last_identifier) = identifiers.last() {
                    let fallback_name = get_node_text_preview(*last_identifier, source, 80);
                    push_unique_name(&mut names, fallback_name);
                }
            }

            if names.is_empty() {
                return None;
            }

            Some(build_outline_node(
                format!("typedef {}", names.join(", ")),
                "typedef",
                node,
                Vec::new(),
            ))
        }
        "alias_declaration" => {
            if !matches!(file_type, OutlineFileType::Cpp) {
                return None;
            }

            let name = node
                .child_by_field_name("name")
                .and_then(|name_node| find_first_identifier_text(name_node, source))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("using {} =", name),
                "using_alias",
                node,
                Vec::new(),
            ))
        }
        "using_declaration" => {
            if !matches!(file_type, OutlineFileType::Cpp) {
                return None;
            }

            let mut names = Vec::new();
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if !child.is_named() {
                    continue;
                }

                let name = get_node_text_preview(child, source, 80);
                push_unique_name(&mut names, name);
            }

            if names.is_empty() {
                return None;
            }

            Some(build_outline_node(
                format!("using {}", names.join(", ")),
                "using",
                node,
                Vec::new(),
            ))
        }
        "field_declaration" => {
            let mut function_declarators = Vec::new();
            collect_named_descendants_by_kind(node, "function_declarator", &mut function_declarators);

            if !function_declarators.is_empty() {
                let mut method_names = Vec::new();
                for declarator in function_declarators {
                    if let Some(name) = find_first_identifier_text(declarator, source) {
                        push_unique_name(&mut method_names, name);
                    }
                }

                if !method_names.is_empty() {
                    return Some(build_outline_node(
                        format!("method {}()", method_names.join(", ")),
                        "method_decl",
                        node,
                        Vec::new(),
                    ));
                }
            }

            let mut field_names = Vec::new();
            if let Some(declarator) = node.child_by_field_name("declarator") {
                if let Some(name) = find_first_identifier_text(declarator, source) {
                    push_unique_name(&mut field_names, name);
                }
            }

            let mut field_identifiers = Vec::new();
            collect_named_descendants_by_kind(node, "field_identifier", &mut field_identifiers);
            for identifier in field_identifiers {
                let name = get_node_text_preview(identifier, source, 80);
                push_unique_name(&mut field_names, name);
            }

            if field_names.is_empty() {
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    if !child.is_named() {
                        continue;
                    }

                    if child.kind().contains("declarator") {
                        if let Some(name) = find_first_identifier_text(child, source) {
                            push_unique_name(&mut field_names, name);
                        }
                    }
                }
            }

            if field_names.is_empty() {
                return None;
            }

            Some(build_outline_node(
                format!("field {}", field_names.join(", ")),
                "field",
                node,
                Vec::new(),
            ))
        }
        "function_definition" => {
            let name = node
                .child_by_field_name("declarator")
                .and_then(|declarator| find_first_identifier_text(declarator, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, file_type, &mut children);
            }

            Some(build_outline_node(
                format!("fn {}()", name),
                "function",
                node,
                children,
            ))
        }
        "struct_specifier" => {
            let name = node
                .child_by_field_name("name")
                .and_then(|name_node| find_first_identifier_text(name_node, source))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, file_type, &mut children);
            }

            Some(build_outline_node(
                format!("struct {}", name),
                "struct",
                node,
                children,
            ))
        }
        "enum_specifier" => {
            let name = node
                .child_by_field_name("name")
                .and_then(|name_node| find_first_identifier_text(name_node, source))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("enum {}", name),
                "enum",
                node,
                Vec::new(),
            ))
        }
        "union_specifier" => {
            let name = node
                .child_by_field_name("name")
                .and_then(|name_node| find_first_identifier_text(name_node, source))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("union {}", name),
                "union",
                node,
                Vec::new(),
            ))
        }
        "class_specifier" => {
            let name = node
                .child_by_field_name("name")
                .and_then(|name_node| find_first_identifier_text(name_node, source))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, file_type, &mut children);
            }

            Some(build_outline_node(
                format!("class {}", name),
                "class",
                node,
                children,
            ))
        }
        "namespace_definition" => {
            let name = node
                .child_by_field_name("name")
                .and_then(|name_node| find_first_identifier_text(name_node, source))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, file_type, &mut children);
            }

            Some(build_outline_node(
                format!("namespace {}", name),
                "namespace",
                node,
                children,
            ))
        }
        _ => None,
    }
}





