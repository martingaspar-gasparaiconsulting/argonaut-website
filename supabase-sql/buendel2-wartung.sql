-- ============================================================
-- ARGONAUT OS · Bündel 2 · Wartung & Prüfung
-- 1) Erinnerungs-Merker auf den Wartungsverträgen (Doppel-Mail-Schutz).
-- 2) Historie-/Prüfprotokoll-Tabelle je Wartungsvertrag (Anlagen-Akte).
-- Nicht-brechend · idempotent · RLS spiegelt die Wartungsverträge-Policies.
-- ============================================================

-- 1) Doppel-Versand-Schutz für die automatische Erinnerung.
--    Wird beim nächsten „Gewartet" in der App wieder auf null gesetzt.
alter table public.wartungsvertraege
  add column if not exists erinnerung_gesendet_am timestamptz;

-- 2) Historie / Prüfprotokolle je Vertrag.
create table if not exists public.wartungshistorie (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null,
  wartungsvertrag_id    uuid not null references public.wartungsvertraege(id) on delete cascade,
  durchgefuehrt_am      date not null default current_date,
  pruefer               text,
  ergebnis              text not null default 'bestanden',   -- bestanden | mangel | nachpruefung
  pruefpunkte           jsonb not null default '[]'::jsonb,  -- [{punkt, ok, bemerkung}]
  bemerkung             text,
  naechste_faelligkeit_am date,
  erstellt_von          uuid,
  erstellt_am           timestamptz not null default now()
);

create index if not exists wartungshistorie_vertrag_idx
  on public.wartungshistorie (wartungsvertrag_id, durchgefuehrt_am desc);

alter table public.wartungshistorie enable row level security;

-- RLS: 1:1 wie wartungsvertraege — Chef sieht/pflegt seine, Mitarbeiter sieht die des Chefs.
drop policy if exists whist_select on public.wartungshistorie;
create policy whist_select on public.wartungshistorie
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists whist_select_mitarbeiter on public.wartungshistorie;
create policy whist_select_mitarbeiter on public.wartungshistorie
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists whist_insert on public.wartungshistorie;
create policy whist_insert on public.wartungshistorie
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists whist_update on public.wartungshistorie;
create policy whist_update on public.wartungshistorie
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists whist_delete on public.wartungshistorie;
create policy whist_delete on public.wartungshistorie
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));
