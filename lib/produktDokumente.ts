// ============================================================================
// ARGONAUT OS · lib/produktDokumente.ts — Produkt-Dokumente am Artikel (Paket 315 · S1)
//
// Sicherheitsdatenblatt, Technisches Merkblatt, Zertifikat, Anleitung,
// Leistungserklärung … als PDF je Artikel: Art, Sprache, Version, Ausgabe,
// gültig bis. Auf Wunsch zum Herunterladen am Produkt im Shop und als Wissen
// für das Team (Firmen-Wissen).
//
// Allgemein für alle Branchen (Chemie, Baustoff, Elektro, Maschinenbau,
// Lebensmittel …) — keine Branche ist hier fest eingebaut.
//
// Ehrlich: ARGONAUT erstellt und prüft keine Datenblätter. Der Betrieb lädt
// die Fassung hoch, die er vom Hersteller bzw. aus seinem Fachprogramm hat.
// Die Ampel weist nur auf Daten hin (abgelaufen, läuft bald ab, alte Fassung).
//
// Rein, ohne Importe — node-getestet (tests/produktDokumenteP315.test.mjs).
// ============================================================================

export type DokArt = 'sdb' | 'tdb' | 'zertifikat' | 'anleitung' | 'leistungserklaerung' | 'konformitaet' | 'spezifikation' | 'sonstiges';

export type ArtInfo = {
  key: DokArt;
  label: string;
  kurz: string;
  /** Neue Fassung derselben Sprache ersetzt die alte automatisch (Datenbank). */
  ersetzt: boolean;
  /** Vorschlag für den Haken „im Shop zum Herunterladen". */
  shopStandard: boolean;
};

export const ARTEN: ArtInfo[] = [
  { key: 'sdb', label: 'Sicherheitsdatenblatt', kurz: 'SDB', ersetzt: true, shopStandard: true },
  { key: 'tdb', label: 'Technisches Merkblatt', kurz: 'TDB', ersetzt: true, shopStandard: true },
  { key: 'leistungserklaerung', label: 'Leistungserklärung', kurz: 'DoP', ersetzt: true, shopStandard: true },
  { key: 'konformitaet', label: 'Konformitätserklärung', kurz: 'CE', ersetzt: false, shopStandard: true },
  { key: 'spezifikation', label: 'Produktspezifikation', kurz: 'Spez.', ersetzt: true, shopStandard: false },
  { key: 'zertifikat', label: 'Zertifikat', kurz: 'Zert.', ersetzt: false, shopStandard: false },
  { key: 'anleitung', label: 'Anleitung', kurz: 'Anl.', ersetzt: false, shopStandard: true },
  { key: 'sonstiges', label: 'Sonstiges Dokument', kurz: 'Dok.', ersetzt: false, shopStandard: false },
];

/** Arten, bei denen die Datenbank die alte Fassung derselben Sprache auf „ersetzt" setzt (wie SQL p315). */
export const ERSETZT_ARTEN: DokArt[] = ARTEN.filter((a) => a.ersetzt).map((a) => a.key);

/** Sprachen wie im mehrsprachigen Team (lib/mehrsprachig, 24) plus Niederländisch und Chinesisch für Exportkunden. */
export const SPRACHEN: { key: string; label: string }[] = [
  { key: 'de', label: 'Deutsch' }, { key: 'en', label: 'Englisch' }, { key: 'fr', label: 'Französisch' },
  { key: 'es', label: 'Spanisch' }, { key: 'it', label: 'Italienisch' }, { key: 'pt', label: 'Portugiesisch' },
  { key: 'nl', label: 'Niederländisch' }, { key: 'pl', label: 'Polnisch' }, { key: 'cs', label: 'Tschechisch' },
  { key: 'sk', label: 'Slowakisch' }, { key: 'hu', label: 'Ungarisch' }, { key: 'ro', label: 'Rumänisch' },
  { key: 'bg', label: 'Bulgarisch' }, { key: 'hr', label: 'Kroatisch' }, { key: 'sr', label: 'Serbisch' },
  { key: 'bs', label: 'Bosnisch' }, { key: 'sq', label: 'Albanisch' }, { key: 'el', label: 'Griechisch' },
  { key: 'lt', label: 'Litauisch' }, { key: 'uk', label: 'Ukrainisch' }, { key: 'ru', label: 'Russisch' },
  { key: 'tr', label: 'Türkisch' }, { key: 'ar', label: 'Arabisch' }, { key: 'fa', label: 'Persisch' },
  { key: 'vi', label: 'Vietnamesisch' }, { key: 'zh', label: 'Chinesisch' },
];

