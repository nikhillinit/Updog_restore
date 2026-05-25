import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { glob } from 'glob';

const CODE_IDENTIFIER = '[A-Za-z_$][\\w$]*';
const QUOTED_CODE_PROPERTY_LINK_TEXT = new RegExp(`^'${CODE_IDENTIFIER}'$`);
const CODE_EXPRESSION_LINK_TARGET = new RegExp(
  `^(?:'|\\{|\\d+$|${CODE_IDENTIFIER}(?:\\.${CODE_IDENTIFIER})?(?:\\(|$))`,
);
const TEMPLATE_PLACEHOLDER_LINK = /^\{\{[A-Za-z_][A-Za-z0-9_-]*\}\}$/;
const MARKDOWN_LINK = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
const DEFAULT_DOC_IGNORE = [
  'docs/archive/**',
  'docs/**/archive/**',
  'docs/_generated/**',
  'docs/skills/REFL-*.md',
];

export const ROOT_GOVERNANCE_DOCS = [
  'AGENTS.md',
  'CAPABILITIES.md',
  'DECISIONS.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'README.md',
];

export function isTemplatePlaceholderLink(linkUrl) {
  return TEMPLATE_PLACEHOLDER_LINK.test(linkUrl);
}

export function isCodeLikeParserFalsePositive(linkText, linkUrl) {
  if (
    QUOTED_CODE_PROPERTY_LINK_TEXT.test(linkText) &&
    CODE_EXPRESSION_LINK_TARGET.test(linkUrl)
  ) {
    return true;
  }

  return linkText === 'endpoint.method' && linkUrl === 'endpoint.url';
}

export function getLineNumber(content, index) {
  let line = 1;

  for (let offset = 0; offset < index; offset += 1) {
    if (content[offset] === '\n') {
      line += 1;
    }
  }

  return line;
}

function isSingleBacktickDelimiter(content, index) {
  return (
    content[index] === '`' &&
    content[index - 1] !== '`' &&
    content[index + 1] !== '`'
  );
}

function findClosingBacktick(content, startIndex) {
  for (let i = startIndex; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '\n' || ch === '\r') return -1;
    if (isSingleBacktickDelimiter(content, i)) return i;
  }
  return -1;
}

export function stripInlineCodeSpans(content) {
  const sanitized = content.split('');

  for (let i = 0; i < content.length; i += 1) {
    if (!isSingleBacktickDelimiter(content, i)) continue;

    const close = findClosingBacktick(content, i + 1);
    if (close === -1) continue;

    for (let j = i; j <= close; j += 1) sanitized[j] = ' ';
    i = close;
  }

  return sanitized.join('');
}

export function extractMarkdownLinks(content) {
  const links = [];
  let match;
  const scanContent = stripInlineCodeSpans(content);

  MARKDOWN_LINK.lastIndex = 0;

  while ((match = MARKDOWN_LINK.exec(scanContent)) !== null) {
    links.push({
      text: match[1],
      link: match[2].trim(),
      index: match.index,
      line: getLineNumber(scanContent, match.index),
    });
  }

  return links;
}

export function shouldSkipLink(linkText, linkUrl) {
  if (isTemplatePlaceholderLink(linkUrl)) {
    return true;
  }

  if (isCodeLikeParserFalsePositive(linkText, linkUrl)) {
    return true;
  }

  if (
    linkUrl.startsWith('http://') ||
    linkUrl.startsWith('https://') ||
    linkUrl.startsWith('mailto:') ||
    linkUrl.startsWith('tel:')
  ) {
    return true;
  }

  return linkUrl.startsWith('#');
}

/**
 * Resolves a markdown link URL to an absolute filesystem path.
 * Absolute paths (leading `/`) resolve against `rootDir`; relative paths against `fileDir`.
 * @param {{linkUrl: string, fileDir: string, rootDir: string}} params
 * @returns {string | null}
 */
export function resolveLinkTarget({ linkUrl, fileDir, rootDir }) {
  const [pathPart] = linkUrl.split(/[#?]/);
  if (!pathPart) {
    return null;
  }
  return pathPart.startsWith('/') ? join(rootDir, pathPart) : resolve(fileDir, pathPart);
}

export function checkMarkdownLinksInContent({
  content,
  file,
  fileDir,
  rootDir,
  exists = existsSync,
}) {
  const errors = [];
  const links = extractMarkdownLinks(content);

  for (const markdownLink of links) {
    const linkText = markdownLink.text;
    const linkUrl = markdownLink.link;

    if (shouldSkipLink(linkText, linkUrl)) {
      continue;
    }

    const targetPath = resolveLinkTarget({ linkUrl, fileDir, rootDir });
    if (!targetPath) {
      continue;
    }

    if (!exists(targetPath)) {
      errors.push({
        file,
        line: markdownLink.line,
        link: linkUrl,
        text: linkText,
        target: targetPath,
      });
    }
  }

  return {
    totalLinks: links.length,
    brokenLinks: errors.length,
    errors,
  };
}

export function checkMarkdownFiles({
  files,
  rootDir,
  readFile = (filePath) => readFileSync(filePath, 'utf-8'),
  exists = existsSync,
}) {
  let totalLinks = 0;
  const errors = [];

  for (const file of files) {
    const filePath = join(rootDir, file);
    const content = readFile(filePath);
    const result = checkMarkdownLinksInContent({
      content,
      file,
      fileDir: dirname(filePath),
      rootDir,
      exists,
    });

    totalLinks += result.totalLinks;
    errors.push(...result.errors);
  }

  return {
    totalLinks,
    brokenLinks: errors.length,
    errors,
  };
}

export function collectMarkdownFiles({
  rootDir,
  analysisOnly = false,
  exists = existsSync,
  globSync = glob.sync,
}) {
  if (analysisOnly) {
    return globSync('docs/analysis/**/*.md', { cwd: rootDir });
  }

  return [
    ...globSync('docs/**/*.md', {
      cwd: rootDir,
      ignore: DEFAULT_DOC_IGNORE,
    }),
    ...globSync('.github/*.md', { cwd: rootDir }),
    ...ROOT_GOVERNANCE_DOCS.filter((file) => exists(join(rootDir, file))),
  ];
}

export function formatBrokenLinkError(error) {
  return [
    `  File: ${error.file}:${error.line}`,
    `  Link: [${error.text}](${error.link})`,
    `  Target not found: ${error.target}`,
  ].join('\n');
}
