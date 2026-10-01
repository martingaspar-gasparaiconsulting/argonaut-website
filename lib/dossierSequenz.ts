// ============================================================================
// ARGONAUT OS · lib/dossierSequenz.ts
// Inhalte + Zeitplan der 7-Tage-Test-Nachfass-Strecke (eigener Website-Funnel,
// NICHT der tenant-scoped Autoresponder). Reine Bausteine — kein Fetch.
// Ton: „Sie" (einheitlich mit Dossier & Website). Jede Mail hat einen
// Abmelde-Link (Pflicht). Zeit-Modell (Paket 187): bezug + versatz — Willkommen ab Bestätigung,
// alles Weitere ab Freischaltung des Zugangs bzw. relativ zum Testende.
// ============================================================================

import { mailLayout } from './mail';

export type SeqVars = { name: string | null; abmeldeUrl: string; terminUrl: string; testUrl: string };
/**
 * Paket 187: Bezugspunkt je Schritt.
 *   anfrage — Tage ab Bestätigung der Anfrage (nur Tag 0: Willkommen)
 *   start   — Tage ab FREISCHALTUNG des Testzugangs (Command Center „Demo setzen")
 *   ende    — Tage relativ zum TESTENDE (−2 = „Noch 2 Tage", 0 = „endet heute")
 * Vorher zählten alle Schritte ab Bestätigung — „Noch 2 Tage" stimmte nur, wenn
 * der Zugang am selben Tag freigeschaltet wurde (Claude-Befund 30.09.).
 */
export type SeqBezug = 'anfrage' | 'start' | 'ende';
export type SeqStep = { tag: number; bezug?: SeqBezug; versatz?: number; betreff: string; html: (v: SeqVars) => string };

function anrede(name: string | null): string {
  return name ? `Guten Tag ${name},` : 'Guten Tag,';
}
function btnGold(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#C9A84C;color:#0A1628;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:8px;">${label}</a>`;
}
function btnLine(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:transparent;color:#C9A84C;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:8px;border:1px solid #C9A84C;">${label}</a>`;
}
function abmelde(url: string): string {
  // Paket 173: Widerspruchshinweis nach § 7 Abs. 3 Nr. 4 UWG (Wortlaut wie lib/werbemail FUSS_WIDERSPRUCH).
  return `<p style="color:#8FA3BE;font-size:12px;line-height:1.5;margin-top:26px;border-top:1px solid #24344a;padding-top:14px;">Sie erhalten diese E-Mail, weil Sie das ARGONAUT-Dossier angefordert und bestätigt haben. Sie möchten keine weiteren Mails zum Test? <a href="${url}" style="color:#8FA3BE;">Hier mit einem Klick abmelden</a>.<br>Sie können der Verwendung Ihrer E-Mail-Adresse für Werbung jederzeit widersprechen, ohne dass hierfür andere als die Übermittlungskosten nach den Basistarifen entstehen.</p>`;
}

// Die Test-Strecke. Reihenfolge = Versand-Reihenfolge; tag = Tag bei 7-Tage-Test (nur zur Orientierung),
// massgeblich sind bezug + versatz (Paket 187).
export const TEST_STEPS: SeqStep[] = [
  {
    tag: 0,
    bezug: 'anfrage',
    versatz: 0,
    betreff: 'Ihr ARGONAUT-Test — so holen Sie das meiste heraus',
    html: (v) => mailLayout('Willkommen', `
      <p>${anrede(v.name)}</p>
      <p>danke für Ihre Anfrage zum 7-Tage-Test. Wir richten Ihren Zugang persönlich für Ihre Branche ein und schicken Ihnen die Zugangsdaten in einer eigenen E-Mail — voller Zugang, ohne Zahlungsmittel, und der Test endet nach 7 Tagen von selbst.</p>
      <p><b>Mein Tipp für den Anfang:</b> Legen Sie einen echten Kunden und einen echten Vorgang an (Angebot oder Termin). Dann sehen Sie sofort, wie alles zusammenläuft — ein System statt zwölf.</p>
      <p>Ihr branchenspezifisches Dossier haben Sie ja schon; darin steht, was ARGONAUT genau für Ihren Betrieb übernimmt.</p>
      <p>Fragen? Antworten Sie einfach auf diese Mail.</p>
      ${abmelde(v.abmeldeUrl)}`),
  },
  {
    tag: 3,
    bezug: 'start',
    versatz: 3,
    betreff: 'Die eine Sache, die die meisten unterschätzen',
    html: (v) => mailLayout('Ein Aha-Moment', `
      <p>${anrede(v.name)}</p>
      <p>kurzer Tipp aus der Praxis: Lassen Sie ARGONAUT einmal aus einem Vorgang die Rechnung erstellen — Sie geben nichts doppelt ein, die E-Rechnung entsteht von selbst.</p>
      <p>Genau dieses „einmal eingeben, überall nutzbar" ist der Punkt, an dem es bei den meisten klick macht.</p>
      <p style="margin:22px 0;">${btnGold(v.terminUrl, 'In 20 Min. für Ihren Betrieb zeigen lassen →')}</p>
      ${abmelde(v.abmeldeUrl)}`),
  },
  {
    tag: 5,
    bezug: 'ende',
    versatz: -2,
    betreff: 'Noch 2 Tage — brauchen Sie mehr Zeit?',
    html: (v) => mailLayout('Noch 2 Tage', `
      <p>${anrede(v.name)}</p>
      <p>Ihr Test läuft in 2 Tagen aus. Falls Sie noch nicht alles ausprobieren konnten: kein Problem — melden Sie sich, dann finden wir eine Lösung.</p>
      <p>Am schnellsten geht es im kurzen Gespräch:</p>
      <p style="margin:22px 0;">${btnGold(v.terminUrl, 'Termin vereinbaren →')}</p>
      ${abmelde(v.abmeldeUrl)}`),
  },
  {
    tag: 7,
    bezug: 'ende',
    versatz: 0,
    betreff: 'Ihr Test endet heute — so geht es weiter',
    html: (v) => mailLayout('Ihr Test endet heute', `
      <p>${anrede(v.name)}</p>
      <p>heute läuft Ihr Testzugang aus. Zwei einfache Wege:</p>
      <p><b>1.</b> Sie möchten weitermachen → lassen Sie uns kurz sprechen, wir schalten Sie frei.<br>
         <b>2.</b> Noch unsicher → auch gut. Sagen Sie mir, was gefehlt hat — ehrliches Feedback hilft mir enorm.</p>
      <p style="margin:22px 0;">${btnGold(v.terminUrl, 'Gespräch buchen →')}</p>
      <p>So oder so: danke, dass Sie ARGONAUT ausprobiert haben.</p>
      ${abmelde(v.abmeldeUrl)}`),
  },
  {
    tag: 10,
    bezug: 'ende',
    versatz: 3,
    betreff: 'Eine letzte Frage',
    html: (v) => mailLayout('Eine letzte Frage', `
      <p>${anrede(v.name)}</p>
      <p>eine kurze, ehrliche Frage: Was hat gefehlt, damit ARGONAUT für Sie passt? Eine Zeile reicht — ich lese jede Antwort selbst.</p>
      <p>Und falls es einfach der falsche Zeitpunkt war: Die Tür bleibt offen, Ihr Dossier gilt weiter.</p>
      <p style="margin:22px 0;">${btnLine(v.testUrl, 'Test neu starten →')}</p>
      ${abmelde(v.abmeldeUrl)}`),
  },
];

