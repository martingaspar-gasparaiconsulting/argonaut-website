#!/bin/bash
# Pruefung Paket 395 (LK5 Teil 2 Monatsabschluss + Sperre). Aufruf: pruefung-p395.sh <db aus Vorlage>
DB=${1:-t395}
P="psql -h /var/tmp/pg -p 5499 -U postgres -d $DB -qAt -v ON_ERROR_STOP=1"
ok=0; bad=0
pr(){ if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "OK   $1 = $2"; else bad=$((bad+1)); echo "ROT  $1: soll $3 ist $2"; fi; }
$P -c "create table if not exists public.hr_zeiterfassung(id uuid primary key default gen_random_uuid(), owner_user_id uuid, mitarbeiter_id uuid, datum date, kommen_um timestamptz, gehen_um timestamptz, pause_minuten int default 0)" >/dev/null
$P -f "$(dirname "$0")/../../supabase-sql/p394-ausfallstunden.sql" >/dev/null
SQLF="$(dirname "$0")/../../supabase-sql/p395-lohn-monatsabschluss.sql"
pr "Kontrolle erster Lauf" "$($P -f "$SQLF" | tail -1)" "3|1"
pr "Kontrolle zweiter Lauf" "$($P -f "$SQLF" | tail -1)" "3|1"
O=11111111-1111-4111-8111-111111111111; M=22222222-2222-4222-8222-222222222222; M2=33333333-3333-4333-8333-333333333333
Z=$($P -c "insert into hr_zeiterfassung(owner_user_id, mitarbeiter_id, datum) values ('$O','$M','2026-09-15') returning id")
$P -c "insert into lohn_monatsabschluss(owner_user_id, mitarbeiter_id, monat, werte) values ('$O','$M','2026-09','{}')" >/dev/null
pr "Zeit im gesperrten Monat nicht aenderbar" "$($P -c "update hr_zeiterfassung set pause_minuten=30 where id='$Z'" 2>&1 | grep -m1 -c gesperrt)" "1"
pr "Zeit im gesperrten Monat nicht loeschbar" "$($P -c "delete from hr_zeiterfassung where id='$Z'" 2>&1 | grep -m1 -c gesperrt)" "1"
pr "Nachtrag im gesperrten Monat abgewiesen" "$($P -c "insert into hr_zeiterfassung(owner_user_id, mitarbeiter_id, datum) values ('$O','$M','2026-09-20')" 2>&1 | grep -m1 -c gesperrt)" "1"
Z2=$($P -c "insert into hr_zeiterfassung(owner_user_id, mitarbeiter_id, datum) values ('$O','$M','2026-10-01') returning id")
pr "Verschieben in gesperrten Monat abgewiesen" "$($P -c "update hr_zeiterfassung set datum='2026-09-30' where id='$Z2'" 2>&1 | grep -m1 -c gesperrt)" "1"
pr "Anderer Monat frei" "$($P -c "insert into hr_zeiterfassung(owner_user_id, mitarbeiter_id, datum) values ('$O','$M','2026-10-02') returning 'ja'")" "ja"
pr "Anderer Mitarbeiter frei" "$($P -c "insert into hr_zeiterfassung(owner_user_id, mitarbeiter_id, datum) values ('$O','$M2','2026-09-15') returning 'ja'")" "ja"
pr "Ausfall im gesperrten Monat abgewiesen" "$($P -c "insert into hr_ausfall(owner_user_id, mitarbeiter_id, datum, stunden, grund) values ('$O','$M','2026-09-15',8,'arbeitsmangel')" 2>&1 | grep -m1 -c gesperrt)" "1"
pr "Doppelter Abschluss abgewiesen" "$($P -c "insert into lohn_monatsabschluss(owner_user_id, mitarbeiter_id, monat, werte) values ('$O','$M','2026-09','{}')" 2>&1 | grep -m1 -c duplicate)" "1"
pr "Abschluss nicht loeschbar" "$($P -c "delete from lohn_monatsabschluss where mitarbeiter_id='$M'" 2>&1 | grep -m1 -c 'nicht geloescht')" "1"
pr "Werte aendern verboten" "$($P -c "update lohn_monatsabschluss set werte='{\"x\":1}' where mitarbeiter_id='$M'" 2>&1 | grep -m1 -c 'nicht geaendert')" "1"
pr "Aufheben ohne Grund verboten" "$($P -c "update lohn_monatsabschluss set storniert_am=now() where mitarbeiter_id='$M'" 2>&1 | grep -m1 -c 'nicht geaendert')" "1"
pr "Aufheben mit kurzem Grund verboten" "$($P -c "update lohn_monatsabschluss set storniert_am=now(), storno_grund='kurz' where mitarbeiter_id='$M'" 2>&1 | grep -m1 -c check)" "1"
$P -c "update lohn_monatsabschluss set storniert_am=now(), storno_grund='Pause falsch erfasst, korrigieren' where mitarbeiter_id='$M'" >/dev/null
pr "Nach Aufheben wieder aenderbar" "$($P -c "update hr_zeiterfassung set pause_minuten=30 where id='$Z' returning pause_minuten")" "30"
pr "Neu freigeben nach Storno" "$($P -c "insert into lohn_monatsabschluss(owner_user_id, mitarbeiter_id, monat, werte) values ('$O','$M','2026-09','{}') returning 'ja'")" "ja"
pr "Storno bleibt sichtbar" "$($P -c "select count(*) from lohn_monatsabschluss where mitarbeiter_id='$M'")" "2"
pr "Zweites Aufheben desselben verboten" "$($P -c "update lohn_monatsabschluss set storniert_am=now(), storno_grund='nochmal aufheben bitte' where mitarbeiter_id='$M' and storniert_am is not null" 2>&1 | grep -m1 -c 'bereits aufgehoben')" "1"
pr "Monatsformat geprueft" "$($P -c "insert into lohn_monatsabschluss(owner_user_id, mitarbeiter_id, monat, werte) values ('$O','$M2','2026-13','{}')" 2>&1 | grep -m1 -c check)" "1"
echo "p395: $ok gruen, $bad rot"; [ $bad -eq 0 ]
