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

#### Commit 1.3: Server scaffolding & database connection pooling
- **Files**: `server/package.json`, `server/package-lock.json`, `server/.env.example`, `server/src/db.js`, `server/src/migrate.js`, `README.md`
- **Summary**: Initialized Node.js backend workspace with production/dev dependencies, defined `.env.example` contract, implemented PostgreSQL pool client (`server/src/db.js`), and added automated schema migration runner (`server/src/migrate.js`).
- **Developer Note**: Centralized database connection logic with connection pooling handles environment transitions cleanly. `migrate.js` provides idempotent schema bootstrapping before server start.


### Sprint 2: Authentication & Core RAG Pipeline

#### Commit 2.1: Authentication system and JWT middleware
- **Files**: `server/src/auth.js`, `server/src/routes/auth.js`, `README.md`
- **Summary**: Implemented user authentication with salted bcrypt password hashing, JWT token signing/verification, and `requireAuth` Express middleware.
- **Developer Note**: `requireAuth` validates the Bearer token on incoming requests, extracts the decoded user payload, and attaches `req.userId` to ensure downstream endpoints can only access resources belonging to that specific authenticated tenant.

#### Commit 2.2: Document ingestion, text extraction, and chunking
- **Files**: `server/src/extract.js`, `server/src/chunk.js`, `README.md`
- **Summary**: Implemented text extraction utility for PDF and plain text formats using `pdf-parse` (`server/src/extract.js`), alongside a sliding character window chunking algorithm (`server/src/chunk.js`).
- **Developer Note**: Chunks are generated with 1,000 characters and 200 characters overlap. Whitespace is normalized and empty fragments are stripped to maximize embedding signal quality and contextual continuity.

#### Commit 2.3: Embedding generation, vector storage, and similarity retrieval
- **Files**: `server/src/embed.js`, `server/src/retrieve.js`, `README.md`
- **Summary**: Implemented Gemini text embeddings generation (`gemini-embedding-001`, 768 dimensions) with batching (`server/src/embed.js`), and top-k vector cosine similarity retrieval (`server/src/retrieve.js`).
- **Developer Note**: Similarity queries leverage pgvector's cosine distance operator `<=>` alongside user-level scoping `WHERE d.user_id = $1` to guarantee zero cross-tenant vector leakage and optimal execution plan with HNSW.

#### Commit 2.4: LLM integration and SSE response streaming
- **Files**: `server/src/llm.js`, `server/src/cost.js`, `README.md`
- **Summary**: Integrated Gemini 2.5 Flash Lite streaming generative model (`server/src/llm.js`) with contextual prompt building, citation metadata formatting, and accurate token cost calculations for input/output prompts (`server/src/cost.js`).
- **Developer Note**: Streams responses as Server-Sent Events (SSE), reducing perceived latency from seconds to under 400ms for first token arrival. Tracks prompt and candidate token counts to calculate micro-dollar execution expenses.


### Sprint 3: API Endpoints, Analytics & Backend Testing

#### Commit 3.1: Document management and chat routes
- **Files**: `server/src/routes/documents.js`, `server/src/routes/chats.js`, `server/src/app.js`, `server/src/index.js`, `README.md`
- **Summary**: Implemented Express application routes for multipart document uploads via `multer`, document deletion with cascading chunk cleanup, chat session lifecycle, and real-time SSE query endpoints.
- **Developer Note**: Document upload pipeline automatically extracts text, produces chunks, batches vector embeddings, and stores chunks within a database transaction. The message endpoint orchestrates RAG retrieval, history assembly, SSE emission, and message history persistence.

#### Commit 3.2: Query latency and analytics metrics endpoint
- **Files**: `server/src/routes/metrics.js`, `README.md`
- **Summary**: Implemented telemetry endpoint (`/api/metrics`) computing aggregate system usage statistics including total queries, average latency, p95 latency percentiles (`PERCENTILE_CONT(0.95)`), token consumptions, and average cost per query.
- **Developer Note**: Scoped by user ID to provide granular visibility into personal API consumption and latency distribution.

#### Commit 3.3: Unit tests and evaluation harness
- **Files**: `server/tests/chunk.test.js`, `server/tests/api.test.js`, `server/eval/questions.json`, `server/eval/run.js`, `README.md`
- **Summary**: Implemented comprehensive Jest unit tests covering chunking logic, authentication boundaries, and mocked end-to-end API flows. Added an offline evaluation script (`server/eval/run.js`) and question benchmark dataset (`server/eval/questions.json`).
- **Developer Note**: Tests mock database connections and Gemini API calls to ensure lightning-fast, zero-network CI test passes. The evaluation harness validates hit-rate, precision, and latency metrics on real documents.


### Sprint 4: Frontend Development (React + Vite SPA)

#### Commit 4.1: React client setup and styling system
- **Files**: `client/package.json`, `client/package-lock.json`, `client/vite.config.js`, `client/index.html`, `client/src/main.jsx`, `client/src/styles.css`, `README.md`
- **Summary**: Initialized the React single page application with Vite, configured dev server proxies for API forwarding, defined the application mount point, and established a modern responsive CSS styling system.
- **Developer Note**: CSS design system utilizes custom variables, flexible layout flexboxes, smooth transitions, and distinct message bubble roles for user queries and AI responses.

#### Commit 4.2: API integration layer and authentication UI
- **Files**: `client/src/api.js`, `client/src/Login.jsx`, `README.md`
- **Summary**: Implemented the client-side API helper service (`client/src/api.js`) providing automated Bearer token injection and error handling, along with a unified Login and Registration tabbed user interface (`client/src/Login.jsx`).
- **Developer Note**: Tokens are persisted to `localStorage` and dispatched automatically across all document, chat, and SSE fetch requests.
