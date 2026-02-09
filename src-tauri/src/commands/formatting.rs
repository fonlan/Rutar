use std::path::PathBuf;
use quick_xml::events::Event;
use quick_xml::{Reader, Writer};
use serde::Serialize;

#[derive(Clone, Copy)]
enum StructuredFormat {
    Json,
    Yaml,
    Xml,
    Toml,
}

#[derive(Clone, Copy)]
enum FormatMode {
    Beautify,
    Minify,
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

fn format_structured_text(
    source: &str,
    file_format: StructuredFormat,
    mode: FormatMode,
    tab_width: u8,
) -> Result<String, String> {
    let indent_width = normalize_tab_width(tab_width) as usize;

    match file_format {
        StructuredFormat::Json => format_json(source, mode, indent_width),
        StructuredFormat::Yaml => format_yaml(source, mode, indent_width),
        StructuredFormat::Xml => format_xml(source, mode, indent_width),
        StructuredFormat::Toml => format_toml(source, mode, indent_width),
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
        .ok_or_else(|| "Only JSON, YAML, XML, and TOML files are supported".to_string())?;

    format_structured_text(source, file_format, format_mode, tab_width)
}
