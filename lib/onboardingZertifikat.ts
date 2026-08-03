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
 * Der ARGONAUT-Dreizack — die Wortmarke selbst, nicht nachgezeichnet.
 *
 * Der Pfad wurde aus der Original-Bilddatei des Logos vektorisiert und auf eine
 * Höhe von 1 normiert (x läuft entsprechend bis DREIZACK_VERHAELTNIS). Dadurch
 * ist das Zeichen im PDF echte Vektorgrafik: beliebig skalierbar, gestochen
 * scharf im Druck, ohne Bilddatei und ohne Hintergrund — es sitzt also sauber
 * auf Weiß genauso wie auf Navy.
 *
 * SVG-Syntax, absolute Koordinaten, nur M/C/Z. Nicht von Hand bearbeiten.
 */
const DREIZACK_VERHAELTNIS = 1.0097;

const DREIZACK_PFAD =
  'M0.264 0.002C0.263 0.003 0.263 0.006 0.262 0.009 0.26 0.017 0.254 0.024 0.24 0.034 0.232 0.039 0.224 0.047 0' +
  '.221 0.05 0.218 0.054 0.21 0.06 0.203 0.065 0.196 0.069 0.187 0.076 0.185 0.08 0.182 0.083 0.175 0.089 0.17 ' +
  '0.093 0.165 0.096 0.156 0.103 0.152 0.107 0.147 0.112 0.138 0.119 0.133 0.123 0.11 0.144 0.12 0.162 0.155 0.' +
  '163 0.177 0.165 0.186 0.169 0.191 0.181 0.197 0.198 0.185 0.243 0.168 0.265 0.163 0.272 0.156 0.282 0.152 0.' +
  '288 0.149 0.293 0.134 0.309 0.118 0.325 0.076 0.367 0.066 0.379 0.058 0.398 0.055 0.405 0.049 0.416 0.045 0.' +
  '423 0.036 0.437 0.034 0.442 0.029 0.466 0.02 0.504 0.011 0.526 0 0.531 -0.006 0.534 -0.006 0.613 0 0.616 0.0' +
  '11 0.62 0.024 0.644 0.031 0.674 0.036 0.697 0.038 0.701 0.047 0.713 0.051 0.718 0.057 0.728 0.061 0.736 0.06' +
  '5 0.743 0.071 0.753 0.075 0.758 0.079 0.762 0.087 0.772 0.094 0.781 0.106 0.798 0.113 0.804 0.13 0.815 0.135' +
  ' 0.819 0.144 0.825 0.148 0.829 0.157 0.837 0.164 0.84 0.177 0.846 0.182 0.848 0.189 0.852 0.194 0.855 0.214 ' +
  '0.869 0.222 0.871 0.267 0.876 0.346 0.884 0.348 0.885 0.342 0.919 0.339 0.936 0.34 0.951 0.344 0.96 0.347 0.' +
  '966 0.352 0.971 0.366 0.981 0.373 0.986 0.377 0.992 0.379 1 0.381 1.006 0.643 1.004 0.644 0.998 0.646 0.99 0' +
  '.652 0.984 0.662 0.977 0.685 0.962 0.691 0.938 0.68 0.909 0.671 0.887 0.676 0.885 0.747 0.877 0.797 0.871 0.' +
  '839 0.855 0.869 0.83 0.875 0.825 0.885 0.818 0.891 0.814 0.904 0.806 0.929 0.78 0.937 0.767 0.941 0.762 0.94' +
  '7 0.754 0.952 0.749 0.961 0.739 0.962 0.736 0.969 0.719 0.972 0.712 0.978 0.701 0.982 0.695 0.992 0.68 0.995' +
  ' 0.671 1 0.643 1.002 0.63 1.007 0.607 1.01 0.592 1.018 0.552 1.018 0.537 1.01 0.512 1.007 0.502 1.002 0.483 ' +
  '1 0.47 0.994 0.438 0.992 0.432 0.982 0.418 0.978 0.411 0.971 0.399 0.968 0.393 0.962 0.377 0.955 0.368 0.932' +
  ' 0.345 0.909 0.322 0.883 0.292 0.872 0.278 0.867 0.272 0.86 0.263 0.856 0.258 0.844 0.244 0.84 0.227 0.839 0' +
  '.196 0.839 0.171 0.845 0.165 0.871 0.165 0.907 0.165 0.916 0.141 0.889 0.12 0.885 0.116 0.878 0.11 0.875 0.1' +
  '07 0.872 0.103 0.865 0.097 0.86 0.094 0.855 0.091 0.847 0.084 0.843 0.079 0.838 0.074 0.828 0.066 0.821 0.06' +
  '2 0.814 0.057 0.806 0.051 0.803 0.047 0.799 0.043 0.789 0.037 0.781 0.032 0.764 0.022 0.759 0.017 0.756 0.00' +
  '7 0.753 -0.003 0.722 -0.004 0.722 0.006 0.722 0.01 0.721 0.02 0.719 0.029 0.717 0.044 0.717 0.057 0.718 0.12' +
  '1 0.719 0.215 0.72 0.225 0.736 0.26 0.739 0.267 0.744 0.278 0.746 0.286 0.752 0.304 0.755 0.31 0.766 0.324 0' +
  '.771 0.33 0.778 0.34 0.782 0.347 0.786 0.354 0.794 0.364 0.799 0.368 0.804 0.373 0.81 0.38 0.814 0.385 0.817' +
  ' 0.389 0.825 0.398 0.831 0.404 0.859 0.432 0.87 0.445 0.877 0.462 0.881 0.47 0.885 0.48 0.888 0.483 0.908 0.' +
  '516 0.913 0.566 0.899 0.61 0.885 0.654 0.874 0.678 0.862 0.69 0.856 0.696 0.848 0.705 0.844 0.71 0.839 0.716' +
  ' 0.832 0.721 0.826 0.725 0.82 0.728 0.812 0.733 0.809 0.736 0.795 0.749 0.784 0.754 0.752 0.761 0.742 0.763 ' +
  '0.727 0.767 0.719 0.769 0.68 0.782 0.663 0.78 0.627 0.755 0.599 0.738 0.578 0.708 0.569 0.676 0.563 0.655 0.' +
  '562 0.205 0.567 0.188 0.572 0.175 0.578 0.17 0.591 0.168 0.626 0.162 0.631 0.138 0.605 0.106 0.601 0.101 0.5' +
  '94 0.091 0.591 0.084 0.587 0.078 0.581 0.07 0.577 0.066 0.573 0.062 0.566 0.054 0.562 0.048 0.558 0.042 0.55' +
  '2 0.033 0.548 0.028 0.54 0.018 0.535 0.01 0.535 0.004 0.535 -0.005 0.48 -0.002 0.479 0.007 0.477 0.02 0.465 ' +
  '0.041 0.451 0.057 0.447 0.061 0.44 0.07 0.437 0.076 0.433 0.082 0.426 0.092 0.42 0.097 0.411 0.107 0.399 0.1' +
  '26 0.397 0.137 0.394 0.149 0.406 0.16 0.43 0.169 0.46 0.179 0.46 0.179 0.459 0.292 0.458 0.404 0.458 0.493 0' +
  '.459 0.585 0.459 0.668 0.46 0.665 0.446 0.697 0.433 0.725 0.419 0.741 0.394 0.758 0.358 0.782 0.348 0.783 0.' +
  '301 0.768 0.288 0.764 0.27 0.758 0.261 0.756 0.239 0.751 0.229 0.746 0.218 0.736 0.213 0.731 0.205 0.725 0.2' +
  ' 0.723 0.184 0.713 0.156 0.683 0.148 0.666 0.144 0.658 0.138 0.646 0.135 0.641 0.125 0.622 0.121 0.597 0.121' +
  ' 0.555 0.121 0.509 0.124 0.496 0.138 0.476 0.141 0.472 0.147 0.463 0.15 0.456 0.157 0.443 0.17 0.426 0.194 0' +
  '.403 0.201 0.395 0.21 0.386 0.213 0.382 0.216 0.378 0.223 0.37 0.228 0.364 0.234 0.358 0.242 0.347 0.246 0.3' +
  '4 0.251 0.332 0.258 0.322 0.262 0.317 0.272 0.306 0.275 0.299 0.28 0.28 0.282 0.273 0.287 0.259 0.292 0.25 0' +
  '.308 0.217 0.309 0.208 0.309 0.117 0.309 -0.004 0.31 0 0.285 0 0.27 0 0.264 0 0.264 0.002Z';

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
  zeichneDreizack(doc, mx, my - 4.4, 8.6, GOLD);
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
  zeichneDreizack(doc, W / 2, 21, 16, GOLD);
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
  if (dn.unterschriftPng) {
    try {
      // Über der Linie platziert, damit sie wie eine echte Unterschrift sitzt.
      doc.addImage(dn.unterschriftPng, 'PNG', 42, sigY - 20, 55, 18);
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
