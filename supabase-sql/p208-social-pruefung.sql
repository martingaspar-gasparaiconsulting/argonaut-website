-- ============================================================
-- ARGONAUT OS · Paket 208 (05.10.2026) · Stufe 3 B1 Social-Baustein
--
-- Befund: KI-Entwürfe aus dem Content-Fließband konnten ungeprüft gepostet
-- oder eingeplant werden (Art. 50 Abs. 4 KI-VO — redaktionelle Verantwortung).
-- Neu: Kennzeichen „KI-Entwurf" und Prüf-Nachweis (wann, wer) je Beitrag.
-- Der Server postet/plant einen KI-Entwurf erst nach der Prüf-Bestätigung.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht.
-- Nachtrag: bestehende ENTWÜRFE aus dem KI-Stapel (ki_batch_id gesetzt)
-- werden als KI-Entwurf markiert. Bereits eingeplante oder gesendete
-- Beiträge bleiben unverändert (nichts Geplantes wird angehalten).
-- AUSSPERR-RISIKO: keines.
--
-- RÜCKWEG (nur im Notfall): alter table public.social_beitrag
--   drop column ki_entwurf, drop column geprueft_am, drop column geprueft_von;
-- ============================================================

alter table public.social_beitrag add column if not exists ki_entwurf boolean not null default false;
alter table public.social_beitrag add column if not exists geprueft_am timestamptz;
alter table public.social_beitrag add column if not exists geprueft_von uuid;

update public.social_beitrag
   set ki_entwurf = true
 where ki_batch_id is not null
   and ki_entwurf = false
   and status = 'entwurf'
   and geprueft_am is null;

comment on column public.social_beitrag.ki_entwurf is 'Paket 208: Text stammt von der KI — vor dem Posten/Einplanen pruefen.';
comment on column public.social_beitrag.geprueft_am is 'Paket 208: wann ein Mensch den KI-Entwurf geprueft hat (Textaenderung hebt auf).';

-- Kontrolle: neue_spalten = 3 · ki_entwuerfe_offen = Anzahl ungeprüfter KI-Entwürfe (Info) · geplant_ungeprueft (Info, laufen weiter)
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'social_beitrag'
       and column_name in ('ki_entwurf', 'geprueft_am', 'geprueft_von')) as neue_spalten,
  (select count(*) from public.social_beitrag where ki_entwurf and geprueft_am is null and status = 'entwurf') as ki_entwuerfe_offen,
  (select count(*) from public.social_beitrag where ki_batch_id is not null and status = 'geplant') as geplant_aus_ki_info;
