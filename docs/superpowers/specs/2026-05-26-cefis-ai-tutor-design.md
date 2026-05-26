# CEFIS AI Tutor — MVP Design Spec

**Date:** 2026-05-26
**Status:** Approved design, pending implementation plan
**Author:** brainstorming session

## 1. Purpose

Build an MVP of an AI-powered, personalized learning tutor for **CEFIS** (Brazilian
professional education platform — accounting, tax, payroll, compliance). The product
is an *intelligent learning copilot*, **not** a full LMS. CEFIS already provides
courses, lessons, tracks, progress, videos, certificates, and transcripts.

This MVP implements only the **AI layer**: onboarding, personalization, roadmap,
tutoring, RAG, and mini practical cases.

### Explicitly out of scope
Video player, LMS, course management, admin dashboards, microservices, complex
analytics, gamification, mobile apps, multi-agent systems.

### Domain scope (MVP)
**Tax / Fiscal only.** Concepts: ICMS, ICMS-ST, CFOP, CST, SPED Fiscal, PIS/COFINS.
No other educational areas in this MVP.

## 2. Product flow

1. Student logs in (Supabase Auth, email/password).
2. Completes a 4-question onboarding.
3. Connects their CEFIS account / API key.
4. Receives a template-based personalized roadmap.
5. Chats with the Gemini-powered AI tutor.
6. Solves practical fiscal cases.
7. Receives adaptive explanations and feedback.

## 3. Tech stack (confirmed)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, TailwindCSS, shadcn/ui |
| Backend | Next.js API routes + Server Actions |
| Database | Supabase Postgres |
| Auth | Supabase Auth (email/password) |
| Vector search | pgvector (Supabase) |
| LLM | Google Gemini Flash via `@google/genai` |
| Embeddings | Gemini `text-embedding-004` (768-dim) |
| Deploy | Docker + Easypanel, hosted Supabase |

### Key decisions made during brainstorming
- **LLM = Gemini Flash, not OpenAI.** Original spec said OpenAI SDK; user has no
  OpenAI access and chose Gemini (free Google AI Studio tier — ideal for a hackathon).
- **Embeddings = Gemini `text-embedding-004`.** Anthropic/Claude has no embeddings
  endpoint; Gemini provides embeddings under the *same single API key* as the LLM, so
  no extra provider or key is needed.
- **Single secret for AI:** `GEMINI_API_KEY` powers both chat and embeddings.
- **CEFIS = typed mock now.** User has real CEFIS API + transcripts but we build
  against a clean typed interface with sample data so the core build proceeds today;
  real API + transcripts are swapped in by config + re-running the ingest script.

## 4. Architecture

Simple Next.js fullstack app. **No microservices.**

```
Next.js Fullstack App
  ├── frontend UI (App Router pages + shadcn/ui)
  ├── API routes (/api/chat)
  ├── Server Actions (onboarding, roadmap, cefis connect)
  ├── AI services (Gemini chat + embeddings)
  ├── RAG pipeline (chunk → embed → pgvector → retrieve → inject)
  ├── onboarding engine (template-driven)
  ├── roadmap engine (template lookup)
  └── CEFIS service layer (typed interface, mock impl)
```

## 5. Project structure

```
/app
  /(auth)/login           login page
  /(auth)/signup          signup page
  /onboarding             4-question flow
  /cefis/connect          connect CEFIS account/API key
  /dashboard              profile + roadmap summary + entry points
  /tutor                  Gemini-powered streaming chat
  /roadmap                (phase 2)
  /cases                  (phase 2)
  /api/chat               RAG retrieval + Gemini streaming
/components
  /ui                     shadcn/ui primitives
  /...                    feature components (chat, onboarding, etc.)
/lib                      supabase clients (server/client/admin), gemini client, utils
/services                 cefis.ts, rag.ts, embeddings.ts
/prompts                  tutor.ts, caseEval.ts
/actions                  onboarding.ts, roadmap.ts, cefis.ts (server actions)
/types                    shared types
/hooks                    client hooks (e.g. useChat)
/scripts                  ingest.ts (chunk + embed transcripts)
```

## 6. Data model (Supabase)

All tables have **RLS enabled**; users can only read/write their own rows
(except seed/content tables). `pgvector` extension enabled.

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (= auth.users.id), `full_name`, `created_at` | 1:1 with auth user |
| `learning_profiles` | `user_id`, `goal`, `level`, `study_time`, `learning_style` | onboarding result |
| `cefis_connections` | `user_id`, `encrypted_token`, `status`, `connected_at` | CEFIS link |
| `roadmaps` | `user_id`, `area`, `level`, `weeks` (jsonb) | phase-2 content |
| `chat_sessions` | `id`, `user_id`, `title`, `created_at` | one per conversation |
| `chat_messages` | `id`, `session_id`, `role`, `content`, `created_at` | chat history |
| `practical_cases` | `id`, `area`, `title`, `prompt`, `rubric` (jsonb) | seeded; phase-2 content |
| `documents` | `id`, `source`, `title`, `metadata` (jsonb) | RAG source doc |
| `document_chunks` | `id`, `document_id`, `content`, `embedding vector(768)`, `metadata` | RAG store |

