// ============================================================================
// ARGONAUT OS · lib/fahrzeugMappeBestand.ts — Paket 307 (10.10.2026) · FM3
//
// „Ankaufen und in den Bestand übernehmen": Fotos (und auf Wunsch Schadenfotos,
// Rundgang- und Kaltstart-Video) aus der Fahrzeugmappe werden in die Medien
// des Bestandsfahrzeugs KOPIERT (Ordner „fahrzeugmappe" -> „fahrzeug-medien").
// Die Mappe selbst bleibt unverändert — sie gehört zum Ankauf.
//
// NIE übernommen: Fahrzeugschein, Unterlagen (TÜV, Serviceheft, Rechnungen …)
// und die Videobotschaft — darin stehen Personendaten des Verkäufers, und
// alles in den Medien kann später in Börse und Inserate gehen.
//
// Doppelt übernehmen geht nicht: Der Zielpfad trägt die Kennung der
// Mappen-Datei (…/mappe-<id>.<endung>); was schon da ist, wird übersprungen.
// Reine Logik, node-testbar, ohne Importe.
// ============================================================================

/** Mappen-Fach -> Ansicht der Aufnahme-Schablone im Bestand (lib/kfzMedien SCHABLONE). */
export const SCHABLONE_AUS_FACH: Record<string, string | null> = {
  vorne_links: 'front_links',
  hinten_rechts: 'heck_rechts',
  seite_links: 'seite_links',
  seite_rechts: 'seite_rechts',
  innen_vorne: 'sitze_vorn',
  tacho: 'tacho',
  reifen: 'felge',
  kofferraum: 'kofferraum',
  weitere: null,
  schaden: null,
  rundgang: null,
  kaltstart: null,
};

/** Reihenfolge der Schablone im Bestand (wie lib/kfzMedien SCHABLONE) — für die Positionen. */
const SCHABLONE_REIHE = ['front_links', 'seite_links', 'heck_links', 'heck', 'heck_rechts', 'seite_rechts', 'front', 'cockpit', 'tacho', 'sitze_vorn', 'sitze_hinten', 'kofferraum', 'motor', 'felge'];

/** Was übernommen werden DARF (alles andere nie) und was vorgewählt ist. */
export const UEBERNAHME_FAECHER: { key: string; vorgewaehlt: boolean }[] = [
  { key: 'vorne_links', vorgewaehlt: true },
  { key: 'hinten_rechts', vorgewaehlt: true },
  { key: 'seite_links', vorgewaehlt: true },
  { key: 'seite_rechts', vorgewaehlt: true },
  { key: 'innen_vorne', vorgewaehlt: true },
  { key: 'tacho', vorgewaehlt: true },
  { key: 'reifen', vorgewaehlt: true },
  { key: 'kofferraum', vorgewaehlt: true },
  { key: 'weitere', vorgewaehlt: true },
  { key: 'schaden', vorgewaehlt: false },   // Schäden: intern nützlich, im Inserat Entscheidung des Händlers
  { key: 'rundgang', vorgewaehlt: false },
  { key: 'kaltstart', vorgewaehlt: false },
];

export const NIE_UEBERNEHMEN = ['schein', 'botschaft', 'tuev', 'service', 'rechnung', 'sonstiges'];

const MEDIEN_MIME_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MEDIEN_MIME_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];

export function darfUebernommenWerden(fach: unknown): boolean {
  return typeof fach === 'string' && UEBERNAHME_FAECHER.some((f) => f.key === fach) && !NIE_UEBERNEHMEN.includes(fach);
}

export type MappeDateiKurz = { id: string; fach: string; mime: string; pfad: string; bytes: number | null; erstellt_am: string };

/** Standard-Auswahl: alle vorgewählten Fächer. */
export function standardAuswahl(dateien: Pick<MappeDateiKurz, 'id' | 'fach'>[]): string[] {
  const an = new Set(UEBERNAHME_FAECHER.filter((f) => f.vorgewaehlt).map((f) => f.key));
  return dateien.filter((d) => an.has(d.fach)).map((d) => d.id);
}

/** Kennung der Mappen-Datei aus einem Medien-Pfad (…/mappe-<id>.<endung>), sonst null. */
export function mappeIdAusPfad(pfad: unknown): string | null {
  if (typeof pfad !== 'string') return null;
  const m = pfad.match(/\/mappe-([0-9a-f-]{36})\.[a-z0-9]{2,5}$/i);
  return m ? m[1].toLowerCase() : null;
}

