-- ============================================================
-- ARGONAUT OS · SAMMEL-SQL · Bündel 10–34
-- Alle Tabellen + RLS in EINEM Skript, in Reihenfolge.
-- Idempotent: schon vorhandene Tabellen/Policies werden übersprungen.
-- Einmal komplett in den Supabase-SQL-Editor einfügen und ausführen.
-- ============================================================


-- ###########################################################
-- ##### buendel10-projekt-abrechnung.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 10 · Projekt-Abrechnung (billable)
-- Abrechenbare Leistungen/Zeiten je Projekt. Aus den offenen Posten entsteht
-- über /api/rechnung-aus-projekt eine echte Rechnung (bestehende Pipeline).
-- Nicht-brechend · idempotent · RLS wie die übrigen Module.
-- ============================================================

create table if not exists public.projektleistungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  projekt_id    uuid references public.projekte(id) on delete set null,
  kunde_name    text,
  datum         date not null default current_date,
  beschreibung  text not null,
  stunden       numeric(12,2) not null default 0,
  stundensatz   numeric(12,2) not null default 0,
  mwst_satz     numeric(5,2) not null default 19,
  abgerechnet   boolean not null default false,
  rechnung_id   uuid,
  erstellt_am   timestamptz not null default now()
);
create index if not exists projektleistungen_idx on public.projektleistungen (owner_user_id, projekt_id, abgerechnet);

alter table public.projektleistungen enable row level security;

drop policy if exists pl_select on public.projektleistungen;
create policy pl_select on public.projektleistungen for select to public using ((auth.uid() = owner_user_id));
drop policy if exists pl_select_ma on public.projektleistungen;
create policy pl_select_ma on public.projektleistungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists pl_insert on public.projektleistungen;
create policy pl_insert on public.projektleistungen for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists pl_update on public.projektleistungen;
create policy pl_update on public.projektleistungen for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists pl_delete on public.projektleistungen;
create policy pl_delete on public.projektleistungen for delete to public using ((auth.uid() = owner_user_id));


-- ###########################################################
-- ##### buendel11-kundenportal.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 11 · Kunden-Portal (Self-Service)
-- Jeder Kontakt kann einen eigenen, login-freien Portal-Link bekommen.
-- Über diesen Link sieht der Kunde AUSSCHLIESSLICH seine eigenen
-- Rechnungen und Termine — nichts Fremdes. Ein Token zeigt genau auf
-- einen Kontakt eines Betriebs.
--
-- Zugriff nach aussen laeuft NUR ueber /api/oeffentlich/portal (Service-Role,
-- Token-basiert, hart auf owner_user_id + kontakt_id gefiltert, fail-closed).
-- Nicht-brechend · idempotent · RLS wie die uebrigen Module.
-- ============================================================

create table if not exists public.portal_zugaenge (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null,
  kontakt_id       uuid not null references public.kontakte(id) on delete cascade,
  token            uuid not null default gen_random_uuid(),
  aktiv            boolean not null default true,
  erstellt_am      timestamptz not null default now(),
  letzter_zugriff_am timestamptz
);

-- Ein Token ist global eindeutig (Sicherheit: kein Erraten ueber Kollisionen).
create unique index if not exists portal_zugaenge_token_uidx on public.portal_zugaenge (token);
-- Pro Kontakt hoechstens EIN Zugang (kein Wildwuchs an Links je Kunde).
create unique index if not exists portal_zugaenge_kontakt_uidx on public.portal_zugaenge (kontakt_id);
create index if not exists portal_zugaenge_owner_idx on public.portal_zugaenge (owner_user_id, aktiv);

alter table public.portal_zugaenge enable row level security;

-- Owner: volle Kontrolle ueber die eigenen Zugaenge.
drop policy if exists pz_owner_all on public.portal_zugaenge;
create policy pz_owner_all on public.portal_zugaenge
  for all to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

-- Mitarbeiter: darf die Zugaenge seines Chefs sehen (Lesen genuegt fuer die Liste).
drop policy if exists pz_select_ma on public.portal_zugaenge;
create policy pz_select_ma on public.portal_zugaenge
  for select to public
  using ((owner_user_id = mein_chef_id()));

-- HINWEIS: Der oeffentliche Portal-Endpunkt nutzt die Service-Role und umgeht
-- damit RLS bewusst — er filtert dafuer selbst HART auf owner_user_id + kontakt_id
-- aus dem Token (fail-closed). Ohne gueltigen, aktiven Token gibt es keine Daten.


-- ###########################################################
-- ##### buendel12-foerdermittel.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 12 · Fördermittel-Assistent
-- Merkliste der verfolgten Förderprogramme je Betrieb — mit Status,
-- Frist und Notiz. Der Programm-Katalog selbst liegt statisch im Code
-- (app/dashboard/foerdermittel/programme.ts); hier wird nur gespeichert,
-- WELCHES Programm der Betrieb verfolgt und wie weit er ist.
-- Nicht-brechend · idempotent · RLS wie die uebrigen Module.
-- ============================================================

