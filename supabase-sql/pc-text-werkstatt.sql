-- ============================================================
-- ARGONAUT OS · Paket PC · Text-Werkstatt — Tabelle text_werk
-- Stand: 24.09.2026
--
-- Speichert Entwuerfe aus der Text-Werkstatt (E-Book, Ratgeber, Presse,
-- Strategie). eingabe = was der Nutzer eingegeben hat, inhalt = der Text.
-- web_slug = die angelegte Ratgeber-Seite in web_seiten (falls vorhanden).
--
-- ADDITIV UND IDEMPOTENT: neue Tabelle, nichts Bestehendes angefasst.
-- RLS: jeder Nutzer sieht und aendert nur seine eigenen Texte.
-- ============================================================

create table if not exists public.text_werk (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  art             text not null check (art in ('ebook', 'ratgeber', 'presse', 'strategie')),
  titel           text not null,
  eingabe         jsonb not null default '{}'::jsonb,
  inhalt          jsonb not null default '{}'::jsonb,
  status          text not null default 'entwurf' check (status in ('entwurf', 'geprueft')),
  web_slug        text,
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);

create index if not exists text_werk_owner_idx on public.text_werk (owner_user_id, aktualisiert_am desc);

alter table public.text_werk enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'text_werk' and policyname = 'text_werk_eigene') then
    create policy text_werk_eigene on public.text_werk
      for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
end $$;

select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'text_werk';
