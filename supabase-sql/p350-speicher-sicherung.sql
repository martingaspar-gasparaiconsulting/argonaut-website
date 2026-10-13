-- ============================================================
-- ARGONAUT OS · Paket 350 (13.10.2026) · A2 Datei-Sicherung des Speichers
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- speicher_sicherung_datei:  je Datei im Speicher, was wann gesichert wurde
--                            (Prüfsumme des Klartexts, Fehler, Versuche,
--                            seit wann sie in der Quelle fehlt).
-- speicher_sicherung_lauf:   jeder Durchgang (Sicherung, Abgleich, Probe,
--                            Notfall-Wiederherstellung) mit Zahlen.
-- speicher_sicherung_stand:  eine Zeile: wo der letzte Durchgang aufgehört
--                            hat (Cursor) und die Sperre gegen Doppel-Läufe.
-- Bucket sicherung-probe:    privat, nur für die Probe-Wiederherstellung.
--
-- Zugriff NUR über den Server (Service-Rolle). Angemeldete Nutzer und
-- Besucher haben keine Rechte und keine Regel — sie sehen nichts davon.
-- Kein Aussperr-Risiko: nur neue Tabellen und Funktionen.
-- ============================================================

-- TEIL 1 von 4: Tabellen
create table if not exists public.speicher_sicherung_datei (
  bucket             text not null,
  name               text not null,
  groesse            bigint,
  quelle_etag        text,
  quelle_geaendert   timestamptz,
  typ                text,
  sha256             text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  schluessel_kennung text check (schluessel_kennung is null or char_length(schluessel_kennung) <= 20),
  gesichert_am       timestamptz,
  fehlt_seit         timestamptz,
  fehler             text check (fehler is null or char_length(fehler) <= 500),
  versuche           integer not null default 0 check (versuche between 0 and 100),
  primary key (bucket, name)
);
create index if not exists speicher_sicherung_datei_fehler_idx on public.speicher_sicherung_datei (versuche) where fehler is not null;

create table if not exists public.speicher_sicherung_lauf (
  id            uuid primary key default gen_random_uuid(),
  art           text not null check (art in ('sicherung', 'abgleich', 'probe', 'wiederherstellung')),
  ausgeloest    text not null default 'zeitplan' check (ausgeloest in ('zeitplan', 'betreiber')),
  gestartet_am  timestamptz not null default now(),
  beendet_am    timestamptz,
  dateien       integer not null default 0,
  bytes         bigint not null default 0,
  fehler        integer not null default 0,
  geloescht     integer not null default 0,
  ok            boolean,
  meldung       text check (meldung is null or char_length(meldung) <= 1000)
);
create index if not exists speicher_sicherung_lauf_idx on public.speicher_sicherung_lauf (art, gestartet_am desc);

create table if not exists public.speicher_sicherung_stand (
  id              integer primary key default 1 check (id = 1),
  cursor_zeit     timestamptz,
  cursor_bucket   text,
  cursor_name     text,
  laeuft_bis      timestamptz,
  letzter_abgleich timestamptz,
  aktualisiert_am timestamptz not null default now()
);
insert into public.speicher_sicherung_stand (id) values (1) on conflict (id) do nothing;

alter table public.speicher_sicherung_datei enable row level security;
alter table public.speicher_sicherung_lauf enable row level security;
alter table public.speicher_sicherung_stand enable row level security;
revoke all on public.speicher_sicherung_datei, public.speicher_sicherung_lauf, public.speicher_sicherung_stand from anon, authenticated;
grant select, insert, update, delete on public.speicher_sicherung_datei, public.speicher_sicherung_lauf, public.speicher_sicherung_stand to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('sicherung-probe', 'sicherung-probe', false, 52428800)
on conflict (id) do nothing;

-- TEIL 2 von 4: Dateien im Speicher lesen (Cursor) und Fehler-Wiederholung
create or replace function public.speicher_objekte_seit(p_ab timestamptz, p_bucket text, p_name text, p_limit integer)
returns table (bucket text, name text, geaendert timestamptz, groesse bigint, etag text, typ text)
language sql stable security definer set search_path to '' as $$
  select o.bucket_id::text, o.name, coalesce(o.updated_at, o.created_at),
         case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint end,
         o.metadata->>'eTag', o.metadata->>'mimetype'
  from storage.objects o
  where o.name is not null and o.bucket_id <> 'sicherung-probe'
    and (coalesce(o.updated_at, o.created_at), o.bucket_id::text, o.name)
        > (coalesce(p_ab, '-infinity'::timestamptz), coalesce(p_bucket, ''), coalesce(p_name, ''))
  order by 3, 1, 2
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$$;

create or replace function public.speicher_sicherung_wiederholen(p_limit integer, p_max_versuche integer)
returns table (bucket text, name text, geaendert timestamptz, groesse bigint, etag text, typ text)
language sql stable security definer set search_path to '' as $$
  select o.bucket_id::text, o.name, coalesce(o.updated_at, o.created_at),
         case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint end,
         o.metadata->>'eTag', o.metadata->>'mimetype'
  from public.speicher_sicherung_datei d
  join storage.objects o on o.bucket_id = d.bucket and o.name = d.name
  where d.fehler is not null and d.versuche < p_max_versuche
  order by d.versuche, d.name
  limit least(greatest(coalesce(p_limit, 50), 1), 500);
$$;

create or replace function public.speicher_sicherung_stichprobe(p_anzahl integer)
returns setof public.speicher_sicherung_datei
language sql volatile security definer set search_path to '' as $$
  select * from public.speicher_sicherung_datei
  where fehler is null and sha256 is not null and fehlt_seit is null and gesichert_am is not null
  order by random()
  limit least(greatest(coalesce(p_anzahl, 10), 1), 50);
