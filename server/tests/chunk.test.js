const { chunkText } = require('../src/chunk');

describe('chunkText', () => {
  test('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText(null)).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  test('returns one chunk for short text', () => {
    expect(chunkText('Hello world.')).toEqual(['Hello world.']);
  });

  test('no chunk exceeds the size limit', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(200);
    const chunks = chunkText(text, { size: 300, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(300));
  });

  test('consecutive chunks overlap', () => {
    const words = Array.from({ length: 500 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkText(words, { size: 200, overlap: 50 });
    for (let i = 1; i < chunks.length; i++) {
      const tail = chunks[i - 1].split(' ').slice(-3).join(' ');
      expect(chunks[i]).toContain(tail.split(' ').pop());
    }
  });

  test('keeps every word from the source', () => {
    const words = Array.from({ length: 400 }, (_, i) => `word${i}`);
    const chunks = chunkText(words.join(' '), { size: 250, overlap: 40 });
    const seen = new Set(chunks.join(' ').split(/\s+/));
    words.forEach((w) => expect(seen.has(w)).toBe(true));
  });

  test('prefers paragraph breaks', () => {
    const para = 'a'.repeat(120);
    const text = `${para}\n\n${para}\n\n${para}`;
    const chunks = chunkText(text, { size: 200, overlap: 20 });
    expect(chunks[0]).toBe(para);
  });

  test('normalizes whitespace', () => {
    expect(chunkText('a  \t b\r\n\n\n\nc')).toEqual(['a b\n\nc']);
  });

  test('throws if overlap >= size', () => {
    expect(() => chunkText('abc', { size: 10, overlap: 10 })).toThrow();
  });

  test('handles a single long word without spaces', () => {
    const chunks = chunkText('x'.repeat(1000), { size: 300, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(300));
  });
});
