-- ============================================================
-- ARGONAUT OS · Paket PQ · Gesundheit Stufe 1 (H01, H02, H03) — Stand 24.09.2026
--
--   praxis_einwilligung   Einwilligungen mit Unterschrift (Widerruf = NEUE Zeile)
--   praxis_recall         Recall-Einstellung je Kunde (Intervall, fester Termin, Pause)
--   praxis_ausfall        Ausfälle / Ausfallhonorar
--   gesundheit_freigabe   welche Mitarbeiter Gesundheitsangaben sehen dürfen
--   gesundheit_notiz      Gesundheitsangaben, VERSCHLÜSSELT (Check-Regel: nur "v1:..." erlaubt)
--   gesundheit_zugriff    Zugriffsprotokoll — nur anhängen, niemand ändert oder löscht
--
-- ADDITIV UND IDEMPOTENT. Bezug: wellness_kunden (Bündel 27).
-- Besitzer = Betrieb: coalesce(mein_chef_id(), auth.uid()).
-- H02 (HWG-Wächter) braucht kein SQL.
-- ============================================================

-- ---------- Einwilligungen ----------
create table if not exists public.praxis_einwilligung (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default coalesce(mein_chef_id(), auth.uid()),
  kunde_id          uuid not null references public.wellness_kunden(id) on delete cascade,
  art               text not null check (art in ('datenschutz','recall','ausfall','foto','foto_werbung','weitergabe')),
  widerruf          boolean not null default false,
  version           text,
  text_kopie        text,
  daten             jsonb not null default '{}'::jsonb,
  name_unterschrift text,
  unterschrift      text,
  erteilt_am        timestamptz not null default now(),
  erfasst_von       uuid default auth.uid()
);
create index if not exists praxis_einwilligung_kunde_idx on public.praxis_einwilligung (kunde_id, art, erteilt_am desc);

-- ---------- Recall ----------
create table if not exists public.praxis_recall (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null default coalesce(mein_chef_id(), auth.uid()),
  kunde_id            uuid not null references public.wellness_kunden(id) on delete cascade,
  intervall_monate    integer not null default 6 check (intervall_monate between 1 and 60),
  naechster_am        date,
  pausiert            boolean not null default false,
  anlass              text,
  zuletzt_erinnert_am date,
  zuletzt_kanal       text,
  erstellt_am         timestamptz not null default now()
);
create unique index if not exists praxis_recall_kunde_uidx on public.praxis_recall (kunde_id);

