pub(super) fn normalize_to_lf(content: &str) -> String {
    content.replace("\r\n", "\n").replace('\r', "\n")
}

#[cfg(test)]
mod tests {
    use super::normalize_to_lf;

    #[test]
    fn normalize_to_lf_should_convert_all_line_endings_to_lf() {
        let original = "line1\r\nline2\rline3\nline4";
        let normalized = normalize_to_lf(original);

        assert_eq!(normalized, "line1\nline2\nline3\nline4");
    }

    #[test]
    fn normalize_to_lf_should_keep_existing_lf_content_unchanged() {
        let original = "alpha\nbeta\ngamma";
        let normalized = normalize_to_lf(original);

        assert_eq!(normalized, original);
    }
}
