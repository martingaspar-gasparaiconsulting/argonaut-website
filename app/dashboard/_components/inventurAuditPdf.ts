// ============================================================================
// ARGONAUT OS · ERP · Inventur-Audit-Protokoll (GoBD) — PDF-Generator
// ----------------------------------------------------------------------------
// Erstellt ein PDF aus den unveraenderbaren Bestandskorrekturen (inventur_audit).
// Eigenstaendig, damit die bestehende inventurProtokollPdf.ts (Zaehl-Protokoll)
// unberuehrt bleibt. Firmenkopf aus "profiles". jsPDF wie im restlichen Projekt.
// Branding: ARGONAUT / "die KI" – nie "Claude".
// ============================================================================
import { jsPDF } from "jspdf";

export type AuditPdfFirma = {
  name: string | null;
  rechtsform: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  email: string | null;
  website: string | null;
  ustId: string | null;
  steuernummer: string | null;
  geschaeftsfuehrer: string | null;
  akzentfarbe: string | null;
};

export type AuditEintrag = {
  artikel_name: string;
  artikelnummer: string | null;
  einheit: string | null;
  soll_bestand: number;
  ist_bestand: number;
  differenz: number;
  wert_differenz: number | null;
  korrigiert_am: string; // ISO
  korrigiert_von: string | null;
};

export type AuditPdfDaten = {
  firma: AuditPdfFirma;
  zeitraumLabel: string; // z.B. "Dieses Jahr" oder "Gesamter Zeitraum"
  eintraege: AuditEintrag[];
};

