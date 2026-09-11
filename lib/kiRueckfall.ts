// ============================================================================
// ARGONAUT OS · lib/kiRueckfall.ts — Ausfallplan für die KI (Punkt 6.3)
//
// WARUM ES DAS GIBT
// Heute hängt jeder KI-Aufruf im System an EINEM Schlüssel bei EINEM Anbieter.
// Fällt der aus, steht der Guide, das Wachende Auge, der Berater auf den
// Kundenwebsites und der Setter gleichzeitig still. Das ist genau die Frage,
// die ein größerer Kunde in der Prüfung stellt.
//
// WIE ES GEBAUT IST
// Diese Datei ist REINE LOGIK: kein fetch, kein Import, keine Seiteneffekte.
// Sie übersetzt nur hin und zurück und beantwortet eine Ja/Nein-Frage. Damit
// ist sie mit `node --test` vollständig prüfbar, ohne dass je ein echter
// Aufruf hinausgeht. Der eigentliche zweite fetch steht in lib/ki.ts an
// genau einer Stelle.
//
// WELCHER ZWEITE ANBIETER
// Nicht fest verdrahtet. Erwartet wird ein Anbieter mit OpenAI-kompatibler
// Chat-Schnittstelle — das sind fast alle, darunter die europäischen. Der
// Anbieter wird über drei Umgebungsvariablen gesetzt:
//
//   KI_RUECKFALL_URL        z. B. https://api.mistral.ai/v1/chat/completions
//   KI_RUECKFALL_SCHLUESSEL der API-Schlüssel des zweiten Anbieters
//   KI_RUECKFALL_MODELL     z. B. mistral-large-latest
//
// IST KEIN SCHLÜSSEL GESETZT, PASSIERT NICHTS. Das System verhält sich dann
// exakt wie vorher — kein zweiter Aufruf, keine geänderte Antwort, kein
// Unterschied. Der Ausfallplan ist additiv und still.
//
// WAS BEWUSST NICHT ÜBERSETZT WIRD
// Aufrufe mit Werkzeugen (`tools`). Ein Werkzeug-Aufruf hat bei jedem Anbieter
// einen anderen Antwort-Aufbau; eine halbrichtige Übersetzung wäre schlimmer
// als ein ehrlicher Fehler. Solche Aufrufe laufen im Ausfall in den Original-
// Fehler — sichtbar, statt still falsch.
// ============================================================================

/** Anthropic-Antwortformat, so weit wie hier gebraucht. */
export type AnthropicAntwort = {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: { type: 'text'; text: string }[];
  stop_reason: string | null;
  stop_sequence: null;
  usage: { input_tokens: number; output_tokens: number };
};

export type RueckfallKonfig = { url: string; schluessel: string; modell: string };

/**
 * Liest die Anbieter-Angaben aus einer Umgebungs-Tabelle.
 * Gibt null zurück, sobald auch nur eine der drei Angaben fehlt — dann bleibt
 * der Ausfallplan komplett aus (kein halb konfigurierter Zustand).
 */
export function rueckfallKonfig(
  env: Record<string, string | undefined> = {},
): RueckfallKonfig | null {
  const url = (env.KI_RUECKFALL_URL || '').trim();
  const schluessel = (env.KI_RUECKFALL_SCHLUESSEL || '').trim();
  const modell = (env.KI_RUECKFALL_MODELL || '').trim();
  if (!url || !schluessel || !modell) return null;
  return { url, schluessel, modell };
}

/**
 * Ist dieser Status ein AUSFALL des Anbieters — oder unser eigener Fehler?
 *
 * Umgeschaltet wird nur bei einem echten Ausfall. Ein 400 (kaputter Body) oder
 * 401 (falscher Schlüssel) ist UNSER Fehler; den beim zweiten Anbieter noch
 * einmal zu stellen, kostet Geld und liefert denselben Fehler. Schlimmer noch:
 * es verdeckt den Fehler, statt ihn zu zeigen.
 *
 *   429 = überlastet oder gedrosselt   -> Ausfall
 *   5xx = Anbieter kaputt              -> Ausfall
 *         (darin auch 529, Anthropics eigenes „overloaded")
 *   4xx sonst = unser Fehler           -> KEIN Ausfall
 */
export function istAusfall(status: number): boolean {
  const s = Number(status) || 0;
  if (s === 429) return true;
  return s >= 500 && s <= 599;
}

