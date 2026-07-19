-- ============================================================
-- ARGONAUT OS · Welle 5 · Schritt 1b — GoBD-Aufbewahrung für Signaturen
-- Signierte Dokumente sind aufbewahrungspflichtig & revisionssicher:
--   · aufbewahrung_jahre  — Standard 10, je Dokument auf 6/8 verkürzbar (wo zulässig)
--   · loeschbar_ab        — wird beim Signieren gesetzt (signiert_am + Jahre + 1 Tag)
--   · archiv_html         — eingefrorenes Original (unveränderbar, für stabiles PDF)
--   · storniert           — signierte Docs werden storniert, nicht gelöscht
-- Idempotent.
-- ============================================================

alter table signatur_anfragen add column if not exists aufbewahrung_jahre integer not null default 10;
alter table signatur_anfragen add column if not exists loeschbar_ab date;
alter table signatur_anfragen add column if not exists archiv_html text;
alter table signatur_anfragen add column if not exists storniert boolean not null default false;
alter table signatur_anfragen add column if not exists storniert_grund text;

create index if not exists idx_signatur_loeschreife on signatur_anfragen (owner_user_id, loeschbar_ab) where status = 'signiert';
