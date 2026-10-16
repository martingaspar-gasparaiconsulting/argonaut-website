#!/bin/bash
# Pruefung Paket 384 (LK7 Wartungstermine). Aufruf: pruefung-p384.sh <db aus Vorlage>
DB=${1:-t384}
P="psql -h /var/tmp/pg -p 5499 -U postgres -d $DB -qAt -v ON_ERROR_STOP=1"
ok=0; bad=0
pr(){ if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "OK   $1 = $2"; else bad=$((bad+1)); echo "ROT  $1: soll $3 ist $2"; fi; }
$P -c "create table if not exists public.wartungsvertraege(id uuid primary key default gen_random_uuid(), owner_user_id uuid, titel text)" >/dev/null
$P -c "create table if not exists public.termine(id uuid primary key default gen_random_uuid(), owner_user_id uuid, titel text, beginn_am timestamptz)" >/dev/null
SQLF="$(dirname "$0")/../../supabase-sql/p384-wartung-termine.sql"
pr "Kontrolle erster Lauf" "$($P -f "$SQLF" | tail -1)" "4"
pr "Kontrolle zweiter Lauf (idempotent)" "$($P -f "$SQLF" | tail -1)" "4"
pr "termin_auto Standard an" "$($P -c "insert into wartungsvertraege(titel) values ('x') returning termin_auto")" "t"
V=$($P -c "select id from wartungsvertraege limit 1")
$P -c "insert into termine(titel, wartungsvertrag_id, bestaetigung_token) values ('a','$V','tok1')" >/dev/null
pr "Token doppelt abgewiesen" "$($P -c "insert into termine(titel, bestaetigung_token) values ('b','tok1')" 2>&1 | grep -c duplicate)" "1"
$P -c "insert into termine(titel) values ('c'),('d')" >/dev/null
pr "mehrere Termine ohne Token erlaubt" "$($P -c "select count(*) from termine where bestaetigung_token is null")" "2"
$P -c "delete from wartungsvertraege where id='$V'" >/dev/null
pr "Vertrag geloescht -> Termin bleibt, Verweis leer" "$($P -c "select count(*)||'|'||count(wartungsvertrag_id) from termine where titel='a'")" "1|0"
echo "p384: $ok gruen, $bad rot"; [ $bad -eq 0 ]
