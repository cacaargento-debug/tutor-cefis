# CEFIS AI Tutor (Core Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core loop of the CEFIS AI learning copilot — auth → onboarding → CEFIS connect (mock) → dashboard → Gemini-powered tutor chat grounded in pgvector RAG.

**Architecture:** Single Next.js 15 fullstack app. Server Actions for mutations, one streaming API route for chat. Supabase provides Postgres + Auth + pgvector. Gemini Flash powers chat; Gemini `text-embedding-004` (768-dim) powers embeddings under one `GEMINI_API_KEY`. CEFIS is a typed service with a mock implementation. No microservices.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · TailwindCSS · shadcn/ui · `@supabase/ssr` · `@supabase/supabase-js` · `@google/genai` · `pgvector` · `vitest` · Docker.

**Scope:** Core slice only. Roadmap generator and practical-cases logic are a later plan (their routes/tables are stubbed here). Source spec: `docs/superpowers/specs/2026-05-26-cefis-ai-tutor-design.md`.

**Testing approach (per project speed priority):** TDD for pure functions (Tasks 8, 11 history-cap, 12 prompt assembly). Runtime/manual verification for UI, migrations, and integration. Each task ends in a commit.

---

## File structure (decomposition)

```
/app
  layout.tsx, page.tsx, globals.css
  /(auth)/login/page.tsx, /(auth)/signup/page.tsx
  /onboarding/page.tsx
  /cefis/connect/page.tsx
  /dashboard/page.tsx
  /tutor/page.tsx
  /roadmap/page.tsx           (stub)
  /cases/page.tsx             (stub)
  /api/chat/route.ts          (Node runtime, streaming)
/actions
  auth.ts, onboarding.ts, cefis.ts
/components
  /ui/*                       (shadcn primitives)
  onboarding-form.tsx, chat.tsx, message-list.tsx, sign-out-button.tsx
/hooks
  use-chat.ts
/lib
  env.ts
  /supabase/client.ts, server.ts, admin.ts, middleware.ts
  chunk.ts                    (pure: text chunking)
  history.ts                  (pure: history window)
/services
  cefis.ts                    (typed interface + mock)
  embeddings.ts               (Gemini embeddings, batched + retry)
  rag.ts                      (embed query + match chunks)
/prompts
  tutor.ts
/types
  index.ts
/scripts
  ingest.ts                   (chunk + embed transcripts)
/content/fiscal/*.md          (seed sample transcripts)
/supabase/migrations/0001_init.sql
middleware.ts                 (root, session refresh + route guard)
Dockerfile, docker-compose.yml, .dockerignore, .env.example, README.md
vitest.config.ts
```

---

## Task 0: Scaffold the Next.js project

**Files:**
- Create: project files via `create-next-app` (the dir already contains `.git` + `docs/`)

- [ ] **Step 1: Relocate docs so create-next-app sees a clean dir**

```bash
mv docs /tmp/cefis-docs
```

- [ ] **Step 2: Scaffold into the current directory**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
```
Accept defaults if prompted. Expected: Next.js app files created in place.

- [ ] **Step 3: Restore docs**

```bash
mv /tmp/cefis-docs docs
```

- [ ] **Step 4: Install runtime + dev dependencies**

```bash
npm install @supabase/ssr @supabase/supabase-js @google/genai
npm install -D vitest @types/node tsx dotenv
```

- [ ] **Step 5: Initialise shadcn/ui**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button input label card textarea radio-group sonner avatar
```
Expected: components land in `components/ui/`.

- [ ] **Step 6: Verify dev server boots**

Run: `npm run dev` then open `http://localhost:3000`.
Expected: default Next.js page renders, no console errors. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 + Tailwind + shadcn/ui"
```

---

## Task 1: Environment config + shared types

**Files:**
- Create: `.env.example`, `lib/env.ts`, `types/index.ts`

- [ ] **Step 1: Write `.env.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google Gemini (AI Studio key — powers chat AND embeddings)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
GEMINI_EMBED_MODEL=text-embedding-004

# CEFIS (placeholder until real API is provided)
CEFIS_API_BASE_URL=
CEFIS_API_KEY=
```

- [ ] **Step 2: Create `lib/env.ts` (typed, fail-fast accessor)**

```ts
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  geminiApiKey: () => required("GEMINI_API_KEY"),
  geminiModel: () => process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
  geminiEmbedModel: () => process.env.GEMINI_EMBED_MODEL ?? "text-embedding-004",
};

export const EMBED_DIM = 768;
```

- [ ] **Step 3: Create `types/index.ts`**

```ts
export type Level = "beginner" | "intermediate" | "advanced";
export type StudyTime = "30min" | "1h" | "2h";
export type LearningStyle = "practical" | "videos" | "exercises" | "reading";

export interface LearningProfile {
  goal: string;
  level: Level;
  study_time: StudyTime;
  learning_style: LearningStyle;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id?: string;
  session_id?: string;
  role: ChatRole;
  content: string;
  created_at?: string;
}

