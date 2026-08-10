// ============================================================================
// ARGONAUT OS · lib/dossierSequenz.ts
// Inhalte + Zeitplan der 7-Tage-Test-Nachfass-Strecke (eigener Website-Funnel,
// NICHT der tenant-scoped Autoresponder). Reine Bausteine — kein Fetch.
// Ton: „Sie" (einheitlich mit Dossier & Website). Jede Mail hat einen
// Abmelde-Link (Pflicht). Zeit-Modell: tag = Tage ab Test-Bestätigung (absolut).
// ============================================================================

import { mailLayout } from './mail';

export type SeqVars = { name: string | null; abmeldeUrl: string; terminUrl: string; testUrl: string };
export type SeqStep = { tag: number; betreff: string; html: (v: SeqVars) => string };

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
  return `<p style="color:#8FA3BE;font-size:12px;margin-top:26px;border-top:1px solid #24344a;padding-top:14px;">Sie möchten keine weiteren Mails zum Test? <a href="${url}" style="color:#8FA3BE;">Hier mit einem Klick abmelden</a>.</p>`;
}

// Die Test-Strecke. Reihenfolge = Versand-Reihenfolge; tag = Tage ab Bestätigung.
export const TEST_STEPS: SeqStep[] = [
  {
    tag: 0,
    betreff: 'Ihr ARGONAUT-Test läuft — so holen Sie das meiste heraus',
    html: (v) => mailLayout('Willkommen', `
      <p>${anrede(v.name)}</p>
      <p>Ihr 7-Tage-Test ist startklar — voller Zugang, ohne Zahlungsmittel, und er endet nach 7 Tagen von selbst.</p>
      <p><b>Mein Tipp für den Anfang:</b> Legen Sie einen echten Kunden und einen echten Vorgang an (Angebot oder Termin). Dann sehen Sie sofort, wie alles zusammenläuft — ein System statt zwölf.</p>
      <p>Ihr branchenspezifisches Dossier haben Sie ja schon; darin steht, was ARGONAUT genau für Ihren Betrieb übernimmt.</p>
      <p>Fragen? Antworten Sie einfach auf diese Mail.</p>
      ${abmelde(v.abmeldeUrl)}`),
  },
  {
    tag: 3,
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
    betreff: 'Ihr Test endet heute — so geht es weiter',
    html: (v) => mailLayout('Ihr Test endet heute', `
      <p>${anrede(v.name)}</p>
      <p>heute läuft Ihr 7-Tage-Test aus. Zwei einfache Wege:</p>
      <p><b>1.</b> Sie möchten weitermachen → lassen Sie uns kurz sprechen, wir schalten Sie frei.<br>
         <b>2.</b> Noch unsicher → auch gut. Sagen Sie mir, was gefehlt hat — ehrliches Feedback hilft mir enorm.</p>
      <p style="margin:22px 0;">${btnGold(v.terminUrl, 'Gespräch buchen →')}</p>
      <p>So oder so: danke, dass Sie ARGONAUT ausprobiert haben.</p>
      ${abmelde(v.abmeldeUrl)}`),
  },
  {
    tag: 10,
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