function hexRgb(hex: string | null | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!hex) return fallback;
  const m = hex.replace("#", "").match(/^([0-9a-fA-F]{6})$/);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function euro(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
}
function zahl(n: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
}
function dtLang(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
function kuerze(doc: jsPDF, txt: string, maxB: number): string {
  if (doc.getTextWidth(txt) <= maxB) return txt;
  let s = txt;
  while (s.length > 1 && doc.getTextWidth(s + "…") > maxB) s = s.slice(0, -1);
  return s + "…";
}

export function baueAuditDoc(d: AuditPdfDaten): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const akzent = hexRgb(d.firma.akzentfarbe, [201, 168, 76]);
  const rot: [number, number, number] = [200, 60, 60];
  const gruen: [number, number, number] = [40, 140, 90];
  const grau: [number, number, number] = [110, 120, 135];
  const dunkel: [number, number, number] = [20, 30, 45];

  const seiteB = doc.internal.pageSize.getWidth();
  const seiteH = doc.internal.pageSize.getHeight();
  const randL = 15;
  const randR = seiteB - 15;
  let y = 18;

  // ── Kopf: Akzentbalken + Firmenname ──
  doc.setFillColor(akzent[0], akzent[1], akzent[2]);
  doc.rect(0, 0, seiteB, 4, "F");

  doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const firmenName = d.firma.name?.trim() || "Mein Unternehmen";
  doc.text(firmenName, randL, y);
  if (d.firma.rechtsform?.trim()) {
    const nameBreite = doc.getTextWidth(firmenName);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(grau[0], grau[1], grau[2]);
    doc.text(d.firma.rechtsform.trim(), randL + nameBreite + 3, y);
  }

  // Rechtsbündige Firmen-Metazeilen
  let yR = 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(grau[0], grau[1], grau[2]);
  const rechtsZeile = (t: string) => { doc.text(t, randR, yR, { align: "right" }); yR += 4; };
  if (d.firma.ustId?.trim()) rechtsZeile(`USt-IdNr.: ${d.firma.ustId.trim()}`);
  if (d.firma.steuernummer?.trim()) rechtsZeile(`Steuer-Nr.: ${d.firma.steuernummer.trim()}`);
  if (d.firma.geschaeftsfuehrer?.trim()) rechtsZeile(`GF: ${d.firma.geschaeftsfuehrer.trim()}`);

  y += 6;
  doc.setFontSize(8.5);
  doc.setTextColor(grau[0], grau[1], grau[2]);
  const adresse = [d.firma.strasse?.trim(), [d.firma.plz?.trim(), d.firma.ort?.trim()].filter(Boolean).join(" ")]
    .filter(Boolean).join(" · ");
  if (adresse) { doc.text(adresse, randL, y); y += 4; }
  const kontakt = [d.firma.telefon?.trim(), d.firma.email?.trim(), d.firma.website?.trim()]
    .filter(Boolean).join(" · ");
  if (kontakt) { doc.text(kontakt, randL, y); y += 4; }

  // ── Titel ──
  y += 6;
  doc.setDrawColor(230, 232, 236);
  doc.line(randL, y, randR, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
  doc.text("Inventur · Bestandskorrektur-Protokoll (GoBD)", randL, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(grau[0], grau[1], grau[2]);
  doc.text(`Zeitraum: ${d.zeitraumLabel}`, randL, y);
  const erstellt = new Date().toLocaleString("de-DE", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  doc.text(`Erstellt: ${erstellt}`, randR, y, { align: "right" });
  y += 4;
  doc.text(`Eintraege: ${d.eintraege.length}`, randL, y);
  y += 8;

  // ── Tabellenkopf ──
  const spalten = [
    { t: "Zeitpunkt", x: randL, w: 30 },
    { t: "Artikel", x: randL + 30, w: 46 },
    { t: "Soll", x: randL + 76, w: 16, r: true },
    { t: "Ist", x: randL + 92, w: 16, r: true },
    { t: "Diff.", x: randL + 108, w: 16, r: true },
    { t: "Wert-Diff.", x: randL + 124, w: 24, r: true },
    { t: "Von", x: randL + 148, w: 32 },
  ];
  const zeichneKopf = () => {
    doc.setFillColor(akzent[0], akzent[1], akzent[2]);
    doc.rect(randL, y - 4, randR - randL, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    for (const c of spalten) {
      doc.text(c.t, c.r ? c.x + c.w - 1 : c.x + 1, y, { align: c.r ? "right" : "left" });
    }
    y += 6;
  };
  zeichneKopf();

  // ── Zeilen ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  let zebra = false;
  for (const e of d.eintraege) {
    if (y > seiteH - 20) {
      doc.addPage();
      y = 18;
      zeichneKopf();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
    }
    if (zebra) {
      doc.setFillColor(246, 247, 249);
      doc.rect(randL, y - 4, randR - randL, 6, "F");
    }
    zebra = !zebra;

    const artikelTxt = e.artikelnummer ? `${e.artikel_name} (${e.artikelnummer})` : e.artikel_name;
    const einheit = e.einheit ? ` ${e.einheit}` : "";
    const diffFarbe: [number, number, number] = e.differenz === 0 ? grau : e.differenz > 0 ? gruen : rot;

    doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
    doc.text(kuerze(doc, dtLang(e.korrigiert_am), spalten[0].w - 2), spalten[0].x + 1, y);
    doc.text(kuerze(doc, artikelTxt, spalten[1].w - 2), spalten[1].x + 1, y);
    doc.text(`${zahl(e.soll_bestand)}${einheit}`, spalten[2].x + spalten[2].w - 1, y, { align: "right" });
    doc.text(`${zahl(e.ist_bestand)}${einheit}`, spalten[3].x + spalten[3].w - 1, y, { align: "right" });
    doc.setTextColor(diffFarbe[0], diffFarbe[1], diffFarbe[2]);
    const diffStr = (e.differenz > 0 ? "+" : "") + zahl(e.differenz);
    doc.text(diffStr, spalten[4].x + spalten[4].w - 1, y, { align: "right" });
    doc.text(euro(e.wert_differenz), spalten[5].x + spalten[5].w - 1, y, { align: "right" });
    doc.setTextColor(grau[0], grau[1], grau[2]);
    doc.text(kuerze(doc, e.korrigiert_von || "—", spalten[6].w - 2), spalten[6].x + 1, y);
    y += 6;
  }

  // ── Fußzeile GoBD-Hinweis ──
  const gesamtWert = d.eintraege.reduce((s, e) => s + (e.wert_differenz ?? 0), 0);
  y += 2;
  doc.setDrawColor(230, 232, 236);
  doc.line(randL, y, randR, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
  doc.text(`Summe Wert-Differenz: ${euro(gesamtWert)}`, randR, y, { align: "right" });
  y += 8;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(grau[0], grau[1], grau[2]);
  const hinweis =
    "GoBD-Hinweis: Dieses Protokoll dokumentiert unveraenderbar alle Bestandskorrekturen der Inventur " +
    "(Grundsaetze zur ordnungsmaessigen Fuehrung und Aufbewahrung von Buechern, Aufzeichnungen und Unterlagen " +
    "in elektronischer Form). Die Eintraege koennen im System weder geaendert noch geloescht werden.";
  const zeilen = doc.splitTextToSize(hinweis, randR - randL);
  doc.text(zeilen, randL, y);

  // Seitenzahlen
  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(grau[0], grau[1], grau[2]);
    doc.text(`Seite ${i} / ${seiten}`, randR, seiteH - 8, { align: "right" });
    doc.text("Erstellt mit ARGONAUT OS", randL, seiteH - 8);
  }
  return doc;
}

export function erstelleAuditProtokollPdf(d: AuditPdfDaten): void {
  const doc = baueAuditDoc(d);
  const nameDatei = (d.firma.name || "Firma").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const datum = new Date().toISOString().slice(0, 10);
  doc.save(`Inventur-Korrektur-Protokoll_${nameDatei}_${datum}.pdf`);
}
