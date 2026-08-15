-- ============================================================
-- ARGONAUT OS · Thema 5 · Academy-Ausbau (Schritt 1/5)
--
-- STAND VORHER: Die Academy ist ein Schaufenster. `academy_kurse` sind
-- GLOBALE Stammdaten (Policy academy_read_all: for select to public using
-- (true)) — jeder Betrieb sieht dieselben Kurse, niemand darf hineinschreiben.
-- Es gibt keinen Player, keinen Fortschritt, keinen Video-Speicher.
--
-- Diese Datei ergaenzt drei Dinge — OHNE die globalen Kurse anzufassen:
--
--  1) academy_fortschritt — wie weit ist wer gekommen.
--     BESONDERES RLS-MUSTER, bewusst abweichend vom Standard: Ein Mitarbeiter
--     sieht NUR SEINEN EIGENEN Fortschritt, nie den der Kollegen. Der Chef
--     sieht alle seines Betriebs. Wer wie schnell lernt, geht das Team nichts
--     an — das waere sonst eine Leistungsueberwachung durch die Hintertuer.
--
--  2) academy_kurse_eigen — die Kurse des Betriebs selbst. Getrennte Tabelle
--     statt owner_user_id an die globalen Kurse zu haengen: die globale
--     Tabelle bleibt unangetastet, und ein Betrieb kann nie versehentlich
--     einen Kurs aller anderen aendern.
--
--  3) academy_medaillen — verliehene Auszeichnungen. Die Raenge selbst stehen
--     im Code (wie bei lib/onboardingStufen.ts), hier steht nur, wer wann
--     welche bekommen hat — damit sie nicht bei jedem Geraetewechsel neu
--     "verliehen" wird.
--
-- Dazu der Storage-Bucket fuer die Videos: NICHT oeffentlich (anders als
-- 'webseiten'), Zugriff nur ueber signierte Links. Schulungsvideos zeigen
-- Betriebsinterna — die haben im offenen Netz nichts verloren.
--
-- Nicht-brechend · idempotent · RLS wie beschrieben.
-- ============================================================

-- ---------- 1) Fortschritt ----------
create table if not exists public.academy_fortschritt (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null,                      -- der Betrieb (Chef)
  user_id         uuid not null,                      -- wer lernt
  kurs_id         uuid not null,
  kurs_quelle     text not null default 'global',     -- global | eigen
  sekunden        integer not null default 0,         -- gesehene Sekunden
  laenge_sekunden integer not null default 0,         -- Laenge des Videos
  prozent         integer not null default 0,         -- 0..100
  abgeschlossen   boolean not null default false,
  abgeschlossen_am timestamptz,
  zuletzt_am      timestamptz not null default now(),
  erstellt_am     timestamptz not null default now()
);
create unique index if not exists academy_fortschritt_uidx
  on public.academy_fortschritt (user_id, kurs_id, kurs_quelle);
create index if not exists academy_fortschritt_chef_idx
  on public.academy_fortschritt (owner_user_id, zuletzt_am desc);

alter table public.academy_fortschritt enable row level security;

-- Sehen: der Lernende selbst ODER der Chef des Betriebs. KEIN mein_chef_id()
-- hier — sonst saehe jeder Mitarbeiter den Lernstand aller Kollegen.
drop policy if exists af_select on public.academy_fortschritt;
create policy af_select on public.academy_fortschritt for select to public
  using ((auth.uid() = user_id) or (auth.uid() = owner_user_id));

-- Schreiben darf nur der Lernende selbst — niemand bucht fremden Fortschritt.
drop policy if exists af_insert on public.academy_fortschritt;
create policy af_insert on public.academy_fortschritt for insert to public
  with check ((auth.uid() = user_id));
drop policy if exists af_update on public.academy_fortschritt;
create policy af_update on public.academy_fortschritt for update to public
  using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

-- Loeschen darf der Chef (Aufraeumen beim Austritt) oder der Lernende selbst.
drop policy if exists af_delete on public.academy_fortschritt;
create policy af_delete on public.academy_fortschritt for delete to public
  using ((auth.uid() = user_id) or (auth.uid() = owner_user_id));

