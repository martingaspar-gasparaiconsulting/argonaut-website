// ============================================================================
// ARGONAUT OS · lib/ablaufKi.ts — Baustein „KI-Baustein (Entwurf)" (Paket 167)
//
// NUR SERVER. Schreibt einen Text als ENTWURF — verschickt wird nie etwas
// (Martins Regel: der Baustein schreibt vor, der Mensch prüft und schickt).
// Aufruf über kiFetch mit dem Betrieb als Nutzer: Rate-Limit, Demo-Deckel,
// Firmen-Topf und Kostenprotokoll gelten wie überall.
// An den KI-Dienst geht NUR der Auftrag mit den eingesetzten Platzhaltern —
// nicht der ganze Datensatz (Datensparsamkeit).
// ============================================================================

import { kiFetch } from './ki';
import { modellFuer as kiModell } from './kiModelle';

export const KI_SYSTEM = [
  'Du schreibst Textentwürfe für einen deutschen Betrieb.',
  'Kundinnen und Kunden werden immer gesiezt.',
  'Erfinde keine Preise, Beträge, Termine oder Zusagen — was im Auftrag nicht steht, bleibt als [Platzhalter] in eckigen Klammern.',
  'Antworte nur mit dem Text selbst, ohne Vorrede.',
].join(' ');

export async function kiEntwurf(ownerId: string, auftrag: string): Promise<{ ok: true; text: string } | { ok: false; meldung: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, meldung: 'KI ist nicht eingerichtet' };
  try {
    const res = await kiFetch('ablauf-ki', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: kiModell('ablauf.baustein'),
        max_tokens: 1200,
        system: KI_SYSTEM,
        messages: [{ role: 'user', content: auftrag.slice(0, 4000) }],
      }),
    }, ownerId);
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: unknown };
      const m = typeof j.error === 'string' ? j.error : `KI antwortet ${res.status}`;
      return { ok: false, meldung: m.slice(0, 300) };
    }
    const data = await res.json() as { content?: Array<{ type?: string; text?: string }> };
    const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n').trim();
    return text ? { ok: true, text: text.slice(0, 20000) } : { ok: false, meldung: 'KI lieferte keinen Text' };
  } catch (e: unknown) {
    return { ok: false, meldung: e instanceof Error ? e.message.slice(0, 300) : 'KI nicht erreichbar' };
  }
}
