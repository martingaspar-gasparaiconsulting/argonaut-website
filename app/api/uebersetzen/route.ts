// ============================================================================
// ARGONAUT OS · app/api/uebersetzen/route.ts — Übersetzen (Paket PM, B25)
//
//   POST { ziel, modus: 'chat' | 'anweisung', texte: string[] }
//     -> { ok, ziel, ergebnisse: [{ text, rueck, hinweise[] } | null], hinweise[] }
//
// Genutzt vom Team-Chat (Nachricht in die eigene Sprache / Deutsch mitsenden)
// und von „Mehrsprachiges Team" (Anweisung + Rückübersetzung zum Gegenlesen).
// Die Route SPEICHERT NICHTS. Ob eine Übersetzung für Mitarbeiter sichtbar
// wird, entscheidet der Chef mit dem Prüf-Haken (lib/mehrsprachig.darfFreigeben).
//
// Mechanische Gegenprobe ohne zweite KI (lib/mehrsprachig.pruefeUebersetzung,
// getestet): fehlende/zusätzliche Zahlen, verlorene Verneinungen, zu kurz.
// Modell: Haiku über kiFetch (Firmen-Topf, Minuten-Bremse, Kosten-Protokoll).
// Nur eingeloggt.
// ============================================================================
import { NextResponse } from 'next/server';
import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import {
  spracheFuer, pruefeEingabe, uebersetzSystem, uebersetzNutzer, leseUebersetzung, pruefeUebersetzung,
  UEBERSETZ_MODELL, type Modus,
} from '@/lib/mehrsprachig';

export const runtime = 'nodejs';
export const maxDuration = 60;

function fehler(meldung: string, status = 400) {
  return NextResponse.json({ ok: false, error: meldung }, { status });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fehler('Ungültige Anfrage.'); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fehler('Nicht eingeloggt.', 401);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fehler('Die KI ist derzeit nicht eingerichtet.', 500);

  const ziel = spracheFuer(body.ziel);
  if (!ziel) return fehler('Unbekannte Zielsprache.');
  const modus: Modus = body.modus === 'anweisung' ? 'anweisung' : 'chat';
  const eingabe = pruefeEingabe(body.texte);
  if (eingabe.fehler) return fehler(eingabe.fehler);
  const texte = eingabe.texte;

  // Leere Texte (z. B. Datei-Nachricht ohne Text) gar nicht erst schicken.
  const zuSenden = texte.map((t, i) => ({ t, i })).filter((x) => x.t);
  const gesamt = zuSenden.reduce((s, x) => s + x.t.length, 0);
  const maxTokens = Math.min(8000, Math.max(600, Math.ceil(gesamt * (modus === 'anweisung' ? 2.2 : 1.2)) + 300));

  try {
    const res = await kiFetch('uebersetzen', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: UEBERSETZ_MODELL,
        max_tokens: maxTokens,
        system: uebersetzSystem(ziel, modus),
        messages: [{ role: 'user', content: uebersetzNutzer(zuSenden.map((x) => x.t)) }],
      }),
    });
    if (!res.ok) {
      return fehler(res.status === 429 ? 'Gerade zu viele Anfragen — bitte in einer Minute erneut.' : 'Die Übersetzung ist gerade nicht erreichbar.', 502);
    }
    const data = await res.json();
    const bloecke: Array<{ type?: string; text?: string }> = Array.isArray(data?.content) ? data.content : [];
    const roh = bloecke.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
    const gelesen = leseUebersetzung(roh, zuSenden.length, modus === 'anweisung');
    if (gelesen.ergebnisse.every((e) => e === null)) {
      return fehler('Die Übersetzung war nicht lesbar. Bitte erneut versuchen.', 502);
    }

    const ergebnisse = texte.map(() => null as null | { text: string; rueck: string | null; hinweise: string[] });
    zuSenden.forEach((x, k) => {
      const e = gelesen.ergebnisse[k];
      if (!e) return;
      ergebnisse[x.i] = { text: e.text, rueck: e.rueck, hinweise: pruefeUebersetzung(x.t, e, ziel) };
    });

    return NextResponse.json({ ok: true, ziel: ziel.code, ergebnisse, hinweise: gelesen.hinweise });
  } catch (e) {
    console.error('[uebersetzen]', e instanceof Error ? e.message : e);
    return fehler('Interner Fehler.', 500);
  }
}
