use super::*;

pub(super) fn build_javascript_outline_node(
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

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(
                    body,
                    source,
                    OutlineFileType::Javascript,
                    &mut children,
                );
            }

            Some(build_outline_node(
                format!("class {}", name),
                "class",
                node,
                children,
            ))
        }
        "method_definition" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(
                    body,
                    source,
                    OutlineFileType::Javascript,
                    &mut children,
                );
            }

            Some(build_outline_node(
                format!("{}()", name),
                "method",
                node,
                children,
            ))
        }
        "function_declaration" | "generator_function_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(
                    body,
                    source,
                    OutlineFileType::Javascript,
                    &mut children,
                );
            }

            Some(build_outline_node(
                format!("function {}()", name),
                "function",
                node,
                children,
            ))
        }
        "variable_declarator" => {
            let value_node = node.child_by_field_name("value")?;
            let value_kind = value_node.kind();
            if value_kind != "arrow_function"
                && value_kind != "function_expression"
                && value_kind != "function"
            {
                return None;
            }

            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = value_node.child_by_field_name("body") {
                collect_symbol_outline_nodes(
                    body,
                    source,
                    OutlineFileType::Javascript,
                    &mut children,
                );
            }

            Some(build_outline_node(
                format!("{} =>", name),
                "function",
                node,
                children,
            ))
        }
        _ => None,
    }
}
