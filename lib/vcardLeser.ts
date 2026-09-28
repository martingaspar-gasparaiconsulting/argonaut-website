// ============================================================
// ARGONAUT OS · lib/vcardLeser.ts — Umzug Schritt 7: vCard (.vcf)
// (Paket 148, 28.09.2026)
//
// Kontakte aus Outlook, Apple/Google Kontakte, Smartphones und vielen
// Programmen kommen als vCard (2.1, 3.0, 4.0). Dieser Leser macht daraus eine
// Tabelle mit den ARGONAUT-Feldnamen der Kunden (Kopfzeile = Feldnamen), die
// danach durch den normalen Import-Motor laeuft (Zuordnung, Pruefung,
// Rueckgaengig). Nichts wird verschluckt: Unbekannte Angaben (Geburtstag,
// weitere Nummern/Adressen …) kommen als eigene Spalten mit.
//
// Beachtet: Zeilenfaltung (RFC 6350 3.2), vCard-2.1-QUOTED-PRINTABLE mit
// weichem Umbruch, Maskierung \, \; \n, Gruppen-Praefixe (item1.EMAIL),
// TYPE-Parameter (CELL, WORK, HOME), mehrere Werte je Feld.
// Reine Logik, node-getestet.
// ============================================================

export type VcardErgebnis = { kopf: string[]; zeilen: string[][]; anzahl: number; hinweise: string[] };

/** Ist das eine vCard-Datei? (Endung oder Inhalt) */
export function istVcard(dateiname: string, anfang: string): boolean {
  return /\.vcf$/i.test(dateiname) || /^\s*BEGIN:VCARD/i.test(anfang);
}

type Eigenschaft = { name: string; params: Record<string, string[]>; wert: string };

/** Gefaltete Zeilen aufloesen; QP-Zeilen mit „=" am Ende gehoeren zusammen. */
function entfalten(text: string): string[] {
  const roh = text.replace(/\r\n?/g, '\n').split('\n');
  const raus: string[] = [];
  for (const z of roh) {
    const letzte = raus.length - 1;
    if ((z.startsWith(' ') || z.startsWith('\t')) && letzte >= 0) { raus[letzte] += z.slice(1); continue; }
    if (letzte >= 0 && /ENCODING=QUOTED-PRINTABLE/i.test(raus[letzte].split(':')[0]) && raus[letzte].endsWith('=')) {
      raus[letzte] = raus[letzte].slice(0, -1) + z; continue;
    }
    raus.push(z);
  }
  return raus.filter((z) => z.trim() !== '');
}

function qpDekodieren(s: string, charset: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(s.charCodeAt(i) & 0xff);
  }
  const u8 = new Uint8Array(bytes);
  try { return new TextDecoder(/1252|8859/i.test(charset) ? 'windows-1252' : 'utf-8', { fatal: false }).decode(u8); }
  catch { return String.fromCharCode(...bytes); }
}

/** \n, \, \; \\ zurueckwandeln (vCard 3.0/4.0). */
function unmaskieren(s: string): string {
  return s.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** Wert an unmaskierten Semikolons teilen (N, ADR, ORG). */
function teile(s: string): string[] {
  const raus: string[] = []; let akt = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) { akt += s[i] + s[i + 1]; i++; continue; }
    if (s[i] === ';') { raus.push(akt); akt = ''; continue; }
    akt += s[i];
  }
  raus.push(akt);
  return raus.map((t) => unmaskieren(t).trim());
}

function leseEigenschaft(zeile: string): Eigenschaft | null {
  const doppel = zeile.indexOf(':');
  if (doppel < 0) return null;
  const links = zeile.slice(0, doppel);
  let wert = zeile.slice(doppel + 1);
  const [namensTeil, ...paramTeile] = links.split(';');
  const name = namensTeil.replace(/^[^.]+\./, '').toUpperCase();   // item1.EMAIL -> EMAIL
  const params: Record<string, string[]> = {};
  for (const p of paramTeile) {
    const gl = p.indexOf('=');
    const k = (gl < 0 ? 'TYPE' : p.slice(0, gl)).toUpperCase();      // vCard 2.1: ;WORK;VOICE
    const v = gl < 0 ? p : p.slice(gl + 1).replace(/^"|"$/g, '');
    params[k] = [...(params[k] ?? []), ...v.split(',').map((x) => x.toUpperCase())];
  }
  if ((params.ENCODING ?? []).includes('QUOTED-PRINTABLE')) wert = qpDekodieren(wert, (params.CHARSET ?? ['utf-8'])[0]);
  return { name, params, wert };
}

const typ = (e: Eigenschaft, ...t: string[]) => t.some((x) => (e.params.TYPE ?? []).includes(x));

/** Spalten in der Reihenfolge der Kunden-Mustervorlage (Feldnamen = Import-Labels). */
const SPALTEN = ['Anrede', 'Firma', 'Vorname', 'Nachname', 'Position', 'E-Mail', 'Telefon', 'Mobil', 'Straße', 'PLZ', 'Ort', 'Land', 'Website', 'Notizen', 'Nummer im Altsystem'] as const;

/**
 * vCard-Text -> Tabelle. Je Karte eine Zeile. Erste E-Mail/Telefon/Adresse in
 * die Felder (bevorzugt geschaeftlich), alle weiteren als eigene Spalten
 * („E-Mail 2", „Telefon privat" …), Geburtstag/Kategorien ebenso.
 */
