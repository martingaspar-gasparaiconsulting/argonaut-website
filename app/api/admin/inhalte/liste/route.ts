import { NextResponse } from 'next/server';
import { createClient as createServer } from '@/lib/supabase-server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { istBausteinTyp, type BausteinTyp } from '@/lib/inhaltBaustein';
import { pruefeEntwurf, vorschau } from '@/lib/inhaltPrompt';

// ============================================================================
// ARGONAUT OS · /api/admin/inhalte/liste  (Inhalts-Werkstatt · Redaktion)
//
// GET   -> die Kapitel zum Lesen, gefiltert und in Seiten.
// PATCH -> einen Text speichern, freigeben oder die Freigabe zuruecknehmen.
//          Auch als Sammelaktion fuer mehrere angehakte Zeilen.
//
// WARUM EINE ZWEITE ROUTE NEBEN /api/admin/inhalte
// Die dortige GET liefert bewusst NUR Zahlen — sie beantwortet „was fehlt
// noch". Die Redaktion braucht die Texte selbst. Bei 830 Bausteinen waeren das
// mehrere Megabyte je Seitenaufruf, wenn beides dieselbe Route waere.
//
// ZWEI REGELN, DIE HIER HAENGEN
//
// 1. FREIGEBEN OHNE TEXT WIRD ABGEWIESEN. Ein Haken an einem leeren Kapitel
//    sieht erledigt aus, taucht aber in keinem Buch auf (istVerwendbar
//    verlangt Haken UND Text). Der Fehler faende sich erst, wenn ein Buch
//    unerklaerlich duenn bleibt.
//
// 2. NACH JEDER AENDERUNG WIRD NEU GEPRUEFT. Behebt Martin ein „du" von Hand,
//    verschwindet die Beanstandung sofort. Sonst bliebe eine alte Notiz stehen
//    und er suchte einen Fehler, den es nicht mehr gibt. Sein Text wird dabei
//    NICHT umgeschrieben — nur beurteilt.
//
// ZUGANG: nur profiles.role === 'admin'. Die Service-Rolle umgeht RLS —
// deshalb steht bei JEDER Abfrage owner_user_id im Filter.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEITE_MAX = 200;

function adminDb() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

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

type Zeile = {
  id: string;
  typ: string;
  schluessel: string;
  titel: string | null;
  text: string | null;
  notiz: string | null;
  quelle: string | null;
  freigegeben: boolean;
  freigegeben_am: string | null;
  version: number;
  aktualisiert_am: string;
};

// ---------------------------------------------------------------------------
// GET — lesen
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const wache = await pruefeAdmin();
  if ('absage' in wache) return wache.absage;

  const p = new URL(req.url).searchParams;
  const einzelId = (p.get('id') || '').trim();
  const typ = p.get('typ') || '';
  const status = p.get('status') || 'alle';      // alle | entwurf | freigegeben | beanstandet
  const suche = (p.get('suche') || '').trim();
  const versatz = Math.max(0, Number(p.get('versatz')) || 0);
  const grenze = Math.min(SEITE_MAX, Math.max(1, Number(p.get('grenze')) || 50));
  const volltext = p.get('volltext') === '1';

  const db = adminDb();

  // Der Text wird geladen (fuer die Vorschauzeile), aber nur bei volltext=1
  // auch ausgeliefert. Deshalb ist die Seitengroesse gedeckelt: bei 830
  // Kapiteln waere „alles auf einmal" sonst ein Megabyte-Transport fuer eine
  // Uebersicht, von der man je Zeile zwei Zeilen liest.
  const FELDER = 'id,typ,schluessel,titel,text,notiz,quelle,freigegeben,freigegeben_am,version,aktualisiert_am';

  let abfrage = db
    .from('inhalt_baustein')
    .select(FELDER, { count: 'exact' })
    .eq('owner_user_id', wache.userId);

  // Ein einzelnes Kapitel zum Bearbeiten. Bewusst ueber die ID und nicht ueber
  // die Suche: „crm" traefe auch „crm-briefing", und bei gedeckelter
  // Seitengroesse koennte die gesuchte Zeile hinten herausfallen — der Editor
  // oeffnete sich dann leer und der Text schiene verloren.
  if (einzelId) abfrage = abfrage.eq('id', einzelId);

  if (istBausteinTyp(typ)) abfrage = abfrage.eq('typ', typ);
  if (status === 'entwurf') abfrage = abfrage.eq('freigegeben', false);
  if (status === 'freigegeben') abfrage = abfrage.eq('freigegeben', true);
  if (status === 'beanstandet') abfrage = abfrage.not('notiz', 'is', null);
  if (suche) abfrage = abfrage.or(`titel.ilike.%${suche}%,schluessel.ilike.%${suche}%`);

  const { data, error, count } = await abfrage
    .order('freigegeben', { ascending: true })          // Unerledigtes zuerst
    .order('notiz', { ascending: false, nullsFirst: false })  // davon das Beanstandete oben
    .order('typ', { ascending: true })
    .order('schluessel', { ascending: true })
    .range(versatz, versatz + grenze - 1);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const zeilen = (data ?? []) as unknown as Zeile[];

  // Zahlen fuer die Kacheln — zaehlen lassen statt Zeilen laden.
  const [gesamt, frei, beanstandet] = await Promise.all([
    db.from('inhalt_baustein').select('id', { count: 'exact', head: true }).eq('owner_user_id', wache.userId),
    db.from('inhalt_baustein').select('id', { count: 'exact', head: true }).eq('owner_user_id', wache.userId).eq('freigegeben', true),
    db.from('inhalt_baustein').select('id', { count: 'exact', head: true }).eq('owner_user_id', wache.userId).not('notiz', 'is', null),
  ]);

  return NextResponse.json({
    ok: true,
    treffer: count ?? zeilen.length,
    versatz,
    grenze,
    zahlen: {
      gesamt: gesamt.count ?? 0,
      freigegeben: frei.count ?? 0,
      entwurf: (gesamt.count ?? 0) - (frei.count ?? 0),
      beanstandet: beanstandet.count ?? 0,
    },
    zeilen: zeilen.map((z) => ({
      ...z,
      text: volltext ? z.text : null,
      vorschau: vorschau(z.text ?? '', 180),
      zeichen: (z.text ?? '').length,
    })),
  });
}

