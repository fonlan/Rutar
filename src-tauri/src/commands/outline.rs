use crate::state::AppState;
use tauri::State;
use tree_sitter::{Language, Parser};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineNode {
    label: String,
    node_type: String,
    line: usize,
    column: usize,
    children: Vec<OutlineNode>,
}

#[derive(Clone, Copy)]
enum OutlineFileType {
    Json,
    Yaml,
    Xml,
    Toml,
    Ini,
    Python,
    Javascript,
    Typescript,
    C,
    Cpp,
    Go,
    Java,
    Rust,
    Csharp,
    Php,
    Kotlin,
    Swift,
}

fn truncate_preview(value: &str, max_len: usize) -> String {
    if value.chars().count() <= max_len {
        return value.to_string();
    }

    let mut preview: String = value.chars().take(max_len).collect();
    preview.push_str("...");
    preview
}

fn parse_outline_file_type(file_type: &str) -> Option<OutlineFileType> {
    match file_type.trim().to_lowercase().as_str() {
        "json" => Some(OutlineFileType::Json),
        "yaml" | "yml" => Some(OutlineFileType::Yaml),
        "xml" => Some(OutlineFileType::Xml),
        "toml" => Some(OutlineFileType::Toml),
        "ini" | "cfg" | "conf" | "cnf" | "properties" => Some(OutlineFileType::Ini),
        "python" | "py" => Some(OutlineFileType::Python),
        "javascript" | "js" => Some(OutlineFileType::Javascript),
        "typescript" | "ts" | "tsx" => Some(OutlineFileType::Typescript),
        "c" => Some(OutlineFileType::C),
        "cpp" | "c++" => Some(OutlineFileType::Cpp),
        "go" => Some(OutlineFileType::Go),
        "java" => Some(OutlineFileType::Java),
        "rust" | "rs" => Some(OutlineFileType::Rust),
        "csharp" | "c#" | "cs" => Some(OutlineFileType::Csharp),
        "php" => Some(OutlineFileType::Php),
        "kotlin" | "kt" | "kts" => Some(OutlineFileType::Kotlin),
        "swift" => Some(OutlineFileType::Swift),
        _ => None,
    }
}

fn get_outline_language(file_type: OutlineFileType) -> Option<Language> {
    match file_type {
        OutlineFileType::Json => Some(tree_sitter_json::LANGUAGE.into()),
        OutlineFileType::Yaml => Some(tree_sitter_yaml::LANGUAGE.into()),
        OutlineFileType::Xml => Some(tree_sitter_xml::LANGUAGE_XML.into()),
        OutlineFileType::Toml => Some(tree_sitter_toml_ng::LANGUAGE.into()),
        OutlineFileType::Python => Some(tree_sitter_python::LANGUAGE.into()),
        OutlineFileType::Javascript => Some(tree_sitter_javascript::LANGUAGE.into()),
        OutlineFileType::Typescript => Some(tree_sitter_typescript::LANGUAGE_TSX.into()),
        OutlineFileType::C => Some(tree_sitter_c::LANGUAGE.into()),
        OutlineFileType::Cpp => Some(tree_sitter_cpp::LANGUAGE.into()),
        OutlineFileType::Go => Some(tree_sitter_go::LANGUAGE.into()),
        OutlineFileType::Java => Some(tree_sitter_java::LANGUAGE.into()),
        OutlineFileType::Rust => Some(tree_sitter_rust::LANGUAGE.into()),
        OutlineFileType::Csharp => Some(tree_sitter_c_sharp::LANGUAGE.into()),
        OutlineFileType::Php => Some(tree_sitter_php::LANGUAGE_PHP.into()),
        OutlineFileType::Kotlin => Some(tree_sitter_kotlin_ng::LANGUAGE.into()),
        OutlineFileType::Swift => Some(tree_sitter_swift::LANGUAGE.into()),
        OutlineFileType::Ini => None,
    }
}

fn get_node_text_preview(node: tree_sitter::Node<'_>, source: &str, max_len: usize) -> String {
    let snippet = source
        .get(node.start_byte()..node.end_byte())
        .unwrap_or("")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    truncate_preview(snippet.trim(), max_len)
}

