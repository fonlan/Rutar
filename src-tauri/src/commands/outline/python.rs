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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_python_outline_node_should_build_class_with_function_child() {
        let source = "class Service:\n    def run(self):\n        pass\n";
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&tree_sitter_python::LANGUAGE.into())
            .expect("set python parser");
        let tree = parser.parse(source, None).expect("parse python source");
        let root = tree.root_node();

        let mut nodes = Vec::new();
        collect_named_descendants_by_kind(root, "class_definition", &mut nodes);
        let class_node = nodes.into_iter().next().expect("class node should exist");

        let outlined =
            build_python_outline_node(class_node, source).expect("outline should exist");
        assert_eq!(outlined.node_type, "class");
        assert_eq!(outlined.label, "class Service");
        assert!(outlined
            .children
            .iter()
            .any(|node| node.node_type == "function" && node.label == "def run()"));
    }
}
