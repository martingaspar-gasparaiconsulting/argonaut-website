// ARGONAUT OS · lib/verkaufsteam.ts — Paket 358 (13.10.2026)
// VK1 Verkaufsteam, Teil 1: Zuständige an Leads (Setter und Closer getrennt),
// Funktion je Person, „Meine"-Ansichten, freie Setter.
//
// Reine Logik (node-getestet in tests/verkaufsteamP358). Dieselben Regeln wie
// supabase-sql/p358-verkaufsteam-zustaendige.sql:
//   · Zuständige gehören zum Betrieb (Geschäftsleitung oder Mitarbeiter mit Anmeldung).
//   · Ein freier Setter sieht nur Leads, bei denen er Setter oder Closer ist,
//     und keine Deals (keine Geldzahlen); Zuständige ändert er nicht.
// „Setter" heißt hier die Person im Verkaufsteam — nicht der Website-Berater
// aus lib/setter.ts.
//
// Keine Supabase-, React- oder Next-Abhängigkeit.
// ============================================================================

export const FUNKTIONEN = Object.freeze([
  { key: 'setter', name: 'Setter', text: 'ruft an, qualifiziert, bucht Termine' },
  { key: 'closer', name: 'Closer', text: 'führt das Verkaufsgespräch und schließt ab' },
  { key: 'teamleitung', name: 'Teamleitung', text: 'verteilt Leads und sieht das ganze Team' },
] as const);
export type Funktion = (typeof FUNKTIONEN)[number]['key'];
const KEYS: readonly string[] = FUNKTIONEN.map((f) => f.key);

export function istFunktion(x: unknown): x is Funktion {
  return typeof x === 'string' && KEYS.includes(x);
}
export function funktionName(k: string | null | undefined): string {
  return FUNKTIONEN.find((f) => f.key === k)?.name ?? '—';
}

export type MitarbeiterRoh = { auth_user_id: string | null; vorname?: string | null; nachname?: string | null; status?: string | null };
export type FunktionRoh = { user_id: string; funktion: string | null; frei: boolean | null; aktiv: boolean | null };
export type Person = { user_id: string; name: string; funktion: Funktion | null; frei: boolean; aktiv: boolean; chef: boolean };

const AUS = ['ausgeschieden', 'inaktiv', 'gekuendigt', 'gekündigt'];

/** Team aus Geschäftsleitung + Mitarbeitern mit Anmeldung + Funktionen. Ohne Anmeldung kann niemand zuständig sein. */
export function teamAufbauen(chefId: string | null, mitarbeiter: readonly MitarbeiterRoh[], funktionen: readonly FunktionRoh[]): Person[] {
  const f = new Map(funktionen.map((x) => [x.user_id, x]));
  const out: Person[] = [];
  const gesehen = new Set<string>();
  const dazu = (id: string, name: string, chef: boolean, aktivMa: boolean) => {
    if (gesehen.has(id)) return;
    gesehen.add(id);
    const fx = f.get(id);
    out.push({
      user_id: id, name, chef,
      funktion: istFunktion(fx?.funktion) ? fx!.funktion as Funktion : null,
      frei: !chef && fx?.frei === true,
      aktiv: aktivMa && fx?.aktiv !== false,
    });
  };
  if (chefId) dazu(chefId, 'Geschäftsleitung', true, true);
  for (const m of mitarbeiter) {
    if (!m.auth_user_id) continue;
    const name = [m.vorname, m.nachname].map((t) => String(t ?? '').trim()).filter(Boolean).join(' ') || 'Mitarbeiter';
    dazu(m.auth_user_id, name, false, !AUS.includes(String(m.status ?? '').toLowerCase()));
  }
  return out.sort((a, b) => Number(b.chef) - Number(a.chef) || a.name.localeCompare(b.name, 'de'));
}

export function personName(team: readonly Person[], id: string | null | undefined): string | null {
  if (!id) return null;
  return team.find((p) => p.user_id === id)?.name ?? 'nicht mehr im Team';
}

/** Auswahl für Setter bzw. Closer: aktive Personen, passende Funktion (und Teamleitung) zuerst. */
export function auswahl(team: readonly Person[], rolle: 'setter' | 'closer', aktuell?: string | null): Person[] {
  const rang = (p: Person) => (p.funktion === rolle ? 0 : p.funktion === 'teamleitung' ? 1 : p.funktion ? 3 : 2);
  return team
    .filter((p) => (p.aktiv && !(rolle === 'closer' && p.frei)) || p.user_id === aktuell)
    .slice()
    .sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, 'de'));
}

