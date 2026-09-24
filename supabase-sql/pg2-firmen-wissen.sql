-- ============================================================
-- ARGONAUT OS · Paket PG Teil 2 · Firmen-Wissen fuers Team — Stand 24.09.2026
--
-- Mitarbeiter sollen im Wissens-Chat die Firmendokumente finden, die der
-- Chef AUSDRUECKLICH freigibt — sonst nichts.
--
--   documents.fuer_team   neuer Schalter, Standard FALSE (nichts freigegeben)
--   2 neue LESE-Regeln    Mitarbeiter lesen Dokumente und Textabschnitte des
--                         Chefs NUR, wenn fuer_team = true
--
-- ADDITIV UND IDEMPOTENT. Bestehende Regeln ("Eigene ...") bleiben unberuehrt.
-- Mitarbeiter bekommen KEIN Aendern und KEIN Loeschen.
-- Die Suchfunktion match_document_chunks ist "normal" (kein Sonderrecht),
-- also greifen diese Regeln auch in der Suche.
-- ============================================================

alter table public.documents add column if not exists fuer_team boolean not null default false;

create index if not exists documents_team_idx on public.documents (user_id) where fuer_team;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='Team liest freigegebene Dokumente') then
    create policy "Team liest freigegebene Dokumente" on public.documents for select to authenticated
      using (fuer_team = true and user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='document_chunks' and policyname='Team liest freigegebene Chunks') then
    create policy "Team liest freigegebene Chunks" on public.document_chunks for select to authenticated
      using (
        user_id = mein_chef_id()
        and exists (select 1 from public.documents d where d.id = document_chunks.document_id and d.fuer_team = true)
      );
  end if;
end $$;

-- ------------------------------------------------------------
-- Ergebnis in EINER Tabelle. Danach NUR LESEN (aendert nichts):
-- ob die Dokumente ueberhaupt ausgelesen werden (Status, Abschnitte).
-- ------------------------------------------------------------
select '1 spalte' as art, 'documents.fuer_team' as name,
       coalesce((select data_type from information_schema.columns
                 where table_schema='public' and table_name='documents' and column_name='fuer_team'), 'FEHLT') as inhalt
union all
select '2 regel', policyname::text, cmd::text from pg_policies
where schemaname='public' and policyname in ('Team liest freigegebene Dokumente', 'Team liest freigegebene Chunks')
union all
select '3 status', coalesce(status, '(leer)'), count(*)::text from public.documents group by status
union all
select '4 abschnitte', 'document_chunks gesamt', count(*)::text from public.document_chunks
union all
select '5 ohne abschnitte', 'Dokumente ohne einen einzigen Abschnitt',
       count(*)::text from public.documents d
       where not exists (select 1 from public.document_chunks c where c.document_id = d.id)
order by 1, 2;
