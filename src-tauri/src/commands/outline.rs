use crate::state::AppState;
use tauri::State;
use tree_sitter::{Language, Parser};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OutlineNode {
    label: String,
    node_type: String,
    line: usize,
    column: usize,
    children: Vec<OutlineNode>,
}

fn filter_outline_node_by_keyword(node: &OutlineNode, keyword: &str) -> Option<OutlineNode> {
    let normalized_label = node.label.to_lowercase();
    let is_matched = normalized_label.contains(keyword);

    let filtered_children = node
        .children
        .iter()
        .filter_map(|child| filter_outline_node_by_keyword(child, keyword))
        .collect::<Vec<OutlineNode>>();

    if !is_matched && filtered_children.is_empty() {
        return None;
    }

    Some(OutlineNode {
        label: node.label.clone(),
        node_type: node.node_type.clone(),
        line: node.line,
        column: node.column,
        children: filtered_children,
    })
}

pub fn filter_outline_nodes_impl(nodes: Vec<OutlineNode>, keyword: String) -> Vec<OutlineNode> {
    let normalized_keyword = keyword.trim().to_lowercase();
    if normalized_keyword.is_empty() {
        return nodes;
    }

    nodes
        .iter()
        .filter_map(|node| filter_outline_node_by_keyword(node, normalized_keyword.as_str()))
        .collect()
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

fn get_node_first_line_preview(
    node: tree_sitter::Node<'_>,
    source: &str,
    max_len: usize,
) -> String {
    let raw = source
        .get(node.start_byte()..node.end_byte())
        .unwrap_or("")
        .trim();
    let first_line = raw.lines().next().map(str::trim).unwrap_or("");

    if first_line.is_empty() {
        get_node_text_preview(node, source, max_len)
    } else {
        truncate_preview(first_line, max_len)
    }
}

fn is_yaml_wrapper_kind(kind: &str) -> bool {
    matches!(kind, "block_node" | "flow_node" | "block_sequence_item")
}

fn unwrap_yaml_wrapper_node<'tree>(mut node: tree_sitter::Node<'tree>) -> tree_sitter::Node<'tree> {
    while is_yaml_wrapper_kind(node.kind()) {
        let Some(next) = first_named_child(node) else {
            break;
        };
        node = next;
    }

    node
}

fn yaml_pair_key_value_nodes<'tree>(
    node: tree_sitter::Node<'tree>,
) -> (
    Option<tree_sitter::Node<'tree>>,
    Option<tree_sitter::Node<'tree>>,
) {
    let key_node = node
        .child_by_field_name("key")
        .or_else(|| first_named_child(node))
        .map(unwrap_yaml_wrapper_node);
    let value_node = node
        .child_by_field_name("value")
        .or_else(|| second_named_child(node))
        .map(unwrap_yaml_wrapper_node);

    (key_node, value_node)
}

fn append_yaml_collection_children(
    output: &mut Vec<OutlineNode>,
    node: tree_sitter::Node<'_>,
    source: &str,
    file_type: OutlineFileType,
) {
    let normalized_node = unwrap_yaml_wrapper_node(node);

    if normalized_node.kind().contains("mapping") {
        let mut mapping_cursor = normalized_node.walk();
        for mapping_child in normalized_node.children(&mut mapping_cursor) {
            if mapping_child.is_named() {
                output.push(build_tree_sitter_outline_node(
                    mapping_child,
                    source,
                    file_type,
                ));
            }
        }
        return;
    }

    if normalized_node.kind().contains("sequence") {
        let mut sequence_cursor = normalized_node.walk();
        for sequence_child in normalized_node.children(&mut sequence_cursor) {
            if !sequence_child.is_named() {
                continue;
            }

            let normalized_item = unwrap_yaml_wrapper_node(sequence_child);
            if normalized_item.kind().contains("mapping")
                || normalized_item.kind().contains("sequence")
            {
                append_yaml_collection_children(output, normalized_item, source, file_type);
            } else {
                output.push(build_tree_sitter_outline_node(
                    normalized_item,
                    source,
                    file_type,
                ));
            }
        }
        return;
    }

    output.push(build_tree_sitter_outline_node(
        normalized_node,
        source,
        file_type,
    ));
}

