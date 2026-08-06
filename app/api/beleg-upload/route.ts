import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

// ============================================================================
// ARGONAUT OS · Command Center · app/api/beleg-upload/route.ts  (Block B2)
// Beleg-Foto/PDF hochladen → privater Bucket 'belege' → KI-Auge klassifiziert
// (privat/geschäftlich, Kategorie, absetzbar %, sofort vs. AfA) → Zeile in
// 'belege' mit ki_vorschlag (jsonb), bestaetigt=false. NUR Martin (Betreiber).
// Ohne Vorsteuer (USt-befreit): mwst_satz=0, betrag_netto = betrag_brutto.
// Modell claude-haiku-4-5; bei schwacher Erkennung automatisch claude-sonnet-5.
// KI schlägt VOR — Martin bestätigt/korrigiert später (B3). Keine Steuerberatung.
//
// POST multipart/form-data:
//   datei  (File, Pflicht: JPG/PNG/WebP/GIF/PDF, max 10 MB)
//   art    (optional Hinweis: 'geschaeftlich' | 'privat')
// Antwort: { ok, beleg, vorschlag } | { error }
// ============================================================================

export const runtime = 'nodejs';

const BUCKET = 'belege';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ERLAUBT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

const SYSTEM = `Du bist das Steuer-Auge von ARGONAUT OS und klassifizierst EINEN Beleg (Foto oder PDF) für die Einnahmen-Überschuss-Rechnung eines deutschen Kleinunternehmers (umsatzsteuerbefreit — daher KEINE Vorsteuer, brutto = netto).

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (keine Erklärung, kein Markdown) mit exakt diesen Feldern:
{"art": "geschaeftlich"|"privat", "richtung": "ausgabe"|"einnahme", "datum": "YYYY-MM-DD"|null, "haendler": string|null, "kategorie": string|null, "beschreibung": string|null, "betrag_brutto": number|null, "absetzbar_prozent": number, "abschreibung": "sofort"|"afa", "afa_jahre": number|null, "konfidenz": number}

Regeln:
- betrag_brutto als Dezimalzahl mit Punkt (z. B. 119.00), ohne Währungszeichen.
- datum im Format YYYY-MM-DD.
- kategorie kurz (z. B. "Bürobedarf", "Kfz", "Bewirtung", "Software", "Material", "Reise", "Telekommunikation").
- beschreibung: ein kurzer, klarer Satz, was der Beleg ist.
- richtung: Belege/Quittungen sind fast immer "ausgabe"; nur bei einer eigenen Einnahme "einnahme".

Absetzbarkeit (Heuristik, kein Steuerberater):
- privat → absetzbar_prozent = 0.
- Bewirtung (Restaurant, Geschäftsessen) → 70.
- normale betriebliche Ausgabe → 100.

Abschreibung:
- Verbrauch/Dienstleistung/geringwertig ODER Netto ≤ 800 € (GWG) → "sofort", afa_jahre = null.
- Langlebiges Anlagegut über 800 € netto → "afa" mit typischer Nutzungsdauer in Jahren (grob: Computer/Notebook 3, Smartphone 5, Büromöbel 13, Maschine 7, Pkw 6). Wenn unsicher, "sofort".

konfidenz: deine Sicherheit von 0 bis 1, wie gut der Beleg lesbar/eindeutig war.`;

type Vorschlag = {
  art?: unknown; richtung?: unknown; datum?: unknown; haendler?: unknown;
  kategorie?: unknown; beschreibung?: unknown; betrag_brutto?: unknown;
  absetzbar_prozent?: unknown; abschreibung?: unknown; afa_jahre?: unknown;
  konfidenz?: unknown;
};

// Ein KI-Durchlauf mit einem bestimmten Modell. Gibt das geparste JSON oder null.
async function klassifiziere(
  modell: string,
  apiKey: string,
  medienBlock: Record<string, unknown>,
  artHinweis: string | null,
): Promise<Vorschlag | null> {
  const hinweis = artHinweis
    ? `Hinweis des Nutzers: Dieser Beleg ist ${artHinweis === 'privat' ? 'privat' : 'geschäftlich'}. `
    : '';
  const kiRes = await kiFetch('beleg-upload', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modell,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [medienBlock, { type: 'text', text: `${hinweis}Klassifiziere diesen Beleg und gib nur das JSON zurück.` }],
      }],
    }),
  });
  if (!kiRes.ok) {
    const t = await kiRes.text().catch(() => '');
    console.error('beleg-upload KI-Fehler:', modell, kiRes.status, t.slice(0, 200));
    return null;
  }
  const kiData = await kiRes.json();
  const blocks: Array<{ type?: string; text?: string }> = Array.isArray(kiData.content) ? kiData.content : [];
  const roh = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
  const m = roh.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as Vorschlag; } catch { return null; }
}

// "Schwache Erkennung": nichts geparst, Kernfelder leer, oder KI meldet niedrige Konfidenz.
function schwach(v: Vorschlag | null): boolean {
  if (!v) return true;
  const konf = Number(v.konfidenz);
  if (Number.isFinite(konf) && konf < 0.5) return true;
  const keinHaendler = !(typeof v.haendler === 'string' && v.haendler.trim());
  const keinBetrag = !Number.isFinite(Number(v.betrag_brutto));
  return keinHaendler && keinBetrag;
}

