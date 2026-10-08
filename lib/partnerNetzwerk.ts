// ============================================================================
// ARGONAUT OS · lib/partnerNetzwerk.ts — Paket 278 (08.10.2026) · K18 Partner-Netzwerk
//
// Reine Logik (keine Imports, node-getestet) für die Partner-Brücke:
// Betriebe verbinden sich per Einladungs-Code, geben Aufträge an einem
// Fahrzeug an einen Partner (Lackierer, Aufbereiter, Gutachter …), beide
// Seiten schreiben Einträge mit Fotos — nicht änderbar.
//
// Die Sicherheit steckt in der Datenbank (supabase-sql/p278-partner-netzwerk.sql):
// Funktionen p278_* sind der einzige Weg für den Partner an die Daten, Status-
// wechsel prüft der Auslöser p278_auftrag_pruefen. Diese Datei spiegelt die
// Regeln nur für die Oberfläche (welche Knöpfe, welche Texte) — sie gewährt nichts.
// ============================================================================

export type AuftragStatus = 'offen' | 'angenommen' | 'abgelehnt' | 'fertig' | 'beendet' | 'storniert';
export type Seite = 'auftraggeber' | 'partner';
export type VerbindungStatus = 'anfrage' | 'angenommen' | 'getrennt' | 'zurueckgezogen';

export const AUFTRAG_STATUS: { key: AuftragStatus; name: string; stufe: 'info' | 'warn' | 'ok' | 'dim' | 'bad' }[] = [
  { key: 'offen', name: 'Offen — wartet auf den Partner', stufe: 'warn' },
  { key: 'angenommen', name: 'In Arbeit beim Partner', stufe: 'info' },
  { key: 'fertig', name: 'Fertig gemeldet — bitte abnehmen', stufe: 'ok' },
  { key: 'beendet', name: 'Abgenommen und beendet', stufe: 'dim' },
  { key: 'abgelehnt', name: 'Vom Partner abgelehnt', stufe: 'bad' },
  { key: 'storniert', name: 'Storniert', stufe: 'dim' },
];

export const LAUFEND: AuftragStatus[] = ['offen', 'angenommen', 'fertig'];
export const ABGESCHLOSSEN: AuftragStatus[] = ['abgelehnt', 'beendet', 'storniert'];

export function statusName(s: unknown): string {
  return AUFTRAG_STATUS.find((x) => x.key === s)?.name ?? String(s ?? '—');
}
export function statusStufe(s: unknown): string {
  return AUFTRAG_STATUS.find((x) => x.key === s)?.stufe ?? 'dim';
}
export function laeuft(s: unknown): boolean {
  return LAUFEND.includes(s as AuftragStatus);
}

export type Aktion = { neu: AuftragStatus; text: string; grund: 'nein' | 'optional' | 'pflicht'; rueckfrage: string | null };

/**
 * Welche Statusknöpfe sieht welche Seite? Spiegel von p278_auftrag_pruefen.
 * Ist die Verbindung getrennt, laufen Aufträge ohnehin auf „storniert" (p278_trennen).
 */
export function aktionen(seite: Seite, status: unknown, darfSchreiben: boolean): Aktion[] {
  if (!darfSchreiben) return [];
  if (seite === 'partner') {
    if (status === 'offen') return [
      { neu: 'angenommen', text: 'Auftrag annehmen', grund: 'nein', rueckfrage: null },
      { neu: 'abgelehnt', text: 'Ablehnen', grund: 'pflicht', rueckfrage: 'Auftrag wirklich ablehnen? Danach endet Ihr Zugriff auf das Fahrzeug.' },
    ];
    if (status === 'angenommen') return [{ neu: 'fertig', text: 'Fertig melden', grund: 'optional', rueckfrage: null }];
    return [];
  }
  if (status === 'offen' || status === 'angenommen') return [
    { neu: 'storniert', text: 'Stornieren', grund: 'optional', rueckfrage: 'Auftrag stornieren? Der Partner sieht das Fahrzeug danach nicht mehr.' },
  ];
  if (status === 'fertig') return [
    { neu: 'beendet', text: 'Abnehmen und beenden', grund: 'nein', rueckfrage: 'Arbeit abnehmen? Danach endet der Zugriff des Partners — Einträge bleiben erhalten.' },
    { neu: 'angenommen', text: 'Nachbesserung anfordern', grund: 'pflicht', rueckfrage: null },
  ];
  return [];
}

