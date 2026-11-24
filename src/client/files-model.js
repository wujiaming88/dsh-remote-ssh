// Presentation-only helpers; paths still go through the Host workspace boundary.
export function formatFileSize(size) {
  if (!Number.isFinite(size) || size < 0) return '';
  if (size < 1024) return `${Math.floor(size)} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = size / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${Number(value.toFixed(value < 10 ? 1 : 0))} ${units[unit]}`;
}
export function fileEntryPath(directory, name) {
  return directory === '.' ? name : directory.replace(/\/$/, '') + '/' + name;
}
export function fileDirectory(path) {
  const index = path.lastIndexOf('/');
  return index < 0 ? '.' : path.slice(0, index) || '/';
}
export function fileViewState({ busy, loaded, preview, entries, error }) {
  if (preview) return 'preview';
  if (!loaded && busy) return 'loading';
  if (error && entries.length === 0) return 'error';
  if (loaded && entries.length === 0) return 'empty';
  return 'list';
}
