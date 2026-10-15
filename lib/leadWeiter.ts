// ============================================================================
// ARGONAUT OS · lib/leadWeiter.ts — HW-12 (15.10.2026)
//
// Vom Lead direkt weiter: „Angebot anlegen" (echtes Angebot statt nur Text)
// und „Aufmass-Termin" (Termin im Kalender). Die Ziele bekommen die Daten
// als Vorbelegung in der Adresse; nichts wird ohne Klick gespeichert.
//
// Befund HW-12: Das „Angebot" am Lead war nur ein Text (leads.angebot_entwurf),
// kein Datensatz in angebote — es fehlte im Zusage-Link, im Auftrag, in der
// Rechnung. Ein Weg zum Aufmass-Termin fehlte ganz.
//
// Reine Logik, node-testbar. Preise werden NIE vorbelegt (KI schaetzt nie Preise).
// ============================================================================

export interface LeadKurz {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  telefon?: string | null;
  dienstleistung?: string | null;
  menge?: string | null;
  einheit?: string | null;
  nachricht?: string | null;
  kontakt_id?: string | null;
}

export interface Vorbelegung {
  kunde: string;
  email: string;
  kontakt: string;
  titel: string;
  notiz: string;
  ort: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function kurz(v: unknown, max: number): string {
  return String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

function leadNotiz(l: LeadKurz): string {
  const teile = [
    l.dienstleistung ? `Anfrage: ${l.dienstleistung}` : '',
    l.menge ? `Menge laut Anfrage: ${l.menge}${l.einheit ? ' ' + l.einheit : ''}` : '',
    l.telefon ? `Telefon: ${l.telefon}` : '',
    l.nachricht ? `Nachricht: ${l.nachricht}` : '',
  ].filter(Boolean);
  return kurz(teile.join(' · '), 800);
}

function url(pfad: string, werte: Record<string, string>): string {
  const q = new URLSearchParams({ neu: '1' });
  for (const [k, v] of Object.entries(werte)) if (v) q.set(k, v);
  return `${pfad}?${q.toString()}`;
}

/** Link „Angebot anlegen" mit Kunde, Kontakt, Titel und Anfrage als Notiz. */
export function angebotAusLeadUrl(l: LeadKurz): string {
  return url('/dashboard/angebote', {
    kunde: kurz(l.name, 120),
    email: kurz(l.email, 160),
    kontakt: UUID.test(String(l.kontakt_id ?? '')) ? String(l.kontakt_id) : '',
    titel: kurz(l.dienstleistung ? `Angebot ${l.dienstleistung}` : 'Angebot', 120),
    notiz: leadNotiz(l),
  });
}

/** Link „Aufmass-Termin" mit Titel, Kunde, Kontakt und Anfrage als Notiz. */
export function aufmassTerminUrl(l: LeadKurz): string {
  return url('/dashboard/termine', {
    titel: kurz(`Aufmaß: ${l.name || 'Kunde'}${l.dienstleistung ? ' – ' + l.dienstleistung : ''}`, 120),
    email: kurz(l.email, 160),
    kontakt: UUID.test(String(l.kontakt_id ?? '')) ? String(l.kontakt_id) : '',
    notiz: leadNotiz(l),
  });
}

/** Liest die Vorbelegung aus der Adresse — nur mit „neu=1", alles gekuerzt. */
export function vorbelegungLesen(suche: string | URLSearchParams | null | undefined): Vorbelegung | null {
  const q = typeof suche === 'string' ? new URLSearchParams(suche) : (suche ?? new URLSearchParams());
  if (q.get('neu') !== '1') return null;
  const kontakt = q.get('kontakt') || '';
  return {
    kunde: kurz(q.get('kunde'), 120),
    email: kurz(q.get('email'), 160),
    kontakt: UUID.test(kontakt) ? kontakt : '',
    titel: kurz(q.get('titel'), 120),
    notiz: kurz(q.get('notiz'), 800),
    ort: kurz(q.get('ort'), 160),
  };
}
