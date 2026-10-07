// ============================================================================
// ARGONAUT OS · lib/onboardingZertifikat.ts — Abschluss-Zertifikat
//
// Wird ausgestellt, wenn ein Kunde die geführte Einrichtung vollständig
// durchlaufen hat („Vom Matrosen zum Kapitän", siehe lib/onboardingStufen.ts).
//
// Bewusst KEINE Behauptung einer amtlichen oder staatlich anerkannten
// Zertifizierung — es ist eine Bestätigung des Anbieters, dass der Betrieb die
// Einrichtung abgeschlossen hat und das System sicher bedienen kann.
//
// Auf dem Zertifikat steht ausdrücklich, WELCHE Bereiche der Betrieb bedienen
// kann. Diese Liste ist je Branche verschieden — sie kommt aus den tatsächlich
// abgeschlossenen Schritten der Startstrecke, nicht aus einer Standardliste.
//
// Alles wird gezeichnet, nichts nachgeladen: Der Dreizack ist Vektor-Grafik in
// der Form der Wortmarke, der Stempel wird gezeichnet. Damit sieht das PDF
// überall gleich aus und braucht keine Schrift- oder Bilddateien. Die
// Unterschrift kann optional als PNG mitgegeben werden; fehlt sie, bleibt eine
// saubere Signaturlinie stehen.
//
// Clientseitig mit jsPDF.
// ============================================================================

import { jsPDF } from 'jspdf';
import { UNTERSCHRIFT_ARGONAUT } from './unterschriftArgonaut';
import { ZEICHEN_PFAD, ZEICHEN_VERHAELTNIS } from './argonautZeichen';

const NAVY = '#0A1628';
const GOLD = '#C9A84C';
const GREY = '#5A6B82';

export interface OnboardingZertifikatDaten {
  /** Name der Person, die die Einrichtung abgeschlossen hat. */
  name: string;
  /** Firmenname des Betriebs. */
  firma?: string | null;
  /** Branche — erscheint als Zusatzzeile, wenn vorhanden. */
  branche?: string | null;
  /** Wie viele Schritte durchlaufen wurden (für die Detailzeile). */
  schritte?: number;
  /** Beherrschte Bereiche/Module — branchenindividuell, aus den erledigten Schritten. */
  bereiche?: string[] | null;
  /** ISO-Datum der Ausstellung. */
  ausstellungsdatum: string;
  /** Eindeutige Nummer — macht das Dokument nachprüfbar. */
  nummer?: string | null;
  /** Unterschrift als PNG-DataURL. Fehlt sie, bleibt die Linie leer. */
  unterschriftPng?: string | null;
}

function deDatum(iso?: string | null): string {
  if (!iso) return '';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}

/**
 * Das ARGONAUT-Zeichen (Segel-A, Logo-Tausch L1 vom 07.10.2026).
 *
 * Die Form liegt zentral in lib/argonautZeichen.ts (dieselbe wie im Web-Logo),
 * auf eine Hoehe von 1 normiert (x laeuft bis DREIZACK_VERHAELTNIS). Dadurch
 * ist das Zeichen im PDF echte Vektorgrafik: beliebig skalierbar, gestochen
 * scharf im Druck, ohne Bilddatei und ohne Hintergrund.
 *
 * SVG-Syntax, absolute Koordinaten, nur M/C/Z.
 */
const DREIZACK_VERHAELTNIS = ZEICHEN_VERHAELTNIS;
const DREIZACK_PFAD = ZEICHEN_PFAD;

/**
 * Zeichnet den Dreizack als gefüllte Vektorfläche.
 *
 * @param mx  Mittelpunkt waagerecht
 * @param oy  Oberkante
 * @param h   Gesamthöhe
 */
function zeichneDreizack(doc: jsPDF, mx: number, oy: number, h: number, farbe: string): void {
  const b = h * DREIZACK_VERHAELTNIS;
  const px = (u: number) => mx - b / 2 + u * h;
  const py = (v: number) => oy + v * h;

  const teile = DREIZACK_PFAD.match(/[MLCZ][^MLCZ]*/g) || [];
  const strecken: Array<{ op: string; c: number[] }> = [];
  for (const t of teile) {
    const op = t.charAt(0);
    const z = (t.slice(1).match(/-?\d*\.?\d+/g) || []).map(Number);
    if (op === 'M') strecken.push({ op: 'm', c: [px(z[0]), py(z[1])] });
    else if (op === 'L') {
      for (let i = 0; i + 1 < z.length; i += 2) strecken.push({ op: 'l', c: [px(z[i]), py(z[i + 1])] });
    } else if (op === 'C') {
      for (let i = 0; i + 5 < z.length; i += 6) {
        strecken.push({ op: 'c', c: [px(z[i]), py(z[i + 1]), px(z[i + 2]), py(z[i + 3]), px(z[i + 4]), py(z[i + 5])] });
      }
    } else strecken.push({ op: 'h', c: [] });
  }

  doc.setFillColor(farbe);
  // Even-Odd-Regel: falls die Form je Innenflächen bekommt, bleiben die frei.
  doc.path(strecken).fillEvenOdd();
}

