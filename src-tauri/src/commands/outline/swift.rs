use super::*;

pub(super) fn build_swift_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
) -> Option<OutlineNode> {
    match node.kind() {
        "class_declaration" => {
            let declaration_kind = node
                .child_by_field_name("declaration_kind")
                .map(|kind_node| get_node_text_preview(kind_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "class".to_string());

            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let node_type = match declaration_kind.as_str() {
                "struct" => "struct",
                "enum" => "enum",
                "actor" => "actor",
                "extension" => "extension",
                _ => "class",
            };

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Swift, &mut children);
            }

            Some(build_outline_node(
                format!("{} {}", declaration_kind, name),
                node_type,
                node,
                children,
            ))
        }
        "protocol_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Swift, &mut children);
            }

            Some(build_outline_node(
                format!("protocol {}", name),
                "protocol",
                node,
                children,
            ))
        }
        "function_declaration" | "protocol_function_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Swift, &mut children);
            }

            Some(build_outline_node(
                format!("func {}()", name),
                "function",
                node,
                children,
            ))
        }
        "init_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "init".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Swift, &mut children);
            }

            let label = if name == "init" {
                "init()".to_string()
            } else {
                format!("init {}()", name)
            };

            Some(build_outline_node(label, "initializer", node, children))
        }
        "deinit_declaration" => {
            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Swift, &mut children);
            }

            Some(build_outline_node(
                "deinit".to_string(),
                "deinitializer",
                node,
                children,
            ))
        }
        "property_declaration" | "protocol_property_declaration" => {
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
        "typealias_declaration" => {
            let name = node
                .child_by_field_name("name")
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
                format!("case {}", name),
                "enum_case",
                node,
                Vec::new(),
            ))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_swift_outline_node_should_build_class_with_function_child() {
        let source = "class Service { func run() {} }";
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&tree_sitter_swift::LANGUAGE.into())
            .expect("set swift parser");
        let tree = parser.parse(source, None).expect("parse swift source");
        let root = tree.root_node();

        let mut nodes = Vec::new();
        collect_named_descendants_by_kind(root, "class_declaration", &mut nodes);
        let class_node = nodes.into_iter().next().expect("class node should exist");

        let outlined = build_swift_outline_node(class_node, source).expect("outline should exist");
        assert_eq!(outlined.node_type, "class");
        assert_eq!(outlined.label, "class Service");
        assert!(outlined
            .children
            .iter()
            .any(|node| node.node_type == "function" && node.label == "func run()"));
    }
}
