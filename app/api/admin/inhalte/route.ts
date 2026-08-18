import { NextResponse } from 'next/server';
import { createClient as createServer } from '@/lib/supabase-server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { offeneKapitel, mengen, KATEGORIEN, istBausteinTyp, type BausteinTyp, type BausteinZeile } from '@/lib/inhaltBaustein';
import { SYSTEM_PROMPT, frageFuer, modellWahl, MAX_TOKENS, schaetzeKosten } from '@/lib/inhaltPrompt';
import { bereiteVor, absenden, MAX_JE_STAPEL, type Auftrag } from '@/lib/kiBatch';
import { websiteBranchen } from '../../../vorschau/_lib/branchen-web';

// ============================================================================
// ARGONAUT OS · /api/admin/inhalte  (Inhalts-Werkstatt · Erzeugung)
//
// GET  -> Bestandsaufnahme: was ist da, was ist freigegeben, was fehlt noch,
//         was wuerde der naechste Stapel kosten, laeuft gerade einer.
// POST -> schickt die offenen Kapitel als EINEN Stapel an die Batch-
//         Schnittstelle. Halber Preis, Ergebnis binnen 24 Stunden.
//         Der Abhol-Cron (/api/cron/ki-batch-abholen, alle 15 Minuten) legt
//         die Antworten als ENTWUERFE ab — freigegeben wird von Hand.
//
// DREI GELAENDER, WEIL HIER GELD FLIESST
// 1. Es darf immer nur EIN Stapel der Werkstatt offen sein. Zweimal klicken
//    heisst sonst zweimal zahlen — und die zweite Lieferung ueberschreibt
//    nichts, sie ist einfach weg.
// 2. Der Aufruf verlangt `bestaetigt: true`. Ein versehentlicher POST kostet
//    nichts.
// 3. Bestellt wird nur, was es noch NICHT gibt (offeneKapitel). Ein Entwurf,
//    an dem Martin schon gearbeitet hat, wird nie neu bestellt.
//
// ZUGANG: nur profiles.role === 'admin'. Eine Route hinter einer geschuetzten
// Seite ist NICHT automatisch selbst geschuetzt — sie ist per URL erreichbar.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROUTE = 'inhalt-werkstatt';

/**
 * Alle vier Typen sind erzeugbar. Vorworte und Dialoge kamen am 17.08. dazu —
 * die Branchendaten werden aus branchen-web geladen und an offeneKapitel()
 * uebergeben, statt sie in lib/inhaltBaustein.ts zu importieren (dort haengen
 * sonst ueber ein Megabyte SEO-Texte am node-testbaren Kern).
 */
const ERZEUGBAR: BausteinTyp[] = ['modul_kapitel', 'kategorie_kapitel', 'branchen_vorwort', 'ki_dialog'];

/** Wieviele Stapel gleichzeitig offen sein duerfen. */
const MAX_OFFENE_STAPEL = 5;

/** Die Branchen fuer Vorwort und Dialog — nur die Felder, die zaehlen. */
function branchenListe() {
  return websiteBranchen().map((b) => ({
    slug: b.slug, name: b.name, kategorie: b.kategorie,
    schmerzen: b.schmerzen, ergebnisse: b.ergebnisse,
  }));
}

function adminDb() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

/** Gibt null zurueck, wenn alles in Ordnung ist — sonst die Absage samt Nutzer-ID. */
async function pruefeAdmin(): Promise<{ absage: NextResponse } | { userId: string }> {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { absage: NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 }) };

  const { data: profil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profil || (profil as { role?: string }).role !== 'admin') {
    return { absage: NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 }) };
  }
  return { userId: user.id };
}

/**
 * Alle vorhandenen Bausteine dieses Betreibers — nur die Felder, die fuer
 * „was fehlt noch" zaehlen. Der Text bleibt draussen: bei 800 Kapiteln waeren
 * das mehrere Megabyte fuer eine Frage, die sich am Schluessel entscheidet.
 */
async function ladeBestand(db: ReturnType<typeof adminDb>, userId: string): Promise<BausteinZeile[]> {
  const alle: BausteinZeile[] = [];
  const SEITE = 1000;
  for (let runde = 0; runde < 20; runde++) {
    const von = runde * SEITE;
    const { data, error } = await db
      .from('inhalt_baustein')
      .select('typ,schluessel,freigegeben')
      .eq('owner_user_id', userId)
      .range(von, von + SEITE - 1);
    if (error || !Array.isArray(data) || data.length === 0) break;
    alle.push(...(data as BausteinZeile[]));
    if (data.length < SEITE) break;
  }
  return alle;
}

type OffenerStapel = { id: string; zweck: string | null; status: string; anzahl: number; erstellt_am: string; zuordnung: Record<string, Record<string, unknown>> };

/** Alle Stapel der Werkstatt, die noch unterwegs sind. */
async function offeneStapel(db: ReturnType<typeof adminDb>, userId: string): Promise<OffenerStapel[]> {
  const { data } = await db
    .from('ki_batch')
    .select('id,zweck,status,anzahl,erstellt_am,zuordnung')
    .eq('owner_user_id', userId)
    .eq('route', ROUTE)
    .in('status', ['wartet', 'laeuft'])
    .order('erstellt_am', { ascending: false });
  return (data as OffenerStapel[] | null) ?? [];
}

