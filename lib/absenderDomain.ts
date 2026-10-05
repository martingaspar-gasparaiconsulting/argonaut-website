// ============================================================================
// ARGONAUT OS · lib/absenderDomain.ts — Paket 210 (05.10.2026) · Stufe 3 B7
// Eigene Absender-Domain je Betrieb
//
// HEUTE: Jede Mail, die im Namen eines Betriebs an dessen Kunden geht
// (Rechnung, Termin, Newsletter, Bewertungs-Bitte, Abläufe …), kommt von
// „Firmenname <noreply@argonaut-os.com>". Antworten gehen schon ans Postfach
// des Betriebs (Reply-To), aber die Absender-Adresse ist fremd.
//
// NEU: Der Betreiber legt für einen Betrieb eine eigene Domain bei Resend an
// (z. B. post.mueller-elektro.de). Der Betrieb bzw. sein IT-Dienstleister
// trägt die angezeigten DNS-Einträge ein, danach wird geprüft. Erst wenn
// Resend „verified" meldet UND der Betreiber den Schalter umlegt, gehen die
// Kunden-Mails dieses Betriebs von z. B. „rechnung@post.mueller-elektro.de".
//
// SICHERHEITSNETZ: Lehnt Resend eine Mail wegen der Domain ab (DNS-Eintrag
// später gelöscht, Domain abgelaufen), geht sie sofort noch einmal über die
// Standard-Adresse raus — es geht nie eine Mail verloren.
//
// SCHALTER: Ohne Env RESEND_EIGENE_DOMAINS=an legt der Server nichts bei
// Resend an. Resend Pro enthält 10 Domains (eine davon ist argonaut-os.com),
// Scale 1.000 (Resend-Doku „Account quotas and limits", abgerufen 05.10.2026).
//
// Reine Logik ohne Imports — mit `node --test` prüfbar.
// ============================================================================

/** Die Domain, über die ARGONAUT selbst versendet. Nie für einen Betrieb. */
export const ARGONAUT_DOMAIN = 'argonaut-os.com';

/** Standard-Lokalteil der Absender-Adresse, wenn nichts gewählt ist. */
export const STANDARD_LOKALTEIL = 'post';

/** Wie lange ein gelesener Absender im Server-Speicher gilt (ms). */
export const CACHE_MS = 5 * 60 * 1000;

/** Frühestens nach so vielen Sekunden darf erneut bei Resend geprüft werden. */
export const PRUEF_ABSTAND_S = 60;

/** Freemail-Anbieter: deren Domains gehören nie einem Betrieb. */
const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'web.de', 't-online.de',
  'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'live.com', 'live.de', 'msn.com',
  'yahoo.com', 'yahoo.de', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'aol.de', 'freenet.de',
  'posteo.de', 'mailbox.org', 'arcor.de', 'online.de', 'email.de', 'proton.me', 'protonmail.com',
]);

export type DomainStatus = 'wartet' | 'verifiziert' | 'fehler' | 'entfernt';

export type DnsZeile = {
  art: 'SPF' | 'DKIM' | 'DMARC' | 'MX';
  typ: string;
  name: string;
  wert: string;
  prioritaet?: number;
  status: 'ok' | 'wartet' | 'fehler' | 'empfohlen';
};

export type AbsenderZeile = {
  owner_user_id?: string | null;
  domain?: string | null;
  lokalteil?: string | null;
  status?: string | null;
  aktiv?: boolean | null;
};

/** Domain aus einer Eingabe holen und prüfen (auch „https://www.firma.de/" geht). */
export function domainPruefen(eingabe: unknown): { ok: true; domain: string } | { ok: false; fehler: string } {
  let d = String(eingabe ?? '').trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
  if (d.includes('@')) d = d.slice(d.lastIndexOf('@') + 1);
  if (!d) return { ok: false, fehler: 'Bitte eine Domain eintragen, z. B. post.ihre-firma.de.' };
  if (d.length > 200) return { ok: false, fehler: 'Die Domain ist zu lang.' };
  if (/^\d+(\.\d+){3}$/.test(d)) return { ok: false, fehler: 'Eine IP-Adresse ist keine Domain.' };
  const teile = d.split('.');
  if (teile.length < 2) return { ok: false, fehler: 'Die Domain braucht eine Endung, z. B. .de.' };
  const labelOk = (l: string) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l);
  if (!teile.every(labelOk)) return { ok: false, fehler: 'Die Domain enthält unerlaubte Zeichen (erlaubt: a–z, 0–9, Bindestrich; Umlaut-Domains bitte in der xn--Schreibweise).' };
  if (!/^(?:[a-z]{2,24}|xn--[a-z0-9-]{1,59})$/.test(teile[teile.length - 1])) return { ok: false, fehler: 'Die Endung der Domain ist ungültig.' };
  if (d === ARGONAUT_DOMAIN || d.endsWith('.' + ARGONAUT_DOMAIN)) return { ok: false, fehler: 'Die ARGONAUT-Domain kann kein Betrieb als eigene Absender-Domain nutzen.' };
  const basis = teile.slice(-2).join('.');
  if (FREEMAIL.has(d) || FREEMAIL.has(basis)) return { ok: false, fehler: 'Freemail-Domains (GMX, Gmail, Web.de …) gehören nicht dem Betrieb und lassen sich nicht bestätigen.' };
  return { ok: true, domain: d };
}

