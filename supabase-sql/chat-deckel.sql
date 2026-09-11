-- ============================================================
-- ARGONAUT OS · Mengengrenze für den öffentlichen Berater
-- Additiv · idempotent · NICHT destruktiv
--
-- WARUM
-- Der öffentliche Chat auf Kundenwebsites lief bis zum 11.09.2026 OHNE jede
-- Mengenbegrenzung. Die drei Kostenbremsen in lib/ki.ts greifen alle nur
-- `if (userId)` — ein Website-Besucher ist nicht eingeloggt. Ein Gespräch
-- kostet rund 1,9 Cent; 20.000 Gespräche im Monat sind über 300 €.
--
-- DIE STUFEN (Martin, 11.09.2026)
--   klein        49 €   bis 1.000 Gespräche im Monat
--   gross        99 €   bis 3.000 Gespräche im Monat
--   individuell   —     keine technische Grenze, frei vereinbart
--
-- Beide Tabellen werden AUSSCHLIESSLICH vom Server mit dem Service-Role-
-- Schlüssel beschrieben. RLS ist an, es gibt bewusst KEINE Policies —
-- dasselbe Muster wie bei dossier_leads.
-- ============================================================


-- 1) Welche Stufe hat welcher Betrieb -------------------------------------
create table if not exists public.chat_tarif (
  owner_user_id  uuid primary key,
  stufe          text        not null default 'klein',
  notiz          text,
  geaendert_am   timestamptz not null default now()
);

comment on table public.chat_tarif is
  'Gebuchte Stufe des oeffentlichen Beraters je Betrieb. Ohne Zeile gilt „klein" (1.000 Gespraeche).';

alter table public.chat_tarif enable row level security;
-- Bewusst keine Policies: nur der Service-Role-Schluessel liest und schreibt.


-- 2) Verbrauch je Betrieb und Monat ---------------------------------------
create table if not exists public.chat_verbrauch (
  owner_user_id  uuid        not null,
  monat          date        not null,     -- immer der Monatserste
  anzahl         integer     not null default 0,
  gewarnt_am     timestamptz,              -- 80 % erreicht, Betreiber informiert
  gesperrt_seit  timestamptz,              -- Grenze erreicht, Besucher sehen den Hinweis
  primary key (owner_user_id, monat)
);

comment on table public.chat_verbrauch is
  'Gespraeche des oeffentlichen Beraters je Betrieb und Monat. Kein Personenbezug: '
  'gezaehlt wird der BETRIEB, nie ein Besucher. Keine IP, kein Zeitstempel je Gespraech.';

create index if not exists chat_verbrauch_monat_idx
  on public.chat_verbrauch (monat desc, anzahl desc);

alter table public.chat_verbrauch enable row level security;
-- Bewusst keine Policies: nur der Service-Role-Schluessel liest und schreibt.


-- 3) Atomar hochzählen ------------------------------------------------------
-- Zwei Besucher koennen gleichzeitig schreiben. Ein „lesen, plus eins, spei-
-- chern" aus der Anwendung heraus wuerde dabei Gespraeche verlieren. Deshalb
-- eine Funktion, die den neuen Stand in EINEM Schritt bildet und zurueckgibt.
create or replace function public.chat_verbrauch_hoch(p_owner uuid, p_monat date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neu integer;
begin
  insert into public.chat_verbrauch (owner_user_id, monat, anzahl)
  values (p_owner, p_monat, 1)
  on conflict (owner_user_id, monat)
  do update set anzahl = public.chat_verbrauch.anzahl + 1
  returning anzahl into v_neu;

  return v_neu;
end;
$$;

comment on function public.chat_verbrauch_hoch(uuid, date) is
  'Zaehlt ein Gespraech des oeffentlichen Beraters hoch und gibt den neuen Monatsstand zurueck. Atomar.';


-- 4) Merker setzen, ohne den Zaehler anzufassen -----------------------------
create or replace function public.chat_verbrauch_merker(
  p_owner uuid, p_monat date, p_gewarnt boolean, p_gesperrt boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_verbrauch
     set gewarnt_am    = case when p_gewarnt  and gewarnt_am    is null then now() else gewarnt_am    end,
         gesperrt_seit = case when p_gesperrt and gesperrt_seit is null then now() else gesperrt_seit end
   where owner_user_id = p_owner and monat = p_monat;
end;
$$;

comment on function public.chat_verbrauch_merker(uuid, date, boolean, boolean) is
  'Setzt gewarnt_am / gesperrt_seit EINMALIG. Ein bereits gesetzter Zeitpunkt bleibt stehen.';


-- ============================================================
-- FERTIG. Zum Nachsehen, wer wie viel verbraucht:
--
--   select t.stufe, v.*
--     from public.chat_verbrauch v
--     left join public.chat_tarif t on t.owner_user_id = v.owner_user_id
--    where v.monat = date_trunc('month', now())::date
--    order by v.anzahl desc;
--
-- Eine Stufe setzen:
--   insert into public.chat_tarif (owner_user_id, stufe)
--   values ('<uuid>', 'gross')
--   on conflict (owner_user_id) do update
--     set stufe = excluded.stufe, geaendert_am = now();
-- ============================================================
