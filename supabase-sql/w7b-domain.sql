-- ============================================================
-- ARGONAUT OS · W7b · Eigene Kundendomain
-- Speichert die vom Kunden gekaufte Domain an der Seite. Der Proxy leitet
-- Aufrufe dieser Domain auf /p-domain/<host>, das die Seite ausliefert.
-- (Die Domain muss zusätzlich EINMAL im Hoster/Vercel hinterlegt werden —
--  dann kommt das SSL-Zertifikat automatisch.)
-- Additiv · idempotent · NICHT destruktiv.
-- ============================================================

alter table public.web_seiten
  add column if not exists domain text;

-- Eine Domain zeigt auf genau EINE Seite (mehrere NULL erlaubt).
create unique index if not exists web_seiten_domain_idx
  on public.web_seiten (domain)
  where domain is not null;
