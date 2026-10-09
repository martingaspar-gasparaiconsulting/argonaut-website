-- ============================================================================
-- ARGONAUT OS · Paket 287 (09.10.2026) · RF1 Rechts-Freigaben-Zentrale
--
--   rechts_freigabe            eine Zeile je Betrieb und heikler Funktion:
--                              Fassung, bestaetigte Haekchen, Betriebsrat,
--                              Zweck, Anbieter, wer/wann, gueltig bis,
--                              widerrufen am/von
--   rechts_freigabe_protokoll  jede Freigabe und jeder Widerruf (Nachweis),
--                              nicht aenderbar, nicht loeschbar
--   rechts_freigabe_aktiv()    gilt die Freigabe fuer den EIGENEN Betrieb
--                              (Chef bzw. mein_chef_id) in dieser Fassung?
--
-- NEU, sonst nichts. Mehrfach ausfuehrbar. Beide Tabellen liest und schreibt
-- nur der Server (RLS an, keine Regel fuer Nutzer).
-- AUSSPERR-RISIKO: keines. Es wird nichts bestehendes geaendert.
-- ============================================================================

begin;

create table if not exists public.rechts_freigabe (
  owner_user_id   uuid not null,
  funktion        text not null check (funktion ~ '^[a-z_]{2,40}$'),
  fassung         text not null check (char_length(fassung) between 1 and 40),
  haken           jsonb not null default '[]'::jsonb check (jsonb_typeof(haken) = 'array'),
  betriebsrat     text check (betriebsrat in ('einbezogen', 'keiner')),
  zweck           text check (char_length(zweck) <= 300),
  dienstleister   text check (char_length(dienstleister) <= 120),
  bestaetigt_von  uuid not null,
  bestaetigt_name text check (char_length(bestaetigt_name) <= 120),
  bestaetigt_am   timestamptz not null,
  gueltig_bis     timestamptz not null,
  widerrufen_am   timestamptz,
  widerrufen_von  uuid,
  geaendert_am    timestamptz not null default now(),
  primary key (owner_user_id, funktion),
  check (gueltig_bis > bestaetigt_am)
);
alter table public.rechts_freigabe enable row level security;

create table if not exists public.rechts_freigabe_protokoll (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  funktion       text not null,
  aktion         text not null check (aktion in ('freigegeben', 'widerrufen')),
  fassung        text,
  haken          jsonb,
  betriebsrat    text,
  zweck          text,
  dienstleister  text,
  gueltig_bis    timestamptz,
  durch_user_id  uuid not null,
  durch_name     text,
  zeit           timestamptz not null default now()
);
create index if not exists rechts_freigabe_protokoll_idx on public.rechts_freigabe_protokoll (owner_user_id, funktion, zeit desc);
alter table public.rechts_freigabe_protokoll enable row level security;

-- Nachweis bleibt: auch der Server kann Protokoll-Eintraege nicht aendern oder loeschen.
create or replace function public.p287_protokoll_sperre()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Das Freigabe-Protokoll ist ein Nachweis und kann nicht geaendert oder geloescht werden.';
end;
$$;

drop trigger if exists p287_protokoll_sperre_trg on public.rechts_freigabe_protokoll;
create trigger p287_protokoll_sperre_trg
  before update or delete on public.rechts_freigabe_protokoll
  for each row execute function public.p287_protokoll_sperre();

create or replace function public.rechts_freigabe_aktiv(p_funktion text, p_fassung text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;
  return exists (
    select 1
      from public.rechts_freigabe r
     where r.owner_user_id = coalesce(public.mein_chef_id(), v_uid)
       and r.funktion = p_funktion
       and r.fassung = p_fassung
       and r.widerrufen_am is null
       and r.gueltig_bis > now()
  );
end;
$$;

revoke all on function public.rechts_freigabe_aktiv(text, text) from public, anon;
grant execute on function public.rechts_freigabe_aktiv(text, text) to authenticated, service_role;
revoke all on function public.p287_protokoll_sperre() from public, anon, authenticated;

commit;

-- KONTROLLE (nur lesen) — Erwartung: true | true | false | true | 1 | 0
select to_regclass('public.rechts_freigabe') is not null as tabelle,
       to_regclass('public.rechts_freigabe_protokoll') is not null as protokoll,
       has_function_privilege('anon', 'public.rechts_freigabe_aktiv(text, text)', 'execute') as anon_darf,
       has_function_privilege('authenticated', 'public.rechts_freigabe_aktiv(text, text)', 'execute') as angemeldet_darf,
       (select count(*) from pg_trigger where tgname = 'p287_protokoll_sperre_trg') as sperre,
       (select count(*) from pg_policies where schemaname = 'public' and tablename in ('rechts_freigabe', 'rechts_freigabe_protokoll')) as regeln;
