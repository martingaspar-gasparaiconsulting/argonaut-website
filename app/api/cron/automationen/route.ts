import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { sendeMail, kundenMailLayout, absenderBranding } from '@/lib/mail';
import {
  triggerDef, aktionDef, pruefeRegel, platzhalterWerte, ersetzePlatzhalter, empfaengerAdresse,
  alsZahl, type AutomationRegel, type TriggerDef, type Datensatz,
} from '@/lib/automation';

// ============================================================================
// ARGONAUT OS · /api/cron/automationen — der Motor des Automations-Bauers
//
// Laeuft einmal taeglich. Ablauf je aktiver Regel:
//   1. passende Tabelle abfragen (nur der Betrieb, dem die Regel gehoert)
//   2. pruefeRegel() aus lib/automation entscheidet, was faellig ist
//   3. was schon einmal mit Ergebnis "ok" im Protokoll steht, wird uebersprungen
//   4. Aktion ausfuehren, Protokollzeile schreiben
//
// DREI SCHUTZGELAENDER, damit nie eine Mail-Lawine losgeht:
//   · DECKEL:     hoechstens MAX_JE_REGEL Aktionen pro Regel und Lauf
//   · RUECKBLICK: Vorgaenge, deren Ausloeser laenger als RUECKBLICK_TAGE her ist,
//                 werden ignoriert — Karteileichen bekommen keine Post
//   · EINMALIG:   pro Regel und Vorgang genau eine erfolgreiche Ausfuehrung
//                 (zusaetzlich per Unique-Index in der Datenbank abgesichert)
//
// PROBELAUF: ?probe=1 zeigt, WAS passieren wuerde, fuehrt aber nichts aus und
// schreibt nichts ins Protokoll. Immer zuerst so testen.
//
// Auslösung: Vercel-Cron (CRON_SECRET) oder eingeloggter Admin. Service-Role
// umgeht RLS — deshalb wird ueberall streng auf owner_user_id gefiltert.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REGELN = 200;        // Sicherheitsnetz gegen entgleiste Datenbestaende
const MAX_JE_REGEL = 25;       // Deckel pro Regel und Lauf
const MAX_KANDIDATEN = 500;    // hoechstens so viele Zeilen je Regel pruefen
const RUECKBLICK_TAGE = 120;   // aelteres wird nicht mehr angefasst

/** Wo der Status einer Tabelle steht (Rechnungen tanzen aus der Reihe). */
const STATUS_FELD: Record<string, string> = {
  rechnungen: 'zahlungsstatus', angebote: 'status', aufgaben: 'status', kontakte: 'status', projekte: 'status',
};

/** Wo das Notizfeld einer Tabelle steht. */
const NOTIZ_FELD: Record<string, string> = {
  rechnungen: 'notizen', angebote: 'notiz', kontakte: 'notizen', aufgaben: 'beschreibung', projekte: 'beschreibung',
};

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function erlaubt(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    const url = new URL(req.url);
    if (auth === `Bearer ${secret}` || url.searchParams.get('secret') === secret) return true;
  }
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return (p as { role?: string } | null)?.role === 'admin';
}

function iso(d: Date): string { return d.toISOString(); }
function nurDatum(d: Date): string { return d.toISOString().slice(0, 10); }

type AdminClient = ReturnType<typeof service>;
type Ergebnis = { ergebnis: 'ok' | 'fehler' | 'uebersprungen'; meldung: string };

// ---------------------------------------------------------------------------
// Kontakt-Daten anreichern — damit {{name}} und die Mail-Adresse stimmen.
// Rechnungen tragen nur eine kontakt_id, keinen Namen und keine Adresse.
// ---------------------------------------------------------------------------
async function reichereAn(admin: AdminClient, ownerId: string, saetze: Datensatz[]): Promise<void> {
  const ids = Array.from(new Set(saetze.map((s) => s.kontakt_id).filter((x): x is string => typeof x === 'string' && x.length > 0)));
  if (ids.length === 0) return;
  const { data } = await admin.from('kontakte').select('id,vorname,nachname,firma,email').eq('owner_user_id', ownerId).in('id', ids);
  const map = new Map<string, Record<string, unknown>>();
  for (const k of (data ?? []) as Record<string, unknown>[]) map.set(String(k.id), k);
  for (const s of saetze) {
    const k = typeof s.kontakt_id === 'string' ? map.get(s.kontakt_id) : undefined;
    if (!k) continue;
    if (s.vorname === undefined) s.vorname = k.vorname;
    if (s.nachname === undefined) s.nachname = k.nachname;
    if (s.firma === undefined) s.firma = k.firma;
    if (!s.email && !s.kunde_email) s.email = k.email;
  }
}

