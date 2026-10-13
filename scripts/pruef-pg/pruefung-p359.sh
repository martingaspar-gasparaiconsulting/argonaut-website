#!/bin/bash
# t.sh DB — Pruefungen P359
DB=${1:-t1}
P="psql -h /var/tmp/pg -p 5499 -U postgres -d $DB -qAt -v ON_ERROR_STOP=1"
C=11111111-1111-1111-1111-111111111111   # Chef A
M=22222222-2222-2222-2222-222222222222   # MA von A mit pipeline-sehen
N=33333333-3333-3333-3333-333333333333   # MA von A ohne Recht
X=44444444-4444-4444-4444-444444444444   # Chef B (fremd)
ok=0; bad=0
als(){ local u=$1; shift; $P -c "begin; set local role authenticated; select set_config('request.jwt.claims','{\"sub\":\"$u\"}',true); $*; commit;" 2>&1; }
ja(){ local name=$1; shift; out=$(als "$@"); if [ $? -eq 0 ]; then ok=$((ok+1)); echo "OK   $name"; else bad=$((bad+1)); echo "ROT  $name :: $out"; fi; }
nein(){ local name=$1; local muster=$2; shift 2; out=$(als "$@"); if [ $? -ne 0 ] && echo "$out" | grep -q "$muster"; then ok=$((ok+1)); echo "OK   $name (abgewiesen)"; else bad=$((bad+1)); echo "ROT  $name :: $out"; fi; }
gleich(){ local name=$1; local soll=$2; shift 2; ist=$(als "$@" | tail -n +2 | head -1); if [ "$ist" = "$soll" ]; then ok=$((ok+1)); echo "OK   $name = $ist"; else bad=$((bad+1)); echo "ROT  $name: soll $soll ist $ist"; fi; }
$P -c "insert into ma_stub values ('$M','$C','{pipeline}','{}'),('$N','$C','{}','{}') on conflict do nothing; insert into mitarbeiter(owner_user_id,auth_user_id,vorname) values ('$C','$M','Anna'),('$C','$N','Nils');" >/dev/null
ja    "P1 Chef legt Pipeline an" $C "insert into crm_pipeline(id,name,standard) values ('aaaaaaaa-0000-0000-0000-000000000001','Neukunden',true)"
gleich "P2 Gewonnen+Verloren automatisch" "gewonnen,verloren" $C "select string_agg(schluessel, ',' order by position) from crm_pipeline_stufe where pipeline_id='aaaaaaaa-0000-0000-0000-000000000001'"
ja    "P3 offene Stufen anlegen" $C "insert into crm_pipeline_stufe(pipeline_id,schluessel,name,wahrscheinlichkeit,position) values ('aaaaaaaa-0000-0000-0000-000000000001','erstkontakt','Erstkontakt',10,0),('aaaaaaaa-0000-0000-0000-000000000001','termin','Termin',40,1)"
gleich "P4 owner der Stufe vom Server" "$C" $C "select distinct owner_user_id from crm_pipeline_stufe"
nein  "P5 offene Stufe mit Schluessel gewonnen" "crm_pipeline_stufe_art\|eindeutig" $C "insert into crm_pipeline_stufe(pipeline_id,schluessel,name,art) values ('aaaaaaaa-0000-0000-0000-000000000001','gewonnen2','X','gewonnen')"
nein  "P6 doppelter Name" "crm_pipeline_name_uidx" $C "insert into crm_pipeline(name) values (' neukunden ')"
nein  "P7 zweite Start-Ansicht" "crm_pipeline_standard_uidx" $C "insert into crm_pipeline(name,standard) values ('Bestand',true)"
ja    "P8 zweite Pipeline" $C "insert into crm_pipeline(id,name) values ('aaaaaaaa-0000-0000-0000-000000000002','Bestand')"
nein  "P9 MA ohne Recht sieht nichts / schreibt nicht" "row-level security" $M "insert into crm_pipeline(name) values ('MA')"
gleich "P10 MA mit Modul sieht Pipelines" "2" $M "select count(*) from crm_pipeline"
gleich "P11 MA ohne Modul sieht keine" "0" $N "select count(*) from crm_pipeline"
gleich "P12 Fremder sieht keine" "0" $X "select count(*) from crm_pipeline_stufe"
ja    "D1 Deal in Pipeline ohne Stufe -> erste offene" $C "insert into crm_deal(id,owner_user_id,titel,pipeline_id) values ('dddddddd-0000-0000-0000-000000000001','$C','A','aaaaaaaa-0000-0000-0000-000000000001')"
gleich "D2 Stufe erstkontakt gesetzt" "erstkontakt" $C "select stufe from crm_deal where id='dddddddd-0000-0000-0000-000000000001'"
nein  "D3 Stufe passt nicht zur Pipeline" "gibt es in dieser Pipeline nicht" $C "update crm_deal set stufe='angebot' where id='dddddddd-0000-0000-0000-000000000001'"
ja    "D4 Stufe termin" $C "update crm_deal set stufe='termin' where id='dddddddd-0000-0000-0000-000000000001'"
ja    "D5 Stufe gewonnen" $C "update crm_deal set stufe='gewonnen' where id='dddddddd-0000-0000-0000-000000000001'"
nein  "D6 zurueck in Standard mit eigener Stufe" "Standard-Pipeline" $C "update crm_deal set pipeline_id=null, stufe='termin' where id='dddddddd-0000-0000-0000-000000000001'"
ja    "D7 Standard-Deal wie bisher (ohne Pipeline, beliebige alte Stufe)" $C "insert into crm_deal(owner_user_id,titel,stufe) values ('$C','Alt','irgendwas'); update crm_deal set provision_prozent=5 where titel='Alt'"
nein  "D8 fremde Pipeline" "nicht zu Ihrem Betrieb" $X "insert into crm_deal(owner_user_id,titel,pipeline_id) values ('$X','F','aaaaaaaa-0000-0000-0000-000000000001')"
nein  "S1 Stufe mit Deals loeschen" "noch Deals" $C "update crm_deal set stufe='termin' where id='dddddddd-0000-0000-0000-000000000001'; delete from crm_pipeline_stufe where schluessel='termin'"
nein  "S2 Gewonnen loeschen" "nicht löschen" $C "delete from crm_pipeline_stufe where pipeline_id='aaaaaaaa-0000-0000-0000-000000000002' and schluessel='gewonnen'"
nein  "S3 Schluessel aendern" "bleiben fest" $C "update crm_pipeline_stufe set schluessel='neu' where schluessel='erstkontakt'"
ja    "S4 Umbenennen + Wahrscheinlichkeit" $C "update crm_pipeline_stufe set name='Erstgespräch', wahrscheinlichkeit=15 where schluessel='erstkontakt'"
nein  "S5 Gewonnen mit 90 %" "crm_pipeline_stufe_art" $C "update crm_pipeline_stufe set wahrscheinlichkeit=90 where schluessel='gewonnen' and pipeline_id='aaaaaaaa-0000-0000-0000-000000000002'"
gleich "S6 MA aendert Stufe nicht (0 Zeilen)" "0" $M "with u as (update crm_pipeline_stufe set name='x' where schluessel='erstkontakt' returning 1) select count(*) from u"
gleich "S6b Name unveraendert" "Erstgespräch" $C "select name from crm_pipeline_stufe where schluessel='erstkontakt'"
nein  "L1 Pipeline mit Deals loeschen" "noch Deals" $C "delete from crm_pipeline where id='aaaaaaaa-0000-0000-0000-000000000001'"
ja    "L2 leere Pipeline loeschen (Stufen gehen mit)" $C "delete from crm_pipeline where id='aaaaaaaa-0000-0000-0000-000000000002'"
gleich "L3 Stufen der geloeschten weg" "0" $C "select count(*) from crm_pipeline_stufe where pipeline_id='aaaaaaaa-0000-0000-0000-000000000002'"
ja    "I1 Pipeline inaktiv (nicht Start)" $C "update crm_pipeline set standard=false, aktiv=false where id='aaaaaaaa-0000-0000-0000-000000000001'"
nein  "I2 neuer Deal in inaktive Pipeline" "inaktiv" $C "insert into crm_deal(owner_user_id,titel,pipeline_id) values ('$C','B','aaaaaaaa-0000-0000-0000-000000000001')"
ja    "I3 bestehender Deal in inaktiver Pipeline weiter verschiebbar" $C "update crm_deal set stufe='verloren' where id='dddddddd-0000-0000-0000-000000000001'"
nein  "I4 inaktive als Start" "inaktive Pipeline" $C "update crm_pipeline set standard=true where id='aaaaaaaa-0000-0000-0000-000000000001'"
nein  "A1 anon liest nicht" "permission denied" $C "set local role anon; select * from crm_pipeline"
echo "== $ok gruen, $bad rot"