export type Schritt = {
  dateiId: string; von: string; nach: string; art: 'foto' | 'video'; schablone: string | null; position: number; bytes: number | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Plan für die Übernahme. Prüft je Datei: darf das Fach, ist sie ausgewählt,
 * liegt sie im Ordner DIESES Betriebs und DIESER Mappe, passt die Dateiart in
 * die Medien, ist sie noch nicht übernommen. Positionen: Schablonen-Reihenfolge,
 * dann der Rest in Eingangs-Reihenfolge — hinter den schon vorhandenen Medien.
 */
export function uebernahmePlan(e: {
  betrieb: string; mappe: string; bestand: string;
  dateien: MappeDateiKurz[]; auswahl: string[]; schonDa: string[]; startPosition: number;
}): { schritte: Schritt[]; uebersprungen: number } {
  if (!UUID.test(e.betrieb) || !UUID.test(e.mappe) || !UUID.test(e.bestand)) return { schritte: [], uebersprungen: e.dateien.length };
  const betrieb = e.betrieb.toLowerCase();
  const praefix = `${betrieb}/${e.mappe.toLowerCase()}/`;
  const gewaehlt = new Set(e.auswahl.map((x) => String(x).toLowerCase()));
  const da = new Set(e.schonDa.map((x) => String(x).toLowerCase()));
  const rang = (fach: string) => {
    const s = SCHABLONE_AUS_FACH[fach];
    const i = s ? SCHABLONE_REIHE.indexOf(s) : -1;
    return i < 0 ? 100 + UEBERNAHME_FAECHER.findIndex((f) => f.key === fach) : i;
  };
  const passend = e.dateien.filter((d) => {
    const id = String(d.id).toLowerCase();
    if (!UUID.test(id) || !gewaehlt.has(id) || da.has(id) || !darfUebernommenWerden(d.fach)) return false;
    if (typeof d.pfad !== 'string' || !d.pfad.toLowerCase().startsWith(praefix) || d.pfad.includes('..')) return false;
    const m = String(d.mime).toLowerCase();
    return MEDIEN_MIME_FOTO.includes(m) || MEDIEN_MIME_VIDEO.includes(m);
  }).sort((a, b) => (rang(a.fach) - rang(b.fach)) || a.erstellt_am.localeCompare(b.erstellt_am));
  const start = Number.isFinite(e.startPosition) && e.startPosition > 0 ? Math.floor(e.startPosition) : 0;
  const schritte: Schritt[] = passend.map((d, i) => {
    const endung = (d.pfad.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
    const video = MEDIEN_MIME_VIDEO.includes(String(d.mime).toLowerCase());
    return {
      dateiId: String(d.id).toLowerCase(), von: d.pfad, nach: `${betrieb}/${e.bestand.toLowerCase()}/mappe-${String(d.id).toLowerCase()}.${endung}`,
      art: video ? 'video' : 'foto', schablone: video ? null : SCHABLONE_AUS_FACH[d.fach] ?? null, position: start + i + 1, bytes: d.bytes,
    };
  });
  return { schritte, uebersprungen: e.dateien.length - schritte.length };
}

/**
 * Pro Schablonen-Ansicht nur EIN Titel-Kandidat: Ist eine Ansicht im Bestand
 * schon belegt, kommt das Mappen-Foto ohne Schablone dazu (kein Doppel-Haken).
 */
export function schabloneOhneDoppel(schritte: Schritt[], belegt: string[]): Schritt[] {
  const b = new Set(belegt);
  return schritte.map((s) => {
    if (!s.schablone) return s;
    if (b.has(s.schablone)) return { ...s, schablone: null };
    b.add(s.schablone);
    return s;
  });
}

/** Kurzer Text fürs Ergebnis. */
export function ergebnisText(fotos: number, videos: number): string {
  if (!fotos && !videos) return 'Aus der Fahrzeugmappe war nichts (mehr) zu übernehmen.';
  const t = [fotos ? `${fotos} ${fotos === 1 ? 'Foto' : 'Fotos'}` : '', videos ? `${videos} ${videos === 1 ? 'Video' : 'Videos'}` : ''].filter(Boolean).join(' und ');
  return `${t} aus der Fahrzeugmappe in die Fahrzeugakte übernommen.`;
}

export const INZAHLUNG_HINWEIS = 'Der Verkäufer möchte sein Fahrzeug in Zahlung geben. Nach dem Ankauf verrechnen Sie es im Verkauf des neuen Fahrzeugs (Handelsbestand → Fahrzeug → Verkauf → „Inzahlungnahme": diesen Ankauf wählen).';
