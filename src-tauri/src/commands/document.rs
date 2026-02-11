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
}

fn contextualize_leaf_kind(kind: &str, context: Option<LeafTokenContext>) -> String {
    match context {
        Some(LeafTokenContext::Key) => format!("key_{kind}"),
        Some(LeafTokenContext::IniSectionName) if kind == "text" => "section_name_text".to_string(),
        Some(LeafTokenContext::Comment) => format!("comment_{kind}"),
        _ => kind.to_string(),
    }
}

pub(super) fn ensure_document_tree(doc: &mut Document) {
    if doc.parser.is_none() {
        doc.tree = None;
        doc.syntax_dirty = false;
        return;
    }

    if !doc.syntax_dirty && doc.tree.is_some() {
        return;
    }

    if let Some(parser) = doc.parser.as_mut() {
        let source: String = doc.rope.chunks().collect();
        let parsed = parser.parse(&source, doc.tree.as_ref());
        doc.tree = parsed;
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

    if node.child_count() == 0 {
        let start = node.start_byte().max(range_start_byte);
        let end = node.end_byte().min(range_end_byte);

        if start < end {
            out.push(LeafToken {
                kind: contextualize_leaf_kind(node.kind(), context),
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
            let next_context = match cursor.field_name() {
                Some("key") => Some(LeafTokenContext::Key),
                Some("value") => Some(LeafTokenContext::Value),
                _ => match child_node.kind() {
                    "setting_name" => Some(LeafTokenContext::Key),
                    "setting_value" => Some(LeafTokenContext::Value),
                    "section_name" => Some(LeafTokenContext::IniSectionName),
                    "comment" => Some(LeafTokenContext::Comment),
                    _ => context,
                },
            };

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
) -> Result<Vec<SyntaxToken>, String> {
    if let Some(mut doc) = state.documents.get_mut(&id) {
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

        if let Some(tree) = doc.tree.as_ref() {
            let mut leaves = Vec::new();
            collect_leaf_tokens(tree.root_node(), start_byte, end_byte, None, &mut leaves);
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
) -> Result<Vec<Vec<SyntaxToken>>, String> {
    let tokens = get_syntax_tokens_impl(state, id, start_line, end_line)?;
    Ok(split_tokens_by_line(tokens))
}

#[cfg(test)]
mod tests {
    use super::{build_tokens_with_gaps, collect_leaf_tokens};
    use ropey::Rope;
    use tree_sitter::Parser;

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
}
