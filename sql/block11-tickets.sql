-- ============================================================
-- BLOCK 11 · KUNDENSERVICE — T1 DATENMODELL
-- tickets + ticket_verlauf | RLS owner-only | idempotent
-- Ausgeführt: Supabase znrjnndfzzydnhbyntwa (eu-north-1)
-- ============================================================

-- 1) HAUPTTABELLE: tickets
create table if not exists public.tickets (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,

  ticket_nummer   text,                        -- TK-JJJJ-XXXX (Vergabe in T2)
  betreff         text not null,
  beschreibung    text,

  status          text not null default 'offen'
                    check (status in ('offen','in_bearbeitung','wartet','geloest','geschlossen')),
  prioritaet      text not null default 'mittel'
                    check (prioritaet in ('niedrig','mittel','hoch','dringend')),
  kategorie       text not null default 'anfrage'
                    check (kategorie in ('anfrage','support','reklamation','sonstiges')),
  kanal           text not null default 'email'
                    check (kanal in ('email','telefon','web','persoenlich')),

  -- Kundendaten (Freitext für Solo-Betrieb; kunde_id folgt im Finale)
  kunde_name      text,
  kunde_email     text,
  kunde_telefon   text,

  -- Platzhalter (NICHT verbunden — erst im Finale)
  firma_id        uuid,
  kunde_id        uuid,
  kontakt_id      uuid,

  faellig_am      timestamptz,                 -- SLA-Frist (Ampel)
  geloest_am      timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 2) VERLAUF: ticket_verlauf (Kommentare, Notizen, Statuswechsel)
create table if not exists public.ticket_verlauf (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.tickets(id) on delete cascade,
  owner_user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,

  typ             text not null default 'kommentar'
                    check (typ in ('kommentar','notiz','statuswechsel')),
  inhalt          text,
  alt_status      text,
  neu_status      text,

  created_at      timestamptz not null default now()
);

-- 3) INDIZES
create index if not exists idx_tickets_owner   on public.tickets(owner_user_id);
create index if not exists idx_tickets_status  on public.tickets(status);
create index if not exists idx_tickets_faellig on public.tickets(faellig_am);
create index if not exists idx_verlauf_ticket  on public.ticket_verlauf(ticket_id);

-- 4) updated_at automatisch pflegen
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tickets_updated on public.tickets;
create trigger trg_tickets_updated
  before update on public.tickets
  for each row execute function public.set_updated_at();

-- 5) ROW LEVEL SECURITY (owner-only)
alter table public.tickets        enable row level security;
alter table public.ticket_verlauf enable row level security;

-- tickets Policies
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets
  for select using (owner_user_id = auth.uid());

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets
  for insert with check (owner_user_id = auth.uid());

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets
  for update using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets
  for delete using (owner_user_id = auth.uid());

-- ticket_verlauf Policies
drop policy if exists verlauf_select on public.ticket_verlauf;
create policy verlauf_select on public.ticket_verlauf
  for select using (owner_user_id = auth.uid());

drop policy if exists verlauf_insert on public.ticket_verlauf;
create policy verlauf_insert on public.ticket_verlauf
  for insert with check (owner_user_id = auth.uid());

drop policy if exists verlauf_delete on public.ticket_verlauf;
create policy verlauf_delete on public.ticket_verlauf
  for delete using (owner_user_id = auth.uid());
