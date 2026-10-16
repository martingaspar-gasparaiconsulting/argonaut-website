#!/bin/bash
# Pruefung Paket 386 (MO0c Minijob-Stundenlohn). Aufruf: pruefung-p386.sh <db aus Vorlage>
DB=${1:-t386}
P="psql -h /var/tmp/pg -p 5499 -U postgres -d $DB -qAt -v ON_ERROR_STOP=1"
ok=0; bad=0
pr(){ if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "OK   $1 = $2"; else bad=$((bad+1)); echo "ROT  $1: soll $3 ist $2"; fi; }
SQLF="$(dirname "$0")/../../supabase-sql/p386-minijob-stundenlohn.sql"
pr "Kontrolle" "$($P -f "$SQLF" | tail -1)" "1|1"
pr "idempotent" "$($P -f "$SQLF" 2>/dev/null | tail -1)" "1|1"
pr "15,00 erlaubt" "$($P -c "insert into mitarbeiter(vorname, minijob_stundenlohn) values ('a', 15) returning minijob_stundenlohn")" "15.00"
pr "0 abgewiesen" "$($P -c "insert into mitarbeiter(vorname, minijob_stundenlohn) values ('b', 0)" 2>&1 | grep -c violates)" "1"
pr "leer erlaubt" "$($P -c "insert into mitarbeiter(vorname) values ('c') returning coalesce(minijob_stundenlohn::text,'leer')")" "leer"
echo "p386: $ok gruen, $bad rot"; [ $bad -eq 0 ]
