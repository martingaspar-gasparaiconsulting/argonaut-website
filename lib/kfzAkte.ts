// ============================================================================
// ARGONAUT OS · lib/kfzAkte.ts — Paket 261 (07.10.2026) · K2 Handelsakte
//
// Reine Logik für die Akte eines Bestandsfahrzeugs: Titel-Wächter fürs Inserat,
// Inserats-Ampel, fehlende Pflichtangaben (Energie/CO₂), Vorschlag der CO₂-
// Klasse, Ausstattungs-Katalog, Preisverlauf-Punkte.
//
// Rechtlich (Anwalt R45): Titel-Wächter und CO₂-Klasse sind HINWEISE, keine
// Rechtsprüfung. Die CO₂-Klasse wird nur vorgeschlagen, nie still gesetzt.
// KEINE Imports, KEINE Hooks, kein Date.now().
// ============================================================================

export type AkteFelder = {
  marke: string | null; modell: string | null; vk_brutto: number | null; status: string;
  kraftstoff: string | null; verbrauch_komb: number | null; verbrauch_einheit: string | null;
  co2_g_km: number | null; co2_klasse: string | null; vorschaden: string | null;
  inserat_titel: string | null; inserat_text: string | null; inseriert: boolean | null;
  ausstattung: string[] | null; fotos: number | null;
};

export type Hinweis = { stufe: 'ok' | 'warn' | 'bad'; text: string };

/** Elektro ohne Verbrennungsmotor (dann 0 g/km, Verbrauch in kWh). */
export function istElektro(kraftstoff: string | null | undefined): boolean {
  const k = String(kraftstoff ?? '').toLowerCase();
  return /elektro|bev|strom/.test(k) && !/hybrid|plug/.test(k);
}

/** Plug-in-Hybrid: eigene, gewichtete Klasse — hier kein Vorschlag. */
export function istPlugIn(kraftstoff: string | null | undefined): boolean {
  return /plug|phev/i.test(String(kraftstoff ?? ''));
}

/**
 * Vorschlag CO₂-Klasse nach g/km (Stufen der Pkw-Kennzeichnung seit 2024:
 * A 0 · B bis 95 · C bis 115 · D bis 135 · E bis 155 · F bis 175 · G darüber).
 * Plug-in-Hybride bekommen keinen Vorschlag (gewichtete Klasse). Ohne Wert null.
 */
export function co2KlasseVorschlag(g: number | null | undefined, kraftstoff?: string | null): string | null {
  if (istPlugIn(kraftstoff)) return null;
  if (g === null || g === undefined || !Number.isFinite(g) || g < 0) return null;
  if (g === 0) return 'A';
  if (g <= 95) return 'B';
  if (g <= 115) return 'C';
  if (g <= 135) return 'D';
  if (g <= 155) return 'E';
  if (g <= 175) return 'F';
  return 'G';
}

/** Welche Energie-/CO₂-Angaben fehlen fürs Inserat? (Nur Pkw-Sparten werden geprüft.) */
export function pflichtFehlt(a: Pick<AkteFelder, 'kraftstoff' | 'verbrauch_komb' | 'co2_g_km' | 'co2_klasse'>): string[] {
  const f: string[] = [];
  if (!String(a.kraftstoff ?? '').trim()) f.push('Kraftstoff bzw. Antrieb');
  if (a.verbrauch_komb === null || a.verbrauch_komb === undefined) f.push('Verbrauch kombiniert');
  if (a.co2_g_km === null || a.co2_g_km === undefined) f.push('CO₂-Emissionen (g/km)');
  if (!String(a.co2_klasse ?? '').trim()) f.push('CO₂-Klasse');
  return f;
}

const UEBERTREIBUNG = /\b(top|bestes?|einmalig|sensationell|wie neu|neuwertig|traumzustand|unschlagbar|schn[äa]ppchen)\b/i;

