use std::path::PathBuf;
use tree_sitter::{Language, Parser};

pub(super) fn normalize_syntax_override(syntax_override: Option<&str>) -> Result<Option<String>, String> {
    let Some(raw_value) = syntax_override else {
        return Ok(None);
    };

    let normalized = raw_value.trim().to_lowercase();
    if normalized.is_empty() || normalized == "auto" {
        return Ok(None);
    }

    if normalized == "plain_text" {
        return Ok(Some(normalized));
    }

    if language_from_syntax_key(normalized.as_str()).is_some() {
        return Ok(Some(normalized));
    }

    Err(format!("Unsupported syntax override: {raw_value}"))
}

pub(super) fn resolve_document_language(path: &Option<PathBuf>, syntax_override: Option<&str>) -> Option<Language> {
    if let Some(syntax_key) = syntax_override {
        if syntax_key == "plain_text" {
            return None;
        }

        return language_from_syntax_key(syntax_key);
    }

    get_language_from_path(path)
}

pub(super) fn create_parser(language: Option<Language>) -> Option<Parser> {
    let lang = language?;
    let mut parser = Parser::new();
    parser.set_language(&lang).ok()?;
    Some(parser)
}

fn get_language_from_path(path: &Option<PathBuf>) -> Option<Language> {
    if let Some(path_value) = path {
        if let Some(file_name) = path_value.file_name().and_then(|name| name.to_str()) {
            let lower_name = file_name.to_lowercase();
            match lower_name.as_str() {
                "dockerfile" | "makefile" => return Some(tree_sitter_bash::LANGUAGE.into()),
                _ => {}
            }
        }

        if let Some(ext) = path_value.extension().and_then(|value| value.to_str()) {
            return match ext.to_lowercase().as_str() {
                "js" | "jsx" | "mjs" | "cjs" => Some(tree_sitter_javascript::LANGUAGE.into()),
                "ts" | "tsx" | "mts" | "cts" => Some(tree_sitter_typescript::LANGUAGE_TSX.into()),
                "rs" => Some(tree_sitter_rust::LANGUAGE.into()),
                "py" | "pyw" => Some(tree_sitter_python::LANGUAGE.into()),
                "json" | "jsonc" => Some(tree_sitter_json::LANGUAGE.into()),
                "html" | "htm" | "xhtml" => Some(tree_sitter_html::LANGUAGE.into()),
                "css" | "scss" | "sass" | "less" => Some(tree_sitter_css::LANGUAGE.into()),
                "sh" | "bash" | "zsh" => Some(tree_sitter_bash::LANGUAGE.into()),
                "toml" => Some(tree_sitter_toml_ng::LANGUAGE.into()),
                "yaml" | "yml" => Some(tree_sitter_yaml::LANGUAGE.into()),
                "xml" | "svg" => Some(tree_sitter_xml::LANGUAGE_XML.into()),
                "c" | "h" => Some(tree_sitter_c::LANGUAGE.into()),
                "cc" | "cp" | "cpp" | "cxx" | "c++" | "hh" | "hpp" | "hxx" => {
                    Some(tree_sitter_cpp::LANGUAGE.into())
                }
                "go" => Some(tree_sitter_go::LANGUAGE.into()),
                "java" => Some(tree_sitter_java::LANGUAGE.into()),
                _ => None,
            };
        }
    }

    None
}

fn language_from_syntax_key(syntax_key: &str) -> Option<Language> {
    match syntax_key {
        "javascript" => Some(tree_sitter_javascript::LANGUAGE.into()),
        "typescript" => Some(tree_sitter_typescript::LANGUAGE_TSX.into()),
        "rust" => Some(tree_sitter_rust::LANGUAGE.into()),
        "python" => Some(tree_sitter_python::LANGUAGE.into()),
        "json" => Some(tree_sitter_json::LANGUAGE.into()),
        "html" => Some(tree_sitter_html::LANGUAGE.into()),
        "css" => Some(tree_sitter_css::LANGUAGE.into()),
        "bash" => Some(tree_sitter_bash::LANGUAGE.into()),
        "toml" => Some(tree_sitter_toml_ng::LANGUAGE.into()),
        "yaml" => Some(tree_sitter_yaml::LANGUAGE.into()),
        "xml" => Some(tree_sitter_xml::LANGUAGE_XML.into()),
        "c" => Some(tree_sitter_c::LANGUAGE.into()),
        "cpp" => Some(tree_sitter_cpp::LANGUAGE.into()),
        "go" => Some(tree_sitter_go::LANGUAGE.into()),
        "java" => Some(tree_sitter_java::LANGUAGE.into()),
        _ => None,
    }
}