// ---------------------------------------------------------------------------
// Die Aktionen
// ---------------------------------------------------------------------------
async function fuehreAus(
  admin: AdminClient, regel: AutomationRegel, t: TriggerDef, satz: Datensatz, jetzt: Date,
): Promise<Ergebnis> {
  const cfg = (regel.aktion_config ?? {}) as Record<string, unknown>;
  const werte = platzhalterWerte(regel, satz, jetzt);
  const text = (key: string) => ersetzePlatzhalter(String(cfg[key] ?? ''), werte);
  const zielId = String(satz.id);

  switch (regel.aktion_typ) {

    case 'aufgabe_anlegen': {
      const tage = Math.max(0, Math.trunc(alsZahl(cfg.faellig_in_tagen) ?? 0));
      const faellig = new Date(jetzt.getTime() + tage * 86400000);
      const { error } = await admin.from('aufgaben').insert({
        owner_user_id: regel.owner_user_id,
        titel: text('titel').slice(0, 300) || `Automation: ${regel.name}`,
        beschreibung: text('beschreibung') || null,
        status: 'todo',
        erledigt: false,
        prioritaet: String(cfg.prioritaet ?? 'normal'),
        faellig_am: nurDatum(faellig),
        projekt_id: t.zielTyp === 'projekt' ? zielId : (typeof satz.projekt_id === 'string' ? satz.projekt_id : null),
      });
      if (error) return { ergebnis: 'fehler', meldung: error.message };
      return { ergebnis: 'ok', meldung: 'Aufgabe angelegt' };
    }

    case 'mail_senden': {
      const an = empfaengerAdresse(satz, cfg);
      if (!an || !an.includes('@')) return { ergebnis: 'uebersprungen', meldung: 'keine E-Mail-Adresse hinterlegt' };
      const betreff = text('betreff') || regel.name;
      const inhalt = text('text').split('\n').map((z) => `<p style="margin:0 0 10px">${z || '&nbsp;'}</p>`).join('');
      const marke = await absenderBranding(admin, regel.owner_user_id);
      const html = kundenMailLayout(marke.firma, marke.akzent, betreff, inhalt);
      const r = await sendeMail({ an, betreff, html });
      if (!r.ok) return { ergebnis: 'fehler', meldung: r.fehler };
      return { ergebnis: 'ok', meldung: `Mail an ${an}` };
    }

    case 'status_aendern': {
      const neu = String(cfg.neuer_status ?? '').trim();
      if (!neu) return { ergebnis: 'uebersprungen', meldung: 'kein Zielstatus eingestellt' };
      const spalte = STATUS_FELD[t.tabelle] ?? 'status';
      const { error } = await admin.from(t.tabelle).update({ [spalte]: neu }).eq('id', zielId).eq('owner_user_id', regel.owner_user_id);
      if (error) return { ergebnis: 'fehler', meldung: error.message };
      return { ergebnis: 'ok', meldung: `Status auf "${neu}" gesetzt` };
    }

    case 'mahnstufe_erhoehen': {
      if (t.zielTyp !== 'rechnung') return { ergebnis: 'uebersprungen', meldung: 'nur bei Rechnungen moeglich' };
      const jetzige = Math.max(0, Math.trunc(alsZahl(satz.mahnstufe) ?? 0));
      const hoechste = Math.max(1, Math.trunc(alsZahl(cfg.hoechste_stufe) ?? 3));
      if (jetzige >= hoechste) return { ergebnis: 'uebersprungen', meldung: `Mahnstufe ${jetzige} ist bereits die hoechste` };
      const { error } = await admin.from('rechnungen')
        .update({ mahnstufe: jetzige + 1, letzte_mahnung_am: nurDatum(jetzt) })
        .eq('id', zielId).eq('owner_user_id', regel.owner_user_id);
      if (error) return { ergebnis: 'fehler', meldung: error.message };
      return { ergebnis: 'ok', meldung: `Mahnstufe ${jetzige} → ${jetzige + 1}` };
    }

    case 'notiz_anhaengen': {
      const spalte = NOTIZ_FELD[t.tabelle] ?? 'notiz';
      const zeile = text('text') || `Automation: ${regel.name}`;
      const alt = typeof satz[spalte] === 'string' ? (satz[spalte] as string) : '';
      const neu = (alt ? alt + '\n' : '') + zeile;
      const { error } = await admin.from(t.tabelle).update({ [spalte]: neu.slice(0, 8000) }).eq('id', zielId).eq('owner_user_id', regel.owner_user_id);
      if (error) return { ergebnis: 'fehler', meldung: error.message };
      return { ergebnis: 'ok', meldung: 'Notiz angehaengt' };
    }

    default:
      return { ergebnis: 'fehler', meldung: `Unbekannte Aktion: ${regel.aktion_typ}` };
  }
}

