process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db', () => {
  const client = { query: jest.fn(), release: jest.fn() };
  return { query: jest.fn(), pool: { connect: jest.fn(async () => client) }, __client: client };
});
jest.mock('../src/embed', () => ({ embed: jest.fn(async (texts) => texts.map(() => new Array(768).fill(0.1))) }));
jest.mock('../src/llm', () => ({
  streamAnswer: jest.fn(async (messages, onText) => {
    onText('Hello ');
    onText('world [1]');
    return { input_tokens: 500, output_tokens: 20 };
  }),
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { streamAnswer } = require('../src/llm');
const { sign } = require('../src/auth');
const { createApp } = require('../src/app');
const { buildPrompt } = require('../src/retrieve');
const { costUsd } = require('../src/cost');

const app = createApp();
const token = sign({ id: 1, email: 'a@b.com' });
const auth = { Authorization: `Bearer ${token}` };

beforeEach(() => {
  db.query.mockReset();
  db.__client.query.mockReset();
  streamAnswer.mockClear();
});

describe('auth', () => {
  test('register rejects a short password', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  test('register returns a token', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com' }] });
    const res = await request(app).post('/api/auth/register').send({ email: 'A@b.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(db.query.mock.calls[0][1][0]).toBe('a@b.com');
  });

  test('register returns 409 for a duplicate email', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('login succeeds with the right password', async () => {
    const hash = await bcrypt.hash('password123', 4);
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com', password_hash: hash }] });
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('login fails with the wrong password', async () => {
    const hash = await bcrypt.hash('password123', 4);
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'a@b.com', password_hash: hash }] });
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'nope' });
    expect(res.status).toBe(401);
  });

  test('protected routes need a token', async () => {
    expect((await request(app).get('/api/chats')).status).toBe(401);
    expect((await request(app).get('/api/chats').set('Authorization', 'Bearer bad')).status).toBe(401);
  });
});

describe('documents', () => {
  test('lists only the current user documents', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 3, filename: 'a.txt', chunks: 2 }] });
    const res = await request(app).get('/api/documents').set(auth);
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][1]).toEqual([1]);
  });

  test('uploads a TXT file and stores chunks', async () => {
    db.__client.query.mockImplementation(async (sql) =>
      sql.startsWith('INSERT INTO documents') ? { rows: [{ id: 9, filename: 'notes.txt' }] } : { rows: [] }
    );
    const res = await request(app)
      .post('/api/documents')
      .set(auth)
      .attach('file', Buffer.from('Some useful notes. '.repeat(100)), 'notes.txt');
    expect(res.status).toBe(201);
    expect(res.body.chunks).toBeGreaterThan(0);
    const sqls = db.__client.query.mock.calls.map((c) => c[0]);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
  });

  test('rejects unsupported file types', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set(auth)
      .attach('file', Buffer.from('x'), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  test('delete returns 404 for another user document', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(app).delete('/api/documents/5').set(auth);
    expect(res.status).toBe(404);
  });
});

describe('chat streaming', () => {
  test('streams sources, deltas and done events', async () => {
    db.query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT id FROM chats')) return { rows: [{ id: 7 }] };
      if (sql.includes('FROM chunks')) return { rows: [{ id: 1, content: 'ctx', filename: 'a.txt', score: 0.9 }] };
      return { rows: [] };
    });
    const res = await request(app).post('/api/chats/7/messages').set(auth).send({ content: 'What is it?' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: sources');
    expect(res.text).toContain('event: delta\ndata: "Hello "');
    expect(res.text).toContain('event: done');
    const prompt = streamAnswer.mock.calls[0][0].at(-1).content;
    expect(prompt).toContain('<source id="1" file="a.txt">');
  });

  test('returns 404 for a chat the user does not own', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/chats/99/messages').set(auth).send({ content: 'hi' });
    expect(res.status).toBe(404);
  });

  test('rejects empty questions', async () => {
    const res = await request(app).post('/api/chats/7/messages').set(auth).send({ content: '  ' });
    expect(res.status).toBe(400);
  });
});

describe('helpers', () => {
  test('buildPrompt numbers sources', () => {
    const p = buildPrompt('Q?', [{ filename: 'x.pdf', content: 'A' }, { filename: 'y.pdf', content: 'B' }]);
    expect(p).toContain('<source id="2" file="y.pdf">');
    expect(p.endsWith('Question: Q?')).toBe(true);
  });

  test('costUsd uses per-million pricing', () => {
    expect(costUsd(1e6, 0)).toBe(0.1);
    expect(costUsd(0, 1e6)).toBe(0.4);
  });
});