$$;

-- TEIL 3 von 4: Sperre, Abgleich gelöschter Dateien, Zahlen
create or replace function public.speicher_sicherung_sperre(p_sekunden integer)
returns boolean language plpgsql security definer set search_path to '' as $$
begin
  insert into public.speicher_sicherung_stand (id) values (1) on conflict (id) do nothing;
  update public.speicher_sicherung_stand
     set laeuft_bis = now() + make_interval(secs => least(greatest(p_sekunden, 30), 900)), aktualisiert_am = now()
   where id = 1 and (laeuft_bis is null or laeuft_bis < now());
  return found;
end;
$$;

create or replace function public.speicher_sicherung_frei()
returns void language sql security definer set search_path to '' as $$
  update public.speicher_sicherung_stand set laeuft_bis = null, aktualisiert_am = now() where id = 1;
$$;

-- Markiert Dateien, die in der Quelle fehlen (fehlt_seit), nimmt die Markierung
-- zurück, wenn sie wieder da sind, und liefert die, die länger als p_tage fehlen.
create or replace function public.speicher_sicherung_abgleich(p_tage integer)
returns table (bucket text, name text)
language plpgsql security definer set search_path to '' as $$
begin
  update public.speicher_sicherung_datei d set fehlt_seit = now()
   where d.fehlt_seit is null
     and not exists (select 1 from storage.objects o where o.bucket_id = d.bucket and o.name = d.name);
  update public.speicher_sicherung_datei d set fehlt_seit = null
   where d.fehlt_seit is not null
     and exists (select 1 from storage.objects o where o.bucket_id = d.bucket and o.name = d.name);
  update public.speicher_sicherung_stand set letzter_abgleich = now(), aktualisiert_am = now() where id = 1;
  return query
    select d.bucket, d.name from public.speicher_sicherung_datei d
     where d.fehlt_seit < now() - make_interval(days => greatest(p_tage, 7))
     order by d.fehlt_seit limit 500;
end;
$$;

create or replace function public.speicher_sicherung_zahlen()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'quelle_dateien', (select count(*) from storage.objects o where o.name is not null and o.bucket_id <> 'sicherung-probe'),
    'quelle_bytes', (select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint end), 0)
                       from storage.objects o where o.name is not null and o.bucket_id <> 'sicherung-probe'),
    'gesichert', (select count(*) from public.speicher_sicherung_datei where sha256 is not null and fehlt_seit is null),
    'gesichert_bytes', (select coalesce(sum(groesse), 0) from public.speicher_sicherung_datei where sha256 is not null and fehlt_seit is null),
    'offen', (select count(*) from storage.objects o
                left join public.speicher_sicherung_datei d on d.bucket = o.bucket_id and d.name = o.name
               where o.name is not null and o.bucket_id <> 'sicherung-probe'
                 and (d.bucket is null or d.sha256 is null or d.quelle_etag is distinct from o.metadata->>'eTag')),
    'fehler', (select count(*) from public.speicher_sicherung_datei where fehler is not null and versuche < 5),
    'dauerhaft', (select count(*) from public.speicher_sicherung_datei where fehler is not null and versuche >= 5),
    'fehlend', (select count(*) from public.speicher_sicherung_datei where fehlt_seit is not null)
  );
$$;

-- TEIL 4 von 4: Rechte (nur Server) und KONTROLLE
revoke all on function public.speicher_objekte_seit(timestamptz, text, text, integer) from public, anon, authenticated;
revoke all on function public.speicher_sicherung_wiederholen(integer, integer) from public, anon, authenticated;
revoke all on function public.speicher_sicherung_stichprobe(integer) from public, anon, authenticated;
revoke all on function public.speicher_sicherung_sperre(integer) from public, anon, authenticated;
revoke all on function public.speicher_sicherung_frei() from public, anon, authenticated;
revoke all on function public.speicher_sicherung_abgleich(integer) from public, anon, authenticated;
revoke all on function public.speicher_sicherung_zahlen() from public, anon, authenticated;
grant execute on function public.speicher_objekte_seit(timestamptz, text, text, integer) to service_role;
grant execute on function public.speicher_sicherung_wiederholen(integer, integer) to service_role;
grant execute on function public.speicher_sicherung_stichprobe(integer) to service_role;
grant execute on function public.speicher_sicherung_sperre(integer) to service_role;
grant execute on function public.speicher_sicherung_frei() to service_role;
grant execute on function public.speicher_sicherung_abgleich(integer) to service_role;
grant execute on function public.speicher_sicherung_zahlen() to service_role;

-- Erwartung: tabellen = 3 | funktionen = 7 | rls_an = 3 | rechte_nutzer = 0 | probe_bucket = 1
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('speicher_sicherung_datei', 'speicher_sicherung_lauf', 'speicher_sicherung_stand')) as tabellen,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('speicher_objekte_seit', 'speicher_sicherung_wiederholen', 'speicher_sicherung_stichprobe', 'speicher_sicherung_sperre', 'speicher_sicherung_frei', 'speicher_sicherung_abgleich', 'speicher_sicherung_zahlen')) as funktionen,
  (select count(*) from pg_class where relname in ('speicher_sicherung_datei', 'speicher_sicherung_lauf', 'speicher_sicherung_stand') and relrowsecurity) as rls_an,
  ((select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name like 'speicher_sicherung_%' and grantee in ('anon', 'authenticated'))
   + (select count(*) from information_schema.routine_privileges where routine_schema = 'public' and (routine_name like 'speicher_sicherung_%' or routine_name = 'speicher_objekte_seit') and grantee in ('anon', 'authenticated', 'PUBLIC'))) as rechte_nutzer,
  (select count(*) from storage.buckets where id = 'sicherung-probe') as probe_bucket;