// ---------------------------------------------------------------------------
// Der Lauf
// ---------------------------------------------------------------------------
async function lauf(req: Request) {
  if (!(await erlaubt(req))) {
    return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });
  }

  const url = new URL(req.url);
  const probe = url.searchParams.get('probe') === '1';
  const nurRegel = url.searchParams.get('regel');   // optional: eine einzelne Regel testen

  const admin = service();
  const jetzt = new Date();
  const grenzeAlt = iso(new Date(jetzt.getTime() - RUECKBLICK_TAGE * 86400000));

  let q = admin.from('automation_regeln').select('*').eq('aktiv', true).limit(MAX_REGELN);
  if (nurRegel) q = q.eq('id', nurRegel);
  const { data: regelDaten, error: regelFehler } = await q;
  if (regelFehler) return NextResponse.json({ ok: false, error: regelFehler.message }, { status: 500 });

  const regeln = (regelDaten ?? []) as AutomationRegel[];
  const bericht: Array<Record<string, unknown>> = [];
  let gesamtOk = 0, gesamtFehler = 0, gesamtUebersprungen = 0, gesamtGeplant = 0;

  for (const regel of regeln) {
    const t = triggerDef(regel.trigger_typ);
    const a = aktionDef(regel.aktion_typ);
    if (!t || !a) {
      bericht.push({ regel: regel.name, hinweis: 'Ausloeser oder Aktion unbekannt — uebersprungen' });
      continue;
    }

    // 1) Kandidaten holen: eigener Betrieb, Ausloese-Datum in der Vergangenheit,
    //    aber nicht aelter als das Rueckblick-Fenster.
    const { data: rohDaten, error: datenFehler } = await admin
      .from(t.tabelle).select('*')
      .eq('owner_user_id', regel.owner_user_id)
      .not(t.datumFeld, 'is', null)
      .lte(t.datumFeld, iso(jetzt))
      .gte(t.datumFeld, grenzeAlt)
      .order(t.datumFeld, { ascending: true })
      .limit(MAX_KANDIDATEN);
    if (datenFehler) {
      bericht.push({ regel: regel.name, fehler: datenFehler.message });
      gesamtFehler++;
      continue;
    }
    const kandidaten = (rohDaten ?? []) as Datensatz[];

    // 2) Was diese Regel schon erfolgreich erledigt hat, bleibt liegen.
    const { data: logDaten } = await admin
      .from('automation_log').select('ziel_id')
      .eq('regel_id', regel.id).eq('ergebnis', 'ok').limit(5000);
    const erledigt = new Set((logDaten ?? []).map((l) => String((l as { ziel_id: string | null }).ziel_id ?? '')));

    // 3) Die eigentliche Pruefung — Grundfilter, Wartezeit, Bedingungen.
    const treffer = kandidaten
      .filter((s) => !erledigt.has(String(s.id)))
      .filter((s) => pruefeRegel(regel, s, jetzt).trifft);

    const zuTun = treffer.slice(0, MAX_JE_REGEL);
    gesamtGeplant += zuTun.length;

    if (probe) {
      bericht.push({
        regel: regel.name, ausloeser: t.label, aktion: a.label,
        geprueft: kandidaten.length, faellig: treffer.length,
        wuerde_jetzt_laufen: zuTun.length,
        zurueckgestellt_wegen_deckel: Math.max(0, treffer.length - zuTun.length),
      });
      continue;
    }

    // 4) Ausfuehren.
    await reichereAn(admin, regel.owner_user_id, zuTun);
    let ok = 0, fehler = 0, uebersprungen = 0;

    for (const satz of zuTun) {
      let e: Ergebnis;
      try {
        e = await fuehreAus(admin, regel, t, satz, jetzt);
      } catch (err: unknown) {
        e = { ergebnis: 'fehler', meldung: err instanceof Error ? err.message : 'unbekannter Fehler' };
      }
      if (e.ergebnis === 'ok') ok++; else if (e.ergebnis === 'fehler') fehler++; else uebersprungen++;

      // Protokoll. Der Unique-Index laesst pro Regel+Vorgang nur EIN "ok" zu —
      // ein Konflikt hier ist kein Drama, er bedeutet nur "war schon erledigt".
      await admin.from('automation_log').insert({
        owner_user_id: regel.owner_user_id,
        regel_id: regel.id,
        ziel_typ: t.zielTyp,
        ziel_id: String(satz.id),
        ergebnis: e.ergebnis,
        meldung: e.meldung.slice(0, 500),
        details: {},
      });
    }

    await admin.from('automation_regeln').update({ zuletzt_lauf_am: iso(jetzt) }).eq('id', regel.id);

    gesamtOk += ok; gesamtFehler += fehler; gesamtUebersprungen += uebersprungen;
    bericht.push({
      regel: regel.name, ausloeser: t.label, aktion: a.label,
      geprueft: kandidaten.length, faellig: treffer.length,
      ausgefuehrt: ok, fehler, uebersprungen,
      zurueckgestellt_wegen_deckel: Math.max(0, treffer.length - zuTun.length),
    });
  }

  return NextResponse.json({
    ok: true,
    probelauf: probe,
    zeitpunkt: iso(jetzt),
    regeln_geprueft: regeln.length,
    ...(probe
      ? { wuerde_ausfuehren: gesamtGeplant }
      : { ausgefuehrt: gesamtOk, fehler: gesamtFehler, uebersprungen: gesamtUebersprungen }),
    deckel_je_regel: MAX_JE_REGEL,
    rueckblick_tage: RUECKBLICK_TAGE,
    bericht,
  });
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