/** Lokalteil vor dem @ prüfen (z. B. „rechnung", „info", „post"). */
export function lokalteilPruefen(eingabe: unknown): { ok: true; lokalteil: string } | { ok: false; fehler: string } {
  const l = String(eingabe ?? '').trim().toLowerCase() || STANDARD_LOKALTEIL;
  if (l.length > 64) return { ok: false, fehler: 'Der Teil vor dem @ ist zu lang.' };
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(l) || l.includes('..')) {
    return { ok: false, fehler: 'Vor dem @ sind nur a–z, 0–9, Punkt, Binde- und Unterstrich erlaubt.' };
  }
  return { ok: true, lokalteil: l };
}

/** Resend-Status auf unsere vier Zustände abbilden. */
export function statusAusResend(s: unknown): DomainStatus {
  const x = String(s ?? '').toLowerCase();
  if (x === 'verified') return 'verifiziert';
  if (x === 'failed' || x === 'partially_failed' || x === 'temporary_failure') return 'fehler';
  return 'wartet';
}

function eintragStatus(s: unknown): DnsZeile['status'] {
  const x = String(s ?? '').toLowerCase();
  if (x === 'verified') return 'ok';
  if (x === 'failed' || x === 'temporary_failure') return 'fehler';
  return 'wartet';
}

/**
 * DNS-Einträge aus der Resend-Antwort für die Anzeige aufbereiten — nur
 * Versand (SPF/MX/DKIM), dazu eine DMARC-Empfehlung, falls noch keine da ist.
 */
export function dnsZeilen(records: unknown, domain: string): DnsZeile[] {
  const raus: DnsZeile[] = [];
  const liste = Array.isArray(records) ? records : [];
  for (const r of liste as Record<string, unknown>[]) {
    const art = String(r?.record ?? '').toUpperCase();
    if (art !== 'SPF' && art !== 'DKIM') continue;
    const typ = String(r?.type ?? '').toUpperCase();
    const name = String(r?.name ?? '').slice(0, 255);
    const wert = String(r?.value ?? '').slice(0, 2048);
    if (!typ || !name || !wert) continue;
    raus.push({
      art: typ === 'MX' ? 'MX' : (art as 'SPF' | 'DKIM'),
      typ, name, wert,
      ...(typeof r?.priority === 'number' ? { prioritaet: r.priority as number } : {}),
      status: eintragStatus(r?.status),
    });
  }
  if (raus.length > 0 && !raus.some((z) => z.art === 'DMARC')) {
    raus.push({
      art: 'DMARC', typ: 'TXT', name: '_dmarc.' + domain,
      wert: 'v=DMARC1; p=none;', status: 'empfohlen',
    });
  }
  return raus;
}

/** Darf diese Zeile als Absender benutzt werden? */
export function darfNutzen(z: AbsenderZeile | null | undefined): boolean {
  if (!z) return false;
  if (z.aktiv !== true || z.status !== 'verifiziert') return false;
  const d = domainPruefen(z.domain);
  const l = lokalteilPruefen(z.lokalteil);
  return d.ok && l.ok;
}

/** Fertige Absender-Adresse dieses Betriebs — oder null (dann Standard). */
export function absenderAdresse(z: AbsenderZeile | null | undefined): string | null {
  if (!darfNutzen(z)) return null;
  const d = domainPruefen(z!.domain);
  const l = lokalteilPruefen(z!.lokalteil);
  if (!d.ok || !l.ok) return null;
  return `${l.lokalteil}@${d.domain}`;
}

/** Anzeigename säubern (keine Kopfzeilen-Tricks) und From-Kopf bauen. */
export function fromKopf(anzeigename: string | undefined, adresse: string, standardName: string): string {
  const clean = String(anzeigename ?? '').replace(/[<>"\r\n]/g, '').trim();
  return `${clean || standardName} <${adresse}>`;
}

/**
 * Lehnt Resend die Mail wegen der Absender-Domain ab? Dann geht sie noch
 * einmal über die Standard-Adresse raus. Andere Fehler (falsche Empfänger-
 * Adresse, Tageslimit) werden NICHT wiederholt.
 */
export function fehlerWegenDomain(meldung: unknown): boolean {
  const m = String(meldung ?? '').toLowerCase();
  if (!m) return false;
  return /domain/.test(m) && /(verif|not found|does not exist|not allowed|invalid|unauthori|forbidden|own)/.test(m);
}

/** Ist das Anlegen neuer Domains bei Resend eingeschaltet? */
export function eigeneDomainsAn(env: Record<string, string | undefined>): boolean {
  return String(env.RESEND_EIGENE_DOMAINS ?? '').trim().toLowerCase() === 'an';
}

/** Darf jetzt (wieder) bei Resend geprüft werden? */
export function pruefenErlaubt(letzte: string | null | undefined, jetzt: Date): boolean {
  if (!letzte) return true;
  const t = Date.parse(letzte);
  if (!Number.isFinite(t)) return true;
  return jetzt.getTime() - t >= PRUEF_ABSTAND_S * 1000;
}

/** Kurztext für die Anzeige. */
export function statusText(z: AbsenderZeile | null | undefined): string {
  if (!z || !z.domain || z.status === 'entfernt') return 'Standard-Absender (noreply@argonaut-os.com)';
  if (darfNutzen(z)) return `Aktiv: ${absenderAdresse(z)}`;
  if (z.status === 'verifiziert') return 'Bestätigt, aber noch nicht eingeschaltet';
  if (z.status === 'fehler') return 'DNS-Prüfung fehlgeschlagen — Einträge kontrollieren';
  return 'Wartet auf die DNS-Einträge';
}
