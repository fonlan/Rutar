use std::path::PathBuf;
use quick_xml::events::Event;
use quick_xml::{Reader, Writer};
use regex::Regex;
use serde::Serialize;
use tree_sitter::{Language, Parser};

#[derive(Clone, Copy)]
enum StructuredFormat {
    Json,
    Yaml,
    Xml,
    Html,
    Toml,
}

#[derive(Clone, Copy)]
enum FormatMode {
    Beautify,
    Minify,
}

fn comment_detection_language(file_format: StructuredFormat) -> Option<Language> {
    match file_format {
        StructuredFormat::Yaml => Some(tree_sitter_yaml::LANGUAGE.into()),
        StructuredFormat::Toml => Some(tree_sitter_toml_ng::LANGUAGE.into()),
        _ => None,
    }
}

fn has_comment_nodes(source: &str, language: Language) -> bool {
    let mut parser = Parser::new();
    if parser.set_language(&language).is_err() {
        return false;
    }

    let Some(tree) = parser.parse(source, None) else {
        return false;
    };

    let mut stack = vec![tree.root_node()];
    while let Some(node) = stack.pop() {
        if node.kind().contains("comment") {
            return true;
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            stack.push(child);
        }
    }

    false
}

fn format_preserving_comments(source: &str, mode: FormatMode, tab_width: usize) -> String {
    let cleaned = trim_trailing_whitespace(source);

    match mode {
        FormatMode::Beautify => reindent_text(&cleaned, tab_width),
        FormatMode::Minify => cleaned,
    }
}

fn trim_trailing_whitespace(source: &str) -> String {
    let mut result = String::with_capacity(source.len());

    for segment in source.split_inclusive('\n') {
        let has_newline = segment.ends_with('\n');
        let line = if has_newline {
            &segment[..segment.len().saturating_sub(1)]
        } else {
            segment
        };

        result.push_str(line.trim_end_matches([' ', '\t', '\r']));
        if has_newline {
            result.push('\n');
        }
    }

    result
}

fn should_preserve_comments(source: &str, file_format: StructuredFormat) -> bool {
    let Some(language) = comment_detection_language(file_format) else {
        return false;
    };

    if has_comment_nodes(source, language) {
        return true;
    }

    false
}

fn normalize_tab_width(tab_width: u8) -> u8 {
    tab_width.clamp(1, 8)
}

fn parse_format_mode(mode: &str) -> Option<FormatMode> {
    match mode.trim().to_lowercase().as_str() {
        "beautify" | "format" => Some(FormatMode::Beautify),
        "minify" => Some(FormatMode::Minify),
        _ => None,
    }
}

fn parse_structured_format_from_name(name: &str) -> Option<StructuredFormat> {
    let lower = name.trim().to_lowercase();

    if lower.ends_with(".json") || lower.ends_with(".jsonc") {
        return Some(StructuredFormat::Json);
    }

    if lower.ends_with(".yaml") || lower.ends_with(".yml") {
        return Some(StructuredFormat::Yaml);
    }

    if lower.ends_with(".xml") || lower.ends_with(".svg") {
        return Some(StructuredFormat::Xml);
    }

    if lower.ends_with(".html") || lower.ends_with(".htm") || lower.ends_with(".xhtml") {
        return Some(StructuredFormat::Html);
    }

    if lower.ends_with(".toml") {
        return Some(StructuredFormat::Toml);
    }

    None
}

fn resolve_structured_format(
    file_path: Option<&str>,
    file_name: Option<&str>,
    document_path: &Option<PathBuf>,
) -> Option<StructuredFormat> {
    if let Some(path) = file_path {
        if let Some(detected) = parse_structured_format_from_name(path) {
            return Some(detected);
        }
    }

    if let Some(name) = file_name {
        if let Some(detected) = parse_structured_format_from_name(name) {
            return Some(detected);
        }
    }

    if let Some(path) = document_path.as_ref().and_then(|value| value.to_str()) {
        if let Some(detected) = parse_structured_format_from_name(path) {
            return Some(detected);
        }
    }

    None
}

