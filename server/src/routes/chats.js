const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../auth');
const { retrieve, buildPrompt } = require('../retrieve');
const { streamAnswer } = require('../llm');

router.use(requireAuth);
const HISTORY_TURNS = 6;

async function ownChat(chatId, userId) {
  const { rows } = await db.query('SELECT id FROM chats WHERE id = $1 AND user_id = $2', [chatId, userId]);
  return rows[0];
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, title, created_at FROM chats WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const title = ((req.body && req.body.title) || 'New chat').slice(0, 100);
    const { rows } = await db.query(
      'INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at',
      [req.user.id, title]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    if (!(await ownChat(req.params.id, req.user.id))) return res.status(404).json({ error: 'Not found' });
    const { rows } = await db.query(
      'SELECT id, role, content, created_at FROM messages WHERE chat_id = $1 ORDER BY id',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await db.query('DELETE FROM chats WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Ask a question. Streams the answer as Server-Sent Events: sources, delta..., done.
router.post('/:id/messages', async (req, res, next) => {
  const started = Date.now();
  try {
    const question = ((req.body && req.body.content) || '').trim();
    if (!question) return res.status(400).json({ error: 'content is required' });
    if (!(await ownChat(req.params.id, req.user.id))) return res.status(404).json({ error: 'Not found' });

    const { rows: history } = await db.query(
      'SELECT role, content FROM messages WHERE chat_id = $1 ORDER BY id DESC LIMIT $2',
      [req.params.id, HISTORY_TURNS * 2]
    );
    await db.query('INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3)', [
      req.params.id,
      'user',
      question,
    ]);
    if (!history.length)
      await db.query('UPDATE chats SET title = $1 WHERE id = $2', [question.slice(0, 60), req.params.id]);

    const sources = await retrieve(req.user.id, question);
    const messages = [...history.reverse(), { role: 'user', content: buildPrompt(question, sources) }];

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send(
      'sources',
      sources.map((s, i) => ({ id: i + 1, filename: s.filename, score: Number(Number(s.score).toFixed(3)) }))
    );

    let answer = '';
    const usage = await streamAnswer(messages, (text) => {
      answer += text;
      send('delta', text);
    });
    const latency = Date.now() - started;
    await db.query(
      `INSERT INTO messages (chat_id, role, content, latency_ms, input_tokens, output_tokens)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.params.id, 'assistant', answer, latency, usage.input_tokens, usage.output_tokens]
    );
    send('done', { latency_ms: latency, usage });
    res.end();
  } catch (err) {
    if (res.headersSent) {
      console.error(err);
      res.write(`event: error\ndata: ${JSON.stringify('Generation failed')}\n\n`);
      return res.end();
    }
    next(err);
  }
});

module.exports = router;
