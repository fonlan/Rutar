use super::*;

pub(super) fn build_python_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
) -> Option<OutlineNode> {
    match node.kind() {
        "decorated_definition" => node
            .child_by_field_name("definition")
            .and_then(|definition| build_python_outline_node(definition, source)),
        "class_definition" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Python, &mut children);
            }

            Some(build_outline_node(
                format!("class {}", name),
                "class",
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Python, &mut children);
            }

            Some(build_outline_node(
                format!("def {}()", name),
                "function",
                node,
                children,
            ))
        }
        _ => None,
    }
}
