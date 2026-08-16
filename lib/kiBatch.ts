// ============================================================================
// ARGONAUT OS · lib/kiBatch.ts — Stapel-Verarbeitung fuer KI-Aufrufe
//
// Die Stapel-Schnittstelle von Anthropic kostet die HAELFTE des normalen
// Preises. Der Preis dafuer ist Zeit: das Ergebnis kommt nicht sofort,
// sondern meist innerhalb einer Stunde, garantiert innerhalb von 24 Stunden.
//
// DESHALB WIRD SIE ANGEBOTEN, NICHT UNTERGESCHOBEN:
// Der Betrieb entscheidet je Vorgang "jetzt sofort" oder "ueber Nacht,
// halber Preis". Wer 50 Social-Beitraege fuer den Monat plant, wartet gern.
// Wer gerade jemanden am Telefon hat, nicht.
//
// ABLAUF:
//   1. absenden()    — Stapel abschicken, ID merken
//   2. nachsehen()   — laeuft er noch?
//   3. abholen()     — Ergebnisse holen und zuordnen
//
// Die Zuordnung laeuft ueber `custom_id`: jede Anfrage im Stapel bekommt eine
// mit, jede Antwort traegt sie wieder. Ohne sie waere nach dem Abholen nicht
// mehr klar, welche Antwort zu welchem Vorgang gehoert.
//
// DEFENSIV GEBAUT: Antworten der Schnittstelle werden geprueft, nicht
// vorausgesetzt. Aendert sich dort ein Feldname, faellt das hier als sauberer
// Fehler auf statt als stiller Datenverlust.
//
// Die reinen Funktionen unten sind node-testbar; die drei Netz-Funktionen
// sind bewusst duenn gehalten.
// ============================================================================

const BASIS = 'https://api.anthropic.com/v1/messages/batches';
const VERSION = '2023-06-01';

/** Grenzen der Schnittstelle. Konservativ gesetzt — lieber zwei Stapel als einer, der abgewiesen wird. */
export const MAX_JE_STAPEL = 1000;
export const MAX_ZEICHEN_GESAMT = 8_000_000;

export type BatchAnfrage = {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  };
};

export type BatchStatus = {
  extern_id: string;
  laeuft: boolean;
  verarbeitet: number;
  erfolgreich: number;
  fehlerhaft: number;
  abgebrochen: number;
  abgelaufen: number;
};

export type BatchErgebnis = {
  custom_id: string;
  ok: boolean;
  text: string;
  fehler?: string;
};

// ---------------------------------------------------------------------------
// Aufbereitung (node-testbar)
// ---------------------------------------------------------------------------

