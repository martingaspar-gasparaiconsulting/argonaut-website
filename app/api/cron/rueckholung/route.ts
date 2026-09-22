import { NextResponse } from 'next/server';
import { cronGuard } from '../../../../lib/cronGuard';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, absenderBranding, kundenMailLayout } from '@/lib/mail';
import { escapeHtml, textZuHtml } from '@/lib/newsletter';
import { werbeDeckel, tagesBudget, begruendung } from '@/lib/mailBudget';
import {
  letzterKaufJeKontakt, istRuhend, nochGesperrt, aktiveSchritte, fehltZumStarten,
  entscheide, nachVersand, setzePlatzhalter, anrede, nameFuer, letzteBeruehrung,
  tageZwischen, plusTage, STOPP_TEXT,
  type Schritt, type Strecke,
} from '@/lib/rueckholung';

// ============================================================================
// ARGONAUT OS · /api/cron/rueckholung — die Rückhol-Strecke (3.15 Paket 3)
//
// Zwei Aufgaben je Lauf:
//   1. AUFNEHMEN — wer lange nichts gekauft hat, kommt in die Strecke
//   2. SENDEN    — wer dran ist, bekommt die nächste Nachricht
//
// ▄▄▄ ACHTUNG · SERVICE-ROLLE ▄▄▄
// Diese Route umgeht RLS. Jede Abfrage trägt deshalb ihr eigenes
// .eq('owner_user_id', …) — Branding, Kontakte, Rechnungen und Strecke werden
// JE BETRIEB geladen. Wer hier die Kontakte des einen Betriebs mit der Strecke
// eines anderen bedient, verschickt eine Datenpanne. tsc fängt das NICHT;
// dasselbe Muster wie in /api/cron/reports-versand und /api/cron/freebie-strecke.
//
// DER PROTOKOLL-EINTRAG KOMMT VOR DEM VERSAND — rueckhol_versand hat einen
// eindeutigen Schlüssel (lauf_id, schritt) und ist damit die Sperre gegen
// Doppelmails. Ein Eintrag ohne Mail ist ärgerlich, eine Mail doppelt ist eine
// Beschwerde.
//
// JEDE MAIL TRÄGT EINEN ABMELDE-LINK. Rückholpost ist Werbung; ohne den
// jederzeitigen Widerspruch nach Art. 21 DSGVO / § 7 UWG darf sie nicht raus.
//
// Auslösung: Vercel-Cron (Bearer CRON_SECRET) oder ?secret=.
// Mit ?probe=1 läuft alles trocken — nichts wird angelegt, nichts gesendet.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_STRECKEN = 100;
const MAX_KONTAKTE = 2000;     // je Betrieb geprüfte Kontakte
const MAX_NEUE_JE_LAUF = 50;   // so viele kommen höchstens pro Tag neu hinein
const MAX_FAELLIG = 500;

/**
 * Spalten, die es in public.kontakte wirklich gibt (Stand 13.09.2026).
 *
 * EINE Zeichenkette, nicht mit + zusammengesetzt: der Supabase-Client liest
 * die Spaltenliste auf Typ-Ebene aus. Zusammengesetzt sieht der Compiler nur
 * `string`, die Abfrage liefert GenericStringError und `next build` bricht ab —
 * genau das hat am 08.09. einen Push gekostet. tests/selectLiteral.test.mjs
 * wacht darüber.
 */
const KONTAKT_SPALTEN = 'id, email, vorname, nachname, firma, status, kunde_seit, letzter_kontakt_am, werbe_einwilligung, werbe_widerspruch_am';

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function erlaubt(req: Request): Promise<boolean> {
  // Punkt 69 Paket 3 (22.09.2026): Diese Pruefung stand in SECHS Endpunkten
  // zeichengleich als eigene Kopie. Sie war nicht loechrig — `if (!secret)
  // return false` war schon da —, aber sechs Kopien heissen: eine Reparatur an
  // einer Stelle verpufft an fuenf anderen. Jetzt entscheidet lib/cronZugang.ts,
  // einmal, mit 26 Tests, und vergleicht das Geheimnis zeitverrat-sicher
  // statt mit ===.
  //
  // `betreiberErlaubt` bleibt AUS (Voreinstellung): dieser Endpunkt hatte noch
  // nie einen Anmeldeweg, und einen zu oeffnen waere eine Entscheidung, keine
  // Nebenwirkung. Die beiden bisherigen Wege — Vercels Bearer-Kopfzeile und
  // ?secret= von Hand — bleiben unveraendert.
  return (await cronGuard(req)) === null;
}

