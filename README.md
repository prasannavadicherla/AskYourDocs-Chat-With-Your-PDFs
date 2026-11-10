# AI Document Chat Assistant

Ask questions about your own PDF and TXT files. Answers stream in real time and cite the source chunks.

**Live demo:** _add link after deploy_

Stack: React (Vite), Node.js + Express, PostgreSQL + pgvector, Gemini 2.5 Flash Lite, Gemini embeddings, Jest, Docker, AWS App Runner, GitHub Actions.

## How it works

1. **Upload.** The server extracts text (pdf-parse), splits it into 1000-character chunks with 200-character overlap, embeds each chunk with `gemini-embedding-001` (768 dimensions), and stores it in `chunks.embedding vector(768)`.
2. **Ask.** The question is embedded. pgvector returns the top 5 chunks by cosine distance (HNSW index), filtered by `user_id`.
3. **Answer.** The chunks and the last 6 turns go to Gemini 2.5 Flash Lite. The reply streams to the browser as Server-Sent Events.
4. **Measure.** Each answer stores latency and token counts. `GET /api/metrics` returns averages, p95 latency and cost per query.

Every query filters on the JWT user id, so users see only their own documents and chats.

## Run locally

Requirements: Node 20+, PostgreSQL with the pgvector extension, a Gemini API key from Google AI Studio.

Easiest database option (Docker):

```bash
docker compose up -d db
```

Then:

```bash
cd server
cp .env.example .env    # fill in the keys
npm install
npm run migrate
npm run dev
```

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173.

## Tests

```bash
cd server && npm test
```

Unit tests cover chunking, auth, per-user access, upload, SSE streaming and cost math. The database, embeddings and Gemini are mocked.

## Evaluation

1. Register an eval user and upload your test documents.
2. Put 20 questions in `server/eval/questions.json`, each with the expected file and answer keywords.
3. Run:

```bash
cd server
API_URL=http://localhost:4000 EVAL_EMAIL=you@example.com EVAL_PASSWORD=yourpass npm run eval
```

It prints retrieval hit rate, answer accuracy, average and p95 latency, and average cost. Results go to `eval/results.json`.

| Metric | Result |
| --- | --- |
| Retrieval hit rate | _fill in_ |
| Answer accuracy (20 questions) | _fill in_ |
| Avg response time | _fill in_ |
| Avg cost per query | _fill in_ |

## Deploy to AWS (App Runner)

1. Create a PostgreSQL database with pgvector: RDS for PostgreSQL 15+ supports `CREATE EXTENSION vector`.
2. Create an ECR repository.
3. Create an IAM role GitHub Actions can assume (OIDC) with ECR push rights.
4. Add repo secrets: `AWS_ROLE_ARN`, `AWS_REGION`, `ECR_REPOSITORY`.
5. Push to `main`. CI runs tests, builds the Docker image and pushes it to ECR.
6. Create an App Runner service from the ECR `latest` image, port 4000, automatic deploys on. Set the env vars from `.env.example` (`DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`).

The container runs the migration on start, then serves the API and the built React app on one port.

## API

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Create account, returns JWT |
| POST | `/api/auth/login` | Log in, returns JWT |
| GET / POST | `/api/documents` | List or upload (multipart `file`) |
| DELETE | `/api/documents/:id` | Delete document and its chunks |
| GET / POST | `/api/chats` | List or create chats |
| GET | `/api/chats/:id/messages` | Chat history |
| POST | `/api/chats/:id/messages` | Ask a question (SSE stream) |
| GET | `/api/metrics` | Latency, tokens and cost |


## Changelog & Development Sprints

### Sprint 1: Repository Foundation & Database Architecture

#### Commit 1.1: Project initialization & environment baseline
- **Files**: `.gitignore`, `.dockerignore`, `README.md`
- **Summary**: Initialized repository structure, established git and docker exclusion rules, and added comprehensive architecture documentation.
- **Developer Note**: Configured baseline rules ensuring secrets, local `.env` files, and `node_modules` are excluded right from the root commit.

#### Commit 1.2: Database schema & vector storage initialization
- **Files**: `server/db/schema.sql`, `README.md`
- **Summary**: Defined PostgreSQL schema with `pgvector` extension, relational tables (`users`, `documents`, `chunks`, `chats`, `messages`, `metrics`), and HNSW vector index on 768-dimensional embeddings.
- **Developer Note**: Uses HNSW indexing with cosine distance (`vector_cosine_ops`) for real-time similarity search. Strict foreign keys with cascade deletes enforce multi-tenant isolation and automated cleanup.
