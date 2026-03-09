use std::path::PathBuf;
use tree_sitter::{Language, Parser};

pub(super) fn normalize_syntax_override(
    syntax_override: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(raw_value) = syntax_override else {
        return Ok(None);
    };

    let normalized = raw_value.trim().to_lowercase();
    if normalized.is_empty() || normalized == "auto" {
        return Ok(None);
    }

    if normalized == "plain_text" || normalized == "markdown" {
        return Ok(Some(normalized));
    }

    if language_from_syntax_key(normalized.as_str()).is_some() {
        return Ok(Some(normalized));
    }

    Err(format!("Unsupported syntax override: {raw_value}"))
}

pub(super) fn resolve_document_language(
    path: &Option<PathBuf>,
    syntax_override: Option<&str>,
) -> Option<Language> {
    if let Some(syntax_key) = syntax_override {
        if syntax_key == "plain_text" || syntax_key == "markdown" {
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
                "dockerfile" | "containerfile" => {
                    return Some(tree_sitter_dockerfile::language());
                }
                "makefile" | "gnumakefile" => return Some(tree_sitter_make::LANGUAGE.into()),
                ".zshenv" | ".zprofile" | ".zshrc" | ".zlogin" | ".zlogout" => {
                    return Some(tree_sitter_zsh::LANGUAGE.into());
                }
                "gemfile" | "rakefile" => return Some(tree_sitter_ruby::LANGUAGE.into()),
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
                "dockerfile" => Some(tree_sitter_dockerfile::language()),
                "ini" | "cfg" | "conf" | "cnf" | "properties" => {
                    Some(tree_sitter_ini::LANGUAGE.into())
                }
                "html" | "htm" | "xhtml" => Some(tree_sitter_html::LANGUAGE.into()),
                "css" | "scss" | "sass" | "less" => Some(tree_sitter_css::LANGUAGE.into()),
                "sh" | "bash" => Some(tree_sitter_bash::LANGUAGE.into()),
                "zsh" => Some(tree_sitter_zsh::LANGUAGE.into()),
                "mk" | "mak" => Some(tree_sitter_make::LANGUAGE.into()),
                "toml" => Some(tree_sitter_toml_ng::LANGUAGE.into()),
                "yaml" | "yml" => Some(tree_sitter_yaml::LANGUAGE.into()),
                "xml" | "svg" => Some(tree_sitter_xml::LANGUAGE_XML.into()),
                "c" | "h" => Some(tree_sitter_c::LANGUAGE.into()),
                "cc" | "cp" | "cpp" | "cxx" | "c++" | "hh" | "hpp" | "hxx" => {
                    Some(tree_sitter_cpp::LANGUAGE.into())
                }
                "go" => Some(tree_sitter_go::LANGUAGE.into()),
                "java" => Some(tree_sitter_java::LANGUAGE.into()),
                "cs" => Some(tree_sitter_c_sharp::LANGUAGE.into()),
                "hcl" | "tf" | "tfvars" => Some(tree_sitter_hcl::LANGUAGE.into()),
                "lua" => Some(tree_sitter_lua::LANGUAGE.into()),
                "php" | "phtml" => Some(tree_sitter_php::LANGUAGE_PHP.into()),
                "kt" | "kts" => Some(tree_sitter_kotlin_ng::LANGUAGE.into()),
                "ps1" | "psd1" | "psm1" => Some(tree_sitter_powershell::LANGUAGE.into()),
                "rb" | "rake" | "gemspec" | "ru" => Some(tree_sitter_ruby::LANGUAGE.into()),
                "sql" => Some(tree_sitter_sequel::LANGUAGE.into()),
                "swift" => Some(tree_sitter_swift::LANGUAGE.into()),
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
        "jsonc" => Some(tree_sitter_json::LANGUAGE.into()),
        "dockerfile" => Some(tree_sitter_dockerfile::language()),
        "makefile" => Some(tree_sitter_make::LANGUAGE.into()),
        "ini" => Some(tree_sitter_ini::LANGUAGE.into()),
        "html" => Some(tree_sitter_html::LANGUAGE.into()),
        "css" => Some(tree_sitter_css::LANGUAGE.into()),
        "bash" => Some(tree_sitter_bash::LANGUAGE.into()),
        "zsh" => Some(tree_sitter_zsh::LANGUAGE.into()),
        "toml" => Some(tree_sitter_toml_ng::LANGUAGE.into()),
        "yaml" => Some(tree_sitter_yaml::LANGUAGE.into()),
        "xml" => Some(tree_sitter_xml::LANGUAGE_XML.into()),
        "c" => Some(tree_sitter_c::LANGUAGE.into()),
        "cpp" => Some(tree_sitter_cpp::LANGUAGE.into()),
        "go" => Some(tree_sitter_go::LANGUAGE.into()),
        "java" => Some(tree_sitter_java::LANGUAGE.into()),
        "csharp" => Some(tree_sitter_c_sharp::LANGUAGE.into()),
        "hcl" => Some(tree_sitter_hcl::LANGUAGE.into()),
        "lua" => Some(tree_sitter_lua::LANGUAGE.into()),
        "php" => Some(tree_sitter_php::LANGUAGE_PHP.into()),
        "kotlin" => Some(tree_sitter_kotlin_ng::LANGUAGE.into()),
        "powershell" => Some(tree_sitter_powershell::LANGUAGE.into()),
        "ruby" => Some(tree_sitter_ruby::LANGUAGE.into()),
        "sql" => Some(tree_sitter_sequel::LANGUAGE.into()),
        "swift" => Some(tree_sitter_swift::LANGUAGE.into()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{create_parser, get_language_from_path, normalize_syntax_override};
    use std::path::PathBuf;

    #[test]
    fn ini_extension_should_resolve_language() {
        let path = Some(PathBuf::from("settings.ini"));
        assert!(get_language_from_path(&path).is_some());
    }

    #[test]
    fn dockerfile_and_makefile_special_names_should_resolve_languages() {
        for file_name in ["Dockerfile", "Containerfile", "Makefile", "GNUmakefile"] {
            let path = Some(PathBuf::from(file_name));
            assert!(
                get_language_from_path(&path).is_some(),
                "expected language for {file_name}"
            );
        }
    }

    #[test]
    fn zsh_special_names_should_resolve_language() {
        for file_name in [".zshenv", ".zprofile", ".zshrc", ".zlogin", ".zlogout"] {
            let path = Some(PathBuf::from(file_name));
            assert!(
                get_language_from_path(&path).is_some(),
                "expected language for {file_name}"
            );
        }
    }

    #[test]
    fn dockerfile_and_makefile_extensions_should_resolve_languages() {
        for file_name in ["service.Dockerfile", "build.mk"] {
            let path = Some(PathBuf::from(file_name));
            assert!(
                get_language_from_path(&path).is_some(),
                "expected language for {file_name}"
            );
        }
    }

    #[test]
    fn zsh_and_jsonc_extensions_should_resolve_languages() {
        for file_name in ["shell.zsh", "settings.jsonc"] {
            let path = Some(PathBuf::from(file_name));
            assert!(
                get_language_from_path(&path).is_some(),
                "expected language for {file_name}"
            );
        }
    }

    #[test]
    fn ini_syntax_override_should_be_supported() {
        let normalized = normalize_syntax_override(Some("INI"));
        assert_eq!(normalized.ok(), Some(Some("ini".to_string())));
    }

    #[test]
    fn dockerfile_and_makefile_syntax_overrides_should_be_supported() {
        for syntax_key in ["dockerfile", "makefile"] {
            let normalized = normalize_syntax_override(Some(syntax_key));
            assert_eq!(
                normalized.ok(),
                Some(Some(syntax_key.to_string())),
                "expected syntax override for {syntax_key}"
            );
        }
    }

    #[test]
    fn zsh_and_jsonc_syntax_overrides_should_be_supported() {
        for syntax_key in ["zsh", "jsonc"] {
            let normalized = normalize_syntax_override(Some(syntax_key));
            assert_eq!(
                normalized.ok(),
                Some(Some(syntax_key.to_string())),
                "expected syntax override for {syntax_key}"
            );
        }
    }

    #[test]
    fn csharp_php_kotlin_and_swift_extensions_should_resolve_languages() {
        for file_name in [
            "Program.cs",
            "index.php",
            "index.phtml",
            "build.kts",
            "App.swift",
        ] {
            let path = Some(PathBuf::from(file_name));
            assert!(
                get_language_from_path(&path).is_some(),
                "expected language for {file_name}"
            );
        }
    }

    #[test]
    fn hcl_lua_powershell_ruby_and_sql_extensions_should_resolve_languages() {
        for file_name in [
            "main.tf",
            "main.tfvars",
            "main.hcl",
            "main.lua",
            "script.ps1",
            "module.psm1",
            "Gemfile",
            "main.rb",
            "schema.sql",
        ] {
            let path = Some(PathBuf::from(file_name));
            assert!(
                get_language_from_path(&path).is_some(),
                "expected language for {file_name}"
            );
        }
    }

    #[test]
    fn csharp_php_kotlin_and_swift_syntax_overrides_should_be_supported() {
        for syntax_key in ["csharp", "php", "kotlin", "swift"] {
            let normalized = normalize_syntax_override(Some(syntax_key));
            assert_eq!(
                normalized.ok(),
                Some(Some(syntax_key.to_string())),
                "expected syntax override for {syntax_key}"
            );
        }
    }

    #[test]
    fn hcl_lua_powershell_ruby_and_sql_syntax_overrides_should_be_supported() {
        for syntax_key in ["hcl", "lua", "powershell", "ruby", "sql"] {
            let normalized = normalize_syntax_override(Some(syntax_key));
            assert_eq!(
                normalized.ok(),
                Some(Some(syntax_key.to_string())),
                "expected syntax override for {syntax_key}"
            );
        }
    }

    #[test]
    fn markdown_syntax_override_should_be_supported() {
        let normalized = normalize_syntax_override(Some("Markdown"));
        assert_eq!(normalized.ok(), Some(Some("markdown".to_string())));
    }

    #[test]
    fn ini_language_should_create_parser() {
        let path = Some(PathBuf::from("settings.ini"));
        let language = get_language_from_path(&path);
        let parser = create_parser(language);
        assert!(parser.is_some());
    }

    #[test]
    fn dockerfile_and_makefile_languages_should_create_parsers() {
        for file_name in ["service.Dockerfile", "build.mk"] {
            let path = Some(PathBuf::from(file_name));
            let language = get_language_from_path(&path);
            let parser = create_parser(language);
            assert!(parser.is_some(), "expected parser for {file_name}");
        }
    }

    #[test]
    fn zsh_and_jsonc_languages_should_create_parsers() {
        for file_name in [".zshrc", "settings.jsonc"] {
            let path = Some(PathBuf::from(file_name));
            let language = get_language_from_path(&path);
            let parser = create_parser(language);
            assert!(parser.is_some(), "expected parser for {file_name}");
        }
    }

    #[test]
    fn csharp_php_kotlin_and_swift_languages_should_create_parsers() {
        for file_name in ["Program.cs", "index.php", "build.kts", "App.swift"] {
            let path = Some(PathBuf::from(file_name));
            let language = get_language_from_path(&path);
            let parser = create_parser(language);
            assert!(parser.is_some(), "expected parser for {file_name}");
        }
    }

    #[test]
    fn hcl_lua_powershell_ruby_and_sql_languages_should_create_parsers() {
        for file_name in ["main.tf", "main.lua", "script.ps1", "Gemfile", "schema.sql"] {
            let path = Some(PathBuf::from(file_name));
            let language = get_language_from_path(&path);
            let parser = create_parser(language);
            assert!(parser.is_some(), "expected parser for {file_name}");
        }
    }
}