-- ---------- 2) Eigene Kurse des Betriebs ----------
create table if not exists public.academy_kurse_eigen (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  titel          text not null default 'Neuer Kurs',
  beschreibung   text,
  kategorie      text not null default 'Eigene Schulungen',
  video_pfad     text,                                 -- Pfad im Bucket academy-videos
  video_url      text,                                 -- alternativ: externer Link
  dauer_minuten  integer not null default 0,
  icon           text not null default '🎬',
  sortierung     integer not null default 100,
  aktiv          boolean not null default true,
  transkript     text,                                 -- KI-Transkript (Schritt 4)
  untertitel_vtt text,                                 -- WebVTT-Untertitel (Schritt 4)
  pflicht        boolean not null default false,       -- Pflichtschulung fuer alle
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists academy_kurse_eigen_idx
  on public.academy_kurse_eigen (owner_user_id, aktiv, sortierung);

alter table public.academy_kurse_eigen enable row level security;

drop policy if exists ake_select on public.academy_kurse_eigen;
create policy ake_select on public.academy_kurse_eigen for select to public using ((auth.uid() = owner_user_id));
drop policy if exists ake_select_ma on public.academy_kurse_eigen;
create policy ake_select_ma on public.academy_kurse_eigen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ake_insert on public.academy_kurse_eigen;
create policy ake_insert on public.academy_kurse_eigen for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists ake_update on public.academy_kurse_eigen;
create policy ake_update on public.academy_kurse_eigen for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ake_delete on public.academy_kurse_eigen;
create policy ake_delete on public.academy_kurse_eigen for delete to public using ((auth.uid() = owner_user_id));

-- ---------- 3) Medaillen ----------
create table if not exists public.academy_medaillen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  user_id       uuid not null,
  medaille_key  text not null,                         -- der Rang aus dem Code
  verliehen_am  timestamptz not null default now(),
  notiz         text
);
create unique index if not exists academy_medaillen_uidx
  on public.academy_medaillen (user_id, medaille_key);
create index if not exists academy_medaillen_chef_idx
  on public.academy_medaillen (owner_user_id, verliehen_am desc);

alter table public.academy_medaillen enable row level security;

drop policy if exists am_select on public.academy_medaillen;
create policy am_select on public.academy_medaillen for select to public
  using ((auth.uid() = user_id) or (auth.uid() = owner_user_id));
drop policy if exists am_insert on public.academy_medaillen;
create policy am_insert on public.academy_medaillen for insert to public
  with check ((auth.uid() = user_id));
drop policy if exists am_delete on public.academy_medaillen;
create policy am_delete on public.academy_medaillen for delete to public
  using ((auth.uid() = user_id) or (auth.uid() = owner_user_id));

-- ---------- 4) Video-Speicher ----------
-- NICHT oeffentlich: Schulungsvideos zeigen Betriebsinterna. Der Zugriff
-- laeuft ueber zeitlich begrenzte, signierte Links.
-- 300 MB je Datei — ein 10-Minuten-Video in verntuenftiger Qualitaet passt
-- darunter; wer laenger dreht, teilt es in Kapitel.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'academy-videos',
  'academy-videos',
  false,
  314572800,
  array['video/mp4','video/webm','video/quicktime','video/x-m4v','audio/mpeg','audio/mp4']
)
on conflict (id) do nothing;

-- Jeder Betrieb arbeitet ausschliesslich in seinem eigenen Ordner:
-- academy-videos/<owner_user_id>/<datei>. Der erste Pfadteil MUSS die
-- eigene Benutzer-ID sein — damit kann niemand in fremden Ordnern stoebern.
drop policy if exists "academy_videos_lesen" on storage.objects;
create policy "academy_videos_lesen" on storage.objects for select to authenticated
  using (
    bucket_id = 'academy-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[1] = mein_chef_id()::text
    )
  );

drop policy if exists "academy_videos_schreiben" on storage.objects;
create policy "academy_videos_schreiben" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'academy-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "academy_videos_aendern" on storage.objects;
create policy "academy_videos_aendern" on storage.objects for update to authenticated
  using (bucket_id = 'academy-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "academy_videos_loeschen" on storage.objects;
create policy "academy_videos_loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'academy-videos' and (storage.foldername(name))[1] = auth.uid()::text);
