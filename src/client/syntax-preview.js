import React from 'react';
import {highlightLines, languageForFile} from './syntax-highlight.js';

/** Read-only syntax preview with line numbers. Only React text nodes are used. */
export function SyntaxPreview({text, language, label}) {
  const resolved = language || languageForFile(label);
  const lines = React.useMemo(() => highlightLines(text, resolved), [text, resolved]);
  return React.createElement('div', {className: 'rssh-files-code-preview', 'data-language': resolved,
    tabIndex: 0, role: 'region', 'aria-label': label},
    lines.map((line, index) => React.createElement('div', {key: index, className: 'rssh-files-code-line'},
      React.createElement('span', {className: 'rssh-files-code-number', 'aria-hidden': true}, index + 1),
      React.createElement('code', {className: 'rssh-files-code-content'},
        line.tokens.length ? line.tokens.map((token, tokenIndex) =>
          React.createElement('span', {key: tokenIndex, className: 'rssh-syntax-' + token.type}, token.text)) : '\u200b'))));
}
