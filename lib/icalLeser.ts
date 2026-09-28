// ============================================================
// ARGONAUT OS · lib/icalLeser.ts — Umzug Schritt 7: iCalendar (.ics)
// (Paket 151, 28.09.2026)
//
// Termine aus Outlook, Google Kalender, Apple Kalender, Thunderbird und
// Praxis-/Branchenprogrammen kommen als iCalendar (RFC 5545). Dieser Leser
// macht aus jedem VEVENT eine Zeile mit den Feldnamen der Termine
// (Kopfzeile = Feldnamen), die danach durch den normalen Import-Motor laeuft.
// Zeiten werden als deutsche Ortszeit „JJJJ-MM-TT HH:MM" ausgegeben — der
// Motor (Feldtyp „zeitpunkt") macht daraus den echten Zeitpunkt.
//
// Beachtet: Zeilenfaltung, Maskierung (\n \, \; \\), DTSTART/DTEND in UTC (Z),
// mit TZID (IANA-Name, Outlook-Windows-Name, Mozilla-Praefix) oder „schwebend",
// ganztaegige Termine (VALUE=DATE, DTEND exklusiv), DURATION, STATUS,
// ORGANIZER/ATTENDEE (mailto, CN), CATEGORIES, UID.
// Bewusst NICHT geraten: Serien (RRULE) werden nicht aufgefaltet — der erste
// Termin kommt, die Regel steht in einer eigenen Spalte, der Hinweis sagt es.
// Nichts wird verschluckt: weitere Teilnehmer, Kategorien, UID, Serie als
// eigene Spalten. Reine Logik, node-getestet.
// ============================================================

export type IcalErgebnis = { kopf: string[]; zeilen: string[][]; anzahl: number; hinweise: string[] };

export function istIcal(dateiname: string, anfang: string): boolean {
  return /\.(ics|ical|ifb|icalendar)$/i.test(dateiname) || /^\s*BEGIN:VCALENDAR/i.test(anfang.replace(/^\uFEFF/, ''));
}

/** Zeilenfaltung aufloesen (RFC 5545 3.1). */
function entfalten(text: string): string[] {
  const roh = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const raus: string[] = [];
  for (const z of roh) {
    if ((z.startsWith(' ') || z.startsWith('\t')) && raus.length > 0) raus[raus.length - 1] += z.slice(1);
    else raus.push(z);
  }
  return raus.filter((z) => z.trim() !== '');
}

const unmaskieren = (s: string) => s.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));

type Eigenschaft = { name: string; params: Record<string, string>; wert: string };

function leseZeile(z: string): Eigenschaft | null {
  // Doppelpunkt in Anfuehrungszeichen (TZID="…", CN="Müller: Einkauf") ueberspringen
  let q = false, i = 0;
  for (; i < z.length; i++) { if (z[i] === '"') q = !q; else if (z[i] === ':' && !q) break; }
  if (i >= z.length) return null;
  const links = z.slice(0, i), wert = z.slice(i + 1);
  const teile: string[] = []; let akt = ''; q = false;
  for (const c of links) { if (c === '"') { q = !q; continue; } if (c === ';' && !q) { teile.push(akt); akt = ''; } else akt += c; }
  teile.push(akt);
  const params: Record<string, string> = {};
  for (const p of teile.slice(1)) { const g = p.indexOf('='); if (g > 0) params[p.slice(0, g).toUpperCase()] = p.slice(g + 1); }
  return { name: teile[0].toUpperCase().replace(/^[^.]+\./, ''), params, wert };
}

// ---------------------------------------------------------------------------
// Zeitzonen
// ---------------------------------------------------------------------------

