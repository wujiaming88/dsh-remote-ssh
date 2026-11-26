// Original VS Code-inspired file glyphs. No VS Code theme asset is copied.
// The mapping is intentionally small and deterministic; unknown files stay a
// neutral document. Colors are inline data, not CSS selectors or remote input.
const TYPES = [
  { kind: 'lock', label: 'L', color: '#a38f00', test: /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.lock|go\.sum)$/i },
  { kind: 'markdown', label: 'M↓', color: '#519aba', test: /(\.(md|markdown|mdx)$|(^|\/)(readme|changelog|contributing)(\.[^/]*)?$)/i },
  { kind: 'json', label: '{}', color: '#a38f00', test: /\.(json|jsonc|json5)$/i },
  { kind: 'typescript', label: 'TS', color: '#3178c6', test: /\.(ts|mts|cts)$/i },
  { kind: 'tsx', label: 'TS', color: '#61dafb', test: /\.tsx$/i },
  { kind: 'javascript', label: 'JS', color: '#b8a400', test: /\.(js|mjs|cjs)$/i },
  { kind: 'jsx', label: 'JS', color: '#61dafb', test: /\.jsx$/i },
  { kind: 'python', label: 'Py', color: '#3572a5', test: /\.(py|pyi|pyw)$/i },
  { kind: 'java', label: 'J', color: '#b07219', test: /\.(java|class|jar)$/i },
  { kind: 'kotlin', label: 'K', color: '#a97bff', test: /\.(kt|kts)$/i },
  { kind: 'go', label: 'Go', color: '#00add8', test: /\.go$/i },
  { kind: 'rust', label: 'Rs', color: '#dea584', test: /\.rs$/i },
  { kind: 'c', label: 'C', color: '#599eff', test: /\.(c|h)$/i },
  { kind: 'cpp', label: 'C+', color: '#f34b7d', test: /\.(cc|cpp|cxx|hpp|hh|hxx)$/i },
  { kind: 'csharp', label: 'C#', color: '#178600', test: /\.cs$/i },
  { kind: 'ruby', label: 'Rb', color: '#701516', test: /\.(rb|rake|gemspec)$/i },
  { kind: 'php', label: 'P', color: '#4f5d95', test: /\.php$/i },
  { kind: 'swift', label: 'S', color: '#f05138', test: /\.swift$/i },
  { kind: 'shell', label: '>_', color: '#4e8a2e', test: /\.(sh|bash|zsh|fish|ksh)$|(^|\/)(\.bashrc|\.zshrc|\.profile|\.bash_profile|\.bash_login)$/i },
  { kind: 'powershell', label: 'PS', color: '#012456', test: /\.(ps1|psm1)$/i },
  { kind: 'yaml', label: 'Y', color: '#cb171e', test: /\.(ya?ml)$/i },
  { kind: 'ini', label: '⚙', color: '#8a8a8a', test: /\.(ini|cfg|conf|properties|editorconfig)$/i },
  { kind: 'toml', label: 'T', color: '#9c4221', test: /\.toml$/i },
  { kind: 'xml', label: '<>', color: '#e37933', test: /\.(xml|xsd|svg)$/i },
  { kind: 'html', label: '<>', color: '#e34c26', test: /\.(html?|xhtml)$/i },
  { kind: 'css', label: '#', color: '#563d7c', test: /\.(css|scss|sass|less)$/i },
  { kind: 'sql', label: 'DB', color: '#e38c00', test: /\.(sql|sqlite|db)$/i },
  { kind: 'docker', label: 'D', color: '#2496ed', test: /(^|\/)dockerfile$/i },
  { kind: 'make', label: 'Mk', color: '#427819', test: /(^|\/)makefile$/i },
  { kind: 'image', label: 'IMG', color: '#a074c4', test: /\.(png|jpe?g|gif|webp|avif|ico|bmp)$/i },
  { kind: 'pdf', label: 'PDF', color: '#ff3b30', test: /\.pdf$/i },
  { kind: 'archive', label: 'ZIP', color: '#a38f00', test: /\.(zip|tar|gz|tgz|bz2|xz|7z|rar)$/i },
  { kind: 'env', label: 'E', color: '#8a6d00', test: /(^|\/)\.env(\..*)?$/i },
  { kind: 'git', label: 'G', color: '#f14e32', test: /(^|\/)\.git(ignore|config|attributes|modules)?$/i },
  { kind: 'config', label: '⚙', color: '#8a8a8a', test: /(^|\/)(\.?npmrc|\.?prettierrc|\.?eslintrc|tsconfig\.json)$/i },
];

export const FILE_TYPE_PREVIEW = Object.freeze({
  markdown: 'markdown', json: 'json', image: 'image', pdf: 'binary', archive: 'binary',
});

export function fileType(name, { directory = false } = {}) {
  if (directory) return { kind: 'directory', label: '', color: null };
  const path = String(name || '').replace(/\\/g, '/').toLowerCase();
  for (const type of TYPES) if (type.test.test(path)) return { kind: type.kind, label: type.label, color: type.color };
  if (/\.(txt|log|rst|text|csv|tsv)$/i.test(path)) return { kind: 'text', label: 'TXT', color: '#8a8a8a' };
  if (/\.(woff2?|ttf|otf|eot)$/i.test(path)) return { kind: 'font', label: 'F', color: '#8a8a8a' };
  return { kind: 'file', label: '', color: '#8a8a8a' };
}

export function filePreviewKind(name) {
  return FILE_TYPE_PREVIEW[fileType(name).kind] || 'text';
}