fn first_named_child(node: tree_sitter::Node<'_>) -> Option<tree_sitter::Node<'_>> {
    let mut cursor = node.walk();
    let first = node.children(&mut cursor).find(|child| child.is_named());
    first
}

fn second_named_child(node: tree_sitter::Node<'_>) -> Option<tree_sitter::Node<'_>> {
    let mut cursor = node.walk();
    let mut found_first = false;

    for child in node.children(&mut cursor) {
        if !child.is_named() {
            continue;
        }

        if !found_first {
            found_first = true;
            continue;
        }

        return Some(child);
    }

    None
}

fn is_pair_kind(kind: &str) -> bool {
    kind == "pair" || kind.contains("pair")
}

fn is_container_kind(file_type: OutlineFileType, kind: &str) -> bool {
    match file_type {
        OutlineFileType::Json => kind == "object" || kind == "array",
        OutlineFileType::Yaml => {
            kind == "document"
                || kind == "stream"
                || kind.contains("mapping")
                || kind.contains("sequence")
        }
        OutlineFileType::Xml => kind == "document" || kind == "element",
        OutlineFileType::Toml => {
            kind == "document"
                || kind == "table"
                || kind == "table_array_element"
                || kind == "array"
                || kind == "inline_table"
        }
        OutlineFileType::Ini
        | OutlineFileType::Python
        | OutlineFileType::Javascript
        | OutlineFileType::Typescript
        | OutlineFileType::C
        | OutlineFileType::Cpp
        | OutlineFileType::Go
        | OutlineFileType::Java
        | OutlineFileType::Rust
        | OutlineFileType::Csharp
        | OutlineFileType::Php
        | OutlineFileType::Kotlin
        | OutlineFileType::Swift => false,
    }
}

fn is_scalar_value_kind(file_type: OutlineFileType, kind: &str) -> bool {
    !is_pair_kind(kind) && !is_container_kind(file_type, kind)
}

fn format_outline_label(
    node: tree_sitter::Node<'_>,
    source: &str,
    file_type: OutlineFileType,
    has_named_children: bool,
) -> String {
    let kind = node.kind();

    match file_type {
        OutlineFileType::Json => match kind {
            "object" => "{}".to_string(),
            "array" => "[]".to_string(),
            "pair" => {
                if let Some(key_node) = first_named_child(node) {
                    let key = get_node_text_preview(key_node, source, 60).trim_matches('"').to_string();

                    if let Some(value_node) = second_named_child(node) {
                        if is_scalar_value_kind(file_type, value_node.kind()) {
                            return format!("{}: {}", key, get_node_text_preview(value_node, source, 80));
                        }
                    }

                    return format!("{}:", key);
                }

                kind.to_string()
            }
            "string" | "number" | "true" | "false" | "null" => {
                get_node_text_preview(node, source, 80)
            }
            _ => {
                if has_named_children {
                    kind.to_string()
                } else {
                    get_node_text_preview(node, source, 80)
                }
            }
        },
        OutlineFileType::Yaml => {
            if kind.contains("mapping") {
                return "{}".to_string();
            }

            if kind.contains("sequence") {
                return "[]".to_string();
            }

            if kind.contains("pair") {
                if let Some(key_node) = first_named_child(node) {
                    let key = get_node_text_preview(key_node, source, 60);

                    if let Some(value_node) = second_named_child(node) {
                        if is_scalar_value_kind(file_type, value_node.kind()) {
                            return format!("{}: {}", key, get_node_text_preview(value_node, source, 80));
                        }
                    }

                    return format!("{}:", key);
                }
            }

            if has_named_children {
                kind.to_string()
            } else {
                get_node_text_preview(node, source, 80)
            }
        }
        OutlineFileType::Xml => {
            if kind == "element" {
                let preview = get_node_text_preview(node, source, 80);
                if let Some(raw_name) = preview
                    .trim_start_matches('<')
                    .split([' ', '>', '/'])
                    .find(|part| !part.trim().is_empty())
                {
                    return format!("<{}>", raw_name);
                }
            }

            if kind == "attribute" {
                let preview = get_node_text_preview(node, source, 80);
                return format!("@{}", preview);
            }

            if kind == "text" {
                return format!("#text {}", get_node_text_preview(node, source, 60));
            }

            if has_named_children {
                kind.to_string()
            } else {
                get_node_text_preview(node, source, 80)
            }
        }
        OutlineFileType::Toml => {
            if kind == "table" || kind == "table_array_element" || kind == "inline_table" {
                let preview = get_node_text_preview(node, source, 80);
                return preview
                    .lines()
                    .next()
                    .map(str::trim)
                    .map(str::to_string)
                    .unwrap_or_else(|| "table".to_string());
            }

            if kind == "array" {
                return "[]".to_string();
            }

            if kind == "pair" {
                if let Some(key_node) = first_named_child(node) {
                    let key = get_node_text_preview(key_node, source, 60)
                        .trim_matches('"')
                        .to_string();

                    if let Some(value_node) = second_named_child(node) {
                        if is_scalar_value_kind(file_type, value_node.kind()) {
                            return format!("{} = {}", key, get_node_text_preview(value_node, source, 80));
                        }
                    }

                    return format!("{} =", key);
                }
            }

            if has_named_children {
                kind.to_string()
            } else {
                get_node_text_preview(node, source, 80)
            }
        }
        OutlineFileType::Ini
        | OutlineFileType::Python
        | OutlineFileType::Javascript
        | OutlineFileType::Typescript
        | OutlineFileType::C
        | OutlineFileType::Cpp
        | OutlineFileType::Go
        | OutlineFileType::Java
        | OutlineFileType::Rust
        | OutlineFileType::Csharp
        | OutlineFileType::Php
        | OutlineFileType::Kotlin
        | OutlineFileType::Swift => {
            if has_named_children {
                kind.to_string()
            } else {
                get_node_text_preview(node, source, 80)
            }
        }
    }
}

fn build_tree_sitter_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
    file_type: OutlineFileType,
) -> OutlineNode {
    let mut children = Vec::new();
    let kind = node.kind();

    if is_pair_kind(kind) {
        if let Some(value_node) = second_named_child(node) {
            if !is_scalar_value_kind(file_type, value_node.kind()) {
                children.push(build_tree_sitter_outline_node(value_node, source, file_type));
            }
        }
    } else if is_container_kind(file_type, kind) {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.is_named() {
                children.push(build_tree_sitter_outline_node(child, source, file_type));
            }
        }
    }

    let has_named_children = !children.is_empty();
    let label = format_outline_label(node, source, file_type, has_named_children);
    let start = node.start_position();

    OutlineNode {
        label,
        node_type: node.kind().to_string(),
        line: start.row + 1,
        column: start.column + 1,
        children,
    }
}

