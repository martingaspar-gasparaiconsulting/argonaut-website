// ============================================================================
// ARGONAUT OS · lib/vorbestellShop.ts — Paket 343 (12.10.2026)
// BV3b Feinkost Teil 2: Vorbestellung und Vormerkliste im Shop-Schaufenster
//
// Eine Vorbestell-Aktion (Paket 342) erscheint im Shop des Betriebs nur, wenn
//   1. die Geschäftsleitung bzw. wer „Lebensmittel“ ändern darf sie mit
//      „im Shop zeigen“ eingeschaltet hat (Spalte vorbestell_aktion.im_shop),
//   2. sie mit einem Artikel verknüpft ist, der aktiv ist und einen Preis hat
//      (der Preis kommt IMMER vom Artikel, nie aus dem Browser),
//   3. die Einheit der Aktion zur Preis-Einheit des Artikels passt
//      (sonst stimmt „Preis je kg“ nicht mit der vorbestellten Menge überein),
//   4. zum Artikel ein Etikett mit allen LMIV-Pflichtangaben für den
//      Fernabsatz vorliegt (Art. 14 LMIV: vor dem Kauf verfügbar — außer MHD),
//   5. sie gerade vorbestellbar oder ausgebucht ist (ausgebucht -> Vormerkliste).
// Und nur, wenn die Start-Schalter „shop“ UND „vorbestellShop“ frei sind
// (lib/startSperre.ts, Anwalt R52/R53) — das prüft der Server.
//
// Diese Datei prüft und baut die öffentliche Ansicht (Positivliste der Felder).
// Die Datenbank (Wächter p342) lässt ohnehin nie mehr zu, als da ist.
// Keine Hooks, kein Supabase — node-testbar (tests/vorbestellShopP343.test.mjs).
// ============================================================================

import { centRunden, leseZahl, rundeStellen } from './zahlen';
import { allergenNamen, fehlendePflichtangaben, NAEHRWERT_FELDER, parseAllergene, zutatenSegmente, type EtikettLite } from './etiketten';
import { oeffentlichBestellbar } from './shopUebernahme';
import { BELEGT_STATUS, mengeText, datumKurz, postenPruefen, type Aktion, type AktionStand, type Posten } from './vorbestellAktion';

// --- Einheiten ------------------------------------------------------------------

/** Artikel-Einheit (frei eingegeben) auf die Einheiten der Aktion abbilden. */
export function einheitNorm(x: unknown): 'kg' | 'g' | 'l' | 'Stk' | null {
  const s = String(x ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!s) return null;
  if (['kg', 'kilo', 'kilogramm'].includes(s)) return 'kg';
  if (['g', 'gr', 'gramm'].includes(s)) return 'g';
  if (['l', 'ltr', 'liter'].includes(s)) return 'l';
  if (['stk', 'st', 'stück', 'stueck', 'stck', 'pcs'].includes(s)) return 'Stk';
  return null;
}

/** Ware nach Gewicht: der Endpreis ergibt sich bei der Abholung (Wiegen). */
export function nachGewicht(einheit: string | null | undefined): boolean {
  return einheit === 'kg' || einheit === 'g';
}

// --- LMIV im Fernabsatz -----------------------------------------------------------

/**
 * Pflichtangaben, die vor dem Kauf im Shop stehen müssen (LMIV Art. 14 Abs. 1):
 * alles aus Art. 9 außer dem Mindesthaltbarkeitsdatum. Lose Ware (LMIDV):
 * Bezeichnung und Allergene.
 */
export function fernabsatzFehlend(e: EtikettLite | null | undefined): string[] {
  if (!e) return ['Etikett'];
  return fehlendePflichtangaben(e).filter((x) => x !== 'Mindesthaltbarkeitsdatum');
}

export type EtikettZeile = EtikettLite & {
  id?: string; artikel_id?: string | null; status?: string | null;
  spuren?: string | null; aufbewahrung?: string | null; naehrwert_basis?: string | null;
};

/** Das passende Etikett zum Artikel: aktiv, vollständige zuerst. */
export function etikettZumArtikel<T extends EtikettZeile>(etiketten: T[] | null | undefined, artikelId: string | null | undefined): T | null {
  if (!artikelId) return null;
  const passend = (etiketten ?? []).filter((e) => e && e.artikel_id === artikelId && (e.status == null || e.status === 'aktiv'));
  return passend.find((e) => fernabsatzFehlend(e).length === 0) ?? passend[0] ?? null;
}

