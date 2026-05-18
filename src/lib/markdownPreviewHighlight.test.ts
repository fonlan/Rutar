import { afterEach, describe, expect, it } from 'vitest';
import { highlightMarkdownCodeBlocks } from './markdownPreviewHighlight';

function createArticleWithCode(language: string, source: string): HTMLElement {
  const article = document.createElement('article');
  article.className = 'markdown-preview';
  article.innerHTML = `<pre><code class="language-${language}">${source}</code></pre>`;
  document.body.appendChild(article);
  return article;
}

describe('highlightMarkdownCodeBlocks', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('produces Prism token spans on the first run for typescript code', async () => {
    const article = createArticleWithCode('ts', 'const count: number = 1;');

    await highlightMarkdownCodeBlocks(article);

    const codeElement = article.querySelector('pre > code')!;
    expect(codeElement.getAttribute('data-rutar-prism-highlighted')).toBe('true');
    const tokenKeyword = codeElement.querySelector('.token.keyword');
    expect(tokenKeyword).not.toBeNull();
    expect(tokenKeyword?.textContent).toBe('const');
  });

  it('maps bat code fences to Prism batch highlighting', async () => {
    const article = createArticleWithCode('bat', 'REM hello\necho done');

    await highlightMarkdownCodeBlocks(article);

    const codeElement = article.querySelector('pre > code')!;
    expect(codeElement.getAttribute('data-rutar-prism-highlighted')).toBe('true');
    expect(codeElement.classList.contains('language-batch')).toBe(true);
    const tokenComment = codeElement.querySelector('.token.comment');
    expect(tokenComment).not.toBeNull();
    expect(tokenComment?.textContent).toBe('REM hello');
  });

  it('still highlights code blocks when the article DOM is rewritten between Prism load and apply', async () => {
    const article = createArticleWithCode('ts', 'const count: number = 1;');

    // Kick off the highlight pipeline. Internally it captures candidates,
    // awaits the Prism dynamic import, and only then iterates. We swap the
    // article's contents while that promise is in flight to simulate a real
    // case where the parent re-applies innerHTML between the two phases.
    const highlightPromise = highlightMarkdownCodeBlocks(article);

    article.innerHTML = '<pre><code class="language-ts">const count: number = 1;</code></pre>';

    await highlightPromise;

    const codeElement = article.querySelector('pre > code')!;
    expect(codeElement.getAttribute('data-rutar-prism-highlighted')).toBe('true');
    const tokenKeyword = codeElement.querySelector('.token.keyword');
    expect(tokenKeyword).not.toBeNull();
    expect(tokenKeyword?.textContent).toBe('const');
  });
});
