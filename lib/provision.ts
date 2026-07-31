// lib/provision.ts
// Provisionsverwaltung: rechnet Verkaufsprovisionen aus GEWONNENEN Deals,
// gruppiert nach Empfänger und trennt offen / ausgezahlt.
// Reine Formeln — KEINE Supabase-Aufrufe, KEINE React-Hooks (Client + Node).
// Node-getestet (provision.test.ts).

export interface ProvisionDeal {
  id?: string;
  titel?: string | null;
  wert_netto?: number | string | null;
  stufe?: string | null;
  provision_prozent?: number | string | null;
  provision_empfaenger?: string | null;
  provision_ausgezahlt?: boolean | null;
}

function z(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') { const n = Number(x.replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }
  return 0;
}
function r2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }

/** Nur gewonnene Deals mit einem Provisionssatz erzeugen eine Provision. */
export function istProvisionsfaehig(d: ProvisionDeal): boolean {
  return d.stufe === 'gewonnen' && z(d.provision_prozent) > 0;
}

/** Provisionsbetrag eines Deals = Wert netto × Satz. 0, wenn nicht fällig. */
export function provisionBetrag(d: ProvisionDeal): number {
  if (!istProvisionsfaehig(d)) return 0;
  return r2(z(d.wert_netto) * (z(d.provision_prozent) / 100));
}

export function empfaengerName(d: ProvisionDeal): string {
  const n = (d.provision_empfaenger ?? '').trim();
  return n || 'Ohne Empfänger';
}

export interface EmpfaengerZeile {
  empfaenger: string;
  anzahl: number;
  gesamt: number;
  offen: number;
  ausgezahlt: number;
}

/** Gruppiert provisionsfähige Deals nach Empfänger (alphabetisch). */
export function proEmpfaenger(deals: ProvisionDeal[]): EmpfaengerZeile[] {
  const map = new Map<string, EmpfaengerZeile>();
  for (const d of deals || []) {
    if (!istProvisionsfaehig(d)) continue;
    const name = empfaengerName(d);
    const betrag = provisionBetrag(d);
    const row = map.get(name) ?? { empfaenger: name, anzahl: 0, gesamt: 0, offen: 0, ausgezahlt: 0 };
    row.anzahl += 1;
    row.gesamt = r2(row.gesamt + betrag);
    if (d.provision_ausgezahlt) row.ausgezahlt = r2(row.ausgezahlt + betrag);
    else row.offen = r2(row.offen + betrag);
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => a.empfaenger.localeCompare(b.empfaenger, 'de'));
}

export interface ProvisionSummen {
  gesamt: number;
  offen: number;
  ausgezahlt: number;
  anzahlDeals: number;
  anzahlEmpfaenger: number;
}

export function provisionSummen(deals: ProvisionDeal[]): ProvisionSummen {
  let gesamt = 0, offen = 0, ausgezahlt = 0, anzahl = 0;
  const namen = new Set<string>();
  for (const d of deals || []) {
    if (!istProvisionsfaehig(d)) continue;
    const b = provisionBetrag(d);
    gesamt += b; anzahl += 1; namen.add(empfaengerName(d));
    if (d.provision_ausgezahlt) ausgezahlt += b; else offen += b;
  }
  return { gesamt: r2(gesamt), offen: r2(offen), ausgezahlt: r2(ausgezahlt), anzahlDeals: anzahl, anzahlEmpfaenger: namen.size };
}

export function formatEuro(n: unknown): string {
  return z(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
