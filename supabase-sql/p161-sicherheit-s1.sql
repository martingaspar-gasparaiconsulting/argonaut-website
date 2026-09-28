-- ============================================================
-- ARGONAUT OS · Paket 161 (S1, 28.09.2026) · Offene Tueren absichern
--
--   oeffentlich_drossel  Mengen-Zaehler fuer die offenen Tueren (lib/drossel.ts).
--                        Nur Einweg-Hashes, nie IP oder Mail-Adresse.
--                        Kein Zugriff fuer angemeldete Nutzer, nur der Server.
--   drossel_zaehlen()    zaehlt atomar hoch, true = darf weiter.
--   shop_widerrufe       jeder elektronische Widerruf aus dem Shop wird
--                        gespeichert (Nachweis des Zugangs). Nur die
--                        Geschaeftsleitung liest; niemand loescht.
--
-- NEUE Tabellen + eine Funktion, sonst nichts. Mehrfach ausfuehrbar.
-- Sperrt niemanden aus: Solange dieses SQL fehlt, laufen alle Tueren wie
-- bisher (der Zaehler laesst bei Fehlern durch).
-- ============================================================

create table if not exists public.oeffentlich_drossel (
  schluessel  text primary key,
  anzahl      integer not null default 0,
  bis         timestamptz not null
);
create index if not exists oeffentlich_drossel_bis_idx on public.oeffentlich_drossel (bis);
alter table public.oeffentlich_drossel enable row level security;
-- bewusst KEINE Policy: anon/authenticated sehen nichts, nur service_role.

create or replace function public.drossel_zaehlen(p_schluessel text, p_max integer, p_fenster_sek integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anzahl integer;
begin
  if p_schluessel is null or length(p_schluessel) > 100
     or p_max is null or p_max < 1
     or p_fenster_sek is null or p_fenster_sek < 1 or p_fenster_sek > 604800 then
    return true;
  end if;

  insert into public.oeffentlich_drossel as d (schluessel, anzahl, bis)
  values (p_schluessel, 1, now() + make_interval(secs => p_fenster_sek))
  on conflict (schluessel) do update
    set anzahl = case when d.bis <= now() then 1 else d.anzahl + 1 end,
        bis    = case when d.bis <= now() then now() + make_interval(secs => p_fenster_sek) else d.bis end
  returning anzahl into v_anzahl;

  -- nebenbei aufraeumen (etwa jeder 100. Aufruf)
  if random() < 0.01 then
    delete from public.oeffentlich_drossel where bis < now() - interval '1 day';
  end if;

  return v_anzahl <= p_max;
end;
$$;

revoke all on function public.drossel_zaehlen(text, integer, integer) from public;
revoke all on function public.drossel_zaehlen(text, integer, integer) from anon;
revoke all on function public.drossel_zaehlen(text, integer, integer) from authenticated;
grant execute on function public.drossel_zaehlen(text, integer, integer) to service_role;

create table if not exists public.shop_widerrufe (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  seite          text,
  name           text not null,
  anschrift      text,
  email          text not null,
  bestellung     text,
  datum          text,
  ware           text not null,
  eingang_am     timestamptz not null default now(),
  erledigt_am    timestamptz,
  erledigt_von   uuid
);
create index if not exists shop_widerrufe_owner_idx on public.shop_widerrufe (owner_user_id, eingang_am desc);
alter table public.shop_widerrufe enable row level security;

drop policy if exists swr_chef_select on public.shop_widerrufe;
create policy swr_chef_select on public.shop_widerrufe for select to authenticated
  using (owner_user_id = auth.uid());
drop policy if exists swr_chef_update on public.shop_widerrufe;
create policy swr_chef_update on public.shop_widerrufe for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
-- kein insert fuer angemeldete Nutzer (kommt nur ueber /api/oeffentlich/widerruf),
-- kein delete (Nachweis).

-- Kontrolle: zeigt 3 / 12 / 1
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'oeffentlich_drossel') as drossel_spalten,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'shop_widerrufe') as widerruf_spalten,
  (select count(*) from pg_proc where proname = 'drossel_zaehlen') as funktion;
