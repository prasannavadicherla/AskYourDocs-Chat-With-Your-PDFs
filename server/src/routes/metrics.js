const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../auth');
const { costUsd } = require('../cost');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS queries,
              AVG(m.latency_ms)::int AS avg_latency_ms,
              PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY m.latency_ms)::int AS p95_latency_ms,
              AVG(m.input_tokens)::int AS avg_input_tokens,
              AVG(m.output_tokens)::int AS avg_output_tokens
         FROM messages m JOIN chats c ON c.id = m.chat_id
        WHERE c.user_id = $1 AND m.role = 'assistant' AND m.latency_ms IS NOT NULL`,
      [req.user.id]
    );
    const r = rows[0];
    res.json({ ...r, avg_cost_usd: costUsd(r.avg_input_tokens || 0, r.avg_output_tokens || 0) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
