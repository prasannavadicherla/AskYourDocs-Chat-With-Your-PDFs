// Retrieval and latency evaluation against a running API.
// Usage: API_URL=http://localhost:4000 EVAL_EMAIL=... EVAL_PASSWORD=... npm run eval
// Upload your test documents as that user first, then fill eval/questions.json.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { costUsd } = require('../src/cost');

const API = process.env.API_URL || 'http://localhost:4000';
const questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));

async function ask(token, chatId, content) {
  const started = Date.now();
  const res = await fetch(`${API}/api/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content }),
  });
  const text = await res.text();
  const events = {};
  let answer = '';
  for (const block of text.split('\n\n')) {
    const ev = /event: (\w+)\ndata: (.*)/s.exec(block);
    if (!ev) continue;
    const data = JSON.parse(ev[2]);
    if (ev[1] === 'delta') answer += data;
    else events[ev[1]] = data;
  }
  return { answer, sources: events.sources || [], done: events.done, ms: Date.now() - started };
}

(async () => {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.EVAL_EMAIL, password: process.env.EVAL_PASSWORD }),
  }).then((r) => r.json());
  if (!login.token) throw new Error('Login failed');

  const results = [];
  for (const q of questions) {
    // New chat per question so history does not leak between questions
    const chat = await fetch(`${API}/api/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ title: 'eval' }),
    }).then((r) => r.json());
    const r = await ask(login.token, chat.id, q.question);
    const retrievalHit = r.sources.some((s) => s.filename === q.expected_file);
    const answerHit = q.expected_keywords.every((k) => r.answer.toLowerCase().includes(k.toLowerCase()));
    const usage = (r.done && r.done.usage) || { input_tokens: 0, output_tokens: 0 };
    results.push({ q: q.question, retrievalHit, answerHit, ms: r.ms, cost: costUsd(usage.input_tokens, usage.output_tokens) });
    console.log(`${answerHit ? 'PASS' : 'FAIL'} ${r.ms}ms  ${q.question}`);
  }

  const n = results.length;
  const pct = (f) => ((results.filter(f).length / n) * 100).toFixed(1);
  const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
  const summary = {
    questions: n,
    retrieval_hit_rate_pct: pct((r) => r.retrievalHit),
    answer_accuracy_pct: pct((r) => r.answerHit),
    avg_latency_ms: Math.round(sorted.reduce((a, b) => a + b, 0) / n),
    p95_latency_ms: sorted[Math.min(n - 1, Math.floor(n * 0.95))],
    avg_cost_usd: (results.reduce((a, r) => a + r.cost, 0) / n).toFixed(5),
  };
  console.table(summary);
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ summary, results }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