/** Titel-Wächter: Hinweise zum Inseratstitel. Leerer Titel = ein Hinweis, kein Absturz. */
export function titelPruefen(titel: string | null | undefined, vorschaden: string | null | undefined): Hinweis[] {
  const t = String(titel ?? '').trim();
  const h: Hinweis[] = [];
  if (!t) return [{ stufe: 'warn', text: 'Noch kein Titel. Vorschlag: Marke, Modell, Ausführung, Leistung.' }];
  if (/unfallfrei/i.test(t) && vorschaden !== 'keine_bekannt') {
    h.push({ stufe: 'bad', text: '„unfallfrei" nur, wenn in der Akte „Vorschäden: keine bekannt" bestätigt ist.' });
  }
  if (UEBERTREIBUNG.test(t)) h.push({ stufe: 'warn', text: 'Werbliche Übertreibung im Titel. Sachlich bleiben wirkt seriöser.' });
  if (/[A-ZÄÖÜ]{6,}/.test(t)) h.push({ stufe: 'warn', text: 'Großbuchstaben-Blöcke wirken wie Werbegeschrei und werden von Börsen teils gekürzt.' });
  if (/!{2,}|\?{2,}/.test(t)) h.push({ stufe: 'warn', text: 'Mehrere Ausrufe- oder Fragezeichen hintereinander.' });
  if (t.length > 60) h.push({ stufe: 'warn', text: `Titel hat ${t.length} Zeichen. Viele Börsen zeigen nur etwa 60.` });
  if (/garantie/i.test(t)) h.push({ stufe: 'warn', text: '„Garantie" im Titel nur, wenn eine echte Garantie mit Bedingungen vorliegt (nicht mit Gewährleistung verwechseln).' });
  if (!h.length) h.push({ stufe: 'ok', text: 'Titel sachlich, keine Auffälligkeiten.' });
  return h;
}

/** Titelvorschlag aus den Stammdaten (keine erfundenen Eigenschaften). */
export function titelVorschlag(b: { marke: string | null; modell: string | null; variante: string | null; ps: number | null; kraftstoff: string | null }): string {
  return [b.marke, b.modell, b.variante].filter(Boolean).join(' ')
    + (b.ps ? ` | ${b.ps} PS` : '') + (b.kraftstoff ? ` | ${b.kraftstoff}` : '');
}

export type Ampel = { prozent: number; stufe: 'ok' | 'warn' | 'bad'; punkte: { name: string; ok: boolean; hinweis: string }[] };

/**
 * Inserats-Ampel: wie fertig ist das Inserat? Gewichte: Fotos 30, Pflichtangaben 25,
 * Titel 15, Beschreibung 15, Preis 10, Ausstattung 5. Grün ab 80, gelb ab 55.
 */
export function inseratAmpel(a: AkteFelder): Ampel {
  const fotos = a.fotos ?? 0;
  const titelHinweise = titelPruefen(a.inserat_titel, a.vorschaden);
  const punkte = [
    { name: 'Fotos', gewicht: 30, ok: fotos >= 12, teil: fotos > 0 ? Math.min(1, fotos / 12) : 0, hinweis: fotos >= 12 ? `${fotos} Fotos` : `${fotos} von empfohlen 12+` },
    { name: 'Energie und CO₂', gewicht: 25, ok: pflichtFehlt(a).length === 0, teil: pflichtFehlt(a).length === 0 ? 1 : 0, hinweis: pflichtFehlt(a).length ? `fehlt: ${pflichtFehlt(a).join(', ')}` : 'vollständig' },
    { name: 'Titel', gewicht: 15, ok: titelHinweise.every((x) => x.stufe === 'ok'), teil: titelHinweise.some((x) => x.stufe === 'bad') || !String(a.inserat_titel ?? '').trim() ? 0 : titelHinweise.every((x) => x.stufe === 'ok') ? 1 : 0.5, hinweis: titelHinweise[0].text },
    { name: 'Beschreibung', gewicht: 15, ok: String(a.inserat_text ?? '').trim().length >= 200, teil: Math.min(1, String(a.inserat_text ?? '').trim().length / 200), hinweis: `${String(a.inserat_text ?? '').trim().length} Zeichen (empfohlen 200+)` },
    { name: 'Preis', gewicht: 10, ok: !!a.vk_brutto && a.vk_brutto > 0, teil: a.vk_brutto && a.vk_brutto > 0 ? 1 : 0, hinweis: a.vk_brutto ? 'gesetzt' : 'fehlt' },
    { name: 'Ausstattung', gewicht: 5, ok: (a.ausstattung?.length ?? 0) >= 5, teil: Math.min(1, (a.ausstattung?.length ?? 0) / 5), hinweis: `${a.ausstattung?.length ?? 0} Merkmale` },
  ];
  const prozent = Math.round(punkte.reduce((s, p) => s + p.gewicht * p.teil, 0));
  return { prozent, stufe: prozent >= 80 ? 'ok' : prozent >= 55 ? 'warn' : 'bad', punkte: punkte.map(({ name, ok, hinweis }) => ({ name, ok, hinweis })) };
}