fn build_outline_node(
    label: String,
    node_type: &str,
    node: tree_sitter::Node<'_>,
    children: Vec<OutlineNode>,
) -> OutlineNode {
    let start = node.start_position();
    OutlineNode {
        label,
        node_type: node_type.to_string(),
        line: start.row + 1,
        column: start.column + 1,
        children,
    }
}

fn find_first_identifier_text(node: tree_sitter::Node<'_>, source: &str) -> Option<String> {
    let kind = node.kind();
    if kind.ends_with("identifier")
        || kind == "field_identifier"
        || kind == "namespace_identifier"
        || kind == "type_identifier"
    {
        let value = get_node_text_preview(node, source, 80).trim().to_string();
        if !value.is_empty() {
            return Some(value);
        }
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if let Some(found) = find_first_identifier_text(child, source) {
            return Some(found);
        }
    }

    None
}

fn collect_symbol_outline_nodes(
    node: tree_sitter::Node<'_>,
    source: &str,
    file_type: OutlineFileType,
    output: &mut Vec<OutlineNode>,
) {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if !child.is_named() {
            continue;
        }

        if let Some(symbol_node) = build_symbol_outline_node(child, source, file_type) {
            output.push(symbol_node);
        } else {
            collect_symbol_outline_nodes(child, source, file_type, output);
        }
    }
}

fn build_python_outline_node(node: tree_sitter::Node<'_>, source: &str) -> Option<OutlineNode> {
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

fn build_javascript_outline_node(
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Javascript, &mut children);
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Javascript, &mut children);
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Javascript, &mut children);
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Javascript, &mut children);
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

fn build_typescript_outline_node(
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Typescript, &mut children);
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Typescript, &mut children);
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Typescript, &mut children);
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Typescript, &mut children);
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Typescript, &mut children);
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Typescript, &mut children);
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
                collect_symbol_outline_nodes(body, source, OutlineFileType::Typescript, &mut children);
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

fn collect_named_descendants_by_kind<'tree>(
    node: tree_sitter::Node<'tree>,
    kind: &str,
    output: &mut Vec<tree_sitter::Node<'tree>>,
) {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if !child.is_named() {
            continue;
        }

        if child.kind() == kind {
            output.push(child);
            continue;
        }

        collect_named_descendants_by_kind(child, kind, output);
    }
}

fn push_unique_name(names: &mut Vec<String>, candidate: String) {
    let normalized = candidate.trim().to_string();
    if normalized.is_empty() {
        return;
    }

    if !names.iter().any(|existing| existing == &normalized) {
        names.push(normalized);
    }
}

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