/**
 * Darf dieser Aufruf überhaupt umgeleitet werden?
 * Nein, sobald Werkzeuge im Spiel sind (siehe Kopf der Datei).
 */
export function rueckfallMoeglich(anthropicBody: unknown): boolean {
  if (!anthropicBody || typeof anthropicBody !== 'object') return false;
  const k = anthropicBody as Record<string, unknown>;
  if (Array.isArray(k.tools) && k.tools.length > 0) return false;
  if (!Array.isArray(k.messages) || k.messages.length === 0) return false;
  return true;
}

/**
 * Zieht aus einem Anthropic-Inhalt reinen Text.
 * Anthropic erlaubt sowohl einen schlichten String als auch eine Liste aus
 * Blöcken ({type:'text', text:'…'}). Beides muss hier ankommen, weil
 * lib/ki.ts den System-Prompt fürs Prompt-Caching in Blöcke umbaut.
 */
export function textAus(inhalt: unknown): string {
  if (typeof inhalt === 'string') return inhalt;
  if (!Array.isArray(inhalt)) return '';
  return inhalt
    .map((b) => {
      if (typeof b === 'string') return b;
      if (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string') {
        return (b as { text: string }).text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Anthropic-Body -> OpenAI-kompatibler Body.
 * Der System-Prompt wird bei OpenAI zur ersten Nachricht mit der Rolle
 * „system"; die cache_control-Marken aus dem Prompt-Caching fallen dabei
 * weg, weil sie beim zweiten Anbieter keine Bedeutung haben.
 */
export function nachOpenAiBody(anthropicBody: unknown, modell: string): Record<string, unknown> {
  const k = (anthropicBody || {}) as Record<string, unknown>;
  const nachrichten: { role: string; content: string }[] = [];

  const system = textAus(k.system);
  if (system.trim()) nachrichten.push({ role: 'system', content: system });

  const roh = Array.isArray(k.messages) ? k.messages : [];
  for (const m of roh) {
    if (!m || typeof m !== 'object') continue;
    const mm = m as Record<string, unknown>;
    const rolle = mm.role === 'assistant' ? 'assistant' : 'user';
    const text = textAus(mm.content);
    if (text.trim()) nachrichten.push({ role: rolle, content: text });
  }

  const body: Record<string, unknown> = { model: modell, messages: nachrichten };
  if (typeof k.max_tokens === 'number' && k.max_tokens > 0) body.max_tokens = k.max_tokens;
  if (typeof k.temperature === 'number') body.temperature = k.temperature;
  return body;
}

/**
 * OpenAI-kompatible Antwort -> Anthropic-Antwortformat.
 *
 * Das ist der Kern des ganzen Punktes: Alle rund 30 Routen im System lesen die
 * Antwort im Anthropic-Aufbau (`content[0].text`). Käme aus dem Rückfall ein
 * anderer Aufbau zurück, müsste jede einzelne Route angefasst werden. So bleibt
 * es bei EINER Stelle — und keine Route merkt, wer geantwortet hat.
 *
 * Die Token-Zahlen werden mit übernommen, damit die Nutzungs- und Kosten-
 * zählung in lib/ki.ts weiterläuft und ein Ausfalltag nicht als Loch in der
 * Statistik erscheint.
 */
export function nachAnthropicAntwort(openAiJson: unknown, modell: string): AnthropicAntwort {
  const j = (openAiJson || {}) as Record<string, unknown>;
  const wahlen = Array.isArray(j.choices) ? j.choices : [];
  const erste = (wahlen[0] || {}) as Record<string, unknown>;
  const nachricht = (erste.message || {}) as Record<string, unknown>;
  const text = typeof nachricht.content === 'string' ? nachricht.content : textAus(nachricht.content);

  const nutzung = (j.usage || {}) as Record<string, unknown>;
  const rein = Number(nutzung.prompt_tokens) || 0;
  const raus = Number(nutzung.completion_tokens) || 0;

  // OpenAI: 'stop' | 'length' · Anthropic: 'end_turn' | 'max_tokens'
  const grund = erste.finish_reason === 'length' ? 'max_tokens' : 'end_turn';

  return {
    id: typeof j.id === 'string' && j.id ? j.id : 'rueckfall',
    type: 'message',
    role: 'assistant',
    model: typeof j.model === 'string' && j.model ? j.model : modell,
    content: [{ type: 'text', text }],
    stop_reason: grund,
    stop_sequence: null,
    usage: { input_tokens: rein, output_tokens: raus },
  };
}
