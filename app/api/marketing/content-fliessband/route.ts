import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { kiFetch } from '@/lib/ki';
import { bereiteVor, absenden } from '@/lib/kiBatch';
import {
  saeubereThema,
  bereinigeKanaele,
  kanalFuer,
  baueSystemPrompt,
  baueNutzerPrompt,
  parseVorschlaege,
  saeubereModus,
  saeubereAnzahl,
  baueVariantenSystemPrompt,
  baueVariantenNutzerPrompt,
  parseTextVarianten,
  type CIAngaben,
  type TextVariantenGruppe,
} from '@/lib/contentFliessband';

// ============================================================================
// ARGONAUT OS · app/api/marketing/content-fliessband/route.ts
// (Marketing-Ausbau · Punkt 3 + Marketing-Tiefe · Abschnitt 14)
//
// EIN Thema/Anlass -> fertige Beitraege je Kanal, ueber kiFetch (haiku,
// Kosten-Protokoll). Zwei Modi:
//   · "einzeln"   -> 1 Beitrag je Kanal (EIN KI-Aufruf; unveraendert).
//   · "varianten" -> je Kanal N Beitrags-Varianten (EIN KI-Aufruf JE KANAL,
//                    parallel, robust bei Teil-Ausfall). Deckel 30 je Kanal.
// Es wird NICHTS gespeichert und NICHTS erfunden.
//   POST { thema, kanaele[], modus?, anzahl?, firma?, branche?, ton?, stapel? }
// Nur eingeloggt. RLS-neutral (liest keine Kundendaten, erzeugt nur Text).
//
// 15.08.26 · STAPEL-MODUS (Thema 6): Mit `stapel: true` gehen die Anfragen
// nicht sofort raus, sondern ueber die Stapel-Schnittstelle — HALBER PREIS,
// dafuer kommt das Ergebnis spaeter (meist unter einer Stunde, garantiert
// binnen 24 Stunden). Der Motor /api/cron/ki-batch-abholen legt die fertigen
// Texte dann als ENTWUERFE in social_beitrag ab. Wer 50 Beitraege fuer den
// Monat plant, spart damit die Haelfte; wer jemanden am Telefon hat, nicht.
// Ohne `stapel` bleibt alles exakt wie bisher.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function textAus(d: unknown): string {
  const blocks = Array.isArray((d as { content?: unknown }).content)
    ? ((d as { content: Array<{ type?: string; text?: string }> }).content)
    : [];
  return blocks.filter((x) => x.type === 'text').map((x) => x.text || '').join('').trim();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });
  }

  const roh = body as Record<string, unknown>;
  const thema = saeubereThema(roh.thema);
  const kanaele = bereinigeKanaele(roh.kanaele);
  const modus = saeubereModus(roh.modus);
  const anzahl = saeubereAnzahl(roh.anzahl);
  if (!thema) return NextResponse.json({ ok: false, error: 'Bitte ein Thema oder einen Anlass eingeben.' }, { status: 400 });
  if (kanaele.length === 0) return NextResponse.json({ ok: false, error: 'Bitte mindestens einen Kanal auswählen.' }, { status: 400 });

  const ci: CIAngaben = {
    firma: typeof roh.firma === 'string' ? (roh.firma as string).slice(0, 120) : null,
    branche: typeof roh.branche === 'string' ? (roh.branche as string).slice(0, 120) : null,
    ton: typeof roh.ton === 'string' ? (roh.ton as string).slice(0, 120) : null,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'Die KI ist gerade nicht verfügbar. Bitte später erneut versuchen.' }, { status: 503 });
  }
  const kopf = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };

  const alsStapel = roh.stapel === true;

  // ----------------------------------------------------------------- STAPEL --
  // Nur im Varianten-Modus sinnvoll: dort entstehen viele Texte auf einmal.
  if (alsStapel && modus === 'varianten' && anzahl >= 2) {
    const sys = baueVariantenSystemPrompt();
    const maxTok = Math.min(8000, 500 + anzahl * 300);

    const vorbereitet = bereiteVor(
      kanaele.map((id) => ({
        kennung: id,
        system: sys,
        frage: baueVariantenNutzerPrompt(thema, id, anzahl, ci),
        ziel: { kanal: id, anzahl, thema },
      })),
      'claude-haiku-4-5',
      maxTok,
    );

    const geschickt = await absenden(vorbereitet.anfragen);
    if (!geschickt.ok) {
      return NextResponse.json({ ok: false, error: `Der Stapel konnte nicht abgeschickt werden: ${geschickt.fehler}` }, { status: 502 });
    }

    const { data: eintrag, error: dbFehler } = await supabase.from('ki_batch').insert({
      owner_user_id: user.id,
      route: 'content-fliessband',
      zweck: `${kanaele.length} Kanäle · ${anzahl} Varianten · „${thema.slice(0, 60)}"`,
      extern_id: geschickt.extern_id,
      status: 'wartet',
      anzahl: vorbereitet.anfragen.length,
      zuordnung: vorbereitet.zuordnung,
    }).select('id').single();

    if (dbFehler) {
      // Der Stapel laeuft bereits und kostet — das darf der Betrieb erfahren.
      return NextResponse.json({
        ok: false,
        error: 'Der Stapel läuft, konnte aber nicht vermerkt werden. Bitte an den Betreiber wenden.',
        extern_id: geschickt.extern_id,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      modus: 'stapel',
      thema,
      stapel_id: (eintrag as { id: string }).id,
      anfragen: vorbereitet.anfragen.length,
      erwartet: kanaele.length * anzahl,
      hinweis: 'Der Stapel läuft. Die fertigen Beiträge liegen später als Entwürfe bereit — meist innerhalb einer Stunde, spätestens am nächsten Tag.',
    });
  }

  // -------------------------------------------------------------- VARIANTEN --
  if (modus === 'varianten' && anzahl >= 2) {
    const sys = baueVariantenSystemPrompt();
    const maxTok = Math.min(8000, 500 + anzahl * 300);

    const gruppen = await Promise.all(kanaele.map(async (id): Promise<TextVariantenGruppe | null> => {
      const k = kanalFuer(id)!;
      const nutzer = baueVariantenNutzerPrompt(thema, id, anzahl, ci);
      try {
        const kiRes = await kiFetch('marketing-content-fliessband-varianten', {
          method: 'POST', headers: kopf,
          body: JSON.stringify({
            model: 'claude-haiku-4-5', max_tokens: maxTok, system: sys,
            messages: [{ role: 'user', content: [{ type: 'text', text: nutzer }] }],
          }),
        });
        if (!kiRes.ok) return null;
        const varianten = parseTextVarianten(textAus(await kiRes.json()), id, anzahl);
        if (varianten.length === 0) return null;
        return {
          kanal: k.id, name: k.name, icon: k.icon, ziel: k.ziel, plattformId: k.plattformId,
          zeichenLimit: k.zeichenLimit, bildPflicht: k.bildPflicht, varianten,
        };
      } catch {
        return null;
      }
    }));

    const fertig = gruppen.filter((g): g is TextVariantenGruppe => g !== null);
    if (fertig.length === 0) {
      return NextResponse.json({ ok: false, error: 'Die Varianten konnten gerade nicht erzeugt werden. Bitte das Thema etwas konkreter formulieren oder in einem Moment erneut versuchen.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, modus: 'varianten', thema, anzahl, gruppen: fertig });
  }

  // ------------------------------------------------------------------ EINZELN --
  const sys = baueSystemPrompt();
  const nutzer = baueNutzerPrompt(thema, kanaele, ci);

  let rohText = '';
  try {
    const kiRes = await kiFetch('marketing-content-fliessband', {
      method: 'POST', headers: kopf,
      body: JSON.stringify({
        model: 'claude-haiku-4-5', max_tokens: 2200, system: sys,
        messages: [{ role: 'user', content: [{ type: 'text', text: nutzer }] }],
      }),
    });
    if (!kiRes.ok) {
      let msg = 'Die KI konnte gerade keine Vorschläge erzeugen. Bitte kurz warten und erneut versuchen.';
      try { const e = await kiRes.json(); if (e && typeof e.error === 'string') msg = e.error; } catch { /* egal */ }
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
    rohText = textAus(await kiRes.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'Die KI ist gerade nicht erreichbar. Bitte später erneut versuchen.' }, { status: 502 });
  }

  const vorschlaege = parseVorschlaege(rohText, kanaele);
  if (vorschlaege.length === 0) {
    return NextResponse.json({ ok: false, error: 'Die Vorschläge konnten nicht verarbeitet werden. Bitte das Thema etwas konkreter formulieren und erneut versuchen.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, modus: 'einzeln', thema, vorschlaege });
}