/** custom_id darf nur harmlose Zeichen enthalten — sie geht durch fremde Systeme. */
export function sichereId(roh: string, nummer: number): string {
  const sauber = String(roh || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${sauber || 'pos'}-${nummer}`;
}

export type Auftrag = {
  /** Woher die Anfrage stammt — wird Teil der custom_id. */
  kennung: string;
  system?: string;
  frage: string;
  /** Wohin das Ergebnis spaeter gehoert (frei belegbar). */
  ziel: Record<string, unknown>;
};

export type Vorbereitet = {
  anfragen: BatchAnfrage[];
  zuordnung: Record<string, Record<string, unknown>>;
  uebersprungen: number;
};

/**
 * Baut aus fachlichen Auftraegen die Stapel-Anfragen und merkt sich, wohin
 * jede Antwort gehoert. Doppelte oder leere Auftraege fallen raus, bevor sie
 * Geld kosten.
 */
export function bereiteVor(
  auftraege: Auftrag[],
  model: string,
  maxTokens: number,
): Vorbereitet {
  const anfragen: BatchAnfrage[] = [];
  const zuordnung: Record<string, Record<string, unknown>> = {};
  const vergeben = new Set<string>();
  let uebersprungen = 0;

  (auftraege ?? []).forEach((a, i) => {
    const frage = String(a?.frage ?? '').trim();
    if (!frage) { uebersprungen++; return; }
    if (anfragen.length >= MAX_JE_STAPEL) { uebersprungen++; return; }

    let id = sichereId(a.kennung ?? 'pos', i + 1);
    // Nummer haengt schon dran, aber bei gleicher Kennung UND gleichem Index
    // (kann bei gefilterten Listen vorkommen) noch einmal absichern.
    let versuch = 1;
    while (vergeben.has(id)) { id = sichereId(a.kennung ?? 'pos', i + 1 + versuch * 1000); versuch++; }
    vergeben.add(id);

    anfragen.push({
      custom_id: id,
      params: {
        model,
        max_tokens: maxTokens,
        ...(a.system ? { system: a.system } : {}),
        messages: [{ role: 'user', content: frage }],
      },
    });
    zuordnung[id] = a.ziel ?? {};
  });

  return { anfragen, zuordnung, uebersprungen };
}

/** Wird der Stapel zu gross? Vor dem Absenden pruefen, nicht danach. */
export function pruefeStapel(anfragen: BatchAnfrage[]): string[] {
  const fehler: string[] = [];
  if (anfragen.length === 0) fehler.push('Der Stapel ist leer — es gibt nichts zu berechnen.');
  if (anfragen.length > MAX_JE_STAPEL) fehler.push(`Ein Stapel fasst höchstens ${MAX_JE_STAPEL} Anfragen.`);

  const zeichen = anfragen.reduce((s, a) => {
    const nachricht = a.params.messages.map((m) => m.content).join('').length;
    return s + nachricht + (a.params.system?.length ?? 0);
  }, 0);
  if (zeichen > MAX_ZEICHEN_GESAMT) {
    fehler.push('Der Stapel ist insgesamt zu umfangreich. Bitte in mehrere Teile aufteilen.');
  }

  const ids = new Set(anfragen.map((a) => a.custom_id));
  if (ids.size !== anfragen.length) fehler.push('Doppelte Kennungen im Stapel — die Zuordnung wäre nicht eindeutig.');

  return fehler;
}

/** Antwort-Text aus einer Batch-Zeile ziehen — defensiv, das Format kann sich ändern. */
export function textAus(zeile: unknown): BatchErgebnis | null {
  if (!zeile || typeof zeile !== 'object') return null;
  const z = zeile as Record<string, unknown>;
  const customId = typeof z.custom_id === 'string' ? z.custom_id : '';
  if (!customId) return null;

  const ergebnis = z.result as Record<string, unknown> | undefined;
  const art = typeof ergebnis?.type === 'string' ? ergebnis.type : 'unbekannt';

  if (art !== 'succeeded') {
    const fehlerObj = ergebnis?.error as Record<string, unknown> | undefined;
    return {
      custom_id: customId,
      ok: false,
      text: '',
      fehler: fehlerText(art, typeof fehlerObj?.message === 'string' ? fehlerObj.message : undefined),
    };
  }

  const nachricht = ergebnis?.message as Record<string, unknown> | undefined;
  const bloecke = Array.isArray(nachricht?.content) ? (nachricht.content as Array<Record<string, unknown>>) : [];
  const text = bloecke
    .filter((b) => b?.type === 'text')
    .map((b) => (typeof b.text === 'string' ? b.text : ''))
    .join('')
    .trim();

  if (!text) return { custom_id: customId, ok: false, text: '', fehler: 'Leere Antwort erhalten.' };
  return { custom_id: customId, ok: true, text };
}

export function fehlerText(art: string, meldung?: string): string {
  if (art === 'errored') return meldung ? `Fehlgeschlagen: ${meldung}` : 'Die Anfrage ist fehlgeschlagen.';
  if (art === 'canceled') return 'Der Stapel wurde abgebrochen.';
  if (art === 'expired') return 'Die Anfrage ist abgelaufen (nach 24 Stunden ohne Ergebnis).';
  return meldung ? `Unbekannter Ausgang (${art}): ${meldung}` : `Unbekannter Ausgang: ${art}`;
}

/** JSONL zerlegen — jede Zeile ein Ergebnis. Kaputte Zeilen werden übersprungen, nicht geworfen. */
export function leseJsonl(roh: string): BatchErgebnis[] {
  const ergebnisse: BatchErgebnis[] = [];
  for (const zeile of String(roh || '').split('\n')) {
    const t = zeile.trim();
    if (!t) continue;
    try {
      const e = textAus(JSON.parse(t));
      if (e) ergebnisse.push(e);
    } catch { /* eine kaputte Zeile darf den Rest nicht mitreissen */ }
  }
  return ergebnisse;
}

/** Was ist aus dem Stapel geworden? Für den Status in der Datenbank. */
export function fasseZusammen(ergebnisse: BatchErgebnis[], erwartet: number): {
  status: 'fertig' | 'teilweise' | 'fehler';
  fertig: number;
  fehler: number;
  text: string;
} {
  const gut = ergebnisse.filter((e) => e.ok).length;
  const schlecht = ergebnisse.length - gut;

  if (gut === 0) {
    return { status: 'fehler', fertig: 0, fehler: Math.max(schlecht, erwartet), text: 'Der Stapel hat kein einziges Ergebnis geliefert.' };
  }
  if (schlecht > 0 || (erwartet > 0 && gut < erwartet)) {
    const fehlend = Math.max(schlecht, erwartet - gut);
    return { status: 'teilweise', fertig: gut, fehler: fehlend, text: `${gut} von ${erwartet} fertig, ${fehlend} ohne Ergebnis.` };
  }
  return { status: 'fertig', fertig: gut, fehler: 0, text: `Alle ${gut} Ergebnisse sind da.` };
}

/** Wie lange läuft der Stapel schon — in Klartext für die Anzeige. */
export function wartetSeit(erstelltAm: string, jetzt: Date): string {
  const start = new Date(erstelltAm).getTime();
  if (isNaN(start)) return '';
  const min = Math.max(0, Math.round((jetzt.getTime() - start) / 60000));
  if (min < 1) return 'gerade abgeschickt';
  if (min < 60) return `seit ${min} Minuten`;
  const std = Math.floor(min / 60);
  if (std < 24) return `seit ${std} ${std === 1 ? 'Stunde' : 'Stunden'}`;
  return `seit ${Math.floor(std / 24)} Tagen`;
}

/** Nach 24 Stunden ist Schluss — dann hat die Schnittstelle aufgegeben. */
export function istAbgelaufen(erstelltAm: string, jetzt: Date): boolean {
  const start = new Date(erstelltAm).getTime();
  if (isNaN(start)) return false;
  return jetzt.getTime() - start > 25 * 3600 * 1000;   // eine Stunde Puffer
}

// ---------------------------------------------------------------------------
// Netz (duenn gehalten, damit oben alles testbar bleibt)
// ---------------------------------------------------------------------------

function kopf(): Record<string, string> {
  return {
    'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
    'anthropic-version': VERSION,
    'Content-Type': 'application/json',
  };
}

/** Stapel abschicken. Liefert die externe Batch-ID. */
export async function absenden(anfragen: BatchAnfrage[]): Promise<{ ok: true; extern_id: string } | { ok: false; fehler: string }> {
  const probe = pruefeStapel(anfragen);
  if (probe.length > 0) return { ok: false, fehler: probe.join(' ') };

  try {
    const res = await fetch(BASIS, {
      method: 'POST',
      headers: kopf(),
      body: JSON.stringify({ requests: anfragen }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, fehler: `Der Stapel wurde nicht angenommen (${res.status}): ${t.slice(0, 300)}` };
    }
    const daten = await res.json() as { id?: string };
    if (!daten?.id) return { ok: false, fehler: 'Die Antwort enthielt keine Stapel-Kennung.' };
    return { ok: true, extern_id: daten.id };
  } catch (err: unknown) {
    return { ok: false, fehler: err instanceof Error ? err.message : 'Unbekannter Fehler beim Absenden.' };
  }
}

/** Läuft der Stapel noch? */
export async function nachsehen(externId: string): Promise<{ ok: true; stand: BatchStatus } | { ok: false; fehler: string }> {
  try {
    const res = await fetch(`${BASIS}/${encodeURIComponent(externId)}`, { headers: kopf() });
    if (!res.ok) return { ok: false, fehler: `Stand nicht abrufbar (${res.status}).` };

    const d = await res.json() as {
      processing_status?: string;
      request_counts?: { processing?: number; succeeded?: number; errored?: number; canceled?: number; expired?: number };
    };
    const z = d?.request_counts ?? {};
    return {
      ok: true,
      stand: {
        extern_id: externId,
        laeuft: d?.processing_status !== 'ended',
        verarbeitet: Number(z.processing ?? 0),
        erfolgreich: Number(z.succeeded ?? 0),
        fehlerhaft: Number(z.errored ?? 0),
        abgebrochen: Number(z.canceled ?? 0),
        abgelaufen: Number(z.expired ?? 0),
      },
    };
  } catch (err: unknown) {
    return { ok: false, fehler: err instanceof Error ? err.message : 'Unbekannter Fehler beim Nachsehen.' };
  }
}

/** Ergebnisse abholen. */
export async function abholen(externId: string): Promise<{ ok: true; ergebnisse: BatchErgebnis[] } | { ok: false; fehler: string }> {
  try {
    const res = await fetch(`${BASIS}/${encodeURIComponent(externId)}/results`, { headers: kopf() });
    if (!res.ok) return { ok: false, fehler: `Ergebnisse nicht abrufbar (${res.status}).` };
    const roh = await res.text();
    return { ok: true, ergebnisse: leseJsonl(roh) };
  } catch (err: unknown) {
    return { ok: false, fehler: err instanceof Error ? err.message : 'Unbekannter Fehler beim Abholen.' };
  }
}