function ursprung(req: Request): string {
  const gesetzt = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (gesetzt) return gesetzt.replace(/\/+$/, '');
  try { return new URL(req.url).origin; } catch { return ''; }
}

type StreckeRow = { id: string; owner_user_id: string; name: string; aktiv: boolean; ruhe_tage: number };
type SchrittRow = { strecke_id: string; schritt: number; nach_tagen: number; betreff: string; text: string; aktiv: boolean };
type LaufRow = {
  id: string; owner_user_id: string; strecke_id: string; kontakt_id: string | null;
  email: string; gestartet_am: string; schritt: number; faellig_am: string | null;
  status: string; beendet_am: string | null;
};
type KontaktRow = Record<string, unknown> & { id: string; email: string | null };
type RechnungRow = { kontakt_id: string | null; bezahlt_am: string | null; faelligkeitsdatum: string | null };

async function lauf(req: Request) {
  if (!(await erlaubt(req))) return NextResponse.json({ ok: false, error: 'Nicht autorisiert.' }, { status: 401 });

  const probe = new URL(req.url).searchParams.get('probe') === '1';
  const db = service();
  const heute = new Date().toISOString().slice(0, 10);
  const basis = ursprung(req);
  const budget = tagesBudget(process.env.MAIL_TAGESBUDGET);
  const deckel = werbeDeckel(process.env.MAIL_TAGESBUDGET);

  const { data: streckenRoh, error: streckenFehler } = await db
    .from('rueckhol_strecke').select('id, owner_user_id, name, aktiv, ruhe_tage')
    .eq('aktiv', true).limit(MAX_STRECKEN);
  if (streckenFehler) return NextResponse.json({ ok: false, error: streckenFehler.message }, { status: 500 });

  const strecken = (streckenRoh ?? []) as StreckeRow[];
  if (strecken.length === 0) {
    return NextResponse.json({ ok: true, strecken: 0, hinweis: 'Keine scharfgeschaltete Strecke.' });
  }

  const brandingCache = new Map<string, { firma: string; akzent: string; email: string | undefined }>();
  async function brandingVon(ownerId: string) {
    if (!brandingCache.has(ownerId)) brandingCache.set(ownerId, await absenderBranding(db, ownerId));
    return brandingCache.get(ownerId)!;
  }

  let gesendet = 0, neu = 0, gestoppt = 0, fertig = 0, fehler = 0;
  const bericht: Array<Record<string, unknown>> = [];

  for (const s of strecken) {
    // --- Schritte dieser Strecke ------------------------------------------
    const { data: schritteRoh } = await db
      .from('rueckhol_schritt')
      .select('strecke_id, schritt, nach_tagen, betreff, text, aktiv')
      .eq('strecke_id', s.id).eq('owner_user_id', s.owner_user_id)
      .order('schritt', { ascending: true });

    const schritte: Schritt[] = ((schritteRoh ?? []) as SchrittRow[]).map((r) => ({
      schritt: r.schritt, nach_tagen: r.nach_tagen, betreff: r.betreff, text: r.text, aktiv: r.aktiv,
    }));
    const strecke: Strecke = { id: s.id, name: s.name, aktiv: s.aktiv, ruhe_tage: s.ruhe_tage, schritte };

    // Eine Strecke, der etwas fehlt, wird NICHT halb gefahren.
    const fehlt = fehltZumStarten(strecke);
    if (fehlt.length > 0) {
      bericht.push({ strecke: s.name, uebersprungen: 'nicht startklar', fehlt });
      continue;
    }

    // --- Kontakte und Käufe dieses Betriebs -------------------------------
    const [{ data: kontakteRoh }, { data: rechnungenRoh }] = await Promise.all([
      db.from('kontakte').select(KONTAKT_SPALTEN).eq('owner_user_id', s.owner_user_id).limit(MAX_KONTAKTE),
      db.from('rechnungen').select('kontakt_id, bezahlt_am, faelligkeitsdatum')
        .eq('owner_user_id', s.owner_user_id).not('kontakt_id', 'is', null).limit(5000),
    ]);

    const kontakte = (kontakteRoh ?? []) as KontaktRow[];
    const kontaktJeId = new Map<string, KontaktRow>();
    for (const k of kontakte) kontaktJeId.set(String(k.id), k);

    // Als Kaufdatum gilt der Zahlungseingang; ohne den das Fälligkeitsdatum.
    // Belegte Spalten — kein geratenes „rechnungsdatum".
    const kaeufe = letzterKaufJeKontakt(
      ((rechnungenRoh ?? []) as RechnungRow[]).map((r) => ({
        kontakt_id: r.kontakt_id, datum: r.bezahlt_am ?? r.faelligkeitsdatum,
      })),
    );

    // --- Wer ist schon drin, wer war schon mal drin? ----------------------
    const { data: laeufeRoh } = await db
      .from('rueckhol_lauf')
      .select('id, owner_user_id, strecke_id, kontakt_id, email, gestartet_am, schritt, faellig_am, status, beendet_am')
      .eq('strecke_id', s.id).eq('owner_user_id', s.owner_user_id)
      .limit(5000);
    const laeufe = (laeufeRoh ?? []) as LaufRow[];

    const offen = new Set<string>();
    const letztesEnde = new Map<string, string>();
    for (const l of laeufe) {
      const kid = String(l.kontakt_id ?? '');
      if (!kid) continue;
      if (l.status === 'aktiv') offen.add(kid);
      if (l.beendet_am) {
        const alt = letztesEnde.get(kid);
        if (!alt || l.beendet_am > alt) letztesEnde.set(kid, l.beendet_am);
      }
    }

    // --- 1) AUFNEHMEN ------------------------------------------------------
    const ersterSchritt = aktiveSchritte(strecke)[0];
    const neueZeilen: Array<Record<string, unknown>> = [];
    const wuerdeAufnehmen: string[] = [];

    for (const k of kontakte) {
      if (neueZeilen.length + wuerdeAufnehmen.length >= MAX_NEUE_JE_LAUF) break;
      const kid = String(k.id);
      if (offen.has(kid)) continue;
      if (nochGesperrt(letztesEnde.get(kid), heute)) continue;

      const r = istRuhend(k, kaeufe.get(kid) ?? null, heute, s.ruhe_tage);
      if (!r.ruhend) continue;

      if (probe) { wuerdeAufnehmen.push(String(k.email ?? '')); continue; }
      neueZeilen.push({
        owner_user_id: s.owner_user_id,
        strecke_id: s.id,
        kontakt_id: kid,
        email: String(k.email ?? ''),
        gestartet_am: heute,
        schritt: 0,
        faellig_am: plusTage(heute, ersterSchritt?.nach_tagen ?? 0),
        status: 'aktiv',
      });
    }

    if (neueZeilen.length > 0) {
      // Der Teilindex (strecke_id, kontakt_id) where status='aktiv' fängt ab,
      // wenn zwei Läufe gleichzeitig denselben Kontakt aufnehmen wollen.
      const { error } = await db.from('rueckhol_lauf').insert(neueZeilen);
      if (error) { fehler++; bericht.push({ strecke: s.name, fehler: error.message }); }
      else neu += neueZeilen.length;
    }

    // --- 2) SENDEN ---------------------------------------------------------
    const faellige = laeufe
      .filter((l) => l.status === 'aktiv' && l.faellig_am !== null && l.faellig_am <= heute)
      .sort((a, b) => String(a.faellig_am).localeCompare(String(b.faellig_am)))
      .slice(0, MAX_FAELLIG);

    let gesendetHier = 0, gestopptHier = 0, fertigHier = 0;
    const wuerdeSenden: Array<{ email: string; schritt: number }> = [];

    for (const l of faellige) {
      if (gesendet >= deckel) break; // Deckel gilt über alle Strecken hinweg.

      const k = l.kontakt_id ? kontaktJeId.get(String(l.kontakt_id)) : undefined;
      const kauf = l.kontakt_id ? (kaeufe.get(String(l.kontakt_id)) ?? null) : null;
      const e = entscheide(l, strecke, k ?? null, kauf, heute);

      if (e.tun === 'warten') continue;

      if (e.tun === 'stopp') {
        if (!probe) {
          await db.from('rueckhol_lauf')
            .update({ status: 'gestoppt', stopp_grund: STOPP_TEXT[e.stopp], beendet_am: heute, faellig_am: null })
            .eq('id', l.id).eq('owner_user_id', s.owner_user_id);
        }
        gestopptHier++; gestoppt++;
        continue;
      }

      if (e.tun === 'fertig') {
        if (!probe) {
          await db.from('rueckhol_lauf')
            .update({ status: 'fertig', beendet_am: heute, faellig_am: null })
            .eq('id', l.id).eq('owner_user_id', s.owner_user_id);
        }
        fertigHier++; fertig++;
        continue;
      }

      if (probe) { wuerdeSenden.push({ email: l.email, schritt: e.schritt }); gesendet++; gesendetHier++; continue; }

      try {
        // Erst sperren, dann senden.
        const { error: sperrFehler } = await db.from('rueckhol_versand').insert({
          owner_user_id: s.owner_user_id, lauf_id: l.id, schritt: e.schritt,
        });
        if (sperrFehler) continue; // ein anderer Durchgang war schneller

        const marke = await brandingVon(s.owner_user_id);
        const letzte = letzteBeruehrung(k ?? null, kauf);
        const werte = {
          name: nameFuer(k ?? null),
          firma: String(k?.firma ?? ''),
          betrieb: marke.firma,
          tage: String(tageZwischen(letzte, heute) ?? ''),
          letzter_kauf: letzte,
        };

        const betreff = setzePlatzhalter(e.betreff, werte).trim() || `Nachricht von ${marke.firma}`;
        const text = setzePlatzhalter(e.text, werte);
        const abUrl = `${basis}/api/oeffentlich/rueckhol-abmelden?lauf=${encodeURIComponent(l.id)}`;

        const inhalt = `
          <p style="margin:0 0 12px;">${escapeHtml(anrede(k ?? null))}</p>
          <div style="margin:0 0 12px;">${textZuHtml(text)}</div>
          <p style="margin:26px 0 0;border-top:1px solid #eeeeee;padding-top:14px;color:#8a94a6;font-size:12px;line-height:1.5;">
            Sie erhalten diese E-Mail, weil Sie Kunde bei ${escapeHtml(marke.firma)} sind.
            <a href="${abUrl}" style="color:#8a94a6;">Hier keine Werbung mehr erhalten</a>.
          </p>`;

        const r = await sendeMail({
          an: l.email,
          betreff,
          html: kundenMailLayout(marke.firma, marke.akzent, '', inhalt),
          absenderName: marke.firma,
          antwortAn: marke.email,
        });
        if (!r.ok) throw new Error(r.fehler);

        await db.from('rueckhol_lauf')
          .update(nachVersand(e.schritt, strecke, l.gestartet_am, heute))
          .eq('id', l.id).eq('owner_user_id', s.owner_user_id);

        gesendet++; gesendetHier++;
      } catch (err) {
        console.error('[rueckholung] Versand fehlgeschlagen', l.id, err instanceof Error ? err.message : err);
        fehler++;
      }
    }

    bericht.push({
      strecke: s.name,
      kontakte_geprueft: kontakte.length,
      neu_aufgenommen: probe ? wuerdeAufnehmen.length : neueZeilen.length,
      faellig: faellige.length,
      gesendet: gesendetHier,
      gestoppt: gestopptHier,
      abgeschlossen: fertigHier,
      ...(probe ? { wuerde_aufnehmen: wuerdeAufnehmen.slice(0, 10), wuerde_senden: wuerdeSenden.slice(0, 10) } : {}),
    });
  }

  return NextResponse.json({
    ok: true,
    probe: probe || undefined,
    strecken: strecken.length,
    neu, gesendet, gestoppt, abgeschlossen: fertig, fehler,
    hinweis: begruendung(budget, deckel, gesendet),
    bericht,
  });
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
