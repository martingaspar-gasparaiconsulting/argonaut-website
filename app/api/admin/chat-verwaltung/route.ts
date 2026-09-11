// ============================================================================
// ARGONAUT OS · app/api/admin/chat-verwaltung  (11.09.2026)
//
// BETREIBER-ENDPUNKT. Zwei Dinge, die bisher nur mit SQL oder gar nicht gingen:
//
//   1. MENGE — welche Stufe hat der Betrieb gebucht, wie viele Gespräche hat
//      sein öffentlicher Berater diesen Monat geführt, wie nah ist er an der
//      Grenze. Bis heute stand das ausschliesslich in `chat_tarif` und
//      `chat_verbrauch`; wer es sehen wollte, musste in den Supabase-Editor.
//
//   2. DOMAINS — auf welchen fremden Websites der Berater überhaupt antworten
//      darf. Das stand im KUNDEN-Dashboard unter /dashboard/webseiten — also an
//      einer Stelle, an die der Betreiber gar nicht kommt. Bei einem Kunden, der
//      "machen Sie das mal" sagt, ist das genau der falsche Ort.
//
// SICHERHEIT: dasselbe Doppelschloss wie /api/admin/betrieb-einrichtung, jetzt
// aus lib/betreiberGuard.ts — eine Stelle, nicht fünfzehn.
//
// WAS HIER BEWUSST NICHT PASSIERT
// · Der Zähler wird nie zurückgesetzt. Ein "Verbrauch auf null"-Knopf wäre ein
//   Knopf, mit dem sich Umsatz wegklicken lässt. Der Monatswechsel erledigt das
//   von selbst (siehe monatsSchluessel()).
// · Es wird kein einziger Besucher gezählt, angezeigt oder gespeichert. Gezählt
//   wird der BETRIEB. Keine IP, kein Zeitstempel je Gespräch, keine Verläufe.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { betreiberGuard } from '@/lib/betreiberGuard';
import { pruefeDeckel, monatsSchluessel, CHAT_STUFEN, type ChatStufe } from '@/lib/chatDeckel';
import { leseStufe, ampel, klartext, wechselHinweis, pruefeDomainWechsel, STUFEN_REIHE } from '@/lib/chatVerwaltung';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Wie viele Monate Verlauf die Akte zeigt. */
const VERLAUF_MONATE = 6;
/** Wie viele Seiten eines Betriebs gezeigt werden. */
const SEITEN_LIMIT = 50;

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

type TarifRow = { stufe?: string | null; notiz?: string | null; geaendert_am?: string | null };
type VerbrauchRow = { monat?: string | null; anzahl?: number | null; gewarnt_am?: string | null; gesperrt_seit?: string | null };
type SeiteRow = {
  slug?: string | null;
  status?: string | null;
  domain?: string | null;
  oeffentlich_id?: string | null;
  chat_domains?: string[] | null;
};