/** Größte Datei: 20 MB (Speicher „produkt-dokumente" prüft dasselbe). */
export const MAX_BYTES = 20 * 1024 * 1024;
/** Ab so vielen Tagen vor „gültig bis" wird es gelb. */
export const BALD_TAGE = 60;
/** Ein Sicherheitsdatenblatt älter als so viele Jahre: Hinweis, beim Hersteller nach der aktuellen Fassung zu fragen. */
export const SDB_HINWEIS_JAHRE = 3;
/** So viele Tage vor „gültig bis" wird erinnert. */
export const ERINNERN_TAGE = 30;

export function artInfo(art: unknown): ArtInfo | null {
  return ARTEN.find((a) => a.key === art) ?? null;
}
export function spracheLabel(s: unknown): string {
  return SPRACHEN.find((x) => x.key === s)?.label ?? String(s ?? '').toUpperCase();
}

export function istIsoTag(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [j, m, t] = s.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

function tagPlus(tag: string, tage: number): string {
  const [j, m, t] = tag.split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, t + tage)).toISOString().slice(0, 10);
}
function jahrePlus(tag: string, jahre: number): string {
  const [j, m, t] = tag.split('-').map(Number);
  return new Date(Date.UTC(j + jahre, m - 1, t)).toISOString().slice(0, 10);
}
export function datumDe(tag: unknown): string {
  if (!istIsoTag(tag)) return '—';
  const [j, m, t] = tag.split('-');
  return `${t}.${m}.${j}`;
}

// ---------------------------------------------------------------- Datei ---

export type DateiInfo = { name: string; size: number; type?: string | null };

/** Nur PDF bis 20 MB. Leerer Typ (manche Browser) zählt, wenn die Endung .pdf ist. */
export function dateiPruefen(d: DateiInfo | null | undefined): { ok: true } | { ok: false; fehler: string } {
  if (!d || !d.name) return { ok: false, fehler: 'Bitte eine Datei wählen.' };
  const pdfName = /\.pdf$/i.test(d.name.trim());
  const typ = String(d.type ?? '').toLowerCase();
  if (!pdfName || (typ !== '' && typ !== 'application/pdf')) return { ok: false, fehler: 'Bitte ein PDF hochladen (Datenblätter und Zertifikate kommen als PDF).' };
  if (!(d.size > 0)) return { ok: false, fehler: 'Die Datei ist leer.' };
  if (d.size > MAX_BYTES) return { ok: false, fehler: 'Die Datei ist größer als 20 MB.' };
  return { ok: true };
}

/** Dateiname für den Speicher: nur a–z, 0–9, . _ - (Umlaute umgeschrieben), endet auf .pdf. */
export function sichererName(name: unknown): string {
  const roh = String(name ?? '').replace(/\.pdf$/i, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[._-]+|[._-]+$/g, '').toLowerCase().slice(0, 80);
  return (roh || 'dokument') + '.pdf';
}

