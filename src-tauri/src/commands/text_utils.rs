pub(super) fn normalize_to_lf(content: &str) -> String {
    content.replace("\r\n", "\n").replace('\r', "\n")
}
