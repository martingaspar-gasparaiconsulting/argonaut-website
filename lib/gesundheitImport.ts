// ============================================================================
// ARGONAUT OS · lib/gesundheitImport.ts — Gesundheitsangaben beim Umzug
// (Paket 153, 28.09.2026 — vorgebaut, gesperrt bis zur Anwalt-Freigabe)
//
// Beim Import einer Patientenkartei oder alter Behandlungen duerfen
// Gesundheitsangaben nie im Klartext in eine Tabelle. Sie gehen denselben Weg
// wie im Praxis-Paket: verschluesselt nach gesundheit_notiz, Schluessel nur auf
// dem Server, jeder Zugriff protokolliert.
//
// Hier liegt die reine Logik (node-testbar):
//   · notizenFuerSatz — aus den Werten EINER Datei-Zeile die Notizen bauen
//     (Allergien, Medikation … je eigene Notiz; alle Spalten ohne Feld als
//     EIN Hinweis „Weitere Angaben aus dem Altsystem" — nichts verschluckt)
//   · pruefeStapel     — Eingang der Server-Route pruefen
//
// Keine Imports ausser lib/praxis (ebenfalls rein).
// ============================================================================
import { NOTIZ_ARTEN, NOTIZ_MAX, pruefeNotiz, type NotizArt } from './praxis';

/** Hoechstens so viele Notizen je Anfrage an die Route. */
export const STAPEL_MAX = 200;

export type NotizEntwurf = { kunde_id: string; art: NotizArt; text: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function istArt(a: unknown): a is NotizArt {
  return NOTIZ_ARTEN.some((x) => x.key === a);
}

/** Zu lange Texte in Teile schneiden (an Zeilenenden, wo es geht) — nichts abgeschnitten. */
export function teileText(text: string, max = NOTIZ_MAX): string[] {
  const t = text.trim();
  if (t.length <= max) return [t];
  const platz = max - 20; // Platz fuer „(Teil 2/3) "
  const teile: string[] = [];
  let rest = t;
  while (rest.length > platz) {
    let schnitt = rest.lastIndexOf('\n', platz);
    if (schnitt < platz / 2) schnitt = platz;
    teile.push(rest.slice(0, schnitt).trim());
    rest = rest.slice(schnitt).trim();
  }
  if (rest) teile.push(rest);
  return teile.map((x, i) => `(Teil ${i + 1}/${teile.length}) ${x}`);
}

const LABEL: Record<NotizArt, string> = {
  allergie: 'Allergie',
  unvertraeglichkeit: 'Unverträglichkeit',
  kontraindikation: 'Kontraindikation',
  medikation: 'Medikation',
  hinweis: 'Hinweis',
};

/**
 * Notizen zu EINER Datei-Zeile.
 * `gesundheit`: die Werte der Gesundheitsfelder (aus __gesundheit).
 * `weitere`: Spalten ohne Feld (Eigene Spalten) — gehen als EIN Hinweis mit.
 * `ueberschrift`: z. B. „Behandlung am 12.03.2025 · Massage" (bei Behandlungen).
 */
export function notizenFuerSatz(p: {
  kundeId: string;
  gesundheit?: unknown;
  weitere?: readonly { spalte: string; wert: string }[];
  ueberschrift?: string;
}): NotizEntwurf[] {
  const raus: NotizEntwurf[] = [];
  if (!UUID.test(p.kundeId)) return raus;
  const kopf = p.ueberschrift ? `${p.ueberschrift.trim()}\n` : '';
  const dazu = (art: NotizArt, text: string) => {
    for (const teil of teileText(kopf + text)) raus.push({ kunde_id: p.kundeId, art, text: teil });
  };
  const liste = Array.isArray(p.gesundheit) ? p.gesundheit : [];
  for (const g of liste) {
    const art = (g as { art?: unknown })?.art;
    const text = String((g as { text?: unknown })?.text ?? '').trim();
    if (!istArt(art) || !text) continue;
    // Sehr kurze Angaben („x", „-") mit Bezeichnung, damit die Pruefung (mind. 2 Zeichen) nichts verwirft.
    dazu(art, text.length < 2 ? `${LABEL[art]}: ${text}` : text);
  }
  const weitere = (p.weitere ?? []).filter((w) => String(w.wert ?? '').trim() !== '');
  if (weitere.length > 0) {
    dazu('hinweis', 'Weitere Angaben aus dem Altsystem:\n' + weitere.map((w) => `${w.spalte}: ${String(w.wert).trim()}`).join('\n'));
  }
  return raus;
}

/** Ueberschrift fuer eine Behandlung („Behandlung am 12.03.2025 · Massage"). */
export function behandlungUeberschrift(satz: Record<string, unknown>): string {
  const d = String(satz.datum ?? '');
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  const datum = m ? `${m[3]}.${m[2]}.${m[1]}` : d;
  const was = String(satz.behandlung ?? '').trim();
  return ['Behandlung' + (datum ? ` am ${datum}` : ''), was].filter(Boolean).join(' · ');
}

export type StapelErgebnis = { ok: true; notizen: NotizEntwurf[] } | { ok: false; fehler: string };

/** Eingang der Route /api/gesundheit-notiz/stapel pruefen — alles oder nichts. */
export function pruefeStapel(body: unknown): StapelErgebnis {
  const liste = (body as { notizen?: unknown } | null)?.notizen;
  if (!Array.isArray(liste) || liste.length === 0) return { ok: false, fehler: 'Keine Angaben übermittelt.' };
  if (liste.length > STAPEL_MAX) return { ok: false, fehler: `Höchstens ${STAPEL_MAX} Angaben je Anfrage.` };
  const notizen: NotizEntwurf[] = [];
  for (let i = 0; i < liste.length; i++) {
    const n = liste[i] as { kunde_id?: unknown; art?: unknown; text?: unknown } | null;
    const kunde = String(n?.kunde_id ?? '');
    if (!UUID.test(kunde)) return { ok: false, fehler: `Angabe ${i + 1}: ungültiger Patient.` };
    const pf = pruefeNotiz({ art: n?.art, text: n?.text });
    if (pf) return { ok: false, fehler: `Angabe ${i + 1}: ${pf}` };
    notizen.push({ kunde_id: kunde, art: n!.art as NotizArt, text: String(n!.text).trim() });
  }
  return { ok: true, notizen };
}

/** Anzahl je Patient — fuer EINE Protokollzeile je Patient (aktion 'anlegen'). */
export function anzahlJePatient(notizen: readonly NotizEntwurf[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const n of notizen) m.set(n.kunde_id, (m.get(n.kunde_id) ?? 0) + 1);
  return m;
}
