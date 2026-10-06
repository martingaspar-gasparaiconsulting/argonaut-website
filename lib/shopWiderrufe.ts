// ============================================================================
// ARGONAUT OS · lib/shopWiderrufe.ts — Paket 199 (Entscheidung D6, 04.10.2026)
// Online-Widerrufe aus dem Shop im Dashboard
//
// Seit Paket 161 landet jeder elektronische Widerruf („Widerrufsbutton",
// Pflicht ab 19.06.2026) in shop_widerrufe — sehen konnte ihn der Betrieb
// aber nur in seiner Mail. Jetzt stehen sie auf der Retouren-Seite: offen /
// erledigt, mit einem Knopf, der daraus eine Retoure vorbefüllt.
// Eine Löschfrist für alte Widerrufe kommt erst nach der Anwalts-Antwort (R32).
//
// Reine Funktionen → node --test.
// ============================================================================

export type ShopWiderruf = {
  id: string;
  name: string | null;
  anschrift: string | null;
  email: string | null;
  bestellung: string | null;
  datum: string | null;
  ware: string | null;
  eingang_am: string | null;
  erledigt_am: string | null;
  erledigt_notiz?: string | null;
};

/** YYYY-MM-DD in Berliner Zeit (Eingang kurz nach Mitternacht zählt zum neuen Tag). */
export function tagBerlin(iso: string | null | undefined): string {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

export function istErledigt(w: Pick<ShopWiderruf, 'erledigt_am'> | null | undefined): boolean {
  return !!w && String(w.erledigt_am ?? '').trim() !== '';
}

export function widerrufZahlen(liste: ShopWiderruf[]): { offen: number; erledigt: number } {
  let offen = 0; let erledigt = 0;
  for (const w of liste ?? []) { if (istErledigt(w)) erledigt++; else offen++; }
  return { offen, erledigt };
}

/** Vorbelegung für „Neue Retoure erfassen". Widerruf erklärt am = Eingangstag (Berlin). */
export function widerrufZuRetoure(w: ShopWiderruf): {
  art: 'widerruf'; kunde_name: string; email: string; bestellnummer: string; widerruf_am: string; grund_hinweis: string;
} {
  const kurz = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  return {
    art: 'widerruf',
    kunde_name: kurz(w.name, 200),
    email: kurz(w.email, 200),
    bestellnummer: kurz(w.bestellung, 120),
    widerruf_am: tagBerlin(w.eingang_am),
    grund_hinweis: kurz(w.ware, 300),
  };
}

/** Sortierung: offene zuerst, darin älteste zuerst (die drängen); erledigte danach, neueste zuerst. */
export function sortiereWiderrufe(liste: ShopWiderruf[]): ShopWiderruf[] {
  const zeit = (v: string | null) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : 0; };
  return [...(liste ?? [])].sort((a, b) => {
    const ea = istErledigt(a); const eb = istErledigt(b);
    if (ea !== eb) return ea ? 1 : -1;
    return ea ? zeit(b.eingang_am) - zeit(a.eingang_am) : zeit(a.eingang_am) - zeit(b.eingang_am);
  });
}

/**
 * Paket 216 (§ 356a BGB): Die Eingangsbestätigung nennt Datum UND Uhrzeit des
 * Eingangs, in deutscher Zeit — z. B. „06.10.2026, 09:14 Uhr".
 */
export function eingangZeitBerlin(wann: Date | string | number): string {
  const t = wann instanceof Date ? wann.getTime() : typeof wann === 'number' ? wann : Date.parse(String(wann ?? ''));
  if (!Number.isFinite(t)) return '';
  const teile = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(t));
  const g = (typ: string) => teile.find((p) => p.type === typ)?.value ?? '';
  return `${g('day')}.${g('month')}.${g('year')}, ${g('hour')}:${g('minute')} Uhr`;
}