// ---------------------------------------------------------------------------
// GET ?betrieb=<owner_user_id>
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const gesperrt = await betreiberGuard();
  if (gesperrt) return gesperrt;

  const betrieb = (new URL(req.url).searchParams.get('betrieb') || '').trim();
  if (!betrieb) return NextResponse.json({ ok: false, error: 'Kein Betrieb gewählt.' }, { status: 400 });

  const db = adminDb();
  const monat = monatsSchluessel(new Date());

  const [tarifR, verbrauchR, verlaufR, seitenR] = await Promise.all([
    db.from('chat_tarif').select('stufe, notiz, geaendert_am').eq('owner_user_id', betrieb).maybeSingle()
      .then((r) => r, () => ({ data: null, error: true as unknown })),
    db.from('chat_verbrauch').select('monat, anzahl, gewarnt_am, gesperrt_seit')
      .eq('owner_user_id', betrieb).eq('monat', monat).maybeSingle()
      .then((r) => r, () => ({ data: null, error: true as unknown })),
    db.from('chat_verbrauch').select('monat, anzahl')
      .eq('owner_user_id', betrieb).order('monat', { ascending: false }).limit(VERLAUF_MONATE)
      .then((r) => r, () => ({ data: null, error: true as unknown })),
    db.from('web_seiten').select('slug, status, domain, oeffentlich_id, chat_domains')
      .eq('owner_user_id', betrieb).limit(SEITEN_LIMIT)
      .then((r) => r, () => ({ data: null, error: true as unknown })),
  ]);

  const tarif = tarifR.error ? null : (tarifR.data as TarifRow | null);
  const heute = verbrauchR.error ? null : (verbrauchR.data as VerbrauchRow | null);
  const verlauf = verlaufR.error ? [] : ((verlaufR.data as VerbrauchRow[] | null) ?? []);
  const seiten = seitenR.error ? [] : ((seitenR.data as SeiteRow[] | null) ?? []);

  // Ohne Zeile in chat_tarif — oder mit Unsinn darin — gilt „klein". Das ist
  // hier bewusst die NACHSICHTIGE Lesart: Beim ANZEIGEN muss dasselbe
  // herauskommen wie im laufenden Chat, sonst zeigt die Akte etwas anderes an,
  // als der Besucher erlebt. Streng gelesen wird erst beim SPEICHERN, unten.
  const stufe: ChatStufe = leseStufe(tarif?.stufe) ?? 'klein';
  const verbraucht = Math.max(0, Math.floor(Number(heute?.anzahl) || 0));
  const deckel = pruefeDeckel(verbraucht, stufe);

  return NextResponse.json({
    ok: true,
    monat,
    stufe,
    stufeGesetzt: !!tarif,
    notiz: tarif?.notiz ?? '',
    geaendertAm: tarif?.geaendert_am ?? null,
    verbraucht,
    grenze: CHAT_STUFEN[stufe].grenze,
    preis: CHAT_STUFEN[stufe].preis,
    erlaubt: deckel.erlaubt,
    warnen: deckel.warnen,
    rest: deckel.rest,
    prozent: deckel.prozent,
    ampel: ampel(deckel),
    klartext: klartext(verbraucht, stufe),
    betreiberText: deckel.betreiberText,
    gewarntAm: heute?.gewarnt_am ?? null,
    gesperrtSeit: heute?.gesperrt_seit ?? null,
    stufen: STUFEN_REIHE.map((k) => ({ key: k, ...CHAT_STUFEN[k] })),
    verlauf: verlauf.map((v) => ({ monat: String(v.monat ?? ''), anzahl: Math.max(0, Number(v.anzahl) || 0) })),
    seiten: seiten.map((s) => ({
      slug: String(s.slug ?? ''),
      status: String(s.status ?? ''),
      domain: s.domain ?? '',
      oeffentlichId: s.oeffentlich_id ?? '',
      chatDomains: Array.isArray(s.chat_domains) ? s.chat_domains.map((d) => String(d)) : [],
    })),
  });
}

// ---------------------------------------------------------------------------
// POST { betrieb, aktion: 'stufe' | 'domains', … }
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const gesperrt = await betreiberGuard();
  if (gesperrt) return gesperrt;

  const body = await req.json().catch(() => null);
  const betrieb = String(body?.betrieb ?? '').trim();
  const aktion = String(body?.aktion ?? '').trim().toLowerCase();

  if (!betrieb) return NextResponse.json({ ok: false, error: 'Kein Betrieb gewählt.' }, { status: 400 });

  const db = adminDb();
  const { data: p } = await db.from('profiles').select('id').eq('id', betrieb).maybeSingle();
  if (!p) return NextResponse.json({ ok: false, error: 'Betrieb nicht gefunden.' }, { status: 404 });

  if (aktion === 'stufe') return setzeStufe(db, betrieb, body);
  if (aktion === 'domains') return setzeDomains(db, betrieb, body);
  return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
}

// --- Stufe -----------------------------------------------------------------

