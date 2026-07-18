-- ============================================================
-- ARGONAUT OS · Bündel 15 · Schnittstellen-Basis (Konnektor-Fundament)
-- Eine Tabelle je Betrieb, die pro Bereich (typ) festhält, WELCHER externe
-- Anbieter genutzt wird und mit welchen Zugangsdaten. Alle künftigen externen
-- Module (Kasse/TSE, Shop, ...) lesen ihre Konfiguration hier.
--
-- WICHTIG · SICHERHEIT: config enthält Geheimnisse (API-Keys). Deshalb sieht
-- NUR der Eigentümer diese Zeilen (kein Mitarbeiter-Read). Die Keys werden
-- ausschließlich serverseitig verwendet.
-- Nicht-brechend · idempotent.
-- ============================================================

create table if not exists public.betrieb_integrationen (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  typ            text not null,                    -- 'tse' | 'shop' | ...
  anbieter       text not null default 'demo',     -- 'demo' | 'fiskaly' | 'shopware' | ...
  config         jsonb not null default '{}'::jsonb, -- Zugangsdaten (nur serverseitig genutzt)
  aktiv          boolean not null default false,   -- true = echter Anbieter scharf geschaltet
  status_text    text,                             -- Ergebnis der letzten Testverbindung
  aktualisiert_am timestamptz not null default now(),
  erstellt_am    timestamptz not null default now()
);
-- Eine Integration je Bereich und Betrieb.
create unique index if not exists betrieb_integrationen_uidx on public.betrieb_integrationen (owner_user_id, typ);

alter table public.betrieb_integrationen enable row level security;

-- NUR der Eigentümer (Geheimnisse!). Bewusst KEINE Mitarbeiter-Policy.
drop policy if exists bi_owner_all on public.betrieb_integrationen;
create policy bi_owner_all on public.betrieb_integrationen
  for all to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));
