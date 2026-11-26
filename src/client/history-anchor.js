// Owned identity metadata only: never serialize transcript text into the DOM.
const list = value => Array.isArray(value) ? value : [];
const key = value => typeof value === 'string' && value.length > 0;
const sequence = value => Number.isSafeInteger(value) && value > 0;
const textType = value => value === 'assistant' || value === 'thought';
const validRange = range => range && key(range.generation) && textType(range.type) &&
  sequence(range.firstSeq) && sequence(range.lastSeq) && range.firstSeq <= range.lastSeq;

// ranges: [{generation: string, firstSeq: number, lastSeq: number,
//           type: 'assistant' | 'thought'}]. Both bounds are observed event seqs.
export function historyAnchorAttributes(entry) {
  const items = entry?.kind === 'process' ? list(entry.items) : entry?.item ? [entry.item] : [];
  const members = [...new Set(items.map(item => item?.key).filter(key))];
  const ranges = items.flatMap(item => {
    const range = { generation: item?.generation, firstSeq: item?.seq, lastSeq: item?.lastSeq, type: item?.type };
    return validRange(range) ? [range] : [];
  });
  // Missing versions stay missing: an unversioned mutable member cannot prove
  // that the group's bottom still represents the pre-publication boundary.
  const versions = Object.fromEntries(items.flatMap(item => {
    const version = textType(item?.type) ? item.lastSeq : item?.type === 'tool' ? item.tool?.seq : item?.seq;
    return key(item?.key) && sequence(version) ? [[item.key, version]] : [];
  }));
  return { 'data-history-members': JSON.stringify(members), 'data-history-ranges': JSON.stringify(ranges),
    'data-history-versions': JSON.stringify(versions) };
}

const measured = anchor => anchor && Number.isFinite(anchor.top) && Number.isFinite(anchor.bottom) && anchor.bottom >= anchor.top;
const members = anchor => list(anchor.members).filter(key);
const ranges = anchor => list(anchor.ranges).filter(validRange);
const version = (anchor, member) => Object.hasOwn(anchor.versions || {}, member) ? anchor.versions[member] : undefined;
const sameRange = (old, next) => old && next && old.generation === next.generation && old.type === next.type &&
  old.firstSeq === next.firstSeq && old.lastSeq === next.lastSeq;
function unchangedMember(previous, current, member) {
  if (!sequence(version(previous, member)) || version(previous, member) !== version(current, member)) return false;
  const old = ranges(previous).find(range => `${range.generation}:${range.firstSeq}` === member);
  const next = ranges(current).find(range => `${range.generation}:${range.firstSeq}` === member);
  return !old && !next || sameRange(old, next);
}
function sameTop(previous, current) {
  const before = members(previous), after = members(current);
  if (!before.length || before.length !== after.length || new Set(before).size !== before.length ||
    !before.every((member, index) => member === after[index])) return false;
  // A standalone item's own event key still identifies its top when its body
  // grows. A turn-scoped process key identifies no particular loaded boundary.
  if (before.length === 1 && before[0] === previous.key) return true;
  if (!before.every(member => sequence(version(previous, member)) &&
    version(previous, member) === version(current, member))) return false;
  const oldRanges = ranges(previous), newRanges = ranges(current);
  return oldRanges.length === newRanges.length && oldRanges.every((old, index) => sameRange(old, newRanges[index]));
}
function absorbed(previous, current) {
  const before = members(previous), after = members(current);
  if (new Set(before).size !== before.length || new Set(after).size !== after.length) return false;
  const first = before.findIndex(member => after.includes(member));
  if (first !== -1) {
    const oldSuffix = before.slice(first), newSuffix = after.slice(after.indexOf(before[first]));
    // Prepending may change the first key, but bottom compensation is safe only
    // if every retained suffix member is unchanged and nothing was appended.
    return oldSuffix.length === newSuffix.length && oldSuffix.every((member, index) =>
      member === newSuffix[index] && unchangedMember(previous, current, member));
  }
  // With no surviving member, only the terminal partial text run can establish
  // the group's bottom. An early thought range says nothing about a later tool.
  return ranges(previous).some(old => before.at(-1) === `${old.generation}:${old.firstSeq}` &&
    ranges(current).some(next => after.at(-1) === `${next.generation}:${next.firstSeq}` &&
      old.generation === next.generation && old.type === next.type &&
      next.firstSeq <= old.firstSeq && next.lastSeq === old.lastSeq));
}

// Inputs are measured, viewport-relative numeric records; this helper owns no
// DOM reads, scroll state, or whole-viewport height compensation. Order is the
// caller's preference (normally visible anchors from top to bottom).
export function historyAnchorAdjustment(previous, current) {
  const before = list(previous).filter(measured), after = list(current).filter(measured);
  // Prefer a proven unchanged top. A stable process key alone cannot bypass
  // member/version evidence when prepending, appending or replacing history.
  for (const old of before) {
    if (!key(old.key) || before.filter(anchor => anchor.key === old.key).length !== 1) continue;
    const matches = after.filter(anchor => anchor.key === old.key);
    if (matches.length === 1 && sameTop(old, matches[0])) return { previousOffset: old.top, nextOffset: matches[0].top };
  }
  for (const old of before) {
    const matches = after.filter(next => absorbed(old, next));
    // Multiple possible destinations are ambiguous: do not invent an anchor.
    if (matches.length === 1) return { previousOffset: old.bottom, nextOffset: matches[0].bottom };
  }
  return null;
}
