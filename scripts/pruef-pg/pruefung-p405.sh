#!/bin/bash
# Pruefung Paket 405 (HW-3 Foerder-Vorgang). Aufruf: pruefung-p405.sh <db aus Vorlage>
DB=${1:-t405}
P="psql -h /var/tmp/pg -p 5499 -U postgres -d $DB -qAt -v ON_ERROR_STOP=1"
ok=0; bad=0
pr(){ if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "OK   $1 = $2"; else bad=$((bad+1)); echo "ROT  $1: soll $3 ist $2"; fi; }
SQLF="$(dirname "$0")/../../supabase-sql/p405-foerder-vorgang.sql"
pr "Kontrolle erster Lauf" "$($P -f "$SQLF" | tail -1)" "1|2"
pr "Kontrolle zweiter Lauf" "$($P -f "$SQLF" | tail -1)" "1|2"
O=11111111-1111-4111-8111-111111111111
ID=$($P -c "insert into foerder_vorgang(owner_user_id, kunde_name) values ('$O', 'Familie Test') returning id")
pr "Sprung geplant->antrag abgewiesen" "$($P -c "update foerder_vorgang set status='antrag' where id='$ID'" 2>&1 | grep -c 'der Reihe nach')" "1"
$P -c "update foerder_vorgang set status='vertrag' where id='$ID'" >/dev/null
pr "geplant->vertrag erlaubt" "$($P -c "select status from foerder_vorgang where id='$ID'")" "vertrag"
pr "zurueck vertrag->geplant abgewiesen" "$($P -c "update foerder_vorgang set status='geplant' where id='$ID'" 2>&1 | grep -c 'der Reihe nach')" "1"
$P -c "update foerder_vorgang set notiz='x' where id='$ID'" >/dev/null
pr "Notiz ohne Statuswechsel erlaubt" "$($P -c "select notiz from foerder_vorgang where id='$ID'")" "x"
$P -c "update foerder_vorgang set status='abgelehnt' where id='$ID'" >/dev/null
pr "abgelehnt jederzeit" "$($P -c "select status from foerder_vorgang where id='$ID'")" "abgelehnt"
pr "abgeschlossen bleibt" "$($P -c "update foerder_vorgang set status='bza' where id='$ID'" 2>&1 | grep -c 'abgeschlossen')" "1"
pr "unbekannter Status abgewiesen" "$($P -c "insert into foerder_vorgang(owner_user_id, kunde_name, status) values ('$O', 'XY', 'quatsch')" 2>&1 | grep -c 'check')" "1"
echo "p405: $ok gruen, $bad rot"
[ $bad -eq 0 ]