export interface RetrievedChunk {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
}
```

- [ ] **Step 4: Copy example to local env (fill values manually later)**

```bash
cp .env.example .env.local
```

- [ ] **Step 5: Commit**

```bash
git add .env.example lib/env.ts types/index.ts
git commit -m "feat: env accessor and shared types"
```

---

## Task 2: Supabase clients + session middleware

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/supabase/middleware.ts`, `middleware.ts`

- [ ] **Step 1: Browser client `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export function createClient() {
  return createBrowserClient(env.supabaseUrl(), env.supabaseAnonKey());
}
```

- [ ] **Step 2: Server client `lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // called from a Server Component — middleware refreshes the session
        }
      },
    },
  });
}
```

- [ ] **Step 3: Admin (service-role) client `lib/supabase/admin.ts`**

```ts
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Server-only. Bypasses RLS. Never import into client components.
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 4: Session updater `lib/supabase/middleware.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/signup", "/auth"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
```

- [ ] **Step 5: Root `middleware.ts`**

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase middleware.ts
git commit -m "feat: supabase browser/server/admin clients and auth middleware"
```

---

## Task 3: Database schema, RLS, and RAG match function

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0001_init.sql
create extension if not exists vector;

-- profiles (1:1 with auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table learning_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal text not null,
  level text not null check (level in ('beginner','intermediate','advanced')),
  study_time text not null check (study_time in ('30min','1h','2h')),
  learning_style text not null check (learning_style in ('practical','videos','exercises','reading')),
  created_at timestamptz not null default now()
);

-- No secret stored in MVP: only status + a non-secret label (see spec §11).
create table cefis_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'connected' check (status in ('connected','skipped')),
  account_label text,
  connected_at timestamptz not null default now()
);

create table roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null default 'fiscal',
  level text not null,
  weeks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table practical_cases (
  id uuid primary key default gen_random_uuid(),
  area text not null default 'fiscal',
  title text not null,
  prompt text not null,
  rubric jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- RAG store
create table documents (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  content text not null,
  embedding vector(768),
  metadata jsonb not null default '{}'::jsonb
);

create index document_chunks_embedding_idx
  on document_chunks using hnsw (embedding vector_cosine_ops);

-- Auto-create a profile row on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- RLS
alter table profiles            enable row level security;
alter table learning_profiles   enable row level security;
alter table cefis_connections   enable row level security;
alter table roadmaps            enable row level security;
alter table chat_sessions       enable row level security;
alter table chat_messages       enable row level security;
alter table practical_cases     enable row level security;
alter table documents           enable row level security;
alter table document_chunks     enable row level security;

-- Per-user policies (owner only)
create policy "own profile"            on profiles          for all using (auth.uid() = id)      with check (auth.uid() = id);
create policy "own learning_profile"   on learning_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own cefis_connection"   on cefis_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own roadmaps"           on roadmaps          for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own chat_sessions"      on chat_sessions     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own chat_messages"      on chat_messages     for all using (
  exists (select 1 from chat_sessions s where s.id = chat_messages.session_id and s.user_id = auth.uid())
) with check (
  exists (select 1 from chat_sessions s where s.id = chat_messages.session_id and s.user_id = auth.uid())
);

-- Shared content: any authenticated user may read; writes are service-role only.
create policy "read documents"        on documents       for select to authenticated using (true);
create policy "read document_chunks"  on document_chunks for select to authenticated using (true);
create policy "read practical_cases"  on practical_cases for select to authenticated using (true);

-- RAG retrieval. SECURITY DEFINER so it is never blocked by RLS.
create or replace function match_document_chunks(
  query_embedding vector(768),
  match_count int default 5,
  similarity_threshold float default 0.5
)
returns table (id uuid, document_id uuid, content text, similarity float)
language sql stable security definer set search_path = public as $$
  select dc.id, dc.document_id, dc.content,
         1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) > similarity_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
```

- [ ] **Step 2: Apply the migration**

Apply against your Supabase project, either:
- Supabase dashboard → SQL Editor → paste `0001_init.sql` → Run, **or**
- `supabase db push` if the Supabase CLI is linked.

Expected: all tables, policies, and the `match_document_chunks` function exist.

- [ ] **Step 3: Verify in SQL Editor**

```sql
select tablename from pg_tables where schemaname = 'public' order by tablename;
select proname from pg_proc where proname = 'match_document_chunks';
```
Expected: 9 tables listed; function present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: db schema, RLS policies, RAG match function"
```

---

## Task 4: Authentication (signup, login, logout, guard)

**Files:**
- Create: `actions/auth.ts`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `components/sign-out-button.tsx`