/** Nächster Schritt-Index nach dem aktuell gesendeten, oder -1 (Strecke durch). */
export function naechsterSchrittIndex(aktuell: number): number {
  return aktuell + 1 < TEST_STEPS.length ? aktuell + 1 : -1;
}

// ---------------------------------------------------------------------------
// Paket 187: Termin des nächsten Schritts — ab Freischaltung und Testende.
// ---------------------------------------------------------------------------

const TAG_MS = 86_400_000;

export type SeqPlan =
  | { art: 'termin'; schritt: number; am: string }
  | { art: 'warten' }      // nächster Schritt braucht die Freischaltung des Zugangs
  | { art: 'fertig' };

function zeit(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  return Number.isFinite(t) ? t : null;
}

/** Zeitpunkt eines Schritts; null = Bezug fehlt. */
export function schrittTermin(step: SeqStep, bestaetigtAm: string | null, startAm: string | null, endeAm: string | null): number | null {
  const bezug = step.bezug ?? 'anfrage';
  const versatz = (step.versatz ?? step.tag) * TAG_MS;
  const basis = bezug === 'anfrage' ? zeit(bestaetigtAm) : bezug === 'start' ? zeit(startAm) : zeit(endeAm);
  return basis == null ? null : basis + versatz;
}

/**
 * Was kommt nach dem gerade gesendeten Schritt `gesendet`?
 * · Ohne Freischaltung (start/ende fehlen) wartet die Strecke.
 * · Ein Schritt, der VOR dem Teststart läge (z. B. „Noch 2 Tage" bei einem
 *   2-Tage-Test) oder vor einem schon geplanten früheren Schritt, wird übersprungen.
 * · Liegt der Termin in der Vergangenheit, ist er sofort fällig (jetzt).
 */
export function naechsterPlan(gesendet: number, bestaetigtAm: string | null, startAm: string | null, endeAm: string | null, jetzt: Date): SeqPlan {
  const jetztMs = jetzt.getTime();
  const startMs = zeit(startAm);
  const endeMs = zeit(endeAm);
  const vorher = TEST_STEPS[gesendet] ? schrittTermin(TEST_STEPS[gesendet], bestaetigtAm, startAm, endeAm) : null;
  const untergrenze = Math.max(startMs ?? -Infinity, vorher ?? -Infinity);
  for (let i = gesendet + 1; i < TEST_STEPS.length; i++) {
    const step = TEST_STEPS[i];
    const bezug = step.bezug ?? 'anfrage';
    const t = schrittTermin(step, bestaetigtAm, startAm, endeAm);
    if (t == null) return { art: 'warten' };
    // Tipp „ab Start" erst nach Testende ergibt keinen Sinn -> überspringen
    if (bezug === 'start' && endeMs != null && t >= endeMs) continue;
    // „Noch 2 Tage" bei einem Test von 2 Tagen oder kürzer -> überspringen
    if (bezug === 'ende' && (step.versatz ?? 0) < 0 && startMs != null && t <= startMs) continue;
    if (t < untergrenze) continue;
    return { art: 'termin', schritt: i, am: new Date(Math.max(t, jetztMs)).toISOString() };
  }
  return { art: 'fertig' };
}
