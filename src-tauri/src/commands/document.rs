use super::*;

#[derive(Debug)]
struct LeafToken {
    kind: String,
    start_byte: usize,
    end_byte: usize,
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
                kind: node.kind().to_string(),
                start_byte: start,
                end_byte: end,
            });
        }

        return;
    }

    let mut cursor = node.walk();
    if cursor.goto_first_child() {
        loop {
            collect_leaf_tokens(cursor.node(), range_start_byte, range_end_byte, out);
            if !cursor.goto_next_sibling() {
                break;
            }
        }
    }
}

fn push_plain_token(tokens: &mut Vec<SyntaxToken>, rope: &Rope, start_byte: usize, end_byte: usize) {
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

pub(super) fn get_document_version_impl(state: State<'_, AppState>, id: String) -> Result<u64, String> {
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
            collect_leaf_tokens(tree.root_node(), start_byte, end_byte, &mut leaves);
            Ok(build_tokens_with_gaps(&doc.rope, leaves, start_byte, end_byte))
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
