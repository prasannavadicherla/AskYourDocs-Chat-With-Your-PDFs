// Split text into overlapping chunks. Prefers paragraph, then sentence, then word boundaries.
function chunkText(text, { size = 1000, overlap = 200 } = {}) {
  if (overlap >= size) throw new Error('overlap must be smaller than size');
  const clean = (text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!clean) return [];

  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start, end);
      const minBreak = Math.floor(size * 0.5);
      const breaks = [window.lastIndexOf('\n\n'), window.lastIndexOf('. '), window.lastIndexOf(' ')];
      const cut = breaks.find((b) => b >= minBreak);
      if (cut !== undefined) end = start + cut + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

module.exports = { chunkText };
