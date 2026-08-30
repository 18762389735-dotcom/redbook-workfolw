const STOP_WORDS = new Set(['一个', '这个', '我们', '你们', '他们', '自己', '可以', '进行', '内容', '小红', '笔记', '相关', '当前', '以及', 'and', 'the', 'with']);

export function normalizeForDirectMatch(value) {
  return String(value || '').toLocaleLowerCase().replace(/[^\u4e00-\u9fffa-z0-9]+/g, '');
}

export function tokenize(value) {
  const chunks = String(value || '').toLocaleLowerCase().match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) || [];
  const tokens = [];
  for (const chunk of chunks) {
    if (/^[a-z0-9]+$/.test(chunk)) tokens.push(chunk);
    else if (chunk.length === 1) tokens.push(chunk);
    else for (let index = 0; index < chunk.length - 1; index += 1) tokens.push(chunk.slice(index, index + 2));
  }
  return [...new Set(tokens.filter((token) => token.length > 1 && !STOP_WORDS.has(token)))];
}

export function directMatch(phrase, corpus) {
  const needle = normalizeForDirectMatch(phrase);
  return needle.length >= 2 && normalizeForDirectMatch(corpus).includes(needle);
}