/** Zeichnet den Firmenstempel als Kreis mit Text — ohne Bilddatei. */
function zeichneStempel(doc: jsPDF, mx: number, my: number, r: number): void {
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.8);
  doc.circle(mx, my, r, 'S');
  doc.setLineWidth(0.3);
  doc.circle(mx, my, r - 2.2, 'S');

  doc.setTextColor(GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('ARGONAUT OS', mx, my - 6.2, { align: 'center' });
  // Segel-A ist breiter als der alte Dreizack (1,37 statt 1,01) -> etwas flacher.
  zeichneDreizack(doc, mx, my - 3.6, 7, GOLD);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.6);
  doc.text('GASPAR AI CONSULTING', mx, my + 8.4, { align: 'center' });
  doc.text('BÖBLINGEN', mx, my + 11.4, { align: 'center' });
}

/** Zertifikatsnummer im Format ARG-JJJJ-XXXX-TTMM. */
export function zertifikatsNummer(userId: string, iso: string): string {
  const kurz = (userId || '').replace(/-/g, '').slice(0, 4).toUpperCase() || 'ARGO';
  const d = String(iso).slice(0, 10).split('-');
  const jahr = d[0] || '2026';
  const tagMonat = d.length === 3 ? `${d[2]}${d[1]}` : '0000';
  return `ARG-${jahr}-${kurz}-${tagMonat}`;
}

