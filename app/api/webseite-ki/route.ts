import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { baueVorlage } from '@/lib/webVorlagen';
import { modellFuer as kiModell } from '@/lib/kiModelle';
import { wissensSuche, leistungenText, wissensAuszug, quellenHinweis, ohneErfundeneBewertungen, type Treffer } from '@/lib/webseiteWissen';

// ============================================================
// ARGONAUT OS · W4 · app/api/webseite-ki/route.ts
// „Komplett mit KI": schreibt aus dem CI-Speicher (web_ci) + Zweck + kurzer
// Story die Texte der Bausteine scharf aus. Gibt eine normalisierte Baustein-
// Liste (Block[]) zurück, exakt in unseren Typen — kein fremdes HTML, keine
// erfundenen Fakten. Läuft über kiFetch (Kosten werden protokolliert). Nur
// eingeloggt. Body: { zweck: string, story?: string, wissen?: boolean }
// Paket 207 (B3): zusätzlich Branche, Leistungskatalog (ohne Preise) und
// Auszüge aus den Firmen-Dokumenten (vertraulich klingende ausgelassen).
// Keine ausgedachten Kundenstimmen mehr — an ihrer Stelle „Live-Bewertungen".
// ============================================================

export const runtime = 'nodejs';

const TYPEN = new Set(['hero', 'stats', 'leistungen', 'ueber', 'galerie', 'bewertungen', 'faq', 'kontakt', 'cta']);

