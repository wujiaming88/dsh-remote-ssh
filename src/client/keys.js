let sequence = 0;
export function newKey(prefix = "item") { return `${prefix}:${++sequence}`; }
