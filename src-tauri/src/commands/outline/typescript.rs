use super::*;

pub(super) fn build_typescript_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
) -> Option<OutlineNode> {
    let source_text = source
        .get(node.start_byte()..node.end_byte())
        .unwrap_or("")
        .trim_start();

    let add_declare_prefix = |label: String| -> String {
        if source_text.starts_with("declare ") && !label.starts_with("declare ") {
            format!("declare {}", label)
        } else {
            label
        }
    };

    let add_export_prefix = |label: String| -> String {
        if source_text.starts_with("export default ") && !label.starts_with("export default ") {
            format!("export default {}", label)
        } else if source_text.starts_with("export ") && !label.starts_with("export ") {
            format!("export {}", label)
        } else {
            label
        }
    };

    let format_ts_module_name = |name: String| -> String {
        name.trim()
            .trim_matches('"')
            .replace(" . ", ".")
            .replace(" .", ".")
            .replace(". ", ".")
    };

    match node.kind() {
        "export_statement" => {
            let declaration = if let Some(found) = node.child_by_field_name("declaration") {
                found
            } else {
                let mut cursor = node.walk();
                let first_named = node.children(&mut cursor).find(|child| child.is_named());
                let Some(found) = first_named else {
                    return None;
                };
                found
            };

            let mut outlined = build_typescript_outline_node(declaration, source)?;
            if source_text.starts_with("export default ") {
                if !outlined.label.starts_with("export default ") {
                    outlined.label = format!("export default {}", outlined.label);
                }
            } else if source_text.starts_with("export ") && !outlined.label.starts_with("export ") {
                outlined.label = format!("export {}", outlined.label);
            }

            Some(outlined)
        }
        "export_clause" => {
            let mut parts = Vec::new();
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if !child.is_named() {
                    continue;
                }

                match child.kind() {
                    "export_specifier" => {
                        let name = child
                            .child_by_field_name("name")
                            .map(|name_node| get_node_text_preview(name_node, source, 80))
                            .filter(|value| !value.trim().is_empty())
                            .unwrap_or_else(|| get_node_text_preview(child, source, 80));

                        let alias = child
                            .child_by_field_name("alias")
                            .map(|alias_node| get_node_text_preview(alias_node, source, 80))
                            .filter(|value| !value.trim().is_empty());

                        if let Some(alias_name) = alias {
                            if alias_name != name {
                                parts.push(format!("{} as {}", name, alias_name));
                            } else {
                                parts.push(name);
                            }
                        } else {
                            parts.push(name);
                        }
                    }
                    "namespace_export" => {
                        let exported = get_node_text_preview(child, source, 80);
                        if !exported.trim().is_empty() {
                            parts.push(format!("* as {}", exported.trim_matches('"')));
                        }
                    }
                    _ => {}
                }
            }

            if parts.is_empty() {
                None
            } else {
                Some(build_outline_node(
                    format!("export {{ {} }}", parts.join(", ")),
                    "export",
                    node,
                    Vec::new(),
                ))
            }
        }
        "ambient_declaration" => {
            if source_text.starts_with("declare global") {
                let mut children = Vec::new();
                let block = {
                    let mut cursor = node.walk();
                    let found_block = node
                        .children(&mut cursor)
                        .find(|child| child.is_named() && child.kind() == "statement_block");
                    found_block
                };

                if let Some(block) = block {
                    collect_symbol_outline_nodes(
                        block,
                        source,
                        OutlineFileType::Typescript,
                        &mut children,
                    );
                }

                return Some(build_outline_node(
                    "declare global".to_string(),
                    "namespace",
                    node,
                    children,
                ));
            }

            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if !child.is_named() || child.kind() == "statement_block" {
                    continue;
                }

                if let Some(mut declaration) = build_typescript_outline_node(child, source) {
                    if !declaration.label.starts_with("declare ") {
                        declaration.label = format!("declare {}", declaration.label);
                    }
                    return Some(declaration);
                }
            }

            None
        }
        "internal_module" | "module" => {
            let raw_name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());
            let name = format_ts_module_name(raw_name);

            let module_keyword = if source_text.starts_with("module ") {
                "module"
            } else {
                "namespace"
            };

            let module_label = if source_text.starts_with("global") {
                "global".to_string()
            } else {
                format!("{} {}", module_keyword, name)
            };

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(
                    body,
                    source,
                    OutlineFileType::Typescript,
                    &mut children,
                );
            }

            Some(build_outline_node(
                add_export_prefix(add_declare_prefix(module_label)),
                "namespace",
                node,
                children,
            ))
        }
        "interface_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(
                    body,
                    source,
                    OutlineFileType::Typescript,
                    &mut children,
                );
            }

            Some(build_outline_node(
                add_export_prefix(add_declare_prefix(format!("interface {}", name))),
                "interface",
                node,
                children,
            ))
        }
        "type_alias_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                add_export_prefix(add_declare_prefix(format!("type {}", name))),
                "type",
                node,
                Vec::new(),
            ))
        }
        "enum_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(
                    body,
                    source,
                    OutlineFileType::Typescript,
                    &mut children,
                );
            }

            let enum_prefix = if source_text.starts_with("const enum") {
                "const enum"
            } else {
                "enum"
            };

            Some(build_outline_node(
                add_export_prefix(add_declare_prefix(format!("{} {}", enum_prefix, name))),
                "enum",
                node,
                children,
            ))
        }
        "class_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(
                    body,
                    source,
                    OutlineFileType::Typescript,
                    &mut children,
                );
            }

            Some(build_outline_node(
                add_export_prefix(add_declare_prefix(format!("class {}", name))),
                "class",
                node,
                children,
            ))
        }
        "method_definition" | "method_signature" | "abstract_method_signature" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(
                    body,
                    source,
                    OutlineFileType::Typescript,
                    &mut children,
                );
            }

            Some(build_outline_node(
                add_export_prefix(add_declare_prefix(format!("{}()", name))),
                "method",
                node,
                children,
            ))
        }
        "function_declaration" | "generator_function_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(
                    body,
                    source,
                    OutlineFileType::Typescript,
                    &mut children,
                );
            }

            Some(build_outline_node(
                add_export_prefix(add_declare_prefix(format!("function {}()", name))),
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
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = value_node.child_by_field_name("body") {
                collect_symbol_outline_nodes(
                    body,
                    source,
                    OutlineFileType::Typescript,
                    &mut children,
                );
            }

            Some(build_outline_node(
                add_export_prefix(add_declare_prefix(format!("{} =>", name))),
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
    fn build_typescript_outline_node_should_build_interface_node() {
        let source = "interface User { id: number }";
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
            .expect("set typescript parser");
        let tree = parser
            .parse(source, None)
            .expect("parse typescript source");
        let root = tree.root_node();

        let mut nodes = Vec::new();
        collect_named_descendants_by_kind(root, "interface_declaration", &mut nodes);
        let interface_node = nodes.into_iter().next().expect("interface node should exist");

        let outlined =
            build_typescript_outline_node(interface_node, source).expect("outline should exist");
        assert_eq!(outlined.node_type, "interface");
        assert_eq!(outlined.label, "interface User");
    }
}
