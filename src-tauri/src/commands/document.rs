use super::*;

#[derive(Debug)]
struct LeafToken {
    kind: String,
    start_byte: usize,
    end_byte: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum LeafTokenContext {
    Key,
    Value,
    IniSectionName,
    Comment,
    MarkdownHeading,
    MarkdownEmphasis,
    MarkdownStrong,
    MarkdownCode,
    MarkdownLink,
    MarkdownImage,
}

fn contextualize_leaf_kind(kind: &str, context: Option<LeafTokenContext>) -> String {
    match context {
        Some(LeafTokenContext::Key) => format!("key_{kind}"),
        Some(LeafTokenContext::IniSectionName) if kind == "text" => "section_name_text".to_string(),
        Some(LeafTokenContext::Comment) => format!("comment_{kind}"),
        Some(LeafTokenContext::MarkdownHeading)
            if !matches!(
                kind,
                "atx_h1_marker"
                    | "atx_h2_marker"
                    | "atx_h3_marker"
                    | "atx_h4_marker"
                    | "atx_h5_marker"
                    | "atx_h6_marker"
                    | "setext_h1_underline"
                    | "setext_h2_underline"
            ) =>
        {
            "heading_text".to_string()
        }
        Some(LeafTokenContext::MarkdownEmphasis) if kind != "emphasis_delimiter" => {
            "emphasis_text".to_string()
        }
        Some(LeafTokenContext::MarkdownStrong) if kind != "emphasis_delimiter" => {
            "strong_text".to_string()
        }
        Some(LeafTokenContext::MarkdownCode)
            if kind != "fenced_code_block_delimiter" && kind != "code_span_delimiter" =>
        {
            "code_text".to_string()
        }
        Some(LeafTokenContext::MarkdownLink)
            if !matches!(
                kind,
                "backslash_escape" | "entity_reference" | "numeric_character_reference"
            ) =>
        {
            "link_text".to_string()
        }
        Some(LeafTokenContext::MarkdownImage)
            if !matches!(
                kind,
                "backslash_escape" | "entity_reference" | "numeric_character_reference"
            ) =>
        {
            "image_text".to_string()
        }
        _ => kind.to_string(),
    }
}

fn context_for_node_kind(
    kind: &str,
    inherited: Option<LeafTokenContext>,
) -> Option<LeafTokenContext> {
    match kind {
        "setting_name" => Some(LeafTokenContext::Key),
        "setting_value" => Some(LeafTokenContext::Value),
        "section_name" => Some(LeafTokenContext::IniSectionName),
        "comment" => Some(LeafTokenContext::Comment),
        "atx_heading" | "setext_heading" => Some(LeafTokenContext::MarkdownHeading),
        "emphasis" => Some(LeafTokenContext::MarkdownEmphasis),
        "strong_emphasis" => Some(LeafTokenContext::MarkdownStrong),
        "code_span"
        | "code_fence_content"
        | "fenced_code_block"
        | "indented_code_block"
        | "info_string" => Some(LeafTokenContext::MarkdownCode),
        "link_text" | "link_label" | "link_destination" | "uri_autolink" => {
            Some(LeafTokenContext::MarkdownLink)
        }
        "image_description" => Some(LeafTokenContext::MarkdownImage),
        _ => inherited,
    }
}

fn context_for_child_node(
    kind: &str,
    field_name: Option<&str>,
    inherited: Option<LeafTokenContext>,
) -> Option<LeafTokenContext> {
    match field_name {
        Some("key") => Some(LeafTokenContext::Key),
        Some("value") => Some(LeafTokenContext::Value),
        _ => context_for_node_kind(kind, inherited),
    }
}

pub(super) fn ensure_document_tree(doc: &mut Document) {
    match doc.parser.as_mut() {
        None => {
            doc.tree = None;
            doc.syntax_dirty = false;
            return;
        }
        Some(DocumentParser::TreeSitter(parser)) => {
            if !doc.syntax_dirty && matches!(doc.tree, Some(DocumentTree::TreeSitter(_))) {
                return;
            }

            let source: String = doc.rope.chunks().collect();
            let parsed = parser.parse(
                &source,
                match doc.tree.as_ref() {
                    Some(DocumentTree::TreeSitter(tree)) => Some(tree),
                    _ => None,
                },
            );
            doc.tree = parsed.map(DocumentTree::TreeSitter);
        }
        Some(DocumentParser::Markdown(parser)) => {
            if !doc.syntax_dirty && matches!(doc.tree, Some(DocumentTree::Markdown(_))) {
                return;
            }

            let source: String = doc.rope.chunks().collect();
            let parsed = parser.parse(
                source.as_bytes(),
                match doc.tree.as_ref() {
                    Some(DocumentTree::Markdown(tree)) => Some(tree),
                    _ => None,
                },
            );
            doc.tree = parsed.map(DocumentTree::Markdown);
        }
    }

    doc.syntax_dirty = false;
}

fn collect_leaf_tokens(
    node: tree_sitter::Node,
    range_start_byte: usize,
    range_end_byte: usize,
    context: Option<LeafTokenContext>,
    out: &mut Vec<LeafToken>,
) {
    if node.end_byte() <= range_start_byte || node.start_byte() >= range_end_byte {
        return;
    }

    let node_context = context_for_node_kind(node.kind(), context);

    if node.child_count() == 0 {
        let start = node.start_byte().max(range_start_byte);
        let end = node.end_byte().min(range_end_byte);

        if start < end {
            out.push(LeafToken {
                kind: contextualize_leaf_kind(node.kind(), node_context),
                start_byte: start,
                end_byte: end,
            });
        }

        return;
    }

    let mut cursor = node.walk();
    if cursor.goto_first_child() {
        loop {
            let child_node = cursor.node();
            let next_context =
                context_for_child_node(child_node.kind(), cursor.field_name(), node_context);

            collect_leaf_tokens(
                child_node,
                range_start_byte,
                range_end_byte,
                next_context,
                out,
            );
            if !cursor.goto_next_sibling() {
                break;
            }
        }
    }
}

fn maybe_push_markdown_compound_text_token(
    node: tree_sitter::Node,
    range_start_byte: usize,
    range_end_byte: usize,
    out: &mut Vec<LeafToken>,
) {
    let token_kind = match node.kind() {
        "emphasis" => "emphasis_text",
        "strong_emphasis" => "strong_text",
        "code_span" => "code_text",
        _ => return,
    };

    if node.child_count() < 2 {
        return;
    }

    let mut has_non_delimiter_named_child = false;
    for index in 0..node.named_child_count() {
        let Some(child) = u32::try_from(index)
            .ok()
            .and_then(|child_index| node.named_child(child_index))
        else {
            continue;
        };

        let is_supported_delimiter = matches!(
            (node.kind(), child.kind()),
            ("emphasis", "emphasis_delimiter")
                | ("strong_emphasis", "emphasis_delimiter")
                | ("code_span", "code_span_delimiter")
        );
        if !is_supported_delimiter {
            has_non_delimiter_named_child = true;
            break;
        }
    }

    if has_non_delimiter_named_child {
        return;
    }

    let Some(first_child) = node.child(0) else {
        return;
    };
    let last_child_index = node.child_count().saturating_sub(1);
    let Some(last_child) = u32::try_from(last_child_index)
        .ok()
        .and_then(|index| node.child(index))
    else {
        return;
    };

    let start = first_child.end_byte().max(range_start_byte);
    let end = last_child.start_byte().min(range_end_byte);
    if start >= end {
        return;
    }

    out.push(LeafToken {
        kind: token_kind.to_string(),
        start_byte: start,
        end_byte: end,
    });
}

fn node_text(rope: &Rope, node: tree_sitter::Node) -> String {
    rope.byte_slice(node.start_byte()..node.end_byte())
        .to_string()
}

fn collect_injected_leaf_tokens_for_source(
    source: &str,
    syntax_key: &str,
) -> Option<Vec<LeafToken>> {
    let mut parser = syntax::create_parser_for_syntax_key(syntax_key)?;

    match &mut parser {
        DocumentParser::TreeSitter(parser) => {
            let tree = parser.parse(source, None)?;
            let mut leaves = Vec::new();
            collect_leaf_tokens(tree.root_node(), 0, source.len(), None, &mut leaves);
            Some(leaves)
        }
        DocumentParser::Markdown(parser) => {
            let tree = parser.parse(source.as_bytes(), None)?;
            let rope = Rope::from_str(source);
            let mut cursor = tree.walk();
            let mut leaves = Vec::new();
            collect_markdown_leaf_tokens(&mut cursor, &rope, 0, source.len(), None, &mut leaves);
            Some(leaves)
        }
    }
}

fn injected_markdown_fence_leaves(
    node: tree_sitter::Node,
    rope: &Rope,
    range_start_byte: usize,
    range_end_byte: usize,
) -> Option<Vec<LeafToken>> {
    let mut info_string = None;
    let mut content_node = None;

    let mut child_cursor = node.walk();
    if child_cursor.goto_first_child() {
        loop {
            let child_node = child_cursor.node();
            match child_node.kind() {
                "info_string" => info_string = Some(node_text(rope, child_node)),
                "code_fence_content" => content_node = Some(child_node),
                _ => {}
            }

            if !child_cursor.goto_next_sibling() {
                break;
            }
        }
    }

    let content_node = content_node?;
    let syntax_key = syntax::syntax_key_from_markdown_fence_info(info_string.as_deref()?)?;
    if content_node.end_byte() <= range_start_byte || content_node.start_byte() >= range_end_byte {
        return Some(Vec::new());
    }

    let source = node_text(rope, content_node);
    if source.is_empty() {
        return Some(Vec::new());
    }

    let mut leaves = collect_injected_leaf_tokens_for_source(source.as_str(), syntax_key.as_str())?;
    for leaf in &mut leaves {
        leaf.start_byte = leaf.start_byte.saturating_add(content_node.start_byte());
        leaf.end_byte = leaf.end_byte.saturating_add(content_node.start_byte());
    }

    Some(leaves)
}

fn collect_markdown_fenced_code_block_tokens(
    cursor: &mut tree_sitter_md::MarkdownCursor<'_>,
    rope: &Rope,
    range_start_byte: usize,
    range_end_byte: usize,
    context: Option<LeafTokenContext>,
    out: &mut Vec<LeafToken>,
) {
    let node = cursor.node();
    let mut injected_leaves =
        injected_markdown_fence_leaves(node, rope, range_start_byte, range_end_byte);

    if !cursor.goto_first_child() {
        return;
    }

    loop {
        let child_node = cursor.node();
        if child_node.kind() == "code_fence_content" {
            if let Some(leaves) = injected_leaves.take() {
                out.extend(leaves);
            } else {
                collect_markdown_leaf_tokens(
                    cursor,
                    rope,
                    range_start_byte,
                    range_end_byte,
                    context,
                    out,
                );
            }
        } else {
            collect_markdown_leaf_tokens(
                cursor,
                rope,
                range_start_byte,
                range_end_byte,
                context,
                out,
            );
        }

        if !cursor.goto_next_sibling() {
            break;
        }
    }

    let _ = cursor.goto_parent();
}

fn collect_markdown_leaf_tokens(
    cursor: &mut tree_sitter_md::MarkdownCursor<'_>,
    rope: &Rope,
    range_start_byte: usize,
    range_end_byte: usize,
    context: Option<LeafTokenContext>,
    out: &mut Vec<LeafToken>,
) {
    let node = cursor.node();
    if node.end_byte() <= range_start_byte || node.start_byte() >= range_end_byte {
        return;
    }

    let node_context = context_for_node_kind(node.kind(), context);
    if node.kind() == "fenced_code_block" {
        collect_markdown_fenced_code_block_tokens(
            cursor,
            rope,
            range_start_byte,
            range_end_byte,
            node_context,
            out,
        );
        return;
    }

    maybe_push_markdown_compound_text_token(node, range_start_byte, range_end_byte, out);

    if !cursor.goto_first_child() {
        let start = node.start_byte().max(range_start_byte);
        let end = node.end_byte().min(range_end_byte);

        if start < end {
            out.push(LeafToken {
                kind: contextualize_leaf_kind(node.kind(), node_context),
                start_byte: start,
                end_byte: end,
            });
        }

        return;
    }

    loop {
        collect_markdown_leaf_tokens(
            cursor,
            rope,
            range_start_byte,
            range_end_byte,
            node_context,
            out,
        );
        if !cursor.goto_next_sibling() {
            break;
        }
    }

    let _ = cursor.goto_parent();
}

fn push_plain_token(
    tokens: &mut Vec<SyntaxToken>,
    rope: &Rope,
    start_byte: usize,
    end_byte: usize,
) {
    if start_byte >= end_byte {
        return;
    }

    let text = rope.byte_slice(start_byte..end_byte).to_string();
    if text.is_empty() {
        return;
    }

    tokens.push(SyntaxToken {
        r#type: None,
        text: Some(text),
        start_byte: Some(start_byte),
        end_byte: Some(end_byte),
    });
}

fn build_tokens_with_gaps(
    rope: &Rope,
    mut leaves: Vec<LeafToken>,
    range_start_byte: usize,
    range_end_byte: usize,
) -> Vec<SyntaxToken> {
    leaves.sort_by(|a, b| {
        a.start_byte
            .cmp(&b.start_byte)
            .then(a.end_byte.cmp(&b.end_byte))
    });

    let mut tokens = Vec::new();
    let mut last_pos = range_start_byte;

    for leaf in leaves {
        if leaf.end_byte <= last_pos {
            continue;
        }

        if leaf.start_byte > last_pos {
            push_plain_token(&mut tokens, rope, last_pos, leaf.start_byte);
        }

        let start = leaf.start_byte.max(last_pos);
        let end = leaf.end_byte.min(range_end_byte);

        if start < end {
            let text = rope.byte_slice(start..end).to_string();
            if !text.is_empty() {
                tokens.push(SyntaxToken {
                    r#type: Some(leaf.kind),
                    text: Some(text),
                    start_byte: Some(start),
                    end_byte: Some(end),
                });
            }
            last_pos = end;
        }

        if last_pos >= range_end_byte {
            break;
        }
    }

    if last_pos < range_end_byte {
        push_plain_token(&mut tokens, rope, last_pos, range_end_byte);
    }

    tokens
}

fn split_tokens_by_line(tokens: Vec<SyntaxToken>) -> Vec<Vec<SyntaxToken>> {
    let mut lines: Vec<Vec<SyntaxToken>> = Vec::new();
    let mut current_line: Vec<SyntaxToken> = Vec::new();

    for token in tokens {
        let Some(text) = token.text.clone() else {
            continue;
        };

        let normalized = text.replace("\r\n", "\n");
        if !normalized.contains('\n') {
            current_line.push(token);
            continue;
        }

        let parts: Vec<&str> = normalized.split('\n').collect();
        if parts.is_empty() {
            continue;
        }

        current_line.push(SyntaxToken {
            text: Some(parts[0].to_string()),
            ..token.clone()
        });
        lines.push(current_line);

        for part in parts.iter().skip(1).take(parts.len().saturating_sub(2)) {
            lines.push(vec![SyntaxToken {
                text: Some((*part).to_string()),
                ..token.clone()
            }]);
        }

        current_line = vec![SyntaxToken {
            text: Some(parts[parts.len() - 1].to_string()),
            ..token
        }];
    }

    if !current_line.is_empty() {
        lines.push(current_line);
    }

    lines
}

fn register_syntax_request_serial(
    state: &AppState,
    id: &str,
    request_serial: Option<u64>,
) -> Option<u64> {
    let Some(serial) = request_serial else {
        return None;
    };

    state
        .syntax_request_serials
        .entry(id.to_string())
        .and_modify(|latest| {
            if serial > *latest {
                *latest = serial;
            }
        })
        .or_insert(serial);

    Some(serial)
}

fn is_syntax_request_stale(state: &AppState, id: &str, request_serial: Option<u64>) -> bool {
    let Some(serial) = request_serial else {
        return false;
    };

    state
        .syntax_request_serials
        .get(id)
        .map(|latest| *latest > serial)
        .unwrap_or(false)
}

pub(super) fn get_document_version_impl(
    state: State<'_, AppState>,
    id: String,
) -> Result<u64, String> {
    if let Some(doc) = state.documents.get(&id) {
        Ok(doc.document_version)
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn get_syntax_tokens_impl(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
    request_serial: Option<u64>,
) -> Result<Vec<SyntaxToken>, String> {
    let request_serial = register_syntax_request_serial(&state, &id, request_serial);

    if let Some(mut doc) = state.documents.get_mut(&id) {
        if is_syntax_request_stale(&state, &id, request_serial) {
            return Ok(Vec::new());
        }

        let len = doc.rope.len_lines();
        let start = start_line.min(len);
        let end = end_line.min(len);

        if start >= end {
            return Ok(Vec::new());
        }

        let start_char = doc.rope.line_to_char(start);
        let end_char = doc.rope.line_to_char(end);

        let start_byte = doc.rope.char_to_byte(start_char);
        let end_byte = doc.rope.char_to_byte(end_char);

        if start_byte >= end_byte {
            return Ok(Vec::new());
        }

        ensure_document_tree(&mut doc);
        if is_syntax_request_stale(&state, &id, request_serial) {
            return Ok(Vec::new());
        }

        if let Some(tree) = doc.tree.as_ref() {
            let mut leaves = Vec::new();
            match tree {
                DocumentTree::TreeSitter(tree) => {
                    collect_leaf_tokens(tree.root_node(), start_byte, end_byte, None, &mut leaves);
                }
                DocumentTree::Markdown(tree) => {
                    let mut cursor = tree.walk();
                    collect_markdown_leaf_tokens(
                        &mut cursor,
                        &doc.rope,
                        start_byte,
                        end_byte,
                        None,
                        &mut leaves,
                    );
                }
            }
            Ok(build_tokens_with_gaps(
                &doc.rope, leaves, start_byte, end_byte,
            ))
        } else {
            Ok(vec![SyntaxToken {
                r#type: None,
                text: Some(doc.rope.byte_slice(start_byte..end_byte).to_string()),
                start_byte: Some(start_byte),
                end_byte: Some(end_byte),
            }])
        }
    } else {
        Err("Document not found".to_string())
    }
}

pub(super) fn get_syntax_token_lines_impl(
    state: State<'_, AppState>,
    id: String,
    start_line: usize,
    end_line: usize,
    request_serial: Option<u64>,
) -> Result<Vec<Vec<SyntaxToken>>, String> {
    let tokens = get_syntax_tokens_impl(state, id, start_line, end_line, request_serial)?;
    Ok(split_tokens_by_line(tokens))
}

#[cfg(test)]
mod tests {
    use super::{
        build_tokens_with_gaps, collect_leaf_tokens, collect_markdown_leaf_tokens,
        is_syntax_request_stale, register_syntax_request_serial,
    };
    use crate::state::AppState;
    use ropey::Rope;
    use tree_sitter::Parser;
    use tree_sitter_md::MarkdownParser;

    #[test]
    fn ini_tokens_should_include_key_value_section_and_comment() {
        let source = "[editor]\nname = rutar\nenabled = true\n; comment\n";

        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_ini::LANGUAGE.into())
            .expect("set ini parser");

        let tree = parser.parse(source, None).expect("parse ini");
        let mut leaves = Vec::new();
        collect_leaf_tokens(tree.root_node(), 0, source.len(), None, &mut leaves);

        let rope = Rope::from_str(source);
        let tokens = build_tokens_with_gaps(&rope, leaves, 0, source.len());

        let token_types: Vec<String> = tokens
            .into_iter()
            .filter_map(|token| token.r#type)
            .collect();

        assert!(token_types.iter().any(|kind| kind == "section_name_text"));
        assert!(token_types.iter().any(|kind| kind == "key_setting_name"));
        assert!(token_types.iter().any(|kind| kind == "setting_value"));
        assert!(token_types.iter().any(|kind| kind == "comment_text"));
    }

    #[test]
    fn markdown_tokens_should_include_heading_link_emphasis_and_code_context() {
        let source = "# Title

Visit [docs](https://example.com) with *em* and **strong** plus `code`.
";

        let mut parser = MarkdownParser::default();
        let tree = parser
            .parse(source.as_bytes(), None)
            .expect("parse markdown");
        let rope = Rope::from_str(source);
        let mut cursor = tree.walk();
        let mut leaves = Vec::new();
        collect_markdown_leaf_tokens(&mut cursor, &rope, 0, source.len(), None, &mut leaves);

        let tokens = build_tokens_with_gaps(&rope, leaves, 0, source.len());
        let token_types: Vec<String> = tokens
            .into_iter()
            .filter_map(|token| token.r#type)
            .collect();

        assert!(token_types.iter().any(|kind| kind == "heading_text"));
        assert!(token_types.iter().any(|kind| kind == "link_text"));
        assert!(
            token_types
                .iter()
                .any(|kind| kind == "emphasis_text" || kind == "emphasis"),
            "{token_types:?}"
        );
        assert!(token_types
            .iter()
            .any(|kind| kind == "strong_text" || kind == "strong_emphasis"));
        assert!(token_types
            .iter()
            .any(|kind| kind == "code_span" || kind == "code_text"));
    }

    #[test]
    fn markdown_fenced_code_blocks_should_inject_typescript_tokens() {
        let source = "~~~ts
const answer = 42;
~~~
";

        let mut parser = MarkdownParser::default();
        let tree = parser
            .parse(source.as_bytes(), None)
            .expect("parse markdown");
        let rope = Rope::from_str(source);
        let mut cursor = tree.walk();
        let mut leaves = Vec::new();
        collect_markdown_leaf_tokens(&mut cursor, &rope, 0, source.len(), None, &mut leaves);

        let tokens = build_tokens_with_gaps(&rope, leaves, 0, source.len());
        let token_types: Vec<String> = tokens
            .into_iter()
            .filter_map(|token| token.r#type)
            .collect();

        assert!(
            token_types.iter().any(|kind| kind == "const"),
            "{token_types:?}"
        );
        assert!(
            token_types.iter().any(|kind| kind == "identifier"),
            "{token_types:?}"
        );
        assert!(
            token_types.iter().any(|kind| kind == "number"),
            "{token_types:?}"
        );
    }

    #[test]
    fn markdown_unsupported_fence_should_keep_code_text_fallback() {
        let source = "~~~mermaid
flowchart TD
~~~
";

        let mut parser = MarkdownParser::default();
        let tree = parser
            .parse(source.as_bytes(), None)
            .expect("parse markdown");
        let rope = Rope::from_str(source);
        let mut cursor = tree.walk();
        let mut leaves = Vec::new();
        collect_markdown_leaf_tokens(&mut cursor, &rope, 0, source.len(), None, &mut leaves);

        let tokens = build_tokens_with_gaps(&rope, leaves, 0, source.len());
        let token_types: Vec<String> = tokens
            .into_iter()
            .filter_map(|token| token.r#type)
            .collect();

        assert!(
            token_types.iter().any(|kind| kind == "code_text"),
            "{token_types:?}"
        );
    }

    #[test]
    fn syntax_request_serial_should_keep_latest_value() {
        let state = AppState::new(Vec::new());
        register_syntax_request_serial(&state, "doc-1", Some(5));
        register_syntax_request_serial(&state, "doc-1", Some(3));
        register_syntax_request_serial(&state, "doc-1", Some(8));

        let latest = state
            .syntax_request_serials
            .get("doc-1")
            .map(|value| *value)
            .expect("latest syntax request serial should exist");
        assert_eq!(latest, 8);
    }

    #[test]
    fn syntax_request_stale_detection_should_compare_against_latest_value() {
        let state = AppState::new(Vec::new());
        register_syntax_request_serial(&state, "doc-2", Some(10));

        assert!(is_syntax_request_stale(&state, "doc-2", Some(9)));
        assert!(!is_syntax_request_stale(&state, "doc-2", Some(10)));
        assert!(!is_syntax_request_stale(&state, "doc-2", Some(12)));
        assert!(!is_syntax_request_stale(&state, "doc-2", None));
    }
}
