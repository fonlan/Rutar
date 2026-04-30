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

    if is_supported_syntax_key(normalized.as_str()) {
        return Ok(Some(normalized));
    }

    Err(format!("Unsupported syntax override: {raw_value}"))
}

fn is_supported_syntax_key(syntax_key: &str) -> bool {
    matches!(
        syntax_key,
        "plain_text"
            | "markdown"
            | "javascript"
            | "typescript"
            | "rust"
            | "python"
            | "json"
            | "jsonc"
            | "dockerfile"
            | "makefile"
            | "ini"
            | "html"
            | "css"
            | "bash"
            | "zsh"
            | "toml"
            | "yaml"
            | "xml"
            | "c"
            | "cpp"
            | "go"
            | "java"
            | "csharp"
            | "hcl"
            | "lua"
            | "php"
            | "kotlin"
            | "powershell"
            | "ruby"
            | "sql"
            | "swift"
    )
}

#[cfg(test)]
mod tests {
    use super::normalize_syntax_override;

    #[test]
    fn auto_and_empty_syntax_overrides_should_clear_override() {
        for syntax_key in [None, Some(""), Some("auto"), Some(" AUTO ")] {
            assert_eq!(
                normalize_syntax_override(syntax_key).expect("override should normalize"),
                None
            );
        }
    }

    #[test]
    fn known_syntax_overrides_should_be_supported() {
        for syntax_key in [
            "plain_text",
            "markdown",
            "ini",
            "dockerfile",
            "makefile",
            "zsh",
            "jsonc",
            "csharp",
            "php",
            "kotlin",
            "swift",
            "hcl",
            "lua",
            "powershell",
            "ruby",
            "sql",
        ] {
            assert_eq!(
                normalize_syntax_override(Some(syntax_key)).expect("override should normalize"),
                Some(syntax_key.to_string()),
                "expected syntax override for {syntax_key}"
            );
        }
    }

    #[test]
    fn syntax_overrides_should_normalize_case() {
        assert_eq!(
            normalize_syntax_override(Some("INI")).expect("override should normalize"),
            Some("ini".to_string())
        );
    }

    #[test]
    fn unsupported_syntax_override_should_return_error() {
        let error = normalize_syntax_override(Some("mermaid"))
            .expect_err("unsupported override should fail");
        assert_eq!(error, "Unsupported syntax override: mermaid");
    }
}
