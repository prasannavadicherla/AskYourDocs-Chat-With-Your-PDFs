// Gemini embeddings. 768 dimensions to match chunks.embedding in db/schema.sql.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const BATCH = 100;
const DIMENSIONS = 768;

async function embed(texts, inputType = 'document') {
  const model = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
  const taskType = inputType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await fetch(`${BASE}/${model}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        requests: texts.slice(i, i + BATCH).map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: DIMENSIONS,
        })),
      }),
    });
    if (!res.ok) throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    out.push(...json.embeddings.map((e) => e.values));
  }
  return out;
}

module.exports = { embed };