/**
 * Welche Bausteine sind in laufenden Stapeln schon bestellt?
 *
 * DAS IST DER RIEGEL GEGEN DOPPELTES BEZAHLEN. Ein laufender Stapel hat noch
 * keine Zeilen in inhalt_baustein angelegt — offeneKapitel() sieht die Kapitel
 * also weiterhin als offen. Wer waehrend des Wartens erneut auf „erzeugen"
 * klickt, bestellte sie ein zweites Mal und zahlte doppelt.
 *
 * Der frueher hier stehende Riegel „nur EIN Stapel gleichzeitig" war zu grob:
 * 698 Vorworte und 698 Dialoge passen zusammen mit den Modul-Kapiteln nicht in
 * einen Stapel (Grenze 1000). Jetzt zaehlt der konkrete Schluessel, nicht die
 * Anzahl der Stapel — mehrere Stapel duerfen parallel laufen, aber kein
 * Baustein wird zweimal bestellt.
 */
function bereitsBestellt(stapel: OffenerStapel[]): Set<string> {
  const raus = new Set<string>();
  for (const s of stapel) {
    for (const ziel of Object.values(s.zuordnung ?? {})) {
      const typ = typeof ziel?.typ === 'string' ? ziel.typ : '';
      const key = typeof ziel?.schluessel === 'string' ? ziel.schluessel : '';
      if (typ && key) raus.add(`${typ}::${key}`);
    }
  }
  return raus;
}

// ---------------------------------------------------------------------------
// GET — Bestandsaufnahme
// ---------------------------------------------------------------------------
export async function GET() {
  const wache = await pruefeAdmin();
  if ('absage' in wache) return wache.absage;

  const db = adminDb();
  const bestand = await ladeBestand(db, wache.userId);

  const jeTyp: Record<string, { gesamt: number; freigegeben: number }> = {};
  for (const z of bestand) {
    const t = String(z.typ);
    if (!jeTyp[t]) jeTyp[t] = { gesamt: 0, freigegeben: 0 };
    jeTyp[t].gesamt++;
    if (z.freigegeben === true) jeTyp[t].freigegeben++;
  }

  const laufende = await offeneStapel(db, wache.userId);
  const schonBestellt = bereitsBestellt(laufende);

  const offen = offeneKapitel(bestand, branchenListe())
    .filter((o) => ERZEUGBAR.indexOf(o.typ) >= 0)
    .filter((o) => !schonBestellt.has(`${o.typ}::${o.schluessel}`));

  const modell = modellWahl(process.env.INHALT_MODELL);
  const kosten = schaetzeKosten(offen.length, modell);

  return NextResponse.json({
    ok: true,
    mengen: mengen(),
    kategorien: KATEGORIEN.length,
    bestand: { gesamt: bestand.length, jeTyp },
    offen: {
      anzahl: offen.length,
      jeTyp: ERZEUGBAR.map((t) => ({ typ: t, anzahl: offen.filter((o) => o.typ === t).length })),
    },
    modell,
    kostenUsd: Number(kosten.usd.toFixed(2)),
    kostenHinweis: kosten.hinweis,
    laufendeStapel: laufende.map((s) => ({ id: s.id, zweck: s.zweck, status: s.status, anzahl: s.anzahl, erstellt_am: s.erstellt_am })),
    laufenderStapel: laufende[0] ? { id: laufende[0].id, zweck: laufende[0].zweck, status: laufende[0].status, anzahl: laufende[0].anzahl, erstellt_am: laufende[0].erstellt_am } : null,
    inArbeit: schonBestellt.size,
    branchen: branchenListe().length,
    schluesselVorhanden: Boolean(process.env.ANTHROPIC_API_KEY),
    maxJeStapel: MAX_JE_STAPEL,
  });
}

