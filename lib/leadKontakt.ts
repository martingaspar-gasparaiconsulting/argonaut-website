// lib/leadKontakt.ts
// Lead -> CRM-Kontakt: reine Abbildung eines Leads auf ein kontakte-Insert.
// KEINE Supabase-Aufrufe, KEINE React-Hooks. Node-getestet.

export interface LeadFuerKontakt {
  name?: string | null;
  email?: string | null;
  telefon?: string | null;
  dienstleistung?: string | null;
  menge?: string | null;
  einheit?: string | null;
  nachricht?: string | null;
  quelle?: string | null;
}

export interface KontaktInsert {
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  telefon: string | null;
  position: string | null;
  firma: string | null;
  status: string;
  quelle: string;
  betreuungs_intervall_tage: number;
  notizen: string | null;
}

/** Teilt einen Namen in Vor-/Nachname (erstes Wort = Vorname, Rest = Nachname). */
export function nameSplit(name?: string | null): { vorname: string | null; nachname: string | null } {
  const t = (name || '').trim().replace(/\s+/g, ' ');
  if (!t) return { vorname: null, nachname: null };
  const teile = t.split(' ');
  if (teile.length === 1) return { vorname: null, nachname: teile[0] };
  return { vorname: teile[0], nachname: teile.slice(1).join(' ') };
}

/** Baut das kontakte-Insert-Objekt aus einem Lead. owner_user_id wird per DB-Default gesetzt. */
export function kontaktAusLead(lead: LeadFuerKontakt): KontaktInsert {
  const { vorname, nachname } = nameSplit(lead.name);
  const menge = [lead.menge, lead.einheit].map((x) => (x || '').trim()).filter(Boolean).join(' ');
  const zeilen: string[] = ['Aus Lead übernommen.'];
  if (lead.dienstleistung && lead.dienstleistung.trim()) {
    zeilen.push('Dienstleistung: ' + lead.dienstleistung.trim() + (menge ? ' (' + menge + ')' : ''));
  } else if (menge) {
    zeilen.push('Menge: ' + menge);
  }
  if (lead.nachricht && lead.nachricht.trim()) zeilen.push('Nachricht: ' + lead.nachricht.trim());
  return {
    vorname,
    nachname,
    email: (lead.email && lead.email.trim()) || null,
    telefon: (lead.telefon && lead.telefon.trim()) || null,
    position: null,
    firma: null,
    status: 'interessent',
    quelle: (lead.quelle && lead.quelle.trim()) || 'Lead-Übernahme',
    betreuungs_intervall_tage: 30,
    notizen: zeilen.join('\n'),
  };
}