create table if not exists public.foerder_vorhaben (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  programm_key   text not null,                 -- Schluessel aus dem Katalog
  programm_name  text not null,                 -- Name (Kopie, falls Katalog sich aendert)
  status         text not null default 'interessiert',
  -- interessiert | beantragt | bewilligt | abgelehnt | abgeschlossen
  frist          date,                          -- naechste relevante Frist (optional)
  notiz          text,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists foerder_vorhaben_idx on public.foerder_vorhaben (owner_user_id, status);
-- Pro Betrieb ein Eintrag je Programm (kein Doppel).
create unique index if not exists foerder_vorhaben_uidx on public.foerder_vorhaben (owner_user_id, programm_key);

alter table public.foerder_vorhaben enable row level security;

drop policy if exists fv_select on public.foerder_vorhaben;
create policy fv_select on public.foerder_vorhaben for select to public using ((auth.uid() = owner_user_id));
drop policy if exists fv_select_ma on public.foerder_vorhaben;
create policy fv_select_ma on public.foerder_vorhaben for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists fv_insert on public.foerder_vorhaben;
create policy fv_insert on public.foerder_vorhaben for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists fv_update on public.foerder_vorhaben;
create policy fv_update on public.foerder_vorhaben for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists fv_delete on public.foerder_vorhaben;
create policy fv_delete on public.foerder_vorhaben for delete to public using ((auth.uid() = owner_user_id));


-- ###########################################################
-- ##### buendel13-foerder-angebot.sql
-- ###########################################################
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


-- ###########################################################
-- ##### buendel14-angebote.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 14 · Angebote mit Online-Zusage
-- Angebote (Kostenvoranschläge) -> Kunde nimmt online per Token-Link an oder
-- lehnt ab -> aus einem angenommenen Angebot entsteht per Klick eine Rechnung.
-- Muster wie rechnungen/rechnung_positionen. Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.angebote (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  kontakt_id     uuid references public.kontakte(id) on delete set null,
  angebotsnummer text,
  titel          text not null default 'Angebot',
  kunde_name     text,
  kunde_email    text,
  status         text not null default 'entwurf',
  -- entwurf | gesendet | angenommen | abgelehnt | abgelaufen
  gueltig_bis    date,
  netto_summe    numeric(12,2) not null default 0,
  mwst_summe     numeric(12,2) not null default 0,
  brutto_summe   numeric(12,2) not null default 0,
  token          uuid not null default gen_random_uuid(),
  angenommen_am  timestamptz,
  abgelehnt_am   timestamptz,
  rechnung_id    uuid,
  notiz          text,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create unique index if not exists angebote_token_uidx on public.angebote (token);
create index if not exists angebote_owner_idx on public.angebote (owner_user_id, status, erstellt_am desc);

create table if not exists public.angebot_positionen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  angebot_id    uuid not null references public.angebote(id) on delete cascade,
  position      integer not null default 1,
  bezeichnung   text not null default '',
  menge         numeric(12,2) not null default 1,
  einheit       text not null default 'Stk',
  einzelpreis   numeric(12,2) not null default 0,
  mwst_satz     numeric(5,2) not null default 19,
  gesamt_netto  numeric(12,2) not null default 0
);
create index if not exists angebot_positionen_idx on public.angebot_positionen (angebot_id, position);

alter table public.angebote enable row level security;
alter table public.angebot_positionen enable row level security;

-- angebote
drop policy if exists ang_select on public.angebote;
create policy ang_select on public.angebote for select to public using ((auth.uid() = owner_user_id));
drop policy if exists ang_select_ma on public.angebote;
create policy ang_select_ma on public.angebote for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ang_insert on public.angebote;
create policy ang_insert on public.angebote for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists ang_update on public.angebote;
create policy ang_update on public.angebote for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ang_delete on public.angebote;
create policy ang_delete on public.angebote for delete to public using ((auth.uid() = owner_user_id));

-- angebot_positionen
drop policy if exists angp_select on public.angebot_positionen;
create policy angp_select on public.angebot_positionen for select to public using ((auth.uid() = owner_user_id));
drop policy if exists angp_select_ma on public.angebot_positionen;
create policy angp_select_ma on public.angebot_positionen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists angp_insert on public.angebot_positionen;
create policy angp_insert on public.angebot_positionen for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists angp_update on public.angebot_positionen;
create policy angp_update on public.angebot_positionen for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists angp_delete on public.angebot_positionen;
create policy angp_delete on public.angebot_positionen for delete to public using ((auth.uid() = owner_user_id));

-- HINWEIS: Die Online-Zusage laeuft ueber /api/oeffentlich/angebot (Service-Role,
-- hart auf den Token gefiltert, fail-closed). Ein bereits angenommenes/abgelehntes
-- Angebot kann nicht erneut entschieden werden.


-- ###########################################################
-- ##### buendel15-schnittstellen.sql
-- ###########################################################
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


-- ###########################################################
-- ##### buendel16-kasse.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 16 · Kasse mit TSE
-- Fiskalkonforme Kasse: Belege (Bons) + Positionen. Die TSE-Signatur kommt
-- über den Konnektor (Bündel 15) — im Demo-Modus eine Demo-Signatur, mit
-- echtem Anbieter (fiskaly/Deutsche Fiskal/Epson) die echte TSE-Signatur.
-- Bestand wird beim Verkauf aus dem ERP (artikel) abgebucht (+ lagerbewegung).
-- Nicht-brechend · idempotent · RLS (Chef + Kassierer/Mitarbeiter).
-- ============================================================

create table if not exists public.kassen_belege (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  beleg_nr       text,
  typ            text not null default 'verkauf',   -- verkauf | retoure
  zahlart        text not null default 'bar',        -- bar | karte | ec | ueberweisung
  netto_summe    numeric(12,2) not null default 0,
  mwst_summe     numeric(12,2) not null default 0,
  brutto_summe   numeric(12,2) not null default 0,
  gegeben        numeric(12,2),
  rueckgeld      numeric(12,2),
  -- TSE-Felder (aus dem Konnektor)
  tse_modus      text not null default 'demo',       -- demo | live
  tse_anbieter   text,
  tse_signatur   text,
  tse_seriennummer text,
  tse_zeit       timestamptz,
  storniert      boolean not null default false,
  kassierer_id   uuid,
  erstellt_am    timestamptz not null default now()
);
create index if not exists kassen_belege_idx on public.kassen_belege (owner_user_id, erstellt_am desc);

create table if not exists public.kassen_positionen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  beleg_id      uuid not null references public.kassen_belege(id) on delete cascade,
  position      integer not null default 1,
  artikel_id    uuid references public.artikel(id) on delete set null,
  bezeichnung   text not null default '',
  menge         numeric(12,2) not null default 1,
  einzelpreis   numeric(12,2) not null default 0,   -- BRUTTO je Einheit (Kassen-Übung)
  mwst_satz     numeric(5,2) not null default 19,
  gesamt_brutto numeric(12,2) not null default 0
);
create index if not exists kassen_positionen_idx on public.kassen_positionen (beleg_id, position);

alter table public.kassen_belege enable row level security;
alter table public.kassen_positionen enable row level security;

-- Belege: Chef voll; Mitarbeiter (Kassierer) dürfen lesen + anlegen.
drop policy if exists kb_owner_all on public.kassen_belege;
create policy kb_owner_all on public.kassen_belege for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kb_select_ma on public.kassen_belege;
create policy kb_select_ma on public.kassen_belege for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kb_insert_ma on public.kassen_belege;
create policy kb_insert_ma on public.kassen_belege for insert to public with check ((owner_user_id = mein_chef_id()));