const WINDOWS_ZONEN: Record<string, string> = {
  'w. europe standard time': 'Europe/Berlin', 'central europe standard time': 'Europe/Budapest',
  'central european standard time': 'Europe/Warsaw', 'romance standard time': 'Europe/Paris',
  'gmt standard time': 'Europe/London', 'greenwich standard time': 'Atlantic/Reykjavik', 'utc': 'UTC',
  'e. europe standard time': 'Europe/Chisinau', 'fle standard time': 'Europe/Kiev', 'gtb standard time': 'Europe/Bucharest',
  'russian standard time': 'Europe/Moscow', 'turkey standard time': 'Europe/Istanbul',
  'eastern standard time': 'America/New_York', 'central standard time': 'America/Chicago',
  'mountain standard time': 'America/Denver', 'pacific standard time': 'America/Los_Angeles',
  'china standard time': 'Asia/Shanghai', 'tokyo standard time': 'Asia/Tokyo', 'india standard time': 'Asia/Kolkata',
};

/** TZID in einen IANA-Namen: „Europe/Berlin", „/mozilla.org/…/Europe/Berlin", „W. Europe Standard Time". */
export function zoneAus(tzid: string): string | null {
  const t = tzid.trim().replace(/^"|"$/g, '');
  if (!t) return null;
  const w = WINDOWS_ZONEN[t.toLowerCase()];
  if (w) return w;
  const m = /([A-Za-z]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?)$/.exec(t);
  const kandidat = m ? m[1] : t;
  try { new Intl.DateTimeFormat('en-US', { timeZone: kandidat }); return kandidat; } catch { return null; }
}

/** Versatz einer Zone zu UTC in Minuten fuer einen Zeitpunkt. */
function versatzMin(utcMs: number, zone: string): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(utcMs))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - utcMs) / 60000;
}

/** Ortszeit in einer Zone -> UTC-Millisekunden. */
function zoneZuUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, zone: string): number {
  const naiv = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = naiv - versatzMin(naiv, zone) * 60000;
  t = naiv - versatzMin(t, zone) * 60000;
  return t;
}

const zwei = (n: number) => String(n).padStart(2, '0');