**RAG SQL function:** `match_document_chunks(query_embedding, match_count, similarity_threshold)`
returns top-k chunks by cosine similarity, used by the chat API.

## 7. Onboarding

Single flow, 4 questions, saved to `learning_profiles` via a server action, then
redirect to `/cefis/connect` → `/dashboard`.

1. **Learning goal** — Become tax analyst · Get promoted · Change careers · Open accounting office
2. **Current level** — Beginner · Intermediate · Advanced
3. **Available study time** — 30min/day · 1h/day · 2h/day
4. **Preferred learning style** — Practical examples · Videos · Exercises · Reading

## 8. Roadmap (phase 2 — template-based)

No adaptive engine. A lookup keyed by `(level, goal, style)` returns a template
roadmap, stored in `roadmaps`. Example (beginner / practical / tax analyst):

- **Week 1:** ICMS basics · CST introduction · simple exercises
- **Week 2:** CFOP · practical classification
- **Week 3:** SPED Fiscal · mini practical project

## 9. AI tutor (core feature)

Gemini-powered streaming chat. `/api/chat` flow:

```
user message
  → load learning_profile (personalization)
  → embed query (Gemini) → match_document_chunks (top-k CEFIS content)
  → assemble prompt: system + profile + retrieved context + history + message
  → Gemini Flash (streaming)
  → persist user + assistant messages to chat_messages
```

**System prompt (`/prompts/tutor.ts`) behavior:**
- Acts as a CEFIS professional fiscal tutor.
- Problem-based learning: asks guiding questions *before* giving answers.
- Adapts language and depth to the student's level.
- Uses real-world business/tax examples.
- Grounds answers in retrieved CEFIS content; encourages critical thinking.
- Stays within fiscal scope (ICMS, ICMS-ST, CFOP, CST, SPED Fiscal, PIS/COFINS).

## 10. RAG (deliberately simple)

`/scripts/ingest.ts`:
```
transcript files (txt/md)
  → fixed-size chunking (~800 tokens, ~100 overlap)
  → Gemini text-embedding-004 (768-dim)
  → upsert into document_chunks
```
Seeded now with sample fiscal study content; real CEFIS transcripts are ingested by
dropping files in and re-running the script. Retrieval = cosine top-k, injected into
the tutor prompt. No reranking, no multi-hop — kept minimal by design.

## 11. CEFIS integration

`/services/cefis.ts` — clean typed interface:
- `getCourses()`
- `getTracks()`
- `getLessons()`
- `getUserProfile()`

Mock implementation returns realistic sample data now. Real API (base URL + auth +
endpoints, user-provided) swapped behind the same interface via env config later.

## 12. Practical cases (phase 2)

Seeded mini fiscal cases (e.g. *"A company received interstate goods and the CST was
classified incorrectly"*). The tutor poses guiding questions (risks? what to check
first? tax impact?) and evaluates reasoning, technical understanding, and confidence
using `/prompts/caseEval.ts`.

## 13. UI

Modern, clean, professional, minimal, fast. shadcn/ui components.
Pages: Login, Signup, Onboarding, CEFIS Connect, Dashboard, Tutor Chat,
Roadmap (phase 2), Practical Cases (phase 2).

## 14. Deployment

- Multi-stage `Dockerfile` (Next.js standalone output).
- `docker-compose.yml` (app container; hosted Supabase).
- `.env.example` with all variables.
- `README.md` with Supabase + Gemini (AI Studio) + Easypanel setup steps.

### Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=               # Flash model you have access to (e.g. gemini-2.5-flash)
GEMINI_EMBED_MODEL=text-embedding-004
CEFIS_API_BASE_URL=         # mock/placeholder until real API provided
CEFIS_API_KEY=
```

## 15. Build scope for first session ("core slice first")

Scaffold the whole project, then build the core loop deep:

**In scope now:** project scaffold · Supabase schema + RLS + pgvector · auth
(login/signup + route protection) · onboarding · CEFIS connect (mock) · dashboard ·
tutor chat + RAG · ingest script with sample content · Docker + README.

**Next pass:** roadmap generator · practical cases (routes + tables exist now,
content/logic built next).

## 16. Engineering principles

Keep it simple. Avoid premature abstraction and enterprise architecture. Prefer
readable, strongly-typed code. Server-side logic where sensible. Minimal dependencies.
Optimize for fast iteration and a demo-ready result.
