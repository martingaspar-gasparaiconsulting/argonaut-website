-- ============================================================
-- ARGONAUT OS · RLS-Policies (globale Stammdaten: Lesen für alle)
-- Echter DB-Stand (Export 02.07.26). Idempotent (DROP + CREATE).
--
-- agents (24 KI-Agenten) und academy_kurse sind für ALLE Kunden gleich,
-- daher: SELECT für alle erlaubt (USING true). Kein WITH CHECK (nur Lesen,
-- kein Schreiben über diese Policy).
-- ============================================================

-- ---------- agents: Lesen für alle ----------
alter table public.agents enable row level security;
drop policy if exists agents_read_all on public.agents;
create policy agents_read_all on public.agents
  for select
  to public
  using (true);

-- ---------- academy_kurse: Lesen für alle ----------
alter table public.academy_kurse enable row level security;
drop policy if exists academy_read_all on public.academy_kurse;
create policy academy_read_all on public.academy_kurse
  for select
  to public
  using (true);
