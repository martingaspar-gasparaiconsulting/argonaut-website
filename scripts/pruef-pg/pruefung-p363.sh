#!/bin/bash
# Pruefung Paket 363 (Herstellungsprotokoll). Aufruf: pruefung-p363.sh <db aus Vorlage>
DB=${1:-v363}
P="psql -h /var/tmp/pg -p 5499 -U postgres -d $DB -qAt -v ON_ERROR_STOP=1"
C=11111111-1111-1111-1111-111111111111; M=22222222-2222-2222-2222-222222222222; N=33333333-3333-3333-3333-333333333333; X=44444444-4444-4444-4444-444444444444
PR=cccccccc-0000-0000-0000-000000000001; PR2=cccccccc-0000-0000-0000-000000000002
ok=0; bad=0
als(){ local u=$1; shift; $P -c "begin; set local role authenticated; select set_config('request.jwt.claims','{\"sub\":\"$u\"}',true); $*; commit;" 2>&1; }
ja(){ local n=$1; shift; out=$(als "$@"); if [ $? -eq 0 ]; then ok=$((ok+1)); echo "OK   $n"; else bad=$((bad+1)); echo "ROT  $n :: $out"; fi; }
nein(){ local n=$1; local m=$2; shift 2; out=$(als "$@"); if [ $? -ne 0 ] && echo "$out" | grep -q "$m"; then ok=$((ok+1)); echo "OK   $n (abgewiesen)"; else bad=$((bad+1)); echo "ROT  $n :: $out"; fi; }
gleich(){ local n=$1; local soll=$2; shift 2; ist=$(als "$@" | tail -n +2 | head -1); if [ "$ist" = "$soll" ]; then ok=$((ok+1)); echo "OK   $n = $ist"; else bad=$((bad+1)); echo "ROT  $n: soll $soll ist $ist"; fi; }
roh(){ $P -c "$*"; }
J=$(date +%Y)
roh "insert into ma_stub values ('$M','$C','{herstellung}','{herstellung,chargen}'),('$N','$C','{herstellung}','{}') on conflict do nothing; insert into mitarbeiter(owner_user_id,auth_user_id,vorname,nachname) values ('$C','$M','Bernd','Brau'); insert into charge_los(owner_user_id,charge_nr,bezeichnung,menge,einheit,status) values ('$C','MALZ-1','Pilsner Malz',500,'kg','freigegeben'),('$C','HOPF-Q','Hopfen',5,'kg','quarantaene');" >/dev/null
ja    "P1 MA legt Sud an" $M "insert into herstell_protokoll(id,owner_user_id,art,bezeichnung,soll_menge,einheit,nummer,status) values ('$PR','$C','sud','Pils Sud 1',1000,'l','999-X','abgeschlossen')"
gleich "P2 Nummer + Status + Name vom Server" "$J-001|offen|Bernd Brau" $C "select nummer||'|'||status||'|'||erfasst_name from herstell_protokoll where id='$PR'"
ja    "P3 zweites Protokoll" $C "insert into herstell_protokoll(id,owner_user_id,art,bezeichnung) values ('$PR2','$C','milch','Pasteurisierung')"
gleich "P4 fortlaufend" "$J-002" $C "select nummer from herstell_protokoll where id='$PR2'"
nein  "P5 MA ohne Aenderungsrecht" "row-level security" $N "insert into herstell_protokoll(owner_user_id,art,bezeichnung) values ('$C','sud','X')"
nein  "P6 falsche Art" "check" $C "insert into herstell_protokoll(owner_user_id,art,bezeichnung) values ('$C','wein','X')"
ja    "M1 Messwert" $M "insert into herstell_messung(owner_user_id,protokoll_id,schritt,groesse,wert,einheit) values ('$C','$PR','Einmaischen','Temperatur',62,'°C')"
nein  "M2 Messwert in der Zukunft" "Zukunft" $M "insert into herstell_messung(owner_user_id,protokoll_id,schritt,groesse,wert,gemessen_am) values ('$C','$PR','Kochen','Zeit',60,now()+interval '1 day')"
nein  "M3 ohne Wert und Bemerkung" "herstell_messung_inhalt" $M "insert into herstell_messung(owner_user_id,protokoll_id,schritt,groesse) values ('$C','$PR','Kochen','Zeit')"
nein  "M4 Messwert aendern" "nur angehängt" $C "update herstell_messung set wert=63"
gleich "M5 Name am Messwert" "Bernd Brau" $C "select erfasst_name from herstell_messung limit 1"
ja    "R1 Rohstoffe" $M "insert into herstell_rohstoff(owner_user_id,protokoll_id,bezeichnung,charge_nr,menge,einheit) values ('$C','$PR','Pilsner Malz','MALZ-1',200,'kg'),('$C','$PR','Wasser',null,1200,'l')"
nein  "R2 direkt abgeschlossen setzen" "Abschließen" $C "update herstell_protokoll set status='abgeschlossen' where id='$PR'"
nein  "A1 Sud ohne Stammwuerze" "Stammwürze" $M "select public.p363_abschliessen('$PR', 950, 'PILS-$J-1', current_date+90, null)"
ja    "A2 Abschluss" $M "select public.p363_abschliessen('$PR', 950, 'PILS-$J-1', current_date+90, 11.8)"
gleich "A3 Protokoll fest" "abgeschlossen|950|11.8|Bernd Brau" $C "select status||'|'||ist_menge||'|'||stammwuerze_p||'|'||abgeschlossen_name from herstell_protokoll where id='$PR'"
gleich "A4 Charge in Quarantaene" "quarantaene|950|l" $C "select status||'|'||menge||'|'||einheit from charge_los where charge_nr='PILS-$J-1'"
gleich "A5 Rueckverfolgung" "2|1" $C "select (select count(*) from charge_verwendung v join charge_los l on l.id=v.los_id where l.charge_nr='PILS-$J-1' and v.richtung='eingang')||'|'||(select count(*) from charge_verwendung v join charge_los l on l.id=v.los_id where l.charge_nr='MALZ-1' and v.richtung='ausgang')"
nein  "A6 nochmal abschliessen" "schon abgeschlossen" $M "select public.p363_abschliessen('$PR', 950, 'PILS-$J-2', null, 11.8)"
nein  "A7 abgeschlossen aendern" "bleibt, wie es ist" $C "update herstell_protokoll set ist_menge=1 where id='$PR'"
nein  "A8 Messwert nach Abschluss" "abgeschlossen" $M "insert into herstell_messung(owner_user_id,protokoll_id,schritt,groesse,wert) values ('$C','$PR','Lagern','Temperatur',2)"
nein  "A9 Rohstoff nach Abschluss" "abgeschlossen" $M "insert into herstell_rohstoff(owner_user_id,protokoll_id,bezeichnung) values ('$C','$PR','Hefe')"
nein  "A10 Loeschen abgeschlossen" "Nachweis" $C "delete from herstell_protokoll where id='$PR'"
ja    "Q1 Rohstoff in Quarantaene" $M "insert into herstell_rohstoff(owner_user_id,protokoll_id,bezeichnung,charge_nr,menge) values ('$C','$PR2','Hopfen','HOPF-Q',1)"
nein  "Q2 Abschluss mit gesperrtem Rohstoff" "Quarantaene" $M "select public.p363_abschliessen('$PR2', 500, 'MILCH-1', null, null)"
gleich "Q3 nichts angelegt" "0|offen" $C "select (select count(*) from charge_los where charge_nr='MILCH-1')||'|'||(select status from herstell_protokoll where id='$PR2')"
nein  "D1 doppelte Chargennummer" "gibt es schon" $M "delete from herstell_rohstoff where protokoll_id='$PR2'; select public.p363_abschliessen('$PR2', 500, 'malz-1', null, null)"
nein  "S1 MA storniert nicht" "Geschäftsleitung" $M "update herstell_protokoll set status='storniert', storno_grund='Falsch erfasst, neu anlegen' where id='$PR'"
nein  "S2 Chef ohne Grund" "Storno-Grund" $C "update herstell_protokoll set status='storniert', storno_grund='kurz' where id='$PR'"
ja    "S3 Chef storniert mit Grund" $C "update herstell_protokoll set status='storniert', storno_grund='Falsch erfasst, neu anlegen', ist_menge=1 where id='$PR'"
gleich "S4 Storno ohne andere Aenderung" "storniert|950" $C "select status||'|'||ist_menge from herstell_protokoll where id='$PR'"
gleich "L1 MA loescht nicht (0 Zeilen)" "0" $M "with d as (delete from herstell_protokoll where id='$PR2' returning 1) select count(*) from d"
nein  "L2 Chef loescht mit Messwerten nicht" "stornieren statt" $C "insert into herstell_messung(owner_user_id,protokoll_id,schritt,groesse,wert) values ('$C','$PR2','Erhitzen','Temperatur',72); delete from herstell_protokoll where id='$PR2'"
gleich "F1 Fremder sieht nichts" "0" $X "select count(*) from herstell_protokoll"
gleich "F2 MA mit Sehen sieht" "2" $N "select count(*) from herstell_protokoll"
nein  "F3 anon" "permission denied" $C "set local role anon; select * from herstell_protokoll"
echo "== $ok gruen, $bad rot"