export async function POST(req: Request) {
  try {
    // 1. Nur eingeloggt.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    // 2. Betreiber-Sperre: nur Martin (wie die CC-Seite selbst).
    const betreiber = process.env.ANALYSE_BETREIBER_ID;
    if (betreiber && user.id !== betreiber) {
      return NextResponse.json({ error: 'Kein Zugriff.' }, { status: 403 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'KI nicht konfiguriert.' }, { status: 500 });

    // 3. Datei + optionalen art-Hinweis aus dem Formular holen und prüfen.
    const form = await req.formData().catch(() => null);
    const datei = form?.get('datei');
    if (!(datei instanceof File)) {
      return NextResponse.json({ error: 'Keine Datei erhalten.' }, { status: 400 });
    }
    if (datei.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Die Datei ist zu groß (maximal 10 MB).' }, { status: 400 });
    }
    const endung = ERLAUBT[datei.type];
    if (!endung) {
      return NextResponse.json({ error: 'Nur JPG, PNG, WebP, GIF oder PDF sind erlaubt.' }, { status: 400 });
    }
    const artRoh = form?.get('art');
    const artHinweis = artRoh === 'privat' ? 'privat' : artRoh === 'geschaeftlich' ? 'geschaeftlich' : null;

    const bytes = Buffer.from(await datei.arrayBuffer());
    const db = createAdminClient();

    // 4. In den PRIVATEN Bucket legen — Pfad nach owner getrennt. Keine öffentliche URL.
    const pfad = `${user.id}/${randomUUID()}.${endung}`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(pfad, bytes, {
      contentType: datei.type,
      upsert: false,
    });
    if (upErr) {
      console.error('beleg-upload Upload fehlgeschlagen:', upErr.message);
      return NextResponse.json({ error: 'Upload fehlgeschlagen. Bitte erneut versuchen.' }, { status: 500 });
    }

    // 5. KI-Auge: Bild/PDF klassifizieren. Haiku zuerst, bei schwacher Erkennung Sonnet.
    const istPdf = datei.type === 'application/pdf';
    const base64 = bytes.toString('base64');
    const medienBlock: Record<string, unknown> = istPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: datei.type, data: base64 } };

    let modell = 'claude-haiku-4-5';
    let v = await klassifiziere(modell, apiKey, medienBlock, artHinweis);
    if (schwach(v)) {
      modell = 'claude-sonnet-5';
      const v2 = await klassifiziere(modell, apiKey, medienBlock, artHinweis);
      if (v2) v = v2;
    }

    // 6. Vorschlag in saubere belege-Spalten übersetzen (defensiv, mit Steuer-Guards).
    const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null);
    const num = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : null; };

    const art: 'geschaeftlich' | 'privat' =
      v?.art === 'privat' ? 'privat' : v?.art === 'geschaeftlich' ? 'geschaeftlich' : (artHinweis === 'privat' ? 'privat' : 'geschaeftlich');
    const richtung: 'ausgabe' | 'einnahme' = v?.richtung === 'einnahme' ? 'einnahme' : 'ausgabe';
    const brutto = num(v?.betrag_brutto);
    const netto = brutto; // USt-befreit → netto = brutto

    let absetzbar = num(v?.absetzbar_prozent);
    absetzbar = absetzbar === null ? (art === 'privat' ? 0 : 100) : Math.max(0, Math.min(100, absetzbar));
    if (art === 'privat') absetzbar = 0; // privat nie absetzbar

    let abschreibung: 'sofort' | 'afa' = v?.abschreibung === 'afa' ? 'afa' : 'sofort';
    if (netto !== null && netto <= 800) abschreibung = 'sofort'; // GWG-Grenze hart absichern
    const afaJahre = abschreibung === 'afa' ? num(v?.afa_jahre) : null;

    const neuerBeleg = {
      owner_user_id: user.id,
      art,
      richtung,
      datum: str(v?.datum),
      haendler: str(v?.haendler),
      beschreibung: str(v?.beschreibung),
      kategorie: str(v?.kategorie),
      betrag_brutto: brutto,
      betrag_netto: netto,
      mwst_satz: 0,
      absetzbar_prozent: absetzbar,
      abschreibung,
      afa_jahre: afaJahre,
      bild_pfad: pfad,
      ki_vorschlag: { ...(v || {}), modell } as Record<string, unknown>,
      bestaetigt: false,
    };

    // 7. Zeile anlegen und zurückgeben.
    const { data: gespeichert, error: dbErr } = await db
      .from('belege')
      .insert(neuerBeleg)
      .select()
      .single();
    if (dbErr) {
      console.error('beleg-upload DB-Fehler:', dbErr.message);
      // Bild liegt schon im Bucket — Pfad mitgeben, damit nichts verloren geht.
      return NextResponse.json({ error: 'Beleg konnte nicht gespeichert werden.', bild_pfad: pfad }, { status: 500 });
    }

    return NextResponse.json({ ok: true, beleg: gespeichert, vorschlag: neuerBeleg.ki_vorschlag });
  } catch (e: unknown) {
    console.error('beleg-upload interner Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
