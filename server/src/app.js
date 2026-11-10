const express = require('express');
const cors = require('cors');
const path = require('path');

function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/documents', require('./routes/documents'));
  app.use('/api/chats', require('./routes/chats'));
  app.use('/api/metrics', require('./routes/metrics'));

  // Serve the built React app in production
  const clientDist = path.join(__dirname, '../public');
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (req, res, next) =>
    res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next())
  );

  app.use((err, req, res, next) => {
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
  });
  return app;
}

module.exports = { createApp };
