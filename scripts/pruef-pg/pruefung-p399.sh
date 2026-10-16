#!/bin/bash
# Pruefung Paket 399 (HW-2 Bauzeitenplan). Aufruf: pruefung-p399.sh <db aus Vorlage>
DB=${1:-t399}
P="psql -h /var/tmp/pg -p 5499 -U postgres -d $DB -qAt -v ON_ERROR_STOP=1"
ok=0; bad=0
pr(){ if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "OK   $1 = $2"; else bad=$((bad+1)); echo "ROT  $1: soll $3 ist $2"; fi; }
SQLF="$(dirname "$0")/../../supabase-sql/p399-bauzeitenplan.sql"
pr "Kontrolle erster Lauf" "$($P -f "$SQLF" | tail -1)" "1|3"
pr "Kontrolle zweiter Lauf" "$($P -f "$SQLF" | tail -1)" "1|3"
CHEF=11111111-1111-4111-8111-111111111111
MA=22222222-2222-4222-8222-222222222222
PR=33333333-3333-4333-8333-333333333333
als(){ echo "begin; select set_config('request.jwt.claims', '{\"sub\":\"$1\",\"role\":\"authenticated\"}', true); set local role authenticated; $2; commit;"; }
ID=$($P -c "insert into bau_zeitplan(owner_user_id, projekt_id, titel, dauer_tage) values ('$CHEF', '$PR', 'Rohbau', 10) returning id")
pr "Dauer 0 abgewiesen" "$($P -c "insert into bau_zeitplan(owner_user_id, projekt_id, titel, dauer_tage) values ('$CHEF', '$PR', 'X1', 0)" 2>&1 | grep -c 'check')" "1"
pr "Puffer 61 abgewiesen" "$($P -c "insert into bau_zeitplan(owner_user_id, projekt_id, titel, dauer_tage, puffer_tage) values ('$CHEF', '$PR', 'X2', 1, 61)" 2>&1 | grep -c 'check')" "1"
# Mitarbeiter-Rolle: mein_chef_id() liefert in der Vorlage den Chef fuer MA (Stub) - Trigger pruefen direkt
$P -c "$(als $CHEF "update bau_zeitplan set titel='Rohbau neu' where id='$ID'")" >/dev/null 2>&1
pr "Chef aendert Titel" "$($P -c "select titel from bau_zeitplan where id='$ID'")" "Rohbau neu"
pr "MA aendert Titel nicht (Trigger)" "$($P -c "begin; select set_config('request.jwt.claims', '{\"sub\":\"$MA\"}', true); update bau_zeitplan set titel='weg' where id='$ID'; commit;" 2>&1 | grep -c 'nur den Fortschritt')" "1"
pr "MA ohne Recht sieht fremde Zeile nicht (RLS)" "$($P -c "$(als $MA "select count(*) from public.bau_zeitplan")" 2>/dev/null | grep -E '^[0-9]+$' | tail -1)" "0"
$P -c "begin; select set_config('request.jwt.claims', '{\"sub\":\"$MA\"}', true); update bau_zeitplan set fortschritt=40 where id='$ID'; commit;" >/dev/null
pr "Fortschritt durch MA erlaubt (Trigger)" "$($P -c "select fortschritt from bau_zeitplan where id='$ID'")" "40"
pr "Fortschritt 101 abgewiesen" "$($P -c "update bau_zeitplan set fortschritt=101 where id='$ID'" 2>&1 | grep -c 'check')" "1"
echo "p399: $ok gruen, $bad rot"
[ $bad -eq 0 ]
