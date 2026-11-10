const { Pool } = require('pg');
const pgvector = require('pgvector/pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('connect', (client) => pgvector.registerTypes(client));

module.exports = { pool, query: (text, params) => pool.query(text, params) };
