// ============================================================================
// ARGONAUT OS · lib/wiedererkennung.ts — Paket C1 Teil 2 (16.10.2026)
// Auswertung der Besucher MIT Einwilligung (Cookie-Kennung, lib/cookieEinwilligung.ts):
//   · wie viele kommen wieder (an mindestens zwei Tagen)?
//   · über welchen Erst-Kanal / welche Kampagne kamen sie zum ERSTEN Mal —
//     und wie viele davon kamen an einem späteren Tag zurück?
//   · typische Wege über mehrere Tage („Anzeige → direkt")
// Eingang: je Besucher und Tag EINE Zeile (erster Aufruf des Tages), geliefert
// von der SQL-Funktion web_wiedererkennung (p407). Nur Summen nach außen —
// keine Einzel-Kennungen in der Anzeige.
//
// Keine Imports — node-testbar (tests/wiedererkennungC1b.test.mjs).
// ============================================================================

export type BesuchTag = {
  besucher_id: string;
  tag: string;               // YYYY-MM-DD (Berliner Tag)
  kanal?: string | null;     // direkt · organisch · bezahlt · social · verweis · email
  utm_quelle?: string | null;
  utm_kampagne?: string | null;
};

export type ErstKanal = { label: string; besucher: number; wiedergekommen: number; quote: number; tageBisRueckkehr: number | null };
export type Weg = { weg: string; anzahl: number };

export type Wiedererkennung = {
  besucher: number;          // Besucher mit Einwilligung im Zeitraum
  wiederkehrend: number;     // an >= 2 verschiedenen Tagen
  quote: number;             // Prozent, ganzzahlig
  besuchstageSchnitt: number; // Ø Besuchstage je Besucher, 1 Nachkomma
  erstKanal: ErstKanal[];
  erstKampagne: ErstKanal[];
  wege: Weg[];
};

/** Unter dieser Zahl zeigt die Anzeige keine Aufteilung (zu wenige für eine Aussage). */
export const MINDEST_BESUCHER = 5;

const KANAL_TEXT: Record<string, string> = {
  direkt: 'Direkt', organisch: 'Suchmaschine', bezahlt: 'Anzeige', social: 'Social Media', verweis: 'Verweis-Link', email: 'E-Mail',
};

export function kanalText(k: string | null | undefined): string {
  const t = (k || '').trim().toLowerCase();
  return KANAL_TEXT[t] ?? (t ? t : 'Unbekannt');
}

function tagNr(t: string): number {
  const ms = Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)));
  return Math.round(ms / 86400000);
}

const gerundet = (x: number, stellen = 0) => { const f = 10 ** stellen; return Math.round(x * f) / f; };

function gruppe(map: Map<string, { besucher: number; zurueck: number; tageSumme: number }>): ErstKanal[] {
  return [...map.entries()]
    .map(([label, g]) => ({
      label,
      besucher: g.besucher,
      wiedergekommen: g.zurueck,
      quote: g.besucher > 0 ? gerundet((g.zurueck / g.besucher) * 100) : 0,
      tageBisRueckkehr: g.zurueck > 0 ? gerundet(g.tageSumme / g.zurueck, 1) : null,
    }))
    .sort((a, b) => b.besucher - a.besucher || b.wiedergekommen - a.wiedergekommen || a.label.localeCompare(b.label));
}

export function auswerten(zeilen: BesuchTag[]): Wiedererkennung {
  const jeBesucher = new Map<string, Map<string, BesuchTag>>();
  for (const z of zeilen || []) {
    if (!z || typeof z.besucher_id !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(String(z.tag || ''))) continue;
    const tag = String(z.tag).slice(0, 10);
    let tage = jeBesucher.get(z.besucher_id);
    if (!tage) { tage = new Map(); jeBesucher.set(z.besucher_id, tage); }
    if (!tage.has(tag)) tage.set(tag, { ...z, tag }); // erster Eintrag je Tag zählt
  }
  const kanal = new Map<string, { besucher: number; zurueck: number; tageSumme: number }>();
  const kampagne = new Map<string, { besucher: number; zurueck: number; tageSumme: number }>();
  const wege = new Map<string, number>();
  let wiederkehrend = 0;
  let tageGesamt = 0;
  for (const tage of jeBesucher.values()) {
    const liste = [...tage.values()].sort((a, b) => a.tag.localeCompare(b.tag));
    tageGesamt += liste.length;
    const erst = liste[0];
    const zurueck = liste.length >= 2;
    if (zurueck) wiederkehrend += 1;
    const abstand = zurueck ? tagNr(liste[1].tag) - tagNr(erst.tag) : 0;
    const k = kanalText(erst.kanal);
    const gk = kanal.get(k) ?? { besucher: 0, zurueck: 0, tageSumme: 0 };
    gk.besucher += 1; if (zurueck) { gk.zurueck += 1; gk.tageSumme += abstand; }
    kanal.set(k, gk);
    const kam = (erst.utm_kampagne || '').trim() || (erst.utm_quelle || '').trim();
    if (kam) {
      const g = kampagne.get(kam) ?? { besucher: 0, zurueck: 0, tageSumme: 0 };
      g.besucher += 1; if (zurueck) { g.zurueck += 1; g.tageSumme += abstand; }
      kampagne.set(kam, g);
    }
    if (zurueck) {
      // Weg = Kanäle der Besuchstage, aufeinanderfolgende gleiche zusammengefasst, höchstens 4 Stationen.
      const stationen: string[] = [];
      for (const t of liste) { const x = kanalText(t.kanal); if (stationen[stationen.length - 1] !== x) stationen.push(x); }
      const weg = stationen.length > 4 ? [...stationen.slice(0, 3), '…', stationen[stationen.length - 1]] : stationen;
      const text = weg.length === 1 ? weg[0] + ' (mehrmals)' : weg.join(' → ');
      wege.set(text, (wege.get(text) ?? 0) + 1);
    }
  }
  const besucher = jeBesucher.size;
  return {
    besucher,
    wiederkehrend,
    quote: besucher > 0 ? gerundet((wiederkehrend / besucher) * 100) : 0,
    besuchstageSchnitt: besucher > 0 ? gerundet(tageGesamt / besucher, 1) : 0,
    erstKanal: gruppe(kanal),
    erstKampagne: gruppe(kampagne).slice(0, 10),
    wege: [...wege.entries()].map(([weg, anzahl]) => ({ weg, anzahl })).sort((a, b) => b.anzahl - a.anzahl || a.weg.localeCompare(b.weg)).slice(0, 8),
  };
}
