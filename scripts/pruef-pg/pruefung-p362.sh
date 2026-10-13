#!/bin/bash
# Pruefung Paket 362 (Anruf-Sperrliste + Erlaubnis). Aufruf: pruefung-p362.sh <db aus Vorlage>
DB=${1:-v362}
P="psql -h /var/tmp/pg -p 5499 -U postgres -d $DB -qAt -v ON_ERROR_STOP=1"
C=11111111-1111-1111-1111-111111111111; M=22222222-2222-2222-2222-222222222222; X=44444444-4444-4444-4444-444444444444
L1=aaaaaaaa-0000-0000-0000-0000000000a1; KV=bbbbbbbb-0000-0000-0000-0000000000b1; KF=bbbbbbbb-0000-0000-0000-0000000000b2; KU=bbbbbbbb-0000-0000-0000-0000000000b3; KE=bbbbbbbb-0000-0000-0000-0000000000b4
ok=0; bad=0
als(){ local u=$1; shift; $P -c "begin; set local role authenticated; select set_config('request.jwt.claims','{\"sub\":\"$u\"}',true); $*; commit;" 2>&1; }
ja(){ local n=$1; shift; out=$(als "$@"); if [ $? -eq 0 ]; then ok=$((ok+1)); echo "OK   $n"; else bad=$((bad+1)); echo "ROT  $n :: $out"; fi; }
nein(){ local n=$1; local m=$2; shift 2; out=$(als "$@"); if [ $? -ne 0 ] && echo "$out" | grep -q "$m"; then ok=$((ok+1)); echo "OK   $n (abgewiesen)"; else bad=$((bad+1)); echo "ROT  $n :: $out"; fi; }
gleich(){ local n=$1; local soll=$2; shift 2; ist=$(als "$@" | tail -n +2 | head -1); if [ "$ist" = "$soll" ]; then ok=$((ok+1)); echo "OK   $n = $ist"; else bad=$((bad+1)); echo "ROT  $n: soll $soll ist $ist"; fi; }
roh(){ $P -c "$*"; }
roh "insert into ma_stub values ('$M','$C','{}','{}') on conflict do nothing; insert into mitarbeiter(owner_user_id,auth_user_id,vorname,nachname) values ('$C','$M','Anna','Ruf'); insert into leads(id,owner_user_id,name,telefon) values ('$L1','$C','Lead','07031 111111'); insert into kontakte(id,owner_user_id,vorname,telefon,ist_verbraucher) values ('$KV','$C','Verbraucher','07031 222222',true),('$KF','$C','Firma','+49 7031 333333',false),('$KU','$C','Unklar','07031 444444',null),('$KE','$C','Einw','0171 5555555',true);" >/dev/null
gleich "N1 Nummer 0 -> +49" "+497031222222" $C "select public.p362_nummer('07031 / 22 22 22')"
gleich "N2 00 -> +" "+43123456" $C "select public.p362_nummer('0043 123 456')"
gleich "N3 ohne Vorwahl -> leer" "" $C "select coalesce(public.p362_nummer('123456'),'')"
ja    "E1 Lead ohne Angabe = eigene Anfrage" $M "insert into vk_anruf(owner_user_id,lead_id,ergebnis,user_id) values ('$C','$L1','nicht_erreicht','$M')"
gleich "E2 erlaubnis gesetzt" "eigene_anfrage" $C "select erlaubnis from vk_anruf where lead_id='$L1'"
nein  "E3 Kontakt ohne Erlaubnis" "warum er erlaubt ist" $M "insert into vk_anruf(owner_user_id,kontakt_id,ergebnis,user_id) values ('$C','$KF','gespraech','$M')"
nein  "E4 Firma mutmasslich ohne Grund" "Grund angeben" $M "insert into vk_anruf(owner_user_id,kontakt_id,ergebnis,user_id,erlaubnis,erlaubnis_grund) values ('$C','$KF','gespraech','$M','mutmasslich','kurz')"
ja    "E5 Firma mutmasslich mit Grund" $M "insert into vk_anruf(owner_user_id,kontakt_id,ergebnis,user_id,erlaubnis,erlaubnis_grund) values ('$C','$KF','gespraech','$M','mutmasslich','Bestandskunde seit 2024, Wartung faellig')"
nein  "E6 Verbraucher mutmasslich" "Verbrauchern reicht" $M "insert into vk_anruf(owner_user_id,kontakt_id,ergebnis,user_id,erlaubnis,erlaubnis_grund) values ('$C','$KV','gespraech','$M','mutmasslich','Hat auf der Messe Interesse gezeigt')"
nein  "E7 Verbraucher Einwilligung ohne Nachweis" "keine gültige Einwilligung" $M "insert into vk_anruf(owner_user_id,kontakt_id,ergebnis,user_id,erlaubnis) values ('$C','$KV','gespraech','$M','einwilligung')"
nein  "E8 eigene Anfrage bei Kontakt" "nur für Leads" $M "insert into vk_anruf(owner_user_id,kontakt_id,ergebnis,user_id,erlaubnis) values ('$C','$KV','gespraech','$M','eigene_anfrage')"
ja    "E9 Verbraucher kein Werbeanruf mit Grund" $M "insert into vk_anruf(owner_user_id,kontakt_id,ergebnis,user_id,erlaubnis,erlaubnis_grund) values ('$C','$KV','gespraech','$M','kein_werbeanruf','Rueckfrage zum laufenden Auftrag 2026-014')"
nein  "W1 Einwilligung ohne Nachweis" "telefon_einwilligung_nachweis_check\|check" $M "insert into telefon_einwilligung(owner_user_id,kontakt_id,nummer,quelle,erteilt_am,nachweis) values ('$C','$KE','0171 5555555','schriftlich',current_date,'kurz')"
nein  "W2 Einwilligung in der Zukunft" "Zukunft" $M "insert into telefon_einwilligung(owner_user_id,kontakt_id,nummer,quelle,erteilt_am,nachweis) values ('$C','$KE','0171 5555555','schriftlich',current_date+2,'Formular unterschrieben am Stand')"
ja    "W3 Einwilligung erfassen (MA)" $M "insert into telefon_einwilligung(owner_user_id,kontakt_id,nummer,quelle,erteilt_am,nachweis) values ('$C','$KE','0171 / 555 5555','schriftlich',current_date,'Formular unterschrieben am Messestand, Ordner Messe 2026')"
gleich "W4 Nummer einheitlich, Name vom Server" "+491715555555|Anna Ruf" $C "select nummer||'|'||erfasst_name from telefon_einwilligung"
ja    "W5 Verbraucher mit Einwilligung" $M "insert into vk_anruf(owner_user_id,kontakt_id,ergebnis,user_id,erlaubnis) values ('$C','$KE','termin','$M','einwilligung')"
nein  "W6 Einwilligung aendern" "nur widerrufen" $M "update telefon_einwilligung set nachweis='geaendert und laenger als zehn'"
nein  "W7 Einwilligung loeschen" "aufbewahrt" $C "delete from telefon_einwilligung"
ja    "W8 MA traegt Widerruf ein" $M "update telefon_einwilligung set widerrufen_am=now(), widerruf_grund='Kunde am Telefon'"
gleich "W9 Widerruf sperrt Nummer" "1|widerspruch" $C "select count(*)||'|'||max(quelle) from telefon_sperre where nummer='+491715555555' and entsperrt_am is null"
nein  "W10 nach Widerruf: gesperrt" "gesperrt" $M "insert into vk_anruf(owner_user_id,kontakt_id,ergebnis,user_id,erlaubnis) values ('$C','$KE','termin','$M','einwilligung')"
ja    "S1 MA sperrt Lead-Nummer" $M "insert into telefon_sperre(owner_user_id,nummer,quelle,lead_id) values ('$C','07031-111111','widerspruch','$L1')"
ja    "S2 doppelt sperren: kein Fehler" $M "insert into telefon_sperre(owner_user_id,nummer,quelle) values ('$C','+49 7031 111111','manuell')"
gleich "S3 nur eine aktive Sperre" "1" $C "select count(*) from telefon_sperre where nummer='+497031111111'"
nein  "S4 Lead-Anruf gesperrt" "gesperrt" $M "insert into vk_anruf(owner_user_id,lead_id,ergebnis,user_id) values ('$C','$L1','termin','$M')"
gleich "S5 MA entsperrt nicht (0 Zeilen)" "0" $M "with u as (update telefon_sperre set entsperrt_am=now(), entsperrt_grund='Neue Einwilligung liegt vor' where nummer='+497031111111' returning 1) select count(*) from u"
nein  "S6 Chef ohne Grund" "Grund für das Entsperren" $C "update telefon_sperre set entsperrt_am=now(), entsperrt_grund='kurz' where nummer='+497031111111'"
ja    "S7 Chef entsperrt mit Grund" $C "update telefon_sperre set entsperrt_am=now(), entsperrt_grund='Neue schriftliche Einwilligung 13.10.' , nummer='+490000000' where nummer='+497031111111'"
gleich "S8 Nummer unveraendert, Name gesetzt" "+497031111111|Geschäftsleitung" $C "select nummer||'|'||entsperrt_name from telefon_sperre where nummer='+497031111111'"
ja    "S9 nach Entsperren wieder anrufbar" $M "insert into vk_anruf(owner_user_id,lead_id,ergebnis,user_id) values ('$C','$L1','gespraech','$M')"
nein  "S10 Sperre loeschen" "Nachweis" $C "delete from telefon_sperre"
gleich "R1 Fremder sieht nichts" "0" $X "select (select count(*) from telefon_sperre)+(select count(*) from telefon_einwilligung)"
nein  "R2 anon" "permission denied" $C "set local role anon; select * from telefon_sperre"
echo "== $ok gruen, $bad rot"