/** Baut das Zertifikat und gibt das jsPDF-Objekt zurück (zum Speichern ODER Versenden). */
export function baueOnboardingZertifikat(dn: OnboardingZertifikatDaten): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const H = 210;

  // --- Rahmen: aussen Navy, innen fein Gold ---------------------------------
  doc.setDrawColor(NAVY);
  doc.setLineWidth(1.6);
  doc.rect(10, 10, W - 20, H - 20);
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.4);
  doc.rect(13.5, 13.5, W - 27, H - 27);

  // --- Kopf: Dreizack + Wortmarke -------------------------------------------
  zeichneDreizack(doc, W / 2, 22, 14, GOLD);
  doc.setTextColor(NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('A R G O N A U T   O S', W / 2, 46, { align: 'center' });

  // --- Titel ----------------------------------------------------------------
  doc.setFontSize(27);
  doc.text('Abschluss-Zertifikat', W / 2, 63, { align: 'center' });
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.7);
  doc.line(W / 2 - 32, 68.5, W / 2 + 32, 68.5);

  // --- Einleitung -----------------------------------------------------------
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  doc.setTextColor(GREY);
  doc.text('Hiermit wird bestätigt, dass', W / 2, 80, { align: 'center' });

  // --- Name -----------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.setTextColor(NAVY);
  doc.text(dn.name || '—', W / 2, 93, { align: 'center' });

  if (dn.firma) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12.5);
    doc.setTextColor(GREY);
    doc.text(dn.firma, W / 2, 101, { align: 'center' });
  }

  // --- Kernaussage ----------------------------------------------------------
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  doc.setTextColor(GREY);
  doc.text('die geführte Einrichtung von ARGONAUT OS vollständig durchlaufen hat', W / 2, 111, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(NAVY);
  doc.text('und das System sicher bedienen kann.', W / 2, 119, { align: 'center' });

  // --- Rang + Details -------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(GOLD);
  doc.text('Erreichter Rang:  K A P I T Ä N', W / 2, 129.5, { align: 'center' });

  const details: string[] = [];
  if (dn.branche) details.push(`Branche: ${dn.branche}`);
  if (dn.schritte && dn.schritte > 0) details.push(`Abgeschlossene Schritte: ${dn.schritte}`);
  if (details.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(GREY);
    doc.text(details.join('   ·   '), W / 2, 136, { align: 'center' });
  }

  // --- Beherrschte Bereiche -------------------------------------------------
  // Das ist der Teil, den ein Kunde wirklich vorzeigen kann: nicht „hat etwas
  // gemacht", sondern konkret, welche Bereiche er bedienen kann. Je Branche
  // andere Einträge, weil die Startstrecke je Branche anders aussieht.
  //
  // Bewusst als drei Spalten auf der linken Blatthälfte — so bleibt die rechte
  // Seite frei für den Stempel und nichts überdeckt sich.
  const bereiche = (dn.bereiche || []).map((s) => String(s).trim()).filter(Boolean);
  if (bereiche.length) {
    const SPALTEN_X = [30, 96, 162, 228];
    const ZEILEN = 3;
    const PLATZ = SPALTEN_X.length * ZEILEN;              // 12 Einträge über die volle Breite
    const zeigen = bereiche.slice(0, bereiche.length > PLATZ ? PLATZ - 1 : PLATZ);
    if (bereiche.length > PLATZ) zeigen.push(`u. a. ${bereiche.length - (PLATZ - 1)} weitere`);

    doc.setDrawColor(GOLD);
    doc.setLineWidth(0.3);
    doc.line(30, 142, W - 30, 142);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(NAVY);
    doc.text('B E H E R R S C H T E   B E R E I C H E', W / 2, 148.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    zeigen.forEach((b, i) => {
      const spalte = Math.floor(i / ZEILEN);
      const zeile = i % ZEILEN;
      const x = SPALTEN_X[spalte];
      const y = 156 + zeile * 5.2;
      doc.setTextColor(GOLD);
      doc.text('•', x, y);
      doc.setTextColor(GREY);
      // Zu lange Bezeichnungen werden gekürzt, damit die Spalten sauber bleiben.
      const t = (doc.splitTextToSize(b, 59) as string[])[0];
      doc.text(t.length < b.length ? `${t.trim()}…` : b, x + 3.5, y);
    });
  }

  // --- Unterschrift links ---------------------------------------------------
  const sigY = 178;
  // Standard = eingebettete Aussteller-Unterschrift (Martin Gaspar); eine
  // explizit übergebene unterschriftPng hat Vorrang.
  const sigBild = dn.unterschriftPng || UNTERSCHRIFT_ARGONAUT;
  if (sigBild) {
    try {
      // Über der Linie platziert, damit sie wie eine echte Unterschrift sitzt.
      doc.addImage(sigBild, 'PNG', 42, sigY - 20, 55, 18);
    } catch {
      /* Unterschrift optional — bei fehlerhaftem Bild bleibt die Linie leer. */
    }
  }
  doc.setDrawColor(GREY);
  doc.setLineWidth(0.3);
  doc.line(38, sigY, 108, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(NAVY);
  doc.text('Martin Gaspar', 38, sigY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(GREY);
  doc.text('Gaspar AI Consulting', 38, sigY + 10.5);

  // --- Ort und Datum mittig -------------------------------------------------
  doc.setFontSize(9.5);
  doc.setTextColor(GREY);
  doc.text(`Böblingen, ${deDatum(dn.ausstellungsdatum)}`, W / 2, sigY + 5.5, { align: 'center' });

  // --- Stempel oben rechts ---------------------------------------------------
  // Bewusst nach oben gerückt: dadurch bleibt die ganze untere Blatthälfte für
  // die Bereichsliste frei, und die ist der eigentliche Wert des Dokuments.
  zeichneStempel(doc, W - 52, 47, 19);

  // --- Fusszeile: Nummer + rechtlicher Hinweis ------------------------------
  const nummer = dn.nummer || '';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(GREY);
  if (nummer) doc.text(`Zertifikat-Nr. ${nummer}`, 18, H - 16);
  doc.text(
    'Bestätigung des Anbieters über den Abschluss der Einrichtung — keine staatlich anerkannte Zertifizierung.',
    W / 2,
    H - 16,
    { align: 'center' },
  );
  doc.text('argonaut-os.com', W - 18, H - 16, { align: 'right' });

  return doc;
}

/** Baut das Zertifikat und löst den Download aus. */
export function ladeOnboardingZertifikat(dn: OnboardingZertifikatDaten): void {
  const doc = baueOnboardingZertifikat(dn);
  const safe = (dn.name || 'Teilnehmer').replace(/[^\wäöüÄÖÜß -]/g, '').trim().replace(/\s+/g, '_');
  doc.save(`ARGONAUT_Abschluss-Zertifikat_${safe || 'Teilnehmer'}.pdf`);
}