/** Ausstattungs-Katalog (Merkmale zum Anklicken). Eigene Merkmale sind zusätzlich erlaubt. */
export const AUSSTATTUNG: { gruppe: string; merkmale: string[] }[] = [
  { gruppe: 'Komfort', merkmale: ['Klimaautomatik', 'Sitzheizung vorn', 'Sitzheizung hinten', 'Lenkradheizung', 'Standheizung', 'Keyless Go', 'Elektrische Heckklappe', 'Panoramadach', 'Schiebedach', 'Massagesitze', 'Sitzbelüftung', 'Memory-Sitze'] },
  { gruppe: 'Assistenz', merkmale: ['Adaptive Geschwindigkeitsregelung', 'Spurhalteassistent', 'Totwinkelassistent', 'Einparkhilfe vorn und hinten', 'Rückfahrkamera', '360°-Kamera', 'Head-up-Display', 'Verkehrszeichenerkennung', 'Notbremsassistent', 'Parkassistent'] },
  { gruppe: 'Licht und Sicht', merkmale: ['LED-Scheinwerfer', 'Matrix-LED', 'Laserlicht', 'Kurvenlicht', 'Regensensor', 'Ambientebeleuchtung'] },
  { gruppe: 'Multimedia', merkmale: ['Navigationssystem', 'Apple CarPlay', 'Android Auto', 'Soundsystem', 'Digitales Cockpit', 'Induktives Laden', 'DAB-Radio'] },
  { gruppe: 'Technik und Sonstiges', merkmale: ['Anhängerkupplung', 'Allradantrieb', 'Luftfederung', 'Sportfahrwerk', 'Sportabgasanlage', 'Sportsitze', 'Leichtmetallfelgen', 'Winterräder', 'Scheckheftgepflegt', 'Nichtraucherfahrzeug'] },
];

/** Merkmale bereinigen: trimmen, leere weg, Doppelte (Groß/Klein egal) weg, Reihenfolge bleibt. */
export function merkmaleBereinigen(liste: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const aus: string[] = [];
  for (const m of liste) {
    const t = String(m ?? '').trim().slice(0, 60);
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k); aus.push(t);
  }
  return aus;
}

export type PreisEintrag = { vk_alt: number | null; vk_neu: number | null; geaendert_am: string };

/** Preisverlauf zu Punkten (älteste zuerst) + Summe der Senkungen seit dem ersten Preis. */
export function preisVerlauf(eintraege: PreisEintrag[]): { punkte: { am: string; preis: number }[]; gesenkt: number | null } {
  const p = [...eintraege]
    .filter((e) => e.vk_neu !== null && Number.isFinite(Number(e.vk_neu)))
    .sort((a, b) => a.geaendert_am.localeCompare(b.geaendert_am))
    .map((e) => ({ am: e.geaendert_am.slice(0, 10), preis: Number(e.vk_neu) }));
  if (p.length < 2) return { punkte: p, gesenkt: null };
  return { punkte: p, gesenkt: Math.round(p[0].preis - p[p.length - 1].preis) };
}