export function leseVcard(text: string): VcardErgebnis {
  const zeilen = entfalten(text);
  const karten: Eigenschaft[][] = [];
  let aktuell: Eigenschaft[] | null = null;
  for (const z of zeilen) {
    if (/^BEGIN:VCARD$/i.test(z.trim())) { aktuell = []; continue; }
    if (/^END:VCARD$/i.test(z.trim())) { if (aktuell) karten.push(aktuell); aktuell = null; continue; }
    if (!aktuell) continue;
    const e = leseEigenschaft(z);
    if (e) aktuell.push(e);
  }
  const extraSpalten: string[] = [];
  const datensaetze: Record<string, string>[] = [];
  const hinweise: string[] = [];
  let ohneName = 0;
  for (const karte of karten) {
    const d: Record<string, string> = {};
    const extra = (spalte: string, wert: string) => {
      if (!wert) return;
      let s = spalte; let i = 2;
      while (d[s] !== undefined) s = `${spalte} ${i++}`;
      d[s] = wert;
      if (!extraSpalten.includes(s)) extraSpalten.push(s);
    };
    const erste = <T,>(liste: T[], bevorzugt: (x: T) => boolean) => [...liste.filter(bevorzugt), ...liste.filter((x) => !bevorzugt(x))];
    for (const e of karte) {
      if (e.name === 'N') {
        const [nach, vor, weitere, prefix] = teile(e.wert);
        if (nach) d.Nachname = nach;
        if (vor || weitere) d.Vorname = [vor, weitere].filter(Boolean).join(' ');
        if (prefix) d.Anrede = prefix;
      } else if (e.name === 'FN' && !d.__fn) d.__fn = unmaskieren(e.wert).trim();
      else if (e.name === 'ORG') { const [org, abt] = teile(e.wert); if (org) d.Firma = org; if (abt) extra('Abteilung', abt); }
      else if (e.name === 'TITLE' || e.name === 'ROLE') { if (!d.Position) d.Position = unmaskieren(e.wert).trim(); else extra('Funktion', unmaskieren(e.wert).trim()); }
      else if (e.name === 'NOTE') d.Notizen = [d.Notizen, unmaskieren(e.wert).trim()].filter(Boolean).join('\n');
      else if (e.name === 'UID') d['Nummer im Altsystem'] = unmaskieren(e.wert).trim();
      else if (e.name === 'BDAY') extra('Geburtstag', unmaskieren(e.wert).trim());
      else if (e.name === 'CATEGORIES') extra('Kategorien', unmaskieren(e.wert).trim());
      else if (e.name === 'NICKNAME') extra('Spitzname', unmaskieren(e.wert).trim());
    }
    const mails = erste(karte.filter((e) => e.name === 'EMAIL'), (e) => typ(e, 'WORK', 'PREF'));
    mails.forEach((e, i) => (i === 0 ? (d['E-Mail'] = e.wert.trim()) : extra('E-Mail', e.wert.trim())));
    const tels = karte.filter((e) => e.name === 'TEL');
    const mobil = tels.filter((e) => typ(e, 'CELL', 'MOBILE'));
    const fest = erste(tels.filter((e) => !typ(e, 'CELL', 'MOBILE', 'FAX')), (e) => typ(e, 'WORK', 'PREF'));
    const tel = (e: Eigenschaft) => e.wert.replace(/^tel:/i, '').trim();
    fest.forEach((e, i) => (i === 0 ? (d.Telefon = tel(e)) : extra(typ(e, 'HOME') ? 'Telefon privat' : 'Telefon', tel(e))));
    mobil.forEach((e, i) => (i === 0 ? (d.Mobil = tel(e)) : extra('Mobil', tel(e))));
    tels.filter((e) => typ(e, 'FAX')).forEach((e) => extra('Fax', tel(e)));
    const adressen = erste(karte.filter((e) => e.name === 'ADR'), (e) => typ(e, 'WORK', 'PREF'));
    adressen.forEach((e, i) => {
      const [, zusatz, strasse, ort, , plz, land] = teile(e.wert);
      if (i === 0) {
        if (strasse || zusatz) d['Straße'] = [strasse, zusatz].filter(Boolean).join(', ');
        if (plz) d.PLZ = plz; if (ort) d.Ort = ort; if (land) d.Land = land;
      } else extra(typ(e, 'HOME') ? 'Adresse privat' : 'Weitere Adresse', [strasse, zusatz, [plz, ort].filter(Boolean).join(' '), land].filter(Boolean).join(', '));
    });
    const urls = karte.filter((e) => e.name === 'URL');
    urls.forEach((e, i) => (i === 0 ? (d.Website = e.wert.trim()) : extra('Website', e.wert.trim())));
    // Kein N: den Anzeigenamen nehmen (bei Firmenkarten steht dort oft nur die Firma)
    if (!d.Nachname && !d.Vorname && d.__fn && d.__fn !== d.Firma) {
      const teileFn = d.__fn.split(/\s+/);
      if (teileFn.length > 1) { d.Nachname = teileFn.pop() as string; d.Vorname = teileFn.join(' '); } else d.Nachname = d.__fn;
    }
    if (!d.Nachname && !d.Vorname && !d.Firma && !d.__fn) ohneName++;
    delete d.__fn;
    if (Object.keys(d).length > 0) datensaetze.push(d);
  }
  if (ohneName > 0) hinweise.push(`${ohneName} Kontaktkarte(n) ohne Namen und Firma.`);
  if (karten.length === 0) hinweise.push('In der Datei ist keine vCard (BEGIN:VCARD) zu finden.');
  const benutzt = SPALTEN.filter((s) => datensaetze.some((d) => d[s]));
  const kopf = [...benutzt, ...extraSpalten];
  return { kopf, zeilen: datensaetze.map((d) => kopf.map((k) => d[k] ?? '')), anzahl: datensaetze.length, hinweise };
}
