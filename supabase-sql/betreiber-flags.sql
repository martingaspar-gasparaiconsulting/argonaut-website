-- ============================================================
-- ARGONAUT OS · Betreiber-Schalter (Control Room) · CTA-Modus
-- Ein winziger, LIVE schaltbarer Schalter für die öffentlichen Knöpfe:
--   cta_modus = 'termin'    → alle Dossier-/Branchen-Knöpfe = „Termin vereinbaren"
--   cta_modus = 'bestellen' → Knöpfe führen in die Bestellstrecke (später)
-- Standard: 'termin'. Geschaltet wird im Command Center (Service-Role-Route),
-- öffentlich nur GELESEN (damit die Marketing-Seiten den Modus kennen).
-- Additiv · idempotent · NICHT destruktiv.
-- ============================================================

create table if not exists public.betreiber_flags (
  schluessel      text primary key,
  wert            text not null,
  aktualisiert_am timestamptz not null default now()
);

alter table public.betreiber_flags enable row level security;

-- Öffentlich lesbar (die Marketing-Seiten fragen den Modus ab).
drop policy if exists betreiber_flags_select on public.betreiber_flags;
create policy betreiber_flags_select on public.betreiber_flags
  as PERMISSIVE for SELECT to public using (true);

-- Schreiben passiert ausschließlich serverseitig über die Service-Role
-- (umgeht RLS) — daher bewusst KEINE public INSERT/UPDATE-Policy.

-- Standardwert setzen, falls noch nicht vorhanden.
insert into public.betreiber_flags (schluessel, wert)
  values ('cta_modus', 'termin')
  on conflict (schluessel) do nothing;