- [ ] **Step 1: Auth server actions `actions/auth.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signUp(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const fullName = String(formData.get("full_name") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) return { error: error.message };
  redirect("/onboarding");
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Login page `app/(auth)/login/page.tsx`**

```tsx
import Link from "next/link";
import { signIn } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold">Entrar no CEFIS Tutor</h1>
        <form action={signIn} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" className="w-full">Entrar</Button>
        </form>
        <p className="text-sm text-muted-foreground">
          Não tem conta? <Link className="underline" href="/signup">Cadastre-se</Link>
        </p>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Signup page `app/(auth)/signup/page.tsx`**

```tsx
import Link from "next/link";
import { signUp } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold">Criar conta</h1>
        <form action={signUp} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="full_name">Nome</Label>
            <Input id="full_name" name="full_name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" minLength={6} required />
          </div>
          <Button type="submit" className="w-full">Cadastrar</Button>
        </form>
        <p className="text-sm text-muted-foreground">
          Já tem conta? <Link className="underline" href="/login">Entrar</Link>
        </p>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Sign-out button `components/sign-out-button.tsx`**

```tsx
import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button variant="ghost" size="sm" type="submit">Sair</Button>
    </form>
  );
}
```

- [ ] **Step 5: Manual verification**

Fill `.env.local` with Supabase keys. Run `npm run dev`.
- Visit `/signup`, create a user → expect redirect to `/onboarding`.
- In Supabase, confirm a `profiles` row was created by the trigger.
- Visit `/login` in a fresh session, sign in → expect `/dashboard` (404 until Task 9 — acceptable; the redirect proves auth works).
- Visit `/tutor` while logged out → expect redirect to `/login`.

- [ ] **Step 6: Commit**

```bash
git add actions/auth.ts "app/(auth)" components/sign-out-button.tsx
git commit -m "feat: email/password auth with route guard"
```

---

## Task 5: Onboarding (4 questions → learning_profiles)

**Files:**
- Create: `actions/onboarding.ts`, `components/onboarding-form.tsx`, `app/onboarding/page.tsx`

- [ ] **Step 1: Server action `actions/onboarding.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LearningProfile } from "@/types";

export async function saveOnboarding(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile: LearningProfile = {
    goal: String(formData.get("goal")),
    level: String(formData.get("level")) as LearningProfile["level"],
    study_time: String(formData.get("study_time")) as LearningProfile["study_time"],
    learning_style: String(formData.get("learning_style")) as LearningProfile["learning_style"],
  };

  const { error } = await supabase
    .from("learning_profiles")
    .upsert({ user_id: user.id, ...profile });
  if (error) return { error: error.message };

  redirect("/cefis/connect");
}
```

- [ ] **Step 2: Form component `components/onboarding-form.tsx`**

```tsx
"use client";

import { saveOnboarding } from "@/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const GOALS = [
  "Tornar-me analista fiscal",
  "Ser promovido(a)",
  "Mudar de carreira",
  "Abrir um escritório contábil",
];

function Choice({ name, options }: { name: string; options: [string, string][] }) {
  return (
    <RadioGroup name={name} className="grid grid-cols-2 gap-2" required>
      {options.map(([value, label]) => (
        <Label
          key={value}
          className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent"
        >
          <RadioGroupItem value={value} /> {label}
        </Label>
      ))}
    </RadioGroup>
  );
}

