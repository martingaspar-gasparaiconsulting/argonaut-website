// ============================================================================
// ARGONAUT OS · lib/speicherGrenzen.ts  (Paket 187c)
//
// Feste Größen- und Typgrenzen je Speicherordner (Supabase-Bucket).
//
// Befund (Paket 184, Live-Abfrage 01.10.2026): 16 Ordner hatten KEINE
// Größengrenze, die meisten auch keine Typgrenze. Die Prüfung lag nur im
// Browser — wer direkt mit dem Speicher spricht, konnte beliebig große
// Dateien und beliebige Typen (HTML, SVG) ablegen.
//
// Regeln für die Werte:
//   · Jede Grenze liegt AUF oder ÜBER der Grenze, die der Code selbst prüft
//     (codeMaxMb) — sonst würde ein Upload brechen, den die Seite erlaubt.
//   · Typen nur dort, wo der Inhaltstyp fest vom Server kommt bzw. vorher
//     genau so geprüft wird. Bei Handy-Fotos und Browser-Uploads ohne festen
//     Typ (leerer Typ bei HEIC unter Windows u. Ä.) NUR die Größe — eine
//     Typliste würde dort echte Uploads abweisen.
//   · Nie text/html oder image/svg+xml (Test wacht).
//
// supabase-sql/p187c-speicher-grenzen.sql setzt genau diese Werte (Test prüft).
// ============================================================================

export type SpeicherGrenze = {
  bucket: string;
  maxMb: number;
  typen: string[] | null;
  /** Grenze, die der Code selbst prüft (null = keine eigene Prüfung). */
  codeMaxMb: number | null;
  grund: string;
};

const PDF = ['application/pdf'];
const BILDER = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const SPEICHER_GRENZEN: SpeicherGrenze[] = [
  { bucket: 'bau-plaene', maxMb: 25, typen: null, codeMaxMb: null, grund: 'Baupläne/Fotos, im Browser verkleinert' },
  { bucket: 'baustellen-fotos', maxMb: 25, typen: null, codeMaxMb: null, grund: 'Baustellenfotos vom Handy' },
  { bucket: 'belege', maxMb: 10, typen: [...BILDER, ...PDF], codeMaxMb: 10, grund: 'Beleg-Upload prüft 10 MB und genau diese Typen' },
  { bucket: 'customer-documents', maxMb: 200, typen: null, codeMaxMb: 200, grund: 'Firmenwissen, größter Tarif 200 MB je Datei' },
  { bucket: 'dossiers', maxMb: 25, typen: PDF, codeMaxMb: null, grund: 'nur vom Server erzeugte PDFs (größtes 0,9 MB)' },
  { bucket: 'ebooks', maxMb: 50, typen: PDF, codeMaxMb: null, grund: 'nur vom Server erzeugte PDFs' },
  { bucket: 'einsatz-fotos', maxMb: 25, typen: null, codeMaxMb: null, grund: 'Einsatzfotos, Unterschrift, Nachweis-PDF (größtes 4,9 MB)' },
  { bucket: 'erechnungen', maxMb: 25, typen: null, codeMaxMb: null, grund: 'E-Rechnungen unverändert archiviert (Typ kommt vom Absender)' },
  { bucket: 'erstellte-dokumente', maxMb: 50, typen: null, codeMaxMb: null, grund: 'vom Server erzeugte Word-/PDF-/Excel-Dateien' },
  { bucket: 'formulare', maxMb: 15, typen: null, codeMaxMb: null, grund: 'Formular-Fotos, im Browser verkleinert' },
  { bucket: 'freebies', maxMb: 25, typen: null, codeMaxMb: 25, grund: 'Freebie-PDF, Code prüft 25 MB' },
  { bucket: 'hr-dokumente', maxMb: 25, typen: null, codeMaxMb: null, grund: 'Personal-Unterlagen, AU-Bescheinigungen' },
  { bucket: 'lp-medien', maxMb: 8, typen: BILDER, codeMaxMb: 6, grund: 'Landingpage-Bilder, Route prüft genau diese Typen' },
  { bucket: 'portal-dokumente', maxMb: 20, typen: null, codeMaxMb: 20, grund: 'Kundenportal-Dokumente, Code prüft 20 MB' },
  { bucket: 'teamchat-dateien', maxMb: 25, typen: null, codeMaxMb: 25, grund: 'Team-Chat-Anhänge, Code prüft 25 MB' },
  { bucket: 'werkstatt-anhaenge', maxMb: 10, typen: null, codeMaxMb: 10, grund: 'Werkstatt-Anhänge, Code prüft 10 MB' },
];

export function mbZuBytes(mb: number): number {
  return Math.round(mb * 1024 * 1024);
}

/** Verbotene Typen in jeder Liste (würden im Browser als Seite/Skript laufen). */
export const NIE_ERLAUBT = ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/javascript', 'application/javascript'];
