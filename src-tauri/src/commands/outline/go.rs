use super::*;

fn collect_go_spec_names(spec_node: tree_sitter::Node<'_>, source: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut cursor = spec_node.walk();

    for child in spec_node.children(&mut cursor) {
        if !child.is_named() {
            continue;
        }

        if child.kind() == "identifier" {
            let name = get_node_text_preview(child, source, 80);
            if !name.trim().is_empty() {
                names.push(name);
            }
        }
    }

    names
}

fn build_go_const_spec_outline_node(
    spec_node: tree_sitter::Node<'_>,
    source: &str,
) -> Option<OutlineNode> {
    let names = collect_go_spec_names(spec_node, source);
    if names.is_empty() {
        return None;
    }

    Some(build_outline_node(
        format!("const {}", names.join(", ")),
        "const",
        spec_node,
        Vec::new(),
    ))
}

fn build_go_var_spec_outline_node(
    spec_node: tree_sitter::Node<'_>,
    source: &str,
) -> Option<OutlineNode> {
    let names = collect_go_spec_names(spec_node, source);
    if names.is_empty() {
        return None;
    }

    Some(build_outline_node(
        format!("var {}", names.join(", ")),
        "var",
        spec_node,
        Vec::new(),
    ))
}

fn build_go_type_spec_outline_node(
    spec_node: tree_sitter::Node<'_>,
    source: &str,
    is_alias: bool,
) -> Option<OutlineNode> {
    let name = spec_node
        .child_by_field_name("name")
        .map(|name_node| get_node_text_preview(name_node, source, 80))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "anonymous".to_string());

    let label = if is_alias {
        format!("type {} =", name)
    } else {
        let kind_suffix = spec_node
            .child_by_field_name("type")
            .map(|type_node| type_node.kind())
            .and_then(|kind| {
                if kind.contains("struct") {
                    Some(" struct")
                } else if kind.contains("interface") {
                    Some(" interface")
                } else {
                    None
                }
            })
            .unwrap_or("");

        format!("type {}{}", name, kind_suffix)
    };

    Some(build_outline_node(label, "type", spec_node, Vec::new()))
}

pub(super) fn build_go_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
) -> Option<OutlineNode> {
    match node.kind() {
        "const_declaration" => {
            let mut specs = Vec::new();
            collect_named_descendants_by_kind(node, "const_spec", &mut specs);

            let children: Vec<_> = specs
                .into_iter()
                .filter_map(|spec_node| build_go_const_spec_outline_node(spec_node, source))
                .collect();

            if children.is_empty() {
                return None;
            }

            let source_text = source
                .get(node.start_byte()..node.end_byte())
                .unwrap_or("")
                .trim_start();

            if children.len() == 1 && !source_text.starts_with("const (") {
                return children.into_iter().next();
            }

            Some(build_outline_node(
                "const".to_string(),
                "const_group",
                node,
                children,
            ))
        }
        "var_declaration" => {
            let mut specs = Vec::new();
            collect_named_descendants_by_kind(node, "var_spec", &mut specs);

            let children: Vec<_> = specs
                .into_iter()
                .filter_map(|spec_node| build_go_var_spec_outline_node(spec_node, source))
                .collect();

            if children.is_empty() {
                return None;
            }

            let source_text = source
                .get(node.start_byte()..node.end_byte())
                .unwrap_or("")
                .trim_start();

            if children.len() == 1 && !source_text.starts_with("var (") {
                return children.into_iter().next();
            }

            Some(build_outline_node(
                "var".to_string(),
                "var_group",
                node,
                children,
            ))
        }
        "type_declaration" => {
            let mut type_specs = Vec::new();
            let mut type_aliases = Vec::new();
            collect_named_descendants_by_kind(node, "type_spec", &mut type_specs);
            collect_named_descendants_by_kind(node, "type_alias", &mut type_aliases);

            let mut children: Vec<_> = type_aliases
                .into_iter()
                .filter_map(|spec_node| build_go_type_spec_outline_node(spec_node, source, true))
                .collect();
            children.extend(
                type_specs.into_iter().filter_map(|spec_node| {
                    build_go_type_spec_outline_node(spec_node, source, false)
                }),
            );

            if children.is_empty() {
                return None;
            }

            let source_text = source
                .get(node.start_byte()..node.end_byte())
                .unwrap_or("")
                .trim_start();

            if children.len() == 1 && !source_text.starts_with("type (") {
                return children.into_iter().next();
            }

            Some(build_outline_node(
                "type".to_string(),
                "type_group",
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
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Go, &mut children);
            }

            Some(build_outline_node(
                format!("func {}()", name),
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Go, &mut children);
            }

            Some(build_outline_node(
                format!("method {}()", name),
                "method",
                node,
                children,
            ))
        }
        "type_spec" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let type_label = node
                .child_by_field_name("type")
                .map(|type_node| type_node.kind())
                .unwrap_or("type");

            let kind_label = if type_label.contains("struct") {
                "struct"
            } else if type_label.contains("interface") {
                "interface"
            } else {
                "type"
            };

            Some(build_outline_node(
                format!("{} {}", kind_label, name),
                kind_label,
                node,
                Vec::new(),
            ))
        }
        _ => None,
    }
}