fn strip_yaml_header(value: &str) -> String {
    let stripped = value.strip_prefix("---\n").unwrap_or(value);
    stripped.trim_end_matches('\n').to_string()
}

fn detect_indent_unit(source: &str) -> Option<usize> {
    let mut unit = 0usize;

    for line in source.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let spaces = line.chars().take_while(|ch| *ch == ' ').count();
        if spaces == 0 {
            continue;
        }

        if unit == 0 {
            unit = spaces;
            continue;
        }

        unit = gcd(unit, spaces);
        if unit == 1 {
            break;
        }
    }

    if unit == 0 {
        None
    } else {
        Some(unit)
    }
}

fn gcd(mut a: usize, mut b: usize) -> usize {
    while b != 0 {
        let tmp = a % b;
        a = b;
        b = tmp;
    }

    a
}

fn reindent_text(source: &str, target_width: usize) -> String {
    let from_unit = detect_indent_unit(source).unwrap_or(2).max(1);
    let mut result = String::with_capacity(source.len());
    let mut start = 0usize;

    while start < source.len() {
        let relative_end = source[start..].find('\n').map(|idx| idx + start);
        let end = relative_end.unwrap_or(source.len());
        let line = &source[start..end];

        let leading_spaces = line.chars().take_while(|ch| *ch == ' ').count();
        let rest = &line[leading_spaces..];

        if line.starts_with('\t') {
            result.push_str(line);
        } else {
            let levels = leading_spaces / from_unit;
            let remainder = leading_spaces % from_unit;
            let new_leading = levels
                .checked_mul(target_width)
                .unwrap_or(leading_spaces)
                .saturating_add(remainder);

            result.push_str(&" ".repeat(new_leading));
            result.push_str(rest);
        }

        if relative_end.is_some() {
            result.push('\n');
        }

        start = end.saturating_add(1);
    }

    if source.is_empty() {
        String::new()
    } else {
        result
    }
}

fn serialize_json_pretty_with_indent<T: Serialize>(value: &T, indent_width: usize) -> Result<String, String> {
    let indent = vec![b' '; indent_width.max(1)];
    let mut output = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(&indent);
    let mut serializer = serde_json::Serializer::with_formatter(&mut output, formatter);

    value
        .serialize(&mut serializer)
        .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

    String::from_utf8(output).map_err(|e| e.to_string())
}

fn format_json(source: &str, mode: FormatMode, tab_width: usize) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(source).map_err(|e| format!("Invalid JSON: {}", e))?;

    match mode {
        FormatMode::Beautify => serialize_json_pretty_with_indent(&value, tab_width),
        FormatMode::Minify => serde_json::to_string(&value).map_err(|e| e.to_string()),
    }
}

fn format_yaml(source: &str, mode: FormatMode, tab_width: usize) -> Result<String, String> {
    let value: serde_yaml::Value = serde_yaml::from_str(source).map_err(|e| format!("Invalid YAML: {}", e))?;

    match mode {
        FormatMode::Beautify => {
            let pretty = serde_yaml::to_string(&value).map_err(|e| format!("Failed to serialize YAML: {}", e))?;
            let without_header = strip_yaml_header(&pretty);
            Ok(reindent_text(&without_header, tab_width))
        }
        FormatMode::Minify => {
            let json_value = serde_json::to_value(&value).map_err(|e| format!("Failed to minify YAML: {}", e))?;
            serde_json::to_string(&json_value).map_err(|e| e.to_string())
        }
    }
}

fn format_toml(source: &str, mode: FormatMode, tab_width: usize) -> Result<String, String> {
    let value: toml::Value = toml::from_str(source).map_err(|e| format!("Invalid TOML: {}", e))?;

    match mode {
        FormatMode::Beautify => {
            let pretty = toml::to_string_pretty(&value).map_err(|e| format!("Failed to serialize TOML: {}", e))?;
            Ok(reindent_text(pretty.trim_end_matches('\n'), tab_width))
        }
        FormatMode::Minify => {
            let compact = toml::to_string(&value).map_err(|e| format!("Failed to minify TOML: {}", e))?;
            Ok(compact
                .replace(['\r', '\n'], " ")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" "))
        }
    }
}

