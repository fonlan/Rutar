use super::*;

pub(super) fn build_php_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
) -> Option<OutlineNode> {
    match node.kind() {
        "namespace_definition" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Php, &mut children);
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
        | "trait_declaration"
        | "enum_declaration"
        | "enum" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let (type_label, node_type) = match node.kind() {
                "interface_declaration" => ("interface", "interface"),
                "trait_declaration" => ("trait", "trait"),
                "enum_declaration" => ("enum", "enum"),
                _ => ("class", "class"),
            };

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Php, &mut children);
            }

            Some(build_outline_node(
                format!("{} {}", type_label, name),
                node_type,
                node,
                children,
            ))
        }
        "function_definition" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Php, &mut children);
            }

            Some(build_outline_node(
                format!("function {}()", name),
                "function",
                node,
                children,
            ))
        }
        "method_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Php, &mut children);
            }

            Some(build_outline_node(
                format!("method {}()", name),
                "method",
                node,
                children,
            ))
        }
        "property_declaration" => {
            let mut names = Vec::new();

            let mut property_elements = Vec::new();
            collect_named_descendants_by_kind(node, "property_element", &mut property_elements);
            for element in property_elements {
                if let Some(name_node) = element.child_by_field_name("name") {
                    let name = get_node_text_preview(name_node, source, 80);
                    push_unique_name(&mut names, name);
                }
            }

            if names.is_empty() {
                let mut variable_names = Vec::new();
                collect_named_descendants_by_kind(node, "variable_name", &mut variable_names);
                for variable_name in variable_names {
                    let name = get_node_text_preview(variable_name, source, 80);
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
        "const_declaration" => {
            let mut names = Vec::new();
            let mut elements = Vec::new();
            collect_named_descendants_by_kind(node, "const_element", &mut elements);
            for element in elements {
                if let Some(name_node) = element.child_by_field_name("name") {
                    let name = get_node_text_preview(name_node, source, 80);
                    push_unique_name(&mut names, name);
                    continue;
                }

                let mut name_nodes = Vec::new();
                collect_named_descendants_by_kind(element, "name", &mut name_nodes);
                if let Some(name_node) = name_nodes.first() {
                    let name = get_node_text_preview(*name_node, source, 80);
                    push_unique_name(&mut names, name);
                }
            }

            if names.is_empty() {
                return None;
            }

            Some(build_outline_node(
                format!("const {}", names.join(", ")),
                "const",
                node,
                Vec::new(),
            ))
        }
        "enum_case" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("case {}", name),
                "enum_case",
                node,
                Vec::new(),
            ))
        }
        _ => None,
    }
}
