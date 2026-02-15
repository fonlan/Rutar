use super::*;

pub(super) fn build_java_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
) -> Option<OutlineNode> {
    match node.kind() {
        "class_declaration"
        | "interface_declaration"
        | "enum_declaration"
        | "annotation_type_declaration"
        | "record_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let (type_label, node_type) = match node.kind() {
                "interface_declaration" => ("interface", "interface"),
                "enum_declaration" => ("enum", "enum"),
                "annotation_type_declaration" => ("@interface", "annotation"),
                "record_declaration" => ("record", "record"),
                _ => ("class", "class"),
            };

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Java, &mut children);
            }

            Some(build_outline_node(
                format!("{} {}", type_label, name),
                node_type,
                node,
                children,
            ))
        }
        "field_declaration" | "constant_declaration" => {
            let mut names = Vec::new();
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if !child.is_named() || child.kind() != "variable_declarator" {
                    continue;
                }

                if let Some(name_node) = child.child_by_field_name("name") {
                    let name = get_node_text_preview(name_node, source, 80);
                    if !name.trim().is_empty() {
                        names.push(name);
                    }
                }
            }

            if names.is_empty() {
                return None;
            }

            Some(build_outline_node(
                format!("field {}", names.join(", ")),
                "field",
                node,
                Vec::new(),
            ))
        }
        "method_declaration" | "constructor_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Java, &mut children);
            }

            let kind_label = if node.kind() == "constructor_declaration" {
                "constructor"
            } else {
                "method"
            };

            Some(build_outline_node(
                format!("{} {}()", kind_label, name),
                kind_label,
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
    fn build_java_outline_node_should_build_class_with_method_child() {
        let source = "class User { void run() {} }";
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&tree_sitter_java::LANGUAGE.into())
            .expect("set java parser");
        let tree = parser.parse(source, None).expect("parse java source");
        let root = tree.root_node();

        let mut nodes = Vec::new();
        collect_named_descendants_by_kind(root, "class_declaration", &mut nodes);
        let class_node = nodes.into_iter().next().expect("class node should exist");

        let outlined = build_java_outline_node(class_node, source).expect("outline should exist");
        assert_eq!(outlined.node_type, "class");
        assert_eq!(outlined.label, "class User");
        assert!(outlined
            .children
            .iter()
            .any(|node| node.node_type == "method" && node.label == "method run()"));
    }
}
