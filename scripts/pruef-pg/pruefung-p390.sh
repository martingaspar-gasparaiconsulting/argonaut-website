#!/bin/bash
# Pruefung Paket 390 (MO1 Teil 3 Sperre + Nachtrag). Aufruf: pruefung-p390.sh <db aus Vorlage>
DB=${1:-t390}
P="psql -h /var/tmp/pg -p 5499 -U postgres -d $DB -qAt -v ON_ERROR_STOP=1"
ok=0; bad=0
pr(){ if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "OK   $1 = $2"; else bad=$((bad+1)); echo "ROT  $1: soll $3 ist $2"; fi; }
$P -c "create table if not exists public.p390_projekt(id uuid primary key default gen_random_uuid()); create table if not exists public.formular_eintrag(id uuid primary key default gen_random_uuid(), owner_user_id uuid not null, status text not null default 'entwurf', werte jsonb default '{}', vorlage_id uuid, projekt_id uuid references public.p390_projekt(id) on delete set null)" >/dev/null
SQLF="$(dirname "$0")/../../supabase-sql/p390-protokoll-sperre-nachtrag.sql"
pr "Kontrolle erster Lauf" "$($P -f "$SQLF" | tail -1)" "2|2"
pr "Kontrolle zweiter Lauf" "$($P -f "$SQLF" | tail -1)" "2|2"
O=11111111-1111-4111-8111-111111111111
E=$($P -c "insert into formular_eintrag(owner_user_id) values ('$O') returning id")
$P -c "update formular_eintrag set werte='{\"a\":1}' where id='$E'" >/dev/null
pr "Entwurf aenderbar" "$($P -c "select werte->>'a' from formular_eintrag where id='$E'")" "1"
$P -c "update formular_eintrag set status='abgeschlossen' where id='$E'" >/dev/null
pr "Abschliessen erlaubt" "$($P -c "select status from formular_eintrag where id='$E'")" "abgeschlossen"
pr "Abgeschlossen nicht aenderbar" "$($P -c "update formular_eintrag set werte='{}' where id='$E'" 2>&1 | grep -c 'nicht geaendert')" "1"
pr "Zurueck auf Entwurf verboten" "$($P -c "update formular_eintrag set status='entwurf' where id='$E'" 2>&1 | grep -c 'nicht geaendert')" "1"
pr "Abgeschlossen nicht loeschbar" "$($P -c "delete from formular_eintrag where id='$E'" 2>&1 | grep -c 'nicht geloescht')" "1"
PR=$($P -c "insert into p390_projekt default values returning id")
E4=$($P -c "insert into formular_eintrag(owner_user_id, projekt_id) values ('$O','$PR') returning id")
$P -c "update formular_eintrag set status='abgeschlossen' where id='$E4'" >/dev/null
$P -c "delete from p390_projekt where id='$PR'" >/dev/null
pr "Projekt loeschbar, Verweis wird leer" "$($P -c "select count(*)||'|'||count(projekt_id) from formular_eintrag where id='$E4'")" "1|0"
pr "Verweis auf anderes Projekt umhaengen verboten" "$($P -c "update formular_eintrag set projekt_id=gen_random_uuid() where id='$E4'" 2>&1 | grep -c 'nicht geaendert')" "1"
E2=$($P -c "insert into formular_eintrag(owner_user_id) values ('$O') returning id")
$P -c "delete from formular_eintrag where id='$E2'" >/dev/null
pr "Entwurf loeschbar" "$($P -c "select count(*) from formular_eintrag where id='$E2'")" "0"
E3=$($P -c "insert into formular_eintrag(owner_user_id) values ('$O') returning id")
pr "Nachtrag zu Entwurf abgewiesen" "$($P -c "insert into formular_nachtrag(owner_user_id, eintrag_id, text) values ('$O','$E3','Korrektur')" 2>&1 | grep -c 'nur zu abgeschlossenen')" "1"
N=$($P -c "insert into formular_nachtrag(owner_user_id, eintrag_id, text) values ('$O','$E','Messwert war 0,5 statt 5') returning id")
pr "Nachtrag zu Abgeschlossenem" "$($P -c "select count(*) from formular_nachtrag where eintrag_id='$E'")" "1"
pr "Nachtrag fremder Betrieb abgewiesen" "$($P -c "insert into formular_nachtrag(owner_user_id, eintrag_id, text) values (gen_random_uuid(),'$E','fremd hier')" 2>&1 | grep -c 'nicht zu diesem Betrieb')" "1"
pr "Nachtrag nicht aenderbar" "$($P -c "update formular_nachtrag set text='anders' where id='$N'" 2>&1 | grep -c 'nicht geaendert')" "1"
pr "Nachtrag nicht loeschbar" "$($P -c "delete from formular_nachtrag where id='$N'" 2>&1 | grep -c 'nicht geaendert')" "1"
pr "Nachtrag zu kurz abgewiesen" "$($P -c "insert into formular_nachtrag(owner_user_id, eintrag_id, text) values ('$O','$E',' x ')" 2>&1 | grep -c 'check')" "1"
echo "p390: $ok gruen, $bad rot"; [ $bad -eq 0 ]