export type Zustaendig = { setter_user_id?: string | null; closer_user_id?: string | null };

/** Meine Rolle an einem Lead. */
export function meineRolle(l: Zustaendig, ich: string | null | undefined): 'setter' | 'closer' | 'beides' | null {
  if (!ich) return null;
  const s = l.setter_user_id === ich, c = l.closer_user_id === ich;
  return s && c ? 'beides' : s ? 'setter' : c ? 'closer' : null;
}

export type ZFilter = 'alle' | 'meine' | 'ohne' | string;
/** Filter „Zuständig": alle, meine, ohne Zuständige oder eine bestimmte Person. */
export function nachZustaendig<T extends Zustaendig>(liste: readonly T[], filter: ZFilter, ich: string | null | undefined): T[] {
  if (filter === 'alle') return liste.slice();
  if (filter === 'meine') return liste.filter((l) => meineRolle(l, ich) !== null);
  if (filter === 'ohne') return liste.filter((l) => !l.setter_user_id && !l.closer_user_id);
  return liste.filter((l) => l.setter_user_id === filter || l.closer_user_id === filter);
}

/** Kurztext „Setter: Anna · Closer: Ben" bzw. null, wenn niemand zuständig ist. */
export function zustaendigText(l: Zustaendig, team: readonly Person[]): string | null {
  const t = [
    l.setter_user_id ? `Setter: ${personName(team, l.setter_user_id)}` : '',
    l.closer_user_id ? `Closer: ${personName(team, l.closer_user_id)}` : '',
  ].filter(Boolean);
  return t.length ? t.join(' · ') : null;
}

/** Prüfung vor dem Speichern — wie der Datenbank-Wächter. */
export function zuweisungPruefen(neu: Zustaendig, team: readonly Person[], ichFrei: boolean): string[] {
  const f: string[] = [];
  if (ichFrei) f.push('Zuständige ändert die Geschäftsleitung oder die Teamleitung.');
  for (const [k, n] of [['setter_user_id', 'Setter'], ['closer_user_id', 'Closer']] as const) {
    const id = neu[k];
    if (id && !team.some((p) => p.user_id === id)) f.push(`Der ${n} gehört nicht zu Ihrem Team.`);
  }
  const closer = team.find((p) => p.user_id === neu.closer_user_id);
  if (closer?.frei) f.push('Ein freier Setter kann nicht Closer sein — er sieht keine Deals.');
  return f;
}

/** Werte für das Speichern einer Funktion (Geschäftsleitung nie frei). */
export function funktionWerte(p: Person, funktion: string | null, frei: boolean, aktiv: boolean): { user_id: string; funktion: Funktion | null; frei: boolean; aktiv: boolean } {
  return { user_id: p.user_id, funktion: istFunktion(funktion) ? funktion : null, frei: p.chef ? false : frei, aktiv };
}

export type LeadKurz = Zustaendig & { status?: string | null; stufe?: string | null };
const ZU = ['gewonnen', 'verloren', 'kunde'];
/** Offen = weder gewonnen/Kunde noch verloren (Stufe vor Status). */
export function istOffen(l: LeadKurz): boolean {
  if (l.stufe) return !ZU.includes(l.stufe);
  return !ZU.includes(String(l.status ?? ''));
}

export type Zeile = { person: Person; setter: number; closer: number; offen: number };
/** Übersicht je Person: wie viele Leads als Setter, als Closer, davon offen. Plus Leads ohne Zuständige. */
export function uebersicht(team: readonly Person[], leads: readonly LeadKurz[]): { zeilen: Zeile[]; ohne: number; ohneOffen: number } {
  const zeilen = team.map((p) => {
    const meine = leads.filter((l) => l.setter_user_id === p.user_id || l.closer_user_id === p.user_id);
    return {
      person: p,
      setter: leads.filter((l) => l.setter_user_id === p.user_id).length,
      closer: leads.filter((l) => l.closer_user_id === p.user_id).length,
      offen: meine.filter(istOffen).length,
    };
  });
  const ohne = leads.filter((l) => !l.setter_user_id && !l.closer_user_id);
  return { zeilen, ohne: ohne.length, ohneOffen: ohne.filter(istOffen).length };
}
