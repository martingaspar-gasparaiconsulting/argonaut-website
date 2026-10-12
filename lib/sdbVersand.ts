// ============================================================================
// ARGONAUT OS · lib/sdbVersand.ts — SDB mit der Bestellbestätigung (Paket 328 · S5)
//
// Reine Logik, node-getestet (tests/sdbVersandP328.test.mjs).
//
// REACH Art. 31 Abs. 8: Das Sicherheitsdatenblatt geht kostenlos, auf Papier
// oder elektronisch, spätestens mit der ersten Lieferung an den Abnehmer.
// Art. 31 Abs. 9: Eine neue Fassung geht an alle, die den Stoff in den
// letzten 12 Monaten bekommen haben.
//
//   waehleSdb           je Artikel die Fassung in der Bestell-Sprache, sonst
//                       Deutsch, sonst die erste
//   versandPlan         was an die Bestätigung angehängt wird: nur, was diese
//                       Adresse in dieser Fassung noch nicht bekommen hat; mit
//                       Größen-Deckel; Rest wird als „bitte selbst senden" gemeldet
//   nachversandPlan     Empfänger der letzten 12 Monate, die die aktuelle
//                       Fassung (in ihrer Sprache) noch nicht haben
//   anhangName          Dateiname ohne Sonderzeichen
//
// Wirkt erst nach der Freigabe durch den Anwalt (lib/startSperre „sdbVersand", R49).
// ============================================================================

export type SdbDok = { id: string; artikel_id: string; sprache?: string | null; version?: string | null; datei_bytes?: number | null; datei_pfad?: string | null };
export type VersandZeile = {
  artikel_id: string; dokument_id: string | null; empfaenger_email: string | null;
  status: string; versendet_am: string; sprache?: string | null; empfaenger_name?: string | null;
};

/** Größter Anhang-Umfang je Mail (Resend erlaubt 40 MB, mit Puffer für Base64). */
export const MAX_ANHANG_BYTES = 25 * 1024 * 1024;
export const NACHVERSAND_TAGE = 365;
export const MAX_NACHVERSAND = 200;

export function normMail(m: unknown): string {
  return String(m ?? '').trim().toLowerCase();
}

/** Fassung je Artikel: Bestell-Sprache, sonst Deutsch, sonst die erste (stabil). */
export function waehleSdb(doks: SdbDok[], sprache: string | null | undefined): SdbDok | null {
  const liste = (doks ?? []).filter((d) => d && d.id);
  if (!liste.length) return null;
  const s = String(sprache ?? 'de');
  return liste.find((d) => String(d.sprache ?? 'de') === s)
    ?? liste.find((d) => String(d.sprache ?? 'de') === 'de')
    ?? liste[0];
}

export type PlanEintrag = { artikel_id: string; dok: SdbDok };
export type Plan = {
  anhaengen: PlanEintrag[];
  schonErhalten: PlanEintrag[];
  zuGross: PlanEintrag[];
  ohneSdb: string[];
};

/**
 * Was hängt an der Bestätigung? Je bestelltem Artikel das passende SDB —
 * außer diese Adresse hat genau diese Fassung schon einmal bekommen.
 * Sind die Anhänge zusammen zu groß, bleiben die übrigen als „zu groß" stehen.
 * ohneSdb = bestellte Artikel mit Gefahr-Kennzeichnung, aber ohne SDB.
 */
export function versandPlan(
  artikelIds: string[],
  sdbJe: Record<string, SdbDok[]>,
  bisher: { dokument_id: string | null; empfaenger_email: string | null; status: string }[],
  email: string | null,
  sprache: string | null,
  mitKennzeichnung: string[] = [],
): Plan {
  const mail = normMail(email);
  const erhalten = new Set((bisher ?? [])
    .filter((v) => v.status === 'versendet' && v.dokument_id && normMail(v.empfaenger_email) === mail)
    .map((v) => String(v.dokument_id)));
  const plan: Plan = { anhaengen: [], schonErhalten: [], zuGross: [], ohneSdb: [] };
  let summe = 0;
  for (const id of [...new Set(artikelIds)]) {
    const dok = waehleSdb(sdbJe[id] ?? [], sprache);
    if (!dok) {
      if (mitKennzeichnung.includes(id)) plan.ohneSdb.push(id);
      continue;
    }
    if (mail && erhalten.has(dok.id)) { plan.schonErhalten.push({ artikel_id: id, dok }); continue; }
    const b = Number(dok.datei_bytes) || 0;
    if (summe + b > MAX_ANHANG_BYTES) { plan.zuGross.push({ artikel_id: id, dok }); continue; }
    summe += b;
    plan.anhaengen.push({ artikel_id: id, dok });
  }
  return plan;
}

