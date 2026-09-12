-- ============================================================
-- ARGONAUT OS · Steht in den offenen Tabellen ein Geheimnis?
-- Stand: 12.09.2026 · gehoert zu Punkt 2.6
--
-- WOZU
-- Die vier offenen Tabellen enthalten keine Mandantenspalte — es sind
-- Katalogdaten, keine Kundendaten. Damit ist die Mandantentrennung nicht
-- verletzt.
--
-- Eine Spalte faellt trotzdem auf: `agents.n8n_webhook_url`. Eine
-- Webhook-URL ist kein Inhalt, sondern ein Schluessel: Wer sie kennt, kann
-- den Ablauf dahinter ausloesen. Da `agents_read_all` fuer die Rolle
-- `public` gilt, waere so eine URL fuer jeden abrufbar, der den
-- anon-Schluessel aus dem Browser-Bundle nimmt.
--
-- Diese Abfrage zeigt NICHT die ganzen URLs, sondern nur, ob welche
-- befuellt sind, und vom ersten Treffer die ersten 30 Zeichen. Das reicht
-- zur Bewertung und schreibt kein Geheimnis in den Chat.
--
-- DIESE ABFRAGE LIEST NUR. Sie aendert, legt an und loescht nichts.
-- ============================================================

select 'agents · wie viele Zeilen haben eine Webhook-URL' as frage,
       (select count(*) from agents
         where coalesce(btrim(n8n_webhook_url), '') <> '')::text as antwort
union all
select 'agents · Anfang der ersten URL (zur Einordnung)',
       coalesce((
         select left(n8n_webhook_url, 30) || ' …'
         from agents
         where coalesce(btrim(n8n_webhook_url), '') <> ''
         limit 1
       ), '— keine einzige befuellt')
union all
select 'agents · welche Status kommen vor',
       coalesce((select string_agg(distinct coalesce(status, '—'), ' · ')
                 from agents), '— leer')
union all
select 'betreiber_flags · Inhalt (1 Zeile)',
       coalesce((select string_agg(schluessel || ' = ' || coalesce(wert, '—'), ' · ')
                 from betreiber_flags), '— leer')
union all
select 'automatisierungen · Beispiel-Workflowname',
       coalesce((select workflow_name from automatisierungen
                 order by id limit 1), '— leer');
