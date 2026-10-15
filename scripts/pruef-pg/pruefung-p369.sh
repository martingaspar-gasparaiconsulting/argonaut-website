#!/bin/bash
# Pruefung Paket 369 (HW-18 Zahlungsstatus „jetzt faellig"). Aufruf: pruefung-p369.sh <db aus Vorlage>
# Legt Mini-Tabellen an, faehrt erst die ALTE Live-Funktion (muss falsch liegen),
# dann supabase-sql/p369 (muss richtig liegen).
DB=${1:-t369}
P="psql -h /var/tmp/pg -p 5499 -U postgres -d $DB -qAt -v ON_ERROR_STOP=1"
ok=0; bad=0
pruef(){ ist=$($P -c "select string_agg(right(id::text,1)||':'||zahlungsstatus, ' ' order by id) from rechnungen"); if [ "$ist" = "$2" ]; then ok=$((ok+1)); echo "OK   $1 = $ist"; else bad=$((bad+1)); echo "ROT  $1: soll $2 ist $ist"; fi; }
$P <<'SQL'
create table public.rechnungen(id uuid primary key, owner_user_id uuid, brutto_summe numeric, netto_summe numeric, zahlungsstatus text, rechnungsart text, reverse_charge boolean, kleinunternehmer boolean, bezahlter_betrag numeric, bezahlt_am date, updated_at timestamptz);
create table public.zahlungen(id serial, rechnung_id uuid, betrag numeric, zahlungsdatum date);
create table public.rechnung_abschlaege(id serial, schlussrechnung_id uuid, netto numeric, steuer numeric);
create or replace function public.rechnung_zahlbetrag_neu_berechnen(p_rechnung_id uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare v_summe numeric; v_letztes_datum date; v_brutto numeric; v_status text;
begin
  if auth.uid() is not null and not exists (select 1 from public.rechnungen r_p175 where r_p175.id = p_rechnung_id and r_p175.owner_user_id in (auth.uid(), public.mein_chef_id())) then return; end if;
  select coalesce(sum(betrag),0), max(zahlungsdatum) into v_summe, v_letztes_datum from public.zahlungen where rechnung_id=p_rechnung_id;
  select brutto_summe, zahlungsstatus into v_brutto, v_status from public.rechnungen where id=p_rechnung_id;
  if v_status not in ('offen','teilbezahlt','bezahlt') then update public.rechnungen set bezahlter_betrag=v_summe, updated_at=now() where id=p_rechnung_id; return; end if;
  update public.rechnungen set bezahlter_betrag=v_summe, bezahlt_am = case when v_brutto>0 and v_summe>=v_brutto then v_letztes_datum else null end,
    zahlungsstatus = case when v_brutto>0 and v_summe>=v_brutto then 'bezahlt' when v_summe>0 then 'teilbezahlt' else 'offen' end, updated_at=now() where id=p_rechnung_id;
end $f$;
insert into rechnungen values
 ('00000000-0000-0000-0000-000000000001',null,11900,10000,'teilbezahlt','schluss',false,false,0,null,now()),
 ('00000000-0000-0000-0000-000000000002',null,1190,1000,'offen','normal',false,false,0,null,now()),
 ('00000000-0000-0000-0000-000000000003',null,10000,10000,'teilbezahlt','schluss',true,false,0,null,now()),
 ('00000000-0000-0000-0000-000000000004',null,1190,1000,'storniert','normal',false,false,0,null,now()),
 ('00000000-0000-0000-0000-000000000005',null,1190,1000,'offen','schluss',false,false,0,null,now()),
 ('00000000-0000-0000-0000-000000000006',null,1190,1000,'offen','normal',false,false,0,null,now());
insert into rechnung_abschlaege(schlussrechnung_id,netto,steuer) values
 ('00000000-0000-0000-0000-000000000001',3000,570),('00000000-0000-0000-0000-000000000001',3000,570),
 ('00000000-0000-0000-0000-000000000003',4000,0),('00000000-0000-0000-0000-000000000005',1000,190);
insert into zahlungen(rechnung_id,betrag,zahlungsdatum) values
 ('00000000-0000-0000-0000-000000000001',4760,'2026-10-10'),('00000000-0000-0000-0000-000000000002',500,'2026-10-11'),
 ('00000000-0000-0000-0000-000000000003',6000,'2026-10-12'),('00000000-0000-0000-0000-000000000004',100,'2026-10-12'),
 ('00000000-0000-0000-0000-000000000006',1190,'2026-10-13');
select public.rechnung_zahlbetrag_neu_berechnen(id) from rechnungen;
SQL
pruef "G1 Gegenprobe alte Funktion (Schluss bleibt teilbezahlt)" "1:teilbezahlt 2:teilbezahlt 3:teilbezahlt 4:storniert 5:offen 6:bezahlt"
$P -f "$(dirname "$0")/../../supabase-sql/p369-zahlungsstatus-jetzt-faellig.sql" >/dev/null
pruef "S1 Schluss Rest bezahlt, normal teil, 13b, Storno bleibt, Abschlaege decken alles, normal voll" "1:bezahlt 2:teilbezahlt 3:bezahlt 4:storniert 5:bezahlt 6:bezahlt"
$P -f "$(dirname "$0")/../../supabase-sql/p369-zahlungsstatus-jetzt-faellig.sql" >/dev/null
pruef "S2 zweimal ausfuehren" "1:bezahlt 2:teilbezahlt 3:bezahlt 4:storniert 5:bezahlt 6:bezahlt"
$P -c "delete from zahlungen where rechnung_id='00000000-0000-0000-0000-000000000001'; select public.rechnung_zahlbetrag_neu_berechnen('00000000-0000-0000-0000-000000000001')" >/dev/null
pruef "S3 Zahlung geloescht -> wieder offen" "1:offen 2:teilbezahlt 3:bezahlt 4:storniert 5:bezahlt 6:bezahlt"
$P -c "insert into zahlungen(rechnung_id,betrag,zahlungsdatum) values ('00000000-0000-0000-0000-000000000001',4000,'2026-10-14'); select public.rechnung_zahlbetrag_neu_berechnen('00000000-0000-0000-0000-000000000001')" >/dev/null
pruef "S4 Rest nur teilweise" "1:teilbezahlt 2:teilbezahlt 3:bezahlt 4:storniert 5:bezahlt 6:bezahlt"
echo "== $ok gruen, $bad rot"
[ $bad -eq 0 ]
