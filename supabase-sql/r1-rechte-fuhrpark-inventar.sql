-- ============================================================
-- ARGONAUT OS · R1 Rechte-Korrektur Fuhrpark + Inventar — 24.09.2026
-- Befund aus Paket PJ: fahrzeuge_mitarbeiter und inventar_mitarbeiter waren
-- "for all" -> Mitarbeiter konnten Fahrzeuge und Geraete LOESCHEN.
-- Martins Entscheidung 24.09.: Mitarbeiter lesen, anlegen und aendern —
-- loeschen nur der Chef.
--
-- Ablauf in EINER Transaktion: erst die neuen, engeren Regeln anlegen, dann
-- die alte "for all"-Regel entfernen. Es gibt keinen Moment ohne Regel.
-- Der Chef (fahrzeuge_owner / inventar_owner) bleibt unveraendert.
-- Niemand verliert Lesezugriff. Idempotent.
-- ============================================================
begin;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fahrzeuge' and policyname='fahrzeuge_ma_select') then
    create policy fahrzeuge_ma_select on public.fahrzeuge for select to public using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fahrzeuge' and policyname='fahrzeuge_ma_insert') then
    create policy fahrzeuge_ma_insert on public.fahrzeuge for insert to public with check (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fahrzeuge' and policyname='fahrzeuge_ma_update') then
    create policy fahrzeuge_ma_update on public.fahrzeuge for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='inventar' and policyname='inventar_ma_select') then
    create policy inventar_ma_select on public.inventar for select to public using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='inventar' and policyname='inventar_ma_insert') then
    create policy inventar_ma_insert on public.inventar for insert to public with check (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='inventar' and policyname='inventar_ma_update') then
    create policy inventar_ma_update on public.inventar for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
  end if;
end $$;

drop policy if exists fahrzeuge_mitarbeiter on public.fahrzeuge;
drop policy if exists inventar_mitarbeiter on public.inventar;

commit;

select tablename || ' / ' || policyname as regel, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') as bedingung
  from pg_policies where schemaname = 'public' and tablename in ('fahrzeuge', 'inventar')
 order by 1;
