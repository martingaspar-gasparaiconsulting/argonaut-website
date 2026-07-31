// lib/gefuehrteTour.ts
// Drehbuch + reine Helfer für die „Geführte Tour" (Spotlight-Guide).
// Der Guide zeigt nacheinander auf echte Menüpunkte (per href-Selektor),
// leuchtet sie an und erklärt sie. KEINE Supabase-/React-Abhängigkeit.
// Node-getestet (gefuehrteTour.test.ts).

export interface TourSchritt {
  /** CSS-Selektor des Ziel-Elements, z. B. a[href="/dashboard/crm"]. */
  selector: string;
  /** Überschrift der Sprechblase. */
  titel: string;
  /** Erklärung im Klartext. */
  text: string;
}

// Reihenfolge = Weg durch das System. Nicht gebuchte/ausgeblendete Punkte
// überspringt die Tour zur Laufzeit automatisch (Ziel nicht im DOM gefunden).
export const STANDARD_TOUR: TourSchritt[] = [
  { selector: 'a[href="/dashboard"]', titel: 'Deine Übersicht', text: 'Über das Logo oben links kommst du jederzeit hierher zurück — dein Startbildschirm mit den wichtigsten Zahlen.' },
  { selector: 'a[href="/dashboard/crm"]', titel: 'Hier ist dein CRM', text: 'Kunden und Firmen anlegen und pflegen. Das ist die Basis — daraus entstehen Angebote und Rechnungen.' },
  { selector: 'a[href="/dashboard/pipeline"]', titel: 'Deine Deal-Pipeline', text: 'Vertriebschancen als Karten über die Stufen ziehen. ARGONAUT rechnet den gewichteten Forecast und zeigt je Deal einen 🔥-Score.' },
  { selector: 'a[href="/dashboard/angebote"]', titel: 'Angebote schreiben', text: 'Angebote erstellen und rausschicken. Der Kunde kann online zusagen und unterschreiben — daraus wird per Klick ein Auftrag oder eine Rechnung.' },
  { selector: 'a[href="/dashboard/rechnungen"]', titel: 'Rechnungen stellen', text: '§14-konforme Rechnungen mit fortlaufender Nummer und GiroCode — der Kunde zahlt per Handy-Scan.' },
  { selector: 'a[href="/dashboard/termine"]', titel: 'Dein Kalender', text: 'Termine planen und im Blick behalten — verzahnt mit Aufträgen und Kunden.' },
  { selector: 'a[href="/dashboard/finanzen"]', titel: 'Deine Finanzen', text: 'Einnahmen, Ausgaben und der Überblick — alles läuft hier zusammen.' },
  { selector: 'a[href="/dashboard/documents"]', titel: 'Dokumente', text: 'Alle Unterlagen sicher an einem Ort, jederzeit griffbereit.' },
  { selector: 'a[href="/dashboard/import"]', titel: 'Daten übernehmen', text: 'Schon Daten im alten System? Im Import-Center übernimmst du Kunden, Artikel & Co. per CSV-Vorlage in Minuten.' },
  { selector: 'a[href="/dashboard/einstellungen"]', titel: 'Einrichten & Team', text: 'Zum Schluss: Firmendaten, Logo und dein Team. Hier machst du ARGONAUT zu deinem System.' },
];

/** Index sicher in [0, n-1] halten (n<=0 → 0). */
export function begrenzeIndex(i: number, n: number): number {
  if (n <= 0) return 0;
  if (i < 0) return 0;
  if (i > n - 1) return n - 1;
  return i;
}

export interface TourFortschritt { aktuell: number; gesamt: number; prozent: number; }

/** Menschlicher Fortschritt: Schritt aktuell von gesamt (+ Prozent). */
export function tourFortschritt(i: number, n: number): TourFortschritt {
  if (n <= 0) return { aktuell: 0, gesamt: 0, prozent: 0 };
  const aktuell = begrenzeIndex(i, n) + 1;
  return { aktuell, gesamt: n, prozent: Math.round((aktuell / n) * 100) };
}

export function istLetzter(i: number, n: number): boolean {
  return n <= 0 ? true : i >= n - 1;
}
