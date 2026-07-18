-- ============================================================
-- ARGONAUT OS · Bündel 13 · Förder-Angebot-Generator
-- Erzeugt förder-taugliche Angebote (Kostenvoranschläge) für Kunden, die
-- damit einen Digitalbonus-/Beratungs-Antrag stellen. Speichert Positionen,
-- Netto-Summe und die angenommene Förderquote je Angebot.
-- Nicht-brechend · idempotent · RLS wie die uebrigen Module.
-- ============================================================

create table if not exists public.foerder_angebote (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  kontakt_id     uuid references public.kontakte(id) on delete set null,
  kunde_name     text,
  titel          text not null default 'ARGONAUT Einführungspaket',
  positionen     jsonb not null default '[]'::jsonb,   -- [{bezeichnung, netto}]
  netto_summe    numeric(12,2) not null default 0,
  foerderquote   integer not null default 50,          -- Prozent (Annahme fuer die Schaetzung)
  notiz          text,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists foerder_angebote_idx on public.foerder_angebote (owner_user_id, erstellt_am desc);

alter table public.foerder_angebote enable row level security;

drop policy if exists fa_select on public.foerder_angebote;
create policy fa_select on public.foerder_angebote for select to public using ((auth.uid() = owner_user_id));
drop policy if exists fa_select_ma on public.foerder_angebote;
create policy fa_select_ma on public.foerder_angebote for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists fa_insert on public.foerder_angebote;
create policy fa_insert on public.foerder_angebote for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists fa_update on public.foerder_angebote;
create policy fa_update on public.foerder_angebote for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists fa_delete on public.foerder_angebote;
create policy fa_delete on public.foerder_angebote for delete to public using ((auth.uid() = owner_user_id));
