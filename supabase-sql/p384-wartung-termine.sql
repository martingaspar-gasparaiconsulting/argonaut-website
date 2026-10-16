-- ============================================================================
-- ARGONAUT OS · Paket 384 · LK7 Wartung legt Termine selbst an (16.10.2026)
-- ADDITIV + IDEMPOTENT: nur neue Spalten und Indexe, nichts wird geloescht.
-- Der Code laeuft auch ohne dieses SQL (dann wie bisher nur die Mail an den
-- Betrieb); mit dem SQL legt der taegliche Lauf Terminvorschlaege an.
-- ============================================================================

alter table public.termine
  add column if not exists wartungsvertrag_id uuid
    references public.wartungsvertraege(id) on delete set null,
  add column if not exists bestaetigung_token text,
  add column if not exists kunde_bestaetigt_am timestamptz;

create unique index if not exists termine_bestaetigung_token_uq
  on public.termine (bestaetigung_token)
  where bestaetigung_token is not null;

create index if not exists termine_wartungsvertrag_idx
  on public.termine (wartungsvertrag_id)
  where wartungsvertrag_id is not null;

alter table public.wartungsvertraege
  add column if not exists termin_auto boolean not null default true;

-- Kontrolle: muss 4 ergeben
select count(*) as spalten_p384
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'termine' and column_name in
        ('wartungsvertrag_id', 'bestaetigung_token', 'kunde_bestaetigt_am'))
    or (table_name = 'wartungsvertraege' and column_name = 'termin_auto'));