// ---------------------------------------------------------------------------
// POST — einen Stapel abschicken
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const wache = await pruefeAdmin();
  if ('absage' in wache) return wache.absage;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'Der KI-Zugang ist nicht eingerichtet (ANTHROPIC_API_KEY fehlt).' }, { status: 500 });
  }

  let bestaetigt = false;
  let nurTypen: BausteinTyp[] = ERZEUGBAR;
  let grenze = MAX_JE_STAPEL;
  try {
    const koerper = await req.json();
    bestaetigt = koerper?.bestaetigt === true;
    if (Array.isArray(koerper?.typen) && koerper.typen.length > 0) {
      nurTypen = koerper.typen
        .map(String)
        .filter((t: string): t is BausteinTyp => istBausteinTyp(t) && ERZEUGBAR.indexOf(t as BausteinTyp) >= 0);
    }
    const g = Number(koerper?.max);
    if (Number.isFinite(g) && g > 0) grenze = Math.min(MAX_JE_STAPEL, Math.floor(g));
  } catch {
    return NextResponse.json({ ok: false, error: 'Die Anfrage war unlesbar.' }, { status: 400 });
  }

  if (!bestaetigt) {
    return NextResponse.json({ ok: false, error: 'Der Stapel kostet Geld — bitte ausdrücklich bestätigen.' }, { status: 400 });
  }
  if (nurTypen.length === 0) {
    return NextResponse.json({ ok: false, error: 'Für die angegebenen Typen kann die Werkstatt heute nichts erzeugen.' }, { status: 400 });
  }

  const db = adminDb();

  // GELAENDER 1: nicht beliebig viele Stapel gleichzeitig.
  const laufende = await offeneStapel(db, wache.userId);
  if (laufende.length >= MAX_OFFENE_STAPEL) {
    return NextResponse.json({
      ok: false,
      error: `Es laufen bereits ${laufende.length} Stapel. Bitte abwarten — der Abhol-Dienst sieht alle 15 Minuten nach.`,
    }, { status: 409 });
  }

  // GELAENDER 3: nur bestellen, was es noch nicht gibt UND noch nicht unterwegs ist.
  const schonBestellt = bereitsBestellt(laufende);
  const bestand = await ladeBestand(db, wache.userId);
  const offen = offeneKapitel(bestand, branchenListe())
    .filter((o) => nurTypen.indexOf(o.typ) >= 0)
    .filter((o) => !schonBestellt.has(`${o.typ}::${o.schluessel}`))
    .slice(0, grenze);

  if (offen.length === 0) {
    return NextResponse.json({ ok: true, abgeschickt: 0, hinweis: 'Es fehlt kein Kapitel — es gibt nichts zu erzeugen.' });
  }

  const auftraege: Auftrag[] = offen.map((o) => ({
    kennung: `${o.typ}-${o.schluessel}`,
    system: SYSTEM_PROMPT,
    frage: frageFuer(o),
    ziel: { typ: o.typ, schluessel: o.schluessel, ueberschrift: o.ueberschrift },
  }));

  // bereiteVor() vergibt EIN Token-Budget fuer den ganzen Stapel — deshalb das
  // groesste der beteiligten Typen, damit kein Kapitel mitten im Satz abbricht.
  const maxTokens = Math.max(...offen.map((o) => MAX_TOKENS[o.typ] ?? 1200));
  const modell = modellWahl(process.env.INHALT_MODELL);
  const vorbereitet = bereiteVor(auftraege, modell, maxTokens);

  if (vorbereitet.anfragen.length === 0) {
    return NextResponse.json({ ok: false, error: 'Es konnte keine einzige Anfrage gebaut werden.' }, { status: 500 });
  }

  const kosten = schaetzeKosten(vorbereitet.anfragen.length, modell);
  // Der Zweck nennt die Typen — bei mehreren parallelen Stapeln waere
  // „Inhalts-Werkstatt: 698 Kapitel" sonst nicht unterscheidbar.
  const typenImStapel = [...new Set(offen.map((o) => o.typ))].join(' + ');
  const zweck = `Inhalts-Werkstatt: ${vorbereitet.anfragen.length}× ${typenImStapel}`;

  // ZUERST die Zeile, DANN absenden. Scheitert das Absenden, bleibt eine Zeile
  // ohne extern_id zurueck — die schliesst der Abhol-Cron sauber als „nie
  // abgeschickt" ab. Andersherum waere ein bezahlter Stapel spurlos verloren.
  const { data: neu, error: anlegeFehler } = await db
    .from('ki_batch')
    .insert({
      owner_user_id: wache.userId,
      route: ROUTE,
      zweck,
      status: 'wartet',
      anzahl: vorbereitet.anfragen.length,
      zuordnung: vorbereitet.zuordnung,
    })
    .select('id')
    .single();

  if (anlegeFehler || !neu) {
    return NextResponse.json({ ok: false, error: `Der Stapel konnte nicht vorgemerkt werden: ${anlegeFehler?.message ?? 'unbekannt'}` }, { status: 500 });
  }

  const stapelId = (neu as { id: string }).id;
  const gesendet = await absenden(vorbereitet.anfragen);

  if (!gesendet.ok) {
    await db.from('ki_batch').update({
      status: 'fehler',
      fehler_text: gesendet.fehler,
      beendet_am: new Date().toISOString(),
    }).eq('id', stapelId);
    return NextResponse.json({ ok: false, error: gesendet.fehler }, { status: 502 });
  }

  await db.from('ki_batch').update({ extern_id: gesendet.extern_id }).eq('id', stapelId);

  return NextResponse.json({
    ok: true,
    stapelId,
    externId: gesendet.extern_id,
    abgeschickt: vorbereitet.anfragen.length,
    uebersprungen: vorbereitet.uebersprungen,
    modell,
    kostenUsd: Number(kosten.usd.toFixed(2)),
    hinweis: 'Der Stapel läuft. Der Abhol-Dienst sieht alle 15 Minuten nach und legt die Ergebnisse als Entwürfe ab — meist unter einer Stunde, spätestens nach 24 Stunden.',
  });
}
