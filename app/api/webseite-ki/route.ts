import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { baueVorlage } from '@/lib/webVorlagen';

// ============================================================
// ARGONAUT OS · W4 · app/api/webseite-ki/route.ts
// „Komplett mit KI": schreibt aus dem CI-Speicher (web_ci) + Zweck + kurzer
// Story die Texte der Bausteine scharf aus. Gibt eine normalisierte Baustein-
// Liste (Block[]) zurück, exakt in unseren Typen — kein fremdes HTML, keine
// erfundenen Fakten. Läuft über kiFetch (Kosten werden protokolliert). Nur
// eingeloggt. Body: { zweck: string, story?: string }
// ============================================================

export const runtime = 'nodejs';

const TYPEN = new Set(['hero', 'stats', 'leistungen', 'ueber', 'galerie', 'testimonials', 'faq', 'kontakt', 'cta']);

const SYSTEM = `Du bist Texter für Webseiten deutscher Mittelstands-Betriebe. Du erhältst Firmendaten und einen Zweck und schreibst daraus die Texte einer fertigen Seite.

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (keine Erklärung, kein Markdown), Form:
{"bloecke":[ ... ]}

Erlaubte Bausteine (nur diese, jeder Baustein ist ein Objekt mit Feld "typ"):
- {"typ":"hero","eyebrow":string,"titel":string,"unterzeile":string,"knopf":string}
- {"typ":"stats","titel":string,"zahlen":[{"wert":string,"label":string}]}
- {"typ":"leistungen","eyebrow":string,"titel":string,"punkte":[{"titel":string,"text":string}]}
- {"typ":"ueber","eyebrow":string,"titel":string,"text":string}
- {"typ":"testimonials","eyebrow":string,"titel":string,"stimmen":[{"text":string,"name":string,"rolle":string}]}
- {"typ":"faq","eyebrow":string,"titel":string,"fragen":[{"frage":string,"antwort":string}]}
- {"typ":"galerie","titel":string,"anzahl":number}
- {"typ":"kontakt","titel":string,"text":string}
- {"typ":"cta","titel":string,"knopf":string}

Regeln:
- Sprache: Deutsch, Sie-Ansprache, warm und überzeugend, aber ehrlich.
- ERFINDE KEINE Fakten: keine Preise, Auszeichnungen, Jahreszahlen, Zertifikate oder konkreten Referenzen, die nicht in den Firmendaten stehen. Zahlen im "stats"-Band nur allgemein/qualitativ, wenn keine echten vorliegen (z. B. "100%","persönlich"), niemals ausgedachte Kundenzahlen als Tatsache.
- testimonials sind IMMER Beispiel-Platzhalter: Feld "rolle" muss "Beispiel-Bewertung" enthalten und der Name generisch (z. B. "Zufriedener Kunde"). Erfinde keine echten Personen.
- "eyebrow" ist ein kurzes Label (1–2 Wörter) über der Überschrift.
- Der erste Baustein ist immer "hero", der letzte immer "kontakt". Baue die Abschnitte passend zum Zweck.
- 4–8 Bausteine insgesamt. Kurze, konkrete Texte.`;

type J = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

