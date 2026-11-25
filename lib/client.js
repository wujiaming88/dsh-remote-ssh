// Generated from src/client/index.js by node build-client.mjs.
window.__ModuleLoader__.load({
  id: "@wujiaming88/dsh-remote-ssh",
  factory: function(require) {
    var module = {exports: {}};
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/shared.js
var import_react = __toESM(require("react"), 1);

// src/client/ui-pure.js
function fileParentTarget(directory, previewPath) {
  if (previewPath) return directory;
  if (!directory || directory === ".") return null;
  const parts = directory.split("/").filter(Boolean);
  parts.pop();
  return directory.startsWith("/") ? "/" + parts.join("/") : parts.join("/") || ".";
}
function text(value) {
  return value == null ? "" : String(value);
}
function menuPosition(anchor, panel, viewport, align) {
  var margin = 8, gap = 4;
  var width = Math.min(panel.width, Math.max(0, viewport.width - margin * 2));
  var height = Math.min(panel.height, Math.max(0, viewport.height - margin * 2));
  var left = align === "end" ? anchor.right - width : anchor.left;
  var top = anchor.bottom + gap;
  if (top + height > viewport.height - margin && anchor.top - gap - height >= margin) top = anchor.top - gap - height;
  return { left: Math.max(margin, Math.min(left, viewport.width - width - margin)), top: Math.max(margin, Math.min(top, viewport.height - height - margin)) };
}
function safeHref(value) {
  var href = text(value).trim();
  if (!href || /[\u0000-\u0020\u007f\\]/.test(href)) return null;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^[^/?#]*:/.test(href) || href.indexOf("//") === 0) return null;
  return href;
}
function splitLines(value) {
  var s = text(value).replace(/\r\n?/g, "\n");
  return s ? s.split("\n") : [];
}
function stripTerminal(value) {
  return text(value).replace(/(?:\x1b\]|\u009d)[\s\S]*?(?:\x07|\x1b\\|\u009c|$)/g, "").replace(/(?:\x1b[P^_]|[\u0090\u009e\u009f])[\s\S]*?(?:\x1b\\|\u009c|$)/g, "").replace(/(?:\x1b\[|\u009b)[0-?]*[ -/]*[@-~]/g, "").replace(/\x1b[@-_]/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "");
}
function httpLinkAt(source, index, delimited) {
  if (!/^https?:\/\//i.test(source.slice(index, index + 8))) return null;
  if (!delimited && index && /[a-z0-9_@/\\#=%+.-]/i.test(source[index - 1])) return null;
  var match = /^https?:\/\/[^\s<>"'`\\\u0000-\u001f\u007f\u0080-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f，。！？；：、（）【】《》“”‘’]+/i.exec(source.slice(index));
  if (!match) return null;
  var raw = match[0], href = raw;
  if (/[\\\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/.test(source[index + raw.length] || "")) return { literal: raw, length: raw.length };
  if (raw.length > 16384) return { literal: raw, length: raw.length };
  if (!delimited) {
    var pairs = { ")": "(", "]": "[", "}": "{" }, counts = {};
    for (var char of href) counts[char] = (counts[char] || 0) + 1;
    while (href) {
      var last = href.slice(-1);
      if (/[.,!?;:]/.test(last) || pairs[last] && counts[last] > (counts[pairs[last]] || 0)) {
        counts[last]--;
        href = href.slice(0, -1);
      } else break;
    }
  }
  if (!/^https?:\/\/[^/?#]/i.test(href) || !safeHref(href)) return { literal: raw, length: raw.length };
  try {
    var parsed = new URL(href);
    if (!parsed.hostname || !/^https?:$/.test(parsed.protocol)) return { literal: raw, length: raw.length };
  } catch {
    return { literal: raw, length: raw.length };
  }
  return { href, length: href.length };
}
function codeSpanAt(source, index, budget) {
  if (source[index] !== "`") return null;
  var start = index;
  while (source[index] === "`") index++;
  var width = index - start, content = index, work = width;
  while (index < source.length) {
    var next = source.indexOf("`", index);
    if (next < 0) next = source.length;
    work += next - index;
    if (work > budget) return { literal: source.slice(start), length: source.length - start, work };
    if (next === source.length) return { work };
    var end = next;
    while (source[end] === "`") end++;
    work += end - next;
    if (end - next === width) return { text: source.slice(content, next).replace(/\n/g, " "), length: end - start, work };
    index = end;
  }
  return { work };
}
function inlineTokens(value, depth, allowLinks) {
  var source = text(value), out = [], plain = "", index = 0, work = 0;
  depth = depth || 0;
  if (depth > 12) return [{ type: "text", text: source }];
  function flush() {
    if (plain) {
      out.push({ type: "text", text: plain });
      plain = "";
    }
  }
  while (index < source.length) {
    var rest = source.slice(index, index + 4096), match;
    if (work > 65536) {
      plain += source.slice(index);
      break;
    }
    if (source[index] === "\\" && /[\\`*_{}\[\]()#+.!~>|-]/.test(source[index + 1] || "")) {
      plain += source[index + 1];
      index += 2;
      continue;
    }
    var code = codeSpanAt(source, index, 65536 - work);
    if (code) {
      work += code.work;
      if (code.literal != null) {
        plain += code.literal;
        index += code.length;
        continue;
      }
      if (code.text != null) {
        flush();
        out.push({ type: "code", text: code.text });
        index += code.length;
        continue;
      }
    }
    if (allowLinks !== false && (match = /^(!?)\[([^\]\n]*)\]\(\s*(?:<([^>\n]*)>|([^\s)]*(?:\([^)]*\)[^\s)]*)?))(?:\s+["']([^\n]*?)["'])?\s*\)/.exec(rest))) {
      var href = safeHref(match[3] || match[4]);
      if (href) {
        flush();
        out.push({ type: "link", href, title: match[5], children: inlineTokens(match[2] || href, depth + 1, false), image: !!match[1] });
        index += match[0].length;
        continue;
      }
    }
    if (allowLinks !== false) {
      var angle = source[index] === "<", link = httpLinkAt(source, index + (angle ? 1 : 0), angle);
      if (link && (!angle || source[index + 1 + link.length] === ">")) {
        if (link.href) {
          flush();
          out.push({ type: "link", href: link.href, children: [{ type: "text", text: link.href }] });
        } else plain += (angle ? "<" : "") + link.literal + (angle ? ">" : "");
        index += link.length + (angle ? 2 : 0);
        continue;
      }
    }
    if (match = /^(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/.exec(rest)) {
      flush();
      out.push({ type: match[1] === "~~" ? "del" : "strong", children: inlineTokens(match[2], depth + 1, allowLinks) });
      index += match[0].length;
      continue;
    }
    if ((match = /^(\*|_)(?=\S)([^\n]*?\S)\1/.exec(rest)) && (index === 0 || !/[\p{L}\p{N}]/u.test(source[index - 1]))) {
      flush();
      out.push({ type: "em", children: inlineTokens(match[2], depth + 1, allowLinks) });
      index += match[0].length;
      continue;
    }
    if (/[`\[!*_~]/.test(source[index])) work += rest.length;
    plain += source[index++];
  }
  flush();
  return out;
}
function tableCells(line) {
  var s = text(line).trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, ""), cells = [], cell = "", code = 0;
  for (var i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (s[i] === "`") {
      var end = i + 1;
      while (s[end] === "`") end++;
      var count = end - i;
      if (!code) code = count;
      else if (code === count) code = 0;
      cell += s.slice(i, end);
      i = end - 1;
    } else if (s[i] === "|" && !code) {
      cells.push(cell.trim());
      cell = "";
    } else cell += s[i];
  }
  cells.push(cell.trim());
  return cells;
}
function tableDivider(line) {
  if (text(line).indexOf("|") === -1) return null;
  var cells = tableCells(line);
  return cells.length && cells.every(function(cell) {
    return /^:?-{3,}:?$/.test(cell);
  }) ? cells.map(function(cell) {
    return cell[0] === ":" && cell.slice(-1) === ":" ? "center" : cell.slice(-1) === ":" ? "right" : "left";
  }) : null;
}
function parseMarkdown(value, depth) {
  var lines = splitLines(value), blocks = [], i = 0;
  depth = depth || 0;
  if (depth > 12) return [{ type: "paragraph", text: text(value) }];
  function isStart(n) {
    return /^\s*$/.test(lines[n]) || /^ {0,3}(?:#{1,6}\s|`{3,}|~{3,}|>|(?:[-+*]|\d+[.)])\s)/.test(lines[n]) || /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(lines[n]) || n + 1 < lines.length && tableDivider(lines[n + 1]);
  }
  while (i < lines.length) {
    var line = lines[i], match, start, gathered;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)) {
      var marker = match[1], language = match[2].trim().split(/\s/)[0];
      gathered = [];
      i++;
      var end = new RegExp("^ {0,3}" + marker[0] + "{" + marker.length + ",}\\s*$");
      while (i < lines.length && !end.test(lines[i])) gathered.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push({ type: "code", text: gathered.join("\n"), language });
      continue;
    }
    if (match = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line)) {
      blocks.push({ type: "heading", level: match[1].length, text: match[2] });
      i++;
      continue;
    }
    if (/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    if (/^ {0,3}>/.test(line)) {
      gathered = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) gathered.push(lines[i++].replace(/^ {0,3}> ?/, ""));
      blocks.push({ type: "quote", children: parseMarkdown(gathered.join("\n"), depth + 1) });
      continue;
    }
    var align = i + 1 < lines.length ? tableDivider(lines[i + 1]) : null;
    if (align && line.indexOf("|") !== -1 && tableCells(line).length === align.length) {
      var headers = tableCells(line), rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].indexOf("|") !== -1) rows.push(tableCells(lines[i++]));
      blocks.push({ type: "table", headers, align, rows });
      continue;
    }
    if (match = /^( {0,3})([-+*]|\d+[.)])\s+(.*)$/.exec(line)) {
      var ordered = /^\d/.test(match[2]), indent = match[1].length, items = [], loose = false;
      start = ordered ? parseInt(match[2], 10) : 1;
      while (i < lines.length) {
        var item = /^( *)([-+*]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!item || item[1].length !== indent || /^\d/.test(item[2]) !== ordered) break;
        var continuationIndent = item[1].length + item[2].length + 1;
        gathered = [item[3]];
        i++;
        while (i < lines.length) {
          if (!lines[i].trim()) {
            var next = i + 1;
            while (next < lines.length && !lines[next].trim()) next++;
            var nextItem = next < lines.length && /^( *)([-+*]|\d+[.)])\s+/.exec(lines[next]);
            if (nextItem && nextItem[1].length === indent && /^\d/.test(nextItem[2]) === ordered) {
              loose = true;
              i = next;
              break;
            }
            if (next < lines.length && /^\s+\S/.test(lines[next]) && lines[next].search(/\S/) > indent) {
              loose = true;
              gathered.push("");
              i = next;
              continue;
            }
            break;
          }
          var spaces = lines[i].search(/\S/);
          if (spaces <= indent) break;
          gathered.push(lines[i++].slice(Math.min(spaces, continuationIndent)));
        }
        var task = /^\[([ xX])\]\s+(.*)$/.exec(gathered[0]);
        if (task) gathered[0] = task[2];
        items.push({ checked: task ? task[1] !== " " : null, children: parseMarkdown(gathered.join("\n"), depth + 1) });
      }
      blocks.push({ type: "list", ordered, start, loose, items });
      continue;
    }
    gathered = [line];
    i++;
    while (i < lines.length && !isStart(i)) gathered.push(lines[i++]);
    blocks.push({ type: "paragraph", text: gathered.join("\n") });
  }
  return blocks;
}
function diffLines(oldText, newText) {
  var before = splitLines(oldText), after = splitLines(newText), prefix = 0, suffix = 0, out = [];
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  var i;
  for (i = 0; i < prefix; i++) out.push({ kind: "context", text: before[i], oldNumber: i + 1, number: i + 1 });
  var oldEnd = before.length - suffix, newEnd = after.length - suffix;
  var oldLength = oldEnd - prefix, newLength = newEnd - prefix;
  if (oldLength && newLength && (oldLength + 1) * (newLength + 1) <= 262144) {
    var width = newLength + 1, matrix = new Uint32Array((oldLength + 1) * width), a, b;
    for (a = oldLength - 1; a >= 0; a--) {
      for (b = newLength - 1; b >= 0; b--) {
        matrix[a * width + b] = before[prefix + a] === after[prefix + b] ? 1 + matrix[(a + 1) * width + b + 1] : Math.max(matrix[(a + 1) * width + b], matrix[a * width + b + 1]);
      }
    }
    a = 0;
    b = 0;
    while (a < oldLength || b < newLength) {
      if (a < oldLength && b < newLength && before[prefix + a] === after[prefix + b]) {
        out.push({ kind: "context", text: before[prefix + a], oldNumber: prefix + a + 1, number: prefix + b + 1 });
        a++;
        b++;
      } else if (a < oldLength && (b === newLength || matrix[(a + 1) * width + b] >= matrix[a * width + b + 1])) {
        out.push({ kind: "remove", text: before[prefix + a], oldNumber: prefix + a + 1, number: null });
        a++;
      } else {
        out.push({ kind: "add", text: after[prefix + b], oldNumber: null, number: prefix + b + 1 });
        b++;
      }
    }
  } else {
    for (i = prefix; i < oldEnd; i++) out.push({ kind: "remove", text: before[i], oldNumber: i + 1, number: null });
    for (i = prefix; i < newEnd; i++) out.push({ kind: "add", text: after[i], oldNumber: null, number: i + 1 });
  }
  for (i = 0; i < suffix; i++) out.push({ kind: "context", text: after[after.length - suffix + i], oldNumber: before.length - suffix + i + 1, number: after.length - suffix + i + 1 });
  return out;
}
function limitLines(value) {
  var n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.floor(n)) : 20;
}

// src/client/ui.js
function createUi(React19) {
  "use strict";
  var h5 = React19.createElement;
  var Fragment = React19.Fragment;
  var exports = {};
  function classes(base, extra) {
    return base + (extra ? " " + extra : "");
  }
  function omit(props, keys) {
    var result = {};
    Object.keys(props || {}).forEach(function(key2) {
      if (keys.indexOf(key2) === -1) result[key2] = props[key2];
    });
    return result;
  }
  function label2(labels, key2, fallback, value) {
    var result = labels && labels[key2];
    return typeof result === "function" ? result(value) : result == null ? fallback : result;
  }
  function restoreFocus(node) {
    if (node && node.isConnected && typeof node.focus === "function") node.focus({ preventScroll: true });
  }
  function Button(props) {
    var nativeProps = omit(props, ["children", "variant", "size", "loading", "icon", "iconOnly", "block"]);
    nativeProps.className = classes("rsui-button", props.className);
    nativeProps.type = props.type || "button";
    nativeProps.disabled = !!(props.disabled || props.loading);
    nativeProps["data-variant"] = props.variant || "outline";
    nativeProps["data-size"] = props.size || "md";
    if (props.loading) nativeProps["aria-busy"] = true;
    if (props.block) nativeProps.style = Object.assign({ width: "100%" }, props.style);
    return h5(Fragment, null, h5("button", nativeProps, props.loading ? h5(StateDot, { state: "ongoing" }) : props.icon, props.children));
  }
  function Input(props) {
    var nativeProps = omit(props, ["size", "error", "prefix", "suffix"]);
    nativeProps.className = classes("rsui-input", props.className);
    nativeProps.type = props.type || "text";
    if (props.error) nativeProps["aria-invalid"] = true;
    if (typeof props.size === "number") nativeProps.size = props.size;
    return h5(Fragment, null, h5("input", nativeProps));
  }
  function Checkbox(props) {
    var inputProps = omit(props, ["label", "children", "className", "style", "onChange"]);
    inputProps.type = "checkbox";
    inputProps.className = "rsui-check-input";
    inputProps.onChange = function(event) {
      if (props.onChange) props.onChange(event.target.checked);
    };
    return h5(
      "label",
      { className: classes("rsui-check", props.className), style: props.style },
      h5("input", inputProps),
      props.label == null ? props.children : h5("span", null, props.label)
    );
  }
  function Tag(props) {
    return h5(Fragment, null, h5("span", Object.assign({}, omit(props, ["tone"]), { className: classes("rsui-tag", props.className), "data-tone": props.tone || "neutral" }), props.children));
  }
  function StateDot(props) {
    return h5(Fragment, null, h5("span", { className: classes("rsui-dot", props.className), style: props.style, "data-state": props.state || "idle", "aria-hidden": props.label ? void 0 : true, role: props.label ? "img" : void 0, "aria-label": props.label, title: props.title }));
  }
  var paths = {
    send: ["M3 4 21 12 3 20 6 12 3 4Z", "M6 12h10"],
    gauge: ["M4 18a9 9 0 1 1 16 0", "M12 13l5-6", "M5 13h1M7 7l1 1M12 4v1M18 13h1", "M10.5 16h3"],
    chevron: ["m6 9 6 6 6-6"],
    folder: ["M3 7V5h6l2 2h9v4", "M3 8v12h16l3-9H7l-4 9"],
    sidebar: ["M3 4h18v16H3V4Z", "M9 4v16M5.5 8h1M5.5 12h1"],
    file: ["M5 3h9l5 5v13H5V3Z", "M14 3v6h5"],
    code: ["m9 11-3 3 3 3m6-6 3 3-3 3m-2-7-2 10"],
    image: ["M4 4h16v16H4V4Z", "m4 17 4-5 4 4 3-3 5 5", "M8 8h.01"],
    close: ["m6 6 12 12M18 6 6 18"],
    copy: ["M9 8h11v13H9V8Z", "M15 5V3H4v13h2"],
    check: ["m5 12 4 4L19 6"]
  };
  function Icon(props) {
    var name = props.name || "file";
    var nativeProps = omit(props, ["name", "size", "path", "children"]);
    nativeProps.width = props.size || 16;
    nativeProps.height = props.size || 16;
    nativeProps.viewBox = "0 0 24 24";
    nativeProps.fill = "none";
    nativeProps.stroke = "currentColor";
    nativeProps.strokeWidth = 1.6;
    nativeProps.strokeLinecap = "round";
    nativeProps.strokeLinejoin = "round";
    nativeProps.focusable = false;
    nativeProps["aria-hidden"] = nativeProps["aria-label"] ? void 0 : true;
    if (nativeProps["aria-label"]) nativeProps.role = "img";
    nativeProps.style = Object.assign({ flex: "none", verticalAlign: "middle" }, props.style);
    return h5("svg", nativeProps, (paths[name] || paths.file).map(function(d, i) {
      return h5("path", { key: i, d });
    }));
  }
  function icon(name) {
    return function(props) {
      return h5(Icon, Object.assign({}, props, { name }));
    };
  }
  function FileTypeIcon(props) {
    var path = text(props.path).toLowerCase();
    var name = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/.test(path) ? "image" : /\.(js|jsx|ts|tsx|py|sh|json|css|html|rs|go|java|c|cpp|h|yaml|yml)$/.test(path) ? "code" : "file";
    return h5(Icon, Object.assign({}, props, { name }));
  }
  function Modal(props) {
    var dialogRef = React19.useRef(null);
    var closeRef = React19.useRef(props.onClose);
    closeRef.current = props.onClose;
    var uid = React19.useId();
    React19.useLayoutEffect(function() {
      var dialog = dialogRef.current;
      if (!props.open || !dialog) return;
      var previous = dialog.ownerDocument.activeElement;
      dialog.showModal();
      var preferred = dialog.querySelector('[data-modal-autofocus="true"]:not(:disabled),[autofocus]:not(:disabled)');
      if (preferred) preferred.focus();
      return function() {
        if (dialog.open) dialog.close();
        restoreFocus(previous);
      };
    }, [!!props.open]);
    if (!props.open) return null;
    return h5(Fragment, null, h5(
      "dialog",
      {
        ref: dialogRef,
        className: classes("rsui-modal", props.className),
        style: props.style,
        "aria-labelledby": props.title ? uid + "-title" : void 0,
        "aria-label": props["aria-label"] || (!props.title ? props.closeLabel : void 0),
        "aria-describedby": props.description ? uid + "-description" : void 0,
        onCancel: function(event) {
          event.preventDefault();
          if (closeRef.current) closeRef.current();
        },
        onClick: function(event) {
          if (event.target !== dialogRef.current || props.closeOnBackdrop === false) return;
          var rect = dialogRef.current.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            if (closeRef.current) closeRef.current();
          }
        }
      },
      h5(
        "div",
        { className: "rsui-modal-head" },
        h5("h2", { className: "rsui-modal-title", id: uid + "-title" }, props.title),
        h5(Button, { variant: "ghost", size: "sm", "aria-label": props.closeLabel || "Close", title: props.closeLabel || "Close", onClick: function() {
          if (closeRef.current) closeRef.current();
        } }, h5(Icon, { name: "close" }))
      ),
      props.description ? h5("p", { className: "rsui-modal-description", id: uid + "-description" }, props.description) : null,
      props.children != null ? h5("div", { className: "rsui-modal-body" }, props.children) : null,
      props.footer != null ? h5("div", { className: "rsui-modal-footer" }, props.footer) : null
    ));
  }
  function Menu(props) {
    var anchorRef = React19.useRef(null), panelRef = React19.useRef(null), focusedAnchor = React19.useRef(null);
    var current = React19.useRef(props);
    current.current = props;
    var suppressToggle = React19.useRef(false);
    var uid = React19.useId();
    var search = React19.useRef({ text: "", time: 0 });
    function close(restore) {
      if (current.current.onClose) current.current.onClose();
      if (restore) restoreFocus(focusedAnchor.current || anchorRef.current);
    }
    function candidates() {
      return panelRef.current ? Array.from(panelRef.current.querySelectorAll('[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled),[role="menuitemcheckbox"]:not(:disabled),button:not(:disabled),a[href]')).filter(function(node) {
        return !node.hidden && node.getAttribute("aria-disabled") !== "true";
      }) : [];
    }
    React19.useLayoutEffect(function() {
      var panel = panelRef.current, anchor = anchorRef.current;
      if (!props.open || !panel || !anchor) return;
      var win = panel.ownerDocument.defaultView;
      suppressToggle.current = false;
      function onToggle(event) {
        if (event.newState === "closed" && !suppressToggle.current) close(false);
      }
      function position() {
        var rect = anchor.getBoundingClientRect();
        var size = panel.getBoundingClientRect();
        var point = menuPosition(rect, size, { width: win.innerWidth, height: win.innerHeight }, current.current.align);
        panel.style.left = point.left + "px";
        panel.style.top = point.top + "px";
      }
      function outside(event) {
        if (!anchor.contains(event.target) && !panel.contains(event.target)) close(false);
      }
      panel.addEventListener("beforetoggle", onToggle);
      panel.showPopover();
      panel.ownerDocument.addEventListener("pointerdown", outside);
      position();
      var options = candidates();
      var selected = options.filter(function(node) {
        return node.getAttribute("aria-checked") === "true";
      })[0];
      if (props.autoFocus !== false) {
        if (selected || options[0]) (selected || options[0]).focus({ preventScroll: true });
        else panel.focus({ preventScroll: true });
      }
      win.addEventListener("resize", position);
      win.addEventListener("scroll", position, true);
      var observer = typeof win.ResizeObserver === "function" ? new win.ResizeObserver(position) : null;
      if (observer) {
        observer.observe(anchor);
        observer.observe(panel);
      }
      return function() {
        suppressToggle.current = true;
        panel.removeEventListener("beforetoggle", onToggle);
        if (panel.matches(":popover-open")) panel.hidePopover();
        panel.ownerDocument.removeEventListener("pointerdown", outside);
        win.removeEventListener("resize", position);
        win.removeEventListener("scroll", position, true);
        if (observer) observer.disconnect();
      };
    }, [!!props.open]);
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      if (current.current.role === "dialog") return;
      if (event.key === "Tab") {
        close(true);
        return;
      }
      var nodes = candidates();
      if (!nodes.length) return;
      var index = nodes.indexOf(panelRef.current.ownerDocument.activeElement), next = -1;
      if (event.key === "ArrowDown") next = (index + 1) % nodes.length;
      if (event.key === "ArrowUp") next = (index - 1 + nodes.length) % nodes.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = nodes.length - 1;
      if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey && event.key !== " ") {
        var now = Date.now();
        search.current.text = (now - search.current.time < 600 ? search.current.text : "") + event.key.toLowerCase();
        search.current.time = now;
        for (var i = 1; i <= nodes.length; i++) {
          var n = (index + i) % nodes.length;
          if (text(nodes[n].textContent).trim().toLowerCase().indexOf(search.current.text) === 0) {
            next = n;
            break;
          }
        }
      }
      if (next >= 0) {
        event.preventDefault();
        nodes[next].focus({ preventScroll: true });
      }
    }
    var items = Array.isArray(props.items) ? props.items : null;
    var triggerId = React19.isValidElement(props.anchor) && props.anchor.props.id || uid + "-trigger";
    var trigger = React19.isValidElement(props.anchor) ? React19.cloneElement(props.anchor, {
      id: triggerId,
      "aria-haspopup": props.role || "menu",
      "aria-controls": uid,
      "aria-expanded": !!props.open
    }) : props.anchor;
    return h5(Fragment, null, h5(
      "span",
      {
        className: "rsui-menu-anchor",
        ref: anchorRef,
        tabIndex: -1,
        onFocusCapture: function(event) {
          if (!panelRef.current || !panelRef.current.contains(event.target)) focusedAnchor.current = event.target;
        },
        onBlurCapture: function(event) {
          if (current.current.role === "dialog" && current.current.open && !anchorRef.current?.contains(event.relatedTarget)) close(false);
        }
      },
      trigger,
      h5("div", {
        ref: panelRef,
        id: uid,
        popover: "manual",
        hidden: !props.open,
        role: props.role || "menu",
        tabIndex: -1,
        "aria-label": props["aria-label"],
        "aria-labelledby": props["aria-label"] || !React19.isValidElement(props.anchor) ? void 0 : triggerId,
        className: classes("rsui-menu", props.className),
        onKeyDown,
        style: props.style
      }, items ? items.map(function(item, index) {
        if (!item) return null;
        if (item.type === "separator" || item.separator) return h5("hr", { key: item.id || index, className: "rsui-menu-separator", role: "separator" });
        var selectable = props.selectedId !== void 0;
        return h5(
          "button",
          {
            key: item.id == null ? index : item.id,
            type: "button",
            className: "rsui-menu-item",
            role: selectable ? "menuitemradio" : "menuitem",
            disabled: !!item.disabled,
            "aria-checked": selectable ? props.selectedId === item.id : void 0,
            onClick: function(event) {
              if (item.onClick) item.onClick(event);
              if (!event.defaultPrevented) {
                if (props.onSelect) props.onSelect(item.id);
                close(true);
              }
            }
          },
          item.icon || null,
          h5(
            "span",
            { className: "rsui-menu-label" },
            item.label,
            item.description || item.detail ? h5("span", { className: "rsui-menu-detail" }, item.description || item.detail) : null
          ),
          selectable ? h5("span", { className: "rsui-menu-check", "aria-hidden": true }, props.selectedId === item.id ? h5(Icon, { name: "check" }) : null) : null
        );
      }) : props.children)
    ));
  }
  function CopyButton(props) {
    var pair = React19.useState("idle"), state = pair[0], setState = pair[1];
    var mounted = React19.useRef(false), timer = React19.useRef(null), operation = React19.useRef(0);
    React19.useEffect(function() {
      mounted.current = true;
      return function() {
        mounted.current = false;
        operation.current++;
        if (timer.current != null) clearTimeout(timer.current);
      };
    }, []);
    React19.useEffect(function() {
      operation.current++;
      setState("idle");
      if (timer.current != null) clearTimeout(timer.current);
    }, [props.text]);
    function copy() {
      var generation = ++operation.current;
      if (timer.current != null) clearTimeout(timer.current);
      if (!window.navigator.clipboard || typeof window.navigator.clipboard.writeText !== "function") {
        setState("failed");
        return;
      }
      setState("busy");
      Promise.resolve().then(function() {
        return window.navigator.clipboard.writeText(text(props.text));
      }).then(function() {
        if (!mounted.current || generation !== operation.current) return;
        setState("copied");
        timer.current = setTimeout(function() {
          if (mounted.current) setState("idle");
        }, 2e3);
      }, function() {
        if (mounted.current && generation === operation.current) setState("failed");
      });
    }
    var caption = label2(props.labels, state === "copied" ? "copied" : "copy", state === "copied" ? "Copied" : "Copy");
    var buttonProps = omit(props, ["text", "labels", "iconOnly", "children"]);
    Object.assign(buttonProps, {
      size: "sm",
      variant: "ghost",
      className: classes("rsui-text-action", props.className),
      onClick: copy,
      disabled: !!props.disabled || state === "busy",
      "data-icon-only": !!props.iconOnly,
      "aria-label": state === "copied" ? caption : props["aria-label"] || caption,
      title: state === "copied" ? caption : props.title || caption
    });
    return h5(
      Fragment,
      null,
      h5(Button, buttonProps, h5(Icon, { name: state === "copied" ? "check" : "copy", size: 16 }), props.iconOnly ? null : caption),
      state === "copied" ? h5("span", { className: "rsui-copy-feedback", role: "status" }, caption) : null,
      state === "failed" ? h5("span", { className: "rsui-copy-error", role: "alert" }, label2(props.labels, "copyFailed", "Copy unavailable; select the text and copy manually.")) : null
    );
  }
  function TextBlock(props) {
    var expandedPair = React19.useState(false), expanded = expandedPair[0];
    var wrapPair = React19.useState(!!props.wrap), wrap = wrapPair[0];
    var rows = props.rows || [], max = limitLines(props.maxLines), shown = expanded ? rows : rows.slice(0, max);
    var labels = props.labels || {}, hidden = Math.max(0, rows.length - shown.length);
    var canExpand = rows.length > max;
    var uid = React19.useId();
    var caption = expanded ? label2(labels, "collapse", "Collapse") : label2(labels, "expand", "Show " + hidden + " more lines", hidden);
    var wrapCaption = label2(labels, wrap ? "unwrapLabel" : "wrapLabel", wrap ? "Unwrap" : "Wrap");
    return h5(
      "section",
      { className: classes("rsui-block", props.className), "aria-label": text(props.label) || void 0 },
      h5(
        "div",
        { className: "rsui-block-banner" },
        h5("span", { className: "rsui-block-label" }, props.label || label2(labels, "codeLabel", "Code")),
        props.status ? h5("span", { className: "rsui-block-status", role: "status" }, props.status) : null,
        props.allowWrap === false ? null : h5(
          Button,
          {
            variant: "ghost",
            size: "sm",
            className: "rsui-text-action",
            iconOnly: true,
            "data-icon-only": true,
            title: wrapCaption,
            "aria-label": wrapCaption,
            "aria-pressed": wrap,
            "aria-controls": uid,
            onClick: function() {
              wrapPair[1](!wrap);
            }
          },
          h5(
            "svg",
            { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", focusable: false, "aria-hidden": true },
            h5("path", { d: wrap ? "M4 6h16M4 11h12a4 4 0 0 1 0 8h-4m3-3-3 3 3 3M4 16h3" : "M4 6h16M4 12h16M4 18h16" })
          )
        ),
        h5(CopyButton, { text: props.copyText == null ? rows.map(function(row) {
          return row.text;
        }).join("\n") : props.copyText, labels, iconOnly: true })
      ),
      props.before,
      h5("pre", { className: "rsui-block-pre", "data-wrap": wrap, id: uid, tabIndex: 0 }, h5("code", null, shown.map(function(row, index) {
        return h5(
          "span",
          { key: index, className: "rsui-block-line", "data-kind": row.kind },
          props.diff ? h5("span", { className: "rsui-block-number", "aria-hidden": true }, row.oldNumber == null ? "" : row.oldNumber) : null,
          props.numbers ? h5("span", { className: "rsui-block-number", "aria-hidden": true }, row.number == null ? "" : row.number) : null,
          props.diff ? h5("span", { className: "rsui-block-sign", "aria-hidden": true }, row.kind === "add" ? "+" : row.kind === "remove" ? "-" : " ") : null,
          h5("span", { className: "rsui-block-line-text" }, text(row.text))
        );
      }))),
      canExpand || props.totalLines != null ? h5(
        "div",
        { className: "rsui-block-footer" },
        props.totalLines != null ? h5("span", { className: "rsui-block-status" }, typeof labels.window === "function" ? labels.window(shown.length, props.totalLines) : shown.length + " / " + props.totalLines) : null,
        canExpand ? h5(Button, {
          variant: "ghost",
          size: "sm",
          "aria-expanded": expanded,
          "aria-controls": uid,
          "aria-label": expanded ? label2(labels, "collapseAria", text(caption)) : label2(labels, "expandAria", text(caption), hidden),
          onClick: function() {
            expandedPair[1](!expanded);
          }
        }, caption) : null
      ) : null,
      props.after
    );
  }
  function ReadBlock(props) {
    var rows = Array.isArray(props.lines) ? props.lines.map(function(line, index) {
      return typeof line === "object" && line ? { number: line.number == null ? index + 1 : line.number, text: text(line.text) } : { number: index + 1, text: text(line) };
    }) : splitLines(props.text).map(function(line, index) {
      return { number: index + 1, text: line };
    });
    return h5(TextBlock, Object.assign({}, props, {
      rows,
      numbers: true,
      copyText: props.copyText == null && !Array.isArray(props.lines) && typeof props.text === "string" ? props.text : props.copyText,
      totalLines: props.totalLines == null ? rows.length : props.totalLines
    }));
  }
  function DiffBlock(props) {
    var diffs = Array.isArray(props.diffs) ? props.diffs : [];
    return h5(Fragment, null, diffs.map(function(diff, index) {
      var rows = diffLines(diff.oldText, diff.newText);
      var removed = rows.filter(function(row) {
        return row.kind === "remove";
      }).length;
      var added = rows.filter(function(row) {
        return row.kind === "add";
      }).length;
      return h5(TextBlock, { key: text(diff.path) + ":" + index, className: props.className, label: diff.path || label2(props.labels, "codeLabel", "Code"), labels: props.labels, maxLines: props.maxLines, rows, numbers: true, diff: true, copyText: text(diff.newText), status: "+" + added + " / \u2212" + removed });
    }));
  }
  function TerminalBlock(props) {
    var labels = props.labels || {}, output = stripTerminal(props.output), command = stripTerminal(props.command), status = "";
    if (props.running) status = label2(labels, "running", "Running");
    else if (props.signal) status = label2(labels, "signal", "Signal: " + props.signal, props.signal);
    else if (props.exitCode != null) status = label2(labels, "exitCode", "Exit code: " + props.exitCode, props.exitCode);
    else status = label2(labels, "noExitCode", "No exit code");
    var rows = splitLines(output).map(function(line) {
      return { text: line };
    });
    return h5(TextBlock, {
      rows,
      copyText: output,
      labels,
      wrap: true,
      allowWrap: false,
      label: props.label || label2(labels, "commandLine", "Terminal", 1),
      maxLines: props.maxLines,
      status,
      className: props.className,
      before: h5(
        Fragment,
        null,
        command ? h5("pre", { className: "rsui-terminal-command" }, command) : null,
        props.cwd ? h5("div", { className: "rsui-terminal-meta" }, props.cwd) : null
      ),
      after: !rows.length ? h5("div", { className: "rsui-terminal-meta" }, label2(labels, "noOutput", "No output")) : null
    });
  }
  function renderInline(tokens) {
    return tokens.map(function(token, index) {
      if (token.type === "text") return token.text;
      if (token.type === "code") return h5("code", { key: index }, token.text);
      if (token.type === "link") return h5("a", { key: index, href: token.href, title: token.title, target: /^https?:/i.test(token.href) ? "_blank" : void 0, rel: /^https?:/i.test(token.href) ? "noopener noreferrer" : void 0 }, renderInline(token.children));
      return h5(token.type, { key: index }, renderInline(token.children));
    });
  }
  function renderBlocks(blocks, labels) {
    return blocks.map(function(block, index) {
      if (block.type === "paragraph") return h5("p", { key: index }, renderInline(inlineTokens(block.text)));
      if (block.type === "heading") return h5("h" + block.level, { key: index }, renderInline(inlineTokens(block.text)));
      if (block.type === "hr") return h5("hr", { key: index });
      if (block.type === "quote") return h5("blockquote", { key: index }, renderBlocks(block.children, labels));
      if (block.type === "code") {
        var codeLabels = labels && labels.code || {}, toolbar = codeLabels.toolbarLabels || {};
        return h5(TextBlock, { key: index, label: block.language || toolbar.codeLabel, copyText: block.text, rows: splitLines(block.text).map(function(line) {
          return { text: line };
        }), maxLines: Number.MAX_SAFE_INTEGER, labels: Object.assign({}, toolbar, { copy: codeLabels.copyLabel, copied: codeLabels.copiedLabel, copyFailed: codeLabels.copyFailedLabel }) });
      }
      if (block.type === "list") return h5(block.ordered ? "ol" : "ul", { key: index, start: block.ordered ? block.start : void 0, "data-loose": !!block.loose }, block.items.map(function(item, n) {
        return h5("li", { key: n }, item.checked == null ? null : h5("input", { className: "rsui-markdown-task", type: "checkbox", checked: item.checked, disabled: true, "aria-label": item.children[0] && item.children[0].text || void 0 }), renderBlocks(item.children, labels));
      }));
      if (block.type === "table") return h5("div", { key: index, className: "rsui-markdown-table", tabIndex: 0 }, h5(
        "table",
        null,
        h5("thead", null, h5("tr", null, block.headers.map(function(cell, n) {
          return h5("th", { key: n, scope: "col", style: { textAlign: block.align[n] || "left" } }, renderInline(inlineTokens(cell)));
        }))),
        h5("tbody", null, block.rows.map(function(row, n) {
          return h5("tr", { key: n }, block.headers.map(function(_, column) {
            return h5("td", { key: column, style: { textAlign: block.align[column] || "left" } }, renderInline(inlineTokens(row[column] || "")));
          }));
        }))
      ));
      return null;
    });
  }
  function MarkdownText(props) {
    var blocks = React19.useMemo(function() {
      return parseMarkdown(props.text);
    }, [props.text]);
    return h5("div", { className: classes("rsui-markdown", props.className), style: props.style }, renderBlocks(blocks, props.labels));
  }
  Object.assign(exports, {
    Button,
    Input,
    Checkbox,
    Menu,
    Modal,
    Tag,
    StateDot,
    IconSendOutlineRegular: icon("send"),
    IconGaugeOutlineRegular: icon("gauge"),
    IconChevronDownOutlineRegular: icon("chevron"),
    IconFolderOpenOutline16: icon("folder"),
    IconSidebarOutlineRegular: icon("sidebar"),
    FileTypeIcon,
    CopyButton,
    TextBlock,
    MarkdownText,
    DiffBlock,
    ReadBlock,
    TerminalBlock
  });
  return exports;
}

// lib/protocol.js
var HTTP_BASE = "/remote-ssh/v3";
var REMOTE_SESSION_PROJECTION_KEY = "remoteSshRecordedTurns";

// src/client/api.js
function formatError(result, fallback = "Request failed") {
  return typeof result?.error === "string" ? result.error : result?.error?.message || result?.message || fallback;
}
function responseError(result) {
  return Object.assign(new Error(formatError(result)), { code: result?.code || result?.error?.code || "request_failed", result });
}
async function api(method, args = {}, signal) {
  try {
    const response = await fetch(`${HTTP_BASE}/api/${method}`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
      body: JSON.stringify(args)
    });
    const value = await response.json().catch(() => null);
    if (!response.ok || value?.ok !== true) {
      return {
        ...value?.error,
        ok: false,
        code: value?.error?.code || `http_${response.status}`,
        error: value?.error?.message || `HTTP ${response.status}`
      };
    }
    return value;
  } catch (error) {
    return { ok: false, code: error.name === "AbortError" ? "cancelled" : "network_error", error: error.message };
  }
}
async function stream(method, args, signal, onEvent) {
  const response = await fetch(`${HTTP_BASE}/api/${method}`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
    body: JSON.stringify(args)
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("ndjson") || !response.body) {
    let failure;
    try {
      failure = await response.json();
    } catch {
      failure = { error: `HTTP ${response.status}` };
    }
    throw responseError({ ...failure, code: failure?.code || failure?.error?.code || `http_${response.status}` });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatch = (event) => {
    if (event?.type === "error" && (!Number.isSafeInteger(event.seq) || event.seq < 1)) throw responseError(event);
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) dispatch(JSON.parse(line));
      }
      if (buffer.length > 4 * 1024 * 1024) throw new Error("ACP event exceeds the client frame limit");
      if (done) {
        if (buffer.trim()) dispatch(JSON.parse(buffer));
        break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
    }
    reader.releaseLock();
  }
}

// src/client/shared.js
var h = import_react.default.createElement;
var ui = createUi(import_react.default);
var NAMESPACE = "dsh-remote-ssh";
var locale = {
  t: (key2) => key2,
  subscribe: () => () => {
  },
  getSnapshot: () => 0
};
function useT() {
  import_react.default.useSyncExternalStore(locale.subscribe, locale.getSnapshot, locale.getSnapshot);
  return locale.t;
}
function Select({ label: label2, value, options, onChange, disabled, icon, className = "", align = "end" }) {
  const [open, setOpen] = import_react.default.useState(false);
  const selected = options.find((option) => option.id === value);
  return h(ui.Menu, {
    open,
    items: options,
    selectedId: value,
    align,
    onClose: () => setOpen(false),
    onSelect: (id) => {
      setOpen(false);
      onChange(id);
    },
    anchor: h(
      ui.Button,
      {
        variant: "ghost",
        size: "sm",
        disabled,
        className: `rssh-selector ${className}`.trim(),
        "aria-label": `${label2}: ${selected?.label || value || ""}`,
        title: `${label2}: ${selected?.label || value || ""}`,
        onClick: () => setOpen((current) => !current)
      },
      icon,
      h("span", { className: "rssh-selector-label" }, selected?.label || value || label2),
      h(ui.IconChevronDownOutlineRegular, { size: 14 })
    )
  });
}
function FileGlyph({ directory, name }) {
  return directory ? h(ui.IconFolderOpenOutline16, { size: 16 }) : h(ui.FileTypeIcon, { path: name, size: 16 });
}

// src/client/router.js
function knownRemoteBlank(session, workspaces) {
  if (session?.blank !== true || typeof session.cwd !== "string" || !Array.isArray(workspaces)) return false;
  const path = session.cwd.replaceAll("\\", "/").replace(/\/$/, "");
  return workspaces.some((workspace) => {
    if (typeof workspace?.mirrorPath !== "string") return false;
    const root = workspace.mirrorPath.replaceAll("\\", "/").replace(/\/$/, "");
    return root.length > 1 && (path === root || path.startsWith(root + "/"));
  });
}
function createBackendRouter({ load, show }) {
  let state = { phase: "native", sessionId: "", value: null, error: "" };
  let currentId = "", generation = 0, disposed = false;
  let lastEvidence = {};
  const listeners = /* @__PURE__ */ new Set();
  const publish = (next) => {
    state = next;
    show(next.phase === "remote" || next.ownsRemote === true);
    for (const listener of listeners) listener();
  };
  function select2(id, force = false, evidence) {
    const sessionId = String(id || "");
    if (disposed || !force && sessionId === currentId) return;
    if (sessionId !== currentId) lastEvidence = {};
    if (evidence !== void 0) lastEvidence = evidence;
    const facts = { ...lastEvidence };
    const ownsPlaceholder = facts.recorded === true || facts.blankWorkspace === true;
    const retained = state.sessionId === sessionId && (state.phase === "remote" || state.ownsRemote) ? state.value : null;
    currentId = sessionId;
    const request = ++generation;
    if (!sessionId) {
      publish({ phase: "native", sessionId, value: null, error: "" });
      return;
    }
    if (!retained) publish({ phase: "loading", sessionId, value: null, ownsRemote: ownsPlaceholder, error: "" });
    Promise.resolve().then(() => load(sessionId)).then((result) => {
      if (disposed || generation !== request) return;
      if (!result?.ok || result.sessionId !== sessionId) throw new Error(formatError(result));
      const remote = result.remote === true && result.workspace && ["claude", "codex"].includes(result.backend?.type);
      const selection = result.remote === true && result.workspace && result.selectionRequired === true && result.backend === null;
      if (facts.recorded === true && !remote) throw new Error("The recorded remote conversation is currently unavailable");
      publish({ phase: selection ? "selection" : remote ? "remote" : "native", ownsRemote: !!selection, sessionId, value: result, error: "" });
    }).catch((error) => {
      if (!disposed && generation === request) publish({ phase: "error", sessionId, value: retained, ownsRemote: !!retained || ownsPlaceholder, error: error.message });
    });
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    select: select2,
    refresh: () => select2(currentId, true),
    dispose: () => {
      disposed = true;
      generation++;
      listeners.clear();
      show(false);
    }
  };
}

// src/client/chat.js
var import_react12 = __toESM(require("react"), 1);

// src/client/events.js
var list = (value) => Array.isArray(value) ? value : [];
var defined = (before, patch) => Object.assign({}, before, Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== void 0 && value !== null)));
var itemKey = (event) => `${event.generation || "event"}:${event.seq}`;
var requestKey = (event) => {
  const id = event.requestId || event.displayRequestId;
  return id ? JSON.stringify([id, event.sessionId || "", event.parentToolCallId || ""]) : "";
};
var origin = (event) => [event.sessionId, event.turnId, event.messageId, event.parentToolCallId].map((value) => value || "").join("|");
function initialState() {
  return {
    cursor: { generation: "", seq: 0 },
    items: [],
    permissions: [],
    elicitations: [],
    commands: [],
    config: {},
    capabilities: {},
    usage: null,
    suggestions: [],
    binding: null,
    running: false,
    loading: true,
    connected: false,
    error: "",
    title: "",
    turns: {},
    hasEarlier: false,
    oldestSeq: null
  };
}
function applySnapshot(state, snapshot = {}) {
  return {
    ...state,
    binding: { ...state.binding, ...snapshot },
    loading: false,
    config: snapshot.config || state.config,
    capabilities: snapshot.capabilities || state.capabilities,
    commands: Array.isArray(snapshot.commands) ? snapshot.commands : state.commands,
    running: snapshot.busy === true || snapshot.status === "prompting" || snapshot.status === "starting",
    permissions: list(snapshot.pendingPermissions),
    elicitations: list(snapshot.pendingElicitations),
    title: snapshot.title || state.title,
    error: snapshot.lastError || ""
  };
}
function upsert(items, match, next) {
  const index = items.findIndex(match);
  if (index < 0) return [...items, next()];
  const result = items.slice();
  result[index] = next(items[index]);
  return result;
}
function appendText(items, event, type) {
  const last = items.at(-1), identity = origin(event);
  if (last?.type === type && last.identity === identity) {
    return [...items.slice(0, -1), { ...last, lastSeq: event.seq, ...type === "thought" ? { streaming: true } : {}, text: event.append === false ? String(event.text || "") : last.text + String(event.text || "") }];
  }
  return [...items, { ...event, key: itemKey(event), type, identity, lastSeq: event.seq, ...type === "thought" ? { streaming: true } : {}, text: String(event.text || "") }];
}
function finishThoughts(items, event) {
  return items.map((item) => item.sessionId === event.sessionId && (!event.turnId || item.turnId === event.turnId) ? item.type === "thought" ? { ...item, streaming: false } : item.type === "plan" ? { ...item, settled: true, settledReason: event.type === "stop" ? "stop" : "idle" } : item : item);
}
var planIdentity = (event) => JSON.stringify([event.sessionId || "", event.turnId || "", event.parentToolCallId || "", event.planId || ""]);
var receiptIdentity = (item) => JSON.stringify([item.interaction, item.sessionId || "", item.turnId || "", item.requestId || "", item.parentToolCallId || ""]);
function resolveInteraction(state, event, interaction) {
  const field3 = interaction === "permission" ? "permissions" : "elicitations";
  const pending = state[field3];
  let matches = event.requestId == null ? pending : pending.filter((item) => String(item.requestId) === String(event.requestId));
  if (matches.length > 1 && event.requestId != null) {
    matches = matches.filter((item) => ["sessionId", "turnId", "parentToolCallId"].every((key2) => event[key2] == null || event[key2] === item[key2]));
    if (matches.length !== 1) return state;
  }
  const outcome = event.type.endsWith("_cancelled") || event.outcome === "cancelled" || event.action === "cancel" ? "cancelled" : "resolved";
  const previousReceipts = state.items.filter((item) => item.type === "interaction_receipt" && item.interaction === interaction && event.requestId != null && item.requestId === String(event.requestId) && ["sessionId", "turnId", "parentToolCallId"].every((key2) => event[key2] == null || event[key2] === item[key2]));
  const sources = matches.length ? matches : event.requestId != null ? [previousReceipts.length === 1 ? previousReceipts[0] : event] : [];
  let items = state.items;
  for (const source of sources) {
    const receipt = {
      type: "interaction_receipt",
      interaction,
      outcome,
      sessionId: source.sessionId || event.sessionId || "",
      turnId: source.turnId || event.turnId || "",
      requestId: String(source.requestId ?? event.requestId ?? ""),
      parentToolCallId: source.parentToolCallId || event.parentToolCallId || ""
    };
    const previousDecision = source.type === "interaction_receipt" && ["allowed", "denied", "answered", "declined", "resolved", "cancelled"].includes(source.decision) ? source.decision : "resolved";
    const kind = interaction === "permission" && event.outcome === "selected" ? list(source.options).find((option) => option.optionId === event.optionId)?.kind : null;
    receipt.decision = outcome === "cancelled" ? "cancelled" : interaction === "question" && event.action === "accept" ? "answered" : interaction === "question" && event.action === "decline" ? "declined" : ["allow_once", "allow_always"].includes(kind) ? "allowed" : ["reject_once", "reject_always"].includes(kind) ? "denied" : previousDecision;
    const identity = receiptIdentity(receipt);
    items = upsert(
      items,
      (item) => item.type === "interaction_receipt" && receiptIdentity(item) === identity,
      (item) => ({ ...receipt, key: item?.key || `receipt:${identity}`, seq: event.seq, lastSeq: event.seq })
    );
  }
  return { ...state, items, [field3]: pending.filter((item) => !matches.includes(item)) };
}
function reduceEvent(previous, event) {
  if (!event || typeof event !== "object") return previous;
  if (event.type === "replay") {
    if (!event.reset) return previous;
    return {
      ...initialState(),
      binding: previous.binding,
      capabilities: previous.capabilities,
      config: previous.config,
      loading: false,
      cursor: { generation: event.cursor?.generation || "", seq: 0 }
    };
  }
  if (!Number.isSafeInteger(event.seq) || event.seq < 1) return previous;
  let state = previous;
  if (event.generation && state.cursor.generation && state.cursor.generation !== event.generation) {
    state = { ...initialState(), binding: state.binding, config: state.config, capabilities: state.capabilities, loading: false };
  }
  if (event.seq <= state.cursor.seq) return state;
  state = { ...state, cursor: { generation: event.generation || state.cursor.generation, seq: event.seq } };
  const key2 = itemKey(event), items = state.items;
  const rootEvent = !event.rootSessionId || event.rootSessionId === event.sessionId;
  switch (event.type) {
    case "text":
      return { ...state, items: appendText(items, event, "assistant") };
    case "thought":
      return { ...state, items: appendText(items, event, "thought") };
    case "user_message":
      return { ...state, running: true, items: upsert(
        items,
        (item) => item.type === "user" && requestKey(event) && requestKey(item) === requestKey(event),
        (item) => ({ ...item, ...event, key: item?.key || key2, type: "user", text: String(event.text || "") })
      ) };
    case "turn_start": {
      const scope = JSON.stringify([event.sessionId || "", event.turnId || ""]);
      return {
        ...state,
        running: rootEvent ? true : state.running,
        turns: event.turnId ? { ...state.turns, [scope]: { ...state.turns[scope], status: "running", startSeq: event.seq, startedAt: Number.isFinite(event.ts) ? event.ts : null } } : state.turns,
        items: items.map((item) => item.type === "user" && requestKey(event) && requestKey(item) === requestKey(event) ? { ...item, delivery: "accepted" } : item)
      };
    }
    case "tool_call":
    case "tool_call_update":
      return { ...state, items: upsert(
        items,
        (item) => item.type === "tool" && item.tool.toolCallId === event.toolCallId && item.tool.sessionId === event.sessionId,
        (item) => ({ key: item?.key || key2, type: "tool", tool: defined(item?.tool, event) })
      ) };
    case "permission":
      return event.autoResolved ? state : { ...state, permissions: [...state.permissions.filter((value) => value.requestId !== event.requestId), event] };
    case "permission_resolved":
    case "permission_cancelled":
      return resolveInteraction(state, event, "permission");
    case "elicitation":
      return event.supported === false ? state : { ...state, elicitations: [...state.elicitations.filter((value) => value.requestId !== event.requestId), event] };
    case "elicitation_resolved":
    case "elicitation_cancelled":
      return resolveInteraction(state, event, "question");
    case "commands":
      return { ...state, commands: list(event.commands) };
    case "config":
      return { ...state, config: event.config || state.config };
    case "mode":
      return { ...state, config: event.config || {
        ...state.config,
        mode: event.currentModeId,
        modes: { ...state.config.modes, currentModeId: event.currentModeId }
      } };
    case "session":
      return {
        ...state,
        binding: { ...state.binding, ...event.session },
        config: event.config || state.config,
        capabilities: event.capabilities || state.capabilities
      };
    case "session_info":
      return { ...state, title: event.title ?? state.title };
    case "usage":
      return rootEvent && event.inherited !== true ? { ...state, usage: event.usage || event } : state;
    case "suggestions":
      return { ...state, suggestions: list(event.suggestions) };
    case "stop": {
      const finished = finishThoughts(items, event);
      const updated = event.submitted === false && requestKey(event) ? finished.map((item) => item.type === "user" && requestKey(item) === requestKey(event) ? { ...item, delivery: "cancelled" } : item) : finished;
      const scope = JSON.stringify([event.sessionId || "", event.turnId || ""]);
      const status = event.stopReason === "cancelled" ? "cancelled" : event.stopReason === "end_turn" || event.stopReason === "completed" ? "completed" : "interrupted";
      return {
        ...state,
        running: rootEvent ? event.busy === true || event.pendingTurns > 0 : state.running,
        turns: event.turnId ? { ...state.turns, [scope]: { ...state.turns[scope], status, stopReason: event.stopReason, endSeq: event.seq, endedAt: Number.isFinite(event.ts) ? event.ts : null } } : state.turns,
        items: event.stopReason && event.stopReason !== "end_turn" ? [...updated, { ...event, key: key2, type: "system", text: event.stopReason }] : updated
      };
    }
    case "error":
      return {
        ...state,
        error: event.message || event.code || "Agent error",
        running: event.fatal ? false : state.running,
        binding: event.fatal ? { ...state.binding, status: "error" } : state.binding,
        items: [...items, { ...event, key: key2, type: "error", text: event.message || event.code || "" }]
      };
    case "plan": {
      const identity = planIdentity(event), turn = state.turns[JSON.stringify([event.sessionId || "", event.turnId || ""])];
      return { ...state, items: upsert(
        items,
        (item) => item.type === "plan" && planIdentity(item) === identity,
        (item) => ({
          ...defined(item, event),
          key: item?.key || key2,
          type: "plan",
          lastSeq: event.seq,
          settled: item?.settled === true || !!turn?.status && turn.status !== "running"
        })
      ) };
    }
    case "plan_removed":
      return { ...state, items: items.map((item) => item.type === "plan" && planIdentity(item) === planIdentity(event) ? { ...item, settled: true, settledReason: "removed", removed: true, lastSeq: event.seq } : item) };
    case "notice":
      return { ...state, items: [...items, { ...event, key: key2, type: "notice" }] };
    case "compaction":
    case "compaction_chunk": {
      const match = (item) => item.type === "compaction" && item.compactionId === event.compactionId && item.sessionId === event.sessionId;
      if (event.type === "compaction") {
        return { ...state, items: upsert(items, match, (item) => ({ ...item, ...event, key: item?.key || key2, type: "compaction" })) };
      }
      const text2 = event.content && event.content.type === "text" ? String(event.content.text || "") : "";
      return { ...state, items: upsert(items, match, (item) => ({
        ...item,
        key: item?.key || key2,
        type: "compaction",
        compactionId: item?.compactionId || event.compactionId,
        summaryText: String(item?.summaryText || "") + text2
      })) };
    }
    case "subagent":
    case "subagent_update": {
      const identity = event.taskId || event.toolUseId || event.agentId || event.sessionId || key2;
      return { ...state, items: upsert(
        items,
        (item) => item.type === "subagent" && item.identity === identity,
        (item) => ({
          key: item?.key || key2,
          type: "subagent",
          identity,
          _key: identity,
          parentToolCallId: event.parentToolCallId || item?.parentToolCallId,
          subagent: defined(item?.subagent, event)
        })
      ) };
    }
    case "state": {
      const value = typeof event.state === "object" ? event.state?.state : event.state;
      const running = ["running", "working", "requires_action", "requires-action"].includes(value) ? true : value === "idle" ? false : state.running;
      return {
        ...state,
        running: rootEvent ? running : state.running,
        items: upsert(
          value === "idle" ? finishThoughts(items, event) : items,
          (item) => item.type === "state" && item.sessionId === event.sessionId,
          (item) => ({ ...event, key: item?.key || key2, type: "state" })
        )
      };
    }
    case "terminal":
      return { ...state, items: upsert(
        items,
        (item) => item.type === "terminal_event" && item.terminalId === event.terminalId && item.sessionId === event.sessionId,
        (item) => ({
          ...defined(item, event),
          key: item?.key || key2,
          type: "terminal_event",
          output: event.chunk ? String(item?.output || "") + String(event.output || "") : String(event.output ?? item?.output ?? "")
        })
      ) };
    case "session_message": {
      const match = (item) => item.type === "session_message" && item.messageId && item.messageId === event.messageId && item.sessionId === event.sessionId;
      return { ...state, items: upsert(items, match, (item) => ({
        ...defined(item, event),
        key: item?.key || key2,
        type: "session_message",
        text: event.chunk ? String(item?.text || "") + String(event.text || "") : String(event.text || "")
      })) };
    }
    case "request_ack":
      return state;
    default:
      return { ...state, items: [...items, { ...event, key: key2, type: "native_event", event }] };
  }
}
function replay(events, snapshot, previous = initialState()) {
  let state = { ...initialState(), binding: previous.binding, capabilities: previous.capabilities, config: previous.config, loading: false };
  for (const event of events.slice().sort((a, b) => a.seq - b.seq)) state = reduceEvent(state, event);
  return applySnapshot(state, snapshot || previous.binding || {});
}

// src/client/submission.js
function wireAttachments(attachments) {
  return attachments.map(({ id, ...payload2 }) => structuredClone(payload2));
}
function submissionSignature(draft, attachments) {
  return JSON.stringify({ text: draft.trim(), attachments: wireAttachments(attachments) });
}
function prepareSubmission(draft, attachments, previous, makeId = () => crypto.randomUUID()) {
  const signature = submissionSignature(draft, attachments);
  if (previous?.signature === signature) return previous;
  return {
    requestId: makeId(),
    signature,
    draft,
    text: draft.trim(),
    attachments: wireAttachments(attachments),
    attachmentIds: attachments.map((file) => file.id)
  };
}
function acknowledgeSubmission(currentDraft, currentAttachments, submitted) {
  const unchanged = currentDraft === submitted.draft && submissionSignature(currentDraft, currentAttachments) === submitted.signature;
  const ids = new Set(submitted.attachmentIds);
  return { draft: unchanged ? "" : currentDraft, attachments: currentAttachments.filter((file) => !ids.has(file.id)) };
}

// src/client/composer-session.js
var ComposerSession = class {
  constructor(sessionId, storage) {
    this.key = `remote-acp.draft.v3.${sessionId}`;
    try {
      this.storage = storage === void 0 ? typeof window === "undefined" ? null : window.localStorage : storage;
    } catch {
    }
    let draft = "";
    try {
      draft = this.storage?.getItem(this.key) || "";
    } catch {
    }
    this.state = { draft, attachments: [], sending: false, error: "" };
    this.pending = null;
    this.attempt = 0;
    this.listeners = /* @__PURE__ */ new Set();
  }
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  publish(patch) {
    this.state = { ...this.state, ...patch };
    if (Object.hasOwn(patch, "draft")) try {
      this.storage?.setItem(this.key, this.state.draft);
    } catch {
    }
    for (const listener of this.listeners) listener();
  }
  setDraft = (value) => this.publish({ draft: typeof value === "function" ? value(this.state.draft) : String(value) });
  setAttachments = (value) => this.publish({ attachments: typeof value === "function" ? value(this.state.attachments) : value });
  begin(kind) {
    if (this.state.sending) throw new Error("A submission is awaiting acknowledgment");
    const request = prepareSubmission(this.state.draft, this.state.attachments, this.pending);
    this.pending = { ...request, kind: request.kind || kind };
    const attempt = ++this.attempt;
    this.publish({ sending: true, error: "" });
    return { request: this.pending, attempt };
  }
  acknowledge(requestId) {
    if (this.pending?.requestId !== requestId) return;
    const next = acknowledgeSubmission(this.state.draft, this.state.attachments, this.pending);
    this.pending = null;
    this.publish({ ...next, sending: false, error: "" });
  }
  finish(request, attempt, error) {
    if (this.attempt !== attempt || this.pending?.requestId !== request.requestId) return;
    this.publish({ sending: false, error: error?.message || "" });
  }
  get hasContent() {
    return !!(this.state.draft || this.state.attachments.length || this.pending);
  }
  clear() {
    this.pending = null;
    this.attempt++;
    this.publish({ draft: "", attachments: [], sending: false, error: "" });
  }
};

// src/client/session.js
var clientSequence = 0;
var ACCESS_DENIED = /* @__PURE__ */ new Set(["unauthenticated", "request_forbidden", "remote_access_denied", "http_401", "http_403"]);
var TERMINAL_ATTACH = /* @__PURE__ */ new Set(["acp_not_found", "acp_not_running", "binding_mismatch", "session_archived", "session_not_found"]);
var SessionClient = class {
  constructor(backend, dependencies = {}) {
    this.backend = backend;
    this.viewKey = ++clientSequence;
    this.api = dependencies.api || api;
    this.stream = dependencies.stream || stream;
    this.state = initialState();
    this.listeners = /* @__PURE__ */ new Set();
    this.acknowledgements = /* @__PURE__ */ new Set();
    this.events = /* @__PURE__ */ new Map();
    this.controllers = /* @__PURE__ */ new Set();
    this.disposed = false;
    this.retryTimer = null;
    this.attaching = false;
    this.retryCount = 0;
    this.connecting = null;
    this.ready = false;
    this.epoch = 0;
    this.replayRevision = 0;
    this.attachController = null;
    this.onAuthorized = dependencies.onAuthorized || (() => {
    });
    this.onBinding = dependencies.onBinding || (() => {
    });
    this.retryBlocked = false;
    this.composer = dependencies.composer || new ComposerSession(backend.sessionId, dependencies.storage);
    this.onAccessDenied = dependencies.onAccessDenied || ((error) => this.invalidate(error));
    this.later = dependencies.setTimeout || globalThis.setTimeout.bind(globalThis);
    this.cancelTimer = dependencies.clearTimeout || globalThis.clearTimeout.bind(globalThis);
    this.heartbeatMs = dependencies.heartbeatMs || 45e3;
    this.heartbeatTimer = null;
  }
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  onAcknowledged(listener) {
    this.acknowledgements.add(listener);
    return () => this.acknowledgements.delete(listener);
  }
  acknowledge(requestId) {
    this.composer.acknowledge(requestId);
    for (const listener of this.acknowledgements) listener(requestId);
  }
  invalidate(error) {
    this.epoch++;
    this.retryBlocked = true;
    this.ready = false;
    this.cancelTimer(this.retryTimer);
    this.cancelTimer(this.heartbeatTimer);
    for (const controller of this.controllers) controller.abort();
    this.events.clear();
    this.composer.clear();
    this.publish({ ...initialState(), everConnected: false, transportError: "", loading: false, error: error.message, failure: error.result || { code: error.code } });
  }
  publish(patch) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  receive = (event) => {
    if (this.disposed || this.retryBlocked || event?.type === "heartbeat") return;
    const reset = event.type === "replay" && event.reset || event.generation && this.state.cursor.generation && event.generation !== this.state.cursor.generation;
    if (reset) {
      this.events.clear();
      this.replayRevision++;
    }
    if (Number.isSafeInteger(event.seq)) this.events.set(event.seq, event);
    this.state = { ...reduceEvent(this.state, event), connected: this.state.connected, everConnected: this.state.everConnected, replayRevision: this.replayRevision };
    if ((event.type === "request_ack" || event.type === "user_message") && event.requestId) this.acknowledge(event.requestId);
    for (const listener of this.listeners) listener();
  };
  controller() {
    const controller = new AbortController();
    if (this.disposed) controller.abort();
    this.controllers.add(controller);
    return controller;
  }
  async request(method, payload2 = {}) {
    const epoch = this.epoch;
    const controller = this.controller();
    try {
      const result = await this.api(method, payload2, controller.signal);
      if (this.disposed || controller.signal.aborted || epoch !== this.epoch) throw Object.assign(new Error("Conversation detached"), { code: "cancelled" });
      if (!result.ok) {
        const error = responseError(result);
        if (ACCESS_DENIED.has(error.code)) this.onAccessDenied(error);
        throw error;
      }
      return result;
    } finally {
      this.controllers.delete(controller);
    }
  }
  ensureConnected() {
    return this.retryBlocked ? Promise.resolve() : this.connect();
  }
  connect() {
    if (this.disposed) return Promise.resolve();
    if (this.connecting) return this.connecting;
    if (this.ready && !this.state.failure && this.state.binding?.status !== "error") {
      this.attach();
      return Promise.resolve();
    }
    this.retryBlocked = false;
    this.connecting = this.startConnection().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }
  async startConnection() {
    const epoch = this.epoch;
    this.ready = false;
    this.cancelTimer(this.retryTimer);
    this.attachController?.abort();
    this.publish({ loading: true, connected: false, error: "", failure: null });
    try {
      const id = this.state.binding?.id || this.backend.binding?.id;
      const result = id ? await this.request("acpResume", { id, dshSessionId: this.backend.sessionId }) : await this.request("acpStart", { dshSessionId: this.backend.sessionId });
      if (this.disposed || epoch !== this.epoch) return;
      if (!result.session?.id) throw new Error("Invalid ACP session response");
      this.onBinding(result.session);
      this.state = applySnapshot(this.state, result.session);
      await this.history();
      if (this.disposed || this.retryBlocked || epoch !== this.epoch) return;
      this.ready = true;
      this.onAuthorized();
      this.attach();
    } catch (error) {
      if (!this.disposed && epoch === this.epoch) this.publish({ loading: false, error: error.message, failure: error.result || { code: error.code } });
    }
  }
  async history(beforeSeq, { beforeApply, canApply } = {}) {
    const epoch = this.epoch, revision = this.replayRevision;
    const id = this.state.binding?.id;
    if (!id) return;
    const startingCursor = this.state.cursor;
    const result = await this.request("acpEvents", {
      id,
      limit: 250,
      ...beforeSeq == null ? { tail: true } : { beforeSeq }
    });
    if (this.disposed || epoch !== this.epoch || revision !== this.replayRevision || canApply?.() === false) return;
    const current = this.state;
    const advanced = current.cursor.generation !== startingCursor.generation || current.cursor.seq > startingCursor.seq;
    if (advanced && result.cursor?.generation !== current.cursor.generation) return;
    const reset = result.reset || result.cursor?.generation && current.cursor.generation && result.cursor.generation !== current.cursor.generation;
    if (reset) {
      this.events.clear();
      this.replayRevision++;
    }
    for (const event of result.events) this.events.set(event.seq, event);
    const next = replay([...this.events.values()], result.session, current);
    if (advanced) for (const key2 of ["binding", "running", "permissions", "elicitations", "config", "capabilities", "error", "title"]) next[key2] = current[key2];
    if (!reset) beforeApply?.();
    this.publish({ ...next, replayRevision: this.replayRevision, connected: current.connected, everConnected: current.everConnected, transportError: current.transportError, oldestSeq: result.oldestSeq, hasEarlier: !!result.hasEarlier });
    for (const event of result.events) if ((event.type === "user_message" || event.type === "request_ack") && event.requestId) this.acknowledge(event.requestId);
  }
  attach() {
    if (this.disposed || this.retryBlocked || this.attaching || !this.state.binding?.id) return;
    this.cancelTimer(this.retryTimer);
    this.retryTimer = null;
    this.attaching = true;
    const controller = this.controller();
    this.attachController = controller;
    const id = this.state.binding.id;
    const watch = () => {
      this.cancelTimer(this.heartbeatTimer);
      this.heartbeatTimer = this.later(() => {
        if (this.disposed || controller.signal.aborted) return;
        this.publish({ connected: false, transportError: "Connection heartbeat timed out" });
        controller.abort();
      }, this.heartbeatMs);
    };
    watch();
    Promise.resolve().then(() => this.stream("acpAttach", { id, cursor: this.state.cursor }, controller.signal, (event) => {
      if (this.disposed || controller.signal.aborted || this.retryBlocked) return;
      this.retryCount = 0;
      watch();
      if (event.type !== "heartbeat") this.receive(event);
      if (!this.state.connected || this.state.transportError) this.publish({ connected: true, everConnected: true, transportError: "" });
    })).catch((error) => {
      if (controller.signal.aborted || this.disposed) return;
      if (ACCESS_DENIED.has(error.code)) {
        this.onAccessDenied(error);
        return;
      }
      if (TERMINAL_ATTACH.has(error.code)) {
        this.retryBlocked = true;
        this.ready = false;
        this.publish({ loading: false, failure: error.result || { code: error.code }, error: error.message });
      }
      this.publish({ connected: false, transportError: error.message });
    }).finally(() => {
      this.cancelTimer(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.controllers.delete(controller);
      this.attaching = false;
      this.attachController = null;
      if (this.disposed || this.retryBlocked || this.connecting && !this.ready) return;
      this.publish({ connected: false });
      this.retryTimer = this.later(() => this.attach(), Math.min(1e3 * 2 ** this.retryCount++, 1e4));
    });
  }
  async action(method, payload2 = {}) {
    const epoch = this.epoch;
    const result = await this.request(method, { id: this.state.binding?.id, dshSessionId: this.backend.sessionId, ...payload2 });
    if (this.disposed || epoch !== this.epoch) throw Object.assign(new Error("Conversation detached"), { code: "cancelled" });
    if (result.session) this.publish(applySnapshot(this.state, result.session));
    return result;
  }
  async sendDraft() {
    const { request, attempt } = this.composer.begin(this.state.running ? "steer" : "prompt");
    let failure;
    try {
      const result = await this.submit(request);
      if (this.composer.pending?.requestId === request.requestId) throw Object.assign(new Error("Message acknowledgment is unknown. Retry will reuse the same request."), { code: "acknowledgment_unknown" });
      return result;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      this.composer.finish(request, attempt, failure);
    }
  }
  async submit({ text: text2, attachments = [], requestId, kind }) {
    if (!this.state.binding) throw new Error("Agent is not connected");
    this.publish({ error: "" });
    const epoch = this.epoch;
    const payload2 = { id: this.state.binding.id, dshSessionId: this.backend.sessionId, text: text2, attachments, requestId };
    if (kind ? kind === "steer" : this.state.running) {
      const result = await this.action("acpSteer", payload2);
      this.acknowledge(requestId);
      return result;
    }
    const controller = this.controller();
    try {
      await this.stream("acpPrompt", { ...payload2, cursor: this.state.cursor }, controller.signal, (event) => {
        if (!controller.signal.aborted && epoch === this.epoch) this.receive(event);
      });
    } catch (error) {
      if (!this.disposed && !controller.signal.aborted && epoch === this.epoch && ACCESS_DENIED.has(error.code)) this.onAccessDenied(error);
      throw error;
    } finally {
      this.controllers.delete(controller);
      if (!this.disposed && !this.retryBlocked && epoch === this.epoch) await this.action("acpState").catch((error) => {
        if (!this.disposed && !this.retryBlocked && epoch === this.epoch) this.publish({ transportError: error.message });
      });
    }
  }
  async prepare(confirmed = false) {
    return this.request("acpPrepareRuntime", { sessionId: this.backend.sessionId, confirm: confirmed });
  }
  dispose() {
    this.disposed = true;
    this.cancelTimer(this.retryTimer);
    this.cancelTimer(this.heartbeatTimer);
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.listeners.clear();
    this.acknowledgements.clear();
  }
};

// src/client/session-pool.js
function sessionClientKey(backend) {
  return JSON.stringify([
    backend.sessionId,
    backend.workspace?.id,
    backend.workspace?.profileId,
    backend.workspace?.mirrorPath,
    backend.workspace?.remotePath,
    backend.cwd,
    backend.remoteCwd,
    backend.backend?.type
  ]);
}
var differs = (a, b) => !!(a && b && a !== b);
function bindingIdentity(backend, key2, binding = backend.binding) {
  return { key: key2, id: binding?.id, remotePath: binding?.remotePath, canonicalRemotePath: backend.canonicalRemotePath };
}
function changedIdentity(a, b) {
  return a.key !== b.key || ["id", "remotePath", "canonicalRemotePath"].some((key2) => differs(a[key2], b[key2]));
}
function retainKnown(previous, next) {
  return { ...previous, ...Object.fromEntries(Object.entries(next).filter(([, value]) => value != null && value !== "")) };
}
function compatible(client, backend) {
  if (client.disposed || sessionClientKey(client.backend) !== sessionClientKey(backend)) return false;
  const id = client.state.binding?.id || client.backend.binding?.id;
  if (id && backend.binding?.id && id !== backend.binding.id) return false;
  return !differs(client.backend.canonicalRemotePath, backend.canonicalRemotePath) && !differs(client.state.binding?.remotePath, backend.binding?.remotePath);
}
var SessionClientPool = class {
  constructor({
    maxClients = 2,
    idleMs = 10 * 60 * 1e3,
    createClient = (backend, deps) => new SessionClient(backend, deps),
    storage,
    setTimeout: later = globalThis.setTimeout.bind(globalThis),
    clearTimeout: cancel = globalThis.clearTimeout.bind(globalThis)
  } = {}) {
    this.maxClients = maxClients;
    this.idleMs = idleMs;
    this.createClient = createClient;
    this.storage = storage;
    this.later = later;
    this.cancel = cancel;
    this.entries = /* @__PURE__ */ new Map();
    this.drafts = /* @__PURE__ */ new Map();
    this.identities = /* @__PURE__ */ new Map();
    this.clock = 0;
    this.disposed = false;
    this.denied = null;
  }
  peek(backend) {
    const entry = this.entries.get(backend.sessionId);
    return entry && compatible(entry.client, backend) ? entry.client : null;
  }
  acquire(backend) {
    if (this.disposed) throw new Error("Remote client pool is disposed");
    let entry = this.entries.get(backend.sessionId);
    const key2 = sessionClientKey(backend);
    if (entry && !compatible(entry.client, backend)) {
      if (entry.leases) throw Object.assign(new Error("This Session identity changed while another view is using it. Reopen the conversation."), { code: "binding_mismatch" });
      entry.client.composer.clear();
      this.drafts.delete(entry.key);
      this.evict(backend.sessionId, entry);
      entry = null;
    }
    if (!entry) {
      let previous = this.identities.get(backend.sessionId);
      const identity = bindingIdentity(backend, key2);
      if (previous && changedIdentity(previous, identity)) {
        this.drafts.get(previous.key)?.clear();
        this.drafts.delete(previous.key);
        previous = null;
      }
      this.identities.set(backend.sessionId, retainKnown(previous, identity));
      let composer = this.drafts.get(key2);
      if (!composer) {
        composer = new ComposerSession(backend.sessionId, this.storage);
        this.drafts.set(key2, composer);
      }
      const client = this.createClient(backend, {
        composer,
        onAccessDenied: (error) => this.invalidate(error),
        onAuthorized: () => {
          this.denied = null;
        },
        onBinding: (snapshot) => {
          const previous2 = this.identities.get(backend.sessionId), next = bindingIdentity(backend, key2, snapshot);
          const changed = previous2 && changedIdentity(previous2, next);
          if (changed) composer.clear();
          this.identities.set(backend.sessionId, retainKnown(changed ? null : previous2, next));
        }
      });
      if (this.denied) client.invalidate(this.denied);
      entry = { client, key: key2, leases: 0, timer: null, used: 0 };
      this.entries.set(backend.sessionId, entry);
    }
    entry.client.backend = { ...backend, canonicalRemotePath: backend.canonicalRemotePath || entry.client.backend.canonicalRemotePath };
    entry.leases++;
    entry.used = ++this.clock;
    this.cancel(entry.timer);
    entry.timer = null;
    this.trim();
    let released = false;
    return { client: entry.client, release: () => {
      if (released) return;
      released = true;
      entry.leases--;
      if (this.entries.get(backend.sessionId) !== entry || entry.leases) return;
      entry.timer = this.later(() => this.evict(backend.sessionId, entry), this.idleMs);
      this.trim();
    } };
  }
  trim() {
    while (this.entries.size > this.maxClients) {
      const oldest = [...this.entries].filter(([, entry]) => !entry.leases).sort((a, b) => a[1].used - b[1].used)[0];
      if (!oldest) break;
      this.evict(...oldest);
    }
  }
  evict(id, entry) {
    if (this.entries.get(id) !== entry) return;
    this.identities.set(id, retainKnown(this.identities.get(id), bindingIdentity(entry.client.backend, entry.key, entry.client.state.binding || entry.client.backend.binding)));
    this.entries.delete(id);
    this.cancel(entry.timer);
    entry.client.dispose();
    if (!entry.client.composer.hasContent) {
      this.drafts.delete(entry.key);
      this.identities.delete(id);
    }
  }
  invalidate(error) {
    this.denied = error;
    for (const entry of this.entries.values()) entry.client.invalidate(error);
    for (const draft of this.drafts.values()) draft.clear();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const [id, entry] of this.entries) this.evict(id, entry);
    this.drafts.clear();
    this.identities.clear();
  }
};

// src/client/picker.js
function pickerScrollTop({ scrollTop, height, itemTop, itemHeight }) {
  if (![scrollTop, height, itemTop, itemHeight].every(Number.isFinite) || height <= 0) return scrollTop;
  if (itemTop < scrollTop) return Math.max(0, itemTop);
  if (itemTop + itemHeight > scrollTop + height) return Math.max(0, itemTop + itemHeight - height);
  return scrollTop;
}

// src/client/usage.js
var import_react2 = __toESM(require("react"), 1);

// src/client/usage-model.js
var nonnegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
var label = (value) => typeof value === "string" && value.trim() ? value : null;
function selectedLabel(group, value) {
  return label(group?.options?.find((option) => String(option.value) === String(value))?.name) || label(value);
}
function usageDetails(state) {
  const usage = state.usage || {}, config = state.config || {}, binding = state.binding || {};
  const used = nonnegative(usage.used), capacity = nonnegative(usage.size);
  const percent = used !== null && capacity !== null && capacity > 0 ? used / capacity * 100 : null;
  const amount = nonnegative(usage.cost?.amount);
  const modeId = config.modes?.currentModeId || config.mode;
  return {
    agent: label(binding.agentLabel) || label(binding.agent),
    model: selectedLabel(config.models, config.models?.currentValue ?? config.model),
    modelId: label(config.models?.currentValue ?? config.model),
    reasoning: selectedLabel(config.reasoning, config.reasoning?.currentValue ?? config.reasoningEffort),
    mode: label(config.modes?.availableModes?.find((mode) => mode.id === modeId)?.name) || label(modeId),
    used,
    capacity: capacity > 0 ? capacity : null,
    remaining: percent === null ? null : Math.max(0, capacity - used),
    percent,
    barPercent: percent === null ? 0 : Math.min(100, percent),
    tone: percent >= 100 ? "error" : percent >= 90 ? "warning" : "normal",
    cost: amount === null ? null : { amount, currency: label(usage.cost.currency) },
    status: state.permissions?.length || state.elicitations?.length ? "waiting" : state.running ? "running" : binding.status === "error" ? "error" : "ready",
    connected: state.connected === true,
    pendingTurns: nonnegative(binding.pendingTurns)
  };
}
function formatTokens(value) {
  return nonnegative(value) === null ? "\u2014" : new Intl.NumberFormat(void 0, { maximumFractionDigits: 0 }).format(value);
}
function formatCompactTokens(value) {
  if (nonnegative(value) === null) return "\u2014";
  if (value < 1e3) return formatTokens(value);
  const divisor = value >= 1e9 ? 1e9 : value >= 1e6 ? 1e6 : 1e3;
  const unit = divisor === 1e9 ? "G" : divisor === 1e6 ? "M" : "K";
  return new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(value / divisor) + unit;
}
function usageSummary(details) {
  if (details.used !== null) return { kind: "context", value: `${formatCompactTokens(details.used)} tok` };
  return null;
}
function formatPercentage(value) {
  return nonnegative(value) === null ? "\u2014" : `${new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(value)}%`;
}
function sessionStats(state) {
  const turns = Object.values(state.turns || {});
  const started = nonnegative(state.binding?.startedAt);
  const created = nonnegative(state.binding?.createdAt);
  const startedAt = started !== null && started > 0 ? started : created !== null && created > 0 ? created : null;
  return {
    completed: turns.filter((turn) => turn.status === "completed").length,
    running: turns.filter((turn) => turn.status === "running").length,
    startedAt
  };
}
function formatElapsed(ms) {
  if (nonnegative(ms) === null) return "\u2014";
  const total = Math.round(ms / 1e3);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  return `${minutes}m ${total % 60}s`;
}

// src/client/usage.js
var messages = {
  zh: {
    "usage.title": "\u4E0A\u4E0B\u6587\u4E0E\u7528\u91CF",
    "usage.context": "\u4E0A\u4E0B\u6587",
    "usage.usage": "\u7528\u91CF",
    "usage.model": "\u6A21\u578B",
    "usage.reasoning": "\u601D\u8003\u7EA7\u522B",
    "usage.mode": "\u6743\u9650\u6A21\u5F0F",
    "usage.unreported": "\u5C1A\u672A\u62A5\u544A",
    "stats.title": "\u4F1A\u8BDD\u7EDF\u8BA1",
    "stats.turns": "\u8F6E",
    "stats.elapsed": "\u4F1A\u8BDD\u65F6\u957F",
    "stats.running": "\u8FDB\u884C\u4E2D",
    "usage.contextUsed": "\u5F53\u524D\u4E0A\u4E0B\u6587 token",
    "usage.capacity": "\u4E0A\u4E0B\u6587\u5BB9\u91CF"
  },
  en: {
    "usage.title": "Context & usage",
    "usage.context": "Context",
    "usage.usage": "Usage",
    "usage.model": "Model",
    "usage.reasoning": "Reasoning",
    "usage.mode": "Permission mode",
    "usage.unreported": "Not reported",
    "stats.title": "Session statistics",
    "stats.turns": "turns",
    "stats.elapsed": "Session age",
    "stats.running": "Running",
    "usage.contextUsed": "Current context tokens",
    "usage.capacity": "Context capacity"
  }
};
function dismissUsagePopover(event, open, close) {
  if (!open || event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  close();
}
var RADIUS = 5.5;
var CIRCUMFERENCE = 2 * Math.PI * RADIUS;
function UsageMeter({ state }) {
  const t = useT(), details = usageDetails(state);
  const [open, setOpen] = import_react2.default.useState(false);
  import_react2.default.useEffect(() => {
    if (details.percent === null) setOpen(false);
  }, [details.percent]);
  if (details.percent === null) return null;
  const reading = formatPercentage(details.percent);
  const row = (key2, value) => h("div", { className: "rssh-meter-row", key: key2 }, h("dt", null, t(key2)), h("dd", null, value || t("usage.unreported")));
  return h(
    ui.Menu,
    {
      open,
      onClose: () => setOpen(false),
      autoFocus: false,
      role: "dialog",
      align: "end",
      className: "rssh-meter-panel",
      "aria-label": t("usage.title"),
      anchor: h(
        "button",
        {
          type: "button",
          className: "rssh-meter-trigger",
          "data-tone": details.tone,
          "aria-label": `${t("usage.context")} ${reading}`,
          onKeyDown: (event) => dismissUsagePopover(event, open, () => setOpen(false)),
          onClick: () => setOpen((value) => !value)
        },
        h(
          "svg",
          { viewBox: "0 0 14 14", width: 14, height: 14, "aria-hidden": true },
          h("circle", { className: "rssh-meter-track", cx: 7, cy: 7, r: RADIUS }),
          h("circle", {
            className: "rssh-meter-fill",
            cx: 7,
            cy: 7,
            r: RADIUS,
            strokeDasharray: `${CIRCUMFERENCE * details.barPercent / 100} ${CIRCUMFERENCE}`,
            transform: "rotate(-90 7 7)"
          })
        ),
        h("span", { className: "rssh-meter-reading" }, reading)
      )
    },
    h(
      "section",
      { className: "rssh-meter-card", "data-tone": details.tone },
      h(
        "div",
        { className: "rssh-meter-header" },
        h("span", { className: "rssh-meter-headline" }, t("usage.context")),
        h("span", { className: "rssh-meter-percent" }, reading),
        h("span", { className: "rssh-meter-figures" }, `~${formatTokens(details.used)} / ${formatTokens(details.capacity)}`)
      ),
      h("div", { className: "rssh-meter-bar" }, h("div", { className: "rssh-meter-segment", style: { width: `${details.barPercent}%` } })),
      h(
        "dl",
        { className: "rssh-meter-rows" },
        row("usage.model", details.model),
        row("usage.reasoning", details.reasoning),
        row("usage.mode", details.mode)
      )
    )
  );
}
function StatsIcon() {
  return h(
    "svg",
    { className: "rssh-stats-icon", width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    h("path", { d: "M3 12.5a6 6 0 1 1 10 0M8 8l3-3" }),
    h("circle", { cx: 8, cy: 8, r: 1 })
  );
}
function UsageIcon() {
  return h(
    "svg",
    { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    h("ellipse", { cx: 8, cy: 3.5, rx: 5.5, ry: 2 }),
    h("path", { d: "M2.5 3.5v9c0 2.7 11 2.7 11 0v-9M2.5 8c0 2.7 11 2.7 11 0" })
  );
}
function UsagePill({ state }) {
  const t = useT(), details = usageDetails(state), summary = usageSummary(details);
  const [open, setOpen] = import_react2.default.useState(false);
  const available = summary !== null;
  import_react2.default.useEffect(() => {
    if (!available) setOpen(false);
  }, [available]);
  if (!summary) return null;
  const reading = `${t("usage.context")} ${summary.value}`;
  const row = (key2, value) => h("div", { className: "rssh-meter-row", key: key2 }, h("dt", null, t(key2)), h("dd", null, value));
  return h(
    ui.Menu,
    {
      open,
      onClose: () => setOpen(false),
      autoFocus: false,
      role: "dialog",
      align: "end",
      className: "rssh-meter-panel",
      "aria-label": t("usage.usage"),
      anchor: h(
        "button",
        { type: "button", className: "rssh-meter-trigger rssh-usage-trigger", title: reading, "aria-label": `${t("usage.usage")}: ${reading}`, onKeyDown: (event) => dismissUsagePopover(event, open, () => setOpen(false)), onClick: () => setOpen((value) => !value) },
        h(UsageIcon),
        h("span", { className: "rssh-meter-reading" }, reading)
      )
    },
    h(
      "section",
      { className: "rssh-meter-card" },
      h("div", { className: "rssh-meter-header" }, h("span", { className: "rssh-meter-headline" }, t("usage.usage"))),
      h(
        "dl",
        { className: "rssh-meter-rows" },
        row("usage.contextUsed", details.used === null ? t("usage.unreported") : formatTokens(details.used)),
        row("usage.capacity", details.capacity === null ? t("usage.unreported") : formatTokens(details.capacity))
      )
    )
  );
}
function SessionStatsPill({ state }) {
  const t = useT();
  const [now, setNow] = import_react2.default.useState(() => Date.now());
  import_react2.default.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 3e4);
    return () => clearInterval(id);
  }, []);
  const stats = sessionStats(state);
  const [open, setOpen] = import_react2.default.useState(false);
  if (stats.completed === 0 && stats.running === 0) return null;
  const elapsedMs = stats.startedAt == null ? null : Math.max(0, now - stats.startedAt);
  const turns = `${stats.completed} ${t("stats.turns")}`;
  const elapsed = formatElapsed(elapsedMs);
  const reading = stats.running > 0 ? `${turns} \xB7 ${t("stats.running")}` : turns;
  const row = (key2, value) => h("div", { className: "rssh-meter-row", key: key2 }, h("dt", null, t(key2)), h("dd", null, value || t("usage.unreported")));
  return h(
    ui.Menu,
    {
      open,
      onClose: () => setOpen(false),
      autoFocus: false,
      role: "dialog",
      align: "end",
      className: "rssh-meter-panel",
      "aria-label": t("stats.title"),
      anchor: h(
        "button",
        {
          type: "button",
          className: "rssh-meter-trigger rssh-stats-trigger",
          title: `${t("stats.title")}: ${reading}`,
          "aria-label": `${t("stats.title")}: ${reading}`,
          onKeyDown: (event) => dismissUsagePopover(event, open, () => setOpen(false)),
          onClick: () => setOpen((value) => !value)
        },
        h(StatsIcon),
        h("span", { className: "rssh-meter-reading" }, reading)
      )
    },
    h(
      "section",
      { className: "rssh-meter-card" },
      h(
        "div",
        { className: "rssh-meter-header" },
        h("span", { className: "rssh-meter-headline" }, t("stats.title")),
        stats.running > 0 ? h("span", { className: "rssh-meter-percent" }, t("stats.running")) : null
      ),
      h(
        "dl",
        { className: "rssh-meter-rows" },
        row("stats.turns", turns),
        row("stats.elapsed", elapsed)
      )
    )
  );
}

// src/client/composer-controls.js
var import_react3 = __toESM(require("react"), 1);

// src/client/composer-controls-model.js
function composerControls({ running, draft = "", attachments = [], sending = false, readingFiles = false, busy = "", status }) {
  const empty = !draft.trim() && !attachments.length;
  const primaryStops = !!running && !sending && empty;
  return {
    primaryStops,
    independentStop: !!running && !!sending,
    stopping: busy === "acpCancel",
    primaryDisabled: primaryStops ? !!busy : sending || readingFiles || !!busy || empty || status === "error",
    label: primaryStops ? busy === "acpCancel" ? "acp.stopping" : "acp.stop" : sending ? "acp.sending" : running ? "acp.steer" : "acp.send"
  };
}

// src/client/composer-controls.js
function PermissionIcon() {
  return h(
    "svg",
    { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    h("path", { d: "M8 1.5 13 3v4c0 3-2 5.5-5 7-3-1.5-5-4-5-7V3l5-1.5Z" }),
    h("path", { d: "m5.5 7.5 1.5 1.5 3.5-3.5" })
  );
}
function AttachmentButton({ disabled, onClick }) {
  const t = useT();
  return h(
    ui.Button,
    { variant: "ghost", className: "rssh-composer-add", disabled, onClick, title: t("acp.addAttachment"), "aria-label": t("acp.addAttachment") },
    h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", "aria-hidden": true }, h("path", { d: "M8 2.5v11M2.5 8h11" }))
  );
}
function StopIcon() {
  return h(
    "svg",
    { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": true },
    h("rect", { x: 3, y: 3, width: 10, height: 10, rx: 3, fill: "currentColor" })
  );
}
function SendIcon() {
  return h(
    "svg",
    { viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", "aria-hidden": true },
    h("path", { d: "M8 13.5V2.5M3 7.5l5-5 5 5", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" })
  );
}
function Spinner() {
  return h(
    "svg",
    { className: "rssh-composer-spinner", viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": true },
    h("circle", { cx: 8, cy: 8, r: 6, fill: "none", stroke: "currentColor", strokeOpacity: 0.35, strokeWidth: 2 }),
    h("path", { d: "M8 2a6 6 0 0 1 6 6", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" })
  );
}
function ComposerControls(props) {
  const t = useT(), controls = composerControls(props);
  const keepFocus = (event) => {
    if (event.button === 0) event.preventDefault();
  };
  const stopLabel = t(controls.stopping ? "acp.stopping" : "acp.stop");
  return h(
    import_react3.default.Fragment,
    null,
    controls.independentStop ? h(
      ui.Button,
      {
        variant: "primary",
        className: "ra-acp-send",
        disabled: !!props.busy,
        title: stopLabel,
        "aria-label": stopLabel,
        "aria-busy": controls.stopping,
        onMouseDown: keepFocus,
        onClick: props.onStop
      },
      h(controls.stopping ? Spinner : StopIcon)
    ) : null,
    h(
      ui.Button,
      {
        variant: "primary",
        className: "ra-acp-send",
        disabled: controls.primaryDisabled,
        title: t(controls.label),
        "aria-label": t(controls.label),
        "aria-busy": props.sending || controls.primaryStops && controls.stopping,
        "data-pending": props.sending || controls.primaryStops && controls.stopping ? "" : void 0,
        onMouseDown: keepFocus,
        onClick: controls.primaryStops ? props.onStop : props.onSend
      },
      h(controls.primaryStops ? controls.stopping ? Spinner : StopIcon : props.sending ? Spinner : SendIcon)
    )
  );
}

// src/client/presentation.js
function acpBlockLabels(t) {
  var codeToolbar = {
    codeLabel: t("acp.code"),
    wrapLabel: t("acp.wrap"),
    unwrapLabel: t("acp.unwrap")
  };
  var collapseAria = t("acp.collapseAria");
  var expandAria = function(count) {
    return t("acp.expandAria", { count });
  };
  var collapse = t("acp.collapse");
  var expand = function(count) {
    return t("acp.expand", { count });
  };
  return {
    markdown: {
      code: {
        copyLabel: t("acp.copy"),
        copiedLabel: t("acp.copied"),
        toolbarLabels: codeToolbar
      },
      footnotes: t("acp.footnotes")
    },
    diff: {
      codeLabel: codeToolbar.codeLabel,
      wrapLabel: codeToolbar.wrapLabel,
      unwrapLabel: codeToolbar.unwrapLabel,
      copy: t("acp.copy"),
      copied: t("acp.copied"),
      collapseAria,
      expandAria,
      collapse,
      expand
    },
    read: {
      codeLabel: codeToolbar.codeLabel,
      wrapLabel: codeToolbar.wrapLabel,
      unwrapLabel: codeToolbar.unwrapLabel,
      window: function(shown, total) {
        return t("acp.readWindow", { shown, total });
      },
      copy: t("acp.copy"),
      copied: t("acp.copied"),
      collapseAria,
      expandAria,
      collapse,
      expand
    },
    terminal: {
      commandLine: function(n) {
        return t("acp.commandLine", { n });
      },
      signal: function(signal) {
        return t("acp.signal", { signal });
      },
      exitCode: function(code) {
        return t("acp.exitCode", { code });
      },
      noExitCode: t("acp.noExitCode"),
      running: t("acp.running"),
      failed: t("acp.failed"),
      done: t("acp.done"),
      copy: t("acp.copy"),
      copied: t("acp.copied"),
      noOutput: t("acp.noOutput"),
      collapseAria,
      collapse,
      expandAria,
      expand
    }
  };
}
function acpJsonText(value, max) {
  if (value === void 0) return "";
  try {
    var text2 = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (!text2) return "";
    var limit = max || 4e3;
    return text2.length > limit ? text2.slice(0, limit) + "\u2026" : text2;
  } catch (e) {
    return String(value);
  }
}
function acpNativeName(native) {
  if (typeof native === "string") return native;
  if (native && typeof native === "object") {
    return String(native.sessionUpdate || native.sessionUpdateType || native.type || native.name || "");
  }
  return "";
}
function acpContentText(value) {
  if (value === void 0 || value === null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(acpContentText).filter(Boolean).join("\n\n");
  }
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (value.content !== void 0) return acpContentText(value.content);
    if (value.message !== void 0) return acpContentText(value.message);
    return acpJsonText(value, 4e3);
  }
  return String(value);
}
function acpNormalizeExit(exitStatus) {
  if (exitStatus === void 0 || exitStatus === null || exitStatus === "") {
    return { exitCode: void 0, signal: void 0, running: true };
  }
  if (typeof exitStatus === "number") return { exitCode: exitStatus, signal: void 0, running: false };
  if (typeof exitStatus === "string") {
    if (/^\d+$/.test(exitStatus)) return { exitCode: Number(exitStatus), signal: void 0, running: false };
    if (exitStatus === "running") return { exitCode: void 0, signal: void 0, running: true };
    return { exitCode: void 0, signal: exitStatus, running: false };
  }
  if (typeof exitStatus === "object") {
    var code = exitStatus.exitCode !== void 0 ? exitStatus.exitCode : exitStatus.exit_code !== void 0 ? exitStatus.exit_code : exitStatus.code;
    if (code !== void 0 && code !== null) {
      return { exitCode: Number(code), signal: exitStatus.signal, running: false };
    }
    if (exitStatus.signal) return { exitCode: void 0, signal: String(exitStatus.signal), running: false };
    return { exitCode: void 0, signal: void 0, running: exitStatus.running === true };
  }
  return {};
}
function acpNativeState(state) {
  var raw = state;
  if (raw && typeof raw === "object") raw = raw.type || raw.state || raw.status || "";
  var value = String(raw || "").toLowerCase();
  if (value === "running" || value === "in_progress" || value === "working") {
    return { dot: "ongoing", key: "acp.stateRunning", tone: "neutral" };
  }
  if (value === "requires_action" || value === "requires-action" || value === "waiting" || value === "pending") {
    return { dot: "warning", key: "acp.stateRequiresAction", tone: "warning" };
  }
  if (value === "idle" || value === "done" || value === "completed") {
    return { dot: value === "done" || value === "completed" ? "done" : "idle", key: "acp.stateIdle", tone: "neutral" };
  }
  if (value === "failed" || value === "error") {
    return { dot: "warning", key: "acp.toolFailed", tone: "warning" };
  }
  return { dot: "idle", key: "acp.stateUnknown", tone: "neutral" };
}
function acpSubagentFromTool(tool) {
  var t = tool || {};
  var raw = t.rawInput && typeof t.rawInput === "object" && !t.rawInput.truncated ? t.rawInput : {};
  var out = t.rawOutput && typeof t.rawOutput === "object" && !t.rawOutput.truncated ? t.rawOutput : {};
  var sub = t.subagent && typeof t.subagent === "object" ? t.subagent : {};
  return {
    toolCallId: String(t.toolCallId || ""),
    agentId: String(sub.agentId || sub.agent || raw.subagent_type || raw.subagentType || raw.agent_id || raw.agentId || raw.agent || ""),
    sessionId: String(sub.sessionId || out.sessionId || raw.sessionId || ""),
    title: String(sub.title || t.title || t.name || ""),
    description: String(sub.description || raw.description || t.title || t.name || ""),
    background: sub.background === true || raw.run_in_background === true || raw.background === true || out.background === true,
    outputFile: String(sub.outputFile || out.outputFile || out.output_file || raw.outputFile || raw.output_file || ""),
    state: sub.state !== void 0 ? sub.state : t.status,
    summary: String(sub.summary || (typeof t.output === "string" ? t.output : "")),
    native: sub.native !== void 0 ? sub.native : t.native,
    nativeMeta: sub.nativeMeta !== void 0 ? sub.nativeMeta : t.nativeMeta
  };
}
function acpItemPayload(item) {
  return item && (item.type === "tool" ? item.tool : item.type === "subagent" ? item.subagent : item) || {};
}
function acpItemSession(item) {
  var data = acpItemPayload(item);
  return String(item && item.sessionId || data.sessionId || "");
}
function acpItemId(item) {
  if (!item) return "";
  var data = acpItemPayload(item);
  var local = item.type === "tool" ? data.toolCallId || item.key : item.type === "subagent" ? item._key || data._key || data.taskId || data.toolUseId || data.agentId || item.key : item.key || item.id || item.messageId;
  return local == null || local === "" ? "" : JSON.stringify([acpItemSession(item), String(local)]);
}
function acpItemParent(item) {
  if (!item) return "";
  var data = acpItemPayload(item);
  var parent = item.parentToolCallId || data.parentToolCallId;
  if (!parent) return "";
  return JSON.stringify([String(item.parentSessionId || data.parentSessionId || acpItemSession(item)), String(parent)]);
}
function acpChildrenFor(item, childMap, ancestors) {
  var id = acpItemId(item);
  if (!id || !childMap) return [];
  var seen = ancestors || [];
  return (childMap[id] || []).filter(function(child) {
    var cid = acpItemId(child);
    return cid && cid !== id && seen.indexOf(cid) < 0;
  });
}
function acpBuildChildMap(items) {
  var map = /* @__PURE__ */ Object.create(null), known = /* @__PURE__ */ Object.create(null), parents = /* @__PURE__ */ Object.create(null), fallbacks = /* @__PURE__ */ Object.create(null);
  var byId = /* @__PURE__ */ Object.create(null), sessions = /* @__PURE__ */ Object.create(null), childSources = /* @__PURE__ */ Object.create(null), owners = /* @__PURE__ */ Object.create(null);
  function fallback(item, reason) {
    var data = acpItemPayload(item);
    fallbacks[acpItemId(item)] = {
      reason,
      sessionId: acpItemSession(item),
      parentToolCallId: String(item.parentToolCallId || data.parentToolCallId || ""),
      rootSessionId: String(item.rootSessionId || data.rootSessionId || "")
    };
  }
  items.forEach(function(item) {
    var id = acpItemId(item), sid = acpItemSession(item);
    if (!id) return;
    (byId[id] || (byId[id] = [])).push(item);
    if (sid) sessions[sid] = true;
    var data = acpItemPayload(item), root = item.rootSessionId || data.rootSessionId;
    if (sid && root && String(root) !== sid) childSources[sid] = true;
  });
  Object.keys(byId).forEach(function(id) {
    known[id] = byId[id].length === 1;
    if (!known[id]) byId[id].forEach(function(item) {
      fallback(item, "ambiguous");
    });
  });
  items.forEach(function(item) {
    var data = acpItemPayload(item);
    var sub = item.type === "subagent" ? data : item.type === "tool" ? data.subagent : null;
    var childSession = sub && sub.sessionId;
    var id = acpItemId(item);
    var actualChild = childSession && (String(childSession) !== acpItemSession(item) || childSources[childSession]);
    if (actualChild && sessions[childSession] && known[id]) {
      var list3 = owners[childSession] || (owners[childSession] = []);
      if (list3.indexOf(id) < 0) list3.push(id);
    }
  });
  items.forEach(function(item) {
    var id = acpItemId(item), data = acpItemPayload(item), sid = acpItemSession(item);
    if (!id || !known[id]) return;
    var explicit = acpItemParent(item), root = String(item.rootSessionId || data.rootSessionId || "");
    var parent = explicit;
    if (explicit && !byId[explicit] && root && root !== sid && !(item.parentSessionId || data.parentSessionId)) {
      var rootParent = JSON.stringify([root, String(item.parentToolCallId || data.parentToolCallId)]);
      if (byId[rootParent]) parent = rootParent;
    }
    if (explicit) {
      if (parent !== id && known[parent]) parents[id] = parent;
      else fallback(item, parent === id ? "cycle" : byId[parent] ? "ambiguous" : "missing-parent");
      return;
    }
    var candidates = (owners[sid] || []).filter(function(owner) {
      return owner !== id;
    });
    if (candidates.length === 1) parents[id] = candidates[0];
    else if (candidates.length > 1) fallback(item, "ambiguous");
    else if (root && root !== sid) fallback(item, "unassigned-session");
  });
  var visited = /* @__PURE__ */ Object.create(null);
  Object.keys(parents).forEach(function(start) {
    var path = [], positions = /* @__PURE__ */ Object.create(null), current = start;
    while (parents[current] && !visited[current]) {
      if (positions[current] !== void 0) {
        path.slice(positions[current]).forEach(function(id) {
          delete parents[id];
          fallback(byId[id][0], "cycle");
        });
        break;
      }
      positions[current] = path.length;
      path.push(current);
      current = parents[current];
    }
    path.forEach(function(id) {
      visited[id] = true;
    });
  });
  items.forEach(function(item) {
    var parent = parents[acpItemId(item)];
    if (parent) (map[parent] || (map[parent] = [])).push(item);
  });
  return { map, known, parents, fallbacks };
}
function acpCommandName(command) {
  return String(command && command.name || "").replace(/^\/+/, "");
}
function acpCommandGroup(command) {
  var group = String(command && (command.group || command.category || command.kind || command.source) || "").trim();
  if (group) return group;
  var name = acpCommandName(command).toLowerCase();
  var desc = String(command && command.description || "");
  if (name === "skills" || name.indexOf("skill") === 0 || /skill/i.test(desc)) return "Skills";
  return "Commands";
}
function acpCommandGroups(commands, query) {
  var needle = String(query || "").trim().toLowerCase();
  var buckets = {};
  var order = [];
  for (var i = 0; i < commands.length; i++) {
    var command = commands[i] || {};
    var name = acpCommandName(command);
    if (!name) continue;
    var hint = command.input && command.input.hint ? String(command.input.hint) : "";
    var haystack = (name + " " + String(command.description || "") + " " + hint).toLowerCase();
    if (needle && haystack.indexOf(needle) < 0) continue;
    var group = acpCommandGroup(command);
    if (!buckets[group]) {
      buckets[group] = [];
      order.push(group);
    }
    buckets[group].push(command);
  }
  order.sort(function(a, b) {
    var rank = function(g) {
      return g === "Skills" ? 0 : g === "Commands" ? 1 : 2;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  return order.map(function(group2) {
    return { name: group2, items: buckets[group2] };
  });
}
function acpQuestionField(input) {
  var field3 = Object.assign({}, input || {});
  var choices2 = field3.oneOf || field3.anyOf;
  if (!field3.enum && Array.isArray(choices2) && choices2.every(function(choice) {
    return choice.const !== void 0;
  })) {
    field3.enum = choices2.map(function(choice) {
      return choice.const;
    });
    field3.enumNames = choices2.map(function(choice) {
      return choice.title || String(choice.const);
    });
    field3.enumDescriptions = choices2.map(function(choice) {
      return choice.description || "";
    });
  }
  if (!field3.type && Array.isArray(field3.enum) && field3.enum.length) {
    var inferred = typeof field3.enum[0];
    if (field3.enum.every(function(value) {
      return typeof value === inferred;
    })) field3.type = inferred;
  }
  if (field3.type === "array" && field3.items) field3.items = acpQuestionField(field3.items);
  return field3;
}
function acpQuestionAnswersValid(schema, answers) {
  var fields = schema.properties || {};
  if ((schema.required || []).some(function(key2) {
    return answers[key2] === void 0 || answers[key2] === "";
  })) return false;
  return Object.keys(answers).every(function(key2) {
    var field3 = acpQuestionField(fields[key2]);
    var value = answers[key2];
    if (value === void 0) return true;
    if (field3.enum && field3.enum.indexOf(value) < 0) return false;
    if (field3.type === "boolean") return typeof value === "boolean";
    if (field3.type === "string") return typeof value === "string" && (field3.minLength == null || value.length >= field3.minLength) && (field3.maxLength == null || value.length <= field3.maxLength);
    if (field3.type === "integer" || field3.type === "number") return typeof value === "number" && Number.isFinite(value) && (field3.type !== "integer" || Number.isInteger(value)) && (field3.minimum == null || value >= field3.minimum) && (field3.maximum == null || value <= field3.maximum);
    if (field3.type === "array") return Array.isArray(value) && (field3.minItems == null || value.length >= field3.minItems) && (field3.maxItems == null || value.length <= field3.maxItems) && (!field3.uniqueItems || new Set(value).size === value.length) && !!field3.items && Array.isArray(field3.items.enum) && value.every(function(item) {
      return field3.items.enum.indexOf(item) >= 0;
    });
    return false;
  });
}

// src/client/cards.js
var import_react6 = __toESM(require("react"), 1);

// src/client/disclosure.js
var import_react4 = __toESM(require("react"), 1);
function FlowIcon({ kind = "tool" }) {
  const paths = { tool: "m5 4-3 4 3 4m6-8 3 4-3 4M9 2 7 14", agent: "M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M1 14v-2a5 5 0 0 1 10 0v2m1-11a3 3 0 0 1 0 6m1 2a4 4 0 0 1 2 3", state: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2m-3 6 2 2 4-4", plan: "m2 4 1 1 2-2m2 1h7M2 8h3m2 0h7M2 12h3m2 0h7", message: "M2 2h12v9H6l-4 3V2", native: "M5 2H2v12h3m6-12h3v12h-3M7 5 5 8l2 3m2-6 2 3-2 3" };
  return h("svg", { className: "rssh-flow-icon", width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, h("path", { d: paths[kind] || paths.tool }));
}
function DisclosureLeading({ icon }) {
  return h(
    "span",
    { className: "rssh-disclosure-leading", "aria-hidden": true },
    h("span", { className: "rssh-disclosure-icon" }, icon),
    h(
      "svg",
      { className: "rssh-disclosure-chevron", width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5 },
      h("path", { d: "m4 6 4 4 4-4" })
    )
  );
}
function requestReadingIntent(anchor, afterLayout = false) {
  if (anchor) anchor.dispatchEvent(new CustomEvent("rssh:reading-intent", { bubbles: true, detail: { anchor, afterLayout } }));
}
function boundedProcessScroll(metrics, { open, wasOpen, flat, scrollBody, wasBounded, running, following }) {
  if (!open || flat || !scrollBody) return { top: null, following: false };
  const { scrollTop, scrollHeight, clientHeight } = metrics;
  if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite)) return { top: null, following: false };
  const tail = Math.max(0, scrollHeight - clientHeight);
  if (!wasOpen) return { top: running ? tail : 0, following: !!running };
  if (!wasBounded) return { top: null, following: false };
  return { top: running && following ? tail : null, following: !!running && !!following };
}
function processScrollFollowsTail({ scrollTop, scrollHeight, clientHeight }, threshold = 32) {
  return [scrollTop, scrollHeight, clientHeight].every(Number.isFinite) && Math.max(0, scrollHeight - clientHeight) - Math.max(0, scrollTop) <= threshold;
}
function processScrollUpdate(metrics, { following, intent = 0, previousTop, pointer = false }) {
  const delta = metrics.scrollTop - previousTop;
  if (!Number.isFinite(delta) || intent < 0 || delta < 0) return false;
  const downward = intent > 0 || pointer && delta > 0;
  return (following || downward) && processScrollFollowsTail(metrics);
}
function ownedDisclosure({ title, summary, icon, running = false, failed = false, status, children, defaultOpen = false, open: controlledOpen, onOpenChange, onRead, className = "", secondary = false, scrollBody = false, flat = false, scrollRunning = running }) {
  const [localOpen, setOpen] = import_react4.default.useState(defaultOpen);
  const open = controlledOpen === void 0 ? localOpen : controlledOpen;
  const [mounted, setMounted] = import_react4.default.useState(open);
  const id = import_react4.default.useId(), trigger = import_react4.default.useRef(null), bodyRef = import_react4.default.useRef(null);
  const bounded = scrollBody && !flat, following = import_react4.default.useRef(false), expectedScroll = import_react4.default.useRef(null);
  const previous = import_react4.default.useRef({ open: false, bounded: false }), lastTop = import_react4.default.useRef(0);
  const scrollIntent = import_react4.default.useRef(0), pointerScroll = import_react4.default.useRef(false), touchY = import_react4.default.useRef(null);
  function writeBodyScroll(top) {
    const body = bodyRef.current;
    if (body && top !== null && Math.abs(body.scrollTop - top) > 1) {
      expectedScroll.current = top;
      body.scrollTop = top;
      lastTop.current = body.scrollTop;
    }
  }
  import_react4.default.useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { open, bounded };
    const body = bodyRef.current;
    if (!body) return;
    if (!before.open || !before.bounded) {
      lastTop.current = body.scrollTop;
      scrollIntent.current = 0;
      pointerScroll.current = false;
      touchY.current = null;
    }
    const result = boundedProcessScroll(body, { open, wasOpen: before.open, flat, scrollBody, wasBounded: before.bounded, running: scrollRunning, following: following.current });
    following.current = result.following;
    writeBodyScroll(result.top);
    if (!open || !bounded) expectedScroll.current = null;
  }, [open, flat, scrollBody, scrollRunning, children]);
  import_react4.default.useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || !open || !bounded || typeof ResizeObserver === "undefined") return;
    let live = true;
    const observer = new ResizeObserver(() => {
      if (!live || bodyRef.current !== body) return;
      const result = boundedProcessScroll(body, { open: true, wasOpen: true, flat: false, scrollBody: true, wasBounded: true, running: scrollRunning, following: following.current });
      writeBodyScroll(result.top);
    });
    observer.observe(body);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [open, bounded, scrollRunning]);
  import_react4.default.useLayoutEffect(() => {
    if (open) setMounted(true);
    requestReadingIntent(trigger.current, true);
  }, [open, flat]);
  import_react4.default.useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || !open || !bounded) return;
    const stop = () => {
      scrollIntent.current = 0;
      pointerScroll.current = false;
    };
    const pointerEnd = () => {
      pointerScroll.current = false;
    };
    body.addEventListener("scrollend", stop);
    body.ownerDocument.addEventListener("pointerup", pointerEnd, true);
    body.ownerDocument.addEventListener("pointercancel", pointerEnd, true);
    return () => {
      stop();
      body.removeEventListener("scrollend", stop);
      body.ownerDocument.removeEventListener("pointerup", pointerEnd, true);
      body.ownerDocument.removeEventListener("pointercancel", pointerEnd, true);
    };
  }, [open, bounded]);
  function read(event) {
    if (event.isTrusted) {
      following.current = false;
      scrollIntent.current = 0;
      pointerScroll.current = false;
      if (onRead && bounded) requestReadingIntent(bodyRef.current);
      onRead?.(event);
    }
  }
  function bodyScroll(event) {
    if (event.target !== event.currentTarget) return;
    const body = event.currentTarget, expected = expectedScroll.current, before = lastTop.current;
    expectedScroll.current = null;
    lastTop.current = body.scrollTop;
    if (expected !== null && Math.abs(body.scrollTop - expected) <= 1) return;
    following.current = processScrollUpdate(body, { following: following.current, intent: scrollIntent.current, previousTop: before, pointer: pointerScroll.current });
  }
  function acceptsGesture(event, direction) {
    if (!bounded || !event.isTrusted) return false;
    for (let node = event.target; node && node !== event.currentTarget; node = node.parentElement) {
      if (node.nodeType !== 1 || node.scrollHeight <= node.clientHeight + 1) continue;
      const style = globalThis.getComputedStyle(node);
      if (!["auto", "scroll"].includes(style.overflowY)) continue;
      if (["contain", "none"].includes(style.overscrollBehaviorY) || (direction < 0 ? node.scrollTop > 0 : node.scrollHeight - node.clientHeight - node.scrollTop > 1)) return false;
    }
    return true;
  }
  function setScrollIntent(event, direction, alreadyRead = false) {
    if (!direction || !acceptsGesture(event, direction)) return;
    if (!alreadyRead) read(event);
    scrollIntent.current = direction;
    if (direction > 0 && processScrollFollowsTail(event.currentTarget)) following.current = true;
  }
  function bodyWheel(event) {
    if (!event.ctrlKey && !event.shiftKey && event.deltaY) {
      read(event);
      setScrollIntent(event, Math.sign(event.deltaY), true);
    }
  }
  function bodyKeyDown(event) {
    read(event);
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName) || event.target?.isContentEditable) return;
    const direction = ["ArrowUp", "PageUp", "Home"].includes(event.key) ? -1 : ["ArrowDown", "PageDown", "End"].includes(event.key) ? 1 : event.key === " " ? event.shiftKey ? -1 : 1 : 0;
    setScrollIntent(event, direction, true);
  }
  function bodyPointerDown(event) {
    if (event.button !== 0) return;
    read(event);
    const x = event.nativeEvent?.offsetX ?? event.offsetX, body = event.currentTarget;
    pointerScroll.current = bounded && event.isTrusted && event.pointerType !== "touch" && event.target === body && Number.isFinite(x) && (x >= body.clientWidth || x < body.clientLeft);
  }
  function bodyTouchStart(event) {
    read(event);
    touchY.current = event.isTrusted && event.touches.length === 1 ? event.touches[0].clientY : null;
  }
  function bodyTouchMove(event) {
    const before = touchY.current, next = event.touches.length === 1 ? event.touches[0].clientY : null;
    touchY.current = next;
    if (before !== null && next !== null && before !== next) {
      read(event);
      setScrollIntent(event, Math.sign(before - next), true);
    }
  }
  function toggle(event) {
    requestReadingIntent(event.currentTarget);
    const next = !open;
    if (controlledOpen === void 0) setOpen(next);
    if (onOpenChange) onOpenChange(next);
  }
  return h(
    "section",
    {
      className: "rssh-flow " + className,
      "data-running": running ? "" : void 0,
      "data-failed": failed ? "" : void 0,
      "data-open": open ? "" : void 0,
      "data-summary": summary ? "" : void 0,
      "data-secondary": secondary ? "" : void 0,
      "data-flat": flat ? "" : void 0,
      "data-scroll-body": bounded ? "" : void 0,
      onKeyDown: (event) => {
        if (open && event.key === "Tab") read(event);
      }
    },
    h(
      "button",
      { ref: trigger, hidden: flat, type: "button", className: "rssh-flow-toggle", "aria-expanded": open, "aria-controls": id, onClick: toggle },
      h(DisclosureLeading, { icon: icon || h(FlowIcon) }),
      h("span", { className: "rssh-flow-title", title }, title),
      summary ? h(import_react4.default.Fragment, null, h("span", { className: "rssh-flow-separator", "aria-hidden": true }), h("span", { className: "rssh-flow-summary", title: summary }, summary)) : null,
      status ? h("span", { className: failed ? "rssh-flow-failure" : "rssh-flow-status", "data-active": running ? "" : void 0 }, status) : running ? h("span", { className: "rssh-flow-active-mark", "aria-hidden": true }) : null
    ),
    h(
      "div",
      {
        ref: bodyRef,
        id,
        hidden: !open,
        className: "rssh-flow-body",
        role: bounded ? "region" : void 0,
        tabIndex: bounded ? 0 : void 0,
        "aria-label": bounded ? title : void 0,
        onScroll: bounded ? bodyScroll : void 0,
        onWheel: bodyWheel,
        onTouchStart: bodyTouchStart,
        onTouchMove: bodyTouchMove,
        onTouchEnd: () => {
          touchY.current = null;
        },
        onTouchCancel: (event) => {
          touchY.current = null;
          read(event);
        },
        onPointerDown: bodyPointerDown,
        onClick: read,
        onKeyDown: bodyKeyDown
      },
      open || mounted ? typeof children === "function" ? children() : children : null
    )
  );
}

// src/client/tool-model.js
function fullPayloadText(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
function rawDetailEntries(payload2 = {}) {
  const entries = [];
  for (const key2 of ["rawInput", "rawOutput", "native", "sessionUpdate", "nativeMeta", "content", "diffs", "terminals", "attachments", "event", "summary", "description"]) {
    if (payload2[key2] !== void 0 && payload2[key2] !== null && payload2[key2] !== "") entries.push({ key: key2, value: payload2[key2] });
  }
  if (payload2.output !== void 0 && payload2.output !== null && payload2.output !== "") entries.push({ key: "output", value: payload2.output });
  const identity = Object.fromEntries(["agentId", "sessionId", "taskId", "toolUseId", "toolCallId", "turnId", "parentToolCallId"].filter((key2) => payload2[key2] != null).map((key2) => [key2, payload2[key2]]));
  if (Object.keys(identity).length) entries.push({ key: "identity", value: identity });
  if (payload2.subagent) entries.push({ key: "subagent", value: payload2.subagent });
  return entries;
}
var firstLine = (value) => String(value || "").split(/\r?\n/, 1)[0].trim();
function processRowSummary(summary, showProcessSummary, failed, error) {
  if (failed && error) return firstLine(error);
  return showProcessSummary === false ? void 0 : firstLine(summary);
}
function toolRowStatus(model, tool = {}) {
  return model.failed ? "acp.toolFailed" : model.running ? "acp.toolRunning" : tool.status === "completed" ? void 0 : "acp.toolPending";
}
function toolFlowModel(tool = {}) {
  const content = Array.isArray(tool.content) ? tool.content : [];
  const diffs = Array.isArray(tool.diffs) && tool.diffs.length ? tool.diffs : content.filter((block) => block?.type === "diff");
  const terminals = Array.isArray(tool.terminals) && tool.terminals.length ? tool.terminals : content.filter((block) => block?.type === "terminal");
  const locations = Array.isArray(tool.locations) ? tool.locations : [];
  const raw = tool.rawInput;
  const command = typeof raw === "string" ? raw : raw && typeof raw === "object" && !raw.truncated ? String(raw.command || raw.cmd || raw.command_line || raw.commandLine || "") : "";
  const contentOutput = acpContentText(content.filter((block) => block?.type !== "diff" && block?.type !== "terminal"));
  const suppliedOutput = typeof tool.output === "string" ? tool.output : tool.output != null ? fullPayloadText(tool.output) : "";
  const output = suppliedOutput || contentOutput;
  const textOutputs = [...new Set([suppliedOutput, contentOutput].filter(Boolean))];
  const name = String(tool.name || tool.title || ""), kind = String(tool.kind || "").toLowerCase();
  const body = diffs.length ? "diff" : terminals.length || kind === "execute" ? "terminal" : kind === "read" ? "read" : "generic";
  const terminal = terminals[0] || {};
  const explicitExit = terminal.exitStatus ?? tool.exitStatus ?? terminal.exitCode ?? tool.exitCode;
  const exit = explicitExit === void 0 ? { exitCode: void 0, signal: void 0, running: ["pending", "in_progress"].includes(tool.status) } : acpNormalizeExit(explicitExit);
  const terminalFailure = terminals.find((value) => {
    const status = value.exitStatus ?? value.exitCode;
    if (status == null) return false;
    const result = acpNormalizeExit(status);
    return result.exitCode !== void 0 && result.exitCode !== 0 || !!result.signal;
  });
  const failed = tool.status === "failed" || exit.exitCode !== void 0 && exit.exitCode !== 0 || !!exit.signal || !!terminalFailure;
  const running = !failed && ["pending", "in_progress"].includes(tool.status);
  const resolvedCommand = String(terminal.command || command);
  const resolvedOutput = typeof terminal.output === "string" ? terminal.output : output;
  const suppliedTitle = String(tool.title || tool.name || "");
  const description = typeof tool.description === "string" ? tool.description : raw && !raw.truncated && typeof raw.description === "string" ? raw.description : "";
  const explicitTitle = String(tool.title || "").trim() ? String(tool.title) : "";
  const title = description.trim() && (!explicitTitle || suppliedTitle.trim() === resolvedCommand.trim()) ? description : explicitTitle || (resolvedCommand.trim() ? resolvedCommand : String(tool.name || ""));
  const suppliedSummary = firstLine(locations[0]?.path || tool.summary);
  const preview = suppliedSummary.length <= 96 && suppliedSummary !== firstLine(resolvedCommand) ? suppliedSummary : "";
  const summary = preview === firstLine(title) ? "" : preview;
  return {
    title,
    summary,
    description,
    body,
    diffs,
    terminals,
    locations,
    command: resolvedCommand,
    cwd: String(terminal.cwd || tool.cwd || ""),
    output: resolvedOutput,
    textOutput: output,
    textOutputs,
    kind,
    exit,
    failed,
    running,
    name,
    error: firstLine(tool.errorMessage || tool.error || terminalFailure?.output || (failed ? resolvedOutput : ""))
  };
}
function toolBodyParts(model) {
  const parts = [];
  if (model.diffs.length) parts.push({ kind: "diff", diffs: model.diffs });
  if (model.terminals.length) {
    model.terminals.forEach((terminal, index) => {
      const supplied = terminal.exitStatus ?? terminal.exitCode;
      const exit = supplied == null ? index === 0 ? model.exit : { exitCode: void 0, signal: void 0, running: model.running } : acpNormalizeExit(supplied);
      parts.push({
        kind: "terminal",
        command: String(terminal.command || (index === 0 ? model.command : "")),
        cwd: String(terminal.cwd || (index === 0 ? model.cwd : "")),
        output: typeof terminal.output === "string" ? terminal.output : index === 0 ? model.textOutput : "",
        ...exit
      });
    });
  } else if (model.body === "terminal" || model.kind === "execute") parts.push({ kind: "terminal", command: model.command, cwd: model.cwd, output: model.output, ...model.exit });
  for (const text2 of model.textOutputs || [model.textOutput]) {
    if (text2 && !parts.some((part) => part.kind === "terminal" && part.output === text2)) parts.push({ kind: model.body === "read" ? "read" : "text", text: text2, label: model.locations[0]?.path || model.name });
  }
  return parts;
}

// src/client/thought.js
var import_react5 = __toESM(require("react"), 1);

// src/client/thought-model.js
function thoughtSummary(rawText, running = false) {
  const text2 = String(rawText || "").replace(/\r\n?/g, "\n");
  const paragraphs = text2.split(/\n(?:[\t ]*\n)+/);
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const newline = paragraphs[i].indexOf("\n");
    if (newline !== -1 || i < paragraphs.length - 1) {
      const line = paragraphs[i].split("\n", 1)[0].replaceAll("**", "").trim();
      if (line) return line;
    }
  }
  return running ? "" : text2.split("\n", 1)[0].replaceAll("**", "").trim();
}
function thoughtIsStreaming(item, items, running) {
  return !!running && item?.type === "thought" && item.streaming !== false && item.inherited !== true && items.at(-1)?.key === item.key;
}

// src/client/thought.js
function AcpThought({ item, t, running = false, showPreview = true, renderFactorySlot }) {
  const [open, setOpen] = import_react5.default.useState(false), [mounted, setMounted] = import_react5.default.useState(false);
  const id = import_react5.default.useId(), trigger = import_react5.default.useRef(null);
  import_react5.default.useLayoutEffect(() => {
    if (open) setMounted(true);
    requestReadingIntent(trigger.current, true);
  }, [open]);
  const summary = thoughtSummary(item.text, running);
  const label2 = t("acp.thought");
  return h(
    "section",
    { className: "rssh-thought", "data-running": running ? "" : void 0, "data-open": open ? "" : void 0 },
    h(
      "button",
      {
        ref: trigger,
        type: "button",
        className: "rssh-thought-toggle",
        "aria-expanded": open,
        "aria-controls": id,
        "aria-label": `${label2} \xB7 ${t(open ? "acp.hide" : "acp.show")}`,
        onClick: (event) => {
          requestReadingIntent(event.currentTarget);
          setOpen((value) => !value);
        }
      },
      h(DisclosureLeading, { icon: h(
        "svg",
        { className: "rssh-thought-icon", width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, "aria-hidden": true },
        h("path", { d: "M6 13v-2.3C4.2 10 3 8.4 3 6.5a5 5 0 0 1 10 0c0 1.9-1.2 3.5-3 4.2V13M6 15h4M6.2 5.5c0-1.2 1.8-1.2 1.8 0v3M9.8 5.5c0-1.2-1.8-1.2-1.8 0" })
      ) }),
      h("span", { className: "rssh-thought-title" }, label2),
      !open && summary && (running || showPreview) ? h(
        import_react5.default.Fragment,
        null,
        h("span", { className: "rssh-thought-separator", "aria-hidden": true }),
        h("span", { className: "rssh-thought-summary", title: summary }, summary)
      ) : null,
      running ? h("span", { className: "rssh-flow-status", "data-active": "" }, t("acp.running")) : null
    ),
    h("div", { id, hidden: !open, className: "rssh-thought-body" }, open || mounted ? renderFactorySlot("conversation.chat.reasoning.content", { text: item.text, running }) : null)
  );
}

// src/client/cards.js
var UiButton = ui.Button;
var UiInput = ui.Input;
function AcpMarkdown(props) {
  return h(ui.MarkdownText, { text: props.text, labels: props.labels });
}
function payloadItem(props, type, payload2) {
  return props.item || { type, key: props.itemKey || props._key, [type === "tool" ? "tool" : "subagent"]: payload2, sessionId: props.sessionId };
}
function nested(props, item) {
  var id = acpItemId(item);
  const children = acpChildrenFor(item, props.childMap, props.ancestors), ancestors = (props.ancestors || []).concat(id);
  if (!children.length) return null;
  return props.renderNested ? props.renderNested(children, ancestors) : h(AcpNestedChildren, { ...props, items: children, ancestors });
}
function AcpNativeDetails(props) {
  var [open, setOpen] = import_react6.default.useState(false);
  var payload2 = props.payload || { native: props.native, nativeMeta: props.nativeMeta };
  var entries = rawDetailEntries(payload2);
  if (!entries.length) return null;
  return h(
    "details",
    { className: "rssh-flow-raw", open, onToggle: (event) => setOpen(event.currentTarget.open) },
    h("summary", null, props.t("acp.rawDetails")),
    open ? h("div", { className: "rssh-flow-raw-body" }, entries.map((entry) => h(
      "section",
      { key: entry.key },
      h("div", { className: "rssh-flow-raw-label" }, entry.key),
      h("pre", { className: "rssh-flow-raw-text" }, fullPayloadText(entry.value))
    ))) : null
  );
}
function AcpSourceFallback({ item, fallback, t }) {
  if (!fallback) return null;
  return h(
    "details",
    { className: "rssh-flow-raw" },
    h("summary", null, t ? t("acp.sourceFallback") : "Unlinked source"),
    h("div", { className: "rssh-flow-source" }, [
      fallback.reason,
      fallback.sessionId && "session: " + fallback.sessionId,
      fallback.parentToolCallId && "parent: " + fallback.parentToolCallId,
      fallback.rootSessionId && "root: " + fallback.rootSessionId
    ].filter(Boolean).join(" \xB7 "))
  );
}
function AcpSubagentMeta(props) {
  var sub = props.subagent || {}, t = props.t;
  return h(
    "div",
    { className: "rssh-flow-agent-meta" },
    sub.description ? h("div", null, String(sub.description)) : null,
    sub.background ? h("div", { className: "rssh-flow-source" }, t("acp.subagentBackground")) : null,
    sub.outputFile ? h("div", null, h("code", null, String(sub.outputFile)), props.onOpenOutput ? h(UiButton, { variant: "ghost", size: "sm", onClick: () => props.onOpenOutput(String(sub.outputFile), String(sub.title || "")) }, t("acp.subagentOpenOutput")) : null) : null
  );
}
function AcpSubagentCard(props) {
  var sub = props.subagent || {}, t = props.t, item = payloadItem(props, "subagent", sub);
  var state = acpNativeState(sub.state ?? sub.status), summary = acpContentText(sub.summary || sub.content || sub.message || "");
  var failed = state.key === "acp.toolFailed";
  return h(import_react6.default.Fragment, null, h(ownedDisclosure, {
    className: "rssh-subagent-flow",
    icon: h(FlowIcon, { kind: "agent" }),
    title: String(sub.title || t("acp.subagent")),
    summary: processRowSummary(sub.description || summary, props.showProcessSummary, failed, acpContentText(sub.errorMessage || sub.error || (failed ? summary : ""))),
    running: state.dot === "ongoing",
    failed,
    status: state.dot === "done" ? void 0 : t(state.key),
    children: () => h(
      import_react6.default.Fragment,
      null,
      h(AcpSubagentMeta, props),
      summary ? h(AcpMarkdown, { text: summary, labels: props.labels.markdown }) : null,
      h(AcpNativeDetails, { t, payload: sub }),
      nested(props, item)
    )
  }), h(AcpSourceFallback, { item, t, fallback: props.sourceFallback }));
}
function AcpStateCard(props) {
  var item = props.item || {}, t = props.t, state = acpNativeState(item.state), error = acpContentText(item.errorMessage || item.error);
  return h(import_react6.default.Fragment, null, h(ownedDisclosure, {
    secondary: true,
    icon: h(FlowIcon, { kind: "state" }),
    title: t("acp.state"),
    summary: error || item.stopReason || t(state.key),
    failed: state.key === "acp.toolFailed" || !!error,
    running: state.dot === "ongoing",
    status: t(state.key),
    children: () => h(
      import_react6.default.Fragment,
      null,
      error ? h("div", { className: "ra-acp-error", role: "alert" }, error) : null,
      item.stopReason ? h("div", null, t("acp.stopReason") + ": " + String(item.stopReason)) : null,
      h(AcpNativeDetails, { t, payload: item }),
      nested(props, item)
    )
  }), h(AcpSourceFallback, { item, t, fallback: props.sourceFallback }));
}
function AcpSessionMessageCard(props) {
  var item = props.item || {}, t = props.t, content = item.text || acpContentText(item.content);
  return h(import_react6.default.Fragment, null, h(ownedDisclosure, {
    icon: h(FlowIcon, { kind: "message" }),
    title: t("acp.sessionMessage"),
    summary: [item.sender, item.recipient].filter(Boolean).join(" \u2192 "),
    children: () => h(
      import_react6.default.Fragment,
      null,
      content ? h(AcpMarkdown, { text: String(content), labels: props.labels.markdown }) : null,
      h(AcpNativeDetails, { t, payload: item }),
      nested(props, item)
    )
  }), h(AcpSourceFallback, { item, t, fallback: props.sourceFallback }));
}
function AcpTerminalEventCard(props) {
  var item = props.item || {}, t = props.t, exit = acpNormalizeExit(item.exitStatus);
  var failed = exit.exitCode !== void 0 && exit.exitCode !== 0 || !!exit.signal;
  return h(import_react6.default.Fragment, null, h(ownedDisclosure, {
    icon: h(FlowIcon),
    title: t("acp.terminalEvent"),
    summary: String(item.command || item.cwd || item.terminalId || ""),
    running: exit.running,
    failed,
    status: failed ? t("acp.failed") : exit.running ? t("acp.running") : void 0,
    children: () => h(
      import_react6.default.Fragment,
      null,
      h(ui.TerminalBlock, { command: String(item.command || ""), cwd: String(item.cwd || ""), output: String(item.output ?? ""), ...exit, labels: props.labels.terminal, maxLines: 20 }),
      h(AcpNativeDetails, { t, payload: item }),
      nested(props, item)
    )
  }), h(AcpSourceFallback, { item, t, fallback: props.sourceFallback }));
}
function AcpNativeEventCard(props) {
  var item = props.item || {}, t = props.t;
  return h(import_react6.default.Fragment, null, h(ownedDisclosure, {
    secondary: true,
    icon: h(FlowIcon, { kind: "native" }),
    title: t("acp.nativeEventFallback"),
    summary: acpNativeName(item.native) || String(item.label || item.event?.type || ""),
    children: () => h(
      import_react6.default.Fragment,
      null,
      h(AcpNativeDetails, { t, payload: item }),
      nested(props, item)
    )
  }), h(AcpSourceFallback, { item, t, fallback: props.sourceFallback }));
}
function compactionSummaryText(summary) {
  if (!Array.isArray(summary)) return "";
  return summary.filter(function(b) {
    return b && b.type === "text" && b.text;
  }).map(function(b) {
    return b.text;
  }).join("");
}
function AcpCompactionCard(props) {
  var item = props.item || {}, t = props.t;
  var summary = String(item.summaryText || compactionSummaryText(item.summary) || item.error || item.status || "");
  var running = /running|in_progress|started/.test(String(item.status || ""));
  var failed = !!item.error || String(item.status || "") === "failed";
  return h(import_react6.default.Fragment, null, h(ownedDisclosure, {
    secondary: true,
    icon: h(FlowIcon, { kind: "state" }),
    title: t("acp.compaction"),
    summary,
    running,
    failed,
    status: t(failed ? "acp.toolFailed" : running ? "acp.running" : void 0),
    children: () => h(
      import_react6.default.Fragment,
      null,
      summary ? h(AcpMarkdown, { text: summary, labels: props.labels.markdown }) : null,
      h(AcpNativeDetails, { t, payload: item }),
      nested(props, item)
    )
  }), h(AcpSourceFallback, { item, t, fallback: props.sourceFallback }));
}
function AcpNoticeCard(props) {
  var item = props.item || {}, t = props.t;
  var title = String(item.title || ""), desc = String(item.description || "");
  var tone = item.severity === "error" ? "error" : item.severity === "warning" ? "warning" : "info";
  return h(
    "div",
    { className: "rssh-flow-notice", "data-tone": tone, role: item.severity === "error" ? "alert" : "status" },
    h(FlowIcon, { kind: "message" }),
    h(
      "span",
      { className: "rssh-flow-notice-body" },
      title ? h("strong", null, title + ": ") : null,
      h("span", null, desc)
    ),
    h(AcpSourceFallback, { item, t, fallback: props.sourceFallback })
  );
}
function AcpNestedChildren(props) {
  var items = props.items || [];
  if (!items.length) return null;
  return h("div", { className: "rssh-flow-children" }, items.map((item) => h(AcpNestedItem, { ...props, key: item.key || acpItemId(item), item })));
}
function AcpNestedItem(props) {
  var item = props.item;
  if (!item) return null;
  var common = { ...props, sourceFallback: props.fallbacks?.[acpItemId(item)] };
  switch (item.type) {
    case "tool":
      return h(AcpToolCard, { ...common, tool: item.tool });
    case "subagent":
      return h(AcpSubagentCard, { ...common, subagent: item.subagent });
    case "state":
      return h(AcpStateCard, common);
    case "plan":
      return h(AcpPlanCard, { ...common, ...item });
    case "session_message":
      return h(AcpSessionMessageCard, common);
    case "terminal_event":
      return h(AcpTerminalEventCard, common);
    case "native_event":
      return h(AcpNativeEventCard, common);
    case "compaction":
      return h(AcpCompactionCard, common);
    case "notice":
      return h(AcpNoticeCard, common);
    case "interaction_receipt":
      return h(AcpInteractionReceipt, common);
    case "thought":
      return h(import_react6.default.Fragment, null, h(AcpThought, { ...common, running: thoughtIsStreaming(item, props.transcriptItems || [item], props.running) }), h(AcpNativeDetails, { t: props.t, payload: item }), nested(props, item));
    case "assistant":
    case "user":
      return h(
        "div",
        { className: "rssh-flow-text" },
        h(AcpMarkdown, { text: String(item.text || acpContentText(item.content)), labels: props.labels.markdown }),
        h(AcpNativeDetails, { t: props.t, payload: item }),
        nested(props, item)
      );
    default:
      return h(
        "div",
        { className: "rssh-flow-text", role: item.type === "error" ? "alert" : void 0 },
        item.text || item.message || item.content ? h(AcpMarkdown, { text: String(item.text || item.message || acpContentText(item.content)), labels: props.labels.markdown }) : null,
        h(AcpNativeDetails, { t: props.t, payload: { event: item } }),
        nested(props, item)
      );
  }
}
function AcpResultText({ text: text2, labels }) {
  const [expanded, setExpanded] = import_react6.default.useState(false), lines = String(text2 || "").split("\n"), limited = lines.length > 20;
  return h(
    "div",
    { className: "rssh-flow-result" },
    h(AcpMarkdown, { text: expanded ? text2 : lines.slice(0, 20).join("\n"), labels: labels.markdown }),
    limited ? h(UiButton, { variant: "ghost", size: "sm", "aria-expanded": expanded, onClick: () => setExpanded((value) => !value) }, expanded ? labels.read.collapse : labels.read.expand(lines.length - 20)) : null
  );
}
function AcpToolBody({ model, labels }) {
  const counts = {};
  return h(import_react6.default.Fragment, null, toolBodyParts(model).map((part) => {
    const key2 = part.kind + ":" + (counts[part.kind] = (counts[part.kind] || 0) + 1);
    switch (part.kind) {
      case "diff":
        return h(ui.DiffBlock, { key: key2, diffs: part.diffs.map((d) => ({ path: String(d.path || ""), oldText: d.oldText == null ? null : String(d.oldText), newText: String(d.newText || "") })), labels: labels.diff, maxLines: 20 });
      case "terminal":
        return h(ui.TerminalBlock, { key: key2, ...part, labels: labels.terminal, maxLines: 20 });
      case "read":
        return h(ui.ReadBlock, { key: key2, label: part.label, lines: part.text.split("\n").map((text2, i) => ({ number: i + 1, text: text2 })), totalLines: part.text.split("\n").length, labels: labels.read, maxLines: 20 });
      default:
        return h(AcpResultText, { key: key2, text: part.text, labels });
    }
  }));
}
function AcpToolCard(props) {
  var tool = props.tool || {}, t = props.t, model = toolFlowModel(tool), item = payloadItem(props, "tool", tool);
  var sub = tool.subagent && typeof tool.subagent === "object" ? acpSubagentFromTool(tool) : null;
  var statusKey = toolRowStatus(model, tool), status = statusKey ? t(statusKey) : void 0;
  return h(
    import_react6.default.Fragment,
    null,
    h(ownedDisclosure, {
      className: "rssh-tool-flow",
      icon: h(FlowIcon, { kind: sub ? "agent" : "tool" }),
      title: model.title || t("acp.tool"),
      summary: processRowSummary(model.summary, props.showProcessSummary, model.failed, model.error),
      running: model.running,
      failed: model.failed,
      status,
      children: () => h(
        import_react6.default.Fragment,
        null,
        sub ? h(AcpSubagentMeta, { ...props, subagent: sub }) : null,
        model.description && model.description !== model.title ? h("div", { className: "rssh-flow-text" }, model.description) : null,
        model.command && !model.terminals.length && model.body !== "terminal" && model.kind !== "execute" ? h(
          "div",
          null,
          h("pre", { className: "rssh-flow-command" }, h("code", null, model.command)),
          h(ui.CopyButton, { text: model.command, labels: { copy: t("flow.copyCommand"), copied: t("flow.copied"), copyFailed: t("flow.copyFailed") } })
        ) : null,
        model.locations.length ? h("div", { className: "rssh-flow-locations" }, model.locations.map((loc, i) => h(UiButton, {
          key: JSON.stringify([loc.path, loc.line, i]),
          variant: "ghost",
          size: "sm",
          onClick: () => props.onOpenOutput?.(String(loc.path || ""))
        }, String(loc.path || "") + (loc.line == null ? "" : ":" + loc.line)))) : null,
        h(AcpToolBody, { model, labels: props.labels }),
        h(AcpNativeDetails, { t, payload: tool }),
        nested(props, item)
      )
    }),
    h(AcpSourceFallback, { item, t, fallback: props.sourceFallback })
  );
}
function AcpPlanCard(props) {
  var entries = Array.isArray(props.entries) ? props.entries : [], t = props.t, item = props.item || props;
  var active = item.settled || item.removed ? [] : entries.filter((entry) => entry.status === "in_progress"), done = entries.filter((entry) => entry.status === "completed");
  var summary = active[0]?.content || (entries.length ? done.length + "/" + entries.length : String(props.content || ""));
  return h(import_react6.default.Fragment, null, h(ownedDisclosure, {
    secondary: true,
    icon: h(FlowIcon, { kind: "plan" }),
    title: t("acp.plan"),
    summary: String(summary),
    running: active.length > 0,
    status: active.length ? t("acp.running") : item.settled ? t("flow.ended") : void 0,
    children: () => h(
      import_react6.default.Fragment,
      null,
      entries.length ? entries.map((entry, i) => h(
        "div",
        { key: entry.id || i, className: "rssh-flow-plan-row" },
        h(ui.StateDot, { state: entry.status === "completed" ? "done" : !item.settled && !item.removed && entry.status === "in_progress" ? "ongoing" : "idle" }),
        h("span", null, String(entry.content || ""))
      )) : h("div", null, String(props.content || "")),
      h(AcpNativeDetails, { t, payload: item }),
      nested(props, item)
    )
  }), h(AcpSourceFallback, { item, t, fallback: props.sourceFallback }));
}
function AcpInteractionReceipt({ item, t }) {
  const key2 = item.interaction === "permission" ? item.outcome === "cancelled" ? "flow.permissionCancelled" : item.decision === "allowed" ? "flow.permissionAllowed" : item.decision === "denied" ? "flow.permissionDenied" : "flow.permissionRecorded" : item.outcome === "cancelled" ? "flow.questionCancelled" : item.decision === "declined" ? "flow.questionDeclined" : "flow.questionRecorded";
  return h("div", { className: "rssh-flow-notice" }, h(FlowIcon, { kind: "state" }), h("span", { className: "rssh-flow-notice-body" }, t(key2)));
}
function AcpElicitationCard(props) {
  var t = props.t;
  var request = props.request || {};
  var schema = request.requestedSchema || request.schema || {};
  var fields = {};
  Object.keys(schema.properties || {}).forEach(function(key2) {
    fields[key2] = acpQuestionField(schema.properties[key2]);
  });
  var required = Array.isArray(schema.required) ? schema.required : [];
  var [answers, setAnswers] = import_react6.default.useState(function() {
    var initial = {};
    Object.keys(fields).forEach(function(key2) {
      if (fields[key2].default !== void 0) initial[key2] = fields[key2].default;
      else if (fields[key2].type === "boolean") initial[key2] = false;
      else if (fields[key2].type === "array") initial[key2] = [];
    });
    return initial;
  });
  function setValue(key2, value) {
    setAnswers(function(old) {
      return Object.assign({}, old, { [key2]: value });
    });
  }
  var unsupported = Object.keys(fields).some(function(key2) {
    var field3 = fields[key2];
    return ["string", "number", "integer", "boolean", "array"].indexOf(field3.type) < 0 || field3.type === "array" && !(field3.items && Array.isArray(field3.items.enum));
  });
  var missing = !acpQuestionAnswersValid(schema, answers);
  return h(
    "section",
    { className: "ra-acp-perm", role: "group", "aria-label": request.message || t("acp.question") },
    h("div", { className: "ra-acp-perm-head" }, request.message || t("acp.question")),
    unsupported ? h("p", { role: "alert" }, t("acp.unsupportedQuestion")) : Object.keys(fields).map(function(key2) {
      var field3 = fields[key2];
      var title = String(field3.title || key2) + (required.indexOf(key2) >= 0 ? " *" : "");
      var value = answers[key2];
      var input;
      if (field3.type === "boolean") {
        input = h("input", {
          type: "checkbox",
          checked: value === true,
          disabled: props.busy,
          onChange: function(e) {
            setValue(key2, e.target.checked);
          }
        });
      } else if (Array.isArray(field3.enum)) {
        input = h(
          "select",
          {
            value: value == null ? "" : String(value),
            disabled: props.busy,
            onChange: function(e) {
              setValue(key2, field3.enum.find(function(v) {
                return String(v) === e.target.value;
              }));
            }
          },
          h("option", { value: "", disabled: true }, t("acp.chooseAnswer")),
          field3.enum.map(function(v, index) {
            return h("option", { key: String(v), value: String(v), title: field3.enumDescriptions && field3.enumDescriptions[index] || "" }, field3.enumNames && field3.enumNames[index] || String(v));
          })
        );
      } else if (field3.type === "array") {
        input = h("span", { className: "ra-acp-question-options" }, field3.items.enum.map(function(choice, index) {
          return h(
            "label",
            { key: String(choice) },
            h("input", {
              type: "checkbox",
              disabled: props.busy,
              checked: Array.isArray(value) && value.indexOf(choice) >= 0,
              onChange: function(e) {
                var list3 = Array.isArray(value) ? value.filter(function(v) {
                  return v !== choice;
                }) : [];
                if (e.target.checked) list3.push(choice);
                setValue(key2, list3);
              }
            }),
            h("span", null, field3.items.enumNames && field3.items.enumNames[index] || String(choice)),
            field3.items.enumDescriptions && field3.items.enumDescriptions[index] ? h("small", null, field3.items.enumDescriptions[index]) : null
          );
        }));
      } else {
        input = h(UiInput, {
          value: value == null ? "" : String(value),
          disabled: props.busy,
          type: field3.type === "number" || field3.type === "integer" ? "number" : field3.format === "password" ? "password" : "text",
          onChange: function(e) {
            var raw = e.target.value;
            setValue(key2, field3.type === "number" || field3.type === "integer" ? raw === "" ? void 0 : Number(raw) : raw);
          }
        });
      }
      return h(
        "label",
        { key: key2, className: "ra-acp-question-field" },
        h("span", null, title),
        field3.description ? h("span", { className: "ra-acp-role" }, String(field3.description)) : null,
        input
      );
    }),
    h(
      "div",
      { className: "ra-acp-perm-opts" },
      h(UiButton, {
        variant: "primary",
        size: "sm",
        disabled: props.busy || missing || unsupported,
        onClick: function() {
          props.onAnswer(request, { action: "accept", content: answers });
        }
      }, t("acp.answerQuestion")),
      h(UiButton, {
        variant: "outline",
        size: "sm",
        disabled: props.busy,
        onClick: function() {
          props.onAnswer(request, { action: "decline" });
        }
      }, t("acp.declineQuestion"))
    )
  );
}
function AcpPermissionCard(props) {
  var t = props.t;
  var permission = props.permission || {};
  var tool = permission.tool || {};
  var options = Array.isArray(permission.options) ? permission.options : [];
  var label2 = String(tool.title || tool.name || t("acp.tool"));
  var locations = Array.isArray(tool.locations) ? tool.locations : [];
  return h(
    "div",
    { className: "ra-acp-perm", role: "group", "aria-label": t("acp.permissionTitle") },
    h(
      "div",
      { className: "ra-acp-perm-head" },
      h(ui.Tag, { tone: "warning" }, t("acp.permissionTitle")),
      h("span", null, label2),
      h(ui.StateDot, { state: "warning" })
    ),
    locations.length ? h(
      "div",
      { className: "ra-acp-locations" },
      locations.map(function(loc, i) {
        return h(
          "span",
          { key: JSON.stringify([loc.path, loc.line, i]), className: "ra-acp-loc" },
          String(loc.path || "") + (loc.line == null ? "" : ":" + loc.line)
        );
      })
    ) : null,
    h("div", { className: "ra-acp-role" }, t("acp.permissionDesc", { tool: label2 })),
    h(
      "div",
      { className: "ra-acp-perm-opts" },
      options.map(function(option, i) {
        var optionId = String(option.optionId || "");
        return h(UiButton, {
          key: option.optionId || i,
          variant: option.kind === "allow_once" ? "primary" : "outline",
          size: "sm",
          disabled: !!props.busy,
          onClick: function() {
            props.onAnswer(permission, optionId);
          }
        }, String(option.name || optionId));
      }),
      h(UiButton, {
        variant: "outline",
        size: "sm",
        disabled: !!props.busy,
        onClick: function() {
          props.onDismiss(permission);
        }
      }, t("acp.dismiss"))
    ),
    h(AcpNativeDetails, { t, native: permission.native, nativeMeta: permission.nativeMeta })
  );
}

// src/client/transcript.js
var import_react9 = __toESM(require("react"), 1);

// src/client/transcript-model.js
var PROCESS_TYPES = /* @__PURE__ */ new Set(["thought", "tool", "plan", "subagent", "terminal_event"]);
var processValue = (item) => item?.type === "tool" ? item.tool : item?.type === "subagent" ? item.subagent : item;
function transcriptScope(item) {
  const value = processValue(item);
  return JSON.stringify([value?.sessionId || "", value?.turnId || item?.key || ""]);
}
function transcriptPolicy(preferences = {}, defaultMode = "detailed") {
  const mode = ["compact", "standard", "detailed", "verbose"].includes(preferences.transcriptView) ? preferences.transcriptView : defaultMode;
  return {
    mode,
    stepGrouping: mode === "verbose" ? "none" : mode === "detailed" ? "history" : "collapsed",
    foldCompleted: mode !== "verbose",
    showProcessSummary: mode !== "compact",
    showSettledReasoning: mode === "detailed" || mode === "verbose",
    collapseTiming: preferences.collapseTiming === "next-input" ? "next-input" : "completion",
    foldedReplies: preferences.foldedReplies === "final" ? "final" : "all"
  };
}
function visibleTranscriptItem(item) {
  if (!item) return false;
  if (["assistant", "thought"].includes(item.type)) return !!String(item.text || "").trim();
  if (item.type === "state" && !item.error && !item.errorMessage && !item.stopReason) return false;
  if (item.type === "native_event" && ["title", "lifecycle"].includes(item.event?.type)) return false;
  return true;
}
function transcriptEntries(items, { turns = {} } = {}) {
  const visible = items.filter(visibleTranscriptItem), entries = [], responses = /* @__PURE__ */ new Map(), lastAssistant = /* @__PURE__ */ new Map(), latestUser = /* @__PURE__ */ new Map(), latestStart = /* @__PURE__ */ new Map();
  for (const [scope, turn] of Object.entries(turns)) {
    const sessionId = JSON.parse(scope)[0];
    if (Number.isFinite(turn.startSeq)) latestStart.set(sessionId, Math.max(latestStart.get(sessionId) || 0, turn.startSeq));
  }
  for (let index = 0; index < visible.length; index++) {
    const item = visible[index], scope = transcriptScope(item);
    if (item.type === "assistant") {
      if (!responses.has(scope)) responses.set(scope, []);
      responses.get(scope).push(String(item.text || ""));
      lastAssistant.set(scope, item.key);
    }
    if (item.type === "user" && item.delivery !== "queued" && item.delivery !== "cancelled") latestUser.set(item.sessionId || "", index);
  }
  const responseTexts = new Map([...responses].map(([scope, parts]) => [scope, parts.join("\n\n")]));
  for (let index = 0; index < visible.length; ) {
    const item = visible[index], scope = transcriptScope(item);
    if (!PROCESS_TYPES.has(item.type)) {
      entries.push({ kind: "item", key: item.key, item, scope });
      index++;
      continue;
    }
    const run = [];
    let end = index;
    while (end < visible.length && PROCESS_TYPES.has(visible[end].type) && transcriptScope(visible[end]) === scope) run.push(visible[end++]);
    const settled = turns[scope]?.status && turns[scope].status !== "running";
    const source = processValue(item);
    entries.push({
      kind: "process",
      key: `process:${item.key}`,
      items: run,
      scope,
      settled: !!settled,
      laterInput: (latestUser.get(source?.sessionId || "") ?? -1) > index || Number.isFinite(turns[scope]?.endSeq) && (latestStart.get(source?.sessionId || "") || 0) > turns[scope].endSeq,
      interrupted: !!settled && turns[scope].status !== "completed"
    });
    index = end;
  }
  for (const entry of entries) if (entry.kind === "item" && entry.item.type === "assistant") {
    entry.responseText = responseTexts.get(entry.scope);
    entry.responseTail = lastAssistant.get(entry.scope) === entry.item.key;
    entry.turn = turns[entry.scope] || null;
  }
  return entries;
}
function processGroupSummary(entry) {
  const items = entry?.items || [];
  let runningItem = null, latest = -Infinity, failedCount = 0;
  for (const item of items) {
    const value = processValue(item) || {};
    const raw = value.state ?? value.status;
    const status = String(typeof raw === "object" ? raw?.type || raw?.state || raw?.status || "" : raw || "").toLowerCase();
    const terminals = [...Array.isArray(value.terminals) ? value.terminals : [], ...Array.isArray(value.content) ? value.content.filter((block) => block?.type === "terminal") : []];
    const exits = [value.exitStatus ?? value.exitCode, ...terminals.map((terminal) => terminal.exitStatus ?? terminal.exitCode)].filter((exit) => exit !== void 0 && exit !== null && exit !== "").map(acpNormalizeExit);
    const failed = ["failed", "error"].includes(status) || exits.some((exit) => Number.isFinite(exit.exitCode) && exit.exitCode !== 0 || !!exit.signal);
    if (failed) failedCount++;
    const active = item.type === "thought" ? item.streaming === true && item.inherited !== true && item === items.at(-1) : item.type === "plan" ? item.settled !== true && !item.removed && (Array.isArray(item.entries) ? item.entries : []).some((step) => step.status === "in_progress") : ["running", "working", "in_progress", "pending"].includes(status) || exits.some((exit) => exit.running === true);
    const seq = Number(value.lastSeq ?? item.lastSeq ?? value.seq ?? item.seq ?? 0);
    if (!entry.settled && !failed && active && seq >= latest) {
      runningItem = item;
      latest = seq;
    }
  }
  return { runningItem, failedCount, count: items.length };
}
function processGroupPresentation(entry, policy, manual) {
  const flat = policy.stepGrouping === "none" || policy.stepGrouping === "history" && (!entry.settled || policy.collapseTiming === "next-input" && !entry.laterInput);
  const requested = typeof manual === "object" ? manual?.open : manual;
  const open = flat || requested === true;
  const scrollBody = !flat && !(open && manual?.readingFlat);
  return { flat, open, scrollBody };
}
function followsTranscriptTail({ scrollHeight, scrollTop, clientHeight }, threshold = 32) {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}
function anchoredScrollTop({ currentTop, previousOffset, nextOffset }) {
  return Math.max(0, currentTop + nextOffset - previousOffset);
}
function mayRestoreTranscriptAnchor({ startedAtGeneration, currentGeneration, sameViewport, live }) {
  return live && sameViewport && startedAtGeneration === currentGeneration;
}

// src/client/history-anchor.js
var list2 = (value) => Array.isArray(value) ? value : [];
var key = (value) => typeof value === "string" && value.length > 0;
var sequence = (value) => Number.isSafeInteger(value) && value > 0;
var textType = (value) => value === "assistant" || value === "thought";
var validRange = (range) => range && key(range.generation) && textType(range.type) && sequence(range.firstSeq) && sequence(range.lastSeq) && range.firstSeq <= range.lastSeq;
function historyAnchorAttributes(entry) {
  const items = entry?.kind === "process" ? list2(entry.items) : entry?.item ? [entry.item] : [];
  const members2 = [...new Set(items.map((item) => item?.key).filter(key))];
  const ranges2 = items.flatMap((item) => {
    const range = { generation: item?.generation, firstSeq: item?.seq, lastSeq: item?.lastSeq, type: item?.type };
    return validRange(range) ? [range] : [];
  });
  const versions = Object.fromEntries(items.flatMap((item) => {
    const version2 = textType(item?.type) ? item.lastSeq : item?.type === "tool" ? item.tool?.seq : item?.seq;
    return key(item?.key) && sequence(version2) ? [[item.key, version2]] : [];
  }));
  return {
    "data-history-members": JSON.stringify(members2),
    "data-history-ranges": JSON.stringify(ranges2),
    "data-history-versions": JSON.stringify(versions)
  };
}
var measured = (anchor) => anchor && Number.isFinite(anchor.top) && Number.isFinite(anchor.bottom) && anchor.bottom >= anchor.top;
var members = (anchor) => list2(anchor.members).filter(key);
var ranges = (anchor) => list2(anchor.ranges).filter(validRange);
var version = (anchor, member) => Object.hasOwn(anchor.versions || {}, member) ? anchor.versions[member] : void 0;
function absorbed(previous, current) {
  const before = members(previous), after = members(current);
  if (new Set(before).size !== before.length || new Set(after).size !== after.length) return false;
  const first = before.findIndex((member) => after.includes(member));
  if (first !== -1) {
    const oldSuffix = before.slice(first), newSuffix = after.slice(after.indexOf(before[first]));
    return oldSuffix.length === newSuffix.length && oldSuffix.every((member, index) => member === newSuffix[index] && sequence(version(previous, member)) && version(previous, member) === version(current, member));
  }
  return ranges(previous).some((old) => before.at(-1) === `${old.generation}:${old.firstSeq}` && ranges(current).some((next) => after.at(-1) === `${next.generation}:${next.firstSeq}` && old.generation === next.generation && old.type === next.type && next.firstSeq <= old.firstSeq && next.lastSeq === old.lastSeq));
}
function historyAnchorAdjustment(previous, current) {
  const before = list2(previous).filter(measured), after = list2(current).filter(measured);
  for (const old of before) {
    if (!key(old.key) || before.filter((anchor) => anchor.key === old.key).length !== 1) continue;
    const matches = after.filter((anchor) => anchor.key === old.key);
    if (matches.length === 1) return { previousOffset: old.top, nextOffset: matches[0].top };
  }
  for (const old of before) {
    const matches = after.filter((next) => absorbed(old, next));
    if (matches.length === 1) return { previousOffset: old.bottom, nextOffset: matches[0].bottom };
  }
  return null;
}

// src/client/sent-attachments.js
var import_react8 = __toESM(require("react"), 1);

// src/client/attachments.js
var import_react7 = __toESM(require("react"), 1);

// src/client/attachments-model.js
var IMAGE_TYPES = /* @__PURE__ */ new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
var IMAGE_PREVIEW_LIMIT = 2 * 1024 * 1024;
var ownedPreviewURLs = /* @__PURE__ */ new Set();
function safeImagePreviewURL(source, origin2 = globalThis.location?.origin) {
  if (typeof source !== "string" || !source || source.length > 8192) return null;
  if (ownedPreviewURLs.has(source)) return source;
  try {
    const url = new URL(source, origin2);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin2 || url.username || url.password || url.hash || url.pathname !== "/remote-ssh/v3/message-image") return null;
    const fields = ["id", "dshSessionId", "turnId", "index"];
    if ([...url.searchParams.keys()].length !== fields.length || fields.some((key2) => url.searchParams.getAll(key2).length !== 1 || !url.searchParams.get(key2))) return null;
    if (!/^(?:0|[1-9]\d*)$/.test(url.searchParams.get("index"))) return null;
    return url.href;
  } catch {
    return null;
  }
}
function imageAttachmentModel(file = {}) {
  if (file.type !== "image") return { kind: "file" };
  const mimeType = file.mimeType, data = file.data;
  if (!IMAGE_TYPES.has(mimeType) || typeof data !== "string" || !data.length || data.length > Math.ceil(IMAGE_PREVIEW_LIMIT / 3) * 4 || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return { kind: "unavailable" };
  const bytes = data.length / 4 * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  return bytes > 0 && bytes <= IMAGE_PREVIEW_LIMIT ? { kind: "image", mimeType, data, bytes } : { kind: "unavailable" };
}
function rasterHeaderMatches(mimeType, bytes) {
  const ascii = (at, text2) => text2.split("").every((character, index) => bytes[at + index] === character.charCodeAt(0));
  switch (mimeType) {
    case "image/png":
      return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    case "image/jpeg":
      return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    case "image/gif":
      return ascii(0, "GIF87a") || ascii(0, "GIF89a");
    case "image/webp":
      return bytes.length >= 12 && ascii(0, "RIFF") && ascii(8, "WEBP");
    default:
      return false;
  }
}
function createAttachmentPreview(model, {
  decode = (data) => globalThis.atob(data),
  makeBlob = (parts, options) => new Blob(parts, options),
  createURL = (blob) => globalThis.URL.createObjectURL(blob),
  revokeURL = (url) => globalThis.URL.revokeObjectURL(url)
} = {}) {
  if (model?.kind !== "image" || !IMAGE_TYPES.has(model.mimeType)) return { status: "unavailable", dispose() {
  } };
  let url;
  try {
    const binary = decode(model.data);
    if (!binary.length || binary.length > IMAGE_PREVIEW_LIMIT) return { status: "unavailable", dispose() {
    } };
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (!rasterHeaderMatches(model.mimeType, bytes)) return { status: "unavailable", dispose() {
    } };
    url = createURL(makeBlob([bytes], { type: model.mimeType }));
    if (typeof url !== "string" || !url.startsWith("blob:")) throw new Error("Invalid local preview URL");
    ownedPreviewURLs.add(url);
    let disposed = false;
    return { status: "ready", url, dispose() {
      if (disposed) return;
      disposed = true;
      ownedPreviewURLs.delete(url);
      try {
        revokeURL(url);
      } catch {
      }
    } };
  } catch {
    if (url) try {
      revokeURL(url);
    } catch {
    }
    return { status: "unavailable", dispose() {
    } };
  }
}
function removeAttachmentById(attachments, id) {
  if (typeof id !== "string" || !id) return attachments;
  return attachments.filter((file) => file.id !== id);
}

// src/client/attachments.js
function ImageGlyph() {
  return h(
    "svg",
    { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true },
    h("rect", { x: 3, y: 3, width: 18, height: 18, rx: 3 }),
    h("circle", { cx: 8, cy: 8, r: 1.5 }),
    h("path", { d: "m4 18 5-6 4 4 3-3 4 5" })
  );
}
function useImagePreview(file) {
  const model = import_react7.default.useMemo(() => imageAttachmentModel(file), [file.type, file.mimeType, file.data]);
  const [resource, setResource] = import_react7.default.useState(null);
  import_react7.default.useEffect(() => {
    const preview = createAttachmentPreview(model);
    setResource({ model, ...preview });
    return () => preview.dispose();
  }, [model]);
  return resource?.model === model ? resource : { status: "loading" };
}
function ImagePreviewModal({ src, name, t, onClose, onError }) {
  const safeSource = safeImagePreviewURL(src);
  const [failedSource, setFailedSource] = import_react7.default.useState(null);
  const failed = !safeSource || failedSource === safeSource;
  return h(
    ui.Modal,
    { open: true, className: "rssh-image-preview", title: name, closeLabel: t("acp.close"), onClose },
    h("div", { className: "rssh-image-preview-stage" }, failed ? h("p", { role: "status" }, t("acp.imagePreviewUnavailable")) : h("img", { src: safeSource, alt: name, decoding: "async", draggable: false, onError: () => {
      setFailedSource(safeSource);
      onError?.();
    } }))
  );
}
function RemoveAttachment({ file, sending, onRemove, t }) {
  const label2 = `${t("acp.removeAttachment")}: ${file.name || t("acp.attachment")}`;
  return h(
    "button",
    { type: "button", className: "rssh-attachment-remove", disabled: sending, "aria-label": label2, title: label2, onClick: () => onRemove(file.id) },
    h("svg", { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true }, h("path", { d: "m4 4 8 8M12 4l-8 8" }))
  );
}
function ImageAttachment({ file, sending, onRemove, t }) {
  const preview = useImagePreview(file), [opened, setOpened] = import_react7.default.useState(false);
  const [loadedURL, setLoadedURL] = import_react7.default.useState(null), [failedURL, setFailedURL] = import_react7.default.useState(null);
  const url = preview.status === "ready" ? preview.url : null;
  const failed = preview.status === "unavailable" || !!url && failedURL === url;
  const loaded = !!url && loadedURL === url && !failed;
  const name = file.name || t("acp.imageAttachment");
  const feedback = t(failed ? "acp.imagePreviewUnavailable" : "acp.imagePreviewLoading");
  return h(
    "li",
    { className: "rssh-attachment" },
    h(
      "button",
      {
        type: "button",
        className: "rssh-attachment-thumbnail",
        disabled: !loaded,
        "aria-label": `${loaded ? t("acp.previewImage") : feedback}: ${name}`,
        title: loaded ? `${t("acp.previewImage")}: ${name}` : feedback,
        onClick: () => setOpened(true)
      },
      !loaded ? h("span", { className: "rssh-attachment-placeholder", "data-failed": failed ? "" : void 0 }, h(ImageGlyph), h("span", null, feedback)) : null,
      url && !failed ? h("img", {
        src: url,
        alt: name,
        decoding: "async",
        draggable: false,
        "data-loaded": loaded ? "" : void 0,
        onLoad: () => setLoadedURL(url),
        onError: () => setFailedURL(url)
      }) : null
    ),
    h("div", { className: "rssh-attachment-caption" }, h("span", { className: "rssh-attachment-name", title: name }, name), h(RemoveAttachment, { file, sending, onRemove, t })),
    failed ? h("span", { className: "rssh-attachment-note" }, t("acp.imageAttachmentRetained")) : null,
    opened ? h(ImagePreviewModal, { src: url, name, t, onClose: () => setOpened(false), onError: () => setFailedURL(url) }) : null
  );
}
function FileAttachment({ file, sending, onRemove, t }) {
  const name = file.name || file.path || t("acp.attachment");
  return h(
    "li",
    { className: "rssh-attachment-file", title: file.path || name, "aria-label": `${t(file.path ? "acp.remoteFileAttachment" : "acp.fileAttachment")}: ${name}` },
    h(ui.FileTypeIcon, { path: name, size: 16 }),
    h("span", { className: "rssh-attachment-name", title: name }, name),
    h(RemoveAttachment, { file, sending, onRemove, t })
  );
}
function AttachmentList({ attachments, sending, onRemove, t }) {
  if (!attachments.length) return null;
  return h("ul", { className: "rssh-attachments", "aria-label": t("acp.attachments") }, attachments.map((file) => h(file.type === "image" ? ImageAttachment : FileAttachment, { key: file.id, file, sending, onRemove, t })));
}

// src/client/sent-attachments-model.js
var IMAGE_TYPES2 = /* @__PURE__ */ new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
var isSentImage = (file) => file?.type === "image";
function sentAttachmentKey(context, turnId) {
  return context?.id && context?.dshSessionId && turnId ? JSON.stringify([String(context.id), String(context.dshSessionId), String(turnId)]) : null;
}
function sentImageURL(context, turnId, index) {
  if (!sentAttachmentKey(context, turnId) || !Number.isSafeInteger(index) || index < 0 || index >= 16) return null;
  return HTTP_BASE + "/message-image?" + new URLSearchParams({ id: context.id, dshSessionId: context.dshSessionId, turnId, index: String(index) });
}
function sentImagePresentation(file, index, response, context, turnId) {
  if (!isSentImage(file) || !sentAttachmentKey(context, turnId)) return { status: "unavailable" };
  if (!response) return { status: "loading" };
  if (response.status === "pending") return { status: "pending" };
  if (response.ok !== true || response.status !== "available") return { status: "unavailable" };
  const asset = Array.isArray(response.attachments) ? response.attachments.find((value) => value?.index === index) : null;
  if (!asset || asset.type !== "image" || asset.status !== "available" || !IMAGE_TYPES2.has(asset.mimeType)) return { status: "unavailable" };
  const src = sentImageURL(context, turnId, index);
  return src ? { status: "available", src, mimeType: asset.mimeType } : { status: "unavailable" };
}
function sentAttachmentName(file, index, t) {
  const name = typeof file?.name === "string" ? file.name.trim() : "";
  return name && name !== "attachment" ? name : `${t(isSentImage(file) ? "acp.imageAttachment" : "acp.fileAttachment")} ${index + 1}`;
}
function shouldLoadSentAttachments(key2, loaded, previousAttempt, attempt) {
  return !!key2 && !(loaded?.key === key2 && loaded.response?.ok === true && loaded.response?.status === "available" && previousAttempt === attempt);
}

// src/client/sent-attachments.js
function SentImage({ name, presentation, t }) {
  const [open, setOpen] = import_react8.default.useState(false), [failed, setFailed] = import_react8.default.useState(false), [ready, setReady] = import_react8.default.useState(false), [attempt, setAttempt] = import_react8.default.useState(0);
  const src = presentation.src;
  const status = failed ? "unavailable" : presentation.status;
  const label2 = status === "pending" ? t("acp.sentImagePending") : status === "unavailable" ? t("acp.sentImageUnavailable") : t("acp.imagePreviewLoading");
  const retry = () => {
    setFailed(false);
    setReady(false);
    setAttempt((value) => value + 1);
  };
  return h(
    "figure",
    { className: "rssh-sent-image" },
    h(
      "button",
      {
        type: "button",
        className: "rssh-sent-image-button",
        disabled: !src,
        "data-failed": failed ? "" : void 0,
        "aria-label": `${failed ? t("acp.retryImagePreview") : src ? t("acp.previewImage") : label2}: ${name}`,
        title: name,
        onClick: () => failed ? retry() : setOpen(true)
      },
      src && !failed ? h("img", { key: attempt, src, alt: name, loading: "lazy", decoding: "async", onLoad: () => setReady(true), onError: () => setFailed(true) }) : h("span", { className: "rssh-sent-image-placeholder" }, label2, failed ? h("span", { className: "rssh-sent-image-retry" }, t("acp.retryImagePreview")) : null),
      src && !failed && !ready ? h("span", { className: "rssh-sent-image-loading" }, t("acp.imagePreviewLoading")) : null
    ),
    h("figcaption", { title: name }, name),
    open && src ? h(ImagePreviewModal, { src, name, t, onClose: () => setOpen(false), onError: () => setFailed(true) }) : null
  );
}
function SentAttachments({ item, context, phase, t }) {
  const files = item.attachments || [], hasImages = files.some(isSentImage), key2 = sentAttachmentKey(context, item.turnId);
  const [loaded, setLoaded] = import_react8.default.useState(null), [attempt, setAttempt] = import_react8.default.useState(0);
  const previousAttempt = import_react8.default.useRef(0);
  import_react8.default.useEffect(() => {
    if (!hasImages || !shouldLoadSentAttachments(key2, loaded, previousAttempt.current, attempt)) return;
    previousAttempt.current = attempt;
    let live = true;
    const controller = new AbortController();
    api("messageAttachments", { id: context.id, dshSessionId: context.dshSessionId, turnId: item.turnId }, controller.signal).then((response2) => {
      if (live) setLoaded({ key: key2, response: response2 });
    });
    return () => {
      live = false;
      controller.abort();
    };
  }, [key2, hasImages, phase, attempt]);
  if (!files.length) return null;
  const response = loaded?.key === key2 ? loaded.response : null;
  const retryable = hasImages && key2 && response && (response.ok !== true || ["unavailable", "pending"].includes(response.status));
  return h(
    "div",
    { className: "rssh-sent-attachments", "aria-label": t("acp.sentAttachments") },
    h("div", { className: "rssh-sent-attachment-list" }, files.map((file, index) => {
      const name = sentAttachmentName(file, index, t);
      return isSentImage(file) ? h(SentImage, { key: JSON.stringify([key2, index]), name, t, presentation: sentImagePresentation(file, index, response, context, item.turnId) }) : h("span", { key: index, className: "rssh-message-attachment", title: name }, name);
    })),
    retryable ? h(ui.Button, { variant: "ghost", size: "sm", onClick: () => setAttempt((value) => value + 1) }, t("acp.retryImagePreview")) : null
  );
}

// src/client/stream-view-model.js
var payload = (item) => item?.type === "tool" ? item.tool : item?.type === "subagent" ? item.subagent : item;
var sequence2 = (item) => Number(item?.lastSeq ?? payload(item)?.seq ?? item?.seq ?? 0);
function activeRootScope(turns = {}, rootSessionId) {
  return Object.entries(turns).filter(([scope, turn]) => turn.status === "running" && (!rootSessionId || JSON.parse(scope)[0] === rootSessionId)).sort((a, b) => (b[1].startSeq || 0) - (a[1].startSeq || 0))[0]?.[0] || null;
}
function actionLabel(item, t, active = true) {
  const value = payload(item) || {};
  if (item?.type === "tool") return toolFlowModel(value).title || t("acp.tool");
  if (item?.type === "subagent") return String(value.title || value.description || t("acp.subagent"));
  if (item?.type === "plan") return active && value.entries?.find((entry) => entry.status === "in_progress")?.content || t("acp.plan");
  if (item?.type === "terminal_event") return String(value.command || t("acp.terminalEvent"));
  return t(item?.type === "thought" ? active ? "flow.thinking" : "acp.thought" : active ? "flow.working" : "flow.process");
}
function processCategorySummary(entry, t) {
  const counts = /* @__PURE__ */ new Map();
  const tools = { read: "Read", edit: "Edit", execute: "Execute", search: "Search" };
  const types = { thought: "Thought", plan: "Plan", subagent: "Agent", terminal_event: "Execute" };
  for (const item of entry.items || []) {
    const kind = String(item.tool?.kind || "").toLowerCase();
    const category = item.type === "tool" ? Object.hasOwn(tools, kind) ? tools[kind] : "Tool" : Object.hasOwn(types, item.type) ? types[item.type] : "Tool";
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  const labels = [...counts].slice(0, 3).map(([category, count]) => `${t("flow.category" + category)} \xD7 ${count}`);
  if (counts.size > 3) labels.push(`+${counts.size - 3} ${t("flow.categoryOther")}`);
  return labels.join(" \xB7 ");
}
function processTreeSummary(entry, childMap = {}) {
  const seen = /* @__PURE__ */ new Set(), items = [], stack = [...entry.items || []];
  while (stack.length) {
    const item = stack.pop(), identity = item.key || acpItemId(item);
    if (seen.has(identity)) continue;
    seen.add(identity);
    items.push(item);
    for (const child of childMap[acpItemId(item)] || []) stack.push(child);
  }
  const own = processGroupSummary(entry), all = processGroupSummary({ ...entry, items });
  return { ...own, failedCount: all.failedCount };
}
function conversationActivity(state) {
  if (!state.connected) return { kind: state.everConnected ? "reconnecting" : "connecting" };
  if (state.permissions?.length) return { kind: "permission" };
  if (state.elicitations?.length) return { kind: "question" };
  if (!state.running) return { kind: "idle" };
  const scope = activeRootScope(state.turns, state.binding?.sessionId);
  if (!scope) return { kind: "working" };
  const items = (state.items || []).filter((item) => transcriptScope(item) === scope).sort((a, b) => sequence2(a) - sequence2(b));
  const active = items.filter((item) => item.type === "tool" ? toolFlowModel(item.tool).running : item.type === "subagent" ? acpNativeState(item.subagent?.state ?? item.subagent?.status).dot === "ongoing" : false);
  if (active.length) return { kind: "activity", item: active.at(-1), count: active.length, scope };
  const latest = items.at(-1);
  return { kind: latest?.type === "assistant" ? "replying" : latest?.type === "thought" && latest.streaming !== false ? "thinking" : "working", scope, item: latest };
}
function responseCopyParts(item, entry = {}) {
  const part = String(item?.text || "");
  const turn = entry.responseTail && entry.responseText && entry.responseText !== part ? entry.responseText : null;
  return { part, turn };
}

// src/client/transcript.js
var messages2 = {
  zh: {
    "flow.you": "\u4F60\u7684\u6D88\u606F",
    "flow.agent": "Agent \u56DE\u590D",
    "flow.copy": "\u590D\u5236",
    "flow.copied": "\u5DF2\u590D\u5236",
    "flow.copyFailed": "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u9009\u4E2D\u6587\u5B57\u624B\u52A8\u590D\u5236\u3002",
    "flow.copyCommand": "\u590D\u5236\u547D\u4EE4",
    "flow.categoryTool": "\u5DE5\u5177",
    "flow.categoryRead": "\u8BFB\u53D6",
    "flow.categoryEdit": "\u7F16\u8F91",
    "flow.categoryExecute": "\u547D\u4EE4",
    "flow.categorySearch": "\u641C\u7D22",
    "flow.categoryThought": "\u601D\u8003",
    "flow.categoryPlan": "\u8BA1\u5212",
    "flow.categoryAgent": "\u5B50\u4EFB\u52A1",
    "flow.categoryOther": "\u5176\u4ED6\u7C7B\u578B",
    "flow.copyPart": "\u590D\u5236\u8FD9\u6BB5\u56DE\u590D",
    "flow.copyTurn": "\u590D\u5236\u672C\u8F6E\u56DE\u590D",
    "flow.process": "\u6267\u884C\u8FC7\u7A0B",
    "flow.processCount": "\u9879\u8BB0\u5F55",
    "flow.stopped": "\u5DF2\u505C\u6B62",
    "flow.interrupted": "\u5DF2\u4E2D\u65AD",
    "flow.ended": "\u5DF2\u7ED3\u675F",
    "flow.hadFailures": "\u542B\u5931\u8D25\u8BB0\u5F55",
    "flow.thinking": "\u601D\u8003\u4E2D",
    "flow.runningCount": "\u9879\u8FDB\u884C\u4E2D",
    "flow.permissionRecorded": "\u6743\u9650\u786E\u8BA4\u5DF2\u5904\u7406",
    "flow.permissionAllowed": "\u5DF2\u5141\u8BB8\u6B64\u64CD\u4F5C",
    "flow.permissionDenied": "\u5DF2\u62D2\u7EDD\u6B64\u64CD\u4F5C",
    "flow.questionRecorded": "\u63D0\u95EE\u5DF2\u5904\u7406",
    "flow.questionDeclined": "\u5DF2\u8DF3\u8FC7\u6B64\u95EE\u9898",
    "flow.permissionCancelled": "\u6743\u9650\u786E\u8BA4\u5DF2\u53D6\u6D88",
    "flow.questionCancelled": "\u63D0\u95EE\u5DF2\u53D6\u6D88",
    "flow.latest": "\u56DE\u5230\u6700\u65B0\u6D88\u606F",
    "flow.replying": "\u6B63\u5728\u751F\u6210\u56DE\u590D",
    "flow.waitingPermission": "\u7B49\u5F85\u6743\u9650\u786E\u8BA4",
    "flow.waitingQuestion": "\u7B49\u5F85\u4F60\u7684\u56DE\u7B54",
    "flow.working": "\u7B49\u5F85 Agent \u8FDB\u5C55",
    "flow.connecting": "\u6B63\u5728\u8FDE\u63A5",
    "flow.connection": "\u6B63\u5728\u6062\u590D\u8FDE\u63A5",
    "flow.source": "\u6765\u6E90\u672A\u5173\u8054"
  },
  en: {
    "flow.you": "Your message",
    "flow.agent": "Agent response",
    "flow.copy": "Copy",
    "flow.copied": "Copied",
    "flow.copyFailed": "Copy failed. Select the text and copy manually.",
    "flow.copyCommand": "Copy command",
    "flow.categoryTool": "Tools",
    "flow.categoryRead": "Reads",
    "flow.categoryEdit": "Edits",
    "flow.categoryExecute": "Commands",
    "flow.categorySearch": "Searches",
    "flow.categoryThought": "Reasoning",
    "flow.categoryPlan": "Plans",
    "flow.categoryAgent": "Agents",
    "flow.categoryOther": "other types",
    "flow.copyPart": "Copy this response",
    "flow.copyTurn": "Copy turn responses",
    "flow.process": "Activity",
    "flow.processCount": "records",
    "flow.stopped": "Stopped",
    "flow.interrupted": "Interrupted",
    "flow.ended": "Ended",
    "flow.hadFailures": "Includes failed steps",
    "flow.thinking": "Thinking",
    "flow.runningCount": "active",
    "flow.permissionRecorded": "Permission request handled",
    "flow.permissionAllowed": "Operation allowed",
    "flow.permissionDenied": "Operation denied",
    "flow.questionRecorded": "Question handled",
    "flow.questionDeclined": "Question skipped",
    "flow.permissionCancelled": "Permission request cancelled",
    "flow.questionCancelled": "Question cancelled",
    "flow.latest": "Jump to latest",
    "flow.replying": "Generating a response",
    "flow.waitingPermission": "Awaiting permission",
    "flow.waitingQuestion": "Awaiting your answer",
    "flow.working": "Waiting for Agent progress",
    "flow.connecting": "Connecting",
    "flow.connection": "Reconnecting",
    "flow.source": "Unlinked source"
  }
};
function Transcript({ items, running, turns = {}, preferences, t, labels, openFile, renderFactorySlot, rootSessionId, attachmentContext }) {
  const [manual, setManual] = import_react9.default.useState({});
  const policy = transcriptPolicy(preferences, "standard");
  const built = acpBuildChildMap(items);
  const top = items.filter((item) => !built.parents[acpItemId(item)]);
  const entries = transcriptEntries(top, { turns });
  const activeScope = running ? activeRootScope(turns, rootSessionId) : null;
  const copyLabels = { copy: t("flow.copy"), copied: t("flow.copied"), copyFailed: t("flow.copyFailed") };
  function renderNested(children, ancestors) {
    return h("div", { className: "rssh-flow-children" }, transcriptEntries(children, { turns }).map((entry) => entry.kind === "process" ? h("div", { key: entry.key, className: "rssh-process-rows" }, entry.items.map((item) => render(item, {}, ancestors))) : render(entry.item, entry, ancestors)));
  }
  function render(item, entry = {}, ancestors = []) {
    const id = acpItemId(item), fallback = built.fallbacks[id];
    const common = {
      key: item.key || id,
      item,
      t,
      labels,
      childMap: built.map,
      fallbacks: built.fallbacks,
      sourceFallback: fallback,
      onOpenOutput: openFile,
      ancestors,
      running,
      turns,
      showProcessSummary: policy.showProcessSummary,
      transcriptItems: items,
      renderFactorySlot,
      renderNested
    };
    switch (item.type) {
      case "user":
        return h(
          "article",
          { key: item.key, className: "rssh-message rssh-message-user", "aria-label": t("flow.you") },
          h(
            "div",
            { className: "rssh-user-stack" },
            String(item.text || "").trim() ? h("div", { className: "rssh-user-bubble" }, item.text) : null,
            item.attachments?.length ? h(SentAttachments, {
              item,
              t,
              context: !ancestors.length && (!item.rootSessionId || item.rootSessionId === item.sessionId) ? attachmentContext : null,
              phase: JSON.stringify([item.delivery, turns[transcriptScope(item)]?.startSeq, turns[transcriptScope(item)]?.endSeq, turns[transcriptScope(item)]?.status])
            }) : null,
            ["queued", "cancelled"].includes(item.delivery) ? h("span", { className: "rssh-message-delivery" }, t(item.delivery === "queued" ? "acp.steerQueued" : "acp.inputCancelled")) : null,
            String(item.text || "").trim() ? h("div", { className: "rssh-message-actions rssh-user-actions" }, h(ui.CopyButton, { text: item.text, labels: copyLabels, iconOnly: true })) : null
          ),
          fallback ? h(AcpSourceFallback, { item, fallback, t }) : null
        );
      case "assistant": {
        const turn = entry.turn || turns[transcriptScope(item)];
        const streaming = running && transcriptScope(item) === activeScope && entry.responseTail === true && (!turn || turn.status === "running");
        const copy = responseCopyParts(item, entry);
        return h(
          "article",
          { key: item.key, className: "rssh-message rssh-message-assistant", "aria-label": t("flow.agent"), "data-streaming": streaming ? "" : void 0 },
          fallback ? h(AcpSourceFallback, { item, fallback, t }) : null,
          h(ui.MarkdownText, { text: item.text, labels: labels.markdown }),
          h(
            "div",
            { className: "rssh-message-actions rssh-assistant-actions" },
            h(ui.CopyButton, { text: copy.part, labels: { ...copyLabels, copy: t("flow.copyPart") }, iconOnly: true }),
            copy.turn && !streaming ? h(ui.CopyButton, { text: copy.turn, labels: { ...copyLabels, copy: t("flow.copyTurn") } }) : null,
            entry.responseTail && (turn?.status === "cancelled" || turn?.status === "interrupted") ? h("span", { className: "rssh-interrupted" }, t(turn.status === "cancelled" ? "flow.stopped" : "flow.interrupted")) : null
          )
        );
      }
      case "thought":
        return h(
          import_react9.default.Fragment,
          { key: item.key },
          fallback ? h(AcpSourceFallback, { item, fallback, t }) : null,
          h(AcpThought, { ...common, showPreview: policy.showSettledReasoning, running: thoughtIsStreaming(item, items, running) })
        );
      case "tool":
        return h(AcpToolCard, { ...common, tool: item.tool });
      case "subagent":
        return h(AcpSubagentCard, { ...common, subagent: item.subagent, _key: item._key });
      case "plan":
        return h(AcpPlanCard, { ...common, ...item });
      case "state":
        return h(AcpStateCard, common);
      case "session_message":
        return h(AcpSessionMessageCard, common);
      case "terminal_event":
        return h(AcpTerminalEventCard, common);
      case "native_event":
        return h(AcpNativeEventCard, common);
      case "compaction":
        return h(AcpCompactionCard, common);
      case "notice":
        return h(AcpNoticeCard, common);
      case "interaction_receipt":
        return h(AcpInteractionReceipt, common);
      default:
        return h(
          "div",
          { key: item.key, className: item.type === "error" ? "ra-acp-error" : "ra-acp-system", role: item.type === "error" ? "alert" : void 0 },
          fallback ? h(AcpSourceFallback, { item, fallback, t }) : null,
          item.type === "system" && item.stopReason === "cancelled" ? t("flow.stopped") : item.text
        );
    }
  }
  return entries.map((entry) => {
    if (entry.kind !== "process") return h("div", { key: entry.key, className: "rssh-transcript-item", "data-transcript-anchor": entry.key, ...historyAnchorAttributes(entry), "data-flow-kind": entry.item.type }, render(entry.item, entry));
    const facts = processTreeSummary(entry, built.map);
    const current = facts.runningItem;
    const live = !!(running && entry.scope === activeScope && !entry.settled && current && (current.type !== "thought" || thoughtIsStreaming(current, items, running)));
    const summary = [
      policy.showProcessSummary ? live ? actionLabel(current, t) : processCategorySummary(entry, t) : null,
      facts.failedCount ? `${t("flow.hadFailures")} ${facts.failedCount}` : null
    ].filter(Boolean).join(" \xB7 ");
    const presentation = processGroupPresentation(entry, policy, manual[entry.key]);
    return h(
      "div",
      { key: entry.key, className: "rssh-process-group", "data-transcript-anchor": entry.key, ...historyAnchorAttributes(entry), "data-flow-kind": "process" },
      h(ownedDisclosure, {
        className: "rssh-process-disclosure",
        title: t("flow.process"),
        summary,
        icon: h(FlowIcon, { kind: "tool" }),
        ...presentation,
        onOpenChange: (open) => setManual((previous) => ({ ...previous, [entry.key]: { open } })),
        onRead: () => setManual((previous) => {
          const saved = previous[entry.key], readingFlat = !!(saved?.readingFlat || presentation.flat);
          return saved?.open && saved.readingFlat === readingFlat ? previous : { ...previous, [entry.key]: { open: true, readingFlat } };
        }),
        scrollRunning: !!(running && entry.scope === activeScope && !entry.settled),
        running: live,
        status: entry.settled ? t(entry.interrupted ? "flow.interrupted" : "flow.ended") : live ? t("acp.running") : void 0,
        children: () => entry.items.map((item) => render(item))
      })
    );
  });
}
function RunningTail({ state, t }) {
  const activity = conversationActivity(state);
  if (activity.kind === "idle") return null;
  const keys = { connecting: "flow.connecting", reconnecting: "flow.connection", permission: "flow.waitingPermission", question: "flow.waitingQuestion", replying: "flow.replying", thinking: "flow.thinking", working: "flow.working" };
  const label2 = activity.kind === "activity" ? [actionLabel(activity.item, t), activity.count > 1 ? `${activity.count} ${t("flow.runningCount")}` : null].filter(Boolean).join(" \xB7 ") : t(keys[activity.kind]);
  const waiting = ["permission", "question"].includes(activity.kind);
  return h("div", { className: "rssh-running-tail", role: "status" }, h(ui.StateDot, { state: waiting ? "warning" : activity.kind === "working" ? "idle" : "ongoing" }), h("span", null, label2));
}

// src/client/transcript-scroll.js
var import_react10 = __toESM(require("react"), 1);

// src/client/history-pager.js
var HISTORY_EDGE = 160;
function scrollBoxConsumesUpward({ scrollHeight, clientHeight, scrollTop, overflowY, overscrollBehaviorY }) {
  return /^(auto|scroll)$/.test(overflowY) && (overscrollBehaviorY === "contain" || overscrollBehaviorY === "none" || scrollHeight > clientHeight && scrollTop > 0);
}
var HistoryPager = class {
  constructor({ getPage, load, changed, maxBurst = 3 }) {
    this.getPage = getPage;
    this.load = load;
    this.changed = changed;
    this.maxBurst = maxBurst;
    this.active = false;
    this.identity = null;
    this.epoch = 0;
    this.pending = null;
    this.budget = 0;
    this.state = { loading: false, error: null };
  }
  publish(patch) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  activate(active, identity) {
    this.epoch++;
    this.active = active;
    this.identity = identity;
    this.budget = 0;
    this.publish({ loading: false, error: null });
  }
  pause() {
    this.budget = 0;
  }
  check(metrics, { gesture = false, retry = false } = {}) {
    if (!this.active) return Promise.resolve();
    const page = { ...this.getPage() };
    if (!page?.ready || page.identity !== this.identity || !page.hasEarlier) return Promise.resolve();
    if (gesture || retry) this.budget = this.maxBurst;
    if (this.pending) return this.pending;
    if (!metrics || metrics.clientHeight <= 0 || metrics.scrollTop > HISTORY_EDGE || !this.budget || this.state.error && !retry) return Promise.resolve();
    if (!Number.isSafeInteger(page.beforeSeq) || page.beforeSeq < 1) {
      this.publish({ error: { code: "history_no_progress" } });
      return Promise.resolve();
    }
    const epoch = this.epoch;
    this.budget--;
    const task = Promise.resolve().then(() => {
      if (!this.active || epoch !== this.epoch) return;
      this.publish({ loading: true, error: null });
      return this.load(page);
    }).then(() => {
      if (!this.active || epoch !== this.epoch) return;
      const next = this.getPage();
      if (next?.identity === page.identity && next.hasEarlier && (!Number.isSafeInteger(next.beforeSeq) || next.beforeSeq >= page.beforeSeq))
        this.publish({ error: { code: "history_no_progress" } });
    }).catch((error) => {
      if (this.active && epoch === this.epoch) this.publish({ error: { code: error.code || "history_failed", message: error.message } });
    }).finally(() => {
      if (this.pending !== task) return;
      this.pending = null;
      if (this.active) this.publish({ loading: false });
    });
    this.pending = task;
    return task;
  }
};

// src/client/transcript-scroll.js
function readingAnchorScrollTop(saved, current) {
  if (!saved || !current || current.following || !current.visible || !mayRestoreTranscriptAnchor({
    startedAtGeneration: saved.interaction,
    currentGeneration: current.interaction,
    sameViewport: saved.viewport === current.viewport && saved.content === current.content && saved.lifetime === current.lifetime,
    live: current.live
  })) return null;
  if (![saved.offset, current.offset, current.scrollTop].every(Number.isFinite)) return null;
  return anchoredScrollTop({ currentTop: current.scrollTop, previousOffset: saved.offset, nextOffset: current.offset });
}
function useTranscriptScroll(identity, items, ready = true, history) {
  const viewportRef = import_react10.default.useRef(null), contentRef = import_react10.default.useRef(null);
  const follow = import_react10.default.useRef(true), frame = import_react10.default.useRef(null), live = import_react10.default.useRef(false);
  const interaction = import_react10.default.useRef(0), expectedScroll = import_react10.default.useRef(null), pendingPrepend = import_react10.default.useRef(null);
  const scrollIntent = import_react10.default.useRef(false), touchPoint = import_react10.default.useRef(null);
  const lastScrollTop = import_react10.default.useRef(0), pendingRestore = import_react10.default.useRef(null), lifetime = import_react10.default.useRef(0);
  const readingAnchor = import_react10.default.useRef(null);
  const historyRef = import_react10.default.useRef(history);
  historyRef.current = history;
  const [following, setFollowing] = import_react10.default.useState(true), [prepending, setPrepending] = import_react10.default.useState(false);
  const [showLatest, setShowLatest] = import_react10.default.useState(false), [historyStatus, setHistoryStatus] = import_react10.default.useState({ loading: false, error: null });
  const pagerRef = import_react10.default.useRef(null);
  if (!pagerRef.current) pagerRef.current = new HistoryPager({
    getPage: () => historyRef.current?.getPage(),
    load: (page) => prepend((beforeApply, canApply) => historyRef.current.load(page, beforeApply, canApply)),
    changed: (state) => {
      if (live.current) {
        setHistoryStatus(state);
        schedule();
      }
    }
  });
  const setFollow = (value) => {
    follow.current = value;
    setFollowing(value);
  };
  const requestHistory = (options) => pagerRef.current.check(viewportRef.current, options);
  const measureTail = (viewport) => {
    const atTail = followsTranscriptTail(viewport);
    setShowLatest(!atTail);
    return atTail;
  };
  const writeScroll = (viewport, top) => {
    expectedScroll.current = Math.max(0, Math.min(top, Math.max(0, viewport.scrollHeight - viewport.clientHeight)));
    viewport.scrollTop = expectedScroll.current;
    lastScrollTop.current = viewport.scrollTop;
    measureTail(viewport);
  };
  function pauseReading() {
    interaction.current++;
    scrollIntent.current = false;
    pagerRef.current.pause();
    setFollow(false);
  }
  function captureReading(anchor) {
    const viewport = viewportRef.current, content = contentRef.current;
    if (!live.current || !viewport || !content || anchor?.nodeType !== 1 || !content.contains(anchor)) return;
    pauseReading();
    readingAnchor.current = {
      anchor,
      viewport,
      content,
      lifetime: lifetime.current,
      interaction: interaction.current,
      offset: anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top
    };
    schedule();
  }
  function restoreReadingAnchor() {
    const saved = readingAnchor.current;
    if (!saved) return;
    readingAnchor.current = null;
    if (!mayRestoreTranscriptAnchor({
      startedAtGeneration: saved.interaction,
      currentGeneration: interaction.current,
      sameViewport: viewportRef.current === saved.viewport && contentRef.current === saved.content && lifetime.current === saved.lifetime,
      live: live.current
    }) || follow.current) return;
    if (!saved.anchor.isConnected || !saved.content.contains(saved.anchor) || !saved.anchor.getClientRects().length) return;
    const offset = saved.anchor.getBoundingClientRect().top - saved.viewport.getBoundingClientRect().top;
    const top = readingAnchorScrollTop(saved, {
      viewport: viewportRef.current,
      content: contentRef.current,
      lifetime: lifetime.current,
      interaction: interaction.current,
      live: live.current,
      following: follow.current,
      visible: true,
      offset,
      scrollTop: saved.viewport.scrollTop
    });
    if (top !== null) writeScroll(saved.viewport, top);
  }
  function onReadingIntent(event) {
    if (event.detail?.afterLayout) {
      if (readingAnchor.current?.anchor === event.detail.anchor) restoreReadingAnchor();
    } else captureReading(event.detail?.anchor);
  }
  function onReadingClick(event) {
    const target = event.target?.closest?.('button,summary,[role="button"]');
    if (event.isTrusted && target) captureReading(target);
  }
  const schedule = () => {
    if (!live.current || frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const viewport = viewportRef.current;
      if (!live.current || !viewport) return;
      if (follow.current) writeScroll(viewport, viewport.scrollHeight);
      else {
        restoreReadingAnchor();
        measureTail(viewport);
        requestHistory();
      }
    });
  };
  function measurements(viewport, content) {
    const edge = viewport.getBoundingClientRect().top;
    return [...content.querySelectorAll("[data-transcript-anchor]")].filter((node) => node.getClientRects().length).map((node) => {
      const bounds = node.getBoundingClientRect();
      return {
        key: node.dataset.transcriptAnchor,
        top: bounds.top - edge,
        bottom: bounds.bottom - edge,
        members: JSON.parse(node.dataset.historyMembers || "[]"),
        ranges: JSON.parse(node.dataset.historyRanges || "[]"),
        versions: JSON.parse(node.dataset.historyVersions || "{}")
      };
    });
  }
  function restorePrepend() {
    const saved = pendingRestore.current;
    if (!saved) return;
    pendingRestore.current = null;
    if (!mayRestoreTranscriptAnchor({
      startedAtGeneration: saved.interaction,
      currentGeneration: interaction.current,
      sameViewport: viewportRef.current === saved.viewport && contentRef.current === saved.content && lifetime.current === saved.lifetime,
      live: live.current
    }) || follow.current) return;
    const adjustment = historyAnchorAdjustment(saved.anchors, measurements(saved.viewport, saved.content));
    if (adjustment) writeScroll(saved.viewport, anchoredScrollTop({ currentTop: saved.viewport.scrollTop, ...adjustment }));
  }
  import_react10.default.useLayoutEffect(() => {
    lifetime.current++;
    live.current = true;
    setFollow(true);
    setShowLatest(false);
    setPrepending(false);
    interaction.current++;
    expectedScroll.current = null;
    pendingRestore.current = null;
    readingAnchor.current = null;
    scrollIntent.current = false;
    touchPoint.current = null;
    const viewport = viewportRef.current, content = contentRef.current;
    lastScrollTop.current = viewport?.scrollTop || 0;
    pagerRef.current.activate(ready, identity);
    const observer = viewport && content ? new ResizeObserver(schedule) : null;
    if (observer) {
      observer.observe(viewport);
      observer.observe(content);
    }
    viewport?.addEventListener("rssh:reading-intent", onReadingIntent);
    viewport?.addEventListener("click", onReadingClick, true);
    schedule();
    return () => {
      live.current = false;
      lifetime.current++;
      pendingRestore.current = null;
      readingAnchor.current = null;
      viewport?.removeEventListener("rssh:reading-intent", onReadingIntent);
      viewport?.removeEventListener("click", onReadingClick, true);
      pagerRef.current.activate(false, identity);
      observer?.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [identity, ready]);
  import_react10.default.useLayoutEffect(() => {
    restorePrepend();
    schedule();
  }, [items]);
  const isNestedScroll = (event, upwards = null) => {
    if (!event.currentTarget || !event.target) return false;
    let node = event.target.nodeType === 1 ? event.target : event.target.parentElement;
    for (; node && node !== event.currentTarget; node = node.parentElement) {
      if (node.matches('input,textarea,select,[contenteditable="true"]')) return true;
      const style = getComputedStyle(node);
      if (scrollBoxConsumesUpward({
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
        scrollTop: upwards === null ? 1 : upwards ? node.scrollTop : node.scrollHeight - node.clientHeight - node.scrollTop,
        overflowY: style.overflowY,
        overscrollBehaviorY: style.overscrollBehaviorY
      })) return true;
    }
    return false;
  };
  const onScroll = (event) => {
    if (event && event.target !== event.currentTarget) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (readingAnchor.current?.interaction === interaction.current) {
      measureTail(viewport);
      return;
    }
    const user = expectedScroll.current === null || Math.abs(viewport.scrollTop - expectedScroll.current) > 1;
    const upwards = viewport.scrollTop < lastScrollTop.current;
    const downwards = viewport.scrollTop > lastScrollTop.current;
    expectedScroll.current = null;
    lastScrollTop.current = viewport.scrollTop;
    if (user) {
      interaction.current++;
      setFollow(measureTail(viewport));
      if (upwards && scrollIntent.current) requestHistory({ gesture: true });
      else if (downwards) {
        scrollIntent.current = false;
        pagerRef.current.pause();
      }
    } else measureTail(viewport);
  };
  const onWheel = (event) => {
    if (!event.deltaY || event.ctrlKey || isNestedScroll(event, event.deltaY < 0)) return;
    interaction.current++;
    if (event.deltaY < 0) {
      scrollIntent.current = true;
      setFollow(false);
      requestHistory({ gesture: true });
    } else if (event.deltaY > 0) {
      scrollIntent.current = false;
      pagerRef.current.pause();
    }
  };
  const onKeyDown = (event) => {
    if (event.defaultPrevented || event.altKey || isNestedScroll(event, ["ArrowUp", "PageUp", "Home"].includes(event.key))) return;
    if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
      interaction.current++;
      scrollIntent.current = true;
      setFollow(false);
      requestHistory({ gesture: true });
    } else if (["ArrowDown", "PageDown", "End"].includes(event.key)) {
      interaction.current++;
      readingAnchor.current = null;
      scrollIntent.current = false;
      pagerRef.current.pause();
    }
  };
  const onPointerDown = (event) => {
    if (event.button !== 0 || isNestedScroll(event)) return;
    const control = event.target.closest('button,summary,[role="button"]');
    if (control) {
      captureReading(control);
      return;
    }
    if (event.target.closest("a,input,select,textarea")) return;
    interaction.current++;
    readingAnchor.current = null;
    scrollIntent.current = event.target === event.currentTarget;
    setFollow(false);
    pagerRef.current.pause();
  };
  const onTouchStart = (event) => {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    touchPoint.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    if (!touch) {
      scrollIntent.current = false;
      pagerRef.current.pause();
    }
  };
  const onTouchMove = (event) => {
    const previous = touchPoint.current, touch = event.touches.length === 1 ? event.touches[0] : null;
    if (!previous || !touch) {
      touchPoint.current = null;
      return;
    }
    const dx = touch.clientX - previous.x, dy = touch.clientY - previous.y;
    touchPoint.current = { x: touch.clientX, y: touch.clientY };
    if (event.defaultPrevented || Math.abs(dy) <= Math.abs(dx) || isNestedScroll(event, dy > 0)) return;
    interaction.current++;
    if (dy > 0) {
      scrollIntent.current = true;
      setFollow(false);
      requestHistory({ gesture: true });
    } else {
      scrollIntent.current = false;
      pagerRef.current.pause();
    }
  };
  const onTouchEnd = () => {
    touchPoint.current = null;
  };
  const latest = () => {
    interaction.current++;
    readingAnchor.current = null;
    scrollIntent.current = false;
    pagerRef.current.pause();
    setFollow(true);
    schedule();
  };
  const retryHistory = () => {
    viewportRef.current?.focus({ preventScroll: true });
    setFollow(false);
    requestHistory({ retry: true });
  };
  function prepend(load) {
    if (pendingPrepend.current) return pendingPrepend.current;
    const viewport = viewportRef.current, content = contentRef.current;
    if (!viewport || !content) return Promise.resolve();
    const epoch = lifetime.current;
    setFollow(false);
    setPrepending(true);
    const beforeApply = () => {
      if (!live.current || lifetime.current !== epoch || follow.current || viewportRef.current !== viewport || contentRef.current !== content) return;
      pendingRestore.current = {
        task,
        viewport,
        content,
        lifetime: epoch,
        interaction: interaction.current,
        anchors: measurements(viewport, content).filter((anchor) => anchor.bottom > 0)
      };
    };
    const canApply = () => live.current && lifetime.current === epoch && viewportRef.current === viewport && contentRef.current === content;
    const task = Promise.resolve().then(() => load(beforeApply, canApply)).then(async () => {
      if (!live.current || lifetime.current !== epoch) return;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (pendingRestore.current?.task === task) restorePrepend();
    }).finally(() => {
      if (pendingRestore.current?.task === task) pendingRestore.current = null;
      if (pendingPrepend.current === task) pendingPrepend.current = null;
      if (live.current && lifetime.current === epoch) setPrepending(false);
    });
    pendingPrepend.current = task;
    return task;
  }
  return {
    viewportRef,
    contentRef,
    following,
    showLatest,
    prepending,
    history: historyStatus,
    retryHistory,
    onScroll,
    onWheel,
    onKeyDown,
    onPointerDown,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    latest,
    prepend
  };
}

// src/client/status.js
var import_react11 = __toESM(require("react"), 1);
var messages3 = {
  zh: {
    "status.starting": "\u6B63\u5728\u542F\u52A8\u8FDC\u7AEF Agent",
    "status.startingHint": "\u6B63\u5728\u5EFA\u7ACB SSH \u8FDE\u63A5\u5E76\u542F\u52A8\u4F1A\u8BDD\uFF0C\u8BF7\u7A0D\u5019\u3002",
    "status.failed": "\u65E0\u6CD5\u542F\u52A8\u8FDC\u7AEF\u4F1A\u8BDD",
    "status.prepareRequired": "\u8FDC\u7AEF\u8FD0\u884C\u73AF\u5883\u5C1A\u672A\u5C31\u7EEA",
    "status.nodeMissing": "\u8FDC\u7AEF\u7F3A\u5C11 Node.js",
    "status.connectionFailed": "\u8FDE\u63A5\u6216\u8BA4\u8BC1\u5931\u8D25",
    "status.sessionMissing": "\u672A\u627E\u5230\u5BF9\u5E94\u7684\u8FDC\u7AEF\u4F1A\u8BDD",
    "status.prepareHint": "\u9700\u8981\u5B89\u88C5\u56FA\u5B9A\u7248\u672C\u4F9D\u8D56\u540E\u624D\u80FD\u542F\u52A8\u3002",
    "status.nodeHint": "\u8BF7\u5728\u8FDC\u7AEF\u767B\u5F55 shell \u4E2D\u542F\u7528 Node.js 22+\uFF0C\u6216\u51C6\u5907\u8FD0\u884C\u73AF\u5883\u3002",
    "status.retry": "\u91CD\u8BD5",
    "status.retrying": "\u6B63\u5728\u91CD\u8BD5\u2026",
    "status.prepare": "\u51C6\u5907\u8FD0\u884C\u73AF\u5883",
    "status.close": "\u53D6\u6D88",
    "status.confirm": "\u786E\u8BA4\u5B89\u88C5\u4F9D\u8D56",
    "status.packages": "\u5C06\u5B89\u88C5\u7684\u4F9D\u8D56",
    "status.runtimeDir": "\u5B89\u88C5\u76EE\u5F55",
    "status.nodeRequirement": "Node.js \u8981\u6C42",
    "status.safety": "\u4E0D\u4F7F\u7528 sudo\u3001\u4E0D\u4FEE\u6539 shell \u914D\u7F6E\uFF0CAgent \u51ED\u636E\u4FDD\u7559\u5728\u8FDC\u7AEF\u3002"
  },
  en: {
    "status.starting": "Starting remote agent",
    "status.startingHint": "Opening the SSH connection and starting the session\u2026",
    "status.failed": "Could not start the remote session",
    "status.prepareRequired": "Remote runtime is not ready",
    "status.nodeMissing": "Remote Node.js is missing",
    "status.connectionFailed": "Connection or authentication failed",
    "status.sessionMissing": "The remote session was not found",
    "status.prepareHint": "Fixed-version dependencies must be installed first.",
    "status.nodeHint": "Enable Node.js 22+ in the remote login shell, or prepare the runtime.",
    "status.retry": "Retry",
    "status.retrying": "Retrying\u2026",
    "status.prepare": "Prepare runtime",
    "status.close": "Cancel",
    "status.confirm": "Install dependencies",
    "status.packages": "Packages to install",
    "status.runtimeDir": "Install directory",
    "status.nodeRequirement": "Node.js requirement",
    "status.safety": "No sudo, no shell changes; agent credentials stay on the remote host."
  }
};
function WarningIcon() {
  return h(
    "svg",
    { className: "rssh-status-icon", width: 32, height: 32, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    h("path", { d: "M12 3 2.6 20h18.8L12 3Z" }),
    h("path", { d: "M12 9.5v4.5" }),
    h("circle", { cx: 12, cy: 16.8, r: 0.5, fill: "currentColor", stroke: "none" })
  );
}
function ConversationStatus({ kind, title, description, code, nodeMissing, needsPrepare, meta, onRetry, onPrepare, busy }) {
  const t = useT();
  const error = kind === "error";
  return h(
    "section",
    { className: "rssh-status", "data-kind": kind, role: error ? "alert" : "status" },
    error ? h(WarningIcon) : h(
      "span",
      { className: "rssh-status-spinner", role: "img", "aria-label": title || t("status.starting") },
      h(
        "svg",
        { width: 28, height: 28, viewBox: "0 0 16 16", "aria-hidden": true },
        h("circle", { cx: 8, cy: 8, r: 6, fill: "none", stroke: "currentColor", strokeOpacity: 0.3, strokeWidth: 1.6 }),
        h("path", { d: "M8 2a6 6 0 0 1 6 6", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" })
      )
    ),
    h("h2", { className: "rssh-status-title" }, title || t(error ? "status.failed" : "status.starting")),
    error && code ? h("code", { className: "rssh-status-code" }, code) : null,
    error ? h("p", { className: "rssh-status-description" }, description || t("status.failed")) : null,
    error && needsPrepare ? h("p", { className: "rssh-status-note" }, t(nodeMissing ? "status.nodeHint" : "status.prepareHint")) : null,
    !error ? h("p", { className: "rssh-status-description" }, meta || t("status.startingHint")) : null,
    error ? h(
      "div",
      { className: "rssh-status-actions" },
      needsPrepare && onPrepare ? h(ui.Button, { variant: "primary", disabled: !!busy, onClick: onPrepare }, t("status.prepare")) : null,
      onRetry ? h(ui.Button, { variant: needsPrepare ? "ghost" : "primary", disabled: !!busy, onClick: onRetry }, busy ? t("status.retrying") : t("status.retry")) : null
    ) : null
  );
}
function PrepareRuntimeDialog({ plan, onConfirm, onClose, busy }) {
  const t = useT();
  const packages = Array.isArray(plan && plan.packages) ? plan.packages : [];
  return h(
    ui.Modal,
    {
      open: true,
      className: "rssh-prepare-dialog",
      title: t("status.prepare"),
      closeLabel: t("status.close"),
      onClose: () => {
        if (!busy) onClose();
      },
      footer: h(
        import_react11.default.Fragment,
        null,
        h(ui.Button, { variant: "ghost", disabled: !!busy, onClick: onClose }, t("status.close")),
        h(ui.Button, { variant: "primary", disabled: !!busy, onClick: onConfirm }, busy ? t("status.retrying") : t("status.confirm"))
      )
    },
    h(
      "div",
      { className: "rssh-prepare-body" },
      h("p", { className: "rssh-status-description" }, String(plan && plan.description || "")),
      plan && plan.runtimeDir ? h(
        "div",
        { className: "rssh-prepare-row" },
        h("span", { className: "rssh-prepare-label" }, t("status.runtimeDir")),
        h("code", { className: "rssh-status-code" }, String(plan.runtimeDir))
      ) : null,
      plan && plan.nodeRequirement ? h(
        "div",
        { className: "rssh-prepare-row" },
        h("span", { className: "rssh-prepare-label" }, t("status.nodeRequirement")),
        h("code", { className: "rssh-status-code" }, String(plan.nodeRequirement))
      ) : null,
      packages.length ? h(
        "div",
        { className: "rssh-prepare-packages" },
        h("span", { className: "rssh-prepare-label" }, t("status.packages")),
        h("ul", { className: "rssh-prepare-list" }, packages.map((pkg) => {
          const at = String(pkg).lastIndexOf("@");
          return h("li", { key: String(pkg) }, h("span", { className: "rssh-prepare-name" }, String(pkg).slice(0, at)), h("span", { className: "rssh-prepare-version" }, String(pkg).slice(at + 1)));
        }))
      ) : null,
      h("p", { className: "rssh-status-note" }, t("status.safety"))
    )
  );
}

// src/client/chat.js
function useClient(backend, clients) {
  const [client, setClient] = import_react12.default.useState(() => clients.peek(backend));
  const [error, setError] = import_react12.default.useState(null), [retry, setRetry] = import_react12.default.useState(0);
  const identity = JSON.stringify([sessionClientKey(backend), backend.binding?.id, backend.canonicalRemotePath]);
  import_react12.default.useEffect(() => {
    let lease;
    try {
      lease = clients.acquire(backend);
    } catch (failure) {
      setClient(null);
      setError(failure);
      return;
    }
    setError(null);
    setClient(lease.client);
    lease.client.ensureConnected();
    return () => lease.release();
  }, [clients, identity, retry]);
  return { client: client === clients.peek(backend) ? client : null, error, retry: () => setRetry((value) => value + 1) };
}
function ChatPane({ backend, clients, ...props }) {
  const t = useT(), binding = useClient(backend, clients), client = binding.client;
  return client ? h(ConnectedChatPane, { ...props, key: client.viewKey, backend, client }) : h(ConversationStatus, {
    kind: binding.error ? "error" : "loading",
    title: t(binding.error ? "session.setup.loadFailed" : "session.setup.loading"),
    description: binding.error?.message,
    onRetry: binding.error ? binding.retry : void 0
  });
}
function ConnectedChatPane({ backend, client, openRemoteFile, preferences, renderFactorySlot }) {
  const t = useT(), labels = acpBlockLabels(t), sid = backend.sessionId;
  const state = import_react12.default.useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const composer = client.composer;
  const composerState = import_react12.default.useSyncExternalStore(composer.subscribe, composer.getSnapshot, composer.getSnapshot);
  const { draft, attachments, sending } = composerState;
  const draftRef = import_react12.default.useRef(draft);
  draftRef.current = draft;
  const setDraft = (value) => {
    composer.setDraft(value);
    draftRef.current = composer.getSnapshot().draft;
  };
  const attachmentsRef = import_react12.default.useRef(attachments);
  attachmentsRef.current = attachments;
  const setAttachments = (value) => {
    composer.setAttachments(value);
    attachmentsRef.current = composer.getSnapshot().attachments;
  };
  const [readingFiles, setReadingFiles] = import_react12.default.useState(false);
  const attachmentInput = import_react12.default.useRef(null);
  const [busy, setBusy] = import_react12.default.useState("");
  const [actionError, setError] = import_react12.default.useState("");
  const error = actionError || composerState.error;
  const [preparePlan, setPreparePlan] = import_react12.default.useState(null);
  const [commandOpen, setCommandOpen] = import_react12.default.useState(false);
  const [fileQuery, setFileQuery] = import_react12.default.useState(null);
  const [fileOptions, setFileOptions] = import_react12.default.useState([]);
  const [choice, setChoice] = import_react12.default.useState(0);
  const pickerPanel = import_react12.default.useRef(null);
  const [pendingAnswers, setPendingAnswers] = import_react12.default.useState(/* @__PURE__ */ new Set());
  const alive = import_react12.default.useRef(false);
  import_react12.default.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const historyIdentity = (value) => JSON.stringify([sid, value.cursor.generation, value.replayRevision || 0]);
  const scroll = useTranscriptScroll(historyIdentity(state), state.items, !!state.binding && !state.loading && !state.failure, {
    getPage: () => {
      const value = client.getSnapshot();
      return {
        identity: historyIdentity(value),
        ready: !!value.binding && !value.loading && !value.failure,
        hasEarlier: value.hasEarlier,
        beforeSeq: value.oldestSeq
      };
    },
    load: (page, beforeApply, canApply) => client.history(page.beforeSeq, { beforeApply, canApply })
  });
  import_react12.default.useEffect(() => {
    if (fileQuery === null) {
      setFileOptions([]);
      return;
    }
    const controller = new AbortController();
    const slash = fileQuery.lastIndexOf("/"), directory = slash < 0 ? "." : fileQuery.slice(0, slash) || ".";
    const fragment = fileQuery.slice(slash + 1).toLowerCase();
    const timer = setTimeout(async () => {
      const result = await api("sessionFiles", { sessionId: sid, action: "list", path: directory }, controller.signal);
      if (controller.signal.aborted) return;
      setFileOptions(result.ok ? result.entries.filter((entry) => entry.name.toLowerCase().includes(fragment)).slice(0, 30).map((entry) => ({ ...entry, path: `${directory === "." ? "" : directory + "/"}${entry.name}` })) : []);
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [sid, fileQuery]);
  const commandQuery = draft.startsWith("/") ? draft.slice(1).trim() : "";
  const commands = acpCommandGroups(state.commands, commandQuery).flatMap((group) => group.items);
  function input(value) {
    setDraft(value);
    setChoice(0);
    setCommandOpen(value.startsWith("/") && !/\s/.test(value));
    setFileQuery(/(?:^|\s)@([^\s]*)$/.exec(value)?.[1] ?? null);
  }
  function chooseFile(file) {
    if (file.type === "directory") {
      input(draftRef.current.replace(/@[^\s]*$/, `@${file.path}/`));
      return;
    }
    if (attachments.length >= 16) {
      setError(t("acp.attachmentTooLarge"));
      return;
    }
    setAttachments((previous) => [...previous, { id: crypto.randomUUID(), path: file.path, name: file.name }]);
    input(draftRef.current.replace(/@[^\s]*$/, ""));
  }
  function chooseCommand(command) {
    input(`/${acpCommandName(command)} `);
    setCommandOpen(false);
  }
  async function send() {
    if (!client || sending || readingFiles || !draft.trim() && !attachments.length) return;
    setError("");
    scroll.latest();
    try {
      await client.sendDraft();
    } catch {
    }
  }
  async function action(method, payload2, key2 = method) {
    if (!client || busy) return;
    setBusy(key2);
    setError("");
    try {
      await client.action(method, payload2);
    } catch (failure) {
      if (alive.current) setError(failure.message);
    } finally {
      if (alive.current) setBusy("");
    }
  }
  async function answer(request, payload2, method) {
    if (!client || pendingAnswers.has(request.requestId)) return;
    setPendingAnswers((previous) => /* @__PURE__ */ new Set([...previous, request.requestId]));
    try {
      await client.action(method, { requestId: request.requestId, ...payload2 });
    } catch (failure) {
      if (alive.current) setError(failure.message);
    } finally {
      if (alive.current) setPendingAnswers((previous) => new Set([...previous].filter((id) => id !== request.requestId)));
    }
  }
  async function prepare(confirmed) {
    if (!client || busy) return;
    setBusy("prepare");
    setError("");
    try {
      const result = await client.prepare(confirmed);
      if (!alive.current) return;
      if (!confirmed) setPreparePlan(result.preparation);
      else {
        setPreparePlan(null);
        await client.connect();
      }
    } catch (failure) {
      if (alive.current) setError(failure.message);
    } finally {
      if (alive.current) setBusy("");
    }
  }
  async function openFile(path) {
    const result = await api("sessionBackend", { sessionId: sid });
    if (!alive.current) return;
    if (!result.ok) {
      setError(formatError(result));
      return;
    }
    let relative = String(path);
    if (relative.startsWith("/")) {
      const root = result.canonicalRemotePath?.replace(/\/$/, "");
      if (!root || !relative.startsWith(root + "/")) {
        setError(t("acp.pathUnavailable"));
        return;
      }
      relative = relative.slice(root.length + 1);
    }
    openRemoteFile(relative);
  }
  async function receiveFiles(files) {
    if (sending || readingFiles || !files.length) return;
    setReadingFiles(true);
    setError("");
    try {
      const received = [];
      for (const file of files) {
        const image = /^image\/(png|jpeg|webp|gif)$/.test(file.type);
        if (file.size > (image ? 2 : 1) * 1024 * 1024) {
          setError(t("acp.attachmentTooLarge"));
          return;
        }
        if (image) {
          if (!state.capabilities.promptCapabilities?.image) {
            setError(t("acp.attachmentUnsupported"));
            return;
          }
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
          received.push({ id: crypto.randomUUID(), type: "image", name: file.name, mimeType: file.type, data: btoa(binary) });
        } else if (/^text\//.test(file.type) || /\.(md|txt|json|ya?ml|csv|[cm]?jsx?|tsx?|py|go|rs|java|sh|sql|css|html)$/i.test(file.name)) {
          received.push({ id: crypto.randomUUID(), name: file.name, mimeType: file.type || "text/plain", text: await file.text() });
        } else {
          setError(t("acp.attachmentUnsupported"));
          return;
        }
      }
      if (!alive.current) return;
      const combined = [...attachmentsRef.current, ...received];
      const textBytes = combined.reduce((size, file) => size + new TextEncoder().encode(file.text || "").length, 0);
      const imageBytes = combined.reduce((size, file) => size + (file.data ? atob(file.data).length : 0), 0);
      if (combined.length > 16 || textBytes > 1048576 || imageBytes > 2097152) {
        setError(t("acp.attachmentTooLarge"));
        return;
      }
      setAttachments(combined);
    } catch (failure) {
      if (alive.current) setError(failure.message);
    } finally {
      if (alive.current) setReadingFiles(false);
    }
  }
  const configs = ["models", "reasoning"].flatMap((name) => {
    const config = state.config[name];
    if (!config?.options?.length) return [];
    const label2 = t(name === "models" ? "acp.model" : "acp.reasoning");
    return [h(
      "div",
      { key: name, className: "ra-acp-config" },
      h(Select, {
        label: label2,
        value: String(config.currentValue ?? ""),
        disabled: !!busy || sending,
        options: config.options.map((option) => ({ id: String(option.value), label: option.name || String(option.value) })),
        onChange: (value) => action("acpSetConfig", { configId: config.configId, value })
      })
    )];
  });
  const permission = state.config.modes?.availableModes?.length ? h(Select, {
    label: t("acp.mode"),
    value: state.config.modes.currentModeId,
    disabled: !!busy || sending,
    className: "rssh-permission-select",
    align: "start",
    icon: h(PermissionIcon),
    options: state.config.modes.availableModes.map((mode) => ({ id: mode.id, label: mode.name || mode.id })),
    onChange: (modeId) => action("acpSetMode", { modeId })
  }) : null;
  const waiting = state.permissions.length || state.elicitations.length;
  const hasVisibleContent = state.items.some(visibleTranscriptItem);
  const agentLabel = backend.backend?.type === "claude" ? "Claude Code" : backend.backend?.type === "codex" ? "Codex" : "";
  const remotePath = backend.workspace?.remotePath || backend.canonicalRemotePath || "";
  const startMeta = [agentLabel, remotePath].filter(Boolean).join(" \xB7 ");
  const activeChoice = Math.min(choice, Math.max((fileQuery !== null ? fileOptions : commands).length - 1, 0));
  import_react12.default.useLayoutEffect(() => {
    const panel = pickerPanel.current;
    const selected = panel?.children[activeChoice];
    if (!selected) return;
    panel.scrollTop = pickerScrollTop({
      scrollTop: panel.scrollTop,
      height: panel.clientHeight,
      itemTop: selected.offsetTop - panel.clientTop,
      itemHeight: selected.offsetHeight
    });
  }, [activeChoice, commandOpen, commandQuery, fileQuery, fileOptions, state.commands]);
  return h(
    "section",
    { className: "ra-acp-view", "aria-label": t("acp.hero") },
    preparePlan ? h(PrepareRuntimeDialog, { plan: preparePlan, onConfirm: () => prepare(true), onClose: () => {
      if (!busy) setPreparePlan(null);
    }, busy: !!busy }) : null,
    state.loading || !state.binding || state.failure ? h(ConversationStatus, {
      kind: state.loading ? "loading" : "error",
      code: state.failure?.code,
      description: state.error || state.failure?.error,
      needsPrepare: state.failure?.needsPrepare,
      nodeMissing: state.failure?.code === "remote_node_missing",
      meta: startMeta,
      onRetry: () => client?.connect(),
      onPrepare: () => prepare(false),
      busy: !!busy
    }) : h(
      "div",
      { className: "ra-acp" },
      error ? h("p", { role: "alert", className: "ra-acp-error rssh-output-alert" }, error) : null,
      !state.connected && state.transportError ? h("p", { role: "alert", className: "ra-acp-error rssh-output-alert" }, state.transportError) : null,
      state.binding.status === "error" ? h(ui.Button, { className: "rssh-output-retry", onClick: () => client.connect() }, t("acp.retry")) : null,
      h(
        "div",
        { className: "rssh-transcript-frame" },
        h(
          "div",
          { className: "ra-acp-messages", ref: scroll.viewportRef, tabIndex: 0, role: "region", "aria-label": t("acp.messageHistory"), onScroll: scroll.onScroll, onWheel: scroll.onWheel, onKeyDown: scroll.onKeyDown, onPointerDown: scroll.onPointerDown, onTouchStart: scroll.onTouchStart, onTouchMove: scroll.onTouchMove, onTouchEnd: scroll.onTouchEnd, onTouchCancel: scroll.onTouchEnd },
          h(
            "div",
            { className: "rssh-transcript-column", ref: scroll.contentRef },
            h(
              "div",
              { className: "rssh-history-status", "aria-busy": scroll.history.loading },
              h(
                "span",
                { role: scroll.history.error ? "alert" : "status", title: scroll.history.error?.message },
                scroll.history.error ? t(scroll.history.error.code === "history_no_progress" ? "acp.historyNoProgress" : "acp.historyFailed") : scroll.history.loading ? t("acp.historyLoading") : state.hasEarlier ? t("acp.historyScrollHint") : hasVisibleContent ? t("acp.historyStart") : ""
              ),
              scroll.history.error ? h(ui.Button, { variant: "ghost", size: "sm", onClick: scroll.retryHistory }, t("acp.historyRetry")) : null
            ),
            hasVisibleContent ? h(Transcript, { items: state.items, running: state.running, turns: state.turns, preferences, t, labels, openFile, renderFactorySlot, rootSessionId: state.binding.sessionId, attachmentContext: { id: state.binding.id, dshSessionId: sid } }) : null,
            !hasVisibleContent && !state.running && !waiting && state.connected ? h("div", { className: "ra-acp-empty-state" }, t("acp.emptyHint")) : null,
            h(RunningTail, { state, t })
          )
        ),
        scroll.showLatest ? h(ui.Button, { variant: "outline", className: "rssh-jump-latest", "aria-label": t("flow.latest"), title: t("flow.latest"), onClick: () => {
          scroll.latest();
          scroll.viewportRef.current?.focus({ preventScroll: true });
        } }, h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true }, h("path", { d: "m4 6 4 4 4-4" }))) : null
      ),
      waiting ? h(
        "div",
        { className: "ra-acp-perms" },
        state.permissions.map((request) => h(AcpPermissionCard, {
          key: request.requestId,
          permission: request,
          t,
          busy: pendingAnswers.has(request.requestId),
          onAnswer: (request2, optionId) => answer(request2, { optionId }, "acpPermission"),
          onDismiss: (request2) => answer(request2, { cancelled: true }, "acpPermission")
        })),
        state.elicitations.map((request) => h(AcpElicitationCard, { key: request.requestId, request, t, busy: pendingAnswers.has(request.requestId), onAnswer: (request2, result) => answer(request2, result, "acpElicitation") }))
      ) : null,
      !state.running && state.suggestions.length ? h(
        "div",
        { className: "ra-acp-suggestions", "aria-label": t("acp.suggestions") },
        state.suggestions.filter((value) => value.text && Array.isArray(value.content) && value.content.every((block) => block.type === "text")).map((value, index) => h(ui.Button, { key: index, variant: "ghost", size: "sm", onClick: () => input(value.text) }, value.text))
      ) : null,
      commandOpen || fileQuery !== null ? h(
        "div",
        { ref: pickerPanel, className: "ra-acp-cmd-panel", role: "dialog", "aria-label": t(fileQuery !== null ? "acp.fileMentions" : "acp.commandsPanel") },
        (fileQuery !== null ? fileOptions : commands).length === 0 ? h("div", { className: "ra-acp-cmd-empty", role: "status" }, t(fileQuery !== null ? "acp.noFiles" : "acp.noCommands")) : (fileQuery !== null ? fileOptions : commands).map((value, index) => h(
          ui.Button,
          {
            key: value.path || value.name,
            size: "sm",
            variant: "ghost",
            className: "ra-acp-cmd-row" + (index === activeChoice ? " ra-acp-command-selected" : ""),
            "aria-current": index === activeChoice ? "true" : void 0,
            title: value.description || value.path || `/${acpCommandName(value)}`,
            onClick: () => fileQuery !== null ? chooseFile(value) : chooseCommand(value)
          },
          h(
            "span",
            { className: "ra-acp-cmd-heading" },
            fileQuery !== null ? h(FileGlyph, { directory: value.type === "directory", name: value.name }) : null,
            h("span", { className: "ra-acp-cmd-label" }, fileQuery !== null ? value.path : `/${acpCommandName(value)}`)
          ),
          value.description ? h("small", { className: "ra-acp-cmd-description" }, value.description) : null
        ))
      ) : null,
      h(
        "div",
        {
          className: "ra-acp-composer",
          "data-empty": !hasVisibleContent ? "" : void 0,
          onDragOver: (event) => {
            if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
          },
          onDrop: (event) => {
            if (event.dataTransfer.files.length) {
              event.preventDefault();
              receiveFiles([...event.dataTransfer.files]);
            }
          }
        },
        h("input", {
          ref: attachmentInput,
          type: "file",
          hidden: true,
          multiple: true,
          disabled: sending || readingFiles,
          onChange: (event) => {
            const files = [...event.target.files];
            event.target.value = "";
            receiveFiles(files);
          }
        }),
        h(AttachmentList, { attachments, sending, t, onRemove: (id) => {
          if (!composer.getSnapshot().sending) setAttachments((old) => removeAttachmentById(old, id));
        } }),
        h("textarea", {
          className: "ra-acp-textarea",
          value: draft,
          rows: 1,
          readOnly: sending,
          "aria-label": t("acp.composerPlaceholder"),
          placeholder: t("acp.composerPlaceholder"),
          onChange: (event) => input(event.target.value),
          onPaste: (event) => {
            if (event.clipboardData.files.length) {
              event.preventDefault();
              receiveFiles([...event.clipboardData.files]);
            }
          },
          onKeyDown: (event) => {
            if (event.isComposing || event.nativeEvent.isComposing) return;
            if ((commandOpen || fileQuery !== null) && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) {
              if (event.key === "Escape") {
                event.preventDefault();
                setCommandOpen(false);
                setFileQuery(null);
                return;
              }
              const values = fileQuery !== null ? fileOptions : commands;
              if (values.length && !event.shiftKey) {
                event.preventDefault();
                if (event.key === "ArrowDown") setChoice((activeChoice + 1) % values.length);
                else if (event.key === "ArrowUp") setChoice((activeChoice + values.length - 1) % values.length);
                else if (fileQuery !== null) chooseFile(values[activeChoice]);
                else chooseCommand(values[activeChoice]);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              send();
            }
          }
        }),
        h(
          "div",
          { className: "ra-acp-compose-bar" },
          h(
            "div",
            { className: "ra-acp-compose-left" },
            h(AttachmentButton, { disabled: sending || readingFiles, onClick: () => attachmentInput.current?.click() }),
            permission
          ),
          h(
            "div",
            { className: "ra-acp-compose-right" },
            h("div", { className: "ra-acp-configs" }, configs),
            h(ComposerControls, {
              running: state.running,
              draft,
              attachments,
              sending,
              readingFiles,
              busy,
              status: state.binding.status,
              onStop: () => action("acpCancel"),
              onSend: send
            })
          )
        )
      ),
      h("div", { className: "rssh-compose-dock" }, h(SessionStatsPill, { state }), h(UsagePill, { state }), h(UsageMeter, { state }))
    )
  );
}

// src/client/session-status-store.js
var STATES = /* @__PURE__ */ new Set(["running", "waiting", "idle", "error", "disconnected", "completed", "stopped"]);
var TERMINAL_ERRORS = /* @__PURE__ */ new Set(["remote_access_denied", "request_forbidden", "unauthenticated", "api_not_found", "http_401", "http_403", "http_404"]);
function sessionStatusEntry(value) {
  if (!value || typeof value.sessionId !== "string" || !value.sessionId || value.sessionId.length > 1024) return null;
  const entry = { sessionId: value.sessionId, status: STATES.has(value.status) ? value.status : "unknown" };
  if (entry.status === "waiting" && ["permission", "elicitation"].includes(value.waitingFor)) entry.waitingFor = value.waitingFor;
  return entry;
}
var sameEntry = (a, b) => a?.sessionId === b?.sessionId && a?.status === b?.status && a?.waitingFor === b?.waitingFor;
var SessionStatusStore = class {
  constructor({ connect = stream, setTimeout: setTimeout2 = (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: clearTimeout2 = (id) => globalThis.clearTimeout(id) } = {}) {
    this.connect = connect;
    this.schedule = setTimeout2;
    this.unschedule = clearTimeout2;
    this.state = { byId: {}, connected: false };
    this.listeners = /* @__PURE__ */ new Set();
    this.started = false;
    this.blocked = false;
    this.epoch = 0;
    this.failures = 0;
    this.controller = null;
    this.retry = null;
    this.watchdog = null;
    this.task = null;
  }
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  publish(byId, connected) {
    if (this.state.byId === byId && this.state.connected === connected) return;
    this.state = { byId, connected };
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
      }
    }
  }
  unknown() {
    const byId = Object.fromEntries(Object.entries(this.state.byId).map(([id, entry]) => [id, { sessionId: entry.sessionId, status: "unknown" }]));
    this.publish(byId, false);
  }
  receive(event) {
    if (!event || typeof event !== "object") return false;
    if (event.type === "reset") {
      this.publish({}, false);
      if (event.reason === "access_revoked") {
        this.blocked = true;
        this.controller?.abort();
      }
      return true;
    }
    if (event.type === "snapshot" && Array.isArray(event.sessions)) {
      const entries = event.sessions.map(sessionStatusEntry).filter(Boolean);
      this.publish(Object.fromEntries(entries.map((entry) => [entry.sessionId, entry])), true);
      return true;
    }
    if (event.type === "upsert") {
      const entry = sessionStatusEntry(event.session);
      if (!entry) return false;
      const previous = this.state.byId[entry.sessionId];
      this.publish(sameEntry(previous, entry) ? this.state.byId : { ...this.state.byId, [entry.sessionId]: entry }, true);
      return true;
    }
    if (event.type === "remove" && typeof event.sessionId === "string") {
      const byId = { ...this.state.byId };
      delete byId[event.sessionId];
      this.publish(byId, true);
      return true;
    }
    if (event.type === "heartbeat") {
      this.publish(this.state.byId, true);
      return true;
    }
    return false;
  }
  clearTimer(name) {
    if (this[name] !== null) {
      this.unschedule(this[name]);
      this[name] = null;
    }
  }
  start() {
    if (this.started) return;
    this.started = true;
    this.blocked = false;
    this.open();
  }
  open() {
    if (!this.started || this.blocked) return;
    this.clearTimer("retry");
    const epoch = ++this.epoch, controller = new AbortController();
    this.controller = controller;
    const current = () => this.started && epoch === this.epoch;
    const arm = () => {
      this.clearTimer("watchdog");
      this.watchdog = this.schedule(() => {
        this.watchdog = null;
        if (current()) {
          this.unknown();
          controller.abort();
        }
      }, 45e3);
    };
    arm();
    this.task = (async () => {
      try {
        await this.connect("sessionActivityEvents", {}, controller.signal, (event) => {
          if (!current() || controller.signal.aborted) return;
          if (this.receive(event) && !this.blocked) {
            if (event.type === "heartbeat") this.failures = 0;
            arm();
          }
        });
      } catch (error) {
        if (current() && TERMINAL_ERRORS.has(error?.code)) {
          this.blocked = true;
          this.publish({}, false);
        }
      } finally {
        if (!current()) return;
        this.clearTimer("watchdog");
        this.controller = null;
        if (this.blocked) return;
        this.unknown();
        const delay = Math.min(3e4, 1e3 * 2 ** Math.min(this.failures++, 5));
        this.retry = this.schedule(() => {
          this.retry = null;
          this.open();
        }, delay);
      }
    })();
  }
  dispose() {
    this.started = false;
    this.epoch++;
    this.controller?.abort();
    this.controller = null;
    this.clearTimer("retry");
    this.clearTimer("watchdog");
    this.publish({}, false);
    this.listeners.clear();
  }
};

// src/client/session-status.js
var messages4 = {
  zh: {
    "sessionStatus.running": "\u8FDC\u7AEF\u8FD0\u884C\u4E2D",
    "sessionStatus.permission": "\u8FDC\u7AEF\u7B49\u5F85\u5BA1\u6279",
    "sessionStatus.elicitation": "\u8FDC\u7AEF\u7B49\u5F85\u56DE\u7B54",
    "sessionStatus.waiting": "\u8FDC\u7AEF\u7B49\u5F85\u7528\u6237\u64CD\u4F5C",
    "sessionStatus.idle": "\u8FDC\u7AEF\u7A7A\u95F2",
    "sessionStatus.error": "\u8FDC\u7AEF\u4F1A\u8BDD\u51FA\u9519",
    "sessionStatus.disconnected": "\u8FDC\u7AEF\u672A\u8FDE\u63A5",
    "sessionStatus.completed": "\u8FDC\u7AEF\u5DF2\u5B8C\u6210",
    "sessionStatus.stopped": "\u8FDC\u7AEF\u5DF2\u505C\u6B62",
    "sessionStatus.unknown": "\u8FDC\u7AEF\u72B6\u6001\u672A\u77E5"
  },
  en: {
    "sessionStatus.running": "Remote session running",
    "sessionStatus.permission": "Remote session waiting for approval",
    "sessionStatus.elicitation": "Remote session waiting for an answer",
    "sessionStatus.waiting": "Remote session waiting for user input",
    "sessionStatus.idle": "Remote session idle",
    "sessionStatus.error": "Remote session error",
    "sessionStatus.disconnected": "Remote session disconnected",
    "sessionStatus.completed": "Remote session completed",
    "sessionStatus.stopped": "Remote session stopped",
    "sessionStatus.unknown": "Remote session status unknown"
  }
};
function sessionStatusPresentation(entry, sessionId) {
  if (!sessionId || !entry || entry.sessionId !== sessionId) return null;
  switch (entry.status) {
    case "running":
      return { state: "ongoing", label: "sessionStatus.running" };
    case "waiting":
      return { state: "warning", label: entry.waitingFor === "permission" ? "sessionStatus.permission" : entry.waitingFor === "elicitation" ? "sessionStatus.elicitation" : "sessionStatus.waiting" };
    case "completed":
      return { state: "done", label: "sessionStatus.completed" };
    case "error":
      return { state: "error", label: "sessionStatus.error" };
    case "idle":
      return { state: "idle", label: "sessionStatus.idle" };
    case "stopped":
      return { state: "idle", label: "sessionStatus.stopped" };
    case "disconnected":
      return { state: "idle", label: "sessionStatus.disconnected" };
    default:
      return { state: "idle", label: "sessionStatus.unknown" };
  }
}
function RemoteSessionStatus({ sessionId, useRemoteSessionStatuses, t }) {
  const entry = useRemoteSessionStatuses((snapshot) => snapshot.byId[sessionId]);
  const presentation = sessionStatusPresentation(entry, sessionId);
  if (!presentation) return null;
  const label2 = t(presentation.label);
  return h(
    "span",
    { role: "img", title: label2, "aria-label": label2 },
    h(ui.StateDot, { state: presentation.state, className: "rssh-session-status-dot" })
  );
}
function installSessionStatus(ctx, store) {
  return ctx.slots.inject("sidebar.session.row.leading", () => ctx.slots.register({
    name: "sidebar.session.row.leading",
    id: "remote-ssh.status",
    order: 0,
    locale: NAMESPACE,
    inject: () => ({ hooks: { remoteSessionStatuses: store } })
  }, RemoteSessionStatus));
}

// src/client/session-setup.js
var import_react14 = __toESM(require("react"), 1);

// src/client/workspaces.js
var import_react13 = __toESM(require("react"), 1);
var h2 = import_react13.default.createElement;
var messages5 = {
  zh: {
    "rssh.flow.title": "\u6DFB\u52A0\u5DE5\u4F5C\u533A",
    "rssh.flow.local": "\u9009\u62E9\u672C\u673A\u76EE\u5F55\u2026",
    "rssh.flow.localHint": "\u4F7F\u7528 DSH \u539F\u751F\u7CFB\u7EDF\u76EE\u5F55\u9009\u62E9\u5668\uFF1B\u4E0D\u4F1A\u7528\u8FDC\u7AEF\u6D4F\u89C8\u5668\u4EE3\u66FF\u3002",
    "rssh.flow.sessionHint": "Agent \u548C\u6743\u9650\u5728\u65B0\u5EFA\u4F1A\u8BDD\u65F6\u9009\u62E9\uFF1B\u540C\u4E00\u5DE5\u4F5C\u533A\u53EF\u4F7F\u7528\u4E0D\u540C Agent\u3002",
    "rssh.flow.remote": "\u8FDC\u7AEF SSH \u5DE5\u4F5C\u533A",
    "rssh.flow.profile": "\u8FDE\u63A5\u914D\u7F6E",
    "rssh.flow.chooseProfile": "\u9009\u62E9\u8FDE\u63A5\u914D\u7F6E",
    "rssh.flow.noProfiles": "\u5C1A\u65E0\u8FDE\u63A5\u914D\u7F6E\uFF0C\u8BF7\u5148\u5728\u300C\u8BBE\u7F6E \u2192 \u8FDC\u7A0B SSH\u300D\u4E2D\u65B0\u5EFA SSH \u5BC6\u94A5\u6216 Kerberos \u8FDE\u63A5\u3002",
    "rssh.flow.remoteDir": "\u8FDC\u7AEF\u76EE\u5F55",
    "rssh.flow.browse": "\u6D4F\u89C8\u8FDC\u7AEF",
    "rssh.flow.up": "\u4E0A\u4E00\u7EA7",
    "rssh.flow.empty": "\u6B64\u76EE\u5F55\u6CA1\u6709\u5B50\u76EE\u5F55\u3002",
    "rssh.flow.truncated": "\u76EE\u5F55\u5185\u5BB9\u5DF2\u622A\u65AD\uFF1B\u53EF\u4EE5\u76F4\u63A5\u8F93\u5165\u5B8C\u6574\u8FDC\u7AEF\u8DEF\u5F84\u3002",
    "rssh.flow.backend": "Agent \u540E\u7AEF",
    "rssh.flow.permission": "\u6743\u9650",
    "rssh.flow.plan": "Plan \xB7 \u53EA\u8BFB\u89C4\u5212",
    "rssh.flow.acceptEdits": "Accept edits \xB7 \u9ED8\u8BA4",
    "rssh.flow.bypass": "Bypass \xB7 \u8DF3\u8FC7\u5BA1\u6279",
    "rssh.flow.bypassWarning": "Bypass \u5C06\u8DF3\u8FC7\u5DE5\u5177\u5BA1\u6279\uFF0C\u5141\u8BB8 Agent \u6267\u884C\u9AD8\u98CE\u9669\u64CD\u4F5C\u3002\u4EC5\u5BF9\u53EF\u4FE1\u5DE5\u4F5C\u533A\u4F7F\u7528\u3002",
    "rssh.flow.bypassConfirm": "\u6211\u7406\u89E3\u98CE\u9669\uFF0C\u786E\u8BA4\u542F\u7528 Bypass",
    "rssh.flow.worktree": "\u521B\u5EFA\u72EC\u7ACB owned worktree",
    "rssh.flow.worktreeHint": "\u4EE5\u6240\u9009\u8FDC\u7AEF\u76EE\u5F55\u4E3A Git \u4ED3\u5E93\u521B\u5EFA\u72EC\u7ACB worktree\u3002\u53D6\u6D88\u4E0D\u4F1A\u6E05\u7406\u6587\u4EF6\uFF1B\u4EE5\u540E\u79FB\u9664\u5FC5\u987B\u5355\u72EC\u786E\u8BA4\u3002",
    "rssh.flow.branch": "\u65B0\u5206\u652F\u540D\u79F0",
    "rssh.flow.base": "\u57FA\u51C6\u5206\u652F / \u63D0\u4EA4\uFF08\u53EF\u9009\uFF09",
    "rssh.flow.baseHint": "\u7559\u7A7A\u4F7F\u7528 HEAD",
    "rssh.flow.create": "\u521B\u5EFA\u8FDC\u7AEF\u5DE5\u4F5C\u533A",
    "rssh.flow.cancel": "\u53D6\u6D88",
    "rssh.flow.close": "\u5173\u95ED",
    "rssh.flow.retry": "\u91CD\u8BD5",
    "rssh.flow.loading": "\u52A0\u8F7D\u4E2D\u2026",
    "rssh.flow.working": "\u6B63\u5728\u5904\u7406\u2026",
    "rssh.flow.invalid": "\u8BF7\u9009\u62E9\u8FDE\u63A5\u914D\u7F6E\u5E76\u586B\u5199\u8FDC\u7AEF\u76EE\u5F55\u3002",
    "rssh.flow.invalidBranch": "\u8BF7\u586B\u5199\u6709\u6548\u7684\u65B0\u5206\u652F\u540D\u79F0\uFF1B\u57FA\u51C6\u5F15\u7528\u4E0D\u80FD\u4EE5 - \u5F00\u5934\u3002",
    "rssh.flow.nativeUnavailable": "\u5F53\u524D DSH \u672A\u63D0\u4F9B\u539F\u751F\u76EE\u5F55\u9009\u62E9\u5668\u3002\u8BF7\u68C0\u67E5\u672C\u673A\u76EE\u5F55\u9009\u62E9\u5668\u7684\u914D\u7F6E\uFF1B\u4E0D\u4F1A\u66FF\u6362\u6210\u672C\u673A\u6587\u4EF6\u6D4F\u89C8\u5668\u3002",
    "rssh.flow.createdUnregistered": "\u8FDC\u7AEF worktree \u5DF2\u521B\u5EFA\uFF0C\u4F46\u5DE5\u4F5C\u533A\u6CE8\u518C\u5931\u8D25\u3002\u6587\u4EF6\u5DF2\u4FDD\u7559\uFF0C\u672C\u6B21\u4E0D\u4F1A\u91CD\u8BD5\u6216\u6E05\u7406\u3002\u8BF7\u5148\u68C0\u67E5\u4E0B\u65B9\u76EE\u5F55\u548C\u5206\u652F\uFF0C\u518D\u51B3\u5B9A\u540E\u7EED\u64CD\u4F5C\uFF1B\u666E\u901A\u6CE8\u518C\u4E0D\u80FD\u6062\u590D owned \u5F52\u5C5E\u8BB0\u5F55\u3002",
    "rssh.flow.missingPath": "Host \u672A\u8FD4\u56DE\u53EF\u4F9B DSH \u91C7\u7528\u7684\u5DE5\u4F5C\u533A\u8DEF\u5F84\u3002\u5DF2\u521B\u5EFA\u7684\u6587\u4EF6\u4FDD\u6301\u4E0D\u53D8\u3002"
  },
  en: {
    "rssh.flow.title": "Add workspace",
    "rssh.flow.local": "Choose local directory\u2026",
    "rssh.flow.localHint": "Uses the DSH native OS directory chooser, never the remote browser.",
    "rssh.flow.sessionHint": "Choose the Agent and permissions in each new session. One workspace can use different Agents.",
    "rssh.flow.remote": "Remote SSH workspace",
    "rssh.flow.profile": "Connection profile",
    "rssh.flow.chooseProfile": "Choose a connection profile",
    "rssh.flow.noProfiles": "No connections yet. Create an SSH key or Kerberos profile in Settings \u2192 Remote SSH first.",
    "rssh.flow.remoteDir": "Remote directory",
    "rssh.flow.browse": "Browse remote",
    "rssh.flow.up": "Parent directory",
    "rssh.flow.empty": "No subdirectories in this directory.",
    "rssh.flow.truncated": "Directory listing truncated. You can enter a full remote path directly.",
    "rssh.flow.backend": "Agent backend",
    "rssh.flow.permission": "Permission",
    "rssh.flow.plan": "Plan \xB7 read-only planning",
    "rssh.flow.acceptEdits": "Accept edits \xB7 default",
    "rssh.flow.bypass": "Bypass \xB7 skip approvals",
    "rssh.flow.bypassWarning": "Bypass skips tool approvals and allows high-risk Agent operations. Use only in trusted workspaces.",
    "rssh.flow.bypassConfirm": "I understand the risk and confirm Bypass",
    "rssh.flow.worktree": "Create an independent owned worktree",
    "rssh.flow.worktreeHint": "Creates an independent worktree from the selected remote Git repository. Cancelling does not remove files. Removal requires a separate confirmation.",
    "rssh.flow.branch": "New branch name",
    "rssh.flow.base": "Base branch / commit (optional)",
    "rssh.flow.baseHint": "Leave blank to use HEAD",
    "rssh.flow.create": "Create remote workspace",
    "rssh.flow.cancel": "Cancel",
    "rssh.flow.close": "Close",
    "rssh.flow.retry": "Retry",
    "rssh.flow.loading": "Loading\u2026",
    "rssh.flow.working": "Working\u2026",
    "rssh.flow.invalid": "Choose a connection profile and enter a remote directory.",
    "rssh.flow.invalidBranch": "Enter a valid new branch name. The base reference must not start with a hyphen.",
    "rssh.flow.nativeUnavailable": "DSH has no native directory chooser in this configuration. Check the local directory-picker setup; no custom local file browser will replace it.",
    "rssh.flow.createdUnregistered": "The remote worktree was created, but workspace registration failed. Files are retained; this flow will not retry or clean them up. Inspect the directory and branch below before proceeding. Ordinary registration cannot restore the owned record.",
    "rssh.flow.missingPath": "The Host did not return a workspace path for DSH to adopt. Created files remain untouched."
  }
};
var css = `
.rssh-flow{display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;min-width:0}
.rssh-flow h3{font-size:14px;margin:0;font-weight:600}.rssh-flow-local{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding-bottom:14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.rssh-flow-field{display:flex;flex-direction:column;gap:5px}.rssh-flow-line{display:flex;align-items:center;gap:8px}.rssh-flow-line input{flex:1;min-width:0}
.rssh-flow-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rssh-flow-select{box-sizing:border-box;width:100%;min-height:32px;padding:4px 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit}
.rssh-flow-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.rssh-flow-muted{color:var(--dsw-alias-label-secondary);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.rssh-flow-error{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;overflow-wrap:anywhere}
.rssh-flow-warning{padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-state-warn-label);white-space:pre-wrap}
.rssh-flow-browser{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:4px;max-height:220px;overflow:auto}.rssh-flow-browser button{justify-content:flex-start;text-align:left;overflow-wrap:anywhere}
.rssh-flow-path{font-family:monospace;overflow-wrap:anywhere}.rssh-flow-worktree{display:flex;flex-direction:column;gap:10px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}
@media(max-width:500px){.rssh-flow-grid{grid-template-columns:1fr}.rssh-flow-line{align-items:stretch;flex-direction:column}}
`;
function createFlowLifetime() {
  let epoch = 0;
  let alive = false;
  let settled = false;
  return {
    open() {
      alive = true;
      settled = false;
      return ++epoch;
    },
    close() {
      alive = false;
      settled = true;
      epoch++;
    },
    current() {
      return epoch;
    },
    accepts(token) {
      return alive && !settled && token === epoch;
    },
    settle(token) {
      if (!this.accepts(token)) return false;
      settled = true;
      return true;
    }
  };
}
function remoteWorkspacePayload(form) {
  if (!form.profileId || !form.remotePath.trim() || /[\0\r\n]/.test(form.remotePath)) return { error: "invalid" };
  const value = { profileId: form.profileId, remotePath: form.remotePath.trim() };
  if (form.worktree) {
    const branch = form.branch.trim();
    const base = form.base.trim();
    if (!branch || branch.startsWith("-") || branch.includes("..") || !/^[A-Za-z0-9._/-]+$/.test(branch) || base.startsWith("-") || /[\0\r\n]/.test(base)) return { error: "invalidBranch" };
    value.worktree = { branch, ...base ? { base } : {} };
  }
  return { value };
}
function parentPath(path) {
  if (!path?.startsWith("/") || path === "/") return null;
  const clean = path.replace(/\/+$/, "");
  const index = clean.lastIndexOf("/");
  return index === 0 ? "/" : clean.slice(0, index);
}
function field(label2, control) {
  return h2("label", { className: "rssh-flow-field" }, h2("span", null, label2), control);
}
function select(value, onChange, options, disabled) {
  return h2(
    "select",
    { value, disabled, className: "rssh-flow-select", onChange: (event) => onChange(event.target.value) },
    options.map(([id, text2]) => h2("option", { key: id, value: id }, text2))
  );
}
function RemoteWorkspaceFlow(props) {
  return props.open ? h2(OpenRemoteWorkspaceFlow, props) : null;
}
function OpenRemoteWorkspaceFlow(props) {
  const t = useT();
  const latest = import_react13.default.useRef(props);
  latest.current = props;
  const life = import_react13.default.useRef(null);
  if (!life.current) life.current = createFlowLifetime();
  const operation = import_react13.default.useRef(0);
  const pending = import_react13.default.useRef(false);
  const profileRequest = import_react13.default.useRef(0);
  const loadController = import_react13.default.useRef(null);
  const [working, setWorking] = import_react13.default.useState(false);
  const [delivered, setDelivered] = import_react13.default.useState(false);
  const [error, setError] = import_react13.default.useState("");
  const [profiles, setProfiles] = import_react13.default.useState([]);
  const [loading, setLoading] = import_react13.default.useState(true);
  const [profileError, setProfileError] = import_react13.default.useState("");
  const [listing, setListing] = import_react13.default.useState(null);
  const [recovery, setRecovery] = import_react13.default.useState(null);
  const [form, setForm] = import_react13.default.useState({ profileId: "", remotePath: "", worktree: false, branch: "", base: "" });
  const disabled = !!props.busy || working || delivered;
  import_react13.default.useLayoutEffect(() => {
    life.current.open();
    return () => {
      life.current.close();
      operation.current++;
      profileRequest.current++;
      pending.current = false;
      loadController.current?.abort();
    };
  }, []);
  async function loadProfiles() {
    const token = life.current.current();
    const request = ++profileRequest.current;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    setProfileError("");
    try {
      const result = await api("listProfiles", {}, controller.signal);
      if (!life.current.accepts(token) || request !== profileRequest.current) return;
      if (!result?.ok) {
        setProfileError(formatError(result));
        return;
      }
      setProfiles(result.profiles);
      setForm((current) => current.profileId || !result.profiles.length ? current : { ...current, profileId: result.profiles[0].id, remotePath: result.profiles[0].remoteRoot || "~" });
    } catch (reason) {
      if (life.current.accepts(token) && request === profileRequest.current) setProfileError(formatError(reason));
    } finally {
      if (life.current.accepts(token) && request === profileRequest.current) setLoading(false);
    }
  }
  import_react13.default.useEffect(() => {
    void loadProfiles();
  }, []);
  const change = (key2, value) => {
    setForm((current) => ({ ...current, [key2]: value }));
    setError("");
  };
  function cancel() {
    const token = life.current.current();
    if (!life.current.settle(token)) return;
    operation.current++;
    loadController.current?.abort();
    latest.current.onCancel();
  }
  async function run(method, args, onSuccess, onFailure) {
    if (pending.current || latest.current.busy || delivered) return;
    const token = life.current.current();
    if (!life.current.accepts(token)) return;
    const op = ++operation.current;
    pending.current = true;
    setWorking(true);
    setError("");
    try {
      const result = await api(method, args);
      if (!life.current.accepts(token) || op !== operation.current) return;
      if (!result?.ok) {
        setError(formatError(result));
        onFailure?.(result);
        return;
      }
      onSuccess(result, token);
    } catch (reason) {
      if (life.current.accepts(token) && op === operation.current) setError(formatError(reason));
    } finally {
      if (life.current.accepts(token) && op === operation.current) {
        pending.current = false;
        setWorking(false);
      }
    }
  }
  function pickLocal() {
    run("directoryPicker", { action: "pick" }, (result, token) => {
      if (!life.current.settle(token)) return;
      setDelivered(true);
      if (result.path === null) latest.current.onCancel();
      else if (typeof result.path === "string" && result.path) latest.current.onPicked(result.path);
      else latest.current.onError(t("rssh.flow.missingPath"));
    }, (result) => {
      if (["directory_picker_unavailable", "directory_picker_browse_required"].includes(result.code)) setError(t("rssh.flow.nativeUnavailable"));
    });
  }
  function browse(path = form.remotePath) {
    if (!form.profileId || !path.trim()) {
      setError(t("rssh.flow.invalid"));
      return;
    }
    run("listDir", { profileId: form.profileId, path: path.trim() }, (result) => {
      setListing({ path: result.path, entries: result.entries.filter((entry) => entry.type === "directory"), truncated: result.truncated });
      setForm((current) => ({ ...current, remotePath: result.path }));
    });
  }
  function create(event) {
    event?.preventDefault();
    if (recovery) return;
    const payload2 = remoteWorkspacePayload(form);
    if (payload2.error) {
      setError(t("rssh.flow." + payload2.error));
      return;
    }
    run("createRemoteWorkspace", payload2.value, (result, token) => {
      if (typeof result.mirrorPath !== "string" || !result.mirrorPath) {
        setError(t("rssh.flow.missingPath"));
        return;
      }
      if (!life.current.settle(token)) return;
      setDelivered(true);
      latest.current.onBackendChanged?.(result);
      latest.current.onPicked(result.mirrorPath);
    }, (result) => {
      if (result.worktreeCreated && result.recovery) setRecovery(result.recovery);
    });
  }
  const input = (key2, placeholder) => h2(ui.Input, { value: form[key2], placeholder, disabled, onChange: (event) => change(key2, event.target.value) });
  return h2(
    ui.Modal,
    {
      open: true,
      title: t("rssh.flow.title"),
      closeLabel: t("rssh.flow.close"),
      onClose: cancel,
      footer: h2(
        import_react13.default.Fragment,
        null,
        h2(ui.Button, { disabled: delivered || !!props.busy, onClick: cancel }, t("rssh.flow.cancel")),
        h2(ui.Button, { variant: "primary", loading: working || !!props.busy, disabled: disabled || loading || !form.profileId || !form.remotePath.trim() || !!recovery, onClick: create }, t("rssh.flow.create"))
      )
    },
    h2("style", null, css),
    h2(
      "form",
      { className: "rssh-flow", onSubmit: create },
      h2("div", { className: "rssh-flow-local" }, h2(ui.Button, { disabled, onClick: pickLocal }, t("rssh.flow.local")), h2("div", { className: "rssh-flow-muted" }, t("rssh.flow.localHint"))),
      h2("h3", null, t("rssh.flow.remote")),
      loading ? h2("div", { role: "status" }, t("rssh.flow.loading")) : null,
      profileError ? h2("div", { role: "alert", className: "rssh-flow-error" }, profileError, h2(ui.Button, { disabled, onClick: loadProfiles }, t("rssh.flow.retry"))) : null,
      !loading && !profileError && profiles.length === 0 ? h2("div", { className: "rssh-flow-muted" }, t("rssh.flow.noProfiles")) : null,
      field(t("rssh.flow.profile"), select(form.profileId, (profileId) => {
        setListing(null);
        setError("");
        setForm((current) => ({ ...current, profileId, remotePath: profiles.find((profile) => profile.id === profileId)?.remoteRoot || "~" }));
      }, [["", t("rssh.flow.chooseProfile")], ...profiles.map((profile) => [profile.id, profile.name || `${profile.user}@${profile.host}`])], disabled || loading)),
      field(t("rssh.flow.remoteDir"), h2("span", { className: "rssh-flow-line" }, input("remotePath"), h2(ui.Button, { disabled: disabled || !form.profileId, onClick: () => browse() }, t("rssh.flow.browse")))),
      listing ? h2(
        "div",
        { className: "rssh-flow-browser", "aria-label": t("rssh.flow.remoteDir"), "aria-busy": working },
        h2("div", { className: "rssh-flow-path" }, listing.path),
        parentPath(listing.path) ? h2(ui.Button, { size: "sm", variant: "ghost", disabled, onClick: () => browse(parentPath(listing.path)) }, "\u2191 ", t("rssh.flow.up")) : null,
        listing.entries.length === 0 ? h2("div", { className: "rssh-flow-muted" }, t("rssh.flow.empty")) : null,
        listing.entries.map((entry) => h2(ui.Button, { key: entry.path, size: "sm", variant: "ghost", disabled, onClick: () => browse(entry.path) }, entry.name, "/")),
        listing.truncated ? h2("div", { className: "rssh-flow-muted" }, t("rssh.flow.truncated")) : null
      ) : null,
      h2("div", { className: "rssh-flow-muted" }, t("rssh.flow.sessionHint")),
      h2(
        "div",
        { className: "rssh-flow-worktree" },
        h2(ui.Checkbox, { checked: form.worktree, disabled: disabled || !!recovery, onChange: (value) => change("worktree", value), label: t("rssh.flow.worktree") }),
        form.worktree ? h2(
          import_react13.default.Fragment,
          null,
          h2("div", { className: "rssh-flow-muted" }, t("rssh.flow.worktreeHint")),
          field(t("rssh.flow.branch"), input("branch")),
          field(t("rssh.flow.base"), input("base", t("rssh.flow.baseHint")))
        ) : null
      ),
      recovery ? h2("div", { className: "rssh-flow-warning", role: "status" }, t("rssh.flow.createdUnregistered"), h2("p", { className: "rssh-flow-path" }, recovery.path), h2("p", { className: "rssh-flow-path" }, recovery.branch)) : null,
      error ? h2("div", { className: "rssh-flow-error", role: "alert" }, error) : null,
      working || props.busy ? h2("div", { role: "status" }, h2(ui.StateDot, { state: "ongoing" }), " ", t("rssh.flow.working")) : null
    )
  );
}

// src/client/session-setup-model.js
function createFreshSession({ createSession, openSession, beginNavigation, changed }) {
  let alive = true, pending = false, createdId = null;
  return {
    async run(workspaceId) {
      if (!alive || pending) return;
      const navigation = beginNavigation();
      pending = true;
      changed({ busy: true, error: null });
      try {
        const id = createdId || await createSession({ workspaceId });
        if (!alive) return;
        createdId = id;
        if (!navigation.aborted) await openSession(id);
      } catch (error) {
        if (alive && !navigation.aborted) changed({ busy: false, error });
      } finally {
        pending = false;
        if (alive) changed({ busy: false });
      }
    },
    dispose() {
      alive = false;
    }
  };
}
function sessionBackendPayload(sessionId, form) {
  if (!sessionId || !["claude", "codex"].includes(form.type) || !["plan", "acceptEdits", "bypass"].includes(form.permission)) return { error: "invalid" };
  if (form.permission === "bypass" && form.confirmBypass !== true) return { error: "bypassConfirm" };
  return { value: {
    sessionId,
    backend: { type: form.type, permission: form.permission },
    ...form.permission === "bypass" ? { confirmBypass: true } : {}
  } };
}
function createSessionSelection({ request, changed, selected }) {
  let alive = true, pending = false, generation = 0;
  return {
    async submit(value) {
      if (!alive || pending) return;
      const token = ++generation;
      pending = true;
      changed({ busy: true, error: null });
      try {
        const result = await request("selectSessionBackend", value);
        if (!alive || token !== generation) return;
        if (!result?.ok) {
          changed({ busy: false, error: result });
          return;
        }
        selected(result);
      } catch (error) {
        if (alive && token === generation) changed({ busy: false, error });
      } finally {
        if (alive && token === generation) pending = false;
      }
    },
    dispose() {
      alive = false;
      generation++;
    }
  };
}

// src/client/session-setup.js
var h3 = import_react14.default.createElement;
var messages6 = {
  zh: {
    "session.setup.loading": "\u6B63\u5728\u8BFB\u53D6\u8FDC\u7AEF\u4F1A\u8BDD",
    "session.setup.loadingHint": "\u6B63\u5728\u786E\u8BA4\u5DE5\u4F5C\u533A\u4E0E\u4F1A\u8BDD\u914D\u7F6E\uFF1B\u6B64\u6B65\u9AA4\u4E0D\u4F1A\u542F\u52A8 Agent\u3002",
    "session.setup.loadFailed": "\u65E0\u6CD5\u8BFB\u53D6\u8FDC\u7AEF\u4F1A\u8BDD\u914D\u7F6E",
    "session.setup.title": "\u65B0\u5EFA\u8FDC\u7AEF\u4F1A\u8BDD",
    "session.setup.description": "\u4E3A\u6B64\u4F1A\u8BDD\u9009\u62E9 Agent \u548C\u6743\u9650\uFF0C\u4E0D\u4F1A\u6539\u53D8\u5DE5\u4F5C\u533A\u6216\u5176\u4ED6\u4F1A\u8BDD\u3002",
    "session.setup.choose": "\u8BF7\u9009\u62E9 Agent",
    "session.setup.invalid": "\u8BF7\u9009\u62E9 Agent \u548C\u6709\u6548\u7684\u6743\u9650\u6A21\u5F0F\u3002",
    "session.setup.start": "\u5F00\u59CB\u4F1A\u8BDD",
    "session.setup.fixed": "\u9009\u62E9\u540E\uFF0CAgent \u5C06\u7ED1\u5B9A\u5230\u6B64\u4F1A\u8BDD\uFF1B\u4F7F\u7528\u5176\u4ED6 Agent \u53EF\u70B9\u51FB\u9876\u90E8\u300C\u65B0\u5EFA\u4F1A\u8BDD\u300D\u3002",
    "session.setup.new": "\u65B0\u5EFA\u4F1A\u8BDD",
    "session.setup.newHint": "\u5728\u540C\u4E00\u5DE5\u4F5C\u533A\u65B0\u5EFA\u72EC\u7ACB\u4F1A\u8BDD\uFF0C\u91CD\u65B0\u9009\u62E9 Agent\uFF1B\u5F53\u524D\u4F1A\u8BDD\u4FDD\u7559\u3002",
    "session.setup.archived": "\u6B64\u4F1A\u8BDD\u5DF2\u5F52\u6863\uFF0C\u8BF7\u5148\u53D6\u6D88\u5F52\u6863\u518D\u9009\u62E9 Agent\u3002"
  },
  en: {
    "session.setup.loading": "Loading remote session",
    "session.setup.loadingHint": "Checking workspace and session configuration. This step does not start an Agent.",
    "session.setup.loadFailed": "Could not load remote session configuration",
    "session.setup.title": "New remote session",
    "session.setup.description": "Choose the Agent and permissions for this session without changing the workspace or other sessions.",
    "session.setup.choose": "Choose an Agent",
    "session.setup.invalid": "Choose an Agent and a valid permission mode.",
    "session.setup.start": "Start session",
    "session.setup.fixed": "The Agent is fixed after selection. Use New session in the header to choose another Agent.",
    "session.setup.new": "New session",
    "session.setup.newHint": "Create a separate session in this workspace and choose its Agent. The current session is preserved.",
    "session.setup.archived": "This session is archived. Unarchive it before choosing an Agent."
  }
};
var css2 = `
.rssh-session-setup{flex:1;min-height:0;overflow:auto;padding:24px 16px;display:flex;align-items:safe center;justify-content:center}
.rssh-session-setup-form{width:100%;max-width:480px;box-sizing:border-box}
.rssh-session-setup-form h2{font-size:20px;line-height:28px;font-weight:600;margin:0}
.rssh-session-setup-path{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.rssh-session-setup-actions{display:flex;justify-content:flex-end;padding-top:4px}
`;
function SessionSetup({ backend, onSelected }) {
  const t = useT();
  const [form, setForm] = import_react14.default.useState({ type: "", permission: "acceptEdits", confirmBypass: false });
  const [status, setStatus] = import_react14.default.useState({ busy: false, error: null });
  const [error, setError] = import_react14.default.useState("");
  const controller = import_react14.default.useRef(null), latest = import_react14.default.useRef(onSelected);
  latest.current = onSelected;
  import_react14.default.useLayoutEffect(() => {
    const selection = createSessionSelection({ request: api, changed: setStatus, selected: (result) => latest.current(result) });
    controller.current = selection;
    return () => selection.dispose();
  }, [backend.sessionId]);
  const disabled = status.busy || backend.archived === true;
  const change = (key2, value) => {
    setForm((current) => ({ ...current, [key2]: value, ...key2 !== "confirmBypass" ? { confirmBypass: false } : {} }));
    setError("");
    setStatus((current) => ({ ...current, error: null }));
  };
  function submit(event) {
    event.preventDefault();
    if (disabled) return;
    const payload2 = sessionBackendPayload(backend.sessionId, form);
    if (payload2.error) {
      setError(t(payload2.error === "bypassConfirm" ? "rssh.flow.bypassConfirm" : "session.setup.invalid"));
      return;
    }
    setError("");
    void controller.current?.submit(payload2.value);
  }
  const select2 = (key2, options) => h3(
    "select",
    { className: "rssh-flow-select", value: form[key2], disabled, onChange: (event) => change(key2, event.target.value) },
    options.map(([value, label2]) => h3("option", { key: value, value }, label2))
  );
  const field3 = (label2, control) => h3("label", { className: "rssh-flow-field" }, h3("span", null, label2), control);
  return h3(
    "section",
    { className: "rssh-session-setup", "aria-label": t("session.setup.title") },
    h3("style", null, css + css2),
    h3(
      "form",
      { className: "rssh-flow rssh-session-setup-form", onSubmit: submit, "aria-busy": status.busy },
      h3("h2", null, t("session.setup.title")),
      h3("div", { className: "rssh-session-setup-path" }, backend.workspace.remotePath),
      h3("p", { className: "rssh-flow-muted" }, t("session.setup.description")),
      field3(t("rssh.flow.backend"), select2("type", [["", t("session.setup.choose")], ["claude", "Claude Code"], ["codex", "Codex"]])),
      field3(t("rssh.flow.permission"), select2("permission", ["plan", "acceptEdits", "bypass"].map((value) => [value, t("rssh.flow." + value)]))),
      form.permission === "bypass" ? h3(
        "div",
        { className: "rssh-flow-warning" },
        h3("p", null, t("rssh.flow.bypassWarning")),
        h3(ui.Checkbox, { checked: form.confirmBypass, disabled, onChange: (value) => change("confirmBypass", value), label: t("rssh.flow.bypassConfirm") })
      ) : null,
      h3("div", { className: "rssh-flow-muted" }, t("session.setup.fixed")),
      backend.archived ? h3("div", { role: "status", className: "rssh-flow-warning" }, t("session.setup.archived")) : null,
      error || status.error ? h3("div", { role: "alert", className: "rssh-flow-error" }, error || formatError(status.error)) : null,
      h3("div", { className: "rssh-session-setup-actions" }, h3(ui.Button, {
        type: "submit",
        variant: "primary",
        loading: status.busy,
        disabled: disabled || !form.type || form.permission === "bypass" && !form.confirmBypass
      }, t("session.setup.start")))
    )
  );
}

// src/client/new-session.js
var import_react15 = __toESM(require("react"), 1);
function NewRemoteSession({ workspaceId, createSession, openSession, beginNavigation }) {
  const t = useT(), controller = import_react15.default.useRef(null);
  const [status, setStatus] = import_react15.default.useState({ busy: false, error: null });
  import_react15.default.useLayoutEffect(() => {
    const action = createFreshSession({
      createSession,
      openSession,
      beginNavigation,
      changed: (patch) => setStatus((current) => ({ ...current, ...patch }))
    });
    controller.current = action;
    return () => action.dispose();
  }, []);
  return h(
    "span",
    { className: "rssh-new-session" },
    h(ui.Button, { size: "sm", variant: "ghost", loading: status.busy, onClick: () => controller.current?.run(workspaceId), title: t("session.setup.newHint") }, t("session.setup.new")),
    status.error ? h("span", { role: "alert", className: "rssh-new-session-error" }, formatError(status.error)) : null
  );
}

// src/client/files.js
var import_react16 = __toESM(require("react"), 1);

// src/client/files-model.js
function formatFileSize(size) {
  if (!Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${Math.floor(size)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = size / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${Number(value.toFixed(value < 10 ? 1 : 0))} ${units[unit]}`;
}
function fileEntryPath(directory, name) {
  return directory === "." ? name : directory.replace(/\/$/, "") + "/" + name;
}
function fileDirectory(path) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "." : path.slice(0, index) || "/";
}
function fileViewState({ busy, loaded, preview, entries, error }) {
  if (preview) return "preview";
  if (!loaded && busy) return "loading";
  if (error && entries.length === 0) return "error";
  if (loaded && entries.length === 0) return "empty";
  return "list";
}

// src/client/files.js
var messages7 = {
  zh: {
    "files.root": "\u5DE5\u4F5C\u533A",
    "files.location": "\u5F53\u524D\u4F4D\u7F6E",
    "files.empty": "\u6B64\u76EE\u5F55\u4E3A\u7A7A",
    "files.failed": "\u65E0\u6CD5\u8BFB\u53D6\u8FDC\u7AEF\u6587\u4EF6",
    "files.retry": "\u91CD\u8BD5\u8BFB\u53D6",
    "files.modified": "\u672A\u4FDD\u5B58",
    "files.saved": "\u5DF2\u4FDD\u5B58",
    "files.items": "{count} \u9879",
    "files.truncated": "\u4EC5\u663E\u793A\u524D 2000 \u9879\uFF0C\u8BF7\u8FDB\u5165\u5B50\u76EE\u5F55\u7EE7\u7EED\u6D4F\u89C8\u3002",
    "files.imageFailed": "\u56FE\u7247\u9884\u89C8\u52A0\u8F7D\u5931\u8D25\uFF0C\u53EF\u5C1D\u8BD5\u5237\u65B0\u6216\u4E0B\u8F7D\u3002"
  },
  en: {
    "files.root": "Workspace",
    "files.location": "Current location",
    "files.empty": "This directory is empty",
    "files.failed": "Could not read remote files",
    "files.retry": "Retry loading",
    "files.modified": "Unsaved",
    "files.saved": "Saved",
    "files.items": "{count} items",
    "files.truncated": "Showing the first 2,000 entries. Open a subdirectory to browse further.",
    "files.imageFailed": "Image preview could not load. Try refreshing or downloading."
  }
};
function FileActionIcon({ kind }) {
  const paths = {
    refresh: "M13 5.5A5.5 5.5 0 1 0 13.5 10M13 2v3.5H9.5",
    up: "M8 13V3M3.5 7.5 8 3l4.5 4.5",
    upload: "M8 10V2M4.5 5.5 8 2l3.5 3.5M2 10v4h12v-4",
    download: "M8 2v8M4.5 6.5 8 10l3.5-3.5M2 10v4h12v-4"
  };
  return h("svg", { width: 15, height: 15, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, h("path", { d: paths[kind] }));
}
var remoteFileEditors = /* @__PURE__ */ new Map();
function assertFileCloseAllowed(sessionId, tab) {
  const editor = remoteFileEditors.get(`${sessionId}:${tab.id}`);
  if (editor?.blocked) {
    editor.notify();
    throw new Error("Save or discard changes before closing this file tab");
  }
}
function remoteFileUrl(sessionId, path, inline) {
  return HTTP_BASE + "/session-download?sessionId=" + encodeURIComponent(sessionId) + "&path=" + encodeURIComponent(path) + (inline ? "&inline=1" : "");
}
function RemoteFilesSidebar(props) {
  var t = useT();
  var sid = String(props.sessionId || "");
  var tabInfo = props.useTabInfo();
  var navigation = tabInfo && tabInfo.tab && tabInfo.tab.navigation;
  var [dir, setDir] = import_react16.default.useState(".");
  var [entries, setEntries] = import_react16.default.useState([]);
  var [loaded, setLoaded] = import_react16.default.useState(false);
  var [truncated, setTruncated] = import_react16.default.useState(false);
  var [remotePath, setRemotePath] = import_react16.default.useState("");
  var lastRequest = import_react16.default.useRef({ path: ".", read: false });
  var [preview, setPreview] = import_react16.default.useState(null);
  var [content, setContent] = import_react16.default.useState("");
  var [busy, setBusy] = import_react16.default.useState(false);
  var [error, setError] = import_react16.default.useState("");
  var [uploadPending, setUploadPending] = import_react16.default.useState(null);
  var generation = import_react16.default.useRef(0);
  var fileRef = import_react16.default.useRef(null);
  var operationRef = import_react16.default.useRef("");
  var editorKey = sid + ":" + String(tabInfo && tabInfo.tab && tabInfo.tab.id || "");
  var dirty = preview && !preview.binary && content !== preview.content;
  import_react16.default.useLayoutEffect(function() {
    remoteFileEditors.set(editorKey, {
      blocked: !!dirty || operationRef.current === "write" || operationRef.current === "upload",
      notify: function() {
        setError(t("acp.unsavedFile"));
      }
    });
    return function() {
      remoteFileEditors.delete(editorKey);
    };
  }, [editorKey, dirty, busy]);
  import_react16.default.useEffect(function() {
    if (!dirty) return;
    function preventUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", preventUnload);
    return function() {
      window.removeEventListener("beforeunload", preventUnload);
    };
  }, [dirty]);
  function load(path, read) {
    if (operationRef.current === "write" || operationRef.current === "upload") {
      setError(t("acp.fileSaving"));
      return;
    }
    if (dirty) {
      setError(t("acp.unsavedFile"));
      return;
    }
    lastRequest.current = { path: path || ".", read: !!read };
    var version2 = ++generation.current;
    setBusy(true);
    setError("");
    api("sessionFiles", { sessionId: sid, action: read ? "read" : "list", path: path || "." }).then(function(r) {
      if (version2 !== generation.current) return;
      setBusy(false);
      if (!r || !r.ok) {
        if (read && r?.code === "file_too_large") {
          setDir(fileDirectory(path));
          setRemotePath("");
          setPreview({ path, binary: true, tooLarge: true });
          setContent("");
          return;
        }
        setError(formatError(r, t("agents.detectFailed")));
        return;
      }
      setRemotePath(r.remotePath || "");
      if (read) {
        var file = Object.assign({}, r, { path, content: String(r.content || ""), viewRevision: version2 });
        setDir(fileDirectory(path));
        setPreview(file);
        setContent(file.content);
      } else {
        setDir(path || ".");
        setEntries(r.entries || []);
        setLoaded(true);
        setTruncated(!!r.truncated);
        setPreview(null);
        setContent("");
      }
    });
  }
  import_react16.default.useEffect(function() {
    var path = navigation && navigation.params && navigation.params.path;
    load(path || ".", !!path);
  }, [sid, navigation && navigation.revision]);
  import_react16.default.useEffect(function() {
    return function() {
      generation.current++;
    };
  }, [sid]);
  function save() {
    if (!preview || !dirty || operationRef.current) return;
    operationRef.current = "write";
    var version2 = ++generation.current;
    setBusy(true);
    setError("");
    api("sessionFiles", {
      sessionId: sid,
      action: "write",
      path: preview.path,
      content,
      expectedVersion: preview.version
    }).then(function(r) {
      if (version2 !== generation.current) return;
      operationRef.current = "";
      setBusy(false);
      if (!r || !r.ok) {
        setError(formatError(r, t("acp.fileConflict")));
        return;
      }
      setPreview(Object.assign({}, preview, r, { path: preview.path, content }));
    });
  }
  function upload(file, overwrite) {
    if (!file || busy || dirty) return;
    if (!overwrite && entries.some(function(entry) {
      return entry.name === file.name;
    })) {
      setUploadPending(file);
      return;
    }
    if (operationRef.current) return;
    operationRef.current = "upload";
    setUploadPending(null);
    var path = fileEntryPath(dir, file.name);
    var version2 = ++generation.current;
    setBusy(true);
    setError("");
    fetch(HTTP_BASE + "/session-upload?sessionId=" + encodeURIComponent(sid) + "&path=" + encodeURIComponent(path) + (overwrite ? "&overwrite=true" : ""), {
      method: "POST",
      body: file,
      headers: { "x-requested-with": "XMLHttpRequest" }
    }).then(function(response) {
      return response.json();
    }).then(function(result) {
      if (version2 !== generation.current) return;
      operationRef.current = "";
      setBusy(false);
      if (!result || !result.ok) {
        setError(formatError(result, t("agents.upload")));
        return;
      }
      load(dir, false);
    }).catch(function(err) {
      if (version2 !== generation.current) return;
      operationRef.current = "";
      setBusy(false);
      setError(String(err.message || err));
    });
  }
  const view = fileViewState({ busy, loaded, preview, entries, error });
  const location = preview ? preview.path : dir;
  const displayPath = (remotePath || location).replace(/^\.\//, "");
  const leafStart = displayPath.lastIndexOf("/") + 1;
  const parent = fileParentTarget(dir, preview?.path);
  const action = (kind, label2, onClick, disabled = busy || dirty) => h(ui.Button, {
    variant: "ghost",
    size: "sm",
    className: "rssh-files-tool",
    title: label2,
    "aria-label": label2,
    disabled,
    onClick
  }, h(FileActionIcon, { kind }));
  const empty = (label2) => h(
    "div",
    { className: "rssh-files-empty" },
    busy ? h(ui.StateDot, { state: "ongoing" }) : h(FileGlyph, { directory: !preview, name: preview?.path || dir }),
    h("p", null, label2)
  );
  return h(
    "section",
    { className: "rssh-session-files", "aria-label": t("agents.filesTitle"), "aria-busy": busy },
    h(
      "div",
      { className: "rssh-files-toolbar" },
      h(
        "nav",
        { className: "rssh-files-location", "aria-label": t("files.location") },
        h(
          ui.Button,
          { variant: "ghost", size: "sm", className: "rssh-files-root", title: t("files.root"), "aria-label": t("files.root"), disabled: busy || dirty || location === ".", onClick: () => load(".", false) },
          h(FileGlyph, { directory: true, name: "" }),
          h("span", { className: "rssh-files-root-label" }, t("files.root"))
        ),
        location !== "." ? h("span", { "aria-hidden": true }, "/") : null,
        location !== "." ? h(
          "span",
          { className: "rssh-files-path", title: displayPath, "aria-current": "page" },
          h("span", { className: "rssh-files-path-parent" }, displayPath.slice(0, leafStart)),
          h("span", { className: "rssh-files-path-leaf" }, displayPath.slice(leafStart))
        ) : null
      ),
      h(
        "div",
        { className: "rssh-files-tools" },
        action("refresh", t("agents.refresh"), () => load(preview ? preview.path : dir, !!preview)),
        action("up", t("agents.parent"), () => load(parent, false), busy || dirty || parent === null),
        action("upload", t("agents.upload"), () => fileRef.current.click())
      )
    ),
    h("input", { ref: fileRef, type: "file", hidden: true, onChange: function(e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = "";
      upload(file, false);
    } }),
    error ? h(
      "div",
      { role: "alert", className: "rssh-files-feedback" },
      h("span", null, error),
      !dirty ? h(ui.Button, { size: "sm", variant: "ghost", disabled: busy, onClick: () => load(lastRequest.current.path, lastRequest.current.read) }, t("files.retry")) : null
    ) : null,
    view === "preview" ? h(
      "div",
      { className: "rssh-file-document" },
      h(
        "div",
        { className: "rssh-files-document-bar" },
        h(
          "span",
          { className: "rssh-files-document-meta" },
          dirty ? h("span", { className: "rssh-files-dirty" }, t("files.modified")) : formatFileSize(preview.size)
        ),
        h(
          "div",
          { className: "rssh-files-document-actions" },
          !preview.binary ? h(ui.Button, { variant: dirty ? "primary" : "ghost", size: "sm", disabled: busy || !dirty, onClick: save }, t("acp.saveFile")) : null,
          dirty ? h(ui.Button, { variant: "ghost", size: "sm", disabled: busy, onClick: () => setContent(preview.content) }, t("acp.discardFile")) : null,
          h("a", { className: "rsui-button rssh-files-tool", "data-variant": "ghost", href: remoteFileUrl(sid, preview.path, false), download: "", title: t("agents.download"), "aria-label": t("agents.download") }, h(FileActionIcon, { kind: "download" }))
        )
      ),
      preview.binary ? !preview.tooLarge && /\.(png|jpe?g|gif|webp)$/i.test(preview.path) ? h("div", { className: "rssh-files-image-view" }, h("img", { key: preview.viewRevision, className: "rssh-files-image", src: remoteFileUrl(sid, preview.path, true), alt: preview.path, onError: () => setError(t("files.imageFailed")) })) : empty(t(preview.tooLarge ? "acp.previewTooLarge" : "agents.binary")) : h("textarea", { className: "rssh-file-editor", value: content, readOnly: busy, "aria-label": preview.path, spellCheck: false, wrap: "off", onChange: (event) => setContent(event.target.value) })
    ) : view === "loading" ? empty(t("agents.loading")) : view === "error" ? empty(t("files.failed")) : view === "empty" ? empty(t("files.empty")) : h("div", { className: "rssh-files-list", "aria-label": t("agents.filesTitle") }, entries.map((entry) => {
      const path = fileEntryPath(dir, entry.name);
      return h(
        ui.Button,
        { key: entry.name, variant: "ghost", className: "rssh-files-row", title: entry.name, disabled: busy, onClick: () => load(path, entry.type !== "directory") },
        h("span", { className: "rssh-files-glyph" }, h(FileGlyph, { directory: entry.type === "directory", name: entry.name })),
        h("span", { className: "rssh-files-name" }, entry.name),
        entry.type === "file" ? h("span", { className: "rssh-files-size" }, formatFileSize(entry.size)) : null
      );
    })),
    h(
      "div",
      { className: "rssh-files-footer", role: "status" },
      busy ? h(import_react16.default.Fragment, null, h(ui.StateDot, { state: "ongoing" }), t(operationRef.current ? "acp.fileSaving" : "agents.loading")) : preview ? dirty ? t("files.modified") : preview.binary ? "" : t("files.saved") : loaded ? truncated ? t("files.truncated") : t("files.items", { count: entries.length }) : ""
    ),
    uploadPending ? h(ui.Modal, {
      open: true,
      title: t("acp.overwriteFile"),
      closeLabel: t("acp.close"),
      onClose: function() {
        setUploadPending(null);
      },
      footer: h(
        import_react16.default.Fragment,
        null,
        h(ui.Button, { variant: "outline", onClick: function() {
          setUploadPending(null);
        } }, t("acp.close")),
        h(ui.Button, { variant: "primary", onClick: function() {
          upload(uploadPending, true);
        } }, t("acp.overwriteFile"))
      )
    }, uploadPending.name) : null
  );
}

// src/client/files.css
var files_default = ".rssh-session-files {\n  display: flex;\n  flex-direction: column;\n  flex: 1 1 auto;\n  height: 100%;\n  min-height: 0;\n  min-width: 0;\n  overflow: hidden;\n  box-sizing: border-box;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-bg-base);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: 1.6;\n  container: rssh-files / inline-size;\n}\n.rssh-files-toolbar {\n  display: flex;\n  flex: 0 0 auto;\n  align-items: center;\n  gap: 4px;\n  min-height: 38px;\n  padding: 0 6px 0 12px;\n  border-bottom: .5px solid var(--dsw-alias-border-l3);\n}\n.rssh-files-location {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  color: var(--dsw-alias-label-secondary);\n}\n.rssh-files-root { flex: none; padding: 2px 4px; min-height: 28px; color: inherit; }\n.rssh-files-path { display: flex; min-width: 0; overflow: hidden; white-space: nowrap; }\n.rssh-files-path-parent { flex: 0 10 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-tertiary); }\n.rssh-files-path-leaf { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-primary); }\n.rssh-files-tools { display: flex; align-items: center; gap: 2px; flex: none; }\n.rssh-files-tool {\n  width: 28px;\n  height: 28px;\n  min-height: 28px;\n  padding: 6px;\n  flex: none;\n  border: 0;\n  border-radius: var(--dsw-radius-sm);\n  color: var(--dsw-alias-label-secondary);\n  background: transparent;\n  line-height: 1;\n}\n.rssh-files-tool svg { width: 15px; height: 15px; }\n.rssh-files-tool:focus-visible, .rssh-file-editor:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }\n.rssh-files-list {\n  flex: 1 1 0;\n  min-height: 0;\n  min-width: 0;\n  overflow: auto;\n  overscroll-behavior: contain;\n  scrollbar-gutter: stable;\n  padding: 8px 0 8px 8px;\n  margin-right: 2px;\n}\n.rssh-files-row {\n  display: flex;\n  align-items: center;\n  justify-content: flex-start;\n  width: 100%;\n  min-width: 0;\n  min-height: 30px;\n  gap: 6px;\n  padding: 5px 10px;\n  border: 0;\n  border-radius: var(--dsw-radius-md);\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n}\n.rssh-files-row > svg, .rssh-files-glyph { flex: none; display: inline-flex; color: var(--dsw-alias-label-tertiary); }\n.rssh-files-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.rssh-files-size { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 11px; font-variant-numeric: tabular-nums; }\n.rssh-files-footer {\n  flex: none;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 4px 12px;\n  min-height: 20px;\n  border-top: .5px solid var(--dsw-alias-border-l3);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n}\n.rssh-files-feedback {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  padding: 8px 12px;\n  max-height: 30%;\n  overflow: auto;\n  color: var(--dsw-alias-state-error-primary);\n}\n.rssh-files-feedback > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }\n.rssh-files-empty {\n  flex: 1 1 0;\n  min-height: 0;\n  overflow: auto;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: safe center;\n  gap: 8px;\n  padding: 20px;\n  text-align: center;\n  color: var(--dsw-alias-label-secondary);\n}\n.rssh-files-empty p { margin: 0; }\n.rssh-file-document { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; min-width: 0; overflow: hidden; }\n.rssh-files-document-bar {\n  display: flex;\n  flex: none;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 6px;\n  padding: 6px 10px;\n  border-bottom: .5px solid var(--dsw-alias-border-l3);\n}\n.rssh-files-document-meta { flex: 1 1 100px; min-width: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; overflow-wrap: anywhere; }\n.rssh-files-document-actions { display: flex; align-items: center; gap: 4px; flex: none; }\n.rssh-files-dirty { color: var(--dsw-alias-state-warn-label, var(--dsw-alias-label-secondary)); }\n.rssh-file-editor {\n  flex: 1 1 0;\n  min-height: 0;\n  min-width: 0;\n  width: 100%;\n  box-sizing: border-box;\n  resize: none;\n  overflow: auto;\n  overscroll-behavior: contain;\n  border: 0;\n  border-radius: 0;\n  padding: 12px;\n  font-family: var(--ds-font-family-code);\n  font-size: var(--dsh-code-font-size, 13px);\n  line-height: 1.6;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-bg-base);\n  tab-size: 2;\n}\n.rssh-file-editor[readonly] { color: var(--dsw-alias-label-secondary); }\n.rssh-files-image-view { flex: 1 1 0; min-height: 0; min-width: 0; overflow: auto; padding: 16px; display: grid; place-items: safe center; }\n.rssh-files-image { display: block; max-width: 100%; height: auto; }\n@container rssh-files (max-width: 300px) {\n  .rssh-files-root-label, .rssh-files-size { display: none; }\n  .rssh-files-toolbar { padding-left: 6px; }\n}\n@media (hover: hover) {\n  .rssh-files-tool:hover:not(:disabled), .rssh-files-row:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }\n}\n";

// src/client/settings.js
var import_react17 = __toESM(require("react"), 1);

// src/client/settings-model.js
function connectionRowKey(profile) {
  return JSON.stringify([
    profile.id,
    profile.host,
    profile.user,
    profile.port,
    profile.authMethod,
    profile.keyPath || "",
    profile.proxyJump || ""
  ]);
}

// src/client/settings.css
var settings_default = "/* Match native Settings' 14/20 titles, 12/18 descriptions and separator rows.\n   Scope every override to this feature; the DSH settings shell is untouched. */\n.rssh-settings { display: flex; flex-direction: column; gap: 28px; width: 100%; min-width: 0; container: rssh-settings / inline-size; color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 20px; }\n.rssh-settings h2 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 500; }\n.rssh-settings-group { min-width: 0; }\n.rssh-settings-header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 4px; }\n.rssh-settings-heading { min-width: 0; flex: 1 1 180px; }\n.rssh-settings-description { margin: 4px 0 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }\n.rssh-settings-actions { display: flex; align-items: center; gap: 6px; flex: none; flex-wrap: wrap; max-width: 100%; }\n.rssh-settings-list { display: flex; flex-direction: column; min-width: 0; }\n.rssh-settings-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; padding: 16px 0; border-bottom: .5px solid var(--dsw-alias-border-l2); }\n.rssh-settings-row:last-child { border-bottom: 0; }\n.rssh-settings-info { min-width: 0; flex: 1 1 200px; overflow-wrap: anywhere; }\n.rssh-settings-row-title { margin: 0; color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 20px; font-weight: 400; }\n.rssh-settings-muted { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }\n.rssh-settings-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 4px; }\n.rssh-settings-meta .rsui-tag { background: transparent; border: .5px solid var(--dsw-alias-border-l1); font-size: 11px; line-height: 16px; padding: 0 5px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }\n.rssh-settings .rsui-button { border-radius: 8px; }\n.rssh-settings .rsui-button[data-variant=primary], .rssh-settings-dialog .rsui-button[data-variant=primary] { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }\n@media (hover: hover) {\n  .rssh-settings .rsui-button[data-variant=primary]:hover:not(:disabled):not(.rssh-settings-destructive),\n  .rssh-settings-dialog .rsui-button[data-variant=primary]:hover:not(:disabled):not(.rssh-settings-destructive) { background: var(--dsw-alias-button-primary-hover); filter: none; }\n}\n.rssh-settings-icon-button { width: 28px; height: 28px; padding: 0; }\n.rssh-settings-row-result { display: flex; align-items: flex-start; gap: 6px; margin-top: 6px; font-size: 12px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }\n.rssh-settings-row-result[data-tone=success], .rssh-settings-status { color: var(--dsw-alias-state-success-primary); }\n.rssh-settings-row-result[data-tone=error] { color: var(--dsw-alias-state-error-primary); }\n.rssh-settings-status { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; font-size: 12px; line-height: 18px; }\n.rssh-settings-empty { margin: 8px 0 0; padding: 12px 0; }\n.rssh-settings-form { display: flex; flex-direction: column; gap: 16px; }\n.rssh-settings-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; line-height: 20px; }\n.rssh-settings-grid { display: grid; grid-template-columns: minmax(0, 1fr) 100px; gap: 12px; }\n.rssh-settings-form input { width: 100%; }\n.rssh-settings-select { box-sizing: border-box; width: 100%; min-height: 32px; padding: 4px 9px; border: .5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 20px; }\n.rssh-settings-select:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }\n.rssh-settings-select:disabled { opacity: .5; cursor: not-allowed; }\n.rssh-settings-error { color: var(--dsw-alias-state-error-primary); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 18px; margin-top: 6px; }\n.rssh-settings-warning { padding: 10px 12px; border: .5px solid var(--dsw-alias-border-l2); border-radius: 8px; color: var(--dsw-alias-state-warn-label); font-size: 12px; line-height: 18px; white-space: pre-wrap; }\n.rssh-settings-warning p { margin: 0 0 8px; }\n.rssh-settings-path { overflow-wrap: anywhere; }\n.rssh-settings-dialog .rsui-modal-title { font-size: 16px; line-height: 24px; font-weight: 500; }\n.rssh-settings-dialog .rsui-modal-description { font-size: 12px; line-height: 18px; }\n.rssh-settings-dialog .rsui-input { font-size: 13px; line-height: 20px; border-radius: 8px; }\n.rssh-settings-dialog .rsui-button { border-radius: 8px; }\n.rssh-settings-dialog .rsui-button.rssh-settings-destructive { background: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-label-on-color); }\n.rssh-settings-dialog .rsui-check { font-size: 12px; line-height: 18px; }\n.rssh-settings-dialog p.rssh-settings-muted { margin: 0; }\n@container rssh-settings (max-width: 430px) {\n  .rssh-settings-header { flex-wrap: wrap; gap: 10px; }\n  .rssh-settings-row { gap: 12px; align-items: flex-start; }\n  .rssh-settings-row > .rssh-settings-actions { padding-top: 0; }\n  .rssh-settings-toolbar { flex-wrap: wrap; }\n}\n@container rssh-settings (max-width: 300px) {\n  .rssh-settings-row { flex-wrap: wrap; }\n  .rssh-settings-info { flex-basis: 100%; }\n  .rssh-settings-grid { grid-template-columns: minmax(0, 1fr); }\n}\n";

// src/client/settings.js
var h4 = import_react17.default.createElement;
var messages8 = {
  zh: {
    "rssh.settings.more": "\u66F4\u591A\u64CD\u4F5C",
    "rssh.settings.testing": "\u6B63\u5728\u6D4B\u8BD5\u8FDE\u63A5\u2026",
    "rssh.settings.profilesDescription": "\u7BA1\u7406 SSH \u5BC6\u94A5\u4E0E Kerberos \u8FDE\u63A5\u3002",
    "rssh.settings.workspacesDescription": "\u5DE5\u4F5C\u533A\u53EA\u7BA1\u7406\u8FDE\u63A5\u4E0E\u76EE\u5F55\uFF1BAgent \u548C\u6743\u9650\u5728\u6BCF\u4E2A\u65B0\u4F1A\u8BDD\u4E2D\u9009\u62E9\u3002",
    "rssh.settings.targetImmutable": "\u4E3B\u673A\u3001\u7528\u6237\u3001\u7AEF\u53E3\u548C\u8DF3\u677F\u673A\u786E\u5B9A\u8FDE\u63A5\u8EAB\u4EFD\uFF1B\u66F4\u6362\u76EE\u6807\u8BF7\u65B0\u5EFA\u8FDE\u63A5\uFF0C\u907F\u514D\u5DF2\u6709\u4F1A\u8BDD\u4E0E\u6587\u4EF6\u8BBF\u95EE\u6307\u5411\u4E0D\u540C\u673A\u5668\u3002",
    "rssh.settings.title": "\u8FDC\u7A0B SSH",
    "rssh.settings.profiles": "\u8FDE\u63A5\u914D\u7F6E",
    "rssh.settings.workspaces": "\u8FDC\u7AEF\u5DE5\u4F5C\u533A",
    "rssh.settings.newProfile": "\u65B0\u5EFA\u8FDE\u63A5",
    "rssh.settings.import": "\u4ECE SSH config \u5BFC\u5165",
    "rssh.settings.refresh": "\u5237\u65B0",
    "rssh.settings.emptyProfiles": "\u8FD8\u6CA1\u6709\u8FDE\u63A5\u914D\u7F6E\u3002\u65B0\u5EFA SSH \u5BC6\u94A5\u6216 Kerberos \u8FDE\u63A5\u540E\u5373\u53EF\u6DFB\u52A0\u8FDC\u7AEF\u5DE5\u4F5C\u533A\u3002",
    "rssh.settings.emptyWorkspaces": "\u8FD8\u6CA1\u6709\u8FDC\u7AEF\u5DE5\u4F5C\u533A\u3002\u901A\u8FC7\u300C\u6DFB\u52A0\u5DE5\u4F5C\u533A\u300D\u9009\u62E9\u8FDC\u7AEF\u76EE\u5F55\u3002",
    "rssh.settings.name": "\u540D\u79F0",
    "rssh.settings.host": "\u4E3B\u673A / SSH \u522B\u540D",
    "rssh.settings.user": "\u7528\u6237\u540D",
    "rssh.settings.port": "\u7AEF\u53E3",
    "rssh.settings.auth": "\u8BA4\u8BC1\u65B9\u5F0F",
    "rssh.settings.key": "SSH \u5BC6\u94A5",
    "rssh.settings.kerberos": "Kerberos",
    "rssh.settings.keyPath": "\u79C1\u94A5\u8DEF\u5F84\uFF08\u53EF\u9009\uFF09",
    "rssh.settings.keyHint": "\u7559\u7A7A\u65F6\u4F7F\u7528 SSH config \u6216 ssh-agent\uFF1B\u4E0D\u8BFB\u53D6\u6216\u4E0A\u4F20\u79C1\u94A5\u5185\u5BB9\u3002",
    "rssh.settings.krbHint": "\u4F7F\u7528\u672C\u673A\u73B0\u6709 Kerberos \u7968\u636E\u3002\u8BF7\u5728\u672C\u673A\u5148\u5B8C\u6210 kinit\u3002",
    "rssh.settings.remoteRoot": "\u9ED8\u8BA4\u8FDC\u7AEF\u76EE\u5F55",
    "rssh.settings.proxyJump": "\u8DF3\u677F\u673A ProxyJump\uFF08\u53EF\u9009\uFF09",
    "rssh.settings.save": "\u4FDD\u5B58",
    "rssh.settings.cancel": "\u53D6\u6D88",
    "rssh.settings.close": "\u5173\u95ED",
    "rssh.settings.edit": "\u7F16\u8F91",
    "rssh.settings.delete": "\u5220\u9664\u8FDE\u63A5",
    "rssh.settings.test": "\u6D4B\u8BD5\u8FDE\u63A5",
    "rssh.settings.testOk": "\u8FDE\u63A5\u6210\u529F",
    "rssh.settings.deleteProfileTitle": "\u5220\u9664\u8FDE\u63A5\u914D\u7F6E\uFF1F",
    "rssh.settings.deleteProfileHint": "\u8BF7\u5148\u89E3\u9664\u6B64\u8FDE\u63A5\u4E0B\u7684\u5DE5\u4F5C\u533A\u6CE8\u518C\u3002\u5220\u9664\u8FDE\u63A5\u4E0D\u4F1A\u5220\u9664\u672C\u673A\u6216\u8FDC\u7AEF\u6587\u4EF6\u3002",
    "rssh.settings.deleteProfileBlocked": "\u6B64\u8FDE\u63A5\u4ECD\u6709\u5DF2\u6CE8\u518C\u5DE5\u4F5C\u533A\uFF0C\u8BF7\u5148\u5728\u4E0B\u65B9\u89E3\u9664\u6CE8\u518C\u3002",
    "rssh.settings.importTitle": "\u5BFC\u5165 SSH config",
    "rssh.settings.importHint": "\u9009\u62E9\u4E3B\u673A\u4EE5\u586B\u5165\u65B0\u8FDE\u63A5\u8868\u5355\uFF1B\u68C0\u67E5\u7528\u6237\u540D\u548C\u8BA4\u8BC1\u65B9\u5F0F\u540E\u4FDD\u5B58\u3002",
    "rssh.settings.noSshHosts": "SSH config \u4E2D\u6CA1\u6709\u53EF\u5BFC\u5165\u7684\u5177\u4F53\u4E3B\u673A\u3002",
    "rssh.settings.required": "\u8BF7\u586B\u5199\u4E3B\u673A\u3001\u7528\u6237\u540D\u53CA\u6709\u6548\u7AEF\u53E3\uFF081\u201365535\uFF09\u3002",
    "rssh.settings.unregister": "\u89E3\u9664\u6CE8\u518C",
    "rssh.settings.unregisterTitle": "\u89E3\u9664\u5DE5\u4F5C\u533A\u6CE8\u518C\uFF1F",
    "rssh.settings.unregisterHint": "\u53EA\u89E3\u9664\u6CE8\u518C\uFF0C\u4FDD\u7559\u8FDC\u7AEF\u6587\u4EF6\u3001\u672C\u673A\u76EE\u5F55\u3001Git \u5206\u652F\u548C\u4F1A\u8BDD\u5386\u53F2\u3002\u5DF2\u521B\u5EFA\u7684 worktree \u4E5F\u5C06\u4FDD\u7559\u3002",
    "rssh.settings.removeWorktree": "\u79FB\u9664 owned worktree",
    "rssh.settings.removeWorktreeTitle": "\u79FB\u9664\u8FDC\u7AEF worktree\uFF1F",
    "rssh.settings.removeWorktreeHint": "\u8FD9\u5C06\u5220\u9664\u7531\u672C\u63D2\u4EF6\u521B\u5EFA\u7684\u8FDC\u7AEF worktree \u76EE\u5F55\u5E76\u89E3\u9664\u6CE8\u518C\u3002Git \u5206\u652F\u53CA\u4F1A\u8BDD\u5386\u53F2\u4FDD\u7559\u3002\u672A\u63D0\u4EA4\u6539\u52A8\u6216\u6D3B\u52A8\u5B9E\u4F8B\u4F1A\u963B\u6B62\u79FB\u9664\uFF1B\u4E0D\u4F1A\u5F3A\u5236\u5220\u9664\u3002",
    "rssh.settings.removeConfirm": "\u6211\u786E\u8BA4\u79FB\u9664\u4E0A\u65B9\u663E\u793A\u7684\u8FDC\u7AEF worktree \u76EE\u5F55",
    "rssh.settings.saved": "\u914D\u7F6E\u5DF2\u4FDD\u5B58",
    "rssh.settings.loading": "\u52A0\u8F7D\u4E2D\u2026",
    "rssh.settings.loadFailed": "\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
    "rssh.settings.owned": "Owned worktree"
  },
  en: {
    "rssh.settings.more": "More actions",
    "rssh.settings.testing": "Testing connection\u2026",
    "rssh.settings.profilesDescription": "Manage SSH key and Kerberos connections.",
    "rssh.settings.workspacesDescription": "Workspaces manage connections and directories. Choose the Agent and permissions in each new session.",
    "rssh.settings.targetImmutable": "Host, user, port and jump host define this connection. Create a new profile to change the target, so existing sessions and files cannot switch machines independently.",
    "rssh.settings.title": "Remote SSH",
    "rssh.settings.profiles": "Connection profiles",
    "rssh.settings.workspaces": "Remote workspaces",
    "rssh.settings.newProfile": "New connection",
    "rssh.settings.import": "Import SSH config",
    "rssh.settings.refresh": "Refresh",
    "rssh.settings.emptyProfiles": "No connections yet. Add an SSH key or Kerberos profile to create remote workspaces.",
    "rssh.settings.emptyWorkspaces": "No remote workspaces yet. Choose a remote directory through Add workspace.",
    "rssh.settings.name": "Name",
    "rssh.settings.host": "Host / SSH alias",
    "rssh.settings.user": "Username",
    "rssh.settings.port": "Port",
    "rssh.settings.auth": "Authentication",
    "rssh.settings.key": "SSH key",
    "rssh.settings.kerberos": "Kerberos",
    "rssh.settings.keyPath": "Private key path (optional)",
    "rssh.settings.keyHint": "Leave blank to use SSH config or ssh-agent. Private key contents are never read or uploaded.",
    "rssh.settings.krbHint": "Uses existing local Kerberos tickets. Run kinit locally first.",
    "rssh.settings.remoteRoot": "Default remote directory",
    "rssh.settings.proxyJump": "ProxyJump (optional)",
    "rssh.settings.save": "Save",
    "rssh.settings.cancel": "Cancel",
    "rssh.settings.close": "Close",
    "rssh.settings.edit": "Edit",
    "rssh.settings.delete": "Delete connection",
    "rssh.settings.test": "Test connection",
    "rssh.settings.testOk": "Connection successful",
    "rssh.settings.deleteProfileTitle": "Delete connection profile?",
    "rssh.settings.deleteProfileHint": "Unregister workspaces using this connection first. Deleting a profile does not delete local or remote files.",
    "rssh.settings.deleteProfileBlocked": "This connection has registered workspaces. Unregister them below first.",
    "rssh.settings.importTitle": "Import SSH config",
    "rssh.settings.importHint": "Choose a host to fill a new connection form, then review the username and authentication before saving.",
    "rssh.settings.noSshHosts": "No concrete hosts to import from SSH config.",
    "rssh.settings.required": "Enter a host, username and valid port (1\u201365535).",
    "rssh.settings.unregister": "Unregister",
    "rssh.settings.unregisterTitle": "Unregister workspace?",
    "rssh.settings.unregisterHint": "Only removes registration. Remote files, local directories, Git branches and session history remain. Any created worktree is also retained.",
    "rssh.settings.removeWorktree": "Remove owned worktree",
    "rssh.settings.removeWorktreeTitle": "Remove remote worktree?",
    "rssh.settings.removeWorktreeHint": "Deletes the remote worktree directory created by this plugin and unregisters it. Git branches and session history remain. Uncommitted changes or active instances block removal; deletion is never forced.",
    "rssh.settings.removeConfirm": "I confirm removal of the remote worktree directory shown above",
    "rssh.settings.saved": "Configuration saved",
    "rssh.settings.loading": "Loading\u2026",
    "rssh.settings.loadFailed": "Could not load. Please retry.",
    "rssh.settings.owned": "Owned worktree"
  }
};
function useRequest() {
  const generation = import_react17.default.useRef(0);
  const live = import_react17.default.useRef(false);
  const pending = import_react17.default.useRef(false);
  const [busy, setBusy] = import_react17.default.useState(false);
  const [error, setError] = import_react17.default.useState("");
  import_react17.default.useLayoutEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      pending.current = false;
      generation.current++;
    };
  }, []);
  async function run(method, args, success) {
    if (pending.current || !live.current) return;
    pending.current = true;
    const token = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await api(method, args);
      if (!live.current || token !== generation.current) return;
      if (!result?.ok) {
        setError(formatError(result));
        return;
      }
      await success?.(result);
    } catch (reason) {
      if (live.current && token === generation.current) setError(formatError(reason));
    } finally {
      if (live.current && token === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return { busy, error, setError, run };
}
function SettingsIcon({ kind }) {
  const paths = { refresh: "M13 5a5.5 5.5 0 1 0 1 5M13 2v3H10", plus: "M8 3v10M3 8h10" };
  return h4(
    "svg",
    { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    kind === "more" ? [4, 8, 12].map((cx) => h4("circle", { key: cx, cx, cy: 8, r: 0.9, fill: "currentColor", stroke: "none" })) : h4("path", { d: paths[kind] })
  );
}
function SettingsMore({ name, items, onAction, disabled = false }) {
  const t = useT();
  const [open, setOpen] = import_react17.default.useState(false);
  const label2 = `${t("rssh.settings.more")}: ${name}`;
  return h4(ui.Menu, {
    open,
    onClose: () => setOpen(false),
    align: "end",
    items,
    "aria-label": label2,
    onSelect: (id) => {
      setOpen(false);
      onAction(id);
    },
    anchor: h4(ui.Button, { size: "sm", variant: "ghost", className: "rssh-settings-icon-button", disabled, title: label2, "aria-label": label2, onClick: () => setOpen((value) => !value) }, h4(SettingsIcon, { kind: "more" }))
  });
}
function ConnectionRow({ profile, removeBlocked, onEdit, onDelete }) {
  const t = useT();
  const request = useRequest();
  const [result, setResult] = import_react17.default.useState("");
  const name = profile.name || profile.host;
  const test = () => {
    setResult("");
    request.run("testConnection", { id: profile.id }, (value) => setResult(t("rssh.settings.testOk") + (value.warning ? "\n" + value.warning : "")));
  };
  return h4(
    "div",
    { className: "rssh-settings-row" },
    h4(
      "div",
      { className: "rssh-settings-info" },
      h4("div", { className: "rssh-settings-row-title" }, name),
      h4(
        "div",
        { className: "rssh-settings-meta" },
        h4("span", { className: "rssh-settings-muted" }, `${profile.user}@${profile.host}:${profile.port}`),
        h4(ui.Tag, null, t(profile.authMethod === "kerberos" ? "rssh.settings.kerberos" : "rssh.settings.key"))
      ),
      request.busy ? h4("div", { className: "rssh-settings-row-result", role: "status" }, h4(ui.StateDot, { state: "ongoing" }), t("rssh.settings.testing")) : null,
      request.error ? h4("div", { className: "rssh-settings-row-result", "data-tone": "error", role: "alert" }, request.error) : null,
      result && !request.busy ? h4("div", { className: "rssh-settings-row-result", "data-tone": "success", role: "status" }, h4(ui.StateDot, { state: "done" }), result) : null
    ),
    h4(
      "div",
      { className: "rssh-settings-actions" },
      h4(ui.Button, { size: "sm", variant: "ghost", disabled: request.busy, "aria-label": `${t("rssh.settings.test")}: ${name}`, onClick: test }, t("rssh.settings.test")),
      h4(SettingsMore, { name, disabled: request.busy, items: [{ id: "edit", label: t("rssh.settings.edit") }, { type: "separator" }, { id: "delete", label: t("rssh.settings.delete"), disabled: removeBlocked }], onAction: (id) => id === "edit" ? onEdit() : onDelete() })
    )
  );
}
function field2(label2, control, hint) {
  return h4(
    "label",
    { className: "rssh-settings-field" },
    h4("span", null, label2),
    control,
    hint ? h4("span", { className: "rssh-settings-muted" }, hint) : null
  );
}
function errorView(error) {
  return error ? h4("div", { className: "rssh-settings-error", role: "alert" }, error) : null;
}
function choices(value, onChange, options, disabled) {
  return h4(
    "select",
    { className: "rssh-settings-select", value, disabled, onChange: (event) => onChange(event.target.value) },
    options.map(([id, label2]) => h4("option", { key: id, value: id }, label2))
  );
}
function blankProfile() {
  return { name: "", host: "", user: "", port: 22, authMethod: "key", keyPath: "", remoteRoot: "~", proxyJump: "" };
}
function profilePayload(form) {
  const port = Number(form.port);
  if (!form.host.trim() || !form.user.trim() || !Number.isInteger(port) || port < 1 || port > 65535 || !["key", "kerberos"].includes(form.authMethod)) return null;
  return {
    ...form.id ? { id: form.id } : {},
    name: form.name.trim() || form.host.trim(),
    host: form.host.trim(),
    user: form.user.trim(),
    port,
    authMethod: form.authMethod === "kerberos" ? "kerberos" : "key",
    keyPath: form.authMethod === "kerberos" ? "" : form.keyPath.trim(),
    remoteRoot: form.remoteRoot.trim() || "~",
    proxyJump: form.proxyJump.trim()
  };
}
function ProfileEditor({ profile, onClose, onSaved }) {
  const t = useT();
  const [form, setForm] = import_react17.default.useState(() => ({ ...blankProfile(), ...profile }));
  const request = useRequest();
  const change = (key2, value) => setForm((current) => ({ ...current, [key2]: value }));
  const input = (key2, type = "text") => h4(ui.Input, {
    value: form[key2],
    type,
    disabled: request.busy || !!profile?.id && ["host", "user", "port", "proxyJump"].includes(key2),
    onChange: (event) => change(key2, event.target.value)
  });
  function save(event) {
    event?.preventDefault();
    const payload2 = profilePayload(form);
    if (!payload2) {
      request.setError(t("rssh.settings.required"));
      return;
    }
    request.run("saveProfile", payload2, onSaved);
  }
  return h4(
    ui.Modal,
    {
      open: true,
      className: "rssh-settings-dialog",
      title: t(profile?.id ? "rssh.settings.edit" : "rssh.settings.newProfile"),
      closeLabel: t("rssh.settings.close"),
      onClose,
      footer: h4(import_react17.default.Fragment, null, h4(ui.Button, { variant: "ghost", onClick: onClose }, t("rssh.settings.cancel")), h4(ui.Button, { variant: "primary", loading: request.busy, onClick: save }, t("rssh.settings.save")))
    },
    h4(
      "form",
      { className: "rssh-settings-form", onSubmit: save },
      profile?.id ? h4("p", { className: "rssh-settings-muted" }, t("rssh.settings.targetImmutable")) : null,
      field2(t("rssh.settings.name"), input("name")),
      h4("div", { className: "rssh-settings-grid" }, field2(t("rssh.settings.host"), input("host")), field2(t("rssh.settings.port"), input("port", "number"))),
      field2(t("rssh.settings.user"), input("user")),
      field2(t("rssh.settings.auth"), choices(form.authMethod, (value) => change("authMethod", value), [["key", t("rssh.settings.key")], ["kerberos", t("rssh.settings.kerberos")]], request.busy)),
      form.authMethod === "key" ? field2(t("rssh.settings.keyPath"), input("keyPath"), t("rssh.settings.keyHint")) : h4("div", { className: "rssh-settings-muted" }, t("rssh.settings.krbHint")),
      field2(t("rssh.settings.remoteRoot"), input("remoteRoot")),
      field2(t("rssh.settings.proxyJump"), input("proxyJump")),
      errorView(request.error)
    )
  );
}
function SshImporter({ onClose, onChoose }) {
  const t = useT();
  const request = useRequest();
  const [hosts, setHosts] = import_react17.default.useState(null);
  const [warnings, setWarnings] = import_react17.default.useState([]);
  const load = () => request.run("listSshConfigHosts", {}, (result) => {
    setHosts(result.hosts);
    setWarnings(result.warnings);
  });
  import_react17.default.useEffect(() => {
    load();
  }, []);
  return h4(
    ui.Modal,
    {
      open: true,
      className: "rssh-settings-dialog",
      title: t("rssh.settings.importTitle"),
      description: t("rssh.settings.importHint"),
      closeLabel: t("rssh.settings.close"),
      onClose,
      footer: h4(ui.Button, { variant: "ghost", onClick: onClose }, t("rssh.settings.cancel"))
    },
    h4(
      "div",
      { className: "rssh-settings-form" },
      errorView(request.error),
      request.error ? h4(ui.Button, { onClick: load, loading: request.busy }, t("rssh.settings.refresh")) : null,
      request.busy ? h4("div", { role: "status" }, t("rssh.settings.loading")) : null,
      warnings.map((warning, index) => h4("div", { key: index, className: "rssh-settings-warning" }, String(warning))),
      hosts?.length === 0 ? h4("p", { className: "rssh-settings-muted" }, t("rssh.settings.noSshHosts")) : null,
      hosts?.map((host) => h4(ui.Button, { key: host.name, onClick: () => onChoose({ ...blankProfile(), name: host.name, host: host.name, user: host.user || "", port: host.port || 22, keyPath: host.identityFile || "", proxyJump: host.proxyJump || "", authMethod: host.gssapi ? "kerberos" : "key" }) }, host.name))
    )
  );
}
function DeleteDialog({ target, kind, blocked, onClose, onSaved }) {
  const t = useT();
  const request = useRequest();
  const [confirmed, setConfirmed] = import_react17.default.useState(false);
  const worktree = kind === "worktree";
  const title = kind === "profile" ? "deleteProfileTitle" : worktree ? "removeWorktreeTitle" : "unregisterTitle";
  const hint = kind === "profile" ? "deleteProfileHint" : worktree ? "removeWorktreeHint" : "unregisterHint";
  const label2 = kind === "profile" ? "delete" : worktree ? "removeWorktree" : "unregister";
  function remove() {
    if (blocked || worktree && !confirmed) return;
    request.run(
      kind === "profile" ? "deleteProfile" : worktree ? "removeRemoteWorktree" : "deleteWorkspace",
      worktree ? { workspaceId: target.id, confirm: true } : { id: target.id },
      onSaved
    );
  }
  return h4(
    ui.Modal,
    {
      open: true,
      className: "rssh-settings-dialog",
      title: t("rssh.settings." + title),
      description: t("rssh.settings." + hint),
      closeLabel: t("rssh.settings.close"),
      onClose,
      footer: h4(import_react17.default.Fragment, null, h4(ui.Button, { variant: "ghost", onClick: onClose }, t("rssh.settings.cancel")), h4(ui.Button, { variant: "primary", className: "rssh-settings-destructive", loading: request.busy, disabled: blocked || worktree && !confirmed, onClick: remove }, t("rssh.settings." + label2)))
    },
    h4(
      "div",
      { className: "rssh-settings-form" },
      h4("strong", { className: "rssh-settings-path" }, target.remotePath || target.name || target.host),
      worktree ? h4(ui.Checkbox, { checked: confirmed, onChange: setConfirmed, disabled: request.busy, label: t("rssh.settings.removeConfirm") }) : null,
      blocked ? errorView(t("rssh.settings.deleteProfileBlocked")) : null,
      errorView(request.error)
    )
  );
}
function SettingsSection(props) {
  const t = useT();
  const [profiles, setProfiles] = import_react17.default.useState([]);
  const [workspaces, setWorkspaces] = import_react17.default.useState([]);
  const [loaded, setLoaded] = import_react17.default.useState(false);
  const [dialog, setDialog] = import_react17.default.useState(null);
  const [status, setStatus] = import_react17.default.useState("");
  const loadGeneration = import_react17.default.useRef(0);
  const live = import_react17.default.useRef(false);
  const [loading, setLoading] = import_react17.default.useState(true);
  const [loadError, setLoadError] = import_react17.default.useState("");
  async function load() {
    const token = ++loadGeneration.current;
    setLoading(true);
    setLoadError("");
    try {
      const [p, w] = await Promise.all([api("listProfiles", {}), api("listWorkspaces", {})]);
      if (!live.current || token !== loadGeneration.current) return;
      if (!p?.ok || !w?.ok) {
        setLoadError(formatError(!p?.ok ? p : w));
        return;
      }
      setProfiles(p.profiles);
      setWorkspaces(w.workspaces);
      setLoaded(true);
    } catch (error) {
      if (live.current && token === loadGeneration.current) setLoadError(formatError(error));
    } finally {
      if (live.current && token === loadGeneration.current) setLoading(false);
    }
  }
  import_react17.default.useLayoutEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      loadGeneration.current++;
    };
  }, []);
  import_react17.default.useEffect(() => {
    load();
  }, []);
  function saved(result) {
    setDialog(null);
    setStatus(t("rssh.settings.saved"));
    void load();
    props.onBackendChanged?.(result);
  }
  const close = () => setDialog(null);
  return h4(
    "section",
    { className: "rssh-settings", "aria-label": t("rssh.settings.title") },
    h4("style", null, settings_default),
    h4(
      "section",
      { className: "rssh-settings-group", "aria-label": t("rssh.settings.profiles") },
      h4(
        "div",
        { className: "rssh-settings-header" },
        h4("div", { className: "rssh-settings-heading" }, h4("h2", null, t("rssh.settings.profiles")), h4("p", { className: "rssh-settings-description" }, t("rssh.settings.profilesDescription"))),
        h4(
          "div",
          { className: "rssh-settings-actions rssh-settings-toolbar" },
          h4(ui.Button, { size: "sm", variant: "ghost", className: "rssh-settings-icon-button", disabled: loading, title: t("rssh.settings.refresh"), "aria-label": t("rssh.settings.refresh"), onClick: load }, h4(SettingsIcon, { kind: "refresh" })),
          h4(ui.Button, { size: "sm", variant: "ghost", onClick: () => setDialog({ kind: "import" }) }, t("rssh.settings.import")),
          h4(ui.Button, { size: "sm", variant: "primary", onClick: () => setDialog({ kind: "profile", target: null }) }, h4(SettingsIcon, { kind: "plus" }), t("rssh.settings.newProfile"))
        )
      ),
      errorView(loadError),
      loading ? h4("p", { className: "rssh-settings-muted", role: "status" }, t("rssh.settings.loading")) : null,
      status ? h4("p", { className: "rssh-settings-status", role: "status" }, h4(ui.StateDot, { state: "done" }), status) : null,
      loaded && !profiles.length ? h4("p", { className: "rssh-settings-muted rssh-settings-empty" }, t("rssh.settings.emptyProfiles")) : null,
      profiles.length ? h4("div", { className: "rssh-settings-list" }, profiles.map((profile) => h4(ConnectionRow, {
        key: connectionRowKey(profile),
        profile,
        removeBlocked: loading || !!loadError,
        onEdit: () => setDialog({ kind: "profile", target: profile }),
        onDelete: () => setDialog({ kind: "deleteProfile", target: profile })
      }))) : null
    ),
    h4(
      "section",
      { className: "rssh-settings-group", "aria-label": t("rssh.settings.workspaces") },
      h4("div", { className: "rssh-settings-header" }, h4("div", { className: "rssh-settings-heading" }, h4("h2", null, t("rssh.settings.workspaces")), h4("p", { className: "rssh-settings-description" }, t("rssh.settings.workspacesDescription")))),
      loaded && !workspaces.length ? h4("p", { className: "rssh-settings-muted rssh-settings-empty" }, t("rssh.settings.emptyWorkspaces")) : null,
      workspaces.length ? h4("div", { className: "rssh-settings-list" }, workspaces.map((workspace) => h4(
        "div",
        { key: workspace.id, className: "rssh-settings-row" },
        h4(
          "div",
          { className: "rssh-settings-info" },
          h4("div", { className: "rssh-settings-row-title rssh-settings-path" }, workspace.remotePath),
          h4("div", { className: "rssh-settings-meta" }, h4("span", { className: "rssh-settings-muted" }, profiles.find((profile) => profile.id === workspace.profileId)?.name || workspace.profileId)),
          workspace.worktree?.owned ? h4("div", { className: "rssh-settings-muted" }, `${t("rssh.settings.owned")} \xB7 ${workspace.worktree.branch}`) : null
        ),
        h4(
          "div",
          { className: "rssh-settings-actions" },
          h4(SettingsMore, {
            name: workspace.remotePath,
            items: [{ id: "unregister", label: t("rssh.settings.unregister") }, ...workspace.worktree?.owned ? [{ id: "worktree", label: t("rssh.settings.removeWorktree") }] : []],
            onAction: (id) => setDialog({ kind: id === "worktree" ? "worktree" : "workspace", target: workspace })
          })
        )
      ))) : null
    ),
    dialog?.kind === "profile" ? h4(ProfileEditor, { key: dialog.target?.id || "new", profile: dialog.target, onClose: close, onSaved: saved }) : null,
    dialog?.kind === "import" ? h4(SshImporter, { onClose: close, onChoose: (profile) => setDialog({ kind: "profile", target: profile }) }) : null,
    dialog && ["deleteProfile", "workspace", "worktree"].includes(dialog.kind) ? h4(DeleteDialog, {
      key: dialog.kind + dialog.target.id,
      target: dialog.target,
      kind: dialog.kind === "deleteProfile" ? "profile" : dialog.kind,
      blocked: dialog.kind === "deleteProfile" && workspaces.some((workspace) => workspace.profileId === dialog.target.id),
      onClose: close,
      onSaved: saved
    }) : null
  );
}

// src/client/session-actions.js
var import_react18 = __toESM(require("react"), 1);
var messages9 = {
  zh: {
    "session.viewSync": "\u67E5\u770B\u540C\u6B65\u72B6\u6001",
    "session.renameUnsynced": "\u91CD\u547D\u540D\uFF08\u8FDC\u7AEF\u672A\u540C\u6B65\uFF09",
    "session.more": "\u4F1A\u8BDD\u64CD\u4F5C",
    "session.rename": "\u91CD\u547D\u540D",
    "session.pin": "\u7F6E\u9876",
    "session.unpin": "\u53D6\u6D88\u7F6E\u9876",
    "session.fork": "\u5206\u53C9",
    "session.remoteFork": "\u5206\u53C9\u8FDC\u7AEF\u4F1A\u8BDD",
    "session.forkUnavailable": "\u8FDC\u7AEF\u5206\u53C9\u6682\u4E0D\u53EF\u7528",
    "session.renameTitle": "\u91CD\u547D\u540D\u8FDC\u7AEF\u4F1A\u8BDD",
    "session.title": "\u4F1A\u8BDD\u540D\u79F0",
    "session.save": "\u4FDD\u5B58",
    "session.close": "\u5173\u95ED",
    "session.renameUnknown": "DSH \u540D\u79F0\u5DF2\u4FDD\u5B58\uFF0C\u8FDC\u7AEF\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF1B\u53EF\u7A0D\u540E\u91CD\u8BD5\u540C\u6B65\uFF1A",
    "session.renamePartial": "DSH \u540D\u79F0\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u8FDC\u7AEF\u6807\u9898\u5C1A\u672A\u540C\u6B65\uFF1A",
    "session.renameFailed": "\u91CD\u547D\u540D\u5931\u8D25",
    "session.pinFailed": "\u7F6E\u9876\u64CD\u4F5C\u5931\u8D25",
    "session.forkFailed": "\u8FDC\u7AEF\u5206\u53C9\u5931\u8D25",
    "session.forkTitle": "\u5206\u53C9\u8FDC\u7AEF\u4F1A\u8BDD",
    "session.forkDescription": "\u590D\u5236\u5F53\u524D\u6700\u65B0\u3001\u5DF2\u5B8C\u6210\u7684 Agent \u4E0A\u4E0B\u6587\uFF0C\u521B\u5EFA\u72EC\u7ACB\u4F1A\u8BDD\u3002\u4E24\u4E2A\u4F1A\u8BDD\u4ECD\u4F7F\u7528\u540C\u4E00\u5DE5\u4F5C\u76EE\u5F55\uFF1B\u8FD9\u4E0D\u4F1A\u590D\u5236\u6587\u4EF6\u6216\u521B\u5EFA worktree\u3002",
    "session.forkBusy": "\u6E90\u4F1A\u8BDD\u5C1A\u672A\u5C31\u7EEA\u3002\u8BF7\u5148\u6253\u5F00\u4F1A\u8BDD\uFF0C\u7B49\u5F85\u5F53\u524D\u56DE\u5408\u548C\u5BA1\u6279\u7ED3\u675F\uFF1B\u5DF2\u5F52\u6863\u4F1A\u8BDD\u8BF7\u5148\u53D6\u6D88\u5F52\u6863\u3002",
    "session.renaming": "\u6B63\u5728\u540C\u6B65\u4F1A\u8BDD\u540D\u79F0\u2026",
    "session.incompleteFork": "\u524D\u6B21\u5206\u53C9\u672A\u5B8C\u6210\uFF0C\u8BF7\u4FDD\u7559\u6062\u590D\u4FE1\u606F\u3002\u518D\u6B21\u521B\u5EFA\u9700\u660E\u786E\u786E\u8BA4\u3002",
    "session.forking": "\u6B63\u5728\u5206\u53C9\u8FDC\u7AEF\u4F1A\u8BDD\u2026",
    "session.recoverFork": "\u6062\u590D\u672A\u5B8C\u6210\u7684\u5206\u53C9",
    "session.unknownFork": "\u524D\u6B21\u8FDC\u7AEF\u5206\u53C9\u7ED3\u679C\u672A\u77E5\u3002\u4E0D\u4F1A\u81EA\u52A8\u91CD\u590D\u8BF7\u6C42\uFF0C\u8BF7\u4FDD\u7559\u4E0B\u9762\u7684\u6062\u590D\u4FE1\u606F\u3002",
    "session.newAfterUnknown": "\u6211\u5DF2\u4E86\u89E3\u524D\u6B21\u6062\u590D\u4FE1\u606F\uFF0C\u660E\u786E\u53D1\u8D77\u4E00\u4E2A\u65B0\u7684\u5206\u53C9\u64CD\u4F5C\u3002",
    "session.forked": "\u8FDC\u7AEF\u4F1A\u8BDD\u5DF2\u5206\u53C9",
    "session.openFork": "\u6253\u5F00\u5206\u53C9\u4F1A\u8BDD",
    "session.openFailed": "\u65E0\u6CD5\u6253\u5F00\u5206\u53C9\u4F1A\u8BDD",
    "session.syncFailed": "\u8BFB\u53D6\u4F1A\u8BDD\u64CD\u4F5C\u72B6\u6001\u5931\u8D25",
    "session.nameRequired": "\u8BF7\u8F93\u5165\u975E\u7A7A\u540D\u79F0"
  },
  en: {
    "session.viewSync": "View synchronization",
    "session.renameUnsynced": "Rename (remote unsynced)",
    "session.more": "Session actions",
    "session.rename": "Rename",
    "session.pin": "Pin",
    "session.unpin": "Unpin",
    "session.fork": "Fork",
    "session.remoteFork": "Fork remote conversation",
    "session.forkUnavailable": "Remote fork unavailable",
    "session.renameTitle": "Rename remote conversation",
    "session.title": "Session name",
    "session.save": "Save",
    "session.close": "Close",
    "session.renameUnknown": "The DSH name was saved; the remote outcome is unconfirmed. Retry synchronization later: ",
    "session.renamePartial": "The DSH name was saved, but the remote title is not synchronized: ",
    "session.renameFailed": "Rename failed",
    "session.pinFailed": "Pin operation failed",
    "session.forkFailed": "Remote fork failed",
    "session.forkTitle": "Fork remote conversation",
    "session.forkDescription": "Copy the latest completed Agent context into an independent conversation. Both conversations still use the same working directory; files and worktrees are not copied.",
    "session.forkBusy": "Open the source conversation and wait for its turn and pending approvals to finish. Unarchive it first if necessary.",
    "session.renaming": "Synchronizing session name\u2026",
    "session.incompleteFork": "The previous fork did not complete. Keep its recovery information and explicitly confirm any new attempt.",
    "session.forking": "Forking remote conversation\u2026",
    "session.recoverFork": "Recover unfinished fork",
    "session.unknownFork": "The previous remote fork outcome is unknown. It will not be retried automatically. Keep the recovery information below.",
    "session.newAfterUnknown": "I have reviewed the previous recovery information and explicitly want a new fork operation.",
    "session.forked": "Remote conversation forked",
    "session.openFork": "Open fork",
    "session.openFailed": "Could not open fork",
    "session.syncFailed": "Could not read session actions",
    "session.nameRequired": "Enter a nonempty name"
  }
};
function ActionsDialog(props) {
  const t = useT();
  const dialog = props.useActionDialog((value) => value);
  const [title, setTitle] = import_react18.default.useState("");
  import_react18.default.useEffect(() => {
    setTitle(dialog?.title || "");
  }, [dialog?.key]);
  if (!dialog) return null;
  const fork = dialog.kind === "fork";
  const unknown = !!dialog.operation && dialog.operation.phase !== "completed" && !dialog.operation.recoverable;
  const canSubmit = fork ? !dialog.busy && !dialog.metadata.archived && (!unknown || dialog.allowNew) && (dialog.metadata.canFork || dialog.operation?.recoverable) : !dialog.busy && title.trim().length > 0;
  return h(
    ui.Modal,
    {
      open: true,
      title: t(fork ? "session.forkTitle" : "session.renameTitle"),
      closeLabel: t("session.close"),
      onClose: () => {
        if (!dialog.busy) props.dismissAction();
      },
      footer: h(
        import_react18.default.Fragment,
        null,
        h(ui.Button, { variant: "outline", disabled: dialog.busy, onClick: props.dismissAction }, t("session.close")),
        h(
          ui.Button,
          { variant: "primary", disabled: !canSubmit, onClick: () => props.submitAction(title) },
          t(dialog.busy ? fork ? "session.forking" : "session.renaming" : fork ? dialog.operation?.recoverable ? "session.recoverFork" : "session.fork" : "session.save")
        )
      )
    },
    h(
      "div",
      { className: "rssh-session-action-dialog" },
      h("strong", null, dialog.title),
      fork ? h("p", null, t("session.forkDescription")) : h("label", null, t("session.title"), h(ui.Input, { value: title, disabled: dialog.busy, "data-modal-autofocus": "true", onChange: (event) => setTitle(event.target.value), onKeyDown: (event) => {
        if (event.key === "Enter" && !event.isComposing && !event.nativeEvent?.isComposing && canSubmit) {
          event.preventDefault();
          props.submitAction(title);
        }
      } })),
      fork && (dialog.metadata.archived || !dialog.metadata.canFork && !dialog.operation?.recoverable) ? h("p", { role: "status" }, t("session.forkBusy")) : null,
      !fork && dialog.syncStatus === "pending" && !dialog.busy ? h("p", { role: "status" }, t("session.renaming")) : null,
      dialog.error ? h("p", { className: "ra-acp-error", role: "alert" }, dialog.error) : null,
      unknown ? h(
        import_react18.default.Fragment,
        null,
        h("p", { role: "alert" }, t(dialog.operation?.outcome === "unknown" ? "session.unknownFork" : "session.incompleteFork")),
        h(ui.Checkbox, { checked: dialog.allowNew, disabled: dialog.busy, label: t("session.newAfterUnknown"), onChange: props.allowNewFork })
      ) : null,
      dialog.operation ? h("details", null, h("summary", null, dialog.operation.operationId), h("pre", { className: "ra-acp-json" }, JSON.stringify(dialog.operation, null, 2))) : null
    )
  );
}
function installSessionActions(ctx, { watch = stream } = {}) {
  let current = null, disposed = false, eventController, retryTimer, retries = 0;
  const titleSeen = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  const source = { getSnapshot: () => current, subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  } };
  const publish = (value) => {
    if (disposed) return;
    current = value;
    for (const listener of listeners) listener();
  };
  const t = (key2) => ctx.locale.bind(NAMESPACE)(key2);
  const openSession = (id) => ctx.uiWorkspace.openSession(id);
  const syncMessage = (record) => record && ["failed", "unknown"].includes(record.status) ? t(record.status === "unknown" ? "session.renameUnknown" : "session.renamePartial") + formatError(record.error, String(record.status)) : "";
  function openDialog(kind, metadata) {
    const previous = kind === "fork" && metadata.forkOperation?.phase !== "completed" ? metadata.forkOperation : null;
    publish({
      key: crypto.randomUUID(),
      kind,
      sessionId: metadata.sessionId,
      title: metadata.title || "",
      metadata,
      operation: previous,
      operationId: previous?.operationId || crypto.randomUUID(),
      allowNew: false,
      busy: false,
      syncStatus: metadata.titleSync?.status,
      error: kind === "rename" ? syncMessage(metadata.titleSync) : ""
    });
  }
  async function submit(title) {
    const dialog = current;
    if (!dialog || dialog.busy) return;
    if (dialog.kind === "fork" && (dialog.metadata.archived || !dialog.metadata.canFork && !dialog.operation?.recoverable || dialog.operation && dialog.operation.phase !== "completed" && !dialog.operation.recoverable && !dialog.allowNew)) return;
    if (dialog.kind === "rename" && !title.trim()) {
      publish({ ...dialog, error: t("session.nameRequired") });
      return;
    }
    const operationId = dialog.allowNew ? crypto.randomUUID() : dialog.operationId;
    publish({ ...dialog, operationId, busy: true, error: "" });
    const result = dialog.kind === "rename" ? await api("sessionRename", { sessionId: dialog.sessionId, title }) : await api("sessionFork", { sessionId: dialog.sessionId, operationId });
    if (disposed || current?.key !== dialog.key) return;
    if (!result.ok) {
      publish({ ...current, busy: false, allowNew: false, error: formatError(result), operation: result.operation || current.operation });
      return;
    }
    if (dialog.kind === "rename" && result.titleSync?.status !== "synced") {
      publish({ ...current, busy: false, title: result.title, error: t(result.titleSync?.status === "unknown" ? "session.renameUnknown" : "session.renamePartial") + formatError(result.titleSync?.error, String(result.titleSync?.status || "")) });
      return;
    }
    publish(null);
    if (dialog.kind === "fork") {
      if (ctx.uiSession.adapter.current.getSnapshot().key === dialog.sessionId) openSession(result.sessionId);
      else ctx.contextMenus.notify(t("session.forked"), true, { label: t("session.openFork"), run: () => openSession(result.sessionId), failureLabel: t("session.openFailed") });
    }
  }
  const getMetadata = async (target, signal) => {
    const result = await api("sessionActions", { sessionId: target.sessionId }, signal);
    if (!result.ok) throw new Error(formatError(result));
    return result;
  };
  ctx.effect(() => ctx.contextMenus.register({
    id: "remote-session.actions",
    target: "remote-agent-session",
    order: 100,
    observe: () => [ctx.sessions.list, ctx.workspaces.list, ctx.locale],
    resolve: async (target, signal) => {
      const metadata = await getMetadata(target, signal);
      if (!metadata.remote) return [];
      return [
        { id: "rename", label: t(metadata.titleSync && ["failed", "unknown"].includes(metadata.titleSync.status) ? "session.renameUnsynced" : "session.rename"), icon: { key: "workspace.rename" }, commandId: "session.rename", run: () => openDialog("rename", metadata), failureLabel: t("session.renameFailed") },
        { id: "pin", label: t(metadata.pinned ? "session.unpin" : "session.pin"), icon: { key: metadata.pinned ? "workspace.unpin" : "workspace.pin" }, disabled: metadata.archived === true, run: async () => {
          const result = await api("sessionPin", { sessionId: target.sessionId, pinned: !metadata.pinned });
          if (!result.ok) throw new Error(formatError(result));
        }, failureLabel: t("session.pinFailed") },
        {
          id: "fork",
          label: t("session.fork"),
          icon: { key: "workspace.fork" },
          disabled: metadata.archived === true || !metadata.canFork && !metadata.forkOperation?.recoverable,
          run: () => openDialog("fork", metadata),
          failureLabel: t("session.forkFailed")
        }
      ];
    }
  }));
  ctx.effect(() => ctx.contextMenus.register({
    id: "remote-session.fork",
    target: "session",
    order: 290,
    observe: () => [ctx.sessions.list, ctx.workspaces.list, ctx.locale],
    resolve: async (target, signal) => {
      const row = ctx.sessions.list.getSnapshot().byId[target.sessionId];
      const projection = ctx.sessions.binding(target.sessionId)?.session.projections.faceOf(REMOTE_SESSION_PROJECTION_KEY).getSnapshot() || row?.projectionValues?.[REMOTE_SESSION_PROJECTION_KEY];
      if (projection?.remote !== true) return [];
      const metadata = await getMetadata(target, signal);
      if (!metadata.remote) return [];
      return [{
        id: "remote-fork",
        label: t("session.remoteFork"),
        icon: { key: "workspace.fork" },
        disabled: metadata.archived === true || !metadata.canFork && !metadata.forkOperation?.recoverable,
        run: () => openDialog("fork", metadata),
        failureLabel: t("session.forkFailed")
      }];
    }
  }));
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "remote-session.actions",
    locale: NAMESPACE,
    inject: () => ({
      hooks: { actionDialog: source },
      dismissAction: () => {
        if (!current?.busy) publish(null);
      },
      submitAction: submit,
      allowNewFork: (value) => {
        if (current && !current.busy) publish({ ...current, allowNew: value });
      }
    })
  }, ActionsDialog));
  function titleUpdate(event) {
    if (disposed || event.type !== "title_sync" || typeof event.sessionId !== "string") return;
    retries = 0;
    const before = titleSeen.get(event.sessionId);
    if (before && before.revision > event.revision) return;
    const repeated = before?.revision === event.revision && before.status === event.status;
    titleSeen.set(event.sessionId, event);
    if (current?.kind === "rename" && current.sessionId === event.sessionId) {
      if (!current.busy) publish({ ...current, syncStatus: event.status, error: syncMessage(event) });
      return;
    }
    if (event.snapshot || repeated || !["failed", "unknown"].includes(event.status)) return;
    ctx.contextMenus.notify((event.title ? event.title + ": " : "") + syncMessage(event), false, {
      label: t("session.viewSync"),
      failureLabel: t("session.syncFailed"),
      run: async () => {
        const metadata = await getMetadata({ sessionId: event.sessionId });
        if (!disposed && metadata.remote) openDialog("rename", metadata);
      }
    });
  }
  function watchTitles() {
    if (disposed) return;
    const controller = new AbortController();
    eventController = controller;
    Promise.resolve().then(() => {
      if (disposed || controller.signal.aborted) return;
      return watch("sessionActionEvents", {}, controller.signal, titleUpdate);
    }).catch(() => {
    }).finally(() => {
      if (disposed || controller.signal.aborted) return;
      retryTimer = setTimeout(watchTitles, Math.min(1e3 * 2 ** retries++, 15e3));
    });
  }
  ctx.effect(() => {
    watchTitles();
    return () => {
      disposed = true;
      eventController?.abort();
      clearTimeout(retryTimer);
      current = null;
      listeners.clear();
      titleSeen.clear();
    };
  });
}

// src/client/zh.js
var zh_default = {
  "acp.rawDetails": "\u539F\u59CB\u8BE6\u60C5",
  "acp.sourceFallback": "\u6765\u6E90\u672A\u5173\u8054",
  "acp.stopping": "\u6B63\u5728\u505C\u6B62\u2026",
  "acp.compaction": "\u4E0A\u4E0B\u6587\u538B\u7F29",
  "acp.notice": "\u901A\u77E5",
  "acp.noCommands": "\u65E0\u53EF\u7528\u6307\u4EE4",
  "acp.noFiles": "\u65E0\u5339\u914D\u6587\u4EF6",
  "acp.inputCancelled": "\u5DF2\u53D6\u6D88 \xB7 \u672A\u53D1\u9001\u7ED9 Agent",
  "acp.state": "\u72B6\u6001",
  "acp.toolDetails": "\u5DE5\u5177\u8BE6\u60C5",
  "acp.suggestions": "\u540E\u7EED\u5EFA\u8BAE",
  "acp.previewTooLarge": "\u6587\u4EF6\u8D85\u8FC7 4 MiB \u9884\u89C8\u4E0A\u9650\uFF0C\u53EF\u76F4\u63A5\u4E0B\u8F7D\uFF08\u4E0B\u8F7D\u4E0A\u9650 64 MiB\uFF09\u3002",
  "agents.refresh": "\u5237\u65B0",
  "agents.detectFailed": "\u63A2\u6D4B\u5931\u8D25",
  "agents.filesTitle": "\u8FDC\u7AEF\u6587\u4EF6",
  "agents.upload": "\u4E0A\u4F20",
  "agents.download": "\u4E0B\u8F7D",
  "agents.binary": "\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF0C\u65E0\u6CD5\u9884\u89C8\uFF1B\u53EF\u4E0B\u8F7D\u3002",
  "agents.parent": "\u4E0A\u7EA7",
  "agents.loading": "\u52A0\u8F7D\u4E2D\u2026",
  "acp.hero": "\u8FDC\u7AEF Agent",
  "acp.messageHistory": "\u4F1A\u8BDD\u6D88\u606F",
  "acp.historyScrollHint": "\u5411\u4E0A\u6EDA\u52A8\u67E5\u770B\u66F4\u65E9\u7684\u6D88\u606F",
  "acp.historyLoading": "\u6B63\u5728\u52A0\u8F7D\u66F4\u65E9\u7684\u6D88\u606F\u2026",
  "acp.historyFailed": "\u5386\u53F2\u6D88\u606F\u52A0\u8F7D\u5931\u8D25",
  "acp.historyNoProgress": "\u6682\u65F6\u65E0\u6CD5\u52A0\u8F7D\u66F4\u65E9\u7684\u6D88\u606F",
  "acp.historyRetry": "\u91CD\u8BD5\u52A0\u8F7D",
  "acp.historyStart": "\u5DF2\u5230\u8FBE\u4F1A\u8BDD\u5F00\u5934",
  "acp.chooseAnswer": "\u8BF7\u9009\u62E9",
  "acp.fileMentions": "\u5F15\u7528\u8FDC\u7AEF\u5DE5\u4F5C\u533A\u6587\u4EF6",
  "acp.question": "Agent \u9700\u8981\u4F60\u7684\u56DE\u7B54",
  "acp.unsupportedQuestion": "\u5F53\u524D\u8868\u5355\u5305\u542B\u4E0D\u652F\u6301\u7684\u5B57\u6BB5\uFF0C\u4E0D\u80FD\u81EA\u52A8\u56DE\u7B54\u3002\u53EF\u62D2\u7EDD\u540E\u8BA9 Agent \u6539\u7528\u6587\u672C\u8BE2\u95EE\u3002",
  "acp.answerQuestion": "\u63D0\u4EA4\u56DE\u7B54",
  "acp.declineQuestion": "\u62D2\u7EDD\u56DE\u7B54",
  "acp.navigation": "\u5DE5\u4F5C\u533A\u5BFC\u822A",
  "acp.sidebar": "\u5C55\u5F00\u6216\u6536\u8D77\u4FA7\u8FB9\u680F",
  "acp.retry": "\u91CD\u8BD5\u8FDE\u63A5",
  "acp.fileSaving": "\u6587\u4EF6\u6B63\u5728\u4FDD\u5B58\u6216\u4E0A\u4F20\uFF0C\u8BF7\u7B49\u5F85\u64CD\u4F5C\u5B8C\u6210\u3002",
  "acp.unsavedFile": "\u6587\u4EF6\u6709\u672A\u4FDD\u5B58\u4FEE\u6539\uFF0C\u8BF7\u5148\u4FDD\u5B58\u6216\u653E\u5F03\u4FEE\u6539\u3002",
  "acp.fileConflict": "\u4FDD\u5B58\u5931\u8D25\u6216\u8FDC\u7AEF\u6587\u4EF6\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u540E\u6BD4\u8F83\u3002",
  "acp.saveFile": "\u4FDD\u5B58",
  "acp.discardFile": "\u653E\u5F03\u4FEE\u6539",
  "acp.truncatedFile": "\u6587\u4EF6\u4EC5\u663E\u793A\u90E8\u5206\u5185\u5BB9\uFF0C\u4E0D\u80FD\u5728\u6B64\u4FDD\u5B58\uFF1B\u8BF7\u4E0B\u8F7D\u5B8C\u6574\u6587\u4EF6\u3002",
  "acp.overwriteFile": "\u8986\u76D6\u5DF2\u6709\u6587\u4EF6",
  "acp.sending": "\u6B63\u5728\u63D0\u4EA4\u2026",
  "acp.attachmentUnsupported": "\u5F53\u524D Agent \u4E0D\u652F\u6301\u6B64\u9644\u4EF6\u7C7B\u578B\u3002",
  "acp.attachmentTooLarge": "\u6700\u591A 16 \u4E2A\u9644\u4EF6\uFF1B\u6587\u672C\u603B\u8BA1\u6700\u591A 1 MiB\uFF0C\u56FE\u7247\u603B\u8BA1\u6700\u591A 2 MiB\u3002",
  "acp.removeAttachment": "\u79FB\u9664\u9644\u4EF6",
  "acp.attachment": "\u9644\u4EF6",
  "acp.attachments": "\u5DF2\u6DFB\u52A0\u9644\u4EF6",
  "acp.imageAttachment": "\u56FE\u7247",
  "acp.fileAttachment": "\u6587\u4EF6",
  "acp.remoteFileAttachment": "\u8FDC\u7AEF\u6587\u4EF6",
  "acp.previewImage": "\u67E5\u770B\u56FE\u7247",
  "acp.imagePreviewLoading": "\u6B63\u5728\u52A0\u8F7D\u9884\u89C8",
  "acp.imagePreviewUnavailable": "\u65E0\u6CD5\u9884\u89C8",
  "acp.imageAttachmentRetained": "\u9644\u4EF6\u4ECD\u5DF2\u4FDD\u7559",
  "acp.sentImagePending": "\u5F00\u59CB\u5904\u7406\u8FD9\u6761\u6D88\u606F\u540E\u53EF\u67E5\u770B\u56FE\u7247",
  "acp.sentImageUnavailable": "\u56FE\u7247\u9884\u89C8\u4E0D\u53EF\u7528",
  "acp.retryImagePreview": "\u91CD\u8BD5\u9884\u89C8",
  "acp.sentAttachments": "\u6D88\u606F\u9644\u4EF6",
  "acp.reconnecting": "\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u6B63\u5728\u91CD\u65B0\u8FDE\u63A5\u2026",
  "acp.pathUnavailable": "\u65E0\u6CD5\u786E\u8BA4\u8BE5\u6587\u4EF6\u5C5E\u4E8E\u5F53\u524D\u8FDC\u7AEF\u5DE5\u4F5C\u533A\uFF0C\u8BF7\u4ECE\u4FA7\u8FB9\u680F\u6D4F\u89C8\u3002",
  "acp.emptyHint": "\u53D1\u9001\u6D88\u606F\uFF0C\u6216\u4ECE\u547D\u4EE4\u9762\u677F\u63D2\u5165 /\u547D\u4EE4\u3001/skills\u3002",
  "acp.contextLabel": "\u4E0A\u4E0B\u6587\u7528\u91CF",
  "acp.close": "\u5173\u95ED",
  "acp.stop": "\u505C\u6B62",
  "acp.stopReason": "\u505C\u6B62\u539F\u56E0",
  "acp.steer": "\u8FFD\u52A0",
  "acp.steerQueued": "adapter \u4E0D\u652F\u6301\u6CE8\u5165\uFF0C\u6D88\u606F\u5DF2\u6392\u5230\u4E0B\u4E00\u4E2A turn\u3002",
  "acp.send": "\u53D1\u9001",
  "acp.composerPlaceholder": "\u53D1\u6D88\u606F\uFF0C/ \u8C03\u7528\u6307\u4EE4\uFF0C@ \u5F15\u7528\u6587\u4EF6",
  "acp.addAttachment": "\u6DFB\u52A0\u9644\u4EF6",
  "acp.you": "\u4F60",
  "acp.agentRole": "Agent",
  "acp.thought": "\u601D\u8003",
  "acp.show": "\u5C55\u5F00",
  "acp.hide": "\u6536\u8D77",
  "acp.tool": "\u5DE5\u5177",
  "acp.toolPending": "\u7B49\u5F85",
  "acp.toolRunning": "\u8FD0\u884C\u4E2D",
  "acp.toolDone": "\u5B8C\u6210",
  "acp.toolFailed": "\u5931\u8D25",
  "acp.input": "\u8F93\u5165",
  "acp.output": "\u8F93\u51FA",
  "acp.plan": "\u8BA1\u5212",
  "acp.model": "\u6A21\u578B",
  "acp.reasoning": "\u601D\u8003\u7EA7\u522B",
  "acp.mode": "\u6A21\u5F0F",
  "acp.running": "\u8FD0\u884C\u4E2D",
  "acp.waiting": "\u7B49\u5F85\u6743\u9650",
  "acp.ready": "\u5C31\u7EEA",
  "acp.permissionTitle": "\u9700\u8981\u6743\u9650",
  "acp.permissionDesc": "{tool} \u8BF7\u6C42\u6267\u884C\u6743\u9650\uFF0C\u8BF7\u9009\u62E9\u5904\u7406\u65B9\u5F0F\u3002",
  "acp.dismiss": "\u5FFD\u7565",
  "acp.code": "\u4EE3\u7801",
  "acp.copy": "\u590D\u5236",
  "acp.copied": "\u5DF2\u590D\u5236",
  "acp.wrap": "\u81EA\u52A8\u6362\u884C",
  "acp.unwrap": "\u53D6\u6D88\u6362\u884C",
  "acp.footnotes": "\u811A\u6CE8",
  "acp.collapse": "\u6536\u8D77",
  "acp.collapseAria": "\u6536\u8D77",
  "acp.expand": "\u5C55\u5F00\u5269\u4F59 {count} \u884C",
  "acp.expandAria": "\u5C55\u5F00\u5269\u4F59 {count} \u884C",
  "acp.commandLine": "\u7B2C {n} \u884C\u547D\u4EE4",
  "acp.signal": "\u4FE1\u53F7 {signal}",
  "acp.exitCode": "\u9000\u51FA\u7801 {code}",
  "acp.noExitCode": "\u65E0\u9000\u51FA\u7801",
  "acp.failed": "\u5931\u8D25",
  "acp.done": "\u5B8C\u6210",
  "acp.noOutput": "\uFF08\u65E0\u8F93\u51FA\uFF09",
  "acp.readWindow": "\u663E\u793A {shown} / {total} \u884C",
  "acp.subagent": "\u5B50 Agent",
  "acp.subagentAgent": "agent",
  "acp.subagentSession": "\u4F1A\u8BDD",
  "acp.subagentTask": "\u4EFB\u52A1",
  "acp.subagentToolUse": "\u5DE5\u5177\u8C03\u7528",
  "acp.subagentBackground": "\u540E\u53F0",
  "acp.subagentOutput": "\u8F93\u51FA\u6587\u4EF6",
  "acp.subagentOpenOutput": "\u67E5\u770B\u8F93\u51FA",
  "acp.subagentSummary": "\u6458\u8981",
  "acp.nativeEvent": "\u539F\u751F\u4E8B\u4EF6",
  "acp.nativeUpdate": "sessionUpdate",
  "acp.nativeMeta": "nativeMeta",
  "acp.stateRunning": "\u8FD0\u884C\u4E2D",
  "acp.stateIdle": "\u7A7A\u95F2",
  "acp.stateRequiresAction": "\u9700\u8981\u5904\u7406",
  "acp.stateUnknown": "\u672A\u77E5\u72B6\u6001",
  "acp.sessionMessage": "\u4F1A\u8BDD\u6D88\u606F",
  "acp.messageId": "\u6D88\u606F ID",
  "acp.terminalEvent": "\u7EC8\u7AEF",
  "acp.terminalId": "\u7EC8\u7AEF ID",
  "acp.nestedCalls": "\u5D4C\u5957\u8C03\u7528 {count} \u4E2A",
  "acp.nativeEventFallback": "\u539F\u751F\u4E8B\u4EF6",
  "acp.commandsPanel": "\u547D\u4EE4\u4E0E\u6280\u80FD"
};

// src/client/en.js
var en_default = {
  "acp.rawDetails": "Raw details",
  "acp.sourceFallback": "Unlinked source",
  "acp.stopping": "Stopping\u2026",
  "acp.compaction": "Context compaction",
  "acp.notice": "Notice",
  "acp.noCommands": "No commands available",
  "acp.noFiles": "No matching files",
  "acp.inputCancelled": "Cancelled \xB7 not submitted to Agent",
  "acp.state": "State",
  "acp.toolDetails": "Tool details",
  "acp.suggestions": "Suggested follow-ups",
  "acp.previewTooLarge": "This file exceeds the 4 MiB preview limit. Download is available up to 64 MiB.",
  "agents.refresh": "Refresh",
  "agents.detectFailed": "Detection failed",
  "agents.filesTitle": "Remote files",
  "agents.upload": "Upload",
  "agents.download": "Download",
  "agents.binary": "Binary file; preview unavailable. You can download it.",
  "agents.parent": "Up",
  "agents.loading": "Loading\u2026",
  "acp.hero": "Remote Agent",
  "acp.messageHistory": "Conversation messages",
  "acp.historyScrollHint": "Scroll up for earlier messages",
  "acp.historyLoading": "Loading earlier messages\u2026",
  "acp.historyFailed": "Could not load earlier messages",
  "acp.historyNoProgress": "Earlier messages are temporarily unavailable",
  "acp.historyRetry": "Retry loading",
  "acp.historyStart": "Beginning of conversation",
  "acp.chooseAnswer": "Choose an answer",
  "acp.fileMentions": "Reference a remote workspace file",
  "acp.question": "The agent needs your input",
  "acp.unsupportedQuestion": "This form contains unsupported fields. Decline and ask the agent to use a text question.",
  "acp.answerQuestion": "Submit answer",
  "acp.declineQuestion": "Decline",
  "acp.navigation": "Workspace navigation",
  "acp.sidebar": "Toggle sidebar",
  "acp.retry": "Retry connection",
  "acp.fileSaving": "A save or upload is in progress. Wait for it to finish.",
  "acp.unsavedFile": "Save or discard your changes before navigating.",
  "acp.fileConflict": "Save failed or the remote file changed. Reload and compare.",
  "acp.saveFile": "Save",
  "acp.discardFile": "Discard changes",
  "acp.truncatedFile": "This preview is truncated and cannot be saved. Download the full file.",
  "acp.overwriteFile": "Overwrite existing file",
  "acp.sending": "Submitting\u2026",
  "acp.attachmentUnsupported": "This agent does not support this attachment type.",
  "acp.attachmentTooLarge": "At most 16 attachments, with 1 MiB of text and 2 MiB of images in total.",
  "acp.removeAttachment": "Remove attachment",
  "acp.attachment": "Attachment",
  "acp.attachments": "Attached files",
  "acp.imageAttachment": "Image",
  "acp.fileAttachment": "File",
  "acp.remoteFileAttachment": "Remote file",
  "acp.previewImage": "View image",
  "acp.imagePreviewLoading": "Loading preview",
  "acp.imagePreviewUnavailable": "Preview unavailable",
  "acp.imageAttachmentRetained": "Attachment retained",
  "acp.sentImagePending": "Image preview will be available when this message starts",
  "acp.sentImageUnavailable": "Image preview unavailable",
  "acp.retryImagePreview": "Retry preview",
  "acp.sentAttachments": "Message attachments",
  "acp.reconnecting": "Connection interrupted. Reconnecting\u2026",
  "acp.pathUnavailable": "This file could not be matched to the remote workspace. Browse it in the sidebar.",
  "acp.emptyHint": "Send a message, or use the command panel to insert /command or /skills.",
  "acp.contextLabel": "Context usage",
  "acp.close": "Close",
  "acp.stop": "Stop",
  "acp.stopReason": "Stop reason",
  "acp.steer": "Steer",
  "acp.steerQueued": "The adapter cannot inject messages; queued for the next turn.",
  "acp.send": "Send",
  "acp.composerPlaceholder": "Send a message, / for commands, @ for files",
  "acp.addAttachment": "Add attachments",
  "acp.you": "You",
  "acp.agentRole": "Agent",
  "acp.thought": "Thinking",
  "acp.show": "Show",
  "acp.hide": "Hide",
  "acp.tool": "Tool",
  "acp.toolPending": "Pending",
  "acp.toolRunning": "Running",
  "acp.toolDone": "Done",
  "acp.toolFailed": "Failed",
  "acp.input": "Input",
  "acp.output": "Output",
  "acp.plan": "Plan",
  "acp.model": "Model",
  "acp.reasoning": "Reasoning",
  "acp.mode": "Mode",
  "acp.running": "Running",
  "acp.waiting": "Waiting for permission",
  "acp.ready": "Ready",
  "acp.permissionTitle": "Permission required",
  "acp.permissionDesc": "{tool} requests permission. Choose how to proceed.",
  "acp.dismiss": "Dismiss",
  "acp.code": "Code",
  "acp.copy": "Copy",
  "acp.copied": "Copied",
  "acp.wrap": "Wrap lines",
  "acp.unwrap": "Unwrap lines",
  "acp.footnotes": "Footnotes",
  "acp.collapse": "Collapse",
  "acp.collapseAria": "Collapse",
  "acp.expand": "Show {count} more lines",
  "acp.expandAria": "Show {count} more lines",
  "acp.commandLine": "Command line {n}",
  "acp.signal": "Signal {signal}",
  "acp.exitCode": "Exit code {code}",
  "acp.noExitCode": "No exit code",
  "acp.failed": "Failed",
  "acp.done": "Done",
  "acp.noOutput": "(no output)",
  "acp.readWindow": "Showing {shown} of {total} lines",
  "acp.subagent": "Subagent",
  "acp.subagentAgent": "agent",
  "acp.subagentSession": "session",
  "acp.subagentTask": "task",
  "acp.subagentToolUse": "tool call",
  "acp.subagentBackground": "Background",
  "acp.subagentOutput": "Output file",
  "acp.subagentOpenOutput": "Open output",
  "acp.subagentSummary": "Summary",
  "acp.nativeEvent": "Native event",
  "acp.nativeUpdate": "sessionUpdate",
  "acp.nativeMeta": "nativeMeta",
  "acp.stateRunning": "Running",
  "acp.stateIdle": "Idle",
  "acp.stateRequiresAction": "Requires action",
  "acp.stateUnknown": "Unknown state",
  "acp.sessionMessage": "Session message",
  "acp.messageId": "Message ID",
  "acp.terminalEvent": "Terminal",
  "acp.terminalId": "Terminal ID",
  "acp.nestedCalls": "{count} nested call(s)",
  "acp.nativeEventFallback": "Native event",
  "acp.commandsPanel": "Commands and skills"
};

// src/client/styles.css
var styles_default = ".ra-acp {\n  display: flex;\n  flex-direction: column;\n  gap: 0;\n  min-height: 0;\n  min-width: 0;\n  width: 100%;\n}\n.ra-acp-configs {\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  flex-wrap: wrap;\n  gap: 8px;\n  min-width: 0;\n}\n.ra-acp-config { display: flex; align-items: center; min-width: 0; }\n.ra-acp-command-selected { background: var(--dsw-alias-interactive-bg-hover) !important; }\n.ra-acp-attachments {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n}\n.ra-acp-messages {\n  flex: 1;\n  min-height: 0;\n  min-width: 0;\n  overflow-y: auto;\n  overflow-x: clip;\n  overscroll-behavior-y: contain;\n  padding: 16px 32px;\n  border: none;\n  background: transparent;\n}\n.ra-acp-role {\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n  color: var(--dsw-alias-label-tertiary);\n}\n.ra-acp-system {\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n  color: var(--dsw-alias-label-tertiary);\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n.ra-acp-error {\n  margin: 0;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n  color: var(--dsw-alias-state-error-primary);\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n.ra-acp-locations {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  padding: 2px 8px;\n}\n.ra-acp-loc {\n  font-family: var(--ds-font-family-code);\n  font-size: var(--dsh-code-font-size, 11px);\n  line-height: calc(16px + var(--dsh-code-font-delta, 0px));\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-1);\n  border-radius: 4px;\n  padding: 1px 5px;\n  word-break: break-all;\n}\n.ra-acp-json {\n  max-height: 180px;\n  overflow: auto;\n  margin: 4px 0 0;\n  padding: 6px;\n  border-radius: 4px;\n  background: var(--dsw-alias-markdown-code-block);\n  color: var(--dsw-alias-label-primary);\n  font-family: var(--ds-font-family-code);\n  font-size: var(--dsh-code-font-size, 11px);\n  line-height: calc(16px + var(--dsh-code-font-delta, 0px));\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n.ra-acp-question-field {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.ra-acp-question-options {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 12px;\n}\n.ra-acp-perms {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  max-height: 240px;\n  overflow: auto;\n}\n.ra-acp-perm {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  padding: 8px;\n  border: 1px solid var(--dsw-alias-state-warn-label);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-2);\n}\n.ra-acp-perm-head {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex-wrap: wrap;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-primary);\n}\n.ra-acp-perm-opts {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex-wrap: wrap;\n}\n.ra-acp-composer {\n  flex: none;\n  width: calc(100% - 32px);\n  max-width: calc(var(--dsh-chat-content-width, 748px) + 32px);\n  box-sizing: border-box;\n  margin: 12px auto 0;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding-top: 8px;\n  border: 0;\n  --dsw-elevation-stroke-color: var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-panel);\n  background: var(--dsw-specific-input-major);\n  box-shadow: var(--dsw-elevation-soft);\n  font-size: var(--dsh-content-font-size, 14px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);\n  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);\n}\n.ra-acp-composer > .ra-acp-attachments { padding: 4px 14px 0; }\n.rssh-composer-add {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex: none;\n  width: 28px;\n  height: 28px;\n  min-height: 28px;\n  padding: 0;\n  border: 0;\n  border-radius: 50%;\n  background: var(--dsw-specific-selector);\n  color: var(--dsw-alias-label-primary);\n}\n.ra-acp-send {\n  transform: translateY(-2px);\n  background: var(--dsw-alias-button-info-fill);\n  color: var(--dsw-alias-label-on-color);\n  border: none;\n  width: 34px;\n  height: 34px;\n  padding: 0;\n  border-radius: 50%;\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n}\n@media (hover: hover) {\n  .ra-acp-send:hover:not(:disabled) {\n    background: var(--dsw-alias-button-info-hover);\n  }\n}\n.ra-acp-send:disabled {\n  opacity: .4;\n  cursor: default;\n}\n.ra-acp-send[data-pending]:disabled {\n  opacity: 1;\n  cursor: progress;\n}\n.rssh-compose-dock {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex-wrap: wrap;\n  gap: 0 12px;\n  flex: none;\n  width: calc(100% - 32px);\n  max-width: calc(var(--dsh-chat-content-width, 748px) + 32px);\n  min-height: calc(22px + var(--dsh-content-font-delta-secondary, 0px));\n  margin: 0 auto;\n  padding-top: 4px;\n}\n.rssh-composer-spinner {\n  animation: rssh-composer-spin .8s linear infinite;\n}\n@keyframes rssh-composer-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .rssh-composer-spinner {\n    animation: none;\n  }\n}\n.ra-acp-compose-bar {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: space-between;\n  align-items: center;\n  gap: 12px;\n  padding: 2px 8px 6px;\n  min-width: 0;\n  container-type: inline-size;\n}\n.ra-acp-compose-left, .ra-acp-compose-right {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  min-width: 0;\n  max-width: 100%;\n}\n.ra-acp-compose-right { margin-left: auto; flex: 0 1 auto; }\n.ra-acp-compose-bar .rssh-selector {\n  height: 28px;\n  min-height: 28px;\n  max-width: 220px;\n  min-width: 0;\n  padding: 0 4px 0 8px;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n  color: var(--dsw-alias-label-secondary);\n  background: transparent;\n  border: 0;\n  border-radius: var(--dsw-radius-sm);\n}\n.ra-acp-compose-bar .rssh-selector-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.ra-acp-compose-bar .rssh-selector > svg { flex: none; }\n.ra-acp-textarea {\n  width: 100%;\n  box-sizing: border-box;\n  min-height: calc(36px + var(--dsh-content-font-delta, 0px));\n  max-height: min(336px, 40dvh);\n  field-sizing: content;\n  overflow-y: auto;\n  resize: none;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  border: none;\n  border-radius: 0;\n  padding: 4px 8px 0 14px;\n  font: inherit;\n  outline: none;\n}\n.ra-acp-textarea::placeholder { color: var(--dsw-alias-label-caption); opacity: 1; }\n.ra-acp-composer[data-empty] .ra-acp-textarea { min-height: calc(52px + var(--dsh-content-font-delta, 0px)); }\n@container (max-width: 560px) {\n  .ra-acp-compose-left, .ra-acp-compose-right { gap: 8px; }\n}\n@container (max-width: 460px) {\n  /* ACP modes share a glyph: retain their text instead of hiding permission identity. */\n  .rssh-permission-select .rssh-selector-label { max-width: 96px; }\n  .ra-acp-compose-bar .rssh-selector { max-width: 150px; }\n}\n@media (hover: hover) {\n  .rssh-composer-add:hover:not(:disabled), .ra-acp-compose-bar .rssh-selector:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }\n}\n\n.ra-acp-view {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  height: 100%;\n  min-height: 0;\n  box-sizing: border-box;\n  padding: 0 0 12px;\n  color: var(--dsw-alias-label-primary);\n  font-size: var(--dsh-content-font-size, 14px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  width: 100%;\n  max-width: none;\n  margin: 0;\n}\n.ra-acp-view .ra-acp {\n  flex: 1;\n  min-height: 0;\n}\n.ra-acp-view .ra-acp-messages {\n  flex: 1;\n  min-height: 0;\n  max-height: none;\n}\n.ra-acp-empty-state {\n  margin: auto;\n  max-width: 560px;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 10px;\n  padding: 28px 16px;\n  text-align: center;\n}\n.rssh-conversation {\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n  min-height: 0;\n  min-width: 0;\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-primary);\n}\n.rssh-conversation-header {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 44px;\n  padding: 0 16px;\n  flex-shrink: 0;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n}\n.rssh-new-session { display: flex; flex-direction: column; align-items: flex-end; max-width: 220px; min-width: 0; }\n.rssh-new-session-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; overflow-wrap: anywhere; }\n.rssh-conversation-title {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 14px;\n  font-weight: 500;\n}\n.rssh-conversation > .ra-acp-view {\n  flex: 1;\n  height: auto;\n  min-height: 0;\n}\n.rssh-status {\n  display: flex;\n  flex: 1;\n  min-height: 0;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 10px;\n  padding: 32px 24px;\n  text-align: center;\n  color: var(--dsw-alias-label-primary);\n}\n.rssh-status-icon {\n  width: 36px;\n  height: 36px;\n  color: var(--dsw-alias-label-tertiary);\n}\n.rssh-status-spinner {\n  display: grid;\n  place-items: center;\n  width: 36px;\n  height: 36px;\n  color: var(--dsw-alias-label-secondary);\n}\n.rssh-status-spinner svg {\n  animation: rssh-status-spin 1s linear infinite;\n}\n@keyframes rssh-status-spin { to { transform: rotate(360deg); } }\n@media (prefers-reduced-motion: reduce) { .rssh-status-spinner svg { animation: none; } }\n.rssh-status-title {\n  margin: 0;\n  font-size: 15px;\n  line-height: 22px;\n  font-weight: 500;\n}\n.rssh-status-code {\n  display: inline-block;\n  max-width: 100%;\n  padding: 2px 8px;\n  border-radius: 6px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 11px;\n  line-height: 18px;\n  overflow-wrap: anywhere;\n}\n.rssh-status-description {\n  max-width: 520px;\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 13px;\n  line-height: 20px;\n  overflow-wrap: anywhere;\n}\n.rssh-status-note {\n  max-width: 520px;\n  margin: 0;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 18px;\n  overflow-wrap: anywhere;\n}\n.rssh-status-actions {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  margin-top: 6px;\n  flex-wrap: wrap;\n}\n.rssh-prepare-body {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  min-width: 0;\n}\n.rssh-prepare-row {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 0;\n}\n.rssh-prepare-label {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 18px;\n}\n.rssh-prepare-packages {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 0;\n}\n.rssh-prepare-list {\n  margin: 0;\n  padding: 0;\n  list-style: none;\n  border: .5px solid var(--dsw-alias-border-l1);\n  border-radius: 8px;\n  overflow: hidden;\n}\n.rssh-prepare-list li {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 8px 12px;\n  border-bottom: .5px solid var(--dsw-alias-border-l1);\n  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 12px;\n  line-height: 18px;\n}\n.rssh-prepare-list li:last-child { border-bottom: 0; }\n.rssh-prepare-name { min-width: 0; overflow-wrap: anywhere; }\n.rssh-prepare-version { flex: none; color: var(--dsw-alias-label-secondary); }\n.ra-acp-empty-state {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  padding: 32px 12px;\n  text-align: center;\n  flex: 1;\n  min-height: 120px;\n}\n.ra-acp-cmd-panel {\n  display: flex;\n  position: relative;\n  flex-direction: column;\n  gap: 2px;\n  min-height: 0;\n  min-width: 0;\n  max-height: 300px;\n  overflow-y: auto;\n  overflow-x: hidden;\n  overscroll-behavior: contain;\n  padding: 8px;\n  border: .5px solid var(--dsw-alias-border-l1);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n.ra-acp-cmd-row {\n  display: flex;\n  flex: 0 0 auto;\n  min-width: 0;\n  overflow: hidden;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 2px;\n  width: 100%;\n  box-sizing: border-box;\n  padding: 5px 6px;\n  border: none;\n  border-radius: 4px;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 13px;\n  line-height: 20px;\n  text-align: left;\n  cursor: pointer;\n}\n.ra-acp-cmd-heading {\n  display: flex;\n  flex: none;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  width: 100%;\n}\n.ra-acp-cmd-heading > svg {\n  flex: none;\n}\n.ra-acp-cmd-label {\n  display: block;\n  min-width: 0;\n  max-width: 100%;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n.ra-acp-cmd-description {\n  display: -webkit-box;\n  flex: none;\n  width: 100%;\n  min-width: 0;\n  max-height: 32px;\n  overflow: hidden;\n  overflow-wrap: anywhere;\n  white-space: normal;\n  font-size: 11px;\n  line-height: 16px;\n  color: var(--dsw-alias-label-secondary);\n  -webkit-box-orient: vertical;\n  -webkit-line-clamp: 2;\n}\n.ra-acp-cmd-empty {\n  padding: 12px 10px;\n  text-align: center;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 18px;\n}\n@media (hover: hover) {\n  .ra-acp-cmd-row:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n  }\n}\n@media (max-width: 767px) {\n  .ra-acp-messages {\n    padding: 12px 20px;\n  }\n  .ra-acp-configs {\n    gap: 4px;\n  }\n  .ra-acp-cmd-panel {\n    max-height: 38vh;\n  }\n}\n.rssh-selector {\n  max-width: 170px;\n  min-width: 0;\n}\n.rssh-selector > span {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.rssh-meter-trigger {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n  padding: 1px 8px;\n  border: none;\n  border-radius: var(--dsw-radius-sm);\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  font: inherit;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  font-variant-numeric: tabular-nums;\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n  white-space: nowrap;\n  cursor: pointer;\n}\n.rssh-meter-trigger[aria-expanded=true] {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n}\n@media (hover: hover) {\n  .rssh-meter-trigger:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-secondary);\n  }\n}\n.rssh-meter-trigger:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: 2px;\n}\n.rssh-meter-track {\n  fill: none;\n  stroke: var(--dsw-alias-border-l3);\n  stroke-width: 2;\n}\n.rssh-meter-fill {\n  fill: none;\n  stroke: var(--dsw-alias-label-secondary);\n  stroke-width: 2;\n  stroke-linecap: round;\n}\n.rssh-meter-trigger[data-tone=warning] .rssh-meter-fill {\n  stroke: var(--dsw-alias-state-warn-label);\n}\n.rssh-meter-trigger[data-tone=error] .rssh-meter-fill {\n  stroke: var(--dsw-alias-state-error-primary);\n}\n.rssh-stats-trigger, .rssh-usage-trigger { font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px); }\n.rssh-meter-trigger > svg { flex: none; }\n.rssh-meter-reading {\n  font-variant-numeric: tabular-nums;\n}\n.rssh-meter-panel {\n  width: min(264px, calc(100vw - 24px));\n  min-width: 0;\n  padding: 12px;\n  border-radius: 12px;\n  max-height: calc(100dvh - 24px);\n  overflow: auto;\n  text-align: left;\n  white-space: normal;\n}\n.rssh-meter-card {\n  display: flex;\n  flex-direction: column;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 20px;\n}\n.rssh-meter-header {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n.rssh-meter-headline {\n  color: var(--dsw-alias-label-tertiary);\n}\n.rssh-meter-percent {\n  font-weight: 500;\n  color: var(--dsw-alias-label-primary);\n}\n.rssh-meter-figures {\n  margin-left: auto;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-primary);\n}\n.rssh-meter-bar {\n  display: flex;\n  gap: 1px;\n  margin: 10px 0 12px;\n  height: 4px;\n  border-radius: 999px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  overflow: hidden;\n}\n.rssh-meter-segment {\n  flex: none;\n  height: 100%;\n  border-radius: 1px;\n  background: var(--dsw-alias-label-secondary);\n}\n.rssh-meter-card[data-tone=warning] .rssh-meter-segment {\n  background: var(--dsw-alias-state-warn-label);\n}\n.rssh-meter-card[data-tone=error] .rssh-meter-segment {\n  background: var(--dsw-alias-state-error-primary);\n}\n.rssh-meter-rows {\n  margin: 0;\n  display: flex;\n  flex-direction: column;\n}\n.rssh-meter-row {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 2px 0;\n}\n.rssh-meter-row dt {\n  color: var(--dsw-alias-label-secondary);\n}\n.rssh-meter-row dd {\n  margin: 0;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-primary);\n  overflow-wrap: anywhere;\n  text-align: right;\n}\n.rssh-meter-note {\n  margin: 6px 0 0;\n  font-size: 11px;\n  line-height: 16px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n\n.rssh-transcript-frame {\n  position: relative;\n  display: flex;\n  flex: 1 1 auto;\n  min-height: 0;\n  min-width: 0;\n}\n.rssh-transcript-column {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  width: 100%;\n  min-width: 0;\n  min-height: 100%;\n  max-width: var(--dsh-chat-content-width, 748px);\n  margin: 0 auto;\n}\n.rssh-transcript-column > * {\n  flex: none;\n  min-width: 0;\n}\n.rssh-transcript-item[data-flow-kind=user] {\n  margin-top: 20px;\n  margin-bottom: 12px;\n}\n.rssh-transcript-item[data-flow-kind=assistant] {\n  margin: 8px 0;\n}\n.rssh-transcript-column > :first-child {\n  margin-top: 0;\n}\n.rssh-message {\n  min-width: 0;\n}\n.rssh-message-user {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n}\n.rssh-user-stack {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 6px;\n  min-width: 0;\n  max-width: min(calc(var(--dsh-chat-content-width, 748px) * .702), 82%);\n}\n.rssh-user-bubble {\n  padding: 10px 14px;\n  border-radius: 14px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n  font-size: var(--dsh-content-font-size, 14px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n.rssh-message-delivery {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(18px + var(--dsh-content-font-delta-secondary, 0px));\n}\n.rssh-message-attachments {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: 6px;\n  max-width: 100%;\n}\n.rssh-message-attachment {\n  padding: 2px 6px;\n  border-radius: 4px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  overflow-wrap: anywhere;\n}\n.rssh-message-actions {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  min-height: 28px;\n  color: var(--dsw-alias-label-secondary);\n}\n.rssh-user-actions {\n  opacity: 0;\n}\n.rssh-message-user:hover .rssh-user-actions,\n.rssh-message-user:focus-within .rssh-user-actions {\n  opacity: 1;\n}\n.rssh-assistant-actions {\n  margin-top: 16px;\n  margin-left: -6px;\n}\n.rssh-interrupted {\n  padding: 0 6px;\n  border-radius: 4px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 18px;\n}\n.rssh-running-tail {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 28px;\n  margin-top: 12px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n}\n.rssh-jump-latest {\n  position: absolute;\n  bottom: 12px;\n  right: max(24px, calc((100% - var(--dsh-chat-content-width, 748px)) / 2));\n  width: 32px;\n  height: 32px;\n  padding: 0;\n  border-radius: 50%;\n  background: var(--dsw-alias-bg-layer-2);\n  box-shadow: var(--dsw-alias-shadow-popup);\n}\n.rssh-history-status {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  flex: none;\n  height: 32px;\n  margin-bottom: 12px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: var(--dsh-content-font-size-tertiary, 12px);\n  line-height: 20px;\n}\n.rssh-history-status > span {\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n.rssh-history-status > button { flex: none; }\n.ra-acp-messages:focus-visible {\n  outline: 2px solid var(--dsw-alias-border-l2);\n  outline-offset: -2px;\n}\n.rssh-output-alert,\n.rssh-output-retry {\n  width: calc(100% - 32px);\n  max-width: var(--dsh-chat-content-width, 748px);\n  margin: 8px auto;\n}\n.ra-acp-perms,\n.ra-acp-cmd-panel,\n.ra-acp-suggestions {\n  box-sizing: border-box;\n  width: calc(100% - 32px);\n  max-width: calc(var(--dsh-chat-content-width, 748px) + 16px);\n  margin: 8px auto 0;\n  flex: none;\n}\n@media (hover: none) {\n  .rssh-user-actions {\n    opacity: 1;\n  }\n}\n.rssh-thought {\n  flex: none;\n  min-width: 0;\n}\n.rssh-thought-toggle {\n  display: flex;\n  align-items: center;\n  width: 100%;\n  min-width: 0;\n  min-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  padding: 0;\n  border: none;\n  border-radius: 4px;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  font: inherit;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  text-align: left;\n  cursor: pointer;\n  transition: color 100ms ease;\n}\n@media (hover: hover) {\n  .rssh-thought-toggle:hover { color: var(--dsw-alias-label-secondary); }\n}\n.rssh-thought-toggle:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-info-primary);\n  outline-offset: 2px;\n}\n.rssh-thought-title,\n.rssh-thought-separator {\n  flex: none;\n}\n.rssh-thought-title {\n  font-weight: 400;\n}\n.rssh-thought-separator {\n  width: 2px;\n  height: 2px;\n  margin: 0 8px;\n  border-radius: 1px;\n  background: var(--dsw-alias-label-caption);\n}\n.rssh-thought-summary {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.rssh-thought-body {\n  margin: 8px 0;\n  padding-inline-start: calc(40px + var(--dsh-content-font-delta, 0px));\n  min-width: 0;\n}\n.rssh-thought-body .rsui-markdown {\n  color: var(--dsw-alias-label-secondary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n}\n.rssh-session-action-dialog {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  overflow-wrap: anywhere;\n}\n.rssh-session-action-dialog > label {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.rssh-session-action-dialog input {\n  width: 100%;\n  box-sizing: border-box;\n}\n.rssh-session-action-dialog p {\n  margin: 0;\n  line-height: 1.5;\n}\n.ra-acp-suggestions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n}\n/* Sidebar glyphs are plugin-owned, using the shared theme and motion rules. */\n.rssh-session-status-dot { width: 10px; height: 10px; vertical-align: middle; }\n.rssh-session-status-dot[data-state=ongoing] { width: 14px; height: 14px; }\n.rssh-session-status-dot[data-state=idle] { background: transparent; border: 1px solid var(--dsw-alias-label-tertiary); }\n";

// src/client/ui.css
var ui_default = ":where(.rsui-button, .rsui-input, .rsui-check-input, .rsui-menu-item):focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: 2px;\n}\n\n:where(.rsui-button) {\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  min-height: 32px;\n  padding: 4px 12px;\n  border: 1px solid transparent;\n  border-radius: 6px;\n  background: var(--dsw-alias-button-ghost-active-fill,var(--dsw-alias-bg-layer-2));\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 14px;\n  line-height: 22px;\n  cursor: pointer;\n  vertical-align: middle;\n  text-decoration: none;\n}\n:where(.rsui-button[data-size=sm]) {\n  min-height: 28px;\n  padding: 2px 9px;\n  font-size: 12px;\n  line-height: 20px;\n}\n:where(.rsui-button[data-size=lg]) {\n  min-height: 40px;\n  padding: 8px 16px;\n}\n:where(.rsui-button[data-variant=outline]) {\n  border-color: var(--dsw-alias-border-l2);\n  background: transparent;\n}\n:where(.rsui-button[data-variant=ghost]) {\n  background: transparent;\n}\n:where(.rsui-button[data-variant=primary]) {\n  background: var(--dsw-alias-state-business-primary);\n  color: var(--dsw-alias-label-inverse,var(--dsw-alias-bg-base));\n}\n:where(.rsui-button):disabled {\n  opacity: .5;\n  cursor: not-allowed;\n}\n@media (hover: hover) {\n  :where(.rsui-button):hover:not(:disabled) {\n    background: var(--dsw-alias-interactive-bg-hover);\n  }\n  :where(.rsui-button[data-variant=primary]):hover:not(:disabled) {\n    background: var(--dsw-alias-state-business-primary);\n    filter: brightness(.95);\n  }\n}\n\n:where(.rsui-input) {\n  box-sizing: border-box;\n  min-width: 0;\n  min-height: 32px;\n  padding: 4px 9px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 6px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 14px;\n  line-height: 22px;\n}\n:where(.rsui-input)::placeholder {\n  color: var(--dsw-alias-label-tertiary);\n}\n:where(.rsui-input):disabled {\n  opacity: .5;\n  cursor: not-allowed;\n}\n:where(.rsui-input[aria-invalid=true]) {\n  border-color: var(--dsw-alias-state-error-primary);\n}\n\n.rsui-check {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 13px;\n  line-height: 20px;\n  cursor: pointer;\n}\n.rsui-check:has(:disabled) {\n  opacity: .5;\n  cursor: not-allowed;\n}\n.rsui-check-input {\n  width: 16px;\n  height: 16px;\n  margin: 0;\n  flex: none;\n  accent-color: var(--dsw-alias-state-business-primary);\n}\n.rsui-tag {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  border-radius: 4px;\n  padding: 0 5px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  line-height: 18px;\n  white-space: nowrap;\n}\n.rsui-tag[data-tone=warning],\n.rsui-dot[data-state=warning] {\n  color: var(--dsw-alias-state-warn-label);\n}\n.rsui-tag[data-tone=error],\n.rsui-tag[data-tone=danger],\n.rsui-dot[data-state=error] {\n  color: var(--dsw-alias-state-error-primary);\n}\n.rsui-tag[data-tone=success],\n.rsui-dot[data-state=done] {\n  color: var(--dsw-alias-state-success-primary);\n}\n.rsui-tag[data-tone=info],\n.rsui-tag[data-tone=primary] {\n  color: var(--dsw-alias-state-business-primary);\n}\n.rsui-dot {\n  box-sizing: border-box;\n  display: inline-block;\n  flex: none;\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n  background: currentColor;\n  color: var(--dsw-alias-label-tertiary);\n}\n.rsui-dot[data-state=ongoing] {\n  width: 10px;\n  height: 10px;\n  background: transparent;\n  border: 1.5px solid var(--dsw-alias-border-l2);\n  border-top-color: var(--dsw-alias-state-business-primary);\n  animation: rsui-spin 1s linear infinite;\n}\n@keyframes rsui-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .rsui-dot[data-state=ongoing] {\n    animation: none;\n    border-color: var(--dsw-alias-state-business-primary);\n  }\n}\n:where(.rsui-modal) {\n  box-sizing: border-box;\n  width: 520px;\n  max-width: calc(100vw - 32px);\n  max-height: calc(100dvh - 32px);\n  padding: 0;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 12px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  box-shadow: var(--dsw-alias-shadow-popup);\n  font: inherit;\n  overflow: auto;\n  overscroll-behavior: contain;\n}\n.rsui-modal {\n  min-width: 0;\n}\n.rsui-modal::backdrop {\n  background: var(--dsw-alias-mask, var(--dsw-alias-bg-base));\n  opacity: .6;\n}\n.rsui-modal-head {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 18px 20px 10px;\n}\n.rsui-modal-title {\n  margin: 0;\n  flex: 1;\n  min-width: 0;\n  font-size: 16px;\n  font-weight: 600;\n  line-height: 24px;\n}\n.rsui-modal-description {\n  margin: 0;\n  padding: 0 20px 12px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 13px;\n  line-height: 20px;\n  white-space: pre-wrap;\n}\n.rsui-modal-body {\n  padding: 6px 20px 20px;\n  min-width: 0;\n}\n.rsui-modal-footer {\n  display: flex;\n  justify-content: flex-end;\n  flex-wrap: wrap;\n  gap: 8px;\n  padding: 14px 20px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n.rsui-menu-anchor {\n  display: inline-flex;\n  position: relative;\n  align-items: center;\n  max-width: 100%;\n}\n.rsui-menu {\n  box-sizing: border-box;\n  position: fixed;\n  inset: auto;\n  margin: 0;\n  padding: 4px;\n  width: max-content;\n  min-width: min(160px, calc(100vw - 16px));\n  max-width: calc(100vw - 16px);\n  max-height: min(360px, calc(100dvh - 16px));\n  overflow: auto;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  box-shadow: var(--dsw-alias-shadow-popup);\n  font: inherit;\n  z-index: 1;\n}\n.rsui-menu[hidden] {\n  display: none;\n}\n.rsui-menu-item {\n  box-sizing: border-box;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  padding: 6px 8px;\n  border: 0;\n  border-radius: 4px;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 13px;\n  line-height: 20px;\n  text-align: left;\n  cursor: pointer;\n}\n.rsui-menu-item:disabled {\n  opacity: .5;\n  cursor: not-allowed;\n}\n.rsui-menu-item[aria-checked=true] {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.rsui-menu-item:focus-visible {\n  outline-offset: -2px;\n}\n.rsui-menu-label {\n  flex: 1;\n  min-width: 0;\n  overflow-wrap: anywhere;\n}\n.rsui-menu-detail {\n  display: block;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 16px;\n}\n.rsui-menu-separator {\n  border: 0;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  margin: 4px;\n}\n.rsui-menu-check {\n  width: 16px;\n  flex: none;\n}\n@media (hover: hover) {\n  .rsui-menu-item:hover:not(:disabled) {\n    background: var(--dsw-alias-interactive-bg-hover);\n  }\n}\n\n/* Text-flow styles: theme typography, lightweight banners, horizontal-only scroll. */\n.rsui-block {\n  box-sizing: border-box;\n  min-width: 0;\n  max-width: 100%;\n  margin: 0;\n  border-radius: 8px;\n  background: var(--dsw-alias-markdown-code-block);\n  color: var(--dsw-alias-label-primary);\n}\n.rsui-block-banner {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 4px;\n  padding: 6px 12px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta, 0px));\n}\n.rsui-block-label {\n  flex: 1;\n  min-width: 0;\n  overflow-wrap: anywhere;\n}\n.rsui-block-status {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  overflow-wrap: anywhere;\n}\n.rsui-text-action[data-icon-only=true] {\n  flex: none;\n  width: 24px;\n  min-height: 24px;\n  padding: 4px;\n  gap: 0;\n}\n.rsui-block-pre {\n  box-sizing: border-box;\n  max-width: 100%;\n  margin: 0;\n  padding: 4px 0 12px;\n  overflow-x: auto;\n  font-family: var(--ds-font-family-code, var(--dsh-font-family-code, var(--dsh-font-family-code-default)));\n  font-size: var(--dsh-code-font-size, 11px);\n  line-height: calc(19px + var(--dsh-code-font-delta, 0px));\n  tab-size: 4;\n}\n.rsui-block-pre > code { font: inherit; }\n.rsui-block-line {\n  display: flex;\n  min-width: max-content;\n  min-height: 1lh;\n  padding: 0 12px;\n  white-space: pre;\n}\n.rsui-block-pre[data-wrap=true] .rsui-block-line {\n  min-width: 0;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n.rsui-block-number {\n  display: inline-block;\n  min-width: 3ch;\n  padding-right: 12px;\n  flex: none;\n  text-align: right;\n  color: var(--dsw-alias-label-tertiary);\n  user-select: none;\n}\n.rsui-block-line-text { min-width: 0; flex: 1; }\n.rsui-block-line[data-kind=add] {\n  color: var(--dsw-alias-state-success-primary);\n  background: var(--dsw-alias-state-success-secondary, transparent);\n}\n.rsui-block-line[data-kind=remove] {\n  color: var(--dsw-alias-state-error-primary);\n  background: var(--dsw-alias-state-error-secondary, transparent);\n}\n.rsui-block-sign { width: 2ch; flex: none; user-select: none; }\n.rsui-block-footer {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  flex-wrap: wrap;\n  gap: 8px;\n  padding: 4px 12px 8px;\n}\n.rsui-copy-feedback {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  overflow: hidden;\n  clip-path: inset(50%);\n  white-space: nowrap;\n}\n.rsui-copy-error {\n  display: block;\n  color: var(--dsw-alias-state-error-primary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  overflow-wrap: anywhere;\n}\n.rsui-terminal-command {\n  margin: 0;\n  padding: 4px 12px 8px;\n  font-family: var(--ds-font-family-code, var(--dsh-font-family-code, var(--dsh-font-family-code-default)));\n  font-size: var(--dsh-code-font-size, 11px);\n  line-height: calc(19px + var(--dsh-code-font-delta, 0px));\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n.rsui-terminal-meta {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 8px;\n  padding: 4px 12px 8px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  overflow-wrap: anywhere;\n}\n:where(.rsui-block-pre, .rsui-markdown-table):focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n.rsui-markdown {\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n  min-width: 0;\n  max-width: 100%;\n  color: var(--dsw-alias-label-primary);\n  font-family: inherit;\n  font-size: var(--dsh-content-font-size, 14px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  overflow-wrap: anywhere;\n}\n.rsui-markdown p { margin: 0; white-space: pre-wrap; }\n.rsui-markdown h1,\n.rsui-markdown h2,\n.rsui-markdown h3,\n.rsui-markdown h4,\n.rsui-markdown h5,\n.rsui-markdown h6 {\n  margin: 0;\n  line-height: 1.4;\n  font-weight: 600;\n}\n.rsui-markdown h1 { font-size: 1.65em; }\n.rsui-markdown h2 { font-size: 1.4em; }\n.rsui-markdown h3 { font-size: 1.2em; }\n.rsui-markdown h4,\n.rsui-markdown h5,\n.rsui-markdown h6 { font-size: 1em; }\n.rsui-markdown a {\n  color: var(--dsw-alias-state-business-primary);\n  text-decoration: underline;\n  text-underline-offset: 2px;\n}\n.rsui-markdown :not(pre) > code {\n  border-radius: 4px;\n  padding: 1px 4px;\n  background: var(--dsw-alias-markdown-code-block);\n  font-family: var(--ds-font-family-code, var(--dsh-font-family-code, var(--dsh-font-family-code-default)));\n  font-size: calc(12px + var(--dsh-code-font-delta, 0px));\n  line-height: calc(19px + var(--dsh-code-font-delta, 0px));\n}\n.rsui-markdown ul,\n.rsui-markdown ol { padding-inline-start: 24px; margin: 0; }\n.rsui-markdown li + li { margin-top: 4px; }\n.rsui-markdown li > :not(:first-child) { margin-top: 4px; }\n.rsui-markdown [data-loose=true] > li > :not(:first-child),\n.rsui-markdown [data-loose=true] > li + li { margin-top: 16px; }\n.rsui-markdown li:has(> .rsui-markdown-task) { list-style: none; }\n.rsui-markdown-task {\n  float: inline-start;\n  margin: 5px 7px 0 -21px;\n  accent-color: var(--dsw-alias-state-business-primary);\n}\n.rsui-markdown blockquote {\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n  margin: 0;\n  padding: 0 12px;\n  border-inline-start: 3px solid var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-secondary);\n}\n.rsui-markdown hr {\n  width: 100%;\n  border: 0;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  margin: 0;\n}\n.rsui-markdown-table {\n  min-width: 0;\n  max-width: 100%;\n  overflow-x: auto;\n  margin: 0;\n}\n.rsui-markdown table {\n  border-collapse: collapse;\n  width: max-content;\n  min-width: 100%;\n  font-size: inherit;\n}\n.rsui-markdown th,\n.rsui-markdown td {\n  padding: 6px 10px;\n  border: 1px solid var(--dsw-alias-border-l1);\n  vertical-align: top;\n}\n.rsui-markdown th { font-weight: 600; background: var(--dsw-alias-bg-layer-2); }\n";

// src/client/tool-stream.css
var tool_stream_default = "/* Owned tool/agent/state flow: native theme axes, not a second card shell. */\n.rssh-flow { flex: none; min-width: 0; display: flex; flex-direction: column; color: var(--dsw-alias-label-tertiary); }\n.rssh-flow-toggle { appearance: none; display: flex; align-items: center; width: 100%; min-width: 0; min-height: calc(24px + var(--dsh-content-font-delta, 0px)); padding: 0; margin: 0; border: none; background: transparent; color: inherit; font-family: inherit; font-size: var(--dsh-content-font-size-secondary, 13px); line-height: calc(24px + var(--dsh-content-font-delta, 0px)); text-align: left; cursor: pointer; transition: color 100ms ease; }\n.rssh-flow-toggle:focus-visible { outline: 2px solid var(--dsw-alias-state-info-primary); outline-offset: 2px; border-radius: 4px; }\n.rssh-flow-icon { flex: none; width: 14px; height: 14px; margin-right: 6px; }\n.rssh-flow-title { flex: 1 1 auto; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; color: var(--dsw-alias-label-secondary); }\n.rssh-flow[data-summary] > .rssh-flow-toggle .rssh-flow-title { flex: 1 1 60%; min-width: min(14ch, 40%); max-width: 75%; }\n.rssh-flow-summary { flex: 0 1 40%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dsh-content-font-size-secondary, 13px); color: var(--dsw-alias-label-tertiary); }\n/* The group label is short; its current-activity summary needs the remaining space. */\n.rssh-process-disclosure[data-summary] > .rssh-flow-toggle .rssh-flow-title { flex: 0 0 auto; min-width: 0; max-width: 60%; }\n.rssh-process-disclosure > .rssh-flow-toggle .rssh-flow-summary { flex: 1 1 auto; }\n.rssh-flow-separator { flex: none; width: 2px; height: 2px; margin: 0 8px; border-radius: 1px; background: var(--dsw-alias-label-caption); }\n/* Both the disclosure affordance and category remain legible without hover. */\n.rssh-disclosure-leading { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 4px; width: calc(32px + var(--dsh-content-font-delta, 0px)); margin-right: 8px; }\n.rssh-disclosure-leading svg { flex: none; width: 14px; height: 14px; margin: 0; }\n.rssh-disclosure-icon { display: inline-flex; order: 1; }\n.rssh-disclosure-chevron { color: var(--dsw-alias-label-tertiary); transform: rotate(-90deg); transition: transform 100ms ease; }\n:is(.rssh-flow-toggle,.rssh-thought-toggle)[aria-expanded=true] > .rssh-disclosure-leading .rssh-disclosure-chevron { transform: rotate(0deg); }\n.rssh-flow-status { flex: none; margin-left: 8px; font-size: var(--dsh-content-font-size-secondary, 13px); color: var(--dsw-alias-label-tertiary); }\n.rssh-flow-status[data-active] { color: var(--dsw-alias-state-info-primary); }\n.rssh-flow-active-mark { flex: none; width: 6px; height: 6px; margin-left: 8px; border-radius: 50%; background: var(--dsw-alias-state-info-primary); }\n.rssh-flow-failure { flex: none; margin-left: 8px; font-size: var(--dsh-content-font-size-secondary, 13px); color: var(--dsw-alias-state-error-primary); }\n.rssh-flow[data-failed] > .rssh-flow-toggle .rssh-flow-summary { color: var(--dsw-alias-state-error-primary); }\n.rssh-flow-body { min-width: 0; margin: 8px 0; padding-inline-start: calc(40px + var(--dsh-content-font-delta, 0px)); color: var(--dsw-alias-label-secondary); font-size: var(--dsh-content-font-size, 14px); line-height: calc(24px + var(--dsh-content-font-delta, 0px)); overflow-wrap: anywhere; }\n.rssh-flow-body[hidden], .rssh-flow-toggle[hidden] { display: none; }\n.rssh-process-disclosure > .rssh-flow-toggle { font-size: var(--dsh-content-font-size, 14px); }\n.rssh-process-disclosure[data-open] > .rssh-flow-toggle { padding-bottom: 8px; }\n.rssh-process-disclosure > .rssh-flow-body { margin: 0 0 8px; padding-inline-start: 0; }\n.rssh-process-disclosure[data-scroll-body] > .rssh-flow-body { max-height: min(400px, 50vh); overflow-y: auto; scrollbar-gutter: stable; }\n.rssh-process-disclosure[data-scroll-body] > .rssh-flow-body:focus-visible { outline: 2px solid var(--dsw-alias-state-info-primary); outline-offset: 2px; border-radius: 4px; }\n.rssh-process-disclosure[data-flat] > .rssh-flow-body { margin: 0; }\n.rssh-process-disclosure > .rssh-flow-body > :not([hidden]):not(:empty) ~ :not([hidden]):not(:empty),\n.rssh-process-rows > :not([hidden]):not(:empty) ~ :not([hidden]):not(:empty) { margin-top: 4px; }\n.rssh-flow[data-secondary] > .rssh-flow-toggle { font-size: var(--dsh-content-font-size-secondary, 13px); }\n.rssh-flow-children { min-width: 0; margin-top: 8px; padding-inline-start: 16px; }\n.rssh-flow-text { min-width: 0; margin: 4px 0; }\n.rssh-flow-command { min-width: 0; max-width: 100%; margin: 4px 0; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--ds-font-family-code, monospace); font-size: var(--dsh-content-font-size-secondary, 13px); line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px)); }\n.rssh-flow-plan-row { display: flex; align-items: baseline; gap: 8px; font-size: var(--dsh-content-font-size-secondary, 13px); line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px)); }\n.rssh-flow-agent-meta { font-size: var(--dsh-content-font-size-secondary, 13px); line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px)); margin-bottom: 4px; }\n.rssh-flow-source { min-width: 0; margin: 2px 0; color: var(--dsw-alias-label-tertiary); font-size: var(--dsh-content-font-size-secondary, 13px); line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px)); overflow-wrap: anywhere; }\n.rssh-flow-locations { display: flex; flex-wrap: wrap; gap: 4px; }\n.rssh-flow-raw { min-width: 0; margin-top: 8px; color: var(--dsw-alias-label-tertiary); font-size: var(--dsh-content-font-size-secondary, 13px); line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px)); }\n.rssh-flow-raw > summary { width: fit-content; cursor: pointer; }\n.rssh-flow-raw > summary:focus-visible { outline: 2px solid var(--dsw-alias-state-info-primary); outline-offset: 2px; }\n.rssh-flow-raw-label { margin-top: 6px; color: var(--dsw-alias-label-tertiary); }\n.rssh-flow-raw-text { margin: 2px 0 6px; padding: 8px 12px; border: .5px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-lg, 8px); background: var(--dsw-alias-markdown-code-block); color: var(--dsw-alias-label-secondary); font-family: var(--ds-font-family-code, monospace); font-size: var(--dsh-content-font-size-secondary, 13px); line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px)); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 260px; overflow: auto; }\n/* A bounded group owns the only vertical scrollport; raw stays bounded elsewhere. */\n.rssh-process-disclosure[data-scroll-body] .rssh-flow-raw-text { max-height: none; overflow: visible; }\n.rssh-flow-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }\n/* Activity is static text/mark, never a competing whole-title shimmer. */\n@media (hover: hover) { .rssh-flow-toggle:hover { color: var(--dsw-alias-label-secondary); } }\n@media (pointer: coarse) { .rssh-flow-toggle, .rssh-thought-toggle { min-height: 40px; } }\n@media (prefers-reduced-motion: reduce) {\n  .rssh-flow-toggle, .rssh-thought-toggle, .rssh-disclosure-chevron { transition: none; }\n}\n\n.rssh-flow-notice {\n  display: flex;\n  align-items: flex-start;\n  gap: 6px;\n  min-width: 0;\n  padding: 2px 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n}\n.rssh-flow-notice .rssh-flow-icon { margin-top: 3px; }\n.rssh-flow-notice[data-tone=warning] { color: var(--dsw-alias-state-warn-label); }\n.rssh-flow-notice[data-tone=error] { color: var(--dsw-alias-state-error-primary); }\n.rssh-flow-notice-body { min-width: 0; overflow-wrap: anywhere; }\n.rssh-flow-notice-body strong { font-weight: 500; }\n";

// src/client/attachments.css
var attachments_default = "/* Local composer attachments: one compact, keyboard-reachable horizontal strip. */\n.rssh-attachments { box-sizing: border-box; display: flex; flex-wrap: nowrap; align-items: flex-start; gap: 10px; min-width: 0; max-width: 100%; margin: 0; padding: 4px 14px 6px; overflow-x: auto; list-style: none; }\n.rssh-attachment { flex: 0 0 88px; min-width: 0; color: var(--dsw-alias-label-secondary); }\n.rssh-attachment-thumbnail { box-sizing: border-box; position: relative; display: flex; align-items: center; justify-content: center; width: 88px; height: 72px; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg, 8px); background: var(--dsw-specific-input-major); color: var(--dsw-alias-label-secondary); font: inherit; }\n.rssh-attachment-thumbnail { appearance: none; cursor: zoom-in; overflow: hidden; }\n.rssh-attachment-thumbnail:disabled { cursor: default; }\n.rssh-attachment-thumbnail img { display: block; width: 100%; height: 100%; object-fit: contain; opacity: 0; }\n.rssh-attachment-thumbnail img[data-loaded] { opacity: 1; }\n.rssh-attachment-placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 4px; font-size: 10px; line-height: 14px; color: var(--dsw-alias-label-tertiary); }\n.rssh-attachment-placeholder[data-failed] { color: var(--dsw-alias-state-warn-label); }\n.rssh-attachment-file { box-sizing: border-box; display: flex; flex: none; align-items: center; gap: 6px; min-width: 0; max-width: min(240px, 100%); min-height: 32px; padding: 3px 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg, 8px); background: var(--dsw-specific-input-major); color: var(--dsw-alias-label-secondary); }\n.rssh-attachment-file > svg { flex: none; }\n.rssh-attachment-caption { display: flex; align-items: center; gap: 2px; min-width: 0; min-height: 28px; }\n.rssh-attachment-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dsh-content-font-size-secondary, 13px); line-height: 20px; }\n.rssh-attachment-remove { appearance: none; display: inline-flex; flex: none; align-items: center; justify-content: center; width: 24px; height: 24px; margin: 0; padding: 0; border: none; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }\n.rssh-attachment-remove:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }\n.rssh-attachment-remove:disabled { color: var(--dsw-alias-label-caption); cursor: default; }\n.rssh-attachment-thumbnail:focus-visible, .rssh-attachment-remove:focus-visible { outline: 2px solid var(--dsw-alias-state-info-primary); outline-offset: 1px; }\n.rssh-attachment-note { display: block; font-size: 10px; line-height: 14px; color: var(--dsw-alias-label-tertiary); }\n.rssh-image-preview { width: min(960px, calc(100vw - 32px)); }\n.rssh-image-preview .rsui-modal-title { overflow-wrap: anywhere; }\n.rssh-image-preview-stage { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 120px; border-radius: var(--dsw-radius-lg, 8px); background: var(--dsw-alias-markdown-code-block); }\n.rssh-image-preview-stage img { display: block; max-width: 100%; max-height: min(720px, 70dvh); object-fit: contain; }\n.rssh-image-preview-stage p { padding: 16px; color: var(--dsw-alias-label-secondary); }\n@media (pointer: coarse) { .rssh-attachment-remove { width: 32px; height: 32px; } }\n";

// src/client/sent-attachments.css
var sent_attachments_default = ".rssh-sent-attachments { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; min-width: 0; max-width: 100%; }\n.rssh-sent-attachment-list { display: flex; align-items: flex-start; gap: 8px; min-width: 0; max-width: 100%; padding: 4px; overflow-x: auto; }\n.rssh-sent-image { flex: none; width: 160px; max-width: 100%; margin: 0; color: var(--dsw-alias-label-secondary); font-size: var(--dsh-content-font-size-secondary, 13px); }\n.rssh-sent-image-button { position: relative; display: flex; align-items: center; justify-content: center; appearance: none; width: 100%; height: 112px; padding: 4px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: inherit; font: inherit; cursor: zoom-in; overflow: hidden; }\n.rssh-sent-image-button:disabled { cursor: default; }\n.rssh-sent-image-button[data-failed] { cursor: pointer; }\n.rssh-sent-image-retry { display: block; margin-top: 4px; text-decoration: underline; }\n.rssh-sent-image-button:focus-visible { outline: 2px solid var(--dsw-alias-state-info-primary); outline-offset: 2px; }\n.rssh-sent-image-button img { display: block; width: 100%; height: 100%; object-fit: contain; }\n.rssh-sent-image-placeholder { padding: 8px; overflow-wrap: anywhere; }\n.rssh-sent-image-loading { position: absolute; inset-inline: 4px; bottom: 4px; padding: 4px; border-radius: 4px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); pointer-events: none; }\n.rssh-sent-image figcaption { display: block; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 20px; }\n.rssh-sent-attachment-list > .rssh-message-attachment { flex: none; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n";

// src/client/index.js
function RemoteConversation(props) {
  const t = useT();
  const routing = props.useRemoteBackend((value) => value);
  const title = props.useSessions((value) => value.byId[props.sessionId]?.displayTitle || "");
  const preferences = props.useChatPreferences((snapshot) => snapshot.value);
  if (routing.sessionId !== props.sessionId) return null;
  return h(
    "main",
    { className: "rssh-conversation" },
    h(
      "header",
      { className: "rssh-conversation-header", "data-window-drag": "" },
      h("span", { className: "rssh-conversation-title" }, title || t("acp.hero")),
      routing.value?.workspace?.shellWorkspaceId && routing.value.backend ? h(NewRemoteSession, {
        key: props.sessionId,
        workspaceId: routing.value.workspace.shellWorkspaceId,
        createSession: props.createRemoteSession,
        openSession: props.openSession,
        beginNavigation: props.beginNavigation
      }) : null,
      routing.value?.backend ? props.renderFactorySlot("contextMenu.button", { target: { kind: "remote-agent-session", value: { sessionId: props.sessionId } }, label: t("session.more"), size: "sm" }) : null,
      h(ui.Button, { size: "sm", variant: "ghost", "aria-label": t("acp.sidebar"), onClick: props.toggleFiles }, h(ui.IconFolderOpenOutline16, { size: 16 }))
    ),
    routing.phase === "remote" ? h(ChatPane, { key: props.sessionId, backend: routing.value, clients: props.clients, preferences, renderFactorySlot: props.renderFactorySlot, openRemoteFile: props.openRemoteFile }) : routing.phase === "selection" ? h(SessionSetup, { key: props.sessionId, backend: routing.value, onSelected: props.refreshBackend }) : h(ConversationStatus, {
      kind: routing.phase === "loading" ? "loading" : "error",
      title: t(routing.phase === "loading" ? "session.setup.loading" : "session.setup.loadFailed"),
      description: routing.error || "",
      meta: t("session.setup.loadingHint"),
      onRetry: props.refreshBackend
    })
  );
}
function apply(ctx) {
  const { slots } = ctx;
  const clients = new SessionClientPool();
  ctx.effect(() => () => clients.dispose());
  ctx.effect(() => ctx.locale.register(NAMESPACE, {
    zh: { ...zh_default, ...messages8.zh, ...messages5.zh, ...messages6.zh, ...messages9.zh, ...messages4.zh, ...messages.zh, ...messages2.zh, ...messages3.zh, ...messages7.zh },
    en: { ...en_default, ...messages8.en, ...messages5.en, ...messages6.en, ...messages9.en, ...messages4.en, ...messages.en, ...messages2.en, ...messages3.en, ...messages7.en }
  }));
  locale.t = ctx.locale.bind(NAMESPACE);
  locale.subscribe = (listener) => ctx.locale.subscribe(listener);
  locale.getSnapshot = () => ctx.locale.getSnapshot();
  installSessionActions(ctx);
  const sessionStatuses = new SessionStatusStore();
  installSessionStatus(ctx, sessionStatuses);
  ctx.effect(() => {
    sessionStatuses.start();
    return () => sessionStatuses.dispose();
  });
  ctx.effect(() => {
    const style = document.createElement("style");
    style.textContent = ui_default + "\n" + tool_stream_default + "\n" + styles_default + "\n" + files_default + "\n" + attachments_default + "\n" + sent_attachments_default;
    document.head.appendChild(style);
    return () => style.remove();
  });
  let router, refreshRoute = () => {
  }, catalog = [], catalogVersion = 0, active = true;
  let catalogController;
  async function loadCatalog() {
    const version2 = ++catalogVersion;
    catalogController?.abort();
    catalogController = new AbortController();
    const result = await api("listWorkspaces", {}, catalogController.signal);
    if (!active || version2 !== catalogVersion || !result.ok || !Array.isArray(result.workspaces)) return;
    catalog = result.workspaces;
    refreshRoute(true);
  }
  const changed = (result) => {
    if (Array.isArray(result?.workspaces)) {
      catalogVersion++;
      catalog = result.workspaces;
      refreshRoute(true);
    } else if (result?.workspace) {
      catalogVersion++;
      catalog = [...catalog.filter((value) => value.id !== result.workspace.id), result.workspace];
      refreshRoute(true);
    } else void loadCatalog();
  };
  ctx.effect(() => () => {
    active = false;
    catalogVersion++;
    catalogController?.abort();
  });
  void loadCatalog();
  slots.inject("settings.section", () => slots.register({
    name: "settings.section",
    id: "remote-ssh",
    order: 40,
    label: () => locale.t("rssh.settings.title"),
    locale: NAMESPACE,
    inject: () => ({ onBackendChanged: changed })
  }, SettingsSection));
  for (const name of ["conversation.hero.workspace.directoryFlow", "sidebar.workspaces.directoryFlow", "workspace.picker.directoryFlow"]) {
    slots.inject(name, () => slots.register({
      name,
      priority: -100,
      locale: NAMESPACE,
      inject: () => ({ onBackendChanged: changed })
    }, RemoteWorkspaceFlow));
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: "@wujiaming88/dsh-remote-ssh/files",
    kind: "remote-files",
    title: () => locale.t("agents.filesTitle"),
    keepMounted: true
  }));
  slots.inject("sidebar.right.pane.tab", () => slots.register({
    name: "sidebar.right.pane.tab",
    key: "@wujiaming88/dsh-remote-ssh/files",
    locale: NAMESPACE
  }, RemoteFilesSidebar));
  ctx.effect(() => ctx.sidebarRight.registerCloseHandler("remote-files", assertFileCloseAllowed));
  slots.inject("main.conversation", () => {
    let live = true;
    let disposeMain = null;
    router = createBackendRouter({
      load: (sessionId) => api("sessionBackend", { sessionId }),
      show: (active2) => {
        if (active2 && !disposeMain) disposeMain = slots.register({
          name: "main.conversation",
          priority: -100,
          locale: NAMESPACE,
          inject: () => ({
            clients,
            hooks: { remoteBackend: router, chatPreferences: ctx.configForms.get("ui-chat") },
            refreshBackend: () => router.refresh(),
            beginNavigation: () => ctx.layout.beginNavigation(),
            createRemoteSession: (options) => ctx.sessions.create(options),
            openSession: (id) => ctx.uiWorkspace.openSession(id),
            toggleFiles: () => ctx.sidebarRight.isExpanded() ? ctx.sidebarRight.toggleExpanded() : ctx.sidebarRight.openTab("remote-files"),
            openRemoteFile: (path) => ctx.sidebarRight.openTab("remote-files", { params: { path } })
          })
        }, RemoteConversation);
        else if (!active2 && disposeMain) {
          const dispose = disposeMain;
          disposeMain = null;
          dispose();
        }
      }
    });
    let identity = "", workspaceIdentity = "", projectionSource = null, disposeProjection = () => {
    };
    const current = ctx.uiSession.adapter.current;
    const refresh = (force) => {
      if (!live || !active) return;
      const id = current.getSnapshot().key || "";
      const row = ctx.sessions.list.getSnapshot().byId[id];
      const source = id ? ctx.sessions.binding(id)?.session.projections.faceOf(REMOTE_SESSION_PROJECTION_KEY) : null;
      if (source !== projectionSource) {
        disposeProjection();
        projectionSource = source;
        disposeProjection = source ? source.subscribe(() => refresh(true)) : () => {
        };
      }
      const evidence = { recorded: source?.getSnapshot()?.remote === true, blankWorkspace: knownRemoteBlank(row, catalog) };
      const next = `${id}
${row?.cwd || ""}
${row?.blank}
${evidence.recorded}
${evidence.blankWorkspace}`;
      if (force || next !== identity) {
        identity = next;
        router.select(id, true, evidence);
      }
    };
    refreshRoute = refresh;
    const workspaceChanged = () => {
      if (!live || !active) return;
      const next = ctx.workspaces.list.getSnapshot().items.map((value) => `${value.workspaceId}:${value.path}`).join("\n");
      if (next !== workspaceIdentity) {
        workspaceIdentity = next;
        void loadCatalog();
      }
      refresh(true);
    };
    const disposers = [current.subscribe(() => refresh(false)), ctx.sessions.list.subscribe(() => refresh(false)), ctx.workspaces.list.subscribe(workspaceChanged)];
    refresh(true);
    return () => {
      live = false;
      for (const dispose of disposers) dispose();
      disposeProjection();
      refreshRoute = () => {
      };
      router.dispose();
      router = null;
    };
  });
}
var inject = ["slots", "locale", "uiSession", "sessions", "workspaces", "layout", "sidebarRight", "sidebarRightTabs", "contextMenus", "uiWorkspace", "configForms"];

    return module.exports;
  }
});
