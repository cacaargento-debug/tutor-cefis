# CEFIS AI Tutor (MVP)

AI learning copilot for CEFIS fiscal students: onboarding, personalized tutoring,
and pgvector RAG over CEFIS content. Built with Next.js 16, Supabase, and Gemini.

## Prerequisites
- Node 20+
- A Supabase project
- A Google AI Studio API key (free tier): https://aistudio.google.com/apikey

## Setup
1. `cp .env.example .env.local` and fill the values.
2. Apply `supabase/migrations/0001_init.sql` in the Supabase SQL Editor.
3. `npm install`
4. `npm run ingest`  # embeds the seed fiscal content
5. `npm run dev`     # http://localhost:3000

## Tests
`npm test`

## Deploy (Docker / Easypanel)
1. Set the env vars from `.env.example` in Easypanel.
2. Easypanel builds the `Dockerfile` (standalone Next.js) and runs on port 3000.
3. Pass `NEXT_PUBLIC_*` as build args; the rest as runtime env vars.

## Swapping in the real CEFIS API
Implement the `CefisClient` interface in `services/cefis.ts` against the real
endpoints and branch on `CEFIS_API_BASE_URL`. Re-run `npm run ingest` with real
transcript files placed in `content/fiscal/` to refresh the RAG index.
