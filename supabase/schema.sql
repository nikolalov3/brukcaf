-- Bruk Cafe — schemat bazy pod blog i panel Filipa.
-- Wklej całość w Supabase → SQL Editor → Run. Można puszczać wielokrotnie:
-- wszystko jest idempotentne (if not exists / drop policy przed create).
--
-- Model: jeden wiersz = jeden wpis. Pola _pl są wymagane, _en opcjonalne
-- (Filip może pisać tylko po polsku). Slug jest wspólny dla obu języków.

-- ── tabela wpisów ─────────────────────────────────────────────
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  status       text not null default 'draft'
               check (status in ('draft', 'published')),

  -- treść po polsku (wymagana)
  title_pl     text not null,
  excerpt_pl   text,
  body_pl      text not null,

  -- treść po angielsku (opcjonalna)
  title_en     text,
  excerpt_en   text,
  body_en      text,

  cover_url    text,               -- zdjęcie okładki (z bucketu 'blog')
  author       text default 'Bruk Cafe',

  published_at timestamptz,        -- ustawiane w chwili publikacji
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists posts_status_published_idx
  on public.posts (status, published_at desc);

-- updated_at odświeżane automatycznie przy każdej zmianie
create or replace function public.dotknij_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.dotknij_updated_at();

-- ── Row Level Security ────────────────────────────────────────
-- Świat widzi wyłącznie opublikowane wpisy. Tworzyć, zmieniać i usuwać
-- może tylko zalogowany użytkownik (Filip). Żadnego service_role.
alter table public.posts enable row level security;

drop policy if exists "publiczny odczyt opublikowanych" on public.posts;
create policy "publiczny odczyt opublikowanych"
  on public.posts for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "zalogowany widzi wszystko" on public.posts;
create policy "zalogowany widzi wszystko"
  on public.posts for select
  to authenticated
  using (true);

drop policy if exists "zalogowany tworzy" on public.posts;
create policy "zalogowany tworzy"
  on public.posts for insert
  to authenticated
  with check (true);

drop policy if exists "zalogowany edytuje" on public.posts;
create policy "zalogowany edytuje"
  on public.posts for update
  to authenticated
  using (true) with check (true);

drop policy if exists "zalogowany usuwa" on public.posts;
create policy "zalogowany usuwa"
  on public.posts for delete
  to authenticated
  using (true);

-- ── miejsce na zdjęcia wpisów ─────────────────────────────────
insert into storage.buckets (id, name, public)
values ('blog', 'blog', true)
on conflict (id) do nothing;

drop policy if exists "publiczny odczyt zdjęć bloga" on storage.objects;
create policy "publiczny odczyt zdjęć bloga"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'blog');

drop policy if exists "zalogowany wgrywa zdjęcia bloga" on storage.objects;
create policy "zalogowany wgrywa zdjęcia bloga"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'blog');

drop policy if exists "zalogowany usuwa zdjęcia bloga" on storage.objects;
create policy "zalogowany usuwa zdjęcia bloga"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'blog');
