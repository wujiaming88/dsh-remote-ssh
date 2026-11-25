// Header-only projection: body selection, original titles and command fallbacks
// remain the responsibility of toolFlowModel and the expanded details renderer.
const KIND_PRESENTATIONS = Object.freeze({
  read: ['flow.toolRead', 'read'],
  edit: ['flow.toolEdit', 'edit'],
  search: ['flow.toolSearch', 'search'],
  execute: ['flow.toolExecute', 'terminal'],
  fetch: ['flow.toolFetch', 'link'],
  delete: ['flow.toolDelete', 'trash'],
  move: ['flow.toolMove', 'tool'],
  think: ['flow.toolThink', 'thought'],
  other: ['flow.toolOther', 'tool'],
});

const text = value => typeof value === 'string' && value.trim() ? value : '';
const firstText = (...values) => values.map(text).find(Boolean) || '';
const joinUnique = values => [...new Set(values.filter(Boolean))].join(' · ');

function locationPaths(locations) {
  if (!Array.isArray(locations)) return [];
  const seen = new Set();
  return locations.flatMap(location => {
    // ACP locations carry a path string, not an inferred path in title/command.
    const path = text(location?.path);
    if (!path) return [];
    const line = Number.isInteger(location.line) && location.line >= 0 ? location.line : undefined;
    const identity = JSON.stringify([path, line]);
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [{path, pathLabel: line === undefined ? path : `${path}:${line}`}];
  });
}

/**
 * Pure compact-header presentation. `summary` is the complete visible summary;
 * `path`, when present, is the unchanged first structured location path;
 * `pathLabel` appends its supplied nonnegative integer line for display.
 * A renderer may link summary when it equals pathLabel. Do not render path
 * again alongside summary, or link an entire multi-location summary to path.
 *
 * Optional rawInput fields must be supplied data, never parsed shell arguments.
 * Raw-input paths can describe the action but do not establish link targets.
 * Keep original titles/raw inputs in expanded details, including when a read or
 * edit header uses its structured locations instead of its custom title.
 */
export function toolHeaderPresentation(model = {}, {subagent = false} = {}) {
  const kind = text(model.kind).toLowerCase();
  const presentation = Object.hasOwn(KIND_PRESENTATIONS, kind) ? KIND_PRESENTATIONS[kind] : undefined;
  const paths = locationPaths(model.locations);
  const location = paths[0];
  const raw = model.rawInput && typeof model.rawInput === 'object' && !Array.isArray(model.rawInput) && !model.rawInput.truncated
    ? model.rawInput : {};
  const rawPath = firstText(raw.path, raw.file_path, raw.filePath);
  const pathSummary = paths.length ? paths.map(value => value.pathLabel).join(' · ') : rawPath;
  const title = firstText(model.title, model.name);
  const description = firstText(model.description, raw.description);
  const suppliedSummary = text(model.summary);
  const fallback = firstText(description, suppliedSummary, title);
  let summary;

  if (!presentation) {
    // A name such as Read/Bash/grep is not structured evidence of a tool kind.
    summary = firstText(pathSummary, suppliedSummary, description);
    if (summary === title) summary = '';
    return {title, icon: subagent ? 'agent' : 'tool', summary, ...(location || {})};
  }

  switch (kind) {
    case 'read':
    case 'edit':
    case 'delete':
    case 'move':
      summary = pathSummary || fallback;
      break;
    case 'search': {
      const pattern = firstText(model.pattern, model.query, raw.pattern, raw.query);
      summary = pattern ? joinUnique([pattern, pathSummary]) : pathSummary || fallback;
      break;
    }
    case 'execute':
      // Do not turn e.g. `rg`, `cat` or `git diff` into guessed human intent.
      summary = firstText(description, title, model.command, suppliedSummary);
      break;
    case 'fetch':
      summary = firstText(model.url, raw.url, fallback, pathSummary);
      break;
    default:
      summary = fallback || pathSummary;
  }

  const [labelKey, icon] = presentation;
  return {labelKey, icon: subagent ? 'agent' : icon, summary, ...(location || {})};
}
