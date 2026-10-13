#!/bin/bash
DB=${1:-a1}
P="psql -h /var/tmp/pg -p 5499 -U postgres -d $DB -qAt -v ON_ERROR_STOP=1"
C=11111111-1111-1111-1111-111111111111; M=22222222-2222-2222-2222-222222222222; F=55555555-5555-5555-5555-555555555555; X=44444444-4444-4444-4444-444444444444
L1=aaaaaaaa-0000-0000-0000-0000000000a1; L2=aaaaaaaa-0000-0000-0000-0000000000a2; LX=aaaaaaaa-0000-0000-0000-0000000000ff; K1=bbbbbbbb-0000-0000-0000-0000000000b1
ok=0; bad=0
als(){ local u=$1; shift; $P -c "begin; set local role authenticated; select set_config('request.jwt.claims','{\"sub\":\"$u\"}',true); $*; commit;" 2>&1; }
ja(){ local n=$1; shift; out=$(als "$@"); if [ $? -eq 0 ]; then ok=$((ok+1)); echo "OK   $n"; else bad=$((bad+1)); echo "ROT  $n :: $out"; fi; }
nein(){ local n=$1; local m=$2; shift 2; out=$(als "$@"); if [ $? -ne 0 ] && echo "$out" | grep -q "$m"; then ok=$((ok+1)); echo "OK   $n (abgewiesen)"; else bad=$((bad+1)); echo "ROT  $n :: $out"; fi; }
gleich(){ local n=$1; local soll=$2; shift 2; ist=$(als "$@" | tail -n +2 | head -1); if [ "$ist" = "$soll" ]; then ok=$((ok+1)); echo "OK   $n = $ist"; else bad=$((bad+1)); echo "ROT  $n: soll $soll ist $ist"; fi; }
roh(){ $P -c "$*"; }
roh "insert into ma_stub values ('$M','$C','{}','{}'),('$F','$C','{}','{}') on conflict do nothing; insert into mitarbeiter(owner_user_id,auth_user_id,vorname,nachname) values ('$C','$M','Anna','Ruf'),('$C','$F','Fritz','Frei'); insert into vk_funktion(owner_user_id,user_id,funktion,frei) values ('$C','$F','setter',true); insert into leads(id,owner_user_id,name,telefon) values ('$L1','$C','A','0711'),('$L2','$C','B','0712'),('$LX','$X','Fremd','0'); insert into kontakte(id,owner_user_id,vorname,telefon) values ('$K1','$C','K','0713');" >/dev/null
ja    "A1 MA erfasst nicht erreicht" $M "insert into vk_anruf(owner_user_id,lead_id,ergebnis,user_id) values ('$C','$L1','nicht_erreicht','$M')"
gleich "A2 Lead: 1 Versuch, Ergebnis, naechster +2h" "1|nicht_erreicht|true" $C "select anruf_versuche||'|'||letzter_anruf_ergebnis||'|'||(abs(extract(epoch from naechster_anruf_am-letzter_anruf_am)-7200)<1) from leads where id='$L1'"
gleich "A3 Name vom Server" "Anna Ruf" $C "select anrufer_name from vk_anruf limit 1"
gleich "A4 Cockpit zaehlt mit (kein_kontakt)" "anruf|kein_kontakt" $C "select art||'|'||ergebnis from vertrieb_aktivitaet"
ja    "A5 zwei weitere Versuche" $M "insert into vk_anruf(owner_user_id,lead_id,ergebnis,user_id) values ('$C','$L1','mailbox','$M'); insert into vk_anruf(owner_user_id,lead_id,ergebnis,user_id) values ('$C','$L1','besetzt','$M')"
gleich "A6 ab 3. Versuch +20h" "3|true" $C "select anruf_versuche||'|'||(abs(extract(epoch from naechster_anruf_am-letzter_anruf_am)-72000)<1) from leads where id='$L1'"
nein  "A7 Rueckruf ohne Zeit" "vk_anruf_rueckruf" $M "insert into vk_anruf(owner_user_id,lead_id,ergebnis,user_id) values ('$C','$L2','rueckruf','$M')"
nein  "A8 Rueckruf in der Vergangenheit" "Zukunft" $M "insert into vk_anruf(owner_user_id,lead_id,ergebnis,rueckruf_am,user_id) values ('$C','$L2','rueckruf',now()-interval '1 day','$M')"
ja    "A9 Rueckruf morgen" $M "insert into vk_anruf(owner_user_id,lead_id,ergebnis,rueckruf_am,user_id) values ('$C','$L2','rueckruf',now()+interval '1 day','$M')"
gleich "A10 naechster = Rueckrufzeit" "t" $C "select abs(extract(epoch from naechster_anruf_am - (erster_anruf_am+interval '1 day')))<5 from leads where id='$L2'"
ja    "A11 Termin" $M "insert into vk_anruf(owner_user_id,lead_id,ergebnis,user_id) values ('$C','$L2','termin','$M')"
gleich "A12 nach Termin kein naechster" "termin|" $C "select letzter_anruf_ergebnis||'|'||coalesce(naechster_anruf_am::text,'') from leads where id='$L2'"
nein  "A13 fremder Lead" "nicht zu Ihrem Betrieb" $M "insert into vk_anruf(owner_user_id,lead_id,ergebnis,user_id) values ('$C','$LX','termin','$M')"
nein  "A14 ohne Bezug" "vk_anruf_bezug" $M "insert into vk_anruf(owner_user_id,ergebnis,user_id) values ('$C','termin','$M')"
ja    "A15 fremde Person angegeben -> Server setzt eigene" $M "insert into vk_anruf(owner_user_id,kontakt_id,ergebnis,user_id) values ('$C','$K1','gespraech','$C')"
gleich "A15b user_id = angemeldete Person" "$M" $C "select user_id from vk_anruf where kontakt_id='$K1'"
nein  "A16 aendern verboten" "bleibt, wie er ist" $C "update vk_anruf set ergebnis='termin'"
ja    "A17 Kontakt-Anruf Rueckruf" $M "insert into vk_anruf(owner_user_id,kontakt_id,ergebnis,rueckruf_am,user_id) values ('$C','$K1','rueckruf',now()+interval '2 hours','$M')"
gleich "A18 Kontakt letzter+naechster gesetzt" "true|true" $C "select (letzter_kontakt_am is not null)||'|'||(naechster_kontakt_am > now()) from kontakte where id='$K1'"
ja    "A19 MA nimmt eigenen Anruf zurueck" $M "delete from vk_anruf where lead_id='$L2' and ergebnis='termin'"
gleich "A20 Lead neu gerechnet (Rueckruf wieder letzter)" "1|rueckruf" $C "select anruf_versuche||'|'||letzter_anruf_ergebnis from leads where id='$L2'"
gleich "A21 Cockpit-Zeile mit entfernt" "6" $C "select count(*) from vertrieb_aktivitaet"
roh "update vk_anruf set erstellt_am = erstellt_am - interval '1 hour' where lead_id='$L1'" 2>/dev/null; roh "alter table vk_anruf disable trigger p360_waechter; update vk_anruf set erstellt_am = erstellt_am - interval '1 hour' where lead_id='$L1'; alter table vk_anruf enable trigger p360_waechter;" >/dev/null
gleich "A22 MA nach 15 Min: 0 zurueckgenommen" "0" $M "with d as (delete from vk_anruf where lead_id='$L1' returning 1) select count(*) from d"
ja    "A23 Chef darf immer zuruecknehmen" $C "delete from vk_anruf where lead_id='$L1' and ergebnis='besetzt'"
gleich "A24 Lead 2 Versuche" "2" $C "select anruf_versuche from leads where id='$L1'"
ja    "F1 freier Setter erfasst" $F "insert into vk_anruf(owner_user_id,lead_id,ergebnis,user_id) values ('$C','$L1','gespraech','$F')"
gleich "F2 freier Setter sieht nur eigene" "1" $F "select count(*) from vk_anruf"
gleich "F3 MA sieht alle" "6" $M "select count(*) from vk_anruf"
gleich "F4 Fremder sieht nichts" "0" $X "select count(*) from vk_anruf"
nein  "F5 anon" "permission denied" $C "set local role anon; select * from vk_anruf"
roh "drop table vertrieb_aktivitaet cascade" >/dev/null
ja    "B1 ohne Cockpit-Tabelle trotzdem gespeichert" $M "insert into vk_anruf(owner_user_id,lead_id,ergebnis,user_id) values ('$C','$L2','gespraech','$M')"
echo "== $ok gruen, $bad rot"
