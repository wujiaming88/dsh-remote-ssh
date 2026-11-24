// Keep keyboard selection visible inside the picker only; do not move editor
// focus or scroll the outer conversation/document.
export function pickerScrollTop({ scrollTop, height, itemTop, itemHeight }) {
  if (![scrollTop, height, itemTop, itemHeight].every(Number.isFinite) || height <= 0) return scrollTop;
  if (itemTop < scrollTop) return Math.max(0, itemTop);
  if (itemTop + itemHeight > scrollTop + height) return Math.max(0, itemTop + itemHeight - height);
  return scrollTop;
}