/** UTC-Millisekunden -> deutsche Ortszeit „JJJJ-MM-TT HH:MM". */
export function berlinText(utcMs: number): string {
  const d = new Date(utcMs + versatzMin(utcMs, 'Europe/Berlin') * 60000);
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())} ${zwei(d.getUTCHours())}:${zwei(d.getUTCMinutes())}`;
}

type Zeit = { text: string; ms: number; ganztags: boolean; zoneUnbekannt: boolean } | null;

/** DTSTART/DTEND lesen. */
export function leseZeit(e: Eigenschaft | undefined): Zeit {
  if (!e) return null;
  const w = e.wert.trim();
  const datum = /^(\d{4})(\d{2})(\d{2})$/.exec(w);
  if (datum || (e.params.VALUE ?? '').toUpperCase() === 'DATE') {
    const m = datum ?? /^(\d{4})(\d{2})(\d{2})/.exec(w);
    if (!m) return null;
    const [y, mo, d] = m.slice(1).map(Number);
    return { text: `${m[1]}-${m[2]}-${m[3]} 00:00`, ms: Date.UTC(y, mo - 1, d), ganztags: true, zoneUnbekannt: false };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(w);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const s = Number(m[6] ?? 0);
  if (m[7]) { const ms = Date.UTC(y, mo - 1, d, h, mi, s); return { text: berlinText(ms), ms, ganztags: false, zoneUnbekannt: false }; }
  const tz = e.params.TZID;
  const zone = tz ? zoneAus(tz) : 'Europe/Berlin';            // „schwebende" Zeit = Ortszeit des Betriebs
  const ms = zoneZuUtc(y, mo, d, h, mi, s, zone ?? 'Europe/Berlin');
  return { text: berlinText(ms), ms, ganztags: false, zoneUnbekannt: !!tz && !zone };
}

/** DURATION (P1W, P1DT2H, PT45M) in Millisekunden. */
export function leseDauer(s: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(s.trim());
  if (!m || s.trim() === 'P' || s.trim() === 'PT') return null;
  const [, vz, w, d, h, mi, se] = m;
  const ms = ((+(w ?? 0) * 7 + +(d ?? 0)) * 86400 + +(h ?? 0) * 3600 + +(mi ?? 0) * 60 + +(se ?? 0)) * 1000;
  return vz === '-' ? -ms : ms;
}

const mailVon = (w: string) => w.replace(/^mailto:/i, '').trim().toLowerCase();

const KOPF_FELDER = ['titel', 'beginn_am', 'ende_am', 'ort', 'beschreibung', 'kunde_email', 'kunde_name', 'status'] as const;

/** iCalendar lesen: jede VEVENT-Komponente eine Zeile. */
export function leseIcal(text: string): IcalErgebnis {
  const zeilen = entfalten(text);
  type Ev = Eigenschaft[];
  const events: Ev[] = [];
  let akt: Ev | null = null;
  let tiefe = 0;                        // verschachtelte Komponenten im VEVENT (VALARM) ueberspringen
  let todo = 0, journal = 0;
  for (const z of zeilen) {
    const e = leseZeile(z);
    if (!e) continue;
    if (e.name === 'BEGIN') {
      const k = e.wert.trim().toUpperCase();
      if (akt) { tiefe++; continue; }
      if (k === 'VEVENT') akt = [];
      else if (k === 'VTODO') todo++;
      else if (k === 'VJOURNAL') journal++;
      continue;
    }
    if (e.name === 'END') {
      if (akt && tiefe > 0) { tiefe--; continue; }
      if (akt && e.wert.trim().toUpperCase() === 'VEVENT') { events.push(akt); akt = null; }
      continue;
    }
    if (akt && tiefe === 0) akt.push(e);
  }
  const hinweise: string[] = [];
  if (events.length === 0) {
    hinweise.push(/BEGIN:VCALENDAR/i.test(text) ? 'Kalender-Datei ohne Termine (VEVENT).' : 'Keine iCalendar-Datei (BEGIN:VCALENDAR fehlt).');
    return { kopf: [...KOPF_FELDER], zeilen: [], anzahl: 0, hinweise };
  }

  let serien = 0, ausnahmen = 0, ganztags = 0, zoneUnbekannt = 0, ohneBeginn = 0, abgesagt = 0, vorlaeufig = 0;
  const raus: Record<string, string>[] = [];
  for (const ev of events) {
    const eins = (n: string) => ev.find((e) => e.name === n);
    const alle = (n: string) => ev.filter((e) => e.name === n);
    const beginn = leseZeit(eins('DTSTART'));
    if (!beginn) { ohneBeginn++; continue; }
    let ende = leseZeit(eins('DTEND'));
    if (!ende) {
      const dauer = eins('DURATION') ? leseDauer(eins('DURATION')!.wert) : null;
      if (dauer !== null) ende = { text: beginn.ganztags ? '' : berlinText(beginn.ms + dauer), ms: beginn.ms + dauer, ganztags: beginn.ganztags, zoneUnbekannt: false };
      if (ende && beginn.ganztags) {
        const d = new Date(ende.ms);
        ende.text = `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())} 00:00`;
      }
    }
    if (!ende && beginn.ganztags) {
      // Ganztaegig ohne Ende = genau dieser eine Tag (RFC 5545 3.6.1)
      const d = new Date(beginn.ms + 86400000);
      ende = { text: `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())} 00:00`, ms: d.getTime(), ganztags: true, zoneUnbekannt: false };
    }
    if (beginn.ganztags) ganztags++;
    if (beginn.zoneUnbekannt || ende?.zoneUnbekannt) zoneUnbekannt++;

    const status = (eins('STATUS')?.wert ?? '').trim().toUpperCase();
    if (status === 'CANCELLED') abgesagt++;
    if (status === 'TENTATIVE') vorlaeufig++;
    const org = eins('ORGANIZER');
    const orgMail = org ? mailVon(org.wert) : '';
    const teilnehmer = alle('ATTENDEE').map((a) => ({ mail: mailVon(a.wert), name: unmaskieren(a.params.CN ?? '').trim(), rolle: (a.params.ROLE ?? '').toUpperCase() }))
      .filter((t) => t.mail && t.mail !== orgMail && t.rolle !== 'NON-PARTICIPANT');
    const kunde = teilnehmer[0];
    const rrule = eins('RRULE');
    if (rrule) serien++;
    if (eins('RECURRENCE-ID')) ausnahmen++;
    const beschreibung = unmaskieren(eins('DESCRIPTION')?.wert ?? '').trim();
    raus.push({
      titel: unmaskieren(eins('SUMMARY')?.wert ?? '').trim(),
      beginn_am: beginn.text,
      ende_am: ende?.text ?? '',
      ort: unmaskieren(eins('LOCATION')?.wert ?? '').trim(),
      beschreibung,
      kunde_email: kunde?.mail ?? '',
      kunde_name: kunde?.name ?? '',
      status: status === 'CANCELLED' ? 'abgesagt' : 'geplant',
      ganztags: beginn.ganztags ? 'ja' : '',
      vorlaeufig: status === 'TENTATIVE' ? 'vorläufig (Kalender: TENTATIVE)' : '',
      serie: rrule ? rrule.wert.trim() : '',
      weitere: teilnehmer.slice(1).map((t) => (t.name ? `${t.name} <${t.mail}>` : t.mail)).join(', '),
      organisator: org ? (org.params.CN ? `${unmaskieren(org.params.CN)} <${orgMail}>` : orgMail) : '',
      kategorien: alle('CATEGORIES').map((c) => unmaskieren(c.wert)).join(', '),
      uid: (eins('UID')?.wert ?? '').trim(),
    });
  }

  const EXTRA: [string, string][] = [
    ['ganztags', 'Ganztägig'], ['vorlaeufig', 'Zusage'], ['serie', 'Serie (Wiederholungsregel)'], ['weitere', 'Weitere Teilnehmer'],
    ['organisator', 'Organisator'], ['kategorien', 'Kategorien'], ['uid', 'Kalender-UID'],
  ];
  const extras = EXTRA.filter(([k]) => raus.some((z) => z[k]));
  const kopf = [...KOPF_FELDER, ...extras.map(([, l]) => l)];
  const tabelle = raus.map((z) => [...KOPF_FELDER.map((k) => z[k] ?? ''), ...extras.map(([k]) => z[k] ?? '')]);

  hinweise.push(`iCalendar erkannt: ${tabelle.length} Termine.`);
  if (serien > 0) hinweise.push(`${serien} Serientermine: übernommen wird der erste Termin, die Wiederholungsregel steht in einer eigenen Spalte — Serie bitte in ARGONAUT neu anlegen.`);
  if (ausnahmen > 0) hinweise.push(`${ausnahmen} geänderte Einzeltermine einer Serie als eigene Termine übernommen.`);
  if (ganztags > 0) hinweise.push(`${ganztags} ganztägige Termine (00:00 bis 00:00 des Folgetags).`);
  if (abgesagt > 0) hinweise.push(`${abgesagt} abgesagte Termine — als „abgesagt" übernommen.`);
  if (vorlaeufig > 0) hinweise.push(`${vorlaeufig} vorläufige Termine — Vermerk in der Spalte „Zusage".`);
  if (zoneUnbekannt > 0) hinweise.push(`${zoneUnbekannt} Termine mit unbekannter Zeitzone — als deutsche Zeit gelesen, bitte prüfen.`);
  if (ohneBeginn > 0) hinweise.push(`${ohneBeginn} Einträge ohne lesbaren Beginn übersprungen.`);
  if (todo + journal > 0) hinweise.push(`${todo + journal} Aufgaben/Notizen (VTODO/VJOURNAL) nicht übernommen — nur Termine.`);
  return { kopf, zeilen: tabelle, anzahl: tabelle.length, hinweise };
}
