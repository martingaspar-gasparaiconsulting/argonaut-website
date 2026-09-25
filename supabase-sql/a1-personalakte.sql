-- ============================================================================
-- ARGONAUT OS · Paket A1 — Personalakte + „Meine Unterlagen"
-- Zwei Teile, bewusst GETRENNT auszufuehren:
--
--   TEIL 1 (additiv, sperrt niemanden aus): zwei neue Spalten an hr_dokumente
--          und eine Regel, damit der Chef die Freigabe setzen darf.
--   TEIL 2 (schraenkt ein): Mitarbeiter sehen von ihren Personal-Dokumenten
--          nur noch, was der Chef freigegeben hat oder was sie selbst
--          hochgeladen haben. Bisher konnte ein Mitarbeiter technisch ALLE
--          Dateien seiner Akte abrufen (auch Lohn/Vertrag), obwohl die Seite
--          sie nicht angezeigt hat.
--
-- Beide Teile sind idempotent (mehrfach ausfuehrbar) und laufen je in einer
-- Transaktion: Bei einem Fehler bleibt alles wie vorher.
-- ============================================================================


-- ===================== TEIL 1 — additiv =====================================
begin;

alter table public.hr_dokumente
  add column if not exists fuer_mitarbeiter boolean not null default false;

-- Spalte OHNE Standardwert anlegen, sonst wuerden alle BESTEHENDEN Zeilen den
-- Wert des Ausfuehrenden bekommen. Der Standard gilt erst fuer neue Zeilen.
alter table public.hr_dokumente
  add column if not exists hochgeladen_von uuid;
alter table public.hr_dokumente
  alter column hochgeladen_von set default auth.uid();

comment on column public.hr_dokumente.fuer_mitarbeiter is
  'Paket A1: true = der Mitarbeiter sieht die Datei in Mein Bereich -> Meine Unterlagen. Standard false.';
comment on column public.hr_dokumente.hochgeladen_von is
  'Paket A1: wer die Datei hochgeladen hat (auth.uid). Eigene Uploads sieht der Mitarbeiter immer.';

-- Der Chef darf seine Dokumente aendern (fuer den Freigabe-Schalter).
drop policy if exists hrdok_update_own on public.hr_dokumente;
create policy hrdok_update_own on public.hr_dokumente
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

commit;


-- ===================== TEIL 2 — schraenkt Mitarbeiter ein =====================
-- Erst ausfuehren, wenn Teil 1 gelaufen ist.
begin;

drop policy if exists hrdok_select_self on public.hr_dokumente;
create policy hrdok_select_self on public.hr_dokumente
  for select
  using (
    mitarbeiter_id in (select m.id from public.mitarbeiter m where m.auth_user_id = auth.uid())
    and (fuer_mitarbeiter = true or hochgeladen_von = auth.uid())
  );

drop policy if exists hrbucket_select_self on storage.objects;
create policy hrbucket_select_self on storage.objects
  for select
  using (
    bucket_id = 'hr-dokumente'
    and (storage.foldername(name))[2] = 'mitarbeiter'
    and (storage.foldername(name))[3] in (
      select m.id::text from public.mitarbeiter m where m.auth_user_id = auth.uid()
    )
    and (
      -- selbst hochgeladen (z. B. Krankmeldung) — auch direkt beim Hochladen
      owner = auth.uid()
      -- oder vom Chef freigegeben
      or exists (
        select 1 from public.hr_dokumente d
        where d.storage_pfad = objects.name
          and (d.fuer_mitarbeiter = true or d.hochgeladen_von = auth.uid())
      )
    )
  );

commit;