fn is_yaml_scalar_kind(kind: &str) -> bool {
    matches!(
        kind,
        "plain_scalar"
            | "single_quote_scalar"
            | "double_quote_scalar"
            | "block_scalar"
            | "string_scalar"
            | "integer_scalar"
            | "float_scalar"
            | "boolean_scalar"
            | "null_scalar"
            | "timestamp_scalar"
            | "alias"
            | "anchor"
            | "anchor_name"
            | "tag"
    )
}

fn kind_matches(actual: &str, expected: &str) -> bool {
    actual.eq_ignore_ascii_case(expected)
}

fn named_child_by_kind<'tree>(
    node: tree_sitter::Node<'tree>,
    kind: &str,
) -> Option<tree_sitter::Node<'tree>> {
    let mut cursor = node.walk();
    let result = node
        .children(&mut cursor)
        .find(|child| child.is_named() && kind_matches(child.kind(), kind));
    result
}

fn first_named_descendant_by_kind<'tree>(
    node: tree_sitter::Node<'tree>,
    kind: &str,
) -> Option<tree_sitter::Node<'tree>> {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if !child.is_named() {
            continue;
        }

        if kind_matches(child.kind(), kind) {
            return Some(child);
        }

        if let Some(found) = first_named_descendant_by_kind(child, kind) {
            return Some(found);
        }
    }

    None
}

fn build_xml_attribute_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
) -> Option<OutlineNode> {
    if !kind_matches(node.kind(), "Attribute") {
        return None;
    }

    let name = named_child_by_kind(node, "Name")
        .map(|name_node| get_node_text_preview(name_node, source, 120))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let value = named_child_by_kind(node, "AttValue")
        .map(|value_node| get_node_text_preview(value_node, source, 120))
        .map(|parsed| parsed.trim().to_string())
        .filter(|parsed| !parsed.is_empty());

    let label = match (name, value) {
        (Some(name), Some(value)) => format!("@{}={}", name, value),
        (Some(name), None) => format!("@{}", name),
        _ => format!("@{}", get_node_text_preview(node, source, 120)),
    };

    Some(build_outline_node(label, "attribute", node, Vec::new()))
}

fn extract_xml_element_name(node: tree_sitter::Node<'_>, source: &str) -> Option<String> {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if !child.is_named() {
            continue;
        }

        if kind_matches(child.kind(), "STag")
            || kind_matches(child.kind(), "EmptyElemTag")
            || kind_matches(child.kind(), "ETag")
        {
            if let Some(name_node) = named_child_by_kind(child, "Name") {
                let name = get_node_text_preview(name_node, source, 80)
                    .trim()
                    .to_string();
                if !name.is_empty() {
                    return Some(name);
                }
            }
        }
    }

    if let Some(name_node) = first_named_descendant_by_kind(node, "Name") {
        let name = get_node_text_preview(name_node, source, 80)
            .trim()
            .to_string();
        if !name.is_empty() {
            return Some(name);
        }
    }

    let preview = get_node_text_preview(node, source, 80);
    preview
        .trim_start_matches('<')
        .trim_start_matches('/')
        .split([' ', '>', '/'])
        .find(|part| !part.trim().is_empty())
        .map(str::to_string)
}