fn format_xml(source: &str, mode: FormatMode, tab_width: usize) -> Result<String, String> {
    let mut reader = Reader::from_str(source);
    reader.config_mut().trim_text(false);

    let mut writer = match mode {
        FormatMode::Beautify => Writer::new_with_indent(Vec::new(), b' ', tab_width.max(1)),
        FormatMode::Minify => Writer::new(Vec::new()),
    };

    loop {
        match reader.read_event() {
            Ok(Event::Eof) => break,
            Ok(Event::Text(text_event)) if matches!(mode, FormatMode::Minify) => {
                let unescaped = text_event
                    .xml_content()
                    .map_err(|e| format!("Failed to read XML text: {}", e))?;
                if unescaped.trim().is_empty() {
                    continue;
                }
                writer
                    .write_event(Event::Text(text_event.into_owned()))
                    .map_err(|e| format!("Failed to write XML text: {}", e))?;
            }
            Ok(event) => {
                writer
                    .write_event(event.into_owned())
                    .map_err(|e| format!("Failed to write XML event: {}", e))?;
            }
            Err(error) => {
                return Err(format!("Invalid XML at {}: {}", reader.buffer_position(), error));
            }
        }
    }

    String::from_utf8(writer.into_inner()).map_err(|e| e.to_string())
}

fn is_html_void_tag(tag_name: &str) -> bool {
    matches!(
        tag_name,
        "area"
            | "base"
            | "br"
            | "col"
            | "embed"
            | "hr"
            | "img"
            | "input"
            | "link"
            | "meta"
            | "param"
            | "source"
            | "track"
            | "wbr"
    )
}

fn extract_html_tag_name(tag_line: &str) -> Option<String> {
    let trimmed = tag_line.trim();
    if !trimmed.starts_with('<') {
        return None;
    }

    let inner = trimmed
        .trim_start_matches('<')
        .trim_start_matches('/')
        .trim_start();
    let end = inner
        .find(|ch: char| ch.is_whitespace() || ch == '>' || ch == '/')
        .unwrap_or(inner.len());

    if end == 0 {
        return None;
    }

    Some(inner[..end].to_ascii_lowercase())
}

fn format_html_fallback(source: &str, mode: FormatMode, tab_width: usize) -> Result<String, String> {
    let spacing_regex = Regex::new(r">\s*<").map_err(|e| format!("Failed to build HTML spacing regex: {}", e))?;

    match mode {
        FormatMode::Beautify => {
            let normalized = spacing_regex.replace_all(source, ">\n<");
            let indent_unit = " ".repeat(tab_width.max(1));
            let mut indent_level = 0usize;
            let mut formatted = String::with_capacity(source.len().saturating_add(source.len() / 4));

            for raw_line in normalized.lines() {
                let line = raw_line.trim();
                if line.is_empty() {
                    continue;
                }

                let is_closing_tag = line.starts_with("</");
                if is_closing_tag {
                    indent_level = indent_level.saturating_sub(1);
                }

                formatted.push_str(&indent_unit.repeat(indent_level));
                formatted.push_str(line);
                formatted.push('\n');

                let is_self_closing = line.ends_with("/>");
                let is_declaration = line.starts_with("<!") || line.starts_with("<?");
                let closes_same_line = line.contains("</");
                let is_void = extract_html_tag_name(line).as_deref().is_some_and(is_html_void_tag);

                let should_indent_after = line.starts_with('<')
                    && !is_closing_tag
                    && !is_self_closing
                    && !is_declaration
                    && !closes_same_line
                    && !is_void;

                if should_indent_after {
                    indent_level = indent_level.saturating_add(1);
                }
            }

            Ok(formatted.trim_end_matches('\n').to_string())
        }
        FormatMode::Minify => {
            let compact = spacing_regex.replace_all(source, "><");
            Ok(compact.trim().to_string())
        }
    }
}