export type ShopArtikel = {
  id: string; bezeichnung?: string | null; verkaufspreis?: unknown; einheit?: string | null;
  aktiv?: boolean | null; shop_mwst?: unknown; shop_beschreibung?: string | null; shop_bild_url?: string | null;
};

export type ShopAktionZeile = Aktion & { id: string; im_shop?: boolean | null; artikel_id?: string | null };

/**
 * Warum die Aktion (noch) nicht im Shop stehen kann — leer = bereit.
 * Dieselbe Prüfung nutzt der Server (öffentliche Schnittstellen) und die
 * Seite „Vorbestellung“ (Anzeige für den Betrieb).
 */
export function shopBereitschaft(a: ShopAktionZeile, artikel: ShopArtikel | null | undefined, etikett: EtikettZeile | null | undefined): string[] {
  const g: string[] = [];
  if (!a.artikel_id) return ['Kein Artikel verknüpft — Preis und Pflichtangaben kommen vom Artikel. Bitte unter „Ändern“ einen Artikel wählen.'];
  if (!artikel || artikel.id !== a.artikel_id) return ['Der verknüpfte Artikel ist nicht mehr da.'];
  if (!oeffentlichBestellbar({ ...artikel, verkaufspreis: artikel.verkaufspreis } as Parameters<typeof oeffentlichBestellbar>[0])) {
    g.push('Der Artikel ist ausgelistet oder hat keinen Verkaufspreis.');
  }
  const e = einheitNorm(artikel.einheit);
  if (e !== a.einheit) g.push(`Die Einheit passt nicht: Aktion in ${a.einheit}, Preis des Artikels je ${String(artikel.einheit ?? '').trim() || '—'}.`);
  if (!etikett) g.push('Zum Artikel gibt es kein Etikett mit den Pflichtangaben — bitte unter „Etiketten“ anlegen und den Artikel zuordnen.');
  else {
    const f = fernabsatzFehlend(etikett);
    if (f.length) g.push(`Im Etikett fehlen Pflichtangaben: ${f.join(', ')}.`);
  }
  return g;
}

/** Zahl für die Anzeige der Pflichtangaben (deutsch, höchstens 2 Stellen). */
function nw(x: unknown): string | null {
  const n = leseZahl(x);
  if (n === null) return null;
  return rundeStellen(n, 2).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}