// ---------------------------------------------------------------------------
// PATCH — speichern, freigeben, zuruecknehmen
// ---------------------------------------------------------------------------
export async function PATCH(req: Request) {
  const wache = await pruefeAdmin();
  if ('absage' in wache) return wache.absage;

  let id = '';
  let ids: string[] = [];
  let aktion = '';
  let titel: string | null = null;
  let text: string | null = null;

  try {
    const k = await req.json();
    id = typeof k?.id === 'string' ? k.id : '';
    ids = Array.isArray(k?.ids) ? k.ids.map(String).filter(Boolean) : [];
    aktion = typeof k?.aktion === 'string' ? k.aktion : '';
    if (typeof k?.titel === 'string') titel = k.titel;
    if (typeof k?.text === 'string') text = k.text;
  } catch {
    return NextResponse.json({ ok: false, error: 'Die Anfrage war unlesbar.' }, { status: 400 });
  }

  if (id && ids.length === 0) ids = [id];
  if (ids.length === 0) return NextResponse.json({ ok: false, error: 'Kein Kapitel angegeben.' }, { status: 400 });

  const db = adminDb();
  const jetzt = new Date().toISOString();

  // ---- Freigabe zuruecknehmen (Sammelaktion erlaubt) ----------------------
  if (aktion === 'zuruecknehmen') {
    const { error } = await db
      .from('inhalt_baustein')
      .update({ freigegeben: false, freigegeben_am: null, aktualisiert_am: jetzt })
      .eq('owner_user_id', wache.userId)                  // Service-Rolle umgeht RLS
      .in('id', ids);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, geaendert: ids.length });
  }

  // ---- Freigeben (Sammelaktion erlaubt) ----------------------------------
  if (aktion === 'freigeben') {
    // GELAENDER: nur Kapitel MIT Text. Ein Haken an einem leeren Kapitel sieht
    // erledigt aus, erscheint aber in keinem Buch.
    const { data: vorhandene, error: leseFehler } = await db
      .from('inhalt_baustein')
      .select('id,text')
      .eq('owner_user_id', wache.userId)
      .in('id', ids);
    if (leseFehler) return NextResponse.json({ ok: false, error: leseFehler.message }, { status: 500 });

    const alle = (vorhandene ?? []) as Array<{ id: string; text: string | null }>;
    const mitText = alle.filter((z) => typeof z.text === 'string' && z.text.trim().length > 0).map((z) => z.id);
    const leer = alle.length - mitText.length;

    if (mitText.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'Kein Kapitel hat Text — ohne Text erscheint es in keinem Buch.',
      }, { status: 400 });
    }

    const { error } = await db
      .from('inhalt_baustein')
      .update({ freigegeben: true, freigegeben_am: jetzt, aktualisiert_am: jetzt })
      .eq('owner_user_id', wache.userId)
      .in('id', mitText);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      geaendert: mitText.length,
      ...(leer > 0 ? { uebersprungen: leer, hinweis: `${leer} ohne Text übersprungen.` } : {}),
    });
  }

  // ---- Text speichern (immer nur EIN Kapitel) ----------------------------
  if (aktion === 'speichern') {
    if (ids.length !== 1) {
      return NextResponse.json({ ok: false, error: 'Text speichern geht nur für ein Kapitel.' }, { status: 400 });
    }

    const { data: alt, error: leseFehler } = await db
      .from('inhalt_baustein')
      .select('id,typ,version,freigegeben')
      .eq('owner_user_id', wache.userId)
      .eq('id', ids[0])
      .maybeSingle();
    if (leseFehler) return NextResponse.json({ ok: false, error: leseFehler.message }, { status: 500 });
    if (!alt) return NextResponse.json({ ok: false, error: 'Das Kapitel gibt es nicht.' }, { status: 404 });

    const zeile = alt as { id: string; typ: string; version: number; freigegeben: boolean };
    const neuerText = typeof text === 'string' ? text : '';

    // Neu beurteilen — aber Martins Wortlaut NICHT umschreiben.
    const typSicher: BausteinTyp = istBausteinTyp(zeile.typ) ? zeile.typ : 'modul_kapitel';
    const geprueft = pruefeEntwurf(neuerText, typSicher);

    const { error } = await db
      .from('inhalt_baustein')
      .update({
        ...(titel !== null ? { titel } : {}),
        text: neuerText,
        notiz: geprueft.hinweise.length > 0 ? geprueft.hinweise.join(' · ') : null,
        quelle: 'redaktion',
        version: (Number(zeile.version) || 1) + 1,
        aktualisiert_am: jetzt,
      })
      .eq('owner_user_id', wache.userId)
      .eq('id', zeile.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      geaendert: 1,
      hinweise: geprueft.hinweise,
      sauber: geprueft.sauber,
      version: (Number(zeile.version) || 1) + 1,
    });
  }

  return NextResponse.json({ ok: false, error: `Unbekannte Aktion „${aktion}".` }, { status: 400 });
}
