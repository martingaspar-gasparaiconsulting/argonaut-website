#!/bin/bash
# Pruefung Paket 364 (Weinbau: Lesebuch, Partien, Kellerbuch). Aufruf: pruefung-p364.sh <db aus Vorlage>
DB=${1:-v364}
P="psql -h /var/tmp/pg -p 5499 -U postgres -d $DB -qAt -v ON_ERROR_STOP=1"
C=11111111-1111-1111-1111-111111111111; M=22222222-2222-2222-2222-222222222222; N=33333333-3333-3333-3333-333333333333; X=44444444-4444-4444-4444-444444444444
T1=dddddddd-0000-0000-0000-000000000001; T2=dddddddd-0000-0000-0000-000000000002; L1=eeeeeeee-0000-0000-0000-000000000001
ok=0; bad=0
als(){ local u=$1; shift; $P -c "begin; set local role authenticated; select set_config('request.jwt.claims','{\"sub\":\"$u\"}',true); $*; commit;" 2>&1; }
ja(){ local n=$1; shift; out=$(als "$@"); if [ $? -eq 0 ]; then ok=$((ok+1)); echo "OK   $n"; else bad=$((bad+1)); echo "ROT  $n :: $out"; fi; }
nein(){ local n=$1; local m=$2; shift 2; out=$(als "$@"); if [ $? -ne 0 ] && echo "$out" | grep -q "$m"; then ok=$((ok+1)); echo "OK   $n (abgewiesen)"; else bad=$((bad+1)); echo "ROT  $n :: $out"; fi; }
gleich(){ local n=$1; local soll=$2; shift 2; ist=$(als "$@" | tail -n +2 | head -1); if [ "$ist" = "$soll" ]; then ok=$((ok+1)); echo "OK   $n = $ist"; else bad=$((bad+1)); echo "ROT  $n: soll $soll ist $ist"; fi; }
roh(){ $P -c "$*"; }
J=$(date +%Y); H=$(date +%F)
roh "insert into ma_stub values ('$M','$C','{weinbau}','{weinbau,chargen}'),('$N','$C','{weinbau}','{}') on conflict do nothing; insert into mitarbeiter(owner_user_id,auth_user_id,vorname,nachname) values ('$C','$M','Karl','Keller');" >/dev/null
ja    "T1 MA legt Partie an (Bestand wird 0)" $M "insert into wein_partie(id,owner_user_id,jahrgang,bezeichnung,rebsorte,behaelter,bestand_l) values ('$T1','$C',$J,'$J Riesling trocken','Riesling','Tank 3',9999)"
gleich "T2 Bestand 0 + Name" "0|Karl Keller" $C "select bestand_l||'|'||erfasst_name from wein_partie where id='$T1'"
ja    "T3 zweite Partie" $C "insert into wein_partie(id,owner_user_id,jahrgang,bezeichnung,rebsorte) values ('$T2','$C',$J,'$J Spätburgunder','Spätburgunder')"
nein  "T4 MA ohne Aenderungsrecht" "row-level security" $N "insert into wein_partie(owner_user_id,jahrgang,bezeichnung) values ('$C',$J,'X')"
ja    "T5a Bestand direkt setzen (wird ignoriert)" $C "update wein_partie set bestand_l=500 where id='$T1'"
gleich "T5b Bestand bleibt 0" "0" $C "select bestand_l from wein_partie where id='$T1'"
ja    "L1 Lese mit Most in Partie" $M "insert into wein_lese(id,owner_user_id,jahrgang,lesedatum,weinberg,flaeche_ha,rebsorte,menge_kg,mostgewicht_oe,saeure_gl,most_l,partie_id,nummer) values ('$L1','$C',$J,'$H','Sonnenberg',0.5,'Riesling',4000,88,8.5,3000,'$T1','X-1')"
gleich "L2 Nummer + Name" "$J-001|Karl Keller" $C "select nummer||'|'||erfasst_name from wein_lese where id='$L1'"
gleich "L3 Most gebucht" "3000|zugang_lese|3000" $C "select (select bestand_l from wein_partie where id='$T1')||'|'||art||'|'||bestand_nach_l from wein_kellerbuch where lese_id='$L1'"
ja    "L4 Lese ohne Partie" $M "insert into wein_lese(owner_user_id,jahrgang,lesedatum,weinberg,rebsorte,menge_kg) values ('$C',$J,'$H','Kirchberg','Riesling',1000)"
gleich "L5 fortlaufend" "$J-002" $C "select max(nummer) from wein_lese"
nein  "L6 Lesedatum Zukunft" "Zukunft" $M "insert into wein_lese(owner_user_id,jahrgang,lesedatum,weinberg,rebsorte,menge_kg) values ('$C',$J,current_date+1,'A','B',1)"
ja    "L7 Eiswein: Jahrgang Vorjahr" $M "insert into wein_lese(owner_user_id,jahrgang,lesedatum,weinberg,rebsorte,menge_kg) values ('$C',$J-1,'$H','Eisweinlage','Riesling',100)"
nein  "L8 Jahrgang passt nicht" "Jahrgang passt nicht" $M "insert into wein_lese(owner_user_id,jahrgang,lesedatum,weinberg,rebsorte,menge_kg) values ('$C',$J-2,'$H','A','B',1)"
nein  "L9 Partie ohne Most-Liter" "wein_lese_most_partie" $M "insert into wein_lese(owner_user_id,jahrgang,lesedatum,weinberg,rebsorte,menge_kg,partie_id) values ('$C',$J,'$H','A','B',1,'$T1')"
nein  "L10 Lese aendern" "nur angehängt" $C "update wein_lese set menge_kg=1 where id='$L1'"
nein  "L11 Lese loeschen" "Nachweis" $C "delete from wein_lese where id='$L1'"
nein  "K1 Zugang ohne Menge" "Menge in Litern" $M "insert into wein_kellerbuch(owner_user_id,partie_id,art) values ('$C','$T1','zugang')"
nein  "K2 Lese-Zugang von Hand" "eigenen Knöpfe" $M "insert into wein_kellerbuch(owner_user_id,partie_id,art,menge_l) values ('$C','$T1','zugang_lese',100)"
ja    "K3 Schwefelung mit Mittel" $M "insert into wein_kellerbuch(owner_user_id,partie_id,art,mittel,mittel_menge,mittel_einheit,menge_l) values ('$C','$T1','schwefelung','Kaliumdisulfit',150,'g',999)"
gleich "K4 Behandlung aendert Bestand nicht" "3000||3000" $C "select (select bestand_l from wein_partie where id='$T1')||'|'||coalesce(menge_l::text,'')||'|'||bestand_nach_l from wein_kellerbuch where art='schwefelung'"
nein  "K5 Anreicherung ohne Mittel" "Mittel" $M "insert into wein_kellerbuch(owner_user_id,partie_id,art) values ('$C','$T1','anreicherung')"
nein  "K6 Analyse ohne Wert" "Analysewert" $M "insert into wein_kellerbuch(owner_user_id,partie_id,art) values ('$C','$T1','analyse')"
ja    "K7 Analyse" $M "insert into wein_kellerbuch(owner_user_id,partie_id,art,alkohol_vol,restzucker_gl,so2_frei_mgl) values ('$C','$T1','analyse',12.5,6.2,35)"
ja    "K8 Schwund" $M "insert into wein_kellerbuch(owner_user_id,partie_id,art,menge_l,bemerkung) values ('$C','$T1','schwund',150,'Hefetrub')"
nein  "K9 mehr Abgang als Bestand" "Nicht genug Wein in der Partie (Bestand 2850 l)" $M "insert into wein_kellerbuch(owner_user_id,partie_id,art,menge_l) values ('$C','$T1','abgang',5000)"
nein  "K10 Kellerbuch aendern" "fortgeschrieben" $C "update wein_kellerbuch set menge_l=1"
nein  "K11 Kellerbuch loeschen" "fortgeschrieben" $C "delete from wein_kellerbuch"
nein  "K12 Datum Zukunft" "Zukunft" $M "insert into wein_kellerbuch(owner_user_id,partie_id,art,menge_l,datum) values ('$C','$T1','zugang',1,current_date+1)"
ja    "V1 Verschnitt 850 l" $M "select public.p364_verschnitt('$T1','$T2',850,null,'Cuvée')"
gleich "V2 Bestaende" "2000|850" $C "select (select bestand_l from wein_partie where id='$T1')||'|'||(select bestand_l from wein_partie where id='$T2')"
nein  "V3 Verschnitt zu viel" "Nicht genug Wein" $M "select public.p364_verschnitt('$T2','$T1',851,null,null)"
gleich "V4 nichts halb gebucht" "2000|850" $C "select (select bestand_l from wein_partie where id='$T1')||'|'||(select bestand_l from wein_partie where id='$T2')"
nein  "V5 Verschnitt in sich selbst" "zwei verschiedene" $M "select public.p364_verschnitt('$T1','$T1',1,null,null)"
nein  "A1 MA ohne Chargenrecht fuellt nicht ab" "row-level security" $N "select public.p364_abfuellen('$T1', 100, 0.75, 'W-1', null)"
ja    "A2 Abfuellung 1000 Fl. 0,75 l" $M "select public.p364_abfuellen('$T1', 1000, 0.75, 'RIES-$J-1', null)"
gleich "A3 Bestand nach Abfuellung" "1250" $C "select bestand_l from wein_partie where id='$T1'"
gleich "A4 Charge in Quarantaene" "quarantaene|1000|Fl." $C "select status||'|'||menge||'|'||einheit from charge_los where charge_nr='RIES-$J-1'"
gleich "A5 Rueckverfolgung zur Lese" "1" $C "select count(*) from charge_los where charge_nr='RIES-$J-1' and bemerkung like '%Lese $J-001%' and bemerkung like '%0,75 l = 750 l%'"
nein  "A6 doppelte Chargennummer" "gibt es schon" $M "select public.p364_abfuellen('$T1', 10, 0.75, 'ries-$J-1', null)"
nein  "A7 zu viele Flaschen" "Nicht genug Wein" $M "select public.p364_abfuellen('$T1', 2000, 0.75, 'RIES-$J-2', null)"
gleich "A8 keine Charge bei Fehler" "0" $C "select count(*) from charge_los where charge_nr='RIES-$J-2'"
gleich "S1 MA storniert nicht (0 Zeilen)" "0" $M "with u as (update wein_lese set storniert=true, storno_grund='Falscher Weinberg erfasst' where id='$L1' returning 1) select count(*) from u"
nein  "S2 Storno mehr als Bestand" "Nicht genug Wein" $C "update wein_lese set storniert=true, storno_grund='Falscher Weinberg erfasst' where id='$L1'"
ja    "S3 Storno Lese ohne Partie" $C "update wein_lese set storniert=true, storno_grund='Doppelt erfasst, bitte ignorieren', menge_kg=1 where nummer='$J-002'"
gleich "S4 nur Storno geaendert" "true|1000" $C "select storniert||'|'||menge_kg from wein_lese where nummer='$J-002'"
nein  "S5 Storno ohne Grund" "Storno-Grund" $C "update wein_lese set storniert=true, storno_grund='kurz' where id='$L1'"
nein  "D1 Partie mit Eintraegen loeschen" "Nachweis" $C "delete from wein_partie where id='$T1'"
nein  "D2 Jahrgang aendern mit Eintraegen" "Jahrgang" $C "update wein_partie set jahrgang=jahrgang-1 where id='$T1'"
ja    "D3 Bezeichnung aendern geht" $M "update wein_partie set bezeichnung='$J Riesling Kabinett' where id='$T1'"
gleich "F1 Fremder sieht nichts" "0|0|0" $X "select (select count(*) from wein_partie)||'|'||(select count(*) from wein_lese)||'|'||(select count(*) from wein_kellerbuch)"
gleich "F2 MA mit Sehen sieht" "2" $N "select count(*) from wein_partie"
nein  "F3 Fremde Partie in Lese" "gehört nicht" $X "insert into wein_lese(owner_user_id,jahrgang,lesedatum,weinberg,rebsorte,menge_kg,most_l,partie_id) values ('$X',$J,'$H','A','B',1,1,'$T1')"
nein  "F4 anon" "permission denied" $C "set local role anon; select * from wein_partie"
echo "== $ok gruen, $bad rot"