fn format_html(source: &str, mode: FormatMode, tab_width: usize) -> Result<String, String> {
    match format_xml(source, mode, tab_width) {
        Ok(formatted) => Ok(formatted),
        Err(_) => format_html_fallback(source, mode, tab_width),
    }
}

fn format_structured_text(
    source: &str,
    file_format: StructuredFormat,
    mode: FormatMode,
    tab_width: u8,
    preserve_comments: bool,
) -> Result<String, String> {
    let indent_width = normalize_tab_width(tab_width) as usize;

    match file_format {
        StructuredFormat::Json => format_json(source, mode, indent_width),
        StructuredFormat::Yaml => {
            if preserve_comments {
                Ok(format_preserving_comments(source, mode, indent_width))
            } else {
                format_yaml(source, mode, indent_width)
            }
        }
        StructuredFormat::Xml => format_xml(source, mode, indent_width),
        StructuredFormat::Html => format_html(source, mode, indent_width),
        StructuredFormat::Toml => {
            if preserve_comments {
                Ok(format_preserving_comments(source, mode, indent_width))
            } else {
                format_toml(source, mode, indent_width)
            }
        }
    }
}

pub(super) fn format_document_text(
    source: &str,
    mode: &str,
    file_path: Option<&str>,
    file_name: Option<&str>,
    document_path: &Option<PathBuf>,
    tab_width: u8,
) -> Result<String, String> {
    let format_mode =
        parse_format_mode(mode).ok_or_else(|| "Unsupported format mode. Use beautify or minify".to_string())?;
    let file_format = resolve_structured_format(file_path, file_name, document_path)
        .ok_or_else(|| "Only JSON, YAML, XML, HTML, and TOML files are supported".to_string())?;
    let preserve_comments = should_preserve_comments(source, file_format);

    format_structured_text(source, file_format, format_mode, tab_width, preserve_comments)
}

#[cfg(test)]
mod tests {
    use super::format_document_text;

    #[test]
    fn format_yaml_should_preserve_comments_and_succeed() {
        let source = "name: app\n# keep this comment\nenabled: true\n";
        let result = format_document_text(source, "beautify", None, Some("config.yaml"), &None, 2);

        let formatted = result.expect("expected formatting to succeed");
        assert!(formatted.contains("# keep this comment"));
    }

    #[test]
    fn format_toml_should_preserve_comments_and_succeed() {
        let source = "title = \"Rutar\"\n# keep this comment\nversion = \"1.0.0\"\n";
        let result = format_document_text(source, "beautify", None, Some("Cargo.toml"), &None, 2);

        let formatted = result.expect("expected formatting to succeed");
        assert!(formatted.contains("# keep this comment"));
    }

    #[test]
    fn format_yaml_should_keep_working_without_comments() {
        let source = "name: app\nfeatures:\n  - editor\n";
        let result = format_document_text(source, "beautify", None, Some("config.yaml"), &None, 2);

        assert!(result.is_ok());
    }

    #[test]
    fn format_html_should_beautify_even_when_not_well_formed_xml() {
        let source = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Rutar</title></head><body><h1>Hello</h1></body></html>";
        let result = format_document_text(source, "beautify", None, Some("index.html"), &None, 2);

        let formatted = result.expect("expected HTML formatting to succeed");
        assert!(formatted.contains("\n"));
        assert!(formatted.contains("<meta charset=\"utf-8\">"));
    }

    #[test]
    fn format_html_should_minify_document() {
        let source = "<html>\n  <body>\n    <h1>Hello</h1>\n  </body>\n</html>\n";
        let result = format_document_text(source, "minify", None, Some("index.htm"), &None, 2);

        let formatted = result.expect("expected HTML minify to succeed");
        assert_eq!(formatted, "<html><body><h1>Hello</h1></body></html>");
    }
}
