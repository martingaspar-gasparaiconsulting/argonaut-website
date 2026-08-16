-- ============================================================
-- ARGONAUT OS · Thema 6 · Batch-API (Schritt 1/4)
--
-- WORUM ES GEHT: Die Stapel-Schnittstelle von Anthropic kostet die HAELFTE,
-- liefert dafuer nicht sofort, sondern spaeter (meist unter einer Stunde,
-- garantiert innerhalb von 24 Stunden). Deshalb wird sie hier nicht heimlich
-- untergeschoben, sondern angeboten: "Jetzt sofort" oder "Ueber Nacht — halber
-- Preis". Wer 50 Social-Beitraege fuer den Monat plant, wartet gern.
--
-- Diese Tabelle ist die Bruecke ueber die Wartezeit. Ohne sie waere nach dem
-- Absenden vergessen, WOFUER der Stapel war und wohin die Ergebnisse gehoeren.
--
-- Das Feld `zuordnung` ist der Kern: die Batch-Schnittstelle gibt jede Antwort
-- unter der `custom_id` zurueck, die wir mitgeschickt haben. Hier steht,
-- welche custom_id zu welchem Vorgang gehoert.
--
-- Nicht-brechend · idempotent · RLS wie die uebrigen Module.
-- ============================================================

create table if not exists public.ki_batch (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null,
  route            text not null,                    -- content-fliessband | beleg-stapel | ...
  zweck            text,                             -- Klartext fuer die Anzeige
  extern_id        text,                             -- die Batch-ID bei Anthropic (msgbatch_...)
  status           text not null default 'wartet',   -- wartet | laeuft | fertig | teilweise | fehler | abgebrochen
  anzahl           integer not null default 0,
  fertig_anzahl    integer not null default 0,
  fehler_anzahl    integer not null default 0,
  zuordnung        jsonb not null default '{}'::jsonb, -- custom_id -> wohin das Ergebnis gehoert
  ergebnis         jsonb not null default '{}'::jsonb, -- custom_id -> Antworttext
  fehler_text      text,
  abgeholt_am      timestamptz,
  erstellt_am      timestamptz not null default now(),
  beendet_am       timestamptz
);
create index if not exists ki_batch_idx on public.ki_batch (owner_user_id, erstellt_am desc);
-- Der Motor sucht genau danach: was ist noch offen?
create index if not exists ki_batch_offen_idx on public.ki_batch (status) where status in ('wartet', 'laeuft');

alter table public.ki_batch enable row level security;

drop policy if exists kb_select on public.ki_batch;
create policy kb_select on public.ki_batch for select to public using ((auth.uid() = owner_user_id));
drop policy if exists kb_select_ma on public.ki_batch;
create policy kb_select_ma on public.ki_batch for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kb_insert on public.ki_batch;
create policy kb_insert on public.ki_batch for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists kb_update on public.ki_batch;
create policy kb_update on public.ki_batch for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kb_delete on public.ki_batch;
create policy kb_delete on public.ki_batch for delete to public using ((auth.uid() = owner_user_id));

-- Andockpunkt: Social-Beitraege, die aus einem Stapel stammen, tragen die
-- Batch-ID — dann laesst sich im Nachhinein sehen, woher ein Entwurf kam.
alter table public.social_beitrag add column if not exists ki_batch_id uuid;