/** Speicher-Pfad: <Betrieb>/<Artikel>/<zufall>-<name>.pdf — die Datenbank prüft den Anfang. */
export function speicherPfad(betrieb: string, artikelId: string, dateiname: string, zufall: string): string {
  const z = String(zufall ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'x';
  return `${betrieb}/${artikelId}/${z}-${sichererName(dateiname)}`;
}

/** Gehört der Pfad zu Betrieb und Artikel (wie der Datenbank-Wächter)? */
export function pfadPasst(pfad: unknown, betrieb: string, artikelId: string): boolean {
  if (typeof pfad !== 'string') return false;
  if (pfad.includes('..') || pfad.includes('\\') || pfad.includes('//')) return false;
  const teile = pfad.split('/');
  return teile.length === 3 && teile[0] === betrieb && teile[1] === artikelId && /^[A-Za-z0-9]+-[a-z0-9._-]+\.pdf$/.test(teile[2]);
}

// ---------------------------------------------------------------- Angaben ---

export type DokEingabe = {
  art: string; titel?: string | null; sprache?: string | null; version?: string | null;
  ausgabe_am?: string | null; gueltig_bis?: string | null; im_shop?: boolean;
};
export type DokZeile = {
  art: DokArt; titel: string | null; sprache: string; version: string | null;
  ausgabe_am: string | null; gueltig_bis: string | null; im_shop: boolean;
};

function textOderNull(t: unknown, max: number): string | null {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

export function dokumentPruefen(e: DokEingabe): { ok: true; zeile: DokZeile } | { ok: false; fehler: string } {
  const art = artInfo(e.art);
  if (!art) return { ok: false, fehler: 'Bitte die Art des Dokuments wählen.' };
  const sprache = String(e.sprache ?? 'de').trim().toLowerCase() || 'de';
  if (!/^[a-z]{2}$/.test(sprache)) return { ok: false, fehler: 'Bitte eine Sprache wählen.' };
  const ausgabe = String(e.ausgabe_am ?? '').trim() || null;
  const bis = String(e.gueltig_bis ?? '').trim() || null;
  if (ausgabe && !istIsoTag(ausgabe)) return { ok: false, fehler: 'Das Ausgabedatum ist kein gültiges Datum.' };
  if (bis && !istIsoTag(bis)) return { ok: false, fehler: '„Gültig bis" ist kein gültiges Datum.' };
  if (ausgabe && bis && bis < ausgabe) return { ok: false, fehler: '„Gültig bis" liegt vor dem Ausgabedatum.' };
  return {
    ok: true,
    zeile: {
      art: art.key, titel: textOderNull(e.titel, 120), sprache, version: textOderNull(e.version, 40),
      ausgabe_am: ausgabe, gueltig_bis: bis, im_shop: e.im_shop === true,
    },
  };
}

// ---------------------------------------------------------------- Ampel ---

export type Dok = {
  id?: string; art: string; titel?: string | null; sprache?: string | null; version?: string | null;
  ausgabe_am?: string | null; gueltig_bis?: string | null; im_shop?: boolean | null; aktuell?: boolean | null;
  datei_name?: string | null; document_id?: string | null; artikel_id?: string | null;
};
export type Ampel = { stufe: 'rot' | 'gelb' | 'gruen' | 'grau'; text: string };

export function dokumentAmpel(d: Dok, heute: string): Ampel {
  if (d.aktuell === false) return { stufe: 'grau', text: 'ersetzt durch eine neuere Fassung' };
  if (istIsoTag(d.gueltig_bis) && d.gueltig_bis < heute) return { stufe: 'rot', text: `abgelaufen am ${datumDe(d.gueltig_bis)}` };
  if (istIsoTag(d.gueltig_bis) && d.gueltig_bis <= tagPlus(heute, BALD_TAGE)) return { stufe: 'gelb', text: `läuft am ${datumDe(d.gueltig_bis)} ab` };
  if (d.art === 'sdb') {
    if (!istIsoTag(d.ausgabe_am)) return { stufe: 'gelb', text: 'Ausgabedatum fehlt — steht oben auf dem Sicherheitsdatenblatt' };
    if (jahrePlus(d.ausgabe_am, SDB_HINWEIS_JAHRE) < heute) return { stufe: 'gelb', text: `Fassung vom ${datumDe(d.ausgabe_am)} — beim Hersteller nach der aktuellen Fassung fragen` };
  }
  return { stufe: 'gruen', text: istIsoTag(d.gueltig_bis) ? `gültig bis ${datumDe(d.gueltig_bis)}` : 'aktuell' };
}

/** Anzeigename: eigener Titel oder Art, dazu Version und Sprache (wenn nicht Deutsch). */
export function anzeigeName(d: Dok): string {
  const basis = textOderNull(d.titel, 120) ?? artInfo(d.art)?.label ?? 'Dokument';
  const teile = [basis];
  if (d.version) teile.push(`Version ${String(d.version).trim()}`);
  const s = String(d.sprache ?? 'de');
  if (s && s !== 'de') teile.push(spracheLabel(s));
  return teile.join(' · ');
}

/** Was im Shop am Produkt erscheint: aktuell, freigegeben, nicht abgelaufen; nach Art sortiert. */
export function shopDokumente(liste: Dok[], heute: string): { id: string; name: string; art: string; sprache: string }[] {
  const ordnung = ARTEN.map((a) => a.key as string);
  return (liste ?? [])
    .filter((d) => d && d.id && d.im_shop === true && d.aktuell !== false && !(istIsoTag(d.gueltig_bis) && d.gueltig_bis < heute))
    .sort((a, b) => (ordnung.indexOf(a.art) - ordnung.indexOf(b.art)) || String(a.sprache ?? '').localeCompare(String(b.sprache ?? '')))
    .slice(0, 12)
    .map((d) => ({ id: String(d.id), name: anzeigeName(d), art: artInfo(d.art)?.kurz ?? 'Dok.', sprache: String(d.sprache ?? 'de') }));
}

/** Tag der Erinnerung: 30 Tage vor „gültig bis", frühestens heute. */
export function erinnerungsTag(gueltigBis: string, heute: string): string {
  const t = tagPlus(gueltigBis, -ERINNERN_TAGE);
  return t < heute ? heute : t;
}

export function zaehlen(liste: Dok[], heute: string): { gesamt: number; rot: number; gelb: number; imShop: number; ersetzt: number } {
  const z = { gesamt: 0, rot: 0, gelb: 0, imShop: 0, ersetzt: 0 };
  for (const d of liste ?? []) {
    z.gesamt++;
    const a = dokumentAmpel(d, heute).stufe;
    if (a === 'rot') z.rot++;
    else if (a === 'gelb') z.gelb++;
    else if (a === 'grau') z.ersetzt++;
    if (d.im_shop === true && d.aktuell !== false && a !== 'rot') z.imShop++;
  }
  return z;
}

/** Dateiname im Firmen-Wissen: „<Artikel> – <Dokument>.pdf". */
export function wissenName(artikel: string, d: Dok): string {
  const a = String(artikel ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Artikel';
  return `${a} – ${anzeigeName(d)}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
}
