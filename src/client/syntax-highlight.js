import {fileType} from './file-type-model.js';

// Small, dependency-free syntax tokenizer for read-only file previews. It is
// intentionally not a language server or a complete grammar: strings, comments,
// numbers, common keywords and config keys are enough for a fast, safe preview.
const JS = ['break','case','catch','class','const','continue','default','delete','do','else','export','extends','finally','for','from','function','if','import','in','instanceof','let','new','of','return','static','super','switch','this','throw','try','typeof','var','void','while','with','yield','async','await','interface','type','enum','implements','readonly','public','private','protected','declare','namespace','abstract'];
const PY = ['and','as','assert','async','await','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield'];
const SHELL = ['case','do','done','elif','else','esac','fi','for','function','if','in','select','then','until','while','time','coproc','[[',']]'];
const SQL = ['select','from','where','insert','into','values','update','set','delete','create','alter','drop','table','index','view','join','left','right','inner','outer','on','group','by','order','having','limit','offset','union','all','distinct','case','when','then','else','end','and','or','not','null','is','as','with','recursive','primary','key','foreign','references','constraint','default','unique','check','exists','between','like','in'];
const DOCKER = ['from','run','cmd','label','maintainer','expose','env','add','copy','entrypoint','volume','user','workdir','arg','onbuild','stopsignal','healthcheck','shell'];
const MAKE = ['ifeq','ifneq','ifdef','ifndef','else','endif','include','define','endef','export','override'];
const COMMON = ['true','false','null','undefined','nan','infinity'];
const KEYWORDS = {
  javascript: [...JS, ...COMMON], typescript: [...JS, ...COMMON], java: [...JS, ...COMMON],
  c: ['auto','break','case','char','const','continue','default','do','double','else','enum','extern','float','for','goto','if','inline','int','long','register','return','short','signed','sizeof','static','struct','switch','typedef','union','unsigned','void','volatile','while','true','false','null'],
  cpp: ['auto','bool','break','case','catch','char','class','const','constexpr','continue','default','delete','do','double','else','enum','explicit','extern','false','float','for','friend','if','inline','int','long','namespace','new','nullptr','operator','private','protected','public','return','short','sizeof','static','struct','switch','template','this','throw','true','try','typedef','typename','union','using','virtual','void','volatile','while'],
  csharp: [...JS, 'using','namespace','struct','record','delegate','event','params','out','ref','base','object','string','int','bool','decimal','double','float','var'],
  go: ['break','case','chan','const','continue','default','defer','else','fallthrough','for','func','go','goto','if','import','interface','map','package','range','return','select','struct','switch','type','var','true','false','nil'],
  rust: ['as','async','await','break','const','continue','crate','dyn','else','enum','extern','false','fn','for','if','impl','in','let','loop','match','mod','move','mut','pub','ref','return','self','self','static','struct','super','trait','true','type','unsafe','use','where','while','union'],
  kotlin: ['as','break','class','continue','do','else','false','for','fun','if','in','interface','is','null','object','package','return','super','this','throw','true','try','typealias','typeof','val','var','when','while'],
  swift: ['associatedtype','class','deinit','enum','extension','fileprivate','func','import','init','inout','internal','let','open','operator','private','protocol','public','rethrows','static','struct','subscript','typealias','var','break','case','continue','default','defer','do','else','fallthrough','for','guard','if','in','repeat','return','switch','where','while','as','catch','false','is','nil','super','self','throw','throws','true','try'],
  php: ['abstract','and','array','as','break','callable','case','catch','class','clone','const','continue','declare','default','do','echo','else','elseif','empty','enddeclare','endfor','endforeach','endif','endswitch','endwhile','eval','exit','extends','final','finally','fn','for','foreach','function','global','goto','if','implements','include','include_once','instanceof','insteadof','interface','isset','list','match','namespace','new','or','print','private','protected','public','readonly','require','require_once','return','static','switch','throw','trait','try','unset','use','var','while','xor','yield','true','false','null'],
  ruby: ['alias','and','begin','break','case','class','def','defined?','do','else','elsif','end','ensure','false','for','if','in','module','next','nil','not','or','redo','rescue','retry','return','self','super','then','true','undef','unless','until','when','while','yield'],
  python: [...PY, ...COMMON], shell: [...SHELL, ...COMMON], powershell: ['begin','break','catch','class','continue','data','define','do','dynamicparam','else','elseif','end','exit','filter','finally','for','foreach','from','function','if','in','param','process','return','switch','throw','trap','try','until','using','var','while','true','false','null'],
  sql: [...SQL, ...COMMON], docker: [...DOCKER], make: [...MAKE],
};
const CONFIG_KINDS = new Set(['yaml', 'toml', 'ini', 'config', 'env', 'docker', 'make']);
const CASE_INSENSITIVE = new Set(['sql']);
const MARKUP = new Set(['xml', 'html']);