const SYSTEM = `Du bist Texter für Webseiten deutscher Mittelstands-Betriebe. Du erhältst Firmendaten und einen Zweck und schreibst daraus die Texte einer fertigen Seite.

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (keine Erklärung, kein Markdown), Form:
{"bloecke":[ ... ]}

Erlaubte Bausteine (nur diese, jeder Baustein ist ein Objekt mit Feld "typ"):
- {"typ":"hero","eyebrow":string,"titel":string,"unterzeile":string,"knopf":string}
- {"typ":"stats","titel":string,"zahlen":[{"wert":string,"label":string}]}
- {"typ":"leistungen","eyebrow":string,"titel":string,"punkte":[{"titel":string,"text":string}]}
- {"typ":"ueber","eyebrow":string,"titel":string,"text":string}
- {"typ":"bewertungen","eyebrow":string,"titel":string}   (zeigt automatisch nur ECHTE, freigegebene Kundenbewertungen — du schreibst nur Überschrift)
- {"typ":"faq","eyebrow":string,"titel":string,"fragen":[{"frage":string,"antwort":string}]}
- {"typ":"galerie","titel":string,"anzahl":number}
- {"typ":"kontakt","titel":string,"text":string}
- {"typ":"cta","titel":string,"knopf":string}

Regeln:
- Sprache: Deutsch, Sie-Ansprache, warm und überzeugend, aber ehrlich.
- ERFINDE KEINE Fakten: keine Preise, Auszeichnungen, Jahreszahlen, Zertifikate oder konkreten Referenzen, die nicht in den Firmendaten stehen. Zahlen im "stats"-Band nur allgemein/qualitativ, wenn keine echten vorliegen (z. B. "100%","persönlich"), niemals ausgedachte Kundenzahlen als Tatsache.
- Schreibe NIEMALS Kundenstimmen, Zitate oder Bewertungen selbst. Für Bewertungen nur den Baustein "bewertungen" (ohne Text).
- Leistungen: nimm sie aus dem Leistungskatalog und den Firmen-Auszügen, wenn vorhanden — keine erfundenen Leistungen. Keine Preise nennen.
- Firmen-Auszüge sind interne Unterlagen: übernimm nur Aussagen, die auf eine öffentliche Webseite gehören (Leistungen, Arbeitsweise, Region, Stärken). NIE Kunden- oder Mitarbeiternamen, Konditionen, interne Zahlen oder Vertragsinhalte.
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
    else if (typ === 'bewertungen') out.push({ typ, eyebrow: str(b.eyebrow) || 'Bewertungen', titel: str(b.titel) || 'Das sagen unsere Kunden' });
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
    const wissenNutzen = body?.wissen !== false;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { data: ci } = await supabase.from('web_ci').select('*').eq('owner_user_id', user.id).maybeSingle();
    if (!ci || !str(ci.firma)) {
      return NextResponse.json({ error: 'Bitte zuerst unter „Webauftritt" Ihren Firmennamen und Look hinterlegen.' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'KI nicht konfiguriert.' }, { status: 500 });

    // Paket 207: Branche, Leistungskatalog, Firmen-Dokumente (alles optional).
    const { data: prof } = await supabase.from('profiles').select('branche').eq('id', user.id).maybeSingle();
    const branche = str((prof as { branche?: string } | null)?.branche);
    let leistungen = { text: '', anzahl: 0 };
    let auszug = { text: '', quellen: [] as string[], ausgelassen: [] as string[] };
    if (wissenNutzen) {
      try {
        const { data: lk } = await supabase.from('leistungskatalog').select('bezeichnung, kategorie').eq('owner_user_id', user.id).limit(200);
        leistungen = leistungenText((lk as { bezeichnung: string; kategorie: string }[]) ?? []);
      } catch (e) { console.error('Webseite-KI Leistungen übersprungen:', e instanceof Error ? e.message : e); }
      try {
        if (process.env.VOYAGE_API_KEY) {
          const vr = await fetch('https://api.voyageai.com/v1/embeddings', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + process.env.VOYAGE_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: [wissensSuche(zweck, branche)], model: 'voyage-4-lite', input_type: 'query' }),
          });
          if (vr.ok) {
            const vd = await vr.json();
            const emb = vd?.data?.[0]?.embedding;
            const { data: chunks } = emb
              ? await supabase.rpc('match_document_chunks', { query_embedding: emb, match_user_id: user.id, match_count: 8, match_threshold: 0.15 })
              : { data: null };
            const treffer = ((chunks as Treffer[] | null) ?? []).filter((c) => c && c.document_id);
            if (treffer.length) {
              const ids = [...new Set(treffer.map((c) => c.document_id))];
              const { data: docs } = await supabase.from('documents').select('id, file_name').eq('user_id', user.id).in('id', ids);
              const namen = Object.fromEntries(((docs as { id: string; file_name: string }[]) ?? []).map((d) => [d.id, d.file_name]));
              // Nur Treffer aus eigenen Dokumenten (Name gefunden), vertrauliche fliegen in wissensAuszug raus.
              auszug = wissensAuszug(treffer.filter((c) => namen[c.document_id]), namen);
            }
          }
        }
      } catch (e) { console.error('Webseite-KI Firmenwissen übersprungen:', e instanceof Error ? e.message : e); }
    }

    const firmendaten = [
      `Firma: ${str(ci.firma)}`,
      str(ci.slogan) ? `Claim: ${str(ci.slogan)}` : '',
      str(ci.ueber_uns) ? `Über uns: ${str(ci.ueber_uns)}` : '',
      str(ci.kernsaetze) ? `Stärken/Kernsätze:\n${str(ci.kernsaetze)}` : '',
      branche ? `Branche: ${branche}` : '',
      str(ci.ort) ? `Ort: ${str(ci.ort)}` : '',
      str(ci.telefon) ? `Telefon: ${str(ci.telefon)}` : '',
      str(ci.email) ? `E-Mail: ${str(ci.email)}` : '',
    ].filter(Boolean).join('\n');

    const wissenBlock = [
      leistungen.text ? `Leistungskatalog (echte Leistungen des Betriebs):\n${leistungen.text}` : '',
      auszug.text ? `Firmen-Auszüge (interne Unterlagen — nur öffentlich geeignete Aussagen übernehmen):\n${auszug.text}` : '',
    ].filter(Boolean).join('\n\n');
    const nutzer = `Zweck der Seite: ${zweck}\n\nFirmendaten:\n${firmendaten}\n\n${wissenBlock ? wissenBlock + '\n\n' : ''}${story ? `Wunsch/Story des Kunden:\n${story}` : 'Keine zusätzliche Story angegeben — arbeite mit den Firmendaten.'}\n\nSchreibe jetzt die Bausteine als JSON.`;

    const kiRes = await kiFetch('webseite-ki', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: kiModell('webseite.komplett'),
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
    if (m) { try { bloecke = ohneErfundeneBewertungen(normalisiere(JSON.parse(m[0]))); } catch { bloecke = []; } }

    // Sicherheitsnetz: Hero vorn, Kontakt hinten, sonst Vorlage.
    if (bloecke.length < 2) {
      const v = baueVorlage(ci, zweck);
      return NextResponse.json({ bloecke: v.bloecke, quelle: 'vorlage', hinweis: 'KI-Antwort unklar — Vorlage geladen.' });
    }
    if (bloecke[0].typ !== 'hero') bloecke.unshift({ typ: 'hero', eyebrow: 'Willkommen', titel: str(ci.firma), unterzeile: str(ci.slogan), knopf: 'Jetzt anfragen', bild: '' });
    if (!bloecke.some((b) => b.typ === 'kontakt')) bloecke.push({ typ: 'kontakt', titel: 'Kontakt', text: 'Schreiben Sie uns — wir melden uns schnell zurück.' });

    return NextResponse.json({
      bloecke,
      quelle: 'ki',
      hinweis: quellenHinweis({ leistungen: leistungen.anzahl, quellen: auszug.quellen, ausgelassen: auszug.ausgelassen, wissenGenutzt: wissenNutzen }),
    });
  } catch (e: unknown) {
    console.error('Webseite-KI interner Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
