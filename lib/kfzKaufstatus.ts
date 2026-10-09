// ============================================================================
// ARGONAUT OS · lib/kfzKaufstatus.ts — Paket 281 (09.10.2026) · K15a Kaufstatus im Kundenportal
//
// Reine Logik:
//   kaufSchritte      Fortschritt des Kaufs (reserviert -> Vertrag -> Zulassung -> abholbereit -> übergeben)
//   portalSichtbar    welche Vorgänge der Käufer sieht (nie Angebot-Entwurf, nie storniert)
//   portalKauf        was ins Portal geht — Positivliste, keine FIN, kein Einkauf, keine Notizen
//   kontaktVorschlag  Käufer zu vorhandenem Kontakt: nur über die E-Mail (eindeutig), nie über den Namen
//   kontaktAusKaeufer neuer Kontakt aus den Käuferdaten
//
// KEINE Hooks, keine Systemuhr („heute" kommt als Parameter). Node-testbar.
// ============================================================================

import { betraege } from './kfzVerkauf';
import { nameSplit } from './leadKontakt';

export type Stand = 'erledigt' | 'aktiv' | 'offen';
export type Schritt = { key: string; label: string; datum: string | null; stand: Stand; text: string | null };

export type KaufVorgang = {
  nr: string | null; status: string; reserviert_bis: string | null; vertrag_am: string | null;
  liefertermin: string | null; uebergabe_am: string | null;
  preis_brutto: number | null; zusatz: unknown; inzahlung_ankauf_id: string | null; inzahlung_betrag: number | null; anzahlung: number | null;
};
export type KaufFahrzeug = { marke: string | null; modell: string | null; variante: string | null; erstzulassung: string | null; farbe: string | null };
export type KaufZulassung = { art: string; status: string; termin: string | null; kennzeichen_neu: string | null } | null;

const ZUL_ART: Record<string, string> = {
  zulassung: 'Zulassung', ummeldung: 'Ummeldung', abmeldung: 'Abmeldung', ausfuhr: 'Ausfuhrkennzeichen', kurzzeit: 'Kurzzeitkennzeichen',
};
const ZUL_STATUS: Record<string, string> = { offen: 'in Vorbereitung', beim_amt: 'bei der Zulassungsstelle', erledigt: 'erledigt' };

function istTag(t: unknown): t is string { return typeof t === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t); }
function tag(t: string | null | undefined): string | null { return istTag(t) ? t.slice(0, 10) : null; }

/** Der Käufer sieht seinen Kauf ab „reserviert" — kein Angebot (kann noch Entwurf sein), nichts Storniertes. */
export function portalSichtbar(status: string): boolean {
  return status === 'reserviert' || status === 'vertrag' || status === 'uebergeben';
}

/** Fortschritt in Schritten. Zulassung erscheint nur, wenn ein Zulassungsauftrag läuft. */
export function kaufSchritte(v: Pick<KaufVorgang, 'status' | 'reserviert_bis' | 'vertrag_am' | 'liefertermin' | 'uebergabe_am'>, z: KaufZulassung, heute: string): Schritt[] {
  const st = v.status;
  const vertrag = st === 'vertrag' || st === 'uebergeben';
  const uebergeben = st === 'uebergeben';
  const zul = z && z.status !== 'storniert' ? z : null;
  const aus: Schritt[] = [];
  aus.push({
    key: 'reserviert', label: 'Fahrzeug für Sie reserviert', datum: null,
    stand: vertrag ? 'erledigt' : 'aktiv',
    text: !vertrag && tag(v.reserviert_bis) ? `reserviert bis ${de(tag(v.reserviert_bis) as string)}` : null,
  });
  aus.push({ key: 'vertrag', label: 'Kaufvertrag geschlossen', datum: tag(v.vertrag_am), stand: vertrag ? 'erledigt' : 'offen', text: null });
  if (zul) {
    const fertig = zul.status === 'erledigt';
    aus.push({
      key: 'zulassung', label: ZUL_ART[zul.art] ?? 'Zulassung', datum: tag(zul.termin),
      stand: fertig || uebergeben ? 'erledigt' : vertrag ? 'aktiv' : 'offen',
      text: fertig ? (zul.kennzeichen_neu ? `erledigt · Kennzeichen ${zul.kennzeichen_neu}` : 'erledigt') : (ZUL_STATUS[zul.status] ?? null),
    });
  }
  const lt = tag(v.liefertermin);
  const bereitAktiv = vertrag && !uebergeben && (!zul || zul.status === 'erledigt');
  aus.push({
    key: 'bereit', label: 'Abholung / Übergabe geplant', datum: lt,
    stand: uebergeben ? 'erledigt' : bereitAktiv ? 'aktiv' : 'offen',
    text: !uebergeben && lt ? (lt < heute ? 'Termin bitte mit uns abstimmen' : `geplant am ${de(lt)}`) : null,
  });
  aus.push({ key: 'uebergeben', label: 'Fahrzeug übergeben', datum: tag(v.uebergabe_am), stand: uebergeben ? 'erledigt' : 'offen', text: uebergeben ? 'Gute Fahrt!' : null });
  // Ergebnis: vor der Übergabe genau ein Schritt „aktiv" (Test prüft alle Kombinationen), danach keiner
  return aus;
}