async function setzeStufe(db: ReturnType<typeof adminDb>, betrieb: string, body: Record<string, unknown> | null) {
  // STRENG lesen: Wer „groß" klickt, bekommt „groß" — oder eine Absage. Ein
  // stiller Rückfall auf „klein" wäre hier ein Fehler, den erst der Kunde merkt.
  const stufe = leseStufe(body?.stufe);
  if (!stufe) {
    return NextResponse.json(
      { ok: false, error: `Unbekannte Stufe. Erlaubt sind: ${STUFEN_REIHE.join(', ')}.` },
      { status: 400 },
    );
  }

  const notiz = String(body?.notiz ?? '').trim().slice(0, 300);
  const monat = monatsSchluessel(new Date());

  // Den aktuellen Stand holen, damit der Betreiber in der Antwort sieht, was
  // sein Wechsel für DIESEN Monat bedeutet.
  const [altR, verbrauchR] = await Promise.all([
    db.from('chat_tarif').select('stufe').eq('owner_user_id', betrieb).maybeSingle()
      .then((r) => r, () => ({ data: null, error: true as unknown })),
    db.from('chat_verbrauch').select('anzahl').eq('owner_user_id', betrieb).eq('monat', monat).maybeSingle()
      .then((r) => r, () => ({ data: null, error: true as unknown })),
  ]);
  const alt = (altR.data as { stufe?: string } | null)?.stufe ?? 'klein';
  const verbraucht = Math.max(0, Math.floor(Number((verbrauchR.data as { anzahl?: number } | null)?.anzahl) || 0));
  const hinweis = wechselHinweis(verbraucht, alt, stufe);

  const { error } = await db
    .from('chat_tarif')
    .upsert(
      { owner_user_id: betrieb, stufe, notiz: notiz || null, geaendert_am: new Date().toISOString() },
      { onConflict: 'owner_user_id' },
    );

  if (error) {
    console.error('admin/chat-verwaltung stufe:', error.message);
    return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    stufe,
    vorher: alt,
    verbraucht,
    klartext: klartext(verbraucht, stufe),
    hinweis,
  });
}

// --- Domains ---------------------------------------------------------------

async function setzeDomains(db: ReturnType<typeof adminDb>, betrieb: string, body: Record<string, unknown> | null) {
  const slug = String(body?.seite ?? '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'Keine Seite gewählt.' }, { status: 400 });

  const { data: vorhanden, error: leseFehler } = await db
    .from('web_seiten')
    .select('chat_domains')
    .eq('owner_user_id', betrieb)
    .eq('slug', slug)
    .maybeSingle();

  if (leseFehler) {
    console.error('admin/chat-verwaltung domains lesen:', leseFehler.message);
    return NextResponse.json({ ok: false, error: 'Konnte die Seite nicht lesen.' }, { status: 500 });
  }
  if (!vorhanden) {
    // Bewusst KEIN Anlegen. Eine Seite entsteht im Kunden-Dashboard; hier eine
    // halbe Zeile zu erzeugen, hinterliesse dem Kunden eine Seite, die er nie
    // gebaut hat.
    return NextResponse.json(
      { ok: false, error: `Für diesen Betrieb gibt es keine Seite „${slug}". Die legt der Kunde in seinem Dashboard an.` },
      { status: 404 },
    );
  }

  const alt = (vorhanden as { chat_domains?: string[] | null }).chat_domains ?? [];
  const wechsel = pruefeDomainWechsel(alt, body?.chat_domains);

  const { error } = await db
    .from('web_seiten')
    .update({ chat_domains: wechsel.liste, aktualisiert_am: new Date().toISOString() })
    .eq('owner_user_id', betrieb)
    .eq('slug', slug);

  if (error) {
    console.error('admin/chat-verwaltung domains:', error.message);
    return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    slug,
    chatDomains: wechsel.liste,
    hinzu: wechsel.hinzu,
    weg: wechsel.weg,
    verworfen: wechsel.verworfen,
    hinweis: wechsel.warnung,
  });
}
