// ============================================================================
// ARGONAUT OS · app/api/sachbearbeiter/route.ts — der KI-Sachbearbeiter (Paket PA)
//
//   POST { modus: 'mail',      betreff, von, datum, text }
//     -> { ok, ergebnis, aufgabe, vorgang }          B01 Posteingang
//   POST { modus: 'brief',     base64, mediaType }   (Foto oder PDF)
//   POST { modus: 'brief',     text }                (abgetippt / eingefuegt)
//     -> { ok, ergebnis, aufgabe, vorgang }          B07 Behoerdenbrief
//   POST { modus: 'bewertung', sterne, text, plattform? }
//     -> { ok, text, hinweise }                      B15 Bewertungs-Antwort
//
// Die Route LIEST nur und SCHLAEGT VOR. Sie legt nichts an und verschickt
// nichts. Aufgabe und Vorgang entstehen erst, wenn der Mensch auf den Knopf
// drueckt — ueber /api/cockpit-action (bestehend) und die Tabelle post_vorgang.
//
// Modell: claude-haiku-4-5 (Alltagsaufgabe, guenstig). Jeder Aufruf laeuft
// durch kiFetch — also mit Firmen-Topf, Minuten-Bremse, Demo-Deckel und
// Kosten-Protokoll. Nur eingeloggt.
//
// Was aus der KI-Antwort wird, entscheidet lib/sachbearbeiter.ts (getestet):
// Fristen nur als echtes Datum, Betraege nie still 0, keine erfundenen Arten.
// ============================================================================
import { NextResponse } from 'next/server';
import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import {
  systemPost, nutzerTextMail, leseErgebnis, aufgabeAus, vorgangZeile,
  systemBewertung, nutzerTextBewertung, pruefeBewertungsAntwort,
} from '@/lib/sachbearbeiter';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODELL = 'claude-haiku-4-5';

/** Erlaubte Dateiarten fuer einen Brief. */
const BILDARTEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** Etwa 3,3 MB Datei — darueber lehnt die Plattform die Anfrage ohnehin ab. */
const MAX_BASE64 = 4_500_000;

function ki(system: string, content: unknown, maxTokens: number, route: string) {
  return kiFetch(route, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    }),
  });
}

async function textAus(res: Response): Promise<string> {
  const data = await res.json();
  const bloecke: Array<{ type?: string; text?: string }> = Array.isArray(data?.content) ? data.content : [];
  return bloecke.filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
}

function fehler(meldung: string, status = 400) {
  return NextResponse.json({ ok: false, error: meldung }, { status });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fehler('Ungültige Anfrage.'); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fehler('Nicht eingeloggt.', 401);
  if (!process.env.ANTHROPIC_API_KEY) return fehler('Die KI ist derzeit nicht eingerichtet.', 500);

  // Firmenname fuer den Ton der Antwort — best effort.
  let firma = '';
  try {
    const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', user.id).maybeSingle();
    firma = String((p as { firma_name?: string | null } | null)?.firma_name ?? '').trim();
  } catch { /* ohne Firmenname geht es auch */ }

  const modus = String(body.modus ?? '');
  const jetzt = new Date();

  try {
    // --- B15 · Bewertung ---------------------------------------------------
    if (modus === 'bewertung') {
      const res = await ki(systemBewertung(firma), nutzerTextBewertung(body), 600, 'sachbearbeiter-bewertung');
      if (!res.ok) return fehler(res.status === 429 ? 'Zu viele KI-Anfragen — bitte kurz warten.' : 'Die Antwort konnte nicht erstellt werden.', 502);
      const geprueft = pruefeBewertungsAntwort(await textAus(res));
      return NextResponse.json({ ok: true, ...geprueft });
    }

    // --- B01 · E-Mail ------------------------------------------------------
    if (modus === 'mail') {
      const text = String(body.text ?? '').trim();
      const betreff = String(body.betreff ?? '').trim();
      if (!text && !betreff) return fehler('Die Nachricht ist leer.');
      const res = await ki(systemPost('mail', firma), nutzerTextMail(body), 1600, 'sachbearbeiter-mail');
      if (!res.ok) return fehler(res.status === 429 ? 'Zu viele KI-Anfragen — bitte kurz warten.' : 'Die Nachricht konnte nicht ausgewertet werden.', 502);
      const ergebnis = leseErgebnis(await textAus(res), jetzt, 'mail');
      return NextResponse.json({
        ok: true,
        ergebnis,
        aufgabe: aufgabeAus(ergebnis, betreff, jetzt),
        vorgang: vorgangZeile(ergebnis, 'mail', betreff, {
          mailUid: Number.isFinite(Number(body.uid)) ? Number(body.uid) : null,
          mailOrdner: typeof body.ordner === 'string' ? body.ordner.slice(0, 200) : null,
        }),
      });
    }

    // --- B07 · Behoerdenbrief ----------------------------------------------
    if (modus === 'brief') {
      const base64 = typeof body.base64 === 'string' ? body.base64 : '';
      const mediaType = typeof body.mediaType === 'string' ? body.mediaType : '';
      const eingetippt = String(body.text ?? '').trim();

      let content: unknown;
      if (base64) {
        if (base64.length > MAX_BASE64) return fehler('Die Datei ist zu groß. Bitte ein Foto oder ein kleineres PDF verwenden (höchstens ca. 3 MB).');
        const istPdf = mediaType === 'application/pdf';
        if (!istPdf && !BILDARTEN.includes(mediaType)) return fehler('Bitte ein Foto (JPG, PNG, WebP) oder ein PDF hochladen.');
        const block = istPdf
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
          : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
        content = [block, { type: 'text', text: 'Bereiten Sie dieses Schreiben auf und geben Sie nur das JSON zurück.' }];
      } else if (eingetippt) {
        content = nutzerTextMail({ betreff: body.betreff, von: body.von, text: eingetippt });
      } else {
        return fehler('Bitte ein Foto, ein PDF oder den Text des Schreibens angeben.');
      }

      const res = await ki(systemPost('brief', firma), content, 1400, 'sachbearbeiter-brief');
      if (!res.ok) return fehler(res.status === 429 ? 'Zu viele KI-Anfragen — bitte kurz warten.' : 'Das Schreiben konnte nicht gelesen werden. Bitte ein schärferes Foto versuchen.', 502);
      const ergebnis = leseErgebnis(await textAus(res), jetzt, 'brief');
      const betreff = ergebnis.absender ? `Schreiben von ${ergebnis.absender}` : 'Schreiben';
      return NextResponse.json({
        ok: true,
        ergebnis,
        aufgabe: aufgabeAus(ergebnis, betreff, jetzt),
        vorgang: vorgangZeile(ergebnis, 'brief', betreff),
      });
    }

    return fehler('Unbekannter Modus.');
  } catch (e) {
    console.error('[sachbearbeiter]', e instanceof Error ? e.message : e);
    return fehler('Interner Fehler.', 500);
  }
}