fn build_go_outline_node(node: tree_sitter::Node<'_>, source: &str) -> Option<OutlineNode> {
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
                type_specs
                    .into_iter()
                    .filter_map(|spec_node| build_go_type_spec_outline_node(spec_node, source, false)),
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

fn build_java_outline_node(node: tree_sitter::Node<'_>, source: &str) -> Option<OutlineNode> {
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

fn build_rust_outline_node(node: tree_sitter::Node<'_>, source: &str) -> Option<OutlineNode> {
    let source_text = source
        .get(node.start_byte()..node.end_byte())
        .unwrap_or("")
        .trim_start();

    match node.kind() {
        "mod_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Rust, &mut children);
            }

            Some(build_outline_node(
                format!("mod {}", name),
                "module",
                node,
                children,
            ))
        }
        "const_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("const {}", name),
                "const",
                node,
                Vec::new(),
            ))
        }
        "static_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let static_label = if source_text.contains("static mut") {
                format!("static mut {}", name)
            } else {
                format!("static {}", name)
            };

            Some(build_outline_node(
                static_label,
                "static",
                node,
                Vec::new(),
            ))
        }
        "type_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("type {}", name),
                "type",
                node,
                Vec::new(),
            ))
        }
        "union_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Rust, &mut children);
            }

            Some(build_outline_node(
                format!("union {}", name),
                "union",
                node,
                children,
            ))
        }
        "macro_definition" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("macro {}!", name),
                "macro",
                node,
                Vec::new(),
            ))
        }
        "extern_crate_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let alias = node
                .child_by_field_name("alias")
                .map(|alias_node| get_node_text_preview(alias_node, source, 80))
                .filter(|value| !value.trim().is_empty());

            let label = if let Some(alias_name) = alias {
                format!("extern crate {} as {}", name, alias_name)
            } else {
                format!("extern crate {}", name)
            };

            Some(build_outline_node(label, "extern_crate", node, Vec::new()))
        }
        "function_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Rust, &mut children);
            }

            Some(build_outline_node(
                format!("fn {}()", name),
                "function",
                node,
                children,
            ))
        }
        "impl_item" => {
            let target = node
                .child_by_field_name("type")
                .map(|type_node| get_node_text_preview(type_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Rust, &mut children);
            }

            Some(build_outline_node(
                format!("impl {}", target),
                "impl",
                node,
                children,
            ))
        }
        "struct_item" | "enum_item" | "trait_item" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let type_label = if node.kind() == "enum_item" {
                "enum"
            } else if node.kind() == "trait_item" {
                "trait"
            } else {
                "struct"
            };

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Rust, &mut children);
            }

            Some(build_outline_node(
                format!("{} {}", type_label, name),
                type_label,
                node,
                children,
            ))
        }
        _ => None,
    }
}

fn build_c_family_outline_node(
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

fn build_csharp_outline_node(node: tree_sitter::Node<'_>, source: &str) -> Option<OutlineNode> {
    match node.kind() {
        "namespace_declaration" | "file_scoped_namespace_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Csharp, &mut children);
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
        | "struct_declaration"
        | "record_declaration"
        | "enum_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let (type_label, node_type) = match node.kind() {
                "interface_declaration" => ("interface", "interface"),
                "struct_declaration" => ("struct", "struct"),
                "record_declaration" => ("record", "record"),
                "enum_declaration" => ("enum", "enum"),
                _ => ("class", "class"),
            };

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Csharp, &mut children);
            }

            Some(build_outline_node(
                format!("{} {}", type_label, name),
                node_type,
                node,
                children,
            ))
        }
        "method_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Csharp, &mut children);
            }

            Some(build_outline_node(
                format!("method {}()", name),
                "method",
                node,
                children,
            ))
        }
        "constructor_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            let mut children = Vec::new();
            if let Some(body) = node.child_by_field_name("body") {
                collect_symbol_outline_nodes(body, source, OutlineFileType::Csharp, &mut children);
            }

            Some(build_outline_node(
                format!("ctor {}()", name),
                "constructor",
                node,
                children,
            ))
        }
        "delegate_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("delegate {}", name),
                "delegate",
                node,
                Vec::new(),
            ))
        }
        "property_declaration" => {
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
        "field_declaration" | "event_field_declaration" => {
            let mut names = Vec::new();
            let mut declarators = Vec::new();
            collect_named_descendants_by_kind(node, "variable_declarator", &mut declarators);
            for declarator in declarators {
                if let Some(name_node) = declarator.child_by_field_name("name") {
                    let name = get_node_text_preview(name_node, source, 80);
                    push_unique_name(&mut names, name);
                }
            }

            if names.is_empty() {
                return None;
            }

            let type_label = if node.kind() == "event_field_declaration" {
                "event"
            } else {
                "field"
            };

            Some(build_outline_node(
                format!("{} {}", type_label, names.join(", ")),
                type_label,
                node,
                Vec::new(),
            ))
        }
        "global_statement" => {
            let mut children = Vec::new();
            collect_symbol_outline_nodes(node, source, OutlineFileType::Php, &mut children);

            if children.len() == 1 {
                return children.into_iter().next();
            }

            None
        }
        "enum_member_declaration" => {
            let name = node
                .child_by_field_name("name")
                .map(|name_node| get_node_text_preview(name_node, source, 80))
                .or_else(|| find_first_identifier_text(node, source))
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anonymous".to_string());

            Some(build_outline_node(
                format!("member {}", name),
                "enum_member",
                node,
                Vec::new(),
            ))
        }
        _ => None,
    }
}

