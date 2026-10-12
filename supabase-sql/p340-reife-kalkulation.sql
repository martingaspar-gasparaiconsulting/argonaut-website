-- ============================================================
-- ARGONAUT OS · Paket 340 (12.10.2026) · BV3a Manufaktur Teil 2
-- Kalkulation mit Reifeverlust
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- reife_kalk: eine Kalkulation je Reife-Charge (Einkauf, Reifekosten je Tag,
--             sonstige Kosten, Parierverlust, erwarteter Reifeverlust,
--             Wunsch-Marge, Umsatzsteuersatz, gewählter Verkaufspreis).
--
-- Eigene Tabelle statt Spalten an reife_charge: Einkaufspreise sehen nur
-- die Geschäftsleitung und Mitarbeiter mit „Darf abrechnen" (wie die
-- Fahrzeug-Kalkulation, Paket 265). Wer nur „Lebensmittel" hat, sieht die
-- Reife-Uhr weiter — aber keine Preise.
--
-- Wächter p340: Charge gehört zum Betrieb, Betrieb und Charge bleiben fest.
-- ============================================================

create table if not exists public.reife_kalk (
  charge_id          uuid primary key references public.reife_charge(id) on delete cascade,
  owner_user_id      uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  ek_art             text not null default 'je_einheit' check (ek_art in ('gesamt', 'je_einheit')),
  ek_wert            numeric(14,4) check (ek_wert is null or ek_wert between 0 and 10000000),
  kosten_tag         numeric(12,2) check (kosten_tag is null or kosten_tag between 0 and 100000),
  kosten_sonst       numeric(14,2) check (kosten_sonst is null or kosten_sonst between 0 and 10000000),
  parier_prozent     numeric(5,2) check (parier_prozent is null or parier_prozent between 0 and 90),
  erwarteter_verlust numeric(5,2) check (erwarteter_verlust is null or erwarteter_verlust between 0 and 90),
  marge_prozent      numeric(5,2) check (marge_prozent is null or marge_prozent between 0 and 95),
  mwst_satz          numeric(4,1) not null default 7 check (mwst_satz in (0, 7, 19)),
  vk_preis           numeric(12,2) check (vk_preis is null or vk_preis between 0 and 1000000),
  geaendert_von      uuid default auth.uid(),
  aktualisiert_am    timestamptz not null default now()
);
create index if not exists reife_kalk_owner_idx on public.reife_kalk (owner_user_id);

alter table public.reife_kalk enable row level security;

drop trigger if exists p181_besitzer on public.reife_kalk;
create trigger p181_besitzer before insert or update on public.reife_kalk
  for each row execute function public.p181_besitzer();

create or replace function public.p340_reife_kalk_waechter()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' then
    if new.owner_user_id is distinct from old.owner_user_id then
      raise exception 'Der Betrieb eines Eintrags kann nicht geändert werden.';
    end if;
    if new.charge_id is distinct from old.charge_id then
      raise exception 'Die Kalkulation bleibt bei ihrer Charge.';
    end if;
  end if;
  if not exists (select 1 from public.reife_charge c where c.id = new.charge_id and c.owner_user_id = new.owner_user_id) then
    raise exception 'Die Charge gehört nicht zu Ihrem Betrieb.';
  end if;
  new.aktualisiert_am := now();
  new.geaendert_von := auth.uid();
  return new;
end;
$$;

drop trigger if exists p340_waechter on public.reife_kalk;
create trigger p340_waechter before insert or update on public.reife_kalk
  for each row execute function public.p340_reife_kalk_waechter();

-- Regeln: Geschäftsleitung alles; Mitarbeiter nur mit „Darf abrechnen" UND Recht „Lebensmittel"
drop policy if exists rfk_owner_all on public.reife_kalk;
create policy rfk_owner_all on public.reife_kalk for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p340_ma_select on public.reife_kalk;
create policy p340_ma_select on public.reife_kalk for select to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen()
         and (public.darf_ich_modul_sehen('lebensmittel') or public.darf_ich_modul_aendern('lebensmittel')));
drop policy if exists p340_ma_insert on public.reife_kalk;
create policy p340_ma_insert on public.reife_kalk for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen() and public.darf_ich_modul_aendern('lebensmittel'));
drop policy if exists p340_ma_update on public.reife_kalk;
create policy p340_ma_update on public.reife_kalk for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen() and public.darf_ich_modul_aendern('lebensmittel'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen() and public.darf_ich_modul_aendern('lebensmittel'));

-- KONTROLLE — Erwartung: tabellen = 1 | regeln = 4 | ausloeser = 2 | rls_an = 1
-- (regeln = 5 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel aus Paket 164)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'reife_kalk') as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'reife_kalk') as regeln,
  (select count(*) from pg_trigger where tgrelid = 'public.reife_kalk'::regclass and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname = 'reife_kalk' and relrowsecurity) as rls_an;