export function OnboardingForm() {
  return (
    <form action={saveOnboarding} className="space-y-6">
      <div className="space-y-2">
        <Label>Qual o seu objetivo?</Label>
        <RadioGroup name="goal" className="grid gap-2" required>
          {GOALS.map((g) => (
            <Label key={g} className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent">
              <RadioGroupItem value={g} /> {g}
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label>Seu nível atual</Label>
        <Choice name="level" options={[["beginner", "Iniciante"], ["intermediate", "Intermediário"], ["advanced", "Avançado"]]} />
      </div>

      <div className="space-y-2">
        <Label>Tempo de estudo por dia</Label>
        <Choice name="study_time" options={[["30min", "30 min/dia"], ["1h", "1h/dia"], ["2h", "2h/dia"]]} />
      </div>

      <div className="space-y-2">
        <Label>Estilo de aprendizagem preferido</Label>
        <Choice name="learning_style" options={[["practical", "Exemplos práticos"], ["videos", "Vídeos"], ["exercises", "Exercícios"], ["reading", "Leitura"]]} />
      </div>

      <Button type="submit" className="w-full">Gerar meu plano</Button>
    </form>
  );
}
```

- [ ] **Step 3: Page `app/onboarding/page.tsx`**

```tsx
import { OnboardingForm } from "@/components/onboarding-form";
import { Card } from "@/components/ui/card";

export default function OnboardingPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <Card className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Vamos personalizar seu aprendizado</h1>
          <p className="text-muted-foreground">Responda 4 perguntas rápidas.</p>
        </div>
        <OnboardingForm />
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Manual verification**

Run `npm run dev`, sign in, visit `/onboarding`, submit. Expect redirect to `/cefis/connect` (404 until Task 6) and a `learning_profiles` row in Supabase.

- [ ] **Step 5: Commit**

```bash
git add actions/onboarding.ts components/onboarding-form.tsx app/onboarding
git commit -m "feat: 4-question onboarding saving learning profile"
```

---

## Task 6: CEFIS service (mock) + connect page

**Files:**
- Create: `services/cefis.ts`, `actions/cefis.ts`, `app/cefis/connect/page.tsx`

- [ ] **Step 1: Typed service + mock `services/cefis.ts`**

```ts
export interface CefisCourse { id: string; title: string; area: string; }
export interface CefisTrack { id: string; title: string; courseIds: string[]; }
export interface CefisLesson { id: string; courseId: string; title: string; }
export interface CefisUserProfile { id: string; name: string; email: string; }

export interface CefisClient {
  getCourses(): Promise<CefisCourse[]>;
  getTracks(): Promise<CefisTrack[]>;
  getLessons(courseId: string): Promise<CefisLesson[]>;
  getUserProfile(): Promise<CefisUserProfile>;
}

// Mock implementation. Replace with a real HTTP client behind the same interface
// when CEFIS_API_BASE_URL / CEFIS_API_KEY are provided.
const mock: CefisClient = {
  async getCourses() {
    return [
      { id: "icms-101", title: "ICMS na prática", area: "fiscal" },
      { id: "cfop-101", title: "CFOP e classificação de operações", area: "fiscal" },
      { id: "sped-101", title: "SPED Fiscal do zero", area: "fiscal" },
    ];
  },
  async getTracks() {
    return [{ id: "fiscal-analyst", title: "Analista Fiscal", courseIds: ["icms-101", "cfop-101", "sped-101"] }];
  },
  async getLessons(courseId) {
    return [
      { id: `${courseId}-l1`, courseId, title: "Introdução" },
      { id: `${courseId}-l2`, courseId, title: "Casos práticos" },
    ];
  },
  async getUserProfile() {
    return { id: "mock-user", name: "Aluno CEFIS", email: "aluno@cefis.com.br" };
  },
};

export function getCefisClient(): CefisClient {
  // When the real API is wired, branch on env.CEFIS_API_BASE_URL here.
  return mock;
}
```

- [ ] **Step 2: Connect server actions `actions/cefis.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function setStatus(status: "connected" | "skipped", label: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("cefis_connections")
    .upsert({ user_id: user.id, status, account_label: label });
  redirect("/dashboard");
}

// MVP stores no secret — only status + a non-secret label.
export async function connectCefis(formData: FormData) {
  const label = String(formData.get("account_label") ?? "Conta CEFIS");
  await setStatus("connected", label);
}

export async function skipCefis() {
  await setStatus("skipped", null);
}
```

- [ ] **Step 3: Connect page `app/cefis/connect/page.tsx` (skippable — review #7)**

```tsx
import { connectCefis, skipCefis } from "@/actions/cefis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function CefisConnectPage() {
  return (
    <main className="mx-auto max-w-md p-6">
      <Card className="p-6 space-y-4">
        <h1 className="text-xl font-semibold">Conectar sua conta CEFIS</h1>
        <p className="text-sm text-muted-foreground">
          Identifique sua conta para personalizar recomendações. Nenhuma chave é
          armazenada nesta versão.
        </p>
        <form action={connectCefis} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="account_label">Identificação da conta</Label>
            <Input id="account_label" name="account_label" placeholder="ex.: meu e-mail CEFIS" />
          </div>
          <Button type="submit" className="w-full">Conectar</Button>
        </form>
        <form action={skipCefis}>
          <Button variant="ghost" className="w-full" type="submit">Pular por agora</Button>
        </form>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Manual verification**

Run dev server, complete onboarding, land on `/cefis/connect`. Click "Pular por agora" → expect redirect to `/dashboard` (404 until Task 9) and a `cefis_connections` row with `status='skipped'`.

- [ ] **Step 5: Commit**

```bash
git add services/cefis.ts actions/cefis.ts app/cefis
git commit -m "feat: mock CEFIS service and skippable connect step"
```

---

## Task 7: Pure text chunking (TDD)

**Files:**
- Create: `lib/chunk.ts`, `lib/chunk.test.ts`, `vitest.config.ts`

- [ ] **Step 1: Vitest config `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```
Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Write the failing test `lib/chunk.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/chunk";

describe("chunkText", () => {
  it("returns one chunk when text is shorter than the chunk size", () => {
    expect(chunkText("hello world", 100, 10)).toEqual(["hello world"]);
  });

  it("splits long text into overlapping chunks", () => {
    const text = "a".repeat(250);
    const chunks = chunkText(text, 100, 20);
    expect(chunks.length).toBe(3); // step = 80 -> starts 0,80,160
    expect(chunks[0].length).toBe(100);
    expect(chunks[1].startsWith("a")).toBe(true);
  });

  it("drops empty/whitespace-only trailing chunks", () => {
    expect(chunkText("   ", 100, 10)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `chunkText` not exported.

- [ ] **Step 4: Implement `lib/chunk.ts`**

```ts
// Simple fixed-size character chunker with overlap. Kept intentionally minimal.
export function chunkText(text: string, chunkSize = 1200, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  const step = Math.max(1, chunkSize - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < clean.length; start += step) {
    const piece = clean.slice(start, start + chunkSize).trim();
    if (piece) chunks.push(piece);
    if (start + chunkSize >= clean.length) break;
  }
  return chunks;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/chunk.ts lib/chunk.test.ts vitest.config.ts package.json
git commit -m "feat: text chunking utility with tests"
```

---

## Task 8: Embeddings service (Gemini, batched + retry — review #4)

**Files:**
- Create: `lib/gemini.ts`, `services/embeddings.ts`

- [ ] **Step 1: Shared Gemini client `lib/gemini.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";

let client: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey() });
  return client;
}
```

- [ ] **Step 2: Embeddings service `services/embeddings.ts`**

```ts
import { gemini } from "@/lib/gemini";
import { env } from "@/lib/env";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(texts: string[], attempt = 0): Promise<number[][]> {
  try {
    const res = await gemini().models.embedContent({
      model: env.geminiEmbedModel(),
      contents: texts,
    });
    return (res.embeddings ?? []).map((e) => e.values as number[]);
  } catch (err) {
    if (attempt >= 4) throw err;
    const backoff = 1000 * 2 ** attempt; // 1s,2s,4s,8s — survives free-tier RPM limits
    await sleep(backoff);
    return embedBatch(texts, attempt + 1);
  }
}

// Embeds many texts in small batches to respect free-tier rate limits.
export async function embedTexts(texts: string[], batchSize = 20): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    out.push(...(await embedBatch(batch)));
    if (i + batchSize < texts.length) await sleep(500);
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedBatch([text]);
  return vec;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/gemini.ts services/embeddings.ts
git commit -m "feat: Gemini embeddings service with batching and retry"
```

---

## Task 9: Seed content + ingest script

**Files:**
- Create: `content/fiscal/icms.md`, `content/fiscal/cfop-cst.md`, `content/fiscal/sped-pis-cofins.md`, `scripts/ingest.ts`

- [ ] **Step 1: Add sample fiscal content (3 short markdown files)**

`content/fiscal/icms.md`:
```md
# ICMS e ICMS-ST

O ICMS é o imposto estadual sobre circulação de mercadorias e serviços de
transporte e comunicação. A base de cálculo é, em regra, o valor da operação.
Na substituição tributária (ICMS-ST), a responsabilidade pelo recolhimento é
atribuída a um contribuinte (substituto) que recolhe o imposto das etapas
seguintes da cadeia. O cálculo do ICMS-ST usa a MVA (Margem de Valor Agregado)
para estimar a base presumida das operações subsequentes.
```

`content/fiscal/cfop-cst.md`:
```md
# CFOP e CST

O CFOP (Código Fiscal de Operações e Prestações) identifica a natureza da
operação: entradas começam com 1/2/3 e saídas com 5/6/7, conforme a origem
(estadual, interestadual, exterior). O CST (Código de Situação Tributária)
indica a tributação do ICMS: origem da mercadoria (0 a 8) seguida da
situação (00 tributada integralmente, 10 com ST, 40 isenta, 60 ST já recolhida).
A classificação incorreta de CFOP/CST gera risco fiscal e escrituração errada.
```

`content/fiscal/sped-pis-cofins.md`:
```md
# SPED Fiscal e PIS/COFINS

O SPED Fiscal (EFD-ICMS/IPI) é a escrituração digital das operações para fins de
ICMS e IPI, organizada em blocos e registros. PIS e COFINS são contribuições
federais sobre a receita, com dois regimes: cumulativo (alíquotas menores, sem
crédito) e não cumulativo (alíquotas maiores, com direito a crédito sobre
insumos). A correta apuração depende da classificação fiscal e do regime da empresa.
```

- [ ] **Step 2: Ingest script `scripts/ingest.ts`**

```ts
import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { chunkText } from "@/lib/chunk";
import { embedTexts } from "@/services/embeddings";
import { createAdminClient } from "@/lib/supabase/admin";

const CONTENT_DIR = path.join(process.cwd(), "content", "fiscal");

async function main() {
  const db = createAdminClient();
  const files = (await readdir(CONTENT_DIR)).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const raw = await readFile(path.join(CONTENT_DIR, file), "utf8");
    const title = file.replace(/\.md$/, "");

    const { data: doc, error: docErr } = await db
      .from("documents")
      .insert({ source: file, title, metadata: { area: "fiscal" } })
      .select("id")
      .single();
    if (docErr) throw docErr;

    const chunks = chunkText(raw);
    const vectors = await embedTexts(chunks);

    const rows = chunks.map((content, i) => ({
      document_id: doc.id,
      content,
      embedding: vectors[i],
      metadata: { area: "fiscal", title },
    }));

    const { error: chunkErr } = await db.from("document_chunks").insert(rows);
    if (chunkErr) throw chunkErr;

    console.log(`Ingested ${file}: ${chunks.length} chunks`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Add the npm script**

In `package.json` scripts add: `"ingest": "tsx scripts/ingest.ts"`.

- [ ] **Step 4: Run ingestion (requires GEMINI_API_KEY + Supabase keys in `.env.local`)**

Run: `npm run ingest`
Expected: logs `Ingested ... chunks` per file, then `Done.`

- [ ] **Step 5: Verify in Supabase SQL Editor**

```sql
select count(*) from documents;        -- 3
select count(*) from document_chunks;  -- > 0, embeddings not null
```

- [ ] **Step 6: Commit**

```bash
git add content scripts/ingest.ts package.json
git commit -m "feat: seed fiscal content and embedding ingest script"
```

---

## Task 10: RAG retrieval service

**Files:**
- Create: `services/rag.ts`

- [ ] **Step 1: `services/rag.ts`**

```ts
import { embedQuery } from "@/services/embeddings";
import { createClient } from "@/lib/supabase/server";
import type { RetrievedChunk } from "@/types";

export async function retrieveContext(
  query: string,
  matchCount = 5,
  threshold = 0.45
): Promise<RetrievedChunk[]> {
  const embedding = await embedQuery(query);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: embedding,
    match_count: matchCount,
    similarity_threshold: threshold,
  });
  if (error) {
    console.error("RAG retrieval failed:", error.message);
    return [];
  }
  return (data ?? []) as RetrievedChunk[];
}

export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "Nenhum material CEFIS relevante encontrado.";
  return chunks
    .map((c, i) => `[Trecho ${i + 1}]\n${c.content}`)
    .join("\n\n");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add services/rag.ts
git commit -m "feat: RAG retrieval via pgvector match function"
```

---

## Task 11: Tutor prompt + history window (TDD for the window)

**Files:**
- Create: `prompts/tutor.ts`, `lib/history.ts`, `lib/history.test.ts`

- [ ] **Step 1: System prompt `prompts/tutor.ts`**

```ts
import type { LearningProfile } from "@/types";

const LEVEL_LABEL: Record<LearningProfile["level"], string> = {
  beginner: "iniciante",
  intermediate: "intermediário",
  advanced: "avançado",
};

export function buildSystemPrompt(profile: LearningProfile | null, context: string): string {
  const level = profile ? LEVEL_LABEL[profile.level] : "iniciante";
  const goal = profile?.goal ?? "evoluir na carreira fiscal";

  return `Você é um tutor profissional da CEFIS, especialista em legislação fiscal brasileira.
Seu escopo é APENAS fiscal/tributário: ICMS, ICMS-ST, CFOP, CST, SPED Fiscal e PIS/COFINS.

Perfil do aluno:
- Objetivo: ${goal}
- Nível: ${level}

Como ensinar (aprendizagem baseada em problemas):
- Ensine, não apenas responda. Antes de dar a resposta pronta, faça 1 pergunta
  que leve o aluno a raciocinar.
- Use exemplos práticos de empresas e operações reais.
- Adapte a linguagem ao nível do aluno (${level}).
- Incentive o pensamento crítico e a aplicação no dia a dia.
- Se a pergunta fugir do escopo fiscal, redirecione gentilmente para o tema.

Use o material CEFIS abaixo como base. Se ele não cobrir a dúvida, diga isso e
oriente com seu conhecimento, sem inventar dispositivos legais.

=== MATERIAL CEFIS ===
${context}
=== FIM DO MATERIAL ===`;
}
```

- [ ] **Step 2: Failing test `lib/history.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { windowHistory } from "@/lib/history";
import type { ChatMessage } from "@/types";

const msg = (i: number): ChatMessage => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` });

describe("windowHistory", () => {
  it("returns all messages when under the limit", () => {
    const h = [msg(0), msg(1)];
    expect(windowHistory(h, 10)).toHaveLength(2);
  });

  it("keeps only the most recent N messages", () => {
    const h = Array.from({ length: 20 }, (_, i) => msg(i));
    const out = windowHistory(h, 6);
    expect(out).toHaveLength(6);
    expect(out[out.length - 1].content).toBe("m19");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `windowHistory` not exported.

- [ ] **Step 4: Implement `lib/history.ts` (review #5 — bound token growth)**

```ts
import type { ChatMessage } from "@/types";

export function windowHistory(messages: ChatMessage[], max = 10): ChatMessage[] {
  return messages.slice(-max);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prompts/tutor.ts lib/history.ts lib/history.test.ts
git commit -m "feat: tutor system prompt and bounded history window"
```

---

## Task 12: Chat API route (Node runtime, streaming, durable persistence)

**Files:**
- Create: `app/api/chat/route.ts`

Addresses review #3 (persist user message before streaming; persist assistant
message on stream completion) and #5 (Node runtime + history cap).

- [ ] **Step 1: `app/api/chat/route.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import { gemini } from "@/lib/gemini";
import { env } from "@/lib/env";
import { retrieveContext, formatContext } from "@/services/rag";
import { buildSystemPrompt } from "@/prompts/tutor";
import { windowHistory } from "@/lib/history";
import type { ChatMessage, LearningProfile } from "@/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { sessionId, messages } = (await req.json()) as {
    sessionId?: string;
    messages: ChatMessage[];
  };
  const history = windowHistory(messages, 10);
  const lastUser = history[history.length - 1];
  if (!lastUser || lastUser.role !== "user") {
    return new Response("Bad Request", { status: 400 });
  }

  // Ensure a chat session exists (created lazily on first message).
  let sid = sessionId;
  if (!sid) {
    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({ user_id: user.id, title: lastUser.content.slice(0, 60) })
      .select("id")
      .single();
    if (error) return new Response(error.message, { status: 500 });
    sid = data.id;
  }

  // Persist the user message BEFORE streaming (review #3).
  await supabase.from("chat_messages").insert({ session_id: sid, role: "user", content: lastUser.content });

  const { data: profileRow } = await supabase
    .from("learning_profiles")
    .select("goal, level, study_time, learning_style")
    .eq("user_id", user.id)
    .maybeSingle();
  const profile = (profileRow ?? null) as LearningProfile | null;

  const chunks = await retrieveContext(lastUser.content);
  const systemPrompt = buildSystemPrompt(profile, formatContext(chunks));

  const contents = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const geminiStream = await gemini().models.generateContentStream({
    model: env.geminiModel(),
    contents,
    config: { systemInstruction: systemPrompt, temperature: 0.5 },
  });

  const encoder = new TextEncoder();
  let full = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of geminiStream) {
          const text = chunk.text ?? "";
          if (text) {
            full += text;
            controller.enqueue(encoder.encode(text));
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        // Persist assistant reply even if the client disconnected (review #3).
        if (full) {
          await supabase.from("chat_messages").insert({ session_id: sid, role: "assistant", content: full });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "x-session-id": sid!,
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: streaming chat API with RAG context and durable persistence"
```

---

## Task 13: Tutor chat UI

**Files:**
- Create: `hooks/use-chat.ts`, `components/message-list.tsx`, `components/chat.tsx`, `app/tutor/page.tsx`

- [ ] **Step 1: Chat hook `hooks/use-chat.ts`**

```ts
"use client";

import { useState } from "react";
import type { ChatMessage } from "@/types";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [streaming, setStreaming] = useState(false);

  async function send(content: string) {
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setStreaming(true);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, messages: next }),
    });

    const sid = res.headers.get("x-session-id") ?? undefined;
    if (sid) setSessionId(sid);

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: acc };
        return copy;
      });
    }
    setStreaming(false);
  }

  return { messages, send, streaming };
}
```

- [ ] **Step 2: Message list `components/message-list.tsx`**

```tsx
import type { ChatMessage } from "@/types";

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {messages.map((m, i) => (
        <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
          <div
            className={
              "inline-block max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-2 text-sm " +
              (m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")
            }
          >
            {m.content || "…"}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Chat container `components/chat.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { MessageList } from "@/components/message-list";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Chat() {
  const { messages, send, streaming } = useChat();
  const [input, setInput] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    await send(text);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {messages.length === 0 && (
        <p className="p-6 text-muted-foreground">
          Pergunte algo sobre ICMS, CFOP, CST, SPED Fiscal ou PIS/COFINS.
        </p>
      )}
      <MessageList messages={messages} />
      <form onSubmit={submit} className="flex gap-2 border-t p-4">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite sua dúvida fiscal..."
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
        />
        <Button type="submit" disabled={streaming}>Enviar</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Page `app/tutor/page.tsx`**

```tsx
import Link from "next/link";
import { Chat } from "@/components/chat";
import { SignOutButton } from "@/components/sign-out-button";

export default function TutorPage() {
  return (
    <div>
      <header className="flex h-16 items-center justify-between border-b px-4">
        <Link href="/dashboard" className="font-semibold">CEFIS Tutor</Link>
        <SignOutButton />
      </header>
      <Chat />
    </div>
  );
}
```

- [ ] **Step 5: Manual verification (golden path + edge cases)**

Run `npm run dev`. Sign in → `/tutor`.
- Ask "O que é ICMS-ST?" → expect a streamed answer that asks a guiding question and references the seeded material.
- Ask an off-topic question ("qual a capital da França?") → expect a gentle redirect to fiscal topics.
- Refresh and confirm `chat_messages` rows persist (user + assistant) in Supabase.

- [ ] **Step 6: Commit**

```bash
git add hooks/use-chat.ts components/message-list.tsx components/chat.tsx app/tutor
git commit -m "feat: streaming tutor chat UI"
```

---

## Task 14: Dashboard + stub routes

**Files:**
- Create: `app/dashboard/page.tsx`, `app/roadmap/page.tsx`, `app/cases/page.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Dashboard `app/dashboard/page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("learning_profiles")
    .select("goal, level")
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Seu painel</h1>
        <SignOutButton />
      </div>
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">Objetivo</p>
        <p className="font-medium">{profile?.goal ?? "—"}</p>
        <p className="mt-2 text-sm text-muted-foreground">Nível</p>
        <p className="font-medium">{profile?.level ?? "—"}</p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/tutor"><Card className="p-4 hover:bg-accent"><h2 className="font-medium">Tutor IA</h2><p className="text-sm text-muted-foreground">Tire dúvidas fiscais</p></Card></Link>
        <Link href="/roadmap"><Card className="p-4 hover:bg-accent"><h2 className="font-medium">Trilha</h2><p className="text-sm text-muted-foreground">Em breve</p></Card></Link>
        <Link href="/cases"><Card className="p-4 hover:bg-accent"><h2 className="font-medium">Casos práticos</h2><p className="text-sm text-muted-foreground">Em breve</p></Card></Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Stub routes**

`app/roadmap/page.tsx`:
```tsx
export default function RoadmapPage() {
  return <main className="mx-auto max-w-2xl p-6"><h1 className="text-xl font-semibold">Trilha (em breve)</h1></main>;
}
```

`app/cases/page.tsx`:
```tsx
export default function CasesPage() {
  return <main className="mx-auto max-w-2xl p-6"><h1 className="text-xl font-semibold">Casos práticos (em breve)</h1></main>;
}
```

- [ ] **Step 3: Redirect root to dashboard `app/page.tsx`**

```tsx
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 4: Manual verification**

Run dev server. Full flow: signup → onboarding → cefis connect → dashboard shows goal/level, links work, `/tutor` chats, sign out returns to `/login`.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard app/roadmap app/cases app/page.tsx
git commit -m "feat: dashboard and phase-2 stub routes"
```

---

## Task 15: Docker + README

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `README.md`
- Modify: `next.config.ts` (standalone output)

- [ ] **Step 1: Enable standalone output in `next.config.ts`**

```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "standalone" };
export default nextConfig;
```

- [ ] **Step 2: `Dockerfile` (multi-stage)**

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: `.dockerignore`**

```
node_modules
.next
.git
docs
*.md
.env*
```

- [ ] **Step 4: `docker-compose.yml`**

```yaml
services:
  app:
    build:
      context: .
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      GEMINI_MODEL: ${GEMINI_MODEL}
      GEMINI_EMBED_MODEL: ${GEMINI_EMBED_MODEL}
```

- [ ] **Step 5: `README.md`**

```md
# CEFIS AI Tutor (MVP)

AI learning copilot for CEFIS fiscal students: onboarding, personalized tutoring,
and pgvector RAG over CEFIS content. Built with Next.js 15, Supabase, and Gemini.

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
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds, `.next/standalone` produced.
(Optional, if Docker available: `docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=x --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=y -t cefis-tutor .`)

- [ ] **Step 7: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore README.md next.config.ts
git commit -m "feat: docker standalone build and project README"
```

---

## Self-review checklist (completed by author)

**Spec coverage:**
- Auth → Task 4 · Onboarding (4 Q) → Task 5 · CEFIS connect + service → Task 6 ·
  Roadmap → stub (Task 14, phase 2) · Tutor chat → Tasks 11–13 · RAG (chunk/embed/
  store/retrieve/inject) → Tasks 7–10, 12 · System prompt → Task 11 · Practical
  cases → stub (Task 14, phase 2) · Tables → Task 3 · Docker/env/README → Tasks 1, 15.
- Phase-2 items (roadmap generation, practical-case evaluation, `case_attempts`
  table, real CEFIS API, real transcripts) are intentionally deferred to a later plan.

**Review findings folded in:** #3 (persist user msg pre-stream + assistant in
`finally`, lazy session) → Task 12 · #4 (batched embeddings + backoff) → Task 8 ·
#5 (Node runtime + history window) → Tasks 11–12 · #7 (skippable connect) → Task 6.

**Type consistency:** `LearningProfile`, `ChatMessage`, `RetrievedChunk` defined in
Task 1 and used unchanged in Tasks 5, 10, 11, 12, 13. `match_document_chunks`
signature (Task 3) matches the `.rpc()` call (Task 10). `chunkText` (Task 7),
`embedTexts`/`embedQuery` (Task 8), `windowHistory` (Task 11), `buildSystemPrompt`
(Task 11) used with matching signatures in Tasks 9, 10, 12.

**Placeholders:** none — every code step contains full content.