fn build_php_outline_node(node: tree_sitter::Node<'_>, source: &str) -> Option<OutlineNode> {
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
        "class_declaration" | "interface_declaration" | "trait_declaration" | "enum_declaration" | "enum" => {
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

fn build_kotlin_outline_node(node: tree_sitter::Node<'_>, source: &str) -> Option<OutlineNode> {
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
                    collect_symbol_outline_nodes(child, source, OutlineFileType::Kotlin, &mut children);
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
                    collect_symbol_outline_nodes(child, source, OutlineFileType::Kotlin, &mut children);
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
                    collect_symbol_outline_nodes(child, source, OutlineFileType::Kotlin, &mut children);
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
                    collect_symbol_outline_nodes(child, source, OutlineFileType::Kotlin, &mut children);
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

fn build_swift_outline_node(node: tree_sitter::Node<'_>, source: &str) -> Option<OutlineNode> {
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

fn build_symbol_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
    file_type: OutlineFileType,
) -> Option<OutlineNode> {
    match file_type {
        OutlineFileType::Python => build_python_outline_node(node, source),
        OutlineFileType::Javascript => build_javascript_outline_node(node, source),
        OutlineFileType::Typescript => build_typescript_outline_node(node, source),
        OutlineFileType::C | OutlineFileType::Cpp => build_c_family_outline_node(node, source, file_type),
        OutlineFileType::Go => build_go_outline_node(node, source),
        OutlineFileType::Java => build_java_outline_node(node, source),
        OutlineFileType::Rust => build_rust_outline_node(node, source),
        OutlineFileType::Csharp => build_csharp_outline_node(node, source),
        OutlineFileType::Php => build_php_outline_node(node, source),
        OutlineFileType::Kotlin => build_kotlin_outline_node(node, source),
        OutlineFileType::Swift => build_swift_outline_node(node, source),
        OutlineFileType::Json
        | OutlineFileType::Yaml
        | OutlineFileType::Xml
        | OutlineFileType::Toml
        | OutlineFileType::Ini => None,
    }
}

fn parse_ini_outline(source: &str) -> Vec<OutlineNode> {
    let mut roots = Vec::new();
    let mut current_section_index: Option<usize> = None;

    for (row, line) in source.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }

        let column = line
            .chars()
            .position(|ch| !ch.is_whitespace())
            .map(|value| value + 1)
            .unwrap_or(1);

        if trimmed.starts_with('[') && trimmed.ends_with(']') && trimmed.len() >= 2 {
            let section_name = trimmed[1..trimmed.len() - 1].trim();
            let section_node = OutlineNode {
                label: if section_name.is_empty() {
                    "[section]".to_string()
                } else {
                    format!("[{}]", section_name)
                },
                node_type: "section".to_string(),
                line: row + 1,
                column,
                children: Vec::new(),
            };
            roots.push(section_node);
            current_section_index = Some(roots.len() - 1);
            continue;
        }

        let key = trimmed
            .split_once('=')
            .map(|(left, _)| left.trim())
            .or_else(|| trimmed.split_once(':').map(|(left, _)| left.trim()));

        let Some(parsed_key) = key else {
            continue;
        };

        if parsed_key.is_empty() {
            continue;
        }

        let pair_node = OutlineNode {
            label: format!("{} =", parsed_key),
            node_type: "pair".to_string(),
            line: row + 1,
            column,
            children: Vec::new(),
        };

        if let Some(section_index) = current_section_index {
            if let Some(section_node) = roots.get_mut(section_index) {
                section_node.children.push(pair_node);
                continue;
            }
        }

        roots.push(pair_node);
    }

    roots
}


pub fn get_outline_impl(
    state: State<'_, AppState>,
    id: String,
    file_type: String,
) -> Result<Vec<OutlineNode>, String> {
    if let Some(doc) = state.documents.get(&id) {
        let source = doc.rope.to_string();
        let outline_type = parse_outline_file_type(&file_type)
            .ok_or_else(|| "Unsupported outline type".to_string())?;

        if matches!(outline_type, OutlineFileType::Ini) {
            return Ok(parse_ini_outline(&source));
        }

        let language = get_outline_language(outline_type)
            .ok_or_else(|| "Unsupported outline type".to_string())?;

        let mut parser = Parser::new();
        parser
            .set_language(&language)
            .map_err(|error| format!("Failed to configure outline parser: {}", error))?;

        let tree = parser
            .parse(&source, None)
            .ok_or_else(|| "Failed to parse outline".to_string())?;

        let root_node = tree.root_node();

        if matches!(
            outline_type,
            OutlineFileType::Python
                | OutlineFileType::Javascript
                | OutlineFileType::Typescript
                | OutlineFileType::C
                | OutlineFileType::Cpp
                | OutlineFileType::Go
                | OutlineFileType::Java
                | OutlineFileType::Rust
                | OutlineFileType::Csharp
                | OutlineFileType::Php
                | OutlineFileType::Kotlin
                | OutlineFileType::Swift
        ) {
            let mut symbols = Vec::new();
            collect_symbol_outline_nodes(root_node, &source, outline_type, &mut symbols);
            return Ok(symbols);
        }

        let mut cursor = root_node.walk();
        let named_children: Vec<_> = root_node.children(&mut cursor).filter(|node| node.is_named()).collect();

        let start_node = if named_children.len() == 1 {
            named_children[0]
        } else {
            root_node
        };

        Ok(vec![build_tree_sitter_outline_node(
            start_node,
            &source,
            outline_type,
        )])
    } else {
        Err("Document not found".to_string())
    }
}


#[cfg(test)]
mod outline_tests {
    use super::{
        build_symbol_outline_node, parse_ini_outline, parse_outline_file_type, OutlineFileType,
        Parser,
    };

    #[test]
    fn parse_outline_file_type_should_support_config_and_code_languages() {
        assert!(matches!(
            parse_outline_file_type("toml"),
            Some(OutlineFileType::Toml)
        ));
        assert!(matches!(
            parse_outline_file_type("ini"),
            Some(OutlineFileType::Ini)
        ));
        assert!(matches!(
            parse_outline_file_type("python"),
            Some(OutlineFileType::Python)
        ));
        assert!(matches!(
            parse_outline_file_type("javascript"),
            Some(OutlineFileType::Javascript)
        ));
        assert!(matches!(
            parse_outline_file_type("c"),
            Some(OutlineFileType::C)
        ));
        assert!(matches!(
            parse_outline_file_type("cpp"),
            Some(OutlineFileType::Cpp)
        ));
        assert!(matches!(
            parse_outline_file_type("typescript"),
            Some(OutlineFileType::Typescript)
        ));
        assert!(matches!(
            parse_outline_file_type("go"),
            Some(OutlineFileType::Go)
        ));
        assert!(matches!(
            parse_outline_file_type("java"),
            Some(OutlineFileType::Java)
        ));
        assert!(matches!(
            parse_outline_file_type("rust"),
            Some(OutlineFileType::Rust)
        ));
        assert!(matches!(
            parse_outline_file_type("csharp"),
            Some(OutlineFileType::Csharp)
        ));
        assert!(matches!(
            parse_outline_file_type("php"),
            Some(OutlineFileType::Php)
        ));
        assert!(matches!(
            parse_outline_file_type("kotlin"),
            Some(OutlineFileType::Kotlin)
        ));
        assert!(matches!(
            parse_outline_file_type("swift"),
            Some(OutlineFileType::Swift)
        ));
    }

    #[test]
    fn parse_ini_outline_should_group_pairs_under_sections() {
        let source = r#"name = rutar
[editor]
tab_width = 4
word_wrap = true
"#;

        let nodes = parse_ini_outline(source);

        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].label, "name =");
        assert_eq!(nodes[1].label, "[editor]");
        assert_eq!(nodes[1].children.len(), 2);
        assert_eq!(nodes[1].children[0].label, "tab_width =");
        assert_eq!(nodes[1].children[1].label, "word_wrap =");
    }

    #[test]
    fn typescript_outline_should_detect_interface_and_type_alias() {
        let source = r#"
interface User {
  id: number;
}

type UserId = string;
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
            .expect("set typescript parser");
        let tree = parser.parse(source, None).expect("parse typescript");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Typescript))
            .collect();

        assert!(symbols.iter().any(|node| node.node_type == "interface" && node.label == "interface User"));
        assert!(symbols.iter().any(|node| node.node_type == "type" && node.label == "type UserId"));
    }

    #[test]
    fn typescript_outline_should_detect_namespace_and_declare_const_enum() {
        let source = r#"
declare namespace API {
  export interface User {
    id: number;
  }
}

declare const enum Status {
  Ready,
  Busy,
}
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
            .expect("set typescript parser");
        let tree = parser.parse(source, None).expect("parse typescript");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Typescript))
            .collect();

        assert!(symbols
            .iter()
            .any(|node| node.node_type == "namespace" && node.label == "declare namespace API"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "enum" && node.label == "declare const enum Status"));
    }

    #[test]
    fn typescript_outline_should_detect_export_default_and_exported_type() {
        let source = r#"
export default class Service {
  run() {}
}

export type Id = string;
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
            .expect("set typescript parser");
        let tree = parser.parse(source, None).expect("parse typescript");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Typescript))
            .collect();

        assert!(symbols
            .iter()
            .any(|node| node.node_type == "class" && node.label == "export default class Service"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "type" && node.label == "export type Id"));
    }

    #[test]
    fn typescript_outline_should_detect_declare_global_namespace() {
        let source = r#"
declare global {
  interface Window {
    __APP__: string;
  }
}
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
            .expect("set typescript parser");
        let tree = parser.parse(source, None).expect("parse typescript");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Typescript))
            .collect();

        assert!(symbols
            .iter()
            .any(|node| node.node_type == "namespace" && node.label == "declare global"));
    }

    #[test]
    fn typescript_outline_should_detect_export_clause_aliases() {
        let source = r#"
export { Foo as Bar, Baz };
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
            .expect("set typescript parser");
        let tree = parser.parse(source, None).expect("parse typescript");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Typescript))
            .collect();

        assert!(symbols.iter().any(|node|
            node.node_type == "export" && node.label == "export { Foo as Bar, Baz }"
        ));
    }

    #[test]
    fn typescript_outline_should_detect_nested_namespace_name() {
        let source = r#"
declare namespace App.Core {
  interface User {
    id: number;
  }
}
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_typescript::LANGUAGE_TSX.into())
            .expect("set typescript parser");
        let tree = parser.parse(source, None).expect("parse typescript");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Typescript))
            .collect();

        assert!(symbols.iter().any(|node|
            node.node_type == "namespace" && node.label == "declare namespace App.Core"
        ));
    }

    #[test]
    fn rust_outline_should_detect_module_const_static_type_macro_and_extern_crate() {
        let source = r#"
mod inner {
    pub const MAX: usize = 1024;
}

static mut COUNTER: i32 = 0;
type UserId = u64;
macro_rules! say_hello { () => { println!("hi") } }
extern crate serde as serde_crate;
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_rust::LANGUAGE.into())
            .expect("set rust parser");
        let tree = parser.parse(source, None).expect("parse rust");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Rust))
            .collect();

        assert!(symbols.iter().any(|node| node.node_type == "module" && node.label == "mod inner"));
        assert!(symbols.iter().any(|node| node.node_type == "static" && node.label == "static mut COUNTER"));
        assert!(symbols.iter().any(|node| node.node_type == "type" && node.label == "type UserId"));
        assert!(symbols.iter().any(|node| node.node_type == "macro" && node.label == "macro say_hello!"));
        assert!(symbols.iter().any(|node| node.node_type == "extern_crate" && node.label == "extern crate serde as serde_crate"));

        let module = symbols
            .iter()
            .find(|node| node.node_type == "module" && node.label == "mod inner")
            .expect("module symbol should exist");
        assert!(module
            .children
            .iter()
            .any(|node| node.node_type == "const" && node.label == "const MAX"));
    }

    #[test]
    fn java_outline_should_detect_annotation_record_and_fields() {
        let source = r#"
public @interface JsonModel {}

public record User(String name, int age) {
    private static final int LIMIT = 100;
    private String alias;

    public String display() {
        return alias;
    }
}
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_java::LANGUAGE.into())
            .expect("set java parser");
        let tree = parser.parse(source, None).expect("parse java");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Java))
            .collect();

        assert!(symbols
            .iter()
            .any(|node| node.node_type == "annotation" && node.label == "@interface JsonModel"));

        let record = symbols
            .iter()
            .find(|node| node.node_type == "record" && node.label == "record User")
            .expect("record symbol should exist");

        assert!(record
            .children
            .iter()
            .any(|node| node.node_type == "field" && node.label == "field LIMIT"));
        assert!(record
            .children
            .iter()
            .any(|node| node.node_type == "field" && node.label == "field alias"));
        assert!(record
            .children
            .iter()
            .any(|node| node.node_type == "method" && node.label == "method display()"));
    }

    #[test]
    fn go_outline_should_expand_grouped_const_var_and_type_declarations() {
        let source = r#"
const (
    A = 1
    B = 2
)

var (
    Name string
    Count int
)

type (
    User struct{}
    Store interface{}
    UserID = int64
)
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_go::LANGUAGE.into())
            .expect("set go parser");
        let tree = parser.parse(source, None).expect("parse go");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Go))
            .collect();

        let const_group = symbols
            .iter()
            .find(|node| node.node_type == "const_group" && node.label == "const")
            .expect("const group should exist");
        assert!(const_group
            .children
            .iter()
            .any(|node| node.node_type == "const" && node.label == "const A"));
        assert!(const_group
            .children
            .iter()
            .any(|node| node.node_type == "const" && node.label == "const B"));

        let var_group = symbols
            .iter()
            .find(|node| node.node_type == "var_group" && node.label == "var")
            .expect("var group should exist");
        assert!(var_group
            .children
            .iter()
            .any(|node| node.node_type == "var" && node.label == "var Name"));
        assert!(var_group
            .children
            .iter()
            .any(|node| node.node_type == "var" && node.label == "var Count"));

        let type_group = symbols
            .iter()
            .find(|node| node.node_type == "type_group" && node.label == "type")
            .expect("type group should exist");
        assert!(type_group
            .children
            .iter()
            .any(|node| node.node_type == "type" && node.label == "type User struct"));
        assert!(type_group
            .children
            .iter()
            .any(|node| node.node_type == "type" && node.label == "type Store interface"));
        assert!(type_group
            .children
            .iter()
            .any(|node| node.node_type == "type" && node.label == "type UserID ="));
    }

    #[test]
    fn cpp_outline_should_detect_typedef_using_and_class_members() {
        let source = r#"
typedef unsigned long U64;
using Str = const char*;
using std::string;

class Foo {
public:
    int value;
    void run();
};
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_cpp::LANGUAGE.into())
            .expect("set cpp parser");
        let tree = parser.parse(source, None).expect("parse cpp");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Cpp))
            .collect();

        assert!(symbols
            .iter()
            .any(|node| node.node_type == "typedef" && node.label == "typedef U64"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "using_alias" && node.label == "using Str ="));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "using" && node.label == "using std::string"));

        let class_node = symbols
            .iter()
            .find(|node| node.node_type == "class" && node.label == "class Foo")
            .expect("class Foo should exist");
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "field" && node.label == "field value"));
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "method_decl" && node.label == "method run()"));
    }

    #[test]
    fn csharp_outline_should_detect_namespace_types_and_members() {
        let source = r#"
namespace Demo.App {
    public record User(int Id);

    public class Service {
        private int count;
        public string Name { get; set; }
        public Service() {}
        public void Run() {}
    }
}
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_c_sharp::LANGUAGE.into())
            .expect("set csharp parser");
        let tree = parser.parse(source, None).expect("parse csharp");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Csharp))
            .collect();

        let namespace_node = symbols
            .iter()
            .find(|node| node.node_type == "namespace" && node.label == "namespace Demo.App")
            .expect("namespace should exist");

        assert!(namespace_node
            .children
            .iter()
            .any(|node| node.node_type == "record" && node.label == "record User"));

        let class_node = namespace_node
            .children
            .iter()
            .find(|node| node.node_type == "class" && node.label == "class Service")
            .expect("class Service should exist");
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "field" && node.label == "field count"));
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "property" && node.label == "property Name"));
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "constructor" && node.label == "ctor Service()"));
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "method" && node.label == "method Run()"));
    }

    #[test]
    fn php_outline_should_detect_namespace_types_and_members() {
        let source = r#"
<?php

namespace Demo {
    enum State {
        case Ready;
    }

    class Service {
        private string $name;
        const VERSION = 1;

        public function run() {}
    }

    function helper() {}
}
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_php::LANGUAGE_PHP.into())
            .expect("set php parser");
        let tree = parser.parse(source, None).expect("parse php");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Php))
            .collect();

        let namespace_node = symbols
            .iter()
            .find(|node| node.node_type == "namespace" && node.label == "namespace Demo")
            .expect("namespace should exist");

        assert!(namespace_node
            .children
            .iter()
            .any(|node| node.node_type == "enum" && node.label == "enum State"));
        assert!(namespace_node
            .children
            .iter()
            .any(|node| node.node_type == "function" && node.label == "function helper()"));

        let class_node = namespace_node
            .children
            .iter()
            .find(|node| node.node_type == "class" && node.label == "class Service")
            .expect("class Service should exist");
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "property" && node.label == "property $name"));
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "const" && node.label == "const VERSION"));
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "method" && node.label == "method run()"));
    }

    #[test]
    fn kotlin_outline_should_detect_types_members_and_alias() {
        let source = r#"
package demo

interface Worker {
    fun run()
}

class Service {
    val name: String = "ok"

    fun execute() {}
}

typealias UserId = String
object Globals {}
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_kotlin_ng::LANGUAGE.into())
            .expect("set kotlin parser");
        let tree = parser.parse(source, None).expect("parse kotlin");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Kotlin))
            .collect();

        assert!(symbols
            .iter()
            .any(|node| node.node_type == "interface" && node.label == "interface Worker"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "type_alias" && node.label == "typealias UserId"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "object" && node.label == "object Globals"));

        let class_node = symbols
            .iter()
            .find(|node| node.node_type == "class" && node.label == "class Service")
            .expect("class Service should exist");
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "property" && node.label == "property name"));
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "function" && node.label == "fun execute()"));
    }

    #[test]
    fn swift_outline_should_detect_protocol_type_and_members() {
        let source = r#"
protocol Runner {
    func run()
}

class Service {
    let name: String = "ok"

    init() {}
    func execute() {}
}

typealias UserId = String
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_swift::LANGUAGE.into())
            .expect("set swift parser");
        let tree = parser.parse(source, None).expect("parse swift");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Swift))
            .collect();

        assert!(symbols
            .iter()
            .any(|node| node.node_type == "protocol" && node.label == "protocol Runner"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "type_alias" && node.label == "typealias UserId"));

        let class_node = symbols
            .iter()
            .find(|node| node.node_type == "class" && node.label == "class Service")
            .expect("class Service should exist");
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "property" && node.label == "property name"));
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "initializer" && node.label == "init()"));
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "function" && node.label == "func execute()"));
    }
}

