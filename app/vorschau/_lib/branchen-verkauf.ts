// app/vorschau/_lib/branchen-verkauf.ts
// Verkaufs-Copy je Website-Kategorie — hebt die Branchenseite vom generischen
// SEO-Text zu einem überzeugenden (nicht aggressiven) Sales-Funnel. Reiner Text,
// KEINE Video-Platzhalter. Platzhalter {branche} / {kategorie} werden gefüllt.
// Wird category-by-category befüllt; nicht gefüllte Kategorien nutzen DEFAULT.
// Schlüssel = die 19 Kategorie-Namen aus branchen-web KATEGORIE_ORDER.

export interface VerkaufBeweis { icon: string; titel: string; text: string }
export interface VerkaufPack {
  heroSub: string;      // Hero-Subline
  schmerzHint: string;  // Zeile unter „Kennen Sie das?"
  nutzenHint: string;   // Zeile unter dem Ergebnis-Titel
  beweis: VerkaufBeweis[]; // 3 Vertrauens-/Nutzen-Punkte
  ctaClaim: string;     // starke Zeile über dem Anfrage-Block
}

// Starker, branchenneutraler Standard — gilt sofort für alle 698, bis eine
// Kategorie eigene Copy bekommt.
export const DEFAULT_VERKAUF: VerkaufPack = {
  heroSub: 'Angebote, Aufträge, Rechnungen, Personal und Auswertungen für {branche} — in einem System, ein Login. Kein Zettel-Chaos, keine fünf Programme, die nicht miteinander reden.',
  schmerzHint: 'Das kostet jeden Tag Zeit, Nerven und bares Geld — muss aber nicht sein.',
  nutzenHint: 'Einmal eingerichtet, läuft der Papierkram im Hintergrund — Sie machen wieder das, wofür Sie {branche} geworden sind.',
  beweis: [
    { icon: '🇩🇪', titel: 'Deutscher Server, DSGVO', text: 'Ihre Daten bleiben in Deutschland und in Ihrer Hand — keine Cloud-Fragezeichen.' },
    { icon: '🤝', titel: 'Persönlich eingerichtet', text: 'Wir richten ARGONAUT gemeinsam mit Ihnen ein. Sie starten begleitet, nicht allein.' },
    { icon: '⚡', titel: 'In Tagen startklar', text: 'Bestehende Daten werden übernommen — Ihr Team arbeitet schnell produktiv.' },
  ],
  ctaClaim: 'In einer Stunde sehen Sie, wie {branche} mit einem System statt zwölf läuft — unverbindlich.',
};

export const VERKAUF: Record<string, VerkaufPack> = {
  'Handwerk & Bau': {
    heroSub: 'Vom Aufmaß auf der Baustelle bis zur Rechnung im Büro — {branche} in einem System. Angebote schneller, Material und Stunden lückenlos, kein Zettel geht mehr verloren.',
    schmerzHint: 'Jeder verlorene Zettel und jede doppelt getippte Stunde ist bares Geld — auf dem Bau erst recht.',
    nutzenHint: 'Büro und Baustelle ziehen am selben Strang — Sie sehen jederzeit, wo jeder Auftrag steht.',
    beweis: [
      { icon: '📐', titel: 'Aufmaß & Angebot in einem', text: 'Vor Ort messen — das Angebot rechnet sich selbst. Minuten statt Feierabend-Abende.' },
      { icon: '🏗️', titel: 'Baustelle dokumentiert', text: 'Fotos, Nachträge und Stunden direkt von der Baustelle — nachweisbar, nichts vergessen.' },
      { icon: '🔧', titel: 'Wartung, die sich erinnert', text: 'Wiederkehrende Serviceaufträge planen sich selbst — wiederkehrender Umsatz ohne Nachhaken.' },
    ],
    ctaClaim: 'Zeigen Sie uns Ihren typischen Auftrag — wir zeigen Ihnen, wie {branche} ihn ab morgen in einem System abwickelt.',
  },
};

/** Verkaufs-Pack einer Kategorie (Fallback: starker Standard). */
export function verkaufPack(kategorie: string): VerkaufPack {
  return VERKAUF[kategorie] ?? DEFAULT_VERKAUF;
}

/** Platzhalter {branche} / {kategorie} füllen. */
export function fuelleText(t: string, branche: string, kategorie: string): string {
  return (t || '')
    .replace(/\{branche\}/g, branche)
    .replace(/\{kategorie\}/g, kategorie);
}

/** Ist für diese Kategorie schon eigene Verkaufs-Copy hinterlegt? */
export function hatVerkaufCopy(kategorie: string): boolean {
  return kategorie in VERKAUF;
}