-- ---------- Ausfälle ----------
create table if not exists public.praxis_ausfall (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  kunde_id      uuid not null references public.wellness_kunden(id) on delete cascade,
  termin_am     timestamptz not null,
  abgesagt_am   timestamptz,
  neu_vergeben  boolean not null default false,
  ergebnis      text,
  betrag        numeric(10,2),
  status        text not null default 'offen' check (status in ('offen','gefordert','bezahlt','erlassen')),
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists praxis_ausfall_owner_idx on public.praxis_ausfall (owner_user_id, termin_am desc);

-- ---------- Gesundheitsdaten-Schicht ----------
create table if not exists public.gesundheit_freigabe (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  auth_user_id  uuid not null,
  name          text,
  erstellt_am   timestamptz not null default now()
);
create unique index if not exists gesundheit_freigabe_uidx on public.gesundheit_freigabe (owner_user_id, auth_user_id);

create table if not exists public.gesundheit_notiz (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kunde_id      uuid not null references public.wellness_kunden(id) on delete cascade,
  art           text not null check (art in ('allergie','unvertraeglichkeit','kontraindikation','medikation','hinweis')),
  inhalt        text not null check (inhalt ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now()
);
create index if not exists gesundheit_notiz_kunde_idx on public.gesundheit_notiz (kunde_id, erstellt_am desc);

create table if not exists public.gesundheit_zugriff (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  user_id       uuid not null default auth.uid(),
  kunde_id      uuid not null,
  notiz_id      uuid,
  aktion        text not null check (aktion in ('lesen','anlegen','loeschen')),
  anzahl        integer not null default 1,
  zeit          timestamptz not null default now()
);
create index if not exists gesundheit_zugriff_owner_idx on public.gesundheit_zugriff (owner_user_id, zeit desc);

alter table public.praxis_einwilligung enable row level security;
alter table public.praxis_recall       enable row level security;
alter table public.praxis_ausfall      enable row level security;
alter table public.gesundheit_freigabe enable row level security;
alter table public.gesundheit_notiz    enable row level security;
alter table public.gesundheit_zugriff  enable row level security;

do $$
begin
  -- Einwilligungen: niemand ändert eine Einwilligung (Widerruf = neue Zeile). Chef darf löschen.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='praxis_einwilligung' and policyname='pe_chef_select') then
    create policy pe_chef_select on public.praxis_einwilligung for select to authenticated using (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='praxis_einwilligung' and policyname='pe_chef_insert') then
    create policy pe_chef_insert on public.praxis_einwilligung for insert to authenticated with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='praxis_einwilligung' and policyname='pe_chef_delete') then
    create policy pe_chef_delete on public.praxis_einwilligung for delete to authenticated using (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='praxis_einwilligung' and policyname='pe_ma_select') then
    create policy pe_ma_select on public.praxis_einwilligung for select to authenticated using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='praxis_einwilligung' and policyname='pe_ma_insert') then
    create policy pe_ma_insert on public.praxis_einwilligung for insert to authenticated
      with check (owner_user_id = mein_chef_id() and erfasst_von = auth.uid());
  end if;

  -- Recall: Empfang pflegt mit.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='praxis_recall' and policyname='pr_chef_all') then
    create policy pr_chef_all on public.praxis_recall for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='praxis_recall' and policyname='pr_ma_select') then
    create policy pr_ma_select on public.praxis_recall for select to authenticated using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='praxis_recall' and policyname='pr_ma_insert') then
    create policy pr_ma_insert on public.praxis_recall for insert to authenticated with check (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='praxis_recall' and policyname='pr_ma_update') then
    create policy pr_ma_update on public.praxis_recall for update to authenticated using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
  end if;

  -- Ausfälle: Mitarbeiter erfassen, Chef entscheidet.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='praxis_ausfall' and policyname='pa_chef_all') then
    create policy pa_chef_all on public.praxis_ausfall for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='praxis_ausfall' and policyname='pa_ma_select') then
    create policy pa_ma_select on public.praxis_ausfall for select to authenticated using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='praxis_ausfall' and policyname='pa_ma_insert') then
    create policy pa_ma_insert on public.praxis_ausfall for insert to authenticated with check (owner_user_id = mein_chef_id());
  end if;

  -- Freigaben: nur der Chef verwaltet; ein Mitarbeiter sieht nur seine eigene Zeile.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gesundheit_freigabe' and policyname='gf_chef_all') then
    create policy gf_chef_all on public.gesundheit_freigabe for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gesundheit_freigabe' and policyname='gf_selbst_select') then
    create policy gf_selbst_select on public.gesundheit_freigabe for select to authenticated using (auth_user_id = auth.uid());
  end if;

  -- Notizen: Chef alles ausser Aendern; freigegebene Mitarbeiter lesen und anlegen. Niemand aendert.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gesundheit_notiz' and policyname='gn_chef_select') then
    create policy gn_chef_select on public.gesundheit_notiz for select to authenticated using (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gesundheit_notiz' and policyname='gn_chef_insert') then
    create policy gn_chef_insert on public.gesundheit_notiz for insert to authenticated with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gesundheit_notiz' and policyname='gn_chef_delete') then
    create policy gn_chef_delete on public.gesundheit_notiz for delete to authenticated using (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gesundheit_notiz' and policyname='gn_ma_select') then
    create policy gn_ma_select on public.gesundheit_notiz for select to authenticated
      using (owner_user_id = mein_chef_id() and exists (select 1 from public.gesundheit_freigabe f where f.owner_user_id = gesundheit_notiz.owner_user_id and f.auth_user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gesundheit_notiz' and policyname='gn_ma_insert') then
    create policy gn_ma_insert on public.gesundheit_notiz for insert to authenticated
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid()
        and exists (select 1 from public.gesundheit_freigabe f where f.owner_user_id = gesundheit_notiz.owner_user_id and f.auth_user_id = auth.uid()));
  end if;

  -- Protokoll: nur anhaengen (eigene Zeilen), lesen nur der Chef. Kein update, kein delete.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gesundheit_zugriff' and policyname='gz_insert') then
    create policy gz_insert on public.gesundheit_zugriff for insert to authenticated
      with check (user_id = auth.uid() and (owner_user_id = auth.uid()
        or (owner_user_id = mein_chef_id() and exists (select 1 from public.gesundheit_freigabe f where f.owner_user_id = gesundheit_zugriff.owner_user_id and f.auth_user_id = auth.uid()))));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gesundheit_zugriff' and policyname='gz_chef_select') then
    create policy gz_chef_select on public.gesundheit_zugriff for select to authenticated using (owner_user_id = auth.uid());
  end if;
end $$;

-- ---------- LESEN: Kontrolle ----------
select t.tablename as tabelle, t.rowsecurity as rls_an, (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=t.tablename) as regeln
  from pg_tables t
 where t.schemaname='public'
   and t.tablename in ('praxis_einwilligung','praxis_recall','praxis_ausfall','gesundheit_freigabe','gesundheit_notiz','gesundheit_zugriff')
 order by 1;