const kurz = (x: unknown, max: number) => {
  const s = String(x ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

export type ShopLmiv = {
  lose: boolean;
  bezeichnung: string;
  zutaten: { t: string; b: boolean }[];
  allergene: string[];
  spuren: string | null;
  nettomenge: string | null;
  verantwortlicher: string | null;
  aufbewahrung: string | null;
  naehrwert_basis: string | null;
  naehrwerte: { label: string; wert: string; unter: boolean }[];
};

/** Pflichtangaben für das Schaufenster — nur diese Felder, gekürzt, immer Deutsch. */
export function lmivFuerShop(e: EtikettZeile): ShopLmiv {
  const lose = (e.art ?? 'verpackt') === 'lose';
  const keys = parseAllergene(e.allergene);
  const naehrwerte: ShopLmiv['naehrwerte'] = [];
  if (!lose) {
    for (const f of NAEHRWERT_FELDER) {
      const w = nw((e as Record<string, unknown>)[f.key]);
      if (w !== null) naehrwerte.push({ label: f.label, wert: `${w} ${f.einheit}`, unter: !!f.unter });
    }
  }
  return {
    lose,
    bezeichnung: kurz(e.bezeichnung, 160) ?? '',
    zutaten: lose ? [] : zutatenSegmente(kurz(e.zutaten, 2000) ?? '', keys).map((s) => ({ t: s.t, b: s.bold })),
    allergene: allergenNamen(keys),
    spuren: kurz(e.spuren, 300),
    nettomenge: lose ? null : kurz(e.nettomenge, 60),
    verantwortlicher: kurz(e.verantwortlicher, 300),
    aufbewahrung: kurz(e.aufbewahrung, 300),
    naehrwert_basis: lose ? null : (kurz(e.naehrwert_basis, 20) ?? '100 g'),
    naehrwerte,
  };
}

// --- Öffentliche Ansicht einer Aktion --------------------------------------------------

export type ShopAktion = {
  id: string; titel: string; einheit: string; nach_gewicht: boolean;
  phase: 'vorbestellbar' | 'ausgebucht';
  frei: number; max_je_kunde: number | null;
  abhol_von: string; abhol_bis: string; bestell_schluss: string | null;
  preis: number; mwst: number;
  name: string; beschreibung: string; bild: string;
  lmiv: ShopLmiv;
};

/**
 * Die Aktion fürs Schaufenster — oder null, wenn sie nicht gezeigt wird.
 * `preis` ist der Endkundenpreis je Einheit (vom Server aus dem Artikel gerechnet).
 */
export function shopAktion(
  a: ShopAktionZeile, stand: AktionStand, artikel: ShopArtikel | null | undefined, etikett: EtikettZeile | null | undefined,
  preis: number, mwst: number,
): ShopAktion | null {
  if (a.im_shop !== true || a.status !== 'offen') return null;
  if (stand.phase !== 'vorbestellbar' && stand.phase !== 'ausgebucht') return null;
  if (shopBereitschaft(a, artikel, etikett).length || !artikel || !etikett) return null;
  if (!(preis > 0)) return null;
  return {
    id: a.id,
    titel: kurz(a.titel, 120) ?? '',
    einheit: a.einheit,
    nach_gewicht: nachGewicht(a.einheit),
    phase: stand.phase,
    frei: stand.frei,
    max_je_kunde: a.max_je_kunde,
    abhol_von: a.abhol_von,
    abhol_bis: a.abhol_bis,
    bestell_schluss: a.bestell_schluss,
    preis,
    mwst,
    name: kurz(artikel.bezeichnung, 200) ?? '',
    beschreibung: kurz(artikel.shop_beschreibung, 600) ?? '',
    bild: kurz(artikel.shop_bild_url, 500) ?? '',
    lmiv: lmivFuerShop(etikett),
  };
}

// --- Eingaben aus dem Shop ------------------------------------------------------------

const telZiffern = (t: unknown) => String(t ?? '').replace(/\D/g, '');
const mailKlein = (m: unknown) => String(m ?? '').trim().toLowerCase();

/** Was dieser Kunde (gleiche E-Mail oder Telefonnummer) in der Aktion schon vorbestellt hat. */
export function kundeBisher(posten: Posten[], mail: string | null, tel: string | null): number {
  const m = mailKlein(mail), t = telZiffern(tel);
  let s = 0;
  for (const p of posten) {
    if (!BELEGT_STATUS.includes(p.status)) continue;
    const gleich = (m && mailKlein(p.kunde_mail) === m) || (t.length >= 5 && telZiffern(p.kunde_tel) === t);
    if (gleich && Number.isFinite(p.menge)) s += p.menge;
  }
  return rundeStellen(s, 3);
}

/** Steht dieser Kunde schon auf der Vormerkliste (wartet oder benachrichtigt)? */
export function schonVorgemerkt(vm: { kunde_mail?: string | null; kunde_tel?: string | null; status: string }[], mail: string | null, tel: string | null): boolean {
  const m = mailKlein(mail), t = telZiffern(tel);
  return vm.some((v) => (v.status === 'wartet' || v.status === 'benachrichtigt')
    && ((m && mailKlein(v.kunde_mail) === m) || (t.length >= 5 && telZiffern(v.kunde_tel) === t)));
}

export type ShopEingabe = { name: string; mail: string; tel: string; menge: number | null; tag: string };

/** Rohe Felder aus dem Shop lesen (Text begrenzt, Menge über den gemeinsamen Zahlen-Leser). */
export function shopEingabe(b: Record<string, unknown>): ShopEingabe {
  const t = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const m = typeof b.menge === 'number' || typeof b.menge === 'string' ? leseZahl(b.menge) : null;
  return { name: t(b.name, 120), mail: t(b.email, 160), tel: t(b.telefon, 40), menge: m, tag: t(b.abhol_tag, 10) };
}

type Pruef = { ok: true; felder: Record<string, unknown> } | { ok: false; fehler: string };

/**
 * Vorbestellung aus dem Shop prüfen: wie an der Theke (postenPruefen, Quelle
 * „shop“), dazu die Höchstmenge je Kunde über ALLE seine Vorbestellungen in
 * dieser Aktion — sonst ließe sich die Grenze mit zwei Bestellungen umgehen.
 */
export function shopVorbestellPruefen(e: ShopEingabe, a: Aktion, stand: AktionStand, posten: Posten[]): Pruef {
  if (!stand.buchbar) return { ok: false, fehler: stand.phase === 'ausgebucht' ? 'Leider schon ausgebucht — Sie können sich auf die Vormerkliste setzen.' : 'Diese Ware kann gerade nicht vorbestellt werden.' };
  if (!e.mail && !e.tel) return { ok: false, fehler: 'Bitte E-Mail oder Telefon angeben.' };
  const r = postenPruefen({ kunde_name: e.name, kunde_tel: e.tel, kunde_mail: e.mail, menge: e.menge, abhol_tag: e.tag, quelle: 'shop', notiz: '' }, a, stand.frei);
  if (!r.ok) return r;
  if (a.max_je_kunde !== null) {
    const bisher = kundeBisher(posten, r.felder.kunde_mail as string | null, r.felder.kunde_tel as string | null);
    if (rundeStellen(bisher + (r.felder.menge as number), 3) > a.max_je_kunde) {
      const rest = Math.max(0, rundeStellen(a.max_je_kunde - bisher, 3));
      return { ok: false, fehler: rest > 0 ? `Höchstens ${mengeText(a.max_je_kunde, a.einheit)} je Kunde — Sie haben schon ${mengeText(bisher, a.einheit)} vorbestellt, möglich sind noch ${mengeText(rest, a.einheit)}.` : `Sie haben schon die Höchstmenge von ${mengeText(a.max_je_kunde, a.einheit)} vorbestellt.` };
    }
  }
  return r;
}

/** Voraussichtlicher Preis (Menge × Preis je Einheit), auf Cent. */
export function voraussichtlich(menge: number, preis: number): number {
  return centRunden(menge * preis);
}

// --- Bestätigungs-Mails (Kunde: Deutsch oder Englisch; Betrieb: Deutsch) -------------------

export type VbMail = {
  betreff: string; titel: string; anrede: string; vorbestellt: string; abholung: string; preis: string; gewicht: string;
  zahlung: string; vorgemerkt: string; vormerkInfo: string; vormerkTitel: string; vormerkBetreff: string; gruss: string;
};
const VB_MAIL_DE: VbMail = {
  betreff: 'Ihre Vorbestellung: {titel}',
  titel: 'Vorbestellung eingegangen',
  anrede: 'Guten Tag {name},',
  vorbestellt: 'vielen Dank — Ihre Vorbestellung bei {firma} ist eingegangen: {menge} {titel}.',
  abholung: 'Abholung am {tag}.',
  preis: 'Preis: {preis} je {einheit} inkl. MwSt, voraussichtlich {summe}.',
  gewicht: 'Der Endpreis richtet sich nach dem Gewicht bei der Abholung.',
  zahlung: 'Bezahlung bei der Abholung.',
  vorgemerkt: 'Sie stehen bei {firma} auf der Vormerkliste für {titel} ({menge}).',
  vormerkInfo: 'Wird wieder etwas frei, benachrichtigen wir Sie der Reihe nach. Wenn Sie nicht mehr vorgemerkt sein möchten,antworten Sie einfach auf diese E-Mail.',
  vormerkTitel: 'Vormerkliste',
  vormerkBetreff: '{titel}: Sie stehen auf der Vormerkliste',
  gruss: 'Freundliche Grüße',
};
const VB_MAIL_EN: VbMail = {
  betreff: 'Your pre-order: {titel}',
  titel: 'Pre-order received',
  anrede: 'Hello {name},',
  vorbestellt: 'thank you — your pre-order with {firma} has been received: {menge} {titel}.',
  abholung: 'Collection on {tag}.',
  preis: 'Price: {preis} per {einheit} incl. VAT, approx. {summe}.',
  gewicht: 'The final price depends on the weight at collection.',
  zahlung: 'Payment on collection.',
  vorgemerkt: 'You are on the waiting list of {firma} for {titel} ({menge}).',
  vormerkInfo: 'As soon as something becomes available again, we will notify you in order. If you no longer wish to be on the list, simply reply to this e-mail.',
  vormerkTitel: 'Waiting list',
  vormerkBetreff: '{titel}: you are on the waiting list',
  gruss: 'Kind regards',
};
/** Englisch, wenn auf Englisch bestellt wurde — sonst Deutsch (keine ungeprüften Übersetzungen). */
export function vbMailTexte(sprache: unknown): VbMail {
  return sprache === 'en' ? VB_MAIL_EN : VB_MAIL_DE;
}

/** Abholtag für die Mail. */
export function tagText(iso: string, sprache: unknown): string {
  if (sprache !== 'en') return datumKurz(iso);
  const d = datumKurz(iso);
  return d === '—' ? d : `${d.slice(0, 2)}/${d.slice(3, 5)}/${d.slice(6)}`;
}

/** Menge in der Sprache der Mail (Englisch: „pcs“ statt „Stk“). */
export function mengeFuer(n: number, einheit: string, sprache: unknown): string {
  if (sprache !== 'en') return mengeText(n, einheit);
  return `${rundeStellen(n, 3).toLocaleString('en-GB', { maximumFractionDigits: 3 })} ${einheit === 'Stk' ? 'pcs' : einheit}`;
}
