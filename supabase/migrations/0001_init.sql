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

-- No secret stored in MVP: only status + a non-secret label (see spec section 11).
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
