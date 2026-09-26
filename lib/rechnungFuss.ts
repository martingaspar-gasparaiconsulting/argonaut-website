// ============================================================================
// ARGONAUT OS · lib/rechnungFuss.ts — G3b (26.09.2026)
//
// Pflichtangaben auf Geschäftsbriefen (auch Rechnungen): Bei eingetragenen
// Firmen Rechtsform, Sitz, Registergericht und Registernummer; bei GmbH/UG
// zusätzlich alle Geschäftsführer (§ 35a GmbHG), bei AG Vorstand
// (§ 80 AktG), bei Kaufleuten/OHG/KG § 37a / § 125a / § 177a HGB.
// Bis G3 zeigte der Rechnungsfuß nur Firmenname und Datum, obwohl die
// Angaben in den Firmendaten gepflegt waren.
// Reine Logik — kein Supabase, im Browser und in Node nutzbar.
// ============================================================================

export type FussAngaben = {
  name?: string | null;
  rechtsform?: string | null;
  ort?: string | null;
  geschaeftsfuehrer?: string | null;
  registergericht?: string | null;
  hrb?: string | null;
};

const t = (v: unknown) => String(v ?? '').trim();

/** Muss diese Rechtsform im Handelsregister stehen (und daher Registerdaten zeigen)? */
export function istRegisterpflichtig(rechtsform: string | null | undefined): boolean {
  const r = t(rechtsform).toLowerCase().replace(/\s+/g, ' ');
  if (!r) return false;
  return /\bgmbh\b|\bug\b|haftungsbeschr|\bag\b|aktiengesell|\bkg\b|kommandit|\bohg\b|offene handels|\be\.?\s?k\.?\b|eingetragene[rs]? kauf|\bse\b|\bkgaa\b|\bpartg\b|partnerschaft|\beg\b|genossenschaft/.test(r);
}

/** Braucht die Rechtsform Geschäftsführer bzw. Vorstand auf dem Brief? */
export function brauchtLeitung(rechtsform: string | null | undefined): boolean {
  const r = t(rechtsform).toLowerCase();
  return /gmbh|\bug\b|haftungsbeschr|\bag\b|aktiengesell|\bse\b|\beg\b|genossenschaft/.test(r);
}

/** Zeile für den Rechnungsfuß plus Hinweis, wenn Pflichtangaben fehlen. */
export function pflichtangabenFuss(a: FussAngaben): { zeile: string; fehlt: string[] } {
  const teile: string[] = [];
  const name = t(a.name), rf = t(a.rechtsform), ort = t(a.ort);
  const gf = t(a.geschaeftsfuehrer), gericht = t(a.registergericht), nr = t(a.hrb);
  if (name) teile.push(rf && !name.toLowerCase().includes(rf.toLowerCase()) ? `${name} ${rf}` : name);
  if (ort) teile.push(`Sitz: ${ort}`);
  if (gericht || nr) teile.push(['Registergericht:', gericht || '—', nr ? `· ${nr}` : ''].filter(Boolean).join(' ').replace(': · ', ': '));
  if (gf) teile.push(`${/\bag\b|aktiengesell|\bse\b/i.test(rf) ? 'Vorstand' : 'Geschäftsführung'}: ${gf}`);
  const fehlt: string[] = [];
  if (istRegisterpflichtig(rf)) {
    if (!gericht) fehlt.push('Registergericht');
    if (!nr) fehlt.push('Registernummer');
    if (!ort) fehlt.push('Sitz');
    if (brauchtLeitung(rf) && !gf) fehlt.push('Geschäftsführung');
  }
  return { zeile: teile.join(' · '), fehlt };
}
