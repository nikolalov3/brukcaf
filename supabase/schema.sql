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

-- ══════════════════════════════════════════════════════════════
-- KAWY — "Dziś w młynku". Filip dodaje kawę, zaznacza dostępność
-- i poziom (1–5 ziarenek). Kolejność na stronie przez sort.
-- ══════════════════════════════════════════════════════════════
create table if not exists public.coffees (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- np. "HAYB Yellow"
  kind        text not null default 'kawa'   -- 'kawa' albo 'herbata' (ta sama karta, osobna sekcja)
              check (kind in ('kawa', 'herbata')),
  origin      text,                          -- pochodzenie / palarnia
  method      text,                          -- metoda parzenia: espresso / V60 / itd.
  obrobka     text,                          -- metoda obróbki ziaren: myta / naturalna / honey
  note        text,                          -- krótki opis smaku
  link_url    text,                          -- link do produktu (palarnia/sklep); nazwa staje się linkiem + sameAs w schemie
  photo_url   text,                          -- zdjęcie 1 (główne)
  photo_url2  text,                          -- zdjęcie 2 (po najechaniu / cykl na mobile)
  level       int  default 3,                -- (wycofane z UI; kolumna zostaje dla starych wierszy)
  available   boolean not null default true, -- czy teraz w młynku
  sort        int  not null default 0,       -- kolejność wyświetlania
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- dla istniejącej bazy: dołóż kolumnę rodzaju (kawa/herbata)
alter table public.coffees add column if not exists kind text not null default 'kawa';

create index if not exists coffees_widoczne_idx on public.coffees (available, sort);
create index if not exists coffees_rodzaj_idx on public.coffees (kind, sort);

drop trigger if exists coffees_updated_at on public.coffees;
create trigger coffees_updated_at
  before update on public.coffees
  for each row execute function public.dotknij_updated_at();

alter table public.coffees enable row level security;

drop policy if exists "publiczny odczyt dostępnych kaw" on public.coffees;
create policy "publiczny odczyt dostępnych kaw"
  on public.coffees for select to anon, authenticated using (available = true);

drop policy if exists "zalogowany widzi wszystkie kawy" on public.coffees;
create policy "zalogowany widzi wszystkie kawy"
  on public.coffees for select to authenticated using (true);

drop policy if exists "zalogowany zarządza kawami" on public.coffees;
create policy "zalogowany zarządza kawami"
  on public.coffees for all to authenticated using (true) with check (true);

-- ══════════════════════════════════════════════════════════════
-- STANY — live menu. Filip zaznacza, ile zostało (np. ciast).
-- status: dostępne / mało / wyprzedane. Napędza znacznik na stronie.
-- ══════════════════════════════════════════════════════════════
create table if not exists public.stock_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- np. "Sernik baskijski"
  status      text not null default 'available'
              check (status in ('available', 'low', 'sold_out')),
  note        text,
  photo_url   text,                          -- zdjęcie 1 (na kafel)
  photo_url2  text,                          -- zdjęcia 2-4 pokazują się w story
  photo_url3  text,
  photo_url4  text,
  sort        int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists stock_widoczne_idx on public.stock_items (sort);

drop trigger if exists stock_updated_at on public.stock_items;
create trigger stock_updated_at
  before update on public.stock_items
  for each row execute function public.dotknij_updated_at();

alter table public.stock_items enable row level security;

drop policy if exists "publiczny odczyt stanów" on public.stock_items;
create policy "publiczny odczyt stanów"
  on public.stock_items for select to anon, authenticated using (true);

drop policy if exists "zalogowany zarządza stanami" on public.stock_items;
create policy "zalogowany zarządza stanami"
  on public.stock_items for all to authenticated using (true) with check (true);

-- ── MENU (karta lokalu) ─────────────────────────────────────────
create table if not exists public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  sekcja      text not null,                 -- np. "Kawa", "Herbata i matcha"
  sekcja_sort int  not null default 0,       -- kolejność sekcji
  nazwa       text not null,
  cena        text,                          -- "12 zł" (tekst; bywa "2 zł", zakresy)
  sklad       text,                          -- opcjonalny opis pozycji
  dieta       text,                          -- null / 'vegan' / 'wege'
  sort        int  not null default 0,       -- kolejność w sekcji
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists menu_kolejnosc_idx on public.menu_items (sekcja_sort, sort);

drop trigger if exists menu_updated_at on public.menu_items;
create trigger menu_updated_at
  before update on public.menu_items
  for each row execute function public.dotknij_updated_at();

alter table public.menu_items enable row level security;

drop policy if exists "publiczny odczyt menu" on public.menu_items;
create policy "publiczny odczyt menu"
  on public.menu_items for select to anon, authenticated using (true);

drop policy if exists "zalogowany zarządza menu" on public.menu_items;
create policy "zalogowany zarządza menu"
  on public.menu_items for all to authenticated using (true) with check (true);