function de(t: string): string { return `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`; }

export type BriefStand = 'beim_haendler' | 'zulassung' | 'uebergeben' | null;
/** Fahrzeugbrief (ZB II) aus dem Tresor: nur grob, ohne Ort oder Personen. */
export function briefStand(status: string | null | undefined): BriefStand {
  if (!status) return null;
  if (status === 'beim_kaeufer') return 'uebergeben';
  if (status === 'bei_zulassung') return 'zulassung';
  if (status === 'fehlt') return null;
  return 'beim_haendler';
}

export type PortalKauf = {
  nr: string | null; fahrzeug: string; erstzulassung: string | null; farbe: string | null;
  statusText: string; schritte: Schritt[];
  geld: { gesamt: number; anzahlung: number; inzahlung: number; rest: number };
  brief: BriefStand;
};

const STATUS_TEXT: Record<string, string> = { reserviert: 'Reserviert', vertrag: 'Kaufvertrag geschlossen', uebergeben: 'Übergeben' };

/** Was der Käufer sieht. Bewusst NICHT: FIN, Kennzeichen des Händlers, Einkauf, Kalkulation, Notizen, Mitarbeiter. */
export function portalKauf(v: KaufVorgang, fz: KaufFahrzeug | null, z: KaufZulassung, briefStatus: string | null, heute: string): PortalKauf | null {
  if (!portalSichtbar(v.status)) return null;
  const b = betraege({ preis_brutto: v.preis_brutto, zusatz: v.zusatz as never, inzahlung_ankauf_id: v.inzahlung_ankauf_id, inzahlung_betrag: v.inzahlung_betrag, anzahlung: v.anzahlung });
  const ez = tag(fz?.erstzulassung);
  return {
    nr: v.nr,
    fahrzeug: [fz?.marke, fz?.modell, fz?.variante].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ') || 'Ihr Fahrzeug',
    erstzulassung: ez ? `${ez.slice(5, 7)}/${ez.slice(0, 4)}` : null,
    farbe: String(fz?.farbe ?? '').trim() || null,
    statusText: STATUS_TEXT[v.status] ?? v.status,
    schritte: kaufSchritte(v, z, heute),
    geld: { gesamt: b.gesamt, anzahlung: b.anzahlung, inzahlung: b.inzahlung, rest: b.rest },
    brief: briefStand(briefStatus),
  };
}

// ---------------------------------------------------------------------------
// Käufer <-> Kontakt
// ---------------------------------------------------------------------------

export type KontaktMini = { id: string; email: string | null; vorname?: string | null; nachname?: string | null; firma?: string | null };

export function mailNorm(m: string | null | undefined): string {
  return String(m ?? '').trim().toLowerCase();
}

/**
 * Vorschlag für einen vorhandenen Kontakt — NUR über die E-Mail und nur, wenn
 * genau ein Kontakt passt. Gleiche Namen reichen nie (falsche Person = Datenleck im Portal).
 */
export function kontaktVorschlag(kaeuferEmail: string | null, kontakte: KontaktMini[]): { art: 'treffer'; kontakt: KontaktMini } | { art: 'mehrdeutig'; anzahl: number } | { art: 'keiner' } {
  const m = mailNorm(kaeuferEmail);
  if (!m || !m.includes('@')) return { art: 'keiner' };
  const t = kontakte.filter((k) => mailNorm(k.email) === m);
  if (t.length === 1) return { art: 'treffer', kontakt: t[0] };
  if (t.length > 1) return { art: 'mehrdeutig', anzahl: t.length };
  return { art: 'keiner' };
}

/** Neuer Kontakt aus den Käuferdaten des Verkaufs. */
export function kontaktAusKaeufer(v: { nr: string | null; kaeufer_name: string | null; kaeufer_firma: string | null; kaeufer_email: string | null; kaeufer_tel: string | null; kaeufer_anschrift: string | null }): Record<string, unknown> | null {
  const name = String(v.kaeufer_name ?? '').trim();
  const firma = String(v.kaeufer_firma ?? '').trim();
  if (!name && !firma) return null;
  const { vorname, nachname } = nameSplit(name || null);
  const notiz = [`Käufer aus Fahrzeugverkauf ${v.nr ?? ''}`.trim() + '.'];
  const an = String(v.kaeufer_anschrift ?? '').trim();
  if (an) notiz.push('Anschrift: ' + an.replace(/\s*\n\s*/g, ', '));
  return {
    vorname, nachname, firma: firma || null,
    email: String(v.kaeufer_email ?? '').trim() || null,
    telefon: String(v.kaeufer_tel ?? '').trim() || null,
    position: null, status: 'kunde', quelle: 'Fahrzeugverkauf', betreuungs_intervall_tage: 90,
    notizen: notiz.join('\n'),
  };
}