/** Tag minus n Tage (ISO yyyy-mm-dd, UTC-Rechnung). */
function minusTage(heute: string, n: number): string {
  const [j, m, t] = heute.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Nachversand einer neuen Fassung (REACH Art. 31 Abs. 9): Empfänger der letzten
 * 12 Monate für einen Artikel — je Adresse einmal, mit der Fassung in der Sprache
 * ihrer letzten Sendung (sonst Deutsch). Wer genau diese Fassung schon hat, fällt raus.
 */
export function nachversandPlan(versand: VersandZeile[], artikelId: string, doks: SdbDok[], heute: string): { email: string; name: string | null; sprache: string; dok: SdbDok }[] {
  const grenze = minusTage(heute, NACHVERSAND_TAGE);
  const zeilen = (versand ?? []).filter((v) => v.artikel_id === artikelId && v.status === 'versendet' && normMail(v.empfaenger_email))
    .sort((a, b) => String(b.versendet_am).localeCompare(String(a.versendet_am)));
  const erhalten = new Set(zeilen.map((v) => normMail(v.empfaenger_email) + '|' + String(v.dokument_id)));
  const aus = new Map<string, { email: string; name: string | null; sprache: string; dok: SdbDok }>();
  for (const v of zeilen) {
    const m = normMail(v.empfaenger_email);
    if (String(v.versendet_am).slice(0, 10) < grenze || aus.has(m)) continue;
    const sprache = String(v.sprache ?? 'de');
    const dok = waehleSdb(doks, sprache);
    if (!dok) continue;
    aus.set(m, { email: m, name: v.empfaenger_name ?? null, sprache, dok });
  }
  return [...aus.values()].filter((e) => !erhalten.has(e.email + '|' + e.dok.id)).slice(0, MAX_NACHVERSAND);
}

/** Dateiname für den Anhang: „Sicherheitsdatenblatt - <Artikel> (DE).pdf". */
export function anhangName(artikel: unknown, dok: SdbDok): string {
  const a = String(artikel ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/[^\w\s.-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Artikel';
  const v = dok.version ? ` V${String(dok.version).replace(/[^\w.-]/g, '').slice(0, 20)}` : '';
  return `Sicherheitsdatenblatt - ${a}${v} (${String(dok.sprache ?? 'de').toUpperCase()}).pdf`;
}

/** Zeilen für das Versand-Protokoll nach dem Mailversand. */
export function protokollZeilen(
  plan: Plan, email: string | null, name: string | null, bestellungId: string | null, sprache: string | null, mailOk: boolean,
): { artikel_id: string; dokument_id: string; empfaenger_email: string | null; empfaenger_name: string | null; bestellung_id: string | null; anlass: string; status: string; sprache: string; dokument_version: string | null }[] {
  const basis = (e: PlanEintrag, status: string) => ({
    artikel_id: e.artikel_id, dokument_id: e.dok.id, empfaenger_email: email ? normMail(email) : null,
    empfaenger_name: name ? String(name).slice(0, 200) : null, bestellung_id: bestellungId, anlass: 'bestellung', status,
    sprache: String(e.dok.sprache ?? sprache ?? 'de'), dokument_version: e.dok.version ? String(e.dok.version).slice(0, 40) : null,
  });
  if (!email) return [...plan.anhaengen, ...plan.zuGross].map((e) => basis(e, 'ohne_mail'));
  return [
    ...plan.anhaengen.map((e) => basis(e, mailOk ? 'versendet' : 'fehler')),
    ...plan.zuGross.map((e) => basis(e, 'zu_gross')),
  ];
}

export const STATUS_TEXT: Record<string, string> = {
  versendet: 'versendet',
  fehler: 'Versand fehlgeschlagen — bitte selbst senden',
  zu_gross: 'zu groß für die Mail — bitte selbst senden',
  ohne_mail: 'keine E-Mail — bitte der Lieferung beilegen',
};