-- Positionen: analog.
drop policy if exists kp_owner_all on public.kassen_positionen;
create policy kp_owner_all on public.kassen_positionen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kp_select_ma on public.kassen_positionen;
create policy kp_select_ma on public.kassen_positionen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kp_insert_ma on public.kassen_positionen;
create policy kp_insert_ma on public.kassen_positionen for insert to public with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel17-shop.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 17 · Shop-/Marktplatz-Anbindung
-- Bestellungen aus Online-Shops/Marktplätzen sammeln (per CSV-Import im
-- Manuell-Modus oder später per API über den Shop-Konnektor, Bündel 15).
-- Bestand kann aus dem ERP je Shop-Artikel bereitgestellt werden.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.shop_bestellungen (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  quelle         text not null default 'manuell',   -- manuell | shopware | shopify | woocommerce
  extern_id      text,                                -- Bestell-Nr im Shop
  besteller      text,
  email          text,
  status         text not null default 'neu',         -- neu | in_bearbeitung | versendet | storniert
  brutto_summe   numeric(12,2) not null default 0,
  positionen     jsonb not null default '[]'::jsonb,  -- [{bezeichnung, menge, einzelpreis}]
  bestell_am     timestamptz,
  rechnung_id    uuid,
  notiz          text,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists shop_bestellungen_idx on public.shop_bestellungen (owner_user_id, status, erstellt_am desc);
-- Doppel-Import verhindern: gleiche Quelle + externe ID nur einmal.
create unique index if not exists shop_bestellungen_extern_uidx
  on public.shop_bestellungen (owner_user_id, quelle, extern_id) where extern_id is not null;

alter table public.shop_bestellungen enable row level security;

drop policy if exists sb_owner_all on public.shop_bestellungen;
create policy sb_owner_all on public.shop_bestellungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists sb_select_ma on public.shop_bestellungen;
create policy sb_select_ma on public.shop_bestellungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists sb_update_ma on public.shop_bestellungen;
create policy sb_update_ma on public.shop_bestellungen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel18-kfz.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 18 · KFZ-Fachpaket
-- Für KFZ-Betriebe: Fahrzeuge mit HU/AU-Fristen (Ampel) und ein Reifenhotel
-- (Einlagerung je Fahrzeug/Kunde mit Lagerplatz & Saison).
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.kfz_fahrzeuge (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  kontakt_id     uuid references public.kontakte(id) on delete set null,
  halter         text,
  kennzeichen    text,
  marke          text,
  modell         text,
  vin            text,
  erstzulassung  date,
  hu_faellig     date,          -- nächste Hauptuntersuchung
  au_faellig     date,          -- nächste Abgasuntersuchung
  km_stand       integer,
  notiz          text,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists kfz_fahrzeuge_idx on public.kfz_fahrzeuge (owner_user_id, hu_faellig);

create table if not exists public.kfz_reifeneinlagerung (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  fahrzeug_id    uuid references public.kfz_fahrzeuge(id) on delete set null,
  kunde_name     text,
  kennzeichen    text,
  saison         text not null default 'sommer',   -- sommer | winter
  groesse        text,                               -- z.B. 205/55 R16
  anzahl         integer not null default 4,
  lagerplatz     text,
  eingelagert_am date not null default current_date,
  ausgelagert_am date,
  notiz          text,
  erstellt_am    timestamptz not null default now()
);
create index if not exists kfz_reifen_idx on public.kfz_reifeneinlagerung (owner_user_id, ausgelagert_am);

alter table public.kfz_fahrzeuge enable row level security;
alter table public.kfz_reifeneinlagerung enable row level security;

-- Fahrzeuge (operativ: Chef + Mitarbeiter mit Modul)
drop policy if exists kfzf_owner_all on public.kfz_fahrzeuge;
create policy kfzf_owner_all on public.kfz_fahrzeuge for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kfzf_select_ma on public.kfz_fahrzeuge;
create policy kfzf_select_ma on public.kfz_fahrzeuge for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kfzf_insert_ma on public.kfz_fahrzeuge;
create policy kfzf_insert_ma on public.kfz_fahrzeuge for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists kfzf_update_ma on public.kfz_fahrzeuge;
create policy kfzf_update_ma on public.kfz_fahrzeuge for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

-- Reifeneinlagerung
drop policy if exists kfzr_owner_all on public.kfz_reifeneinlagerung;
create policy kfzr_owner_all on public.kfz_reifeneinlagerung for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kfzr_select_ma on public.kfz_reifeneinlagerung;
create policy kfzr_select_ma on public.kfz_reifeneinlagerung for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kfzr_insert_ma on public.kfz_reifeneinlagerung;
create policy kfzr_insert_ma on public.kfz_reifeneinlagerung for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists kfzr_update_ma on public.kfz_reifeneinlagerung;
create policy kfzr_update_ma on public.kfz_reifeneinlagerung for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel19-bau-lv.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 19 · Bau & Handwerk komplett
-- Leistungsverzeichnis (LV) mit Positionen & Nachträgen sowie Abnahme-
-- protokolle mit Mängelliste. Aus einem LV entsteht per Brücke eine Rechnung.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.bau_lv (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  projekt_id     uuid references public.projekte(id) on delete set null,
  kontakt_id     uuid references public.kontakte(id) on delete set null,
  titel          text not null default 'Leistungsverzeichnis',
  kunde_name     text,
  status         text not null default 'entwurf',   -- entwurf | beauftragt | abgerechnet
  netto_summe    numeric(12,2) not null default 0,
  notiz          text,
  rechnung_id    uuid,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists bau_lv_idx on public.bau_lv (owner_user_id, status, erstellt_am desc);

create table if not exists public.bau_lv_positionen (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  lv_id          uuid not null references public.bau_lv(id) on delete cascade,
  ordnungszahl   text,                               -- z.B. 01.02.003
  kurztext       text not null default '',
  langtext       text,
  menge          numeric(12,3) not null default 0,
  einheit        text not null default 'Stk',
  einzelpreis    numeric(12,2) not null default 0,   -- netto (EP)
  mwst_satz      numeric(5,2) not null default 19,
  gesamt_netto   numeric(12,2) not null default 0,   -- GP
  ist_nachtrag   boolean not null default false,
  nachtrag_grund text,
  position       integer not null default 1
);
create index if not exists bau_lv_positionen_idx on public.bau_lv_positionen (lv_id, position);

create table if not exists public.bau_abnahmen (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  projekt_id     uuid references public.projekte(id) on delete set null,
  lv_id          uuid references public.bau_lv(id) on delete set null,
  titel          text not null default 'Abnahme',
  datum          date not null default current_date,
  ort            text,
  teilnehmer     text,
  art            text not null default 'voll',        -- voll | unter_vorbehalt | verweigert
  maengel        jsonb not null default '[]'::jsonb,   -- [{beschreibung, frist, behoben}]
  unterschrift_name text,
  notiz          text,
  erstellt_am    timestamptz not null default now()
);
create index if not exists bau_abnahmen_idx on public.bau_abnahmen (owner_user_id, datum desc);

alter table public.bau_lv enable row level security;
alter table public.bau_lv_positionen enable row level security;
alter table public.bau_abnahmen enable row level security;

-- bau_lv
drop policy if exists blv_owner_all on public.bau_lv;
create policy blv_owner_all on public.bau_lv for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists blv_select_ma on public.bau_lv;
create policy blv_select_ma on public.bau_lv for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists blv_insert_ma on public.bau_lv;
create policy blv_insert_ma on public.bau_lv for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists blv_update_ma on public.bau_lv;
create policy blv_update_ma on public.bau_lv for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

-- bau_lv_positionen
drop policy if exists blvp_owner_all on public.bau_lv_positionen;
create policy blvp_owner_all on public.bau_lv_positionen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists blvp_select_ma on public.bau_lv_positionen;
create policy blvp_select_ma on public.bau_lv_positionen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists blvp_insert_ma on public.bau_lv_positionen;
create policy blvp_insert_ma on public.bau_lv_positionen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists blvp_update_ma on public.bau_lv_positionen;
create policy blvp_update_ma on public.bau_lv_positionen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));
drop policy if exists blvp_delete_ma on public.bau_lv_positionen;
create policy blvp_delete_ma on public.bau_lv_positionen for delete to public using ((owner_user_id = mein_chef_id()));

-- bau_abnahmen
drop policy if exists bab_owner_all on public.bau_abnahmen;
create policy bab_owner_all on public.bau_abnahmen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists bab_select_ma on public.bau_abnahmen;
create policy bab_select_ma on public.bau_abnahmen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists bab_insert_ma on public.bau_abnahmen;
create policy bab_insert_ma on public.bau_abnahmen for insert to public with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel21-gastro-hotel.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 21 · Gastro & Hotel
-- Tisch-Reservierungen (Gastro) + Zimmer & Belegungen (Hotel-PMS-Kern).
-- Buchungskanäle/OTA sind als Brücke vorgesehen. Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.gastro_reservierungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  datum         date not null default current_date,
  uhrzeit       text,
  personen      integer not null default 2,
  gast_name     text,
  telefon       text,
  tisch         text,
  status        text not null default 'reserviert',   -- reserviert | eingetroffen | storniert | no_show
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists gastro_res_idx on public.gastro_reservierungen (owner_user_id, datum);

create table if not exists public.hotel_zimmer (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  nummer        text not null,
  typ           text,                                  -- Einzel/Doppel/Suite ...
  max_personen  integer not null default 2,
  preis_nacht   numeric(12,2) not null default 0,
  aktiv         boolean not null default true,
  erstellt_am   timestamptz not null default now()
);
create index if not exists hotel_zimmer_idx on public.hotel_zimmer (owner_user_id, aktiv);

create table if not exists public.hotel_belegungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  zimmer_id     uuid references public.hotel_zimmer(id) on delete set null,
  gast_name     text,
  personen      integer not null default 1,
  anreise       date not null,
  abreise       date not null,
  status        text not null default 'gebucht',       -- gebucht | eingecheckt | ausgecheckt | storniert
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists hotel_beleg_idx on public.hotel_belegungen (owner_user_id, anreise);

alter table public.gastro_reservierungen enable row level security;
alter table public.hotel_zimmer enable row level security;
alter table public.hotel_belegungen enable row level security;

-- gastro_reservierungen
drop policy if exists gr_owner_all on public.gastro_reservierungen;
create policy gr_owner_all on public.gastro_reservierungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists gr_select_ma on public.gastro_reservierungen;
create policy gr_select_ma on public.gastro_reservierungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists gr_insert_ma on public.gastro_reservierungen;
create policy gr_insert_ma on public.gastro_reservierungen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists gr_update_ma on public.gastro_reservierungen;
create policy gr_update_ma on public.gastro_reservierungen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

-- hotel_zimmer
drop policy if exists hz_owner_all on public.hotel_zimmer;
create policy hz_owner_all on public.hotel_zimmer for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists hz_select_ma on public.hotel_zimmer;
create policy hz_select_ma on public.hotel_zimmer for select to public using ((owner_user_id = mein_chef_id()));

-- hotel_belegungen
drop policy if exists hb_owner_all on public.hotel_belegungen;
create policy hb_owner_all on public.hotel_belegungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists hb_select_ma on public.hotel_belegungen;
create policy hb_select_ma on public.hotel_belegungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists hb_insert_ma on public.hotel_belegungen;
create policy hb_insert_ma on public.hotel_belegungen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists hb_update_ma on public.hotel_belegungen;
create policy hb_update_ma on public.hotel_belegungen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel22-fertigung.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 22 · Fertigung & PPS
-- Stücklisten (BOM) mit Komponenten + Fertigungsaufträge mit Status.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.fertigung_stuecklisten (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name          text not null default 'Stückliste',
  produkt       text,
  artikel_id    uuid references public.artikel(id) on delete set null,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists fert_sl_idx on public.fertigung_stuecklisten (owner_user_id, erstellt_am desc);

create table if not exists public.fertigung_stueckliste_positionen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  stueckliste_id uuid not null references public.fertigung_stuecklisten(id) on delete cascade,
  komponente    text not null default '',
  artikel_id    uuid references public.artikel(id) on delete set null,
  menge         numeric(12,3) not null default 1,
  einheit       text not null default 'Stk',
  position      integer not null default 1
);
create index if not exists fert_slp_idx on public.fertigung_stueckliste_positionen (stueckliste_id, position);

create table if not exists public.fertigung_auftraege (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  auftragsnr    text,
  produkt       text,
  stueckliste_id uuid references public.fertigung_stuecklisten(id) on delete set null,
  menge         numeric(12,2) not null default 1,
  status        text not null default 'geplant',   -- geplant | in_arbeit | fertig | storniert
  start_am      date,
  fertig_am     date,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists fert_auf_idx on public.fertigung_auftraege (owner_user_id, status, erstellt_am desc);

alter table public.fertigung_stuecklisten enable row level security;
alter table public.fertigung_stueckliste_positionen enable row level security;
alter table public.fertigung_auftraege enable row level security;

-- Stücklisten
drop policy if exists fsl_owner_all on public.fertigung_stuecklisten;
create policy fsl_owner_all on public.fertigung_stuecklisten for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists fsl_select_ma on public.fertigung_stuecklisten;
create policy fsl_select_ma on public.fertigung_stuecklisten for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists fsl_insert_ma on public.fertigung_stuecklisten;
create policy fsl_insert_ma on public.fertigung_stuecklisten for insert to public with check ((owner_user_id = mein_chef_id()));

-- Stücklisten-Positionen
drop policy if exists fslp_owner_all on public.fertigung_stueckliste_positionen;
create policy fslp_owner_all on public.fertigung_stueckliste_positionen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists fslp_select_ma on public.fertigung_stueckliste_positionen;
create policy fslp_select_ma on public.fertigung_stueckliste_positionen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists fslp_insert_ma on public.fertigung_stueckliste_positionen;
create policy fslp_insert_ma on public.fertigung_stueckliste_positionen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists fslp_delete_ma on public.fertigung_stueckliste_positionen;
create policy fslp_delete_ma on public.fertigung_stueckliste_positionen for delete to public using ((owner_user_id = mein_chef_id()));

-- Fertigungsaufträge
drop policy if exists fauf_owner_all on public.fertigung_auftraege;
create policy fauf_owner_all on public.fertigung_auftraege for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists fauf_select_ma on public.fertigung_auftraege;
create policy fauf_select_ma on public.fertigung_auftraege for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists fauf_insert_ma on public.fertigung_auftraege;
create policy fauf_insert_ma on public.fertigung_auftraege for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists fauf_update_ma on public.fertigung_auftraege;
create policy fauf_update_ma on public.fertigung_auftraege for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel23-energie.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 23 · Energie-Fachpaket
-- Energie-Anlagen (PV/Wärmepumpe/BHKW) mit Wartungsfrist + Zählerstände/Erträge.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.energie_anlagen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  bezeichnung   text not null default 'Anlage',
  typ           text,                                 -- PV | Waermepumpe | BHKW | Speicher ...
  standort      text,
  leistung_kw   numeric(12,2),
  inbetriebnahme date,
  wartung_faellig date,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists energie_anlagen_idx on public.energie_anlagen (owner_user_id, wartung_faellig);

create table if not exists public.energie_ablesungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  anlage_id     uuid not null references public.energie_anlagen(id) on delete cascade,
  datum         date not null default current_date,
  zaehlerstand  numeric(14,2),
  ertrag_kwh    numeric(14,2),
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists energie_ablesungen_idx on public.energie_ablesungen (anlage_id, datum desc);

alter table public.energie_anlagen enable row level security;
alter table public.energie_ablesungen enable row level security;

drop policy if exists ea_owner_all on public.energie_anlagen;
create policy ea_owner_all on public.energie_anlagen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ea_select_ma on public.energie_anlagen;
create policy ea_select_ma on public.energie_anlagen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ea_insert_ma on public.energie_anlagen;
create policy ea_insert_ma on public.energie_anlagen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists ea_update_ma on public.energie_anlagen;
create policy ea_update_ma on public.energie_anlagen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

drop policy if exists eab_owner_all on public.energie_ablesungen;
create policy eab_owner_all on public.energie_ablesungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists eab_select_ma on public.energie_ablesungen;
create policy eab_select_ma on public.energie_ablesungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists eab_insert_ma on public.energie_ablesungen;
create policy eab_insert_ma on public.energie_ablesungen for insert to public with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel24-immobilien.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 24 · Immobilienverwaltung
-- Einheiten (Wohnungen/Gewerbe), Mietverträge und Mieteingänge.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.immo_einheiten (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  objekt        text,                                  -- Gebäude/Adresse
  bezeichnung   text not null default 'Einheit',       -- Wohnung 1. OG links ...
  flaeche_qm    numeric(10,2),
  zimmer        numeric(4,1),
  kaltmiete     numeric(12,2) not null default 0,
  nebenkosten   numeric(12,2) not null default 0,
  status        text not null default 'frei',          -- frei | vermietet
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists immo_einheiten_idx on public.immo_einheiten (owner_user_id, status);

create table if not exists public.immo_mietvertraege (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  einheit_id    uuid references public.immo_einheiten(id) on delete set null,
  mieter_name   text,
  mieter_email  text,
  beginn        date,
  ende          date,
  kaltmiete     numeric(12,2) not null default 0,
  nebenkosten   numeric(12,2) not null default 0,
  kaution       numeric(12,2) not null default 0,
  status        text not null default 'aktiv',          -- aktiv | beendet
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists immo_vertraege_idx on public.immo_mietvertraege (owner_user_id, status);

create table if not exists public.immo_zahlungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  vertrag_id    uuid not null references public.immo_mietvertraege(id) on delete cascade,
  monat         date not null default current_date,     -- Monat der Miete (1. des Monats)
  betrag        numeric(12,2) not null default 0,
  bezahlt_am    date not null default current_date,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists immo_zahlungen_idx on public.immo_zahlungen (vertrag_id, monat desc);

alter table public.immo_einheiten enable row level security;
alter table public.immo_mietvertraege enable row level security;
alter table public.immo_zahlungen enable row level security;

drop policy if exists ie_owner_all on public.immo_einheiten;
create policy ie_owner_all on public.immo_einheiten for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ie_select_ma on public.immo_einheiten;
create policy ie_select_ma on public.immo_einheiten for select to public using ((owner_user_id = mein_chef_id()));

drop policy if exists imv_owner_all on public.immo_mietvertraege;
create policy imv_owner_all on public.immo_mietvertraege for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists imv_select_ma on public.immo_mietvertraege;
create policy imv_select_ma on public.immo_mietvertraege for select to public using ((owner_user_id = mein_chef_id()));

drop policy if exists iz_owner_all on public.immo_zahlungen;
create policy iz_owner_all on public.immo_zahlungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists iz_select_ma on public.immo_zahlungen;
create policy iz_select_ma on public.immo_zahlungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists iz_insert_ma on public.immo_zahlungen;
create policy iz_insert_ma on public.immo_zahlungen for insert to public with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel25-it-msp.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 25 · IT & MSP
-- IT-Assets (Kunden-Hardware/Lizenzen) + Managed-Service-Verträge mit
-- Wartungsintervall/nächster Wartung. Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.it_assets (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  kunde_name    text,
  bezeichnung   text not null default 'Asset',
  typ           text,                                  -- Server | Client | Netzwerk | Lizenz ...
  hersteller    text,
  seriennummer  text,
  standort      text,
  garantie_bis  date,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists it_assets_idx on public.it_assets (owner_user_id, kunde_name);

create table if not exists public.it_vertraege (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  kunde_name    text,
  bezeichnung   text not null default 'Managed-Service',
  monatspauschale numeric(12,2) not null default 0,
  intervall_tage integer not null default 30,          -- Wartungsintervall
  naechste_wartung date,
  status        text not null default 'aktiv',          -- aktiv | pausiert | beendet
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists it_vertraege_idx on public.it_vertraege (owner_user_id, naechste_wartung);

alter table public.it_assets enable row level security;
alter table public.it_vertraege enable row level security;

drop policy if exists ita_owner_all on public.it_assets;
create policy ita_owner_all on public.it_assets for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ita_select_ma on public.it_assets;
create policy ita_select_ma on public.it_assets for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ita_insert_ma on public.it_assets;
create policy ita_insert_ma on public.it_assets for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists itv_owner_all on public.it_vertraege;
create policy itv_owner_all on public.it_vertraege for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists itv_select_ma on public.it_vertraege;
create policy itv_select_ma on public.it_vertraege for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists itv_insert_ma on public.it_vertraege;
create policy itv_insert_ma on public.it_vertraege for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists itv_update_ma on public.it_vertraege;
create policy itv_update_ma on public.it_vertraege for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel26-agentur.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 26 · Agentur & Kreativ
-- Retainer (monatliches Stundenbudget je Kunde) + gebuchte Zeiten darauf.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.agentur_retainer (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  kontakt_id     uuid references public.kontakte(id) on delete set null,
  kunde_name     text,
  bezeichnung    text not null default 'Retainer',
  monatsstunden  numeric(10,2) not null default 0,
  stundensatz    numeric(12,2) not null default 0,
  status         text not null default 'aktiv',        -- aktiv | pausiert | beendet
  notiz          text,
  erstellt_am    timestamptz not null default now()
);
create index if not exists agentur_retainer_idx on public.agentur_retainer (owner_user_id, status);

create table if not exists public.agentur_zeiten (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  retainer_id    uuid not null references public.agentur_retainer(id) on delete cascade,
  datum          date not null default current_date,
  stunden        numeric(10,2) not null default 0,
  beschreibung   text,
  erstellt_am    timestamptz not null default now()
);
create index if not exists agentur_zeiten_idx on public.agentur_zeiten (retainer_id, datum desc);

alter table public.agentur_retainer enable row level security;
alter table public.agentur_zeiten enable row level security;

drop policy if exists ar_owner_all on public.agentur_retainer;
create policy ar_owner_all on public.agentur_retainer for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ar_select_ma on public.agentur_retainer;
create policy ar_select_ma on public.agentur_retainer for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ar_insert_ma on public.agentur_retainer;
create policy ar_insert_ma on public.agentur_retainer for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists az_owner_all on public.agentur_zeiten;
create policy az_owner_all on public.agentur_zeiten for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists az_select_ma on public.agentur_zeiten;
create policy az_select_ma on public.agentur_zeiten for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists az_insert_ma on public.agentur_zeiten;
create policy az_insert_ma on public.agentur_zeiten for insert to public with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel27-gesundheit.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 27 · Gesundheit & Wellness
-- Kundenkartei (mit Hinweisen) + Behandlungen/Termine je Kunde.
-- KEINE Medizinberatung — reines Verwaltungswerkzeug.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.wellness_kunden (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name          text not null default 'Kunde',
  telefon       text,
  email         text,
  geburtsdatum  date,
  hinweise      text,                                  -- z.B. Allergien, Wünsche
  erstellt_am   timestamptz not null default now()
);
create index if not exists wellness_kunden_idx on public.wellness_kunden (owner_user_id, name);

create table if not exists public.wellness_behandlungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kunde_id      uuid not null references public.wellness_kunden(id) on delete cascade,
  datum         date not null default current_date,
  behandlung    text not null default '',
  dauer_min     integer,
  preis         numeric(12,2) not null default 0,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists wellness_beh_idx on public.wellness_behandlungen (kunde_id, datum desc);

alter table public.wellness_kunden enable row level security;
alter table public.wellness_behandlungen enable row level security;

drop policy if exists wk_owner_all on public.wellness_kunden;
create policy wk_owner_all on public.wellness_kunden for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists wk_select_ma on public.wellness_kunden;
create policy wk_select_ma on public.wellness_kunden for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists wk_insert_ma on public.wellness_kunden;
create policy wk_insert_ma on public.wellness_kunden for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists wb_owner_all on public.wellness_behandlungen;
create policy wb_owner_all on public.wellness_behandlungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists wb_select_ma on public.wellness_behandlungen;
create policy wb_select_ma on public.wellness_behandlungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists wb_insert_ma on public.wellness_behandlungen;
create policy wb_insert_ma on public.wellness_behandlungen for insert to public with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel28-kanzlei.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 28 · Kanzlei & Steuer
-- Mandate + Fristenkalender (mit Erledigt-Status). KEINE Steuer-/Rechtsberatung.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.kanzlei_mandate (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  mandant       text not null default 'Mandant',
  art           text,                                  -- Steuer | Recht | Buchhaltung ...
  aktenzeichen  text,
  status        text not null default 'aktiv',          -- aktiv | ruht | beendet
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists kanzlei_mandate_idx on public.kanzlei_mandate (owner_user_id, status);

create table if not exists public.kanzlei_fristen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mandat_id     uuid references public.kanzlei_mandate(id) on delete cascade,
  bezeichnung   text not null default '',
  frist         date not null,
  erledigt      boolean not null default false,
  erledigt_am   date,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists kanzlei_fristen_idx on public.kanzlei_fristen (owner_user_id, erledigt, frist);

alter table public.kanzlei_mandate enable row level security;
alter table public.kanzlei_fristen enable row level security;

drop policy if exists km_owner_all on public.kanzlei_mandate;
create policy km_owner_all on public.kanzlei_mandate for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists km_select_ma on public.kanzlei_mandate;
create policy km_select_ma on public.kanzlei_mandate for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists km_insert_ma on public.kanzlei_mandate;
create policy km_insert_ma on public.kanzlei_mandate for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists kf_owner_all on public.kanzlei_fristen;
create policy kf_owner_all on public.kanzlei_fristen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kf_select_ma on public.kanzlei_fristen;
create policy kf_select_ma on public.kanzlei_fristen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kf_insert_ma on public.kanzlei_fristen;
create policy kf_insert_ma on public.kanzlei_fristen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists kf_update_ma on public.kanzlei_fristen;
create policy kf_update_ma on public.kanzlei_fristen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel29-bildung.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 29 · Bildung & Kurse
-- Kurse (mit Plätzen) + Anmeldungen/Teilnehmer mit Status.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.bildung_kurse (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  titel         text not null default 'Kurs',
  start_am      date,
  ende_am       date,
  ort           text,
  plaetze       integer not null default 10,
  preis         numeric(12,2) not null default 0,
  status        text not null default 'geplant',        -- geplant | laeuft | abgeschlossen | abgesagt
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists bildung_kurse_idx on public.bildung_kurse (owner_user_id, start_am);

create table if not exists public.bildung_anmeldungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kurs_id       uuid not null references public.bildung_kurse(id) on delete cascade,
  name          text not null default '',
  email         text,
  status        text not null default 'angemeldet',      -- angemeldet | bestaetigt | teilgenommen | storniert
  erstellt_am   timestamptz not null default now()
);
create index if not exists bildung_anm_idx on public.bildung_anmeldungen (kurs_id, status);

alter table public.bildung_kurse enable row level security;
alter table public.bildung_anmeldungen enable row level security;

drop policy if exists bk_owner_all on public.bildung_kurse;
create policy bk_owner_all on public.bildung_kurse for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists bk_select_ma on public.bildung_kurse;
create policy bk_select_ma on public.bildung_kurse for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists bk_insert_ma on public.bildung_kurse;
create policy bk_insert_ma on public.bildung_kurse for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists ba_owner_all on public.bildung_anmeldungen;
create policy ba_owner_all on public.bildung_anmeldungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ba_select_ma on public.bildung_anmeldungen;
create policy ba_select_ma on public.bildung_anmeldungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ba_insert_ma on public.bildung_anmeldungen;
create policy ba_insert_ma on public.bildung_anmeldungen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists ba_update_ma on public.bildung_anmeldungen;
create policy ba_update_ma on public.bildung_anmeldungen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel30-lebensmittel.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 30 · Lebensmittel-Fachpaket
-- Chargen mit MHD-Verwaltung + HACCP-Kontrollpunkte (Eigenkontrolle).
-- Unterstützt die Dokumentation — ersetzt KEINE amtliche HACCP-Beratung.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.lm_chargen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  bezeichnung   text not null default 'Charge',
  charge_nr     text,
  mhd           date,
  menge         numeric(12,2),
  einheit       text not null default 'kg',
  lieferant     text,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists lm_chargen_idx on public.lm_chargen (owner_user_id, mhd);

create table if not exists public.lm_haccp (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  datum         date not null default current_date,
  kontrollpunkt text not null default '',              -- z.B. Kühlhaus, Fritteuse
  messwert      text,                                   -- z.B. 4 °C
  in_ordnung    boolean not null default true,
  massnahme     text,                                   -- bei Abweichung
  pruefer       text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists lm_haccp_idx on public.lm_haccp (owner_user_id, datum desc);

alter table public.lm_chargen enable row level security;
alter table public.lm_haccp enable row level security;

drop policy if exists lmc_owner_all on public.lm_chargen;
create policy lmc_owner_all on public.lm_chargen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists lmc_select_ma on public.lm_chargen;
create policy lmc_select_ma on public.lm_chargen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists lmc_insert_ma on public.lm_chargen;
create policy lmc_insert_ma on public.lm_chargen for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists lmh_owner_all on public.lm_haccp;
create policy lmh_owner_all on public.lm_haccp for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists lmh_select_ma on public.lm_haccp;
create policy lmh_select_ma on public.lm_haccp for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists lmh_insert_ma on public.lm_haccp;
create policy lmh_insert_ma on public.lm_haccp for insert to public with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel31-landwirtschaft.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 31 · Landwirtschaft & Forst
-- Schläge/Flächen + Maßnahmen (Aussaat/Düngung/Pflanzenschutz/Ernte) als
-- Schlagkartei-Kern. Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.agrar_schlaege (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name          text not null default 'Schlag',
  flaeche_ha    numeric(12,3),
  kultur        text,
  standort      text,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists agrar_schlaege_idx on public.agrar_schlaege (owner_user_id, name);

create table if not exists public.agrar_massnahmen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  schlag_id     uuid not null references public.agrar_schlaege(id) on delete cascade,
  datum         date not null default current_date,
  art           text not null default 'sonstige',      -- aussaat | duengung | pflanzenschutz | ernte | sonstige
  mittel        text,
  menge         numeric(12,2),
  einheit       text,
  ertrag        numeric(12,2),
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists agrar_massnahmen_idx on public.agrar_massnahmen (schlag_id, datum desc);

alter table public.agrar_schlaege enable row level security;
alter table public.agrar_massnahmen enable row level security;

drop policy if exists as_owner_all on public.agrar_schlaege;
create policy as_owner_all on public.agrar_schlaege for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists as_select_ma on public.agrar_schlaege;
create policy as_select_ma on public.agrar_schlaege for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists as_insert_ma on public.agrar_schlaege;
create policy as_insert_ma on public.agrar_schlaege for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists am_owner_all on public.agrar_massnahmen;
create policy am_owner_all on public.agrar_massnahmen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists am_select_ma on public.agrar_massnahmen;
create policy am_select_ma on public.agrar_massnahmen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists am_insert_ma on public.agrar_massnahmen;
create policy am_insert_ma on public.agrar_massnahmen for insert to public with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel32-tier.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 32 · Tier-Fachpaket
-- Tierkartei (mit Halter) + Behandlungen/Impfungen mit Wiederholungsfrist.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.tier_tiere (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  halter        text,
  name          text not null default 'Tier',
  art           text,                                  -- Hund/Katze/Pferd/Rind ...
  rasse         text,
  geburtsdatum  date,
  chip_nr       text,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists tier_tiere_idx on public.tier_tiere (owner_user_id, name);

create table if not exists public.tier_behandlungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  tier_id       uuid not null references public.tier_tiere(id) on delete cascade,
  datum         date not null default current_date,
  art           text not null default 'behandlung',    -- behandlung | impfung | untersuchung
  bezeichnung   text not null default '',
  naechste_faellig date,                                -- z.B. Wiederholungsimpfung
  preis         numeric(12,2) not null default 0,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists tier_beh_idx on public.tier_behandlungen (tier_id, datum desc);

alter table public.tier_tiere enable row level security;
alter table public.tier_behandlungen enable row level security;

drop policy if exists tt_owner_all on public.tier_tiere;
create policy tt_owner_all on public.tier_tiere for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists tt_select_ma on public.tier_tiere;
create policy tt_select_ma on public.tier_tiere for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists tt_insert_ma on public.tier_tiere;
create policy tt_insert_ma on public.tier_tiere for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists tb_owner_all on public.tier_behandlungen;
create policy tb_owner_all on public.tier_behandlungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists tb_select_ma on public.tier_behandlungen;
create policy tb_select_ma on public.tier_behandlungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists tb_insert_ma on public.tier_behandlungen;
create policy tb_insert_ma on public.tier_behandlungen for insert to public with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel33-verein.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 33 · Verein, Kultur & Sozial
-- Vereinsmitglieder (mit Beitrag) + Veranstaltungen mit Teilnehmerzählung.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.verein_mitglieder (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name          text not null default 'Mitglied',
  email         text,
  telefon       text,
  eintritt      date,
  beitrag       numeric(12,2) not null default 0,
  intervall     text not null default 'jahr',           -- monat | quartal | jahr
  rolle         text,                                     -- Mitglied | Vorstand | Ehrenamt ...
  status        text not null default 'aktiv',            -- aktiv | ruht | ausgetreten
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists verein_mitglieder_idx on public.verein_mitglieder (owner_user_id, status);

create table if not exists public.verein_veranstaltungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  titel         text not null default 'Veranstaltung',
  datum         date,
  ort           text,
  teilnehmer    integer not null default 0,
  ehrenamt_stunden numeric(10,2) not null default 0,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists verein_veranst_idx on public.verein_veranstaltungen (owner_user_id, datum desc);

alter table public.verein_mitglieder enable row level security;
alter table public.verein_veranstaltungen enable row level security;

drop policy if exists vm_owner_all on public.verein_mitglieder;
create policy vm_owner_all on public.verein_mitglieder for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists vm_select_ma on public.verein_mitglieder;
create policy vm_select_ma on public.verein_mitglieder for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists vm_insert_ma on public.verein_mitglieder;
create policy vm_insert_ma on public.verein_mitglieder for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists vm_update_ma on public.verein_mitglieder;
create policy vm_update_ma on public.verein_mitglieder for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

drop policy if exists vv_owner_all on public.verein_veranstaltungen;
create policy vv_owner_all on public.verein_veranstaltungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists vv_select_ma on public.verein_veranstaltungen;
create policy vv_select_ma on public.verein_veranstaltungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists vv_insert_ma on public.verein_veranstaltungen;
create policy vv_insert_ma on public.verein_veranstaltungen for insert to public with check ((owner_user_id = mein_chef_id()));


-- ###########################################################
-- ##### buendel34-logistik.sql
-- ###########################################################
-- ============================================================
-- ARGONAUT OS · Bündel 34 · Logistik-Fachpaket
-- Touren (Datum/Fahrer/Fahrzeug) + Sendungen mit Status-Tracking.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.logistik_touren (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  datum         date not null default current_date,
  fahrer        text,
  fahrzeug      text,
  status        text not null default 'geplant',        -- geplant | unterwegs | abgeschlossen
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists logistik_touren_idx on public.logistik_touren (owner_user_id, datum desc);

create table if not exists public.logistik_sendungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  tour_id       uuid references public.logistik_touren(id) on delete set null,
  sendungsnr    text,
  empfaenger    text,
  adresse       text,
  status        text not null default 'offen',           -- offen | unterwegs | zugestellt | fehlgeschlagen
  reihenfolge   integer not null default 1,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists logistik_sendungen_idx on public.logistik_sendungen (owner_user_id, status);

alter table public.logistik_touren enable row level security;
alter table public.logistik_sendungen enable row level security;

drop policy if exists lt_owner_all on public.logistik_touren;
create policy lt_owner_all on public.logistik_touren for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists lt_select_ma on public.logistik_touren;
create policy lt_select_ma on public.logistik_touren for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists lt_insert_ma on public.logistik_touren;
create policy lt_insert_ma on public.logistik_touren for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists lt_update_ma on public.logistik_touren;
create policy lt_update_ma on public.logistik_touren for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

drop policy if exists ls_owner_all on public.logistik_sendungen;
create policy ls_owner_all on public.logistik_sendungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ls_select_ma on public.logistik_sendungen;
create policy ls_select_ma on public.logistik_sendungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ls_insert_ma on public.logistik_sendungen;
create policy ls_insert_ma on public.logistik_sendungen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists ls_update_ma on public.logistik_sendungen;
create policy ls_update_ma on public.logistik_sendungen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