fn build_xml_element_outline_node(node: tree_sitter::Node<'_>, source: &str) -> OutlineNode {
    let mut children = Vec::new();

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if !child.is_named() {
            continue;
        }

        if kind_matches(child.kind(), "STag") || kind_matches(child.kind(), "EmptyElemTag") {
            let mut tag_cursor = child.walk();
            for tag_child in child.children(&mut tag_cursor) {
                if !tag_child.is_named() {
                    continue;
                }

                if let Some(attribute_node) = build_xml_attribute_outline_node(tag_child, source) {
                    children.push(attribute_node);
                }
            }
            continue;
        }

        if kind_matches(child.kind(), "content") {
            let mut content_cursor = child.walk();
            for content_child in child.children(&mut content_cursor) {
                if content_child.is_named() && kind_matches(content_child.kind(), "element") {
                    children.push(build_xml_element_outline_node(content_child, source));
                }
            }
            continue;
        }

        if kind_matches(child.kind(), "element") {
            children.push(build_xml_element_outline_node(child, source));
        }
    }

    let label = extract_xml_element_name(node, source)
        .map(|name| format!("<{}>", name))
        .unwrap_or_else(|| "<element>".to_string());

    build_outline_node(label, "element", node, children)
}

fn parse_xml_outline(root_node: tree_sitter::Node<'_>, source: &str) -> Vec<OutlineNode> {
    if kind_matches(root_node.kind(), "element") {
        return vec![build_xml_element_outline_node(root_node, source)];
    }

    if let Some(root_field_node) = root_node.child_by_field_name("root") {
        if root_field_node.is_named() && kind_matches(root_field_node.kind(), "element") {
            return vec![build_xml_element_outline_node(root_field_node, source)];
        }
    }

    if let Some(root_element) = first_named_descendant_by_kind(root_node, "element") {
        return vec![build_xml_element_outline_node(root_element, source)];
    }

    Vec::new()
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
    match file_type {
        OutlineFileType::Yaml => is_yaml_scalar_kind(kind),
        _ => !is_pair_kind(kind) && !is_container_kind(file_type, kind),
    }
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
                    let key = get_node_text_preview(key_node, source, 60)
                        .trim_matches('"')
                        .to_string();

                    if let Some(value_node) = second_named_child(node) {
                        if is_scalar_value_kind(file_type, value_node.kind()) {
                            return format!(
                                "{}: {}",
                                key,
                                get_node_text_preview(value_node, source, 80)
                            );
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
            if kind.contains("pair") {
                let (key_node, value_node) = yaml_pair_key_value_nodes(node);

                if let Some(key_node) = key_node {
                    let key = get_node_text_preview(key_node, source, 60);

                    if let Some(value_node) = value_node {
                        if is_scalar_value_kind(file_type, value_node.kind()) {
                            return format!(
                                "{}: {}",
                                key,
                                get_node_text_preview(value_node, source, 80)
                            );
                        }
                    }

                    return format!("{}:", key);
                }
            }

            if kind.contains("mapping") {
                return "{}".to_string();
            }

            if kind.contains("sequence") {
                return "[]".to_string();
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
                let preview = get_node_first_line_preview(node, source, 80);
                return if preview.trim().is_empty() {
                    "table".to_string()
                } else {
                    preview
                };
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
                            return format!(
                                "{} = {}",
                                key,
                                get_node_text_preview(value_node, source, 80)
                            );
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

    if matches!(file_type, OutlineFileType::Yaml) && is_yaml_wrapper_kind(kind) {
        if let Some(inner_node) = first_named_child(node) {
            return build_tree_sitter_outline_node(inner_node, source, file_type);
        }
    }

    if is_pair_kind(kind) {
        let value_node = if matches!(file_type, OutlineFileType::Yaml) {
            node.child_by_field_name("value")
                .or_else(|| second_named_child(node))
                .map(unwrap_yaml_wrapper_node)
        } else {
            second_named_child(node)
        };

        if let Some(value_node) = value_node {
            if !is_scalar_value_kind(file_type, value_node.kind()) {
                if matches!(file_type, OutlineFileType::Yaml) {
                    append_yaml_collection_children(&mut children, value_node, source, file_type);
                } else {
                    children.push(build_tree_sitter_outline_node(
                        value_node, source, file_type,
                    ));
                }
            }
        }
    } else if is_container_kind(file_type, kind) {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if !child.is_named() {
                continue;
            }

            if matches!(file_type, OutlineFileType::Yaml) {
                append_yaml_collection_children(&mut children, child, source, file_type);
                continue;
            }

            children.push(build_tree_sitter_outline_node(child, source, file_type));
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

mod c_family;
mod csharp;
mod go;
mod java;
mod javascript;
mod kotlin;
mod php;
mod python;
mod rust_lang;
mod swift;
mod typescript;

fn build_symbol_outline_node(
    node: tree_sitter::Node<'_>,
    source: &str,
    file_type: OutlineFileType,
) -> Option<OutlineNode> {
    match file_type {
        OutlineFileType::Python => python::build_python_outline_node(node, source),
        OutlineFileType::Javascript => javascript::build_javascript_outline_node(node, source),
        OutlineFileType::Typescript => typescript::build_typescript_outline_node(node, source),
        OutlineFileType::C | OutlineFileType::Cpp => {
            c_family::build_c_family_outline_node(node, source, file_type)
        }
        OutlineFileType::Go => go::build_go_outline_node(node, source),
        OutlineFileType::Java => java::build_java_outline_node(node, source),
        OutlineFileType::Rust => rust_lang::build_rust_outline_node(node, source),
        OutlineFileType::Csharp => csharp::build_csharp_outline_node(node, source),
        OutlineFileType::Php => php::build_php_outline_node(node, source),
        OutlineFileType::Kotlin => kotlin::build_kotlin_outline_node(node, source),
        OutlineFileType::Swift => swift::build_swift_outline_node(node, source),
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

        if matches!(outline_type, OutlineFileType::Xml) {
            return Ok(parse_xml_outline(root_node, &source));
        }

        let mut cursor = root_node.walk();
        let named_children: Vec<_> = root_node
            .children(&mut cursor)
            .filter(|node| node.is_named())
            .collect();

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
        build_symbol_outline_node, build_tree_sitter_outline_node, parse_ini_outline,
        parse_outline_file_type, parse_xml_outline, OutlineFileType, Parser,
    };

    fn collect_outline_labels(node: &super::OutlineNode, labels: &mut Vec<String>) {
        labels.push(node.label.clone());
        for child in &node.children {
            collect_outline_labels(child, labels);
        }
    }

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
    fn xml_outline_should_extract_element_hierarchy_and_attributes() {
        let source = r#"<?xml version="1.0" encoding="UTF-8"?>
<catalog lang="en">
  <book id="b1">
    <title>Rust</title>
  </book>
</catalog>
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_xml::LANGUAGE_XML.into())
            .expect("set xml parser");
        let tree = parser.parse(source, None).expect("parse xml");

        let nodes = parse_xml_outline(tree.root_node(), source);
        assert_eq!(nodes.len(), 1);

        let root = &nodes[0];
        assert_eq!(root.node_type, "element");
        assert_eq!(root.label, "<catalog>");
        assert!(root
            .children
            .iter()
            .any(|node| node.node_type == "attribute" && node.label == "@lang=\"en\""));

        let book = root
            .children
            .iter()
            .find(|node| node.node_type == "element" && node.label == "<book>")
            .expect("book element should exist");
        assert!(book
            .children
            .iter()
            .any(|node| node.node_type == "attribute" && node.label == "@id=\"b1\""));
        assert!(book
            .children
            .iter()
            .any(|node| node.node_type == "element" && node.label == "<title>"));

        assert!(!root.children.iter().any(|node| {
            node.node_type == "STag" || node.node_type == "ETag" || node.node_type == "content"
        }));
    }

    #[test]
    fn json_outline_should_extract_pairs_and_nested_containers() {
        let source = r#"{"name":"rutar","meta":{"version":1},"items":[1,2]}"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_json::LANGUAGE.into())
            .expect("set json parser");
        let tree = parser.parse(source, None).expect("parse json");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let named_children: Vec<_> = root
            .children(&mut cursor)
            .filter(|node| node.is_named())
            .collect();
        let start_node = if named_children.len() == 1 {
            named_children[0]
        } else {
            root
        };

        let outline = build_tree_sitter_outline_node(start_node, source, OutlineFileType::Json);
        assert_eq!(outline.label, "{}");
        assert!(outline
            .children
            .iter()
            .any(|node| node.label == "name: \"rutar\""));

        let meta_pair = outline
            .children
            .iter()
            .find(|node| node.label == "meta:")
            .expect("meta pair should exist");
        assert!(meta_pair
            .children
            .iter()
            .any(|node| node.node_type == "object" && node.label == "{}"));

        let items_pair = outline
            .children
            .iter()
            .find(|node| node.label == "items:")
            .expect("items pair should exist");
        assert!(items_pair
            .children
            .iter()
            .any(|node| node.node_type == "array" && node.label == "[]"));
    }

    #[test]
    fn yaml_outline_should_extract_mapping_and_sequence_labels() {
        let source = r#"
name: rutar
editor:
  tab_width: 4
items:
  - rust
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_yaml::LANGUAGE.into())
            .expect("set yaml parser");
        let tree = parser.parse(source, None).expect("parse yaml");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let named_children: Vec<_> = root
            .children(&mut cursor)
            .filter(|node| node.is_named())
            .collect();
        let start_node = if named_children.len() == 1 {
            named_children[0]
        } else {
            root
        };

        let outline = build_tree_sitter_outline_node(start_node, source, OutlineFileType::Yaml);
        let mut labels = Vec::new();
        collect_outline_labels(&outline, &mut labels);

        assert!(labels.iter().any(|label| label == "name: rutar"));
        assert!(labels.iter().any(|label| label == "editor:"));
        assert!(labels.iter().any(|label| label == "tab_width: 4"));
        assert!(labels.iter().any(|label| label == "items:"));
    }

    #[test]
    fn yaml_outline_should_not_insert_extra_mapping_node_under_pair() {
        let source = r#"
executors:
  rust-executor:
    docker:
      - image: rust:latest
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_yaml::LANGUAGE.into())
            .expect("set yaml parser");
        let tree = parser.parse(source, None).expect("parse yaml");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let named_children: Vec<_> = root
            .children(&mut cursor)
            .filter(|node| node.is_named())
            .collect();
        let start_node = if named_children.len() == 1 {
            named_children[0]
        } else {
            root
        };

        let outline = build_tree_sitter_outline_node(start_node, source, OutlineFileType::Yaml);
        let executors_pair = outline
            .children
            .iter()
            .find(|node| node.label == "executors:")
            .expect("executors pair should exist");

        assert_eq!(executors_pair.children.len(), 1);
        assert_eq!(executors_pair.children[0].label, "rust-executor:");
        assert_ne!(executors_pair.children[0].label, "{}");

        let rust_executor_pair = &executors_pair.children[0];
        assert_eq!(rust_executor_pair.children.len(), 1);
        assert_eq!(rust_executor_pair.children[0].label, "docker:");
    }

    #[test]
    fn yaml_outline_should_not_insert_extra_sequence_node_under_pair() {
        let source = r#"
docker:
  - image: rust:latest
  - image: rust:nightly
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_yaml::LANGUAGE.into())
            .expect("set yaml parser");
        let tree = parser.parse(source, None).expect("parse yaml");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let named_children: Vec<_> = root
            .children(&mut cursor)
            .filter(|node| node.is_named())
            .collect();
        let start_node = if named_children.len() == 1 {
            named_children[0]
        } else {
            root
        };

        let outline = build_tree_sitter_outline_node(start_node, source, OutlineFileType::Yaml);

        let docker_pair = outline
            .children
            .iter()
            .find(|node| node.label == "docker:")
            .expect("docker pair should exist");

        assert_eq!(docker_pair.children.len(), 2);
        assert!(docker_pair
            .children
            .iter()
            .all(|node| node.node_type.contains("pair") && node.label.starts_with("image:")));
        assert!(docker_pair.children.iter().all(|node| node.label != "[]"));
    }

    #[test]
    fn toml_outline_should_extract_tables_and_pairs() {
        let source = r#"
title = "Rutar"

[editor]
tab_width = 4

[servers.alpha]
ip = "127.0.0.1"
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_toml_ng::LANGUAGE.into())
            .expect("set toml parser");
        let tree = parser.parse(source, None).expect("parse toml");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let named_children: Vec<_> = root
            .children(&mut cursor)
            .filter(|node| node.is_named())
            .collect();
        let start_node = if named_children.len() == 1 {
            named_children[0]
        } else {
            root
        };

        let outline = build_tree_sitter_outline_node(start_node, source, OutlineFileType::Toml);
        let mut labels = Vec::new();
        collect_outline_labels(&outline, &mut labels);

        assert!(labels.iter().any(|label| label == "title = \"Rutar\""));
        assert!(labels.iter().any(|label| label == "[editor]"));
        assert!(labels.iter().any(|label| label == "tab_width = 4"));
        assert!(labels.iter().any(|label| label == "[servers.alpha]"));
        assert!(labels.iter().any(|label| label == "ip = \"127.0.0.1\""));
    }

    #[test]
    fn python_outline_should_detect_class_and_functions() {
        let source = r#"
class Service:
    def run(self):
        pass

def helper():
    pass
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_python::LANGUAGE.into())
            .expect("set python parser");
        let tree = parser.parse(source, None).expect("parse python");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Python))
            .collect();

        let class_node = symbols
            .iter()
            .find(|node| node.node_type == "class" && node.label == "class Service")
            .expect("class Service should exist");
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "function" && node.label == "def run()"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "function" && node.label == "def helper()"));
    }

    #[test]
    fn javascript_outline_should_detect_class_method_and_functions() {
        let source = r#"
class Service {
  run() {}
}

function helper() {}
const arrow = () => {};
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_javascript::LANGUAGE.into())
            .expect("set javascript parser");
        let tree = parser.parse(source, None).expect("parse javascript");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::Javascript))
            .collect();

        let class_node = symbols
            .iter()
            .find(|node| node.node_type == "class" && node.label == "class Service")
            .expect("class Service should exist");
        assert!(class_node
            .children
            .iter()
            .any(|node| node.node_type == "method" && node.label == "run()"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "function" && node.label == "function helper()"));
    }

    #[test]
    fn c_outline_should_detect_typedef_struct_members_and_function() {
        let source = r#"
typedef int MyInt;

struct Service {
  int value;
  void run();
};

int helper() { return 0; }
"#;

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_c::LANGUAGE.into())
            .expect("set c parser");
        let tree = parser.parse(source, None).expect("parse c");

        let root = tree.root_node();
        let mut cursor = root.walk();
        let symbols: Vec<_> = root
            .children(&mut cursor)
            .filter_map(|node| build_symbol_outline_node(node, source, OutlineFileType::C))
            .collect();

        assert!(symbols
            .iter()
            .any(|node| node.node_type == "typedef" && node.label == "typedef MyInt"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "function" && node.label == "fn helper()"));

        let struct_node = symbols
            .iter()
            .find(|node| node.node_type == "struct" && node.label == "struct Service")
            .expect("struct Service should exist");
        assert!(struct_node
            .children
            .iter()
            .any(|node| node.node_type == "field" && node.label == "field value"));
        assert!(struct_node
            .children
            .iter()
            .any(|node| node.node_type == "method_decl" && node.label == "method run()"));
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

        assert!(symbols
            .iter()
            .any(|node| node.node_type == "interface" && node.label == "interface User"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "type" && node.label == "type UserId"));
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

        assert!(symbols
            .iter()
            .any(|node| node.node_type == "export" && node.label == "export { Foo as Bar, Baz }"));
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

        assert!(symbols.iter().any(
            |node| node.node_type == "namespace" && node.label == "declare namespace App.Core"
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

        assert!(symbols
            .iter()
            .any(|node| node.node_type == "module" && node.label == "mod inner"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "static" && node.label == "static mut COUNTER"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "type" && node.label == "type UserId"));
        assert!(symbols
            .iter()
            .any(|node| node.node_type == "macro" && node.label == "macro say_hello!"));
        assert!(symbols.iter().any(|node| node.node_type == "extern_crate"
            && node.label == "extern crate serde as serde_crate"));

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
