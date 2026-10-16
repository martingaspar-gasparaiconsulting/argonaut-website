-- ARGONAUT OS · p407 · C1 Teil 2 Auswertung wiederkehrender Besucher (16.10.2026) · additiv, mehrfach ausfuehrbar
-- Erst NACH p406. Liefert je Besucher (nur mit Einwilligung) und Berliner Tag den ersten Aufruf.
-- Die Zeitspalte von web_ereignisse wird selbst ermittelt (created_at / erstellt_am / zeitpunkt).
do $$
declare
  spalte text;
  typ text;
  t text;
begin
  if to_regclass('public.web_ereignisse') is null then raise notice 'web_ereignisse fehlt - uebersprungen'; return; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='web_ereignisse' and column_name='besucher_id') then
    raise notice 'zuerst p406 ausfuehren'; return;
  end if;
  select c.column_name, c.data_type into spalte, typ
    from information_schema.columns c
   where c.table_schema='public' and c.table_name='web_ereignisse' and c.column_name in ('created_at','erstellt_am','zeitpunkt')
   order by array_position(array['created_at','erstellt_am','zeitpunkt'], c.column_name::text) limit 1;
  if spalte is null then raise notice 'keine Zeitspalte gefunden'; return; end if;
  t := case when typ = 'timestamp without time zone'
            then format('((e.%I at time zone ''UTC'') at time zone ''Europe/Berlin'')::date', spalte)
            else format('(e.%I at time zone ''Europe/Berlin'')::date', spalte) end;
  execute format($f$
    create or replace function public.web_wiedererkennung(seit timestamptz, p_seite text)
    returns table(besucher_id uuid, tag date, kanal text, utm_quelle text, utm_kampagne text)
    language sql stable security definer set search_path = public as $q$
      select distinct on (e.besucher_id, %2$s)
             e.besucher_id, %2$s, e.kanal, e.utm_quelle, e.utm_kampagne
        from public.web_ereignisse e
       where e.oeffentlich_id = p_seite and e.besucher_id is not null and e.typ = 'view'
         and e.%1$I >= %3$s
       order by e.besucher_id, %2$s, e.%1$I
    $q$ $f$, spalte, t, case when typ = 'timestamp without time zone' then '(seit at time zone ''UTC'')' else 'seit' end);
  revoke all on function public.web_wiedererkennung(timestamptz, text) from public, anon, authenticated;
  grant execute on function public.web_wiedererkennung(timestamptz, text) to service_role;
end $$;

-- Kontrolle: erwartet 1|created_at (oder 1|erstellt_am) — die gefundene Zeitspalte
select (select count(*) from pg_proc where proname = 'web_wiedererkennung')
  || '|' || coalesce((select column_name from information_schema.columns where table_schema='public' and table_name='web_ereignisse'
                       and column_name in ('created_at','erstellt_am','zeitpunkt')
                       order by array_position(array['created_at','erstellt_am','zeitpunkt'], column_name::text) limit 1), 'keine') as kontrolle;
