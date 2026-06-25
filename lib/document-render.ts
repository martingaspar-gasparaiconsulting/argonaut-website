// lib/document-render.ts
// ARGONAUT OS — Render-Schicht: Template + Daten -> Engine-Eingaben
// Wandelt ein DocumentTemplate + Nutzerdaten in das Format um, das
// buildDocx / buildXlsx aus lib/document-engine.ts erwarten.
// -----------------------------------------------------------------------------
import { getTemplate, type DocumentTemplate } from "@/lib/document-templates";
import type { DocxParagraph, XlsxColumn } from "@/lib/document-engine";

const CONTENT_TYPES: Record<"pdf" | "docx" | "xlsx" | "pptx", string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// Ergebnis-Typen ---------------------------------------------------------------
export type RenderErgebnis =
  | {
      kind: "paragraphs"; // pdf oder docx -> buildDocx (+ docxToPdf bei pdf)
      typ: "pdf" | "docx";
      name: string;
      filename: string;
      contentType: string;
      title: string;
      paragraphs: DocxParagraph[];
    }
  | {
      kind: "tabelle"; // xlsx -> buildXlsx
      typ: "xlsx";
      name: string;
      filename: string;
      contentType: string;
      sheetName: string;
      columns: XlsxColumn[];
      rows: Record<string, any>[];
    }
  | {
      kind: "slides"; // pptx -> buildPptx
      typ: "pptx";
      name: string;
      filename: string;
      contentType: string;
      title: string;
      slides: { title: string; bullets?: string[]; subtitle?: string }[];
      branding?: { primary?: string; accent?: string; logoText?: string };
    };

// Hilfsfunktionen --------------------------------------------------------------
function formatBetrag(v: unknown): string {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  if (Number.isNaN(n)) return String(v ?? "");
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function formatWert(typ: string, v: unknown): string {
  if (typ === "betrag") return formatBetrag(v);
  return String(v ?? "");
}

function positionZeile(it: unknown): string {
  if (it === null || it === undefined) return "";
  if (typeof it === "object") {
    return "• " + Object.values(it as Record<string, unknown>).map((x) => String(x)).join("  ·  ");
  }
  return "• " + String(it);
}

function dokumentName(tpl: DocumentTemplate, data: Record<string, any>): string {
  const ref =
    data.kunde_name ??
    data.arbeitnehmer_name ??
    data.partner_name ??
    data.empfaenger_name ??
    data.angebot_nummer ??
    data.rechnung_nummer ??
    "";
  return ref ? `${tpl.name} - ${ref}` : tpl.name;
}

// Prüft, welche Pflichtfelder fehlen (für den Chat in Schritt 3 nützlich) ------
export function pflichtfelderFehlen(templateId: string, data: Record<string, any>): string[] {
  const tpl = getTemplate(templateId);
  if (!tpl) return ["Unbekanntes Template: " + templateId];
  return tpl.felder
    .filter((f) => f.pflicht && (data[f.key] === undefined || data[f.key] === null || data[f.key] === ""))
    .map((f) => f.label);
}

// Hauptfunktion ----------------------------------------------------------------
export function renderDocument(templateId: string, data: Record<string, any>): RenderErgebnis {
  const tpl = getTemplate(templateId);
  if (!tpl) throw new Error("Unbekanntes Template: " + templateId);

  const fehlend = pflichtfelderFehlen(templateId, data);
  if (fehlend.length > 0) {
    throw new Error("Pflichtfelder fehlen: " + fehlend.join(", "));
  }

  const name = dokumentName(tpl, data);
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${safe}.${tpl.format}`;
  const contentType = CONTENT_TYPES[tpl.format];

  // pptx: Folien aus den Feldern + Kunden-Branding -------------------
  if (tpl.format === "pptx") {
    const BRAND_KEYS = ["primary", "accent", "logoText", "primarfarbe", "akzentfarbe", "logo"];
    const norm = (k: string) => k.toLowerCase().replace(/[_\s]/g, "");
    const get = (names: string[]) => {
      for (const f of tpl.felder) {
        if (names.some((n) => norm(n) === norm(f.key)) && data[f.key]) return String(data[f.key]);
      }
      return undefined;
    };
    const branding = {
      primary: get(["primary", "primarfarbe"]),
      accent: get(["accent", "akzentfarbe"]),
      logoText: get(["logoText", "logo"]),
    };
    const slides = tpl.felder
      .filter((f) => !BRAND_KEYS.some((n) => norm(n) === norm(f.key)))
      .map((f) => {
        const v = data[f.key];
        const bullets = Array.isArray(v)
          ? v.map((x) => String(x))
          : String(v ?? "").split(/\n|;/).map((s) => s.trim()).filter(Boolean);
        return { title: f.label, bullets };
      });
    return { kind: "slides", typ: "pptx", name, filename, contentType, title: tpl.name, slides, branding };
  }


  // xlsx: eine Zeile aus den Feldern -------------------------------------------
  if (tpl.format === "xlsx") {
    const columns: XlsxColumn[] = tpl.felder.map((f) => ({ header: f.label, key: f.key, width: 24 }));
    const row: Record<string, any> = {};
    tpl.felder.forEach((f) => {
      row[f.key] = formatWert(f.typ, data[f.key]);
    });
    return { kind: "tabelle", typ: "xlsx", name, filename, contentType, sheetName: tpl.name, columns, rows: [row] };
  }

  // pdf / docx: Titel + Paragraphen --------------------------------------------
  const paragraphs: DocxParagraph[] = [];
  for (const f of tpl.felder) {
    const v = data[f.key];
    if (v === undefined || v === null || v === "") continue;

    if (f.typ === "liste") {
      paragraphs.push({ text: f.label, heading: true });
      const items = Array.isArray(v) ? v : [v];
      for (const it of items) paragraphs.push({ text: positionZeile(it) });
      continue;
    }
    if (f.typ === "mehrzeilig") {
      paragraphs.push({ text: f.label + ":", bold: true });
      for (const line of String(v).split("\n")) paragraphs.push({ text: line });
      continue;
    }
    paragraphs.push({ text: f.label + ": " + formatWert(f.typ, v) });
  }

  return { kind: "paragraphs", typ: tpl.format, name, filename, contentType, title: tpl.name, paragraphs };
}