// Modell-JSON → sichere Baustein-Liste (nur erlaubte Typen/Felder).
function normalisiere(roh: unknown): J[] {
  const liste = arr((roh as J)?.bloecke).filter((b) => b && typeof b === 'object') as J[];
  const out: J[] = [];
  for (const b of liste) {
    const typ = str(b.typ);
    if (!TYPEN.has(typ)) continue;
    if (typ === 'hero') out.push({ typ, eyebrow: str(b.eyebrow), titel: str(b.titel), unterzeile: str(b.unterzeile), knopf: str(b.knopf) || 'Jetzt anfragen', bild: '' });
    else if (typ === 'stats') out.push({ typ, titel: str(b.titel), zahlen: arr(b.zahlen).slice(0, 4).map((za: J) => ({ wert: str(za.wert), label: str(za.label) })).filter((za) => za.wert && za.label) });
    else if (typ === 'leistungen') out.push({ typ, eyebrow: str(b.eyebrow), titel: str(b.titel) || 'Leistungen', punkte: arr(b.punkte).slice(0, 6).map((p: J) => ({ titel: str(p.titel), text: str(p.text) })).filter((p) => p.titel) });
    else if (typ === 'ueber') out.push({ typ, eyebrow: str(b.eyebrow), titel: str(b.titel) || 'Über uns', text: str(b.text) });
    else if (typ === 'galerie') { const n = Number(b.anzahl); out.push({ typ, titel: str(b.titel) || 'Einblicke', anzahl: Number.isFinite(n) ? Math.max(1, Math.min(6, n)) : 3 }); }
    else if (typ === 'testimonials') out.push({ typ, eyebrow: str(b.eyebrow), titel: str(b.titel) || 'Bewertungen', stimmen: arr(b.stimmen).slice(0, 3).map((s: J) => ({ text: str(s.text), name: str(s.name) || 'Zufriedener Kunde', rolle: 'Beispiel-Bewertung' })).filter((s) => s.text) });
    else if (typ === 'faq') out.push({ typ, eyebrow: str(b.eyebrow), titel: str(b.titel) || 'Häufige Fragen', fragen: arr(b.fragen).slice(0, 6).map((f: J) => ({ frage: str(f.frage), antwort: str(f.antwort) })).filter((f) => f.frage && f.antwort) });
    else if (typ === 'kontakt') out.push({ typ, titel: str(b.titel) || 'Kontakt', text: str(b.text) });
    else if (typ === 'cta') out.push({ typ, titel: str(b.titel), knopf: str(b.knopf) || 'Jetzt anfragen' });
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const zweck = str(body?.zweck) || 'webseite';
    const story = str(body?.story).slice(0, 1200);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { data: ci } = await supabase.from('web_ci').select('*').eq('owner_user_id', user.id).maybeSingle();
    if (!ci || !str(ci.firma)) {
      return NextResponse.json({ error: 'Bitte zuerst unter „Webauftritt" Ihren Firmennamen und Look hinterlegen.' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'KI nicht konfiguriert.' }, { status: 500 });

    const firmendaten = [
      `Firma: ${str(ci.firma)}`,
      str(ci.slogan) ? `Claim: ${str(ci.slogan)}` : '',
      str(ci.ueber_uns) ? `Über uns: ${str(ci.ueber_uns)}` : '',
      str(ci.kernsaetze) ? `Stärken/Kernsätze:\n${str(ci.kernsaetze)}` : '',
      str(ci.ort) ? `Ort: ${str(ci.ort)}` : '',
      str(ci.telefon) ? `Telefon: ${str(ci.telefon)}` : '',
      str(ci.email) ? `E-Mail: ${str(ci.email)}` : '',
    ].filter(Boolean).join('\n');

    const nutzer = `Zweck der Seite: ${zweck}\n\nFirmendaten:\n${firmendaten}\n\n${story ? `Wunsch/Story des Kunden:\n${story}` : 'Keine zusätzliche Story angegeben — arbeite mit den Firmendaten.'}\n\nSchreibe jetzt die Bausteine als JSON.`;

    const kiRes = await kiFetch('webseite-ki', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2500,
        system: SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: nutzer }] }],
      }),
    });

    // Fällt die KI aus, liefern wir die feste Vorlage — der Kunde steht nie ohne da.
    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error('Webseite-KI Fehler:', kiRes.status, t.slice(0, 300));
      const v = baueVorlage(ci, zweck);
      return NextResponse.json({ bloecke: v.bloecke, quelle: 'vorlage', hinweis: 'KI gerade nicht erreichbar — Vorlage geladen.' });
    }

    const kiData = await kiRes.json();
    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(kiData.content) ? kiData.content : [];
    const rohText = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
    const m = rohText.match(/\{[\s\S]*\}/);

    let bloecke: J[] = [];
    if (m) { try { bloecke = normalisiere(JSON.parse(m[0])); } catch { bloecke = []; } }

    // Sicherheitsnetz: Hero vorn, Kontakt hinten, sonst Vorlage.
    if (bloecke.length < 2) {
      const v = baueVorlage(ci, zweck);
      return NextResponse.json({ bloecke: v.bloecke, quelle: 'vorlage', hinweis: 'KI-Antwort unklar — Vorlage geladen.' });
    }
    if (bloecke[0].typ !== 'hero') bloecke.unshift({ typ: 'hero', eyebrow: 'Willkommen', titel: str(ci.firma), unterzeile: str(ci.slogan), knopf: 'Jetzt anfragen', bild: '' });
    if (!bloecke.some((b) => b.typ === 'kontakt')) bloecke.push({ typ: 'kontakt', titel: 'Kontakt', text: 'Schreiben Sie uns — wir melden uns schnell zurück.' });

    return NextResponse.json({ bloecke, quelle: 'ki' });
  } catch (e: unknown) {
    console.error('Webseite-KI interner Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