/** Grund-Eingabe zur Aktion prüfen. */
export function grundPruefen(a: Aktion, grund: unknown): { ok: true; grund: string | null } | { ok: false; fehler: string } {
  const g = typeof grund === 'string' ? grund.trim() : '';
  if (g.length > 300) return { ok: false, fehler: 'Der Grund darf höchstens 300 Zeichen haben.' };
  if (a.grund === 'pflicht' && !g) return { ok: false, fehler: 'Bitte kurz den Grund angeben.' };
  if (a.grund === 'nein') return { ok: true, grund: null };
  return { ok: true, grund: g || null };
}

// --- Einladungs-Code ------------------------------------------------------------------------

/** „3f9a 0c21-b7d4" -> „3F9A-0C21-B7D4"; null, wenn es keine 12 Zeichen 0-9/A-F sind. */
export function codeNorm(roh: unknown): string | null {
  const s = (typeof roh === 'string' ? roh : '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (s.length !== 12) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export type Verbindung = {
  id: string; anfrager_betrieb: string; partner_betrieb: string | null; anfrager_name: string | null; partner_name: string | null;
  code: string | null; code_bis: string | null; notiz: string | null; status: VerbindungStatus | string;
  erstellt_am: string; angenommen_am: string | null; getrennt_am: string | null;
};

export type VerbindungLage = 'verbunden' | 'einladung_offen' | 'einladung_abgelaufen' | 'getrennt' | 'zurueckgezogen';

/** Lage einer Verbindung aus Sicht des eigenen Betriebs. */
export function verbindungLage(v: Pick<Verbindung, 'status' | 'code_bis'>, jetztIso: string): VerbindungLage {
  if (v.status === 'angenommen') return 'verbunden';
  if (v.status === 'getrennt') return 'getrennt';
  if (v.status === 'zurueckgezogen') return 'zurueckgezogen';
  return v.code_bis && v.code_bis > jetztIso ? 'einladung_offen' : 'einladung_abgelaufen';
}

/** Name des ANDEREN Betriebs. */
export function partnerName(v: Pick<Verbindung, 'anfrager_betrieb' | 'anfrager_name' | 'partner_name'>, ich: string | null): string {
  const n = v.anfrager_betrieb === ich ? v.partner_name : v.anfrager_name;
  return (n ?? '').trim() || 'Partner-Betrieb';
}

/** Kennung des ANDEREN Betriebs (null bei offener Einladung). */
export function partnerBetrieb(v: Pick<Verbindung, 'anfrager_betrieb' | 'partner_betrieb'>, ich: string | null): string | null {
  return v.anfrager_betrieb === ich ? v.partner_betrieb : v.anfrager_betrieb;
}

/** Verbundene Partner für die Auswahl beim Auftrag (nur bestehende Verbindungen, alphabetisch, ohne Doppelte). */
export function partnerAuswahl(liste: Verbindung[], ich: string | null): { betrieb: string; name: string }[] {
  const m = new Map<string, string>();
  for (const v of liste) {
    if (v.status !== 'angenommen') continue;
    const b = partnerBetrieb(v, ich);
    if (b && b !== ich && !m.has(b)) m.set(b, partnerName(v, ich));
  }
  return [...m.entries()].map(([betrieb, name]) => ({ betrieb, name })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Einladungstext zum Weitergeben (Mail, WhatsApp). Sie-Form, kein Werbetext. */
export function einladungsText(firma: string, code: string, bisIso: string): string {
  const d = bisIso.slice(0, 10).split('-');
  const bis = d.length === 3 ? `${d[2]}.${d[1]}.${d[0]}` : bisIso;
  return [
    `${firma.trim() || 'Ein Betrieb'} möchte sich in ARGONAUT OS mit Ihnen als Partner verbinden.`,
    `Ihr Code: ${code} (gültig bis ${bis}).`,
    'So geht es: In ARGONAUT OS unter Kfz → Partner-Netzwerk den Code eingeben. Verbinden kann nur die Geschäftsleitung; die Verbindung lässt sich jederzeit trennen.',
  ].join('\n');
}

// --- Auftrag anlegen ----------------------------------------------------------------------------

export type AuftragEingabe = {
  partner_betrieb?: unknown; titel?: unknown; beschreibung?: unknown; faellig_am?: unknown;
  freigabe_fotos?: unknown; freigabe_fin?: unknown; freigabe_km?: unknown;
};
export type AuftragFelder = {
  partner_betrieb: string; titel: string; beschreibung: string | null; faellig_am: string | null;
  freigabe_fotos: boolean; freigabe_fin: boolean; freigabe_km: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function istUuid(x: unknown): x is string { return typeof x === 'string' && UUID.test(x); }

export function auftragPruefen(e: AuftragEingabe, heute: string): { ok: true; felder: AuftragFelder } | { ok: false; fehler: string } {
  if (!istUuid(e.partner_betrieb)) return { ok: false, fehler: 'Bitte einen verbundenen Partner wählen.' };
  const titel = typeof e.titel === 'string' ? e.titel.trim() : '';
  if (!titel) return { ok: false, fehler: 'Bitte kurz sagen, was der Partner tun soll.' };
  if (titel.length > 120) return { ok: false, fehler: 'Der Titel darf höchstens 120 Zeichen haben.' };
  const b = typeof e.beschreibung === 'string' ? e.beschreibung.trim() : '';
  if (b.length > 1000) return { ok: false, fehler: 'Die Beschreibung darf höchstens 1.000 Zeichen haben.' };
  const f = typeof e.faellig_am === 'string' ? e.faellig_am.trim() : '';
  if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) return { ok: false, fehler: 'Das Datum ist ungültig.' };
  if (f && f < heute) return { ok: false, fehler: 'Der Termin liegt in der Vergangenheit.' };
  return {
    ok: true,
    felder: {
      partner_betrieb: e.partner_betrieb, titel, beschreibung: b || null, faellig_am: f || null,
      freigabe_fotos: e.freigabe_fotos === true, freigabe_fin: e.freigabe_fin === true, freigabe_km: e.freigabe_km !== false,
    },
  };
}

/** Was der Partner sehen wird — für die Vorschau beim Anlegen (Spiegel von p278_eingang_detail). */
export function partnerSieht(f: Pick<AuftragFelder, 'freigabe_fotos' | 'freigabe_fin' | 'freigabe_km'>): { sieht: string[]; nie: string[] } {
  const sieht = ['Marke, Modell, Ausführung', 'Farbe und Farbcode', 'Erstzulassung, Kraftstoff, Leistung', 'Ihren Auftragstext'];
  if (f.freigabe_km) sieht.push('Kilometerstand');
  if (f.freigabe_fin) sieht.push('Fahrgestellnummer (FIN)');
  if (f.freigabe_fotos) sieht.push('Fahrzeugfotos');
  return { sieht, nie: ['Einkaufs- und Verkaufspreis', 'Kunde und Käufer', 'Kennzeichen', 'interne Notizen und Kalkulation'] };
}

/** Überfällig? (Termin vorbei, Auftrag läuft noch und ist nicht fertig gemeldet) */
export function ueberfaellig(a: { status: unknown; faellig_am: string | null }, heute: string): boolean {
  return (a.status === 'offen' || a.status === 'angenommen') && !!a.faellig_am && a.faellig_am < heute;
}

// --- Fotos ---------------------------------------------------------------------------------------

export const FOTO_MAX_BYTES = 4 * 1024 * 1024;   // unter der Vercel-Grenze je Anfrage (4,5 MB)
export const FOTOS_JE_EINTRAG = 10;
export const ABLAGE_BUCKET = 'partner-ablage';

/** Bildart aus den ersten Bytes — nie aus Dateiname oder Angabe des Browsers. */
export function bildArt(b: Uint8Array): 'jpg' | 'png' | 'webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

export const MIME: Record<'jpg' | 'png' | 'webp', string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Pfad im Ablage-Ordner: <ziel aus p278_ablage_ziel><uuid>.<art>. Ziel muss „<uuid>/<uuid>/" sein. */
export function ablagePfad(ziel: unknown, id: string, art: 'jpg' | 'png' | 'webp'): string | null {
  if (typeof ziel !== 'string' || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/$/i.test(ziel)) return null;
  if (!istUuid(id)) return null;
  return `${ziel}${id.toLowerCase()}.${art}`;
}

// --- Eintrag --------------------------------------------------------------------------------------

export function eintragPruefen(text: unknown, fotos: unknown[]): { ok: true; text: string | null } | { ok: false; fehler: string } {
  const t = typeof text === 'string' ? text.trim() : '';
  if (t.length > 2000) return { ok: false, fehler: 'Der Eintrag darf höchstens 2.000 Zeichen haben.' };
  if (fotos.length > FOTOS_JE_EINTRAG) return { ok: false, fehler: `Höchstens ${FOTOS_JE_EINTRAG} Fotos je Eintrag.` };
  if (!t && fotos.length === 0) return { ok: false, fehler: 'Bitte Text schreiben oder ein Foto anhängen.' };
  return { ok: true, text: t || null };
}

/** 88000 -> „88.000" (Punkt bei Tausendern, ohne Sonderzeichen). */
export function tausender(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Zeile „Fahrzeug" für den Partner aus der Positivliste (nur, was die Datenbank geliefert hat). */
export type PartnerFahrzeug = {
  marke?: string | null; modell?: string | null; variante?: string | null; farbe?: string | null; farbcode?: string | null;
  erstzulassung?: string | null; kraftstoff?: string | null; leistung_kw?: number | null; km_stand?: number | null; fin?: string | null;
};
export function fahrzeugZeilen(f: PartnerFahrzeug | null | undefined): [string, string][] {
  if (!f) return [];
  const z: [string, string][] = [];
  const titel = [f.marke, f.modell, f.variante].filter((x) => typeof x === 'string' && x.trim()).join(' ');
  if (titel) z.push(['Fahrzeug', titel]);
  const farbe = [f.farbe, f.farbcode ? `(${f.farbcode})` : null].filter(Boolean).join(' ');
  if (farbe) z.push(['Farbe', farbe]);
  if (f.erstzulassung && /^\d{4}-\d{2}/.test(f.erstzulassung)) z.push(['Erstzulassung', `${f.erstzulassung.slice(5, 7)}/${f.erstzulassung.slice(0, 4)}`]);
  if (f.kraftstoff) z.push(['Kraftstoff', f.kraftstoff]);
  if (typeof f.leistung_kw === 'number' && f.leistung_kw > 0) z.push(['Leistung', `${f.leistung_kw} kW (${Math.round(f.leistung_kw * 1.35962)} PS)`]);
  if (typeof f.km_stand === 'number') z.push(['Kilometerstand', `${tausender(f.km_stand)} km`]);
  if (f.fin) z.push(['FIN', f.fin]);
  return z;
}

/** Fehlertext aus der Datenbank verständlich machen (Meldungen aus p278_* sind schon deutsch). */
export function fehlerText(e: { message?: string; code?: string } | null | undefined): string {
  const m = String(e?.message || '');
  if (/function .*p278_.* does not exist|Could not find the function|relation .*(betrieb_partner|partner_auftrag|partner_eintrag).* does not exist/i.test(m) || e?.code === 'PGRST202' || e?.code === '42P01') {
    return 'Das Partner-Netzwerk ist noch nicht eingerichtet (SQL Paket 278 fehlt).';
  }
  if (/row-level security|permission denied/i.test(m)) return 'Dafür fehlt das Recht.';
  return m.replace(/^.*?ERROR:\s*/, '').slice(0, 300) || 'Unbekannter Fehler.';
}
