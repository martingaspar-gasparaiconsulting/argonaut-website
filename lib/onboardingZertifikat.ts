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
 * Zeichnet den ARGONAUT-Dreizack als Vektor — in exakt der Form der Wortmarke:
 * eine offene Schale, deren Arme oben nach innen eingehakt sind, davor die
 * mittlere Zinke mit Speerkopf, darunter Querbalken und Fuß.
 *
 * Kein Emoji, keine Bilddatei — damit das Zeichen in jedem PDF-Betrachter
 * identisch aussieht und beim Drucken gestochen scharf bleibt.
 *
 * @param mx  Mittelpunkt waagerecht
 * @param oy  Oberkante
 * @param h   Gesamthöhe
 */
function zeichneDreizack(doc: jsPDF, mx: number, oy: number, h: number, farbe: string): void {
  const b = h * 1.02;                       // Original ist nahezu quadratisch
  const dick = h * 0.115;                   // Strichstärke wie in der Wortmarke
  const px = (u: number) => mx - b / 2 + u * b;
  const py = (v: number) => oy + v * h;

  doc.setDrawColor(farbe);
  doc.setFillColor(farbe);
  doc.setLineWidth(dick);
  doc.setLineCap('round');
  doc.setLineJoin('round');

  // Schale: linker Widerhaken → linker Arm → Boden → rechter Arm → rechter
  // Widerhaken. jsPDF erwartet relative Strecken; wir rechnen sie aus absoluten
  // Punkten aus, damit die Form im Quelltext lesbar bleibt.
  const strecken: number[][] = [];
  let cu = 0.25;
  let cv = 0.17;
  const zuPunkt = (u: number, v: number) => {
    strecken.push([(u - cu) * b, (v - cv) * h]);
    cu = u; cv = v;
  };
  const zuKurve = (u1: number, v1: number, u2: number, v2: number, u: number, v: number) => {
    strecken.push([(u1 - cu) * b, (v1 - cv) * h, (u2 - cu) * b, (v2 - cv) * h, (u - cu) * b, (v - cv) * h]);
    cu = u; cv = v;
  };

  zuPunkt(0.10, 0.05);                                  // linker Widerhaken nach aussen oben
  zuKurve(0.005, 0.36, 0.055, 0.68, 0.255, 0.805);      // linker Arm in die Schale
  zuKurve(0.385, 0.885, 0.615, 0.885, 0.745, 0.805);    // Schalenboden
  zuKurve(0.945, 0.68, 0.995, 0.36, 0.90, 0.05);        // rechter Arm nach oben
  zuPunkt(0.75, 0.17);                                  // rechter Widerhaken nach innen

  doc.lines(strecken, px(0.25), py(0.17), [1, 1], 'S', false);

  // Mittlere Zinke: Schaft + Speerkopf
  doc.line(px(0.5), py(0.20), px(0.5), py(0.79));
  doc.triangle(px(0.5), py(0.015), px(0.415), py(0.175), px(0.585), py(0.175), 'F');

  // Querbalken und Fuss
  doc.setLineWidth(dick);
  doc.line(px(0.285), py(0.835), px(0.715), py(0.835));
  doc.setLineWidth(dick * 0.85);
  doc.line(px(0.385), py(0.935), px(0.615), py(0.935));

  doc.setLineCap('butt');
  doc.setLineJoin('miter');
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
    const SPALTEN_X = [32, 90, 148];
    const ZEILEN = 4;
    const PLATZ = SPALTEN_X.length * ZEILEN;              // 12 Einträge passen
    const zeigen = bereiche.slice(0, bereiche.length > PLATZ ? PLATZ - 1 : PLATZ);
    if (bereiche.length > PLATZ) zeigen.push(`u. a. ${bereiche.length - (PLATZ - 1)} weitere`);

    doc.setDrawColor(GOLD);
    doc.setLineWidth(0.3);
    doc.line(30, 141, 205, 141);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(NAVY);
    doc.text('B E H E R R S C H T E   B E R E I C H E', 30, 147.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    zeigen.forEach((b, i) => {
      const spalte = Math.floor(i / ZEILEN);
      const zeile = i % ZEILEN;
      const x = SPALTEN_X[spalte];
      const y = 154.5 + zeile * 5;
      doc.setTextColor(GOLD);
      doc.text('•', x, y);
      doc.setTextColor(GREY);
      // Zu lange Bezeichnungen werden gekürzt, damit die Spalten sauber bleiben.
      const t = (doc.splitTextToSize(b, 50) as string[])[0];
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

  // --- Stempel rechts, neben der Bereichsliste ------------------------------
  zeichneStempel(doc, 243, 161, 18);

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
