import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

import {
  checkMarkdownLinksInContent,
  isCodeLikeParserFalsePositive,
  isTemplatePlaceholderLink,
  stripInlineCodeSpans,
} from '../../../scripts/lib/doc-link-checker.mjs';

const rootDir = resolve('/repo');
const fileDir = resolve(rootDir, 'docs');

function checkContent(content, existingTargets = []) {
  const existing = new Set(existingTargets.map((target) => resolve(rootDir, target)));

  return checkMarkdownLinksInContent({
    content,
    file: 'docs/example.md',
    fileDir,
    rootDir,
    exists: (targetPath) => existing.has(targetPath),
  });
}

describe('doc-link-checker false-positive handling', () => {
  it('ignores template placeholder links', () => {
    const result = checkContent(
      [
        '[template]({{link}})',
        '[URL]({{url}})',
        '[figma]({{figma_link}})',
        '[valid](target.md)',
      ].join('\n'),
      ['docs/target.md'],
    );

    expect(isTemplatePlaceholderLink('{{link}}')).toBe(true);
    expect(result.totalLinks).toBe(4);
    expect(result.errors).toEqual([]);
  });

  it('ignores code-expression parser false positives', () => {
    const result = checkContent(
      [
        "['method'](endpoint.method)",
        "['handler'](endpoint.handler())",
        '[endpoint.method](endpoint.url)',
        '[valid](target.md)',
      ].join('\n'),
      ['docs/target.md'],
    );

    expect(isCodeLikeParserFalsePositive('endpoint.method', 'endpoint.url')).toBe(true);
    expect(result.totalLinks).toBe(4);
    expect(result.errors).toEqual([]);
  });

  it('ignores link-shaped patterns inside single-backtick inline code spans', () => {
    const content = [
      "Use Grep tool: pattern `from ['\"](\\.\\./)+src/|from ['\"]src/`, output_mode",
      'Inline code example: `[label](target.md)`',
    ].join('\n');
    const result = checkContent(content);

    expect(stripInlineCodeSpans(content)).not.toContain('[label](target.md)');
    expect(result.totalLinks).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe('doc-link-checker broken-link detection', () => {
  it('reports broken local links with line numbers', () => {
    const result = checkContent(
      ['Intro paragraph.', '', 'See [missing](missing.md) for details.'].join('\n'),
    );

    expect(result.totalLinks).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      file: 'docs/example.md',
      line: 3,
      link: 'missing.md',
      text: 'missing',
    });
  });
});
