const router = require('express').Router();
const multer = require('multer');
const pgvector = require('pgvector');
const db = require('../db');
const { requireAuth } = require('../auth');
const { extractText } = require('../extract');
const { chunkText } = require('../chunk');
const { embed } = require('../embed');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT d.id, d.filename, d.created_at, COUNT(c.id)::int AS chunks
         FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
        WHERE d.user_id = $1 GROUP BY d.id ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', upload.single('file'), async (req, res, next) => {
  let client;
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const text = await extractText(req.file);
    const pieces = chunkText(text);
    if (!pieces.length) return res.status(400).json({ error: 'No text found in file' });
    const vectors = await embed(pieces, 'document');

    client = await db.pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO documents (user_id, filename) VALUES ($1, $2) RETURNING id, filename, created_at',
      [req.user.id, req.file.originalname]
    );
    const doc = rows[0];
    for (let i = 0; i < pieces.length; i++) {
      await client.query(
        'INSERT INTO chunks (document_id, user_id, idx, content, embedding) VALUES ($1, $2, $3, $4, $5)',
        [doc.id, req.user.id, i, pieces[i], pgvector.toSql(vectors[i])]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ ...doc, chunks: pieces.length });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await db.query('DELETE FROM documents WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