const BY_KIND = { markdown: 'markdown', json: 'json', typescript: 'typescript', tsx: 'typescript', javascript: 'javascript', jsx: 'javascript',
  python: 'python', java: 'java', kotlin: 'kotlin', go: 'go', rust: 'rust', c: 'c', cpp: 'cpp', csharp: 'csharp', ruby: 'ruby', php: 'php', swift: 'swift',
  shell: 'shell', powershell: 'powershell', yaml: 'yaml', toml: 'toml', xml: 'xml', html: 'html', css: 'css', sql: 'sql', docker: 'docker', make: 'make',
  env: 'ini', config: 'ini', git: 'ini', ini: 'ini', text: 'plain', file: 'plain' };

export const HIGHLIGHT_LIMIT = 300000;

export function languageForFile(name) {
  const base = String(name || '').replace(/\\/g, '/').toLowerCase();
  if (base.endsWith('dockerfile')) return 'docker';
  if (base.endsWith('makefile')) return 'make';
  return BY_KIND[fileType(name).kind] || 'plain';
}

function specFor(language) {
  if (language === 'json') return { block: [['/*', '*/']], line: ['//'], quotes: ['"'], keys: true, keywords: COMMON };
  if (language === 'yaml' || language === 'toml') return { line: ['#'], quotes: ['"', "'"], keys: true, keywords: COMMON };
  if (language === 'ini' || language === 'config' || language === 'env' || language === 'git') return { line: ['#', ';'], quotes: ['"', "'"], keys: true, keywords: COMMON };
  if (language === 'python') return { line: ['#'], quotes: ['"', "'"], keywords: KEYWORDS.python, triple: true };
  if (language === 'shell') return { line: ['#'], quotes: ['"', "'"], keywords: KEYWORDS.shell, variables: true };
  if (language === 'powershell') return { line: ['#'], quotes: ['"', "'"], keywords: KEYWORDS.powershell, variables: true };
  if (language === 'sql') return { line: ['--'], block: [['/*', '*/']], quotes: ["'", '"'], keywords: KEYWORDS.sql, caseInsensitive: true };
  if (language === 'css') return { block: [['/*', '*/']], quotes: ['"', "'"], keys: true, keywords: COMMON };
  if (language === 'xml' || language === 'html') return { markup: true };
  if (language === 'docker') return { line: ['#'], quotes: ['"', "'"], keywords: KEYWORDS.docker, caseInsensitive: true };
  if (language === 'make') return { line: ['#'], quotes: ['"', "'"], keywords: KEYWORDS.make };
  if (KEYWORDS[language]) return { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'", '`'], keywords: KEYWORDS[language], triple: language === 'javascript' || language === 'typescript' };
  return { quotes: ['"', "'"], keywords: COMMON };
}

function pushToken(tokens, type, text) { if (text) tokens.push({ type, text }); }

function scanMarkup(text) {
  const tokens = []; let i = 0;
  while (i < text.length) {
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4), stop = end < 0 ? text.length : end + 3;
      pushToken(tokens, 'comment', text.slice(i, stop)); i = stop; continue;
    }
    if (text[i] === '<') {
      const end = text.indexOf('>', i + 1);
      const close = end < 0 ? text.length : end;
      const body = text.slice(i + 1, close);
      pushToken(tokens, 'punctuation', '<');
      const tag = body.match(/^\/?\s*([A-Za-z][\w:.-]*)/);
      if (tag) {
        const prefix = body.slice(0, tag.index + tag[0].indexOf(tag[1]));
        pushToken(tokens, 'plain', prefix);
        pushToken(tokens, 'tag', tag[1]);
        let rest = body.slice(tag[0].length), cursor = 0;
        while (cursor < rest.length) {
          const value = rest.slice(cursor).match(/^\s*([A-Za-z_:][\w:.-]*)(\s*=\s*)?/);
          if (!value) { pushToken(tokens, 'plain', rest.slice(cursor)); break; }
          const leading = value[0].match(/^\s*/)[0];
          pushToken(tokens, 'plain', leading);
          pushToken(tokens, 'attr', value[1]);
          cursor += value[0].length;
          if (!value[2]) continue;
          pushToken(tokens, 'operator', value[2]);
          const quote = rest[cursor];
          if (quote === '"' || quote === "'") {
            const closeQuote = rest.indexOf(quote, cursor + 1);
            if (closeQuote >= 0) { pushToken(tokens, 'string', rest.slice(cursor, closeQuote + 1)); cursor = closeQuote + 1; }
          } else {
            const unquoted = rest.slice(cursor).match(/^[^\s>]+/);
            if (unquoted) { pushToken(tokens, 'string', unquoted[0]); cursor += unquoted[0].length; }
          }
        }
      } else pushToken(tokens, 'plain', body);
      if (end >= 0) pushToken(tokens, 'punctuation', '>'); i = end < 0 ? text.length : end + 1; continue;
    }
    let end = text.indexOf('<', i + 1); if (end < 0) end = text.length;
    pushToken(tokens, 'plain', text.slice(i, end)); i = end;
  }
  return tokens;
}

export function tokenize(text, language = 'plain') {
  const source = String(text ?? '');
  if (!source) return [];
  const spec = specFor(language);
  if (spec.markup) return scanMarkup(source);
  const tokens = []; let i = 0;
  while (i < source.length) {
    let matched = false;
    for (const [start, end] of spec.block || []) {
      if (!source.startsWith(start, i)) continue;
      const close = source.indexOf(end, i + start.length);
      const stop = close < 0 ? source.length : close + end.length;
      pushToken(tokens, 'comment', source.slice(i, stop)); i = stop; matched = true; break;
    }
    if (matched) continue;
    for (const prefix of spec.line || []) {
      if (!source.startsWith(prefix, i)) continue;
      const end = source.indexOf('\n', i); const stop = end < 0 ? source.length : end;
      pushToken(tokens, 'comment', source.slice(i, stop)); i = stop; matched = true; break;
    }
    if (matched) continue;
    const quote = source[i];
    if (spec.quotes?.includes(quote)) {
      const triple = spec.triple && source.startsWith(quote.repeat(3), i);
      const marker = triple ? quote.repeat(3) : quote;
      let cursor = i + marker.length;
      while (cursor < source.length) {
        if (source[cursor] === '\\' && !triple) { cursor += 2; continue; }
        if (source.startsWith(marker, cursor)) { cursor += marker.length; break; }
        if (!triple && source[cursor] === '\n') break;
        cursor++;
      }
      const raw = source.slice(i, cursor);
      let type = 'string';
      if (spec.keys && language === 'json') {
        const rest = source.slice(cursor), next = rest.match(/^\s*:/);
        if (next) type = 'key';
      }
      pushToken(tokens, type, raw); i = cursor; continue;
    }
    if (spec.variables && source[i] === '$') {
      const variable = source.slice(i).match(/^\$[A-Za-z_][\w]*|^\$\{[^}]*\}|^\$[0-9@*#?$!-]/);
      if (variable) { pushToken(tokens, 'variable', variable[0]); i += variable[0].length; continue; }
    }
    const number = source.slice(i).match(/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (number) { pushToken(tokens, 'number', number[0]); i += number[0].length; continue; }
    const word = source.slice(i).match(/^[A-Za-z_$][\w$-]*/);
    if (word) {
      const value = word[0], lower = value.toLowerCase();
      const keys = spec.caseInsensitive ? (spec.keywords || []).map(item => item.toLowerCase()) : (spec.keywords || []);
      const lookahead = source.slice(i + value.length).match(/^\s*([:=])/);
      let type = keys.includes(lower) ? 'keyword' : 'plain';
      if (spec.keys && lookahead) type = 'key';
      if (['true', 'false', 'null', 'nil', 'undefined', 'none'].includes(lower)) type = 'literal';
      pushToken(tokens, type, value); i += value.length; continue;
    }
    const punctuation = source[i].match(/[()[\]{}<>.,;:+\-*/%=!&|^~?@#]/);
    pushToken(tokens, punctuation ? 'punctuation' : 'plain', source[i]); i++;
  }
  return tokens;
}

export function highlightLines(text, language) {
  const source = String(text ?? '');
  if (source.length > HIGHLIGHT_LIMIT) return source.split('\n').map(line => ({ tokens: [{ type: 'plain', text: line }] }));
  const tokens = tokenize(source, language);
  if (tokens.length > 60000) return source.split('\n').map(line => ({ tokens: [{ type: 'plain', text: line }] }));
  const lines = [[]];
  for (const token of tokens) {
    const parts = token.text.split('\n');
    parts.forEach((part, index) => {
      if (index) lines.push([]);
      if (part) lines[lines.length - 1].push({ type: token.type, text: part });
    });
  }
  return lines.map(tokens => ({tokens}));
}
