const pgvector = require('pgvector');
const db = require('./db');
const { embed } = require('./embed');

async function retrieve(userId, question, k = 5) {
  const [vec] = await embed([question], 'query');
  const { rows } = await db.query(
    `SELECT c.id, c.content, d.filename, 1 - (c.embedding <=> $2) AS score
       FROM chunks c JOIN documents d ON d.id = c.document_id
      WHERE c.user_id = $1
      ORDER BY c.embedding <=> $2
      LIMIT $3`,
    [userId, pgvector.toSql(vec), k]
  );
  return rows;
}

function buildPrompt(question, chunks) {
  const context = chunks
    .map((c, i) => `<source id="${i + 1}" file="${c.filename}">\n${c.content}\n</source>`)
    .join('\n\n');
  return (
    'Answer the question using only the sources below. Cite sources like [1]. ' +
    'If the sources do not contain the answer, say so.\n\n' +
    `${context}\n\nQuestion: ${question}`
  );
}

module.exports = { retrieve, buildPrompt };
