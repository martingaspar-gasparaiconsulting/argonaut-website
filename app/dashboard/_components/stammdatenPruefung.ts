// Gemeinsame, wiederverwendbare Stammdaten-Pruefung.
// Reine Funktionen – keine KI, keine Netzwerkzugriffe. Laeuft sofort und kostenlos.
// Wird zuerst fuer Lieferanten genutzt, spaeter fuer Kunden erweiterbar.

export type Schwere = 'fehler' | 'warnung' | 'info'

// ---- IBAN: echte Mod-97-Pruefung (ISO 13616), inkl. Laender-Erkennung ----
export function pruefeIban(ibanRoh: string): { gueltig: boolean; grund?: string; land?: string; blz?: string } {
  const iban = (ibanRoh ?? '').replace(/\s+/g, '').toUpperCase()
  if (iban === '') return { gueltig: false, grund: 'leer' }
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) {
    return { gueltig: false, grund: 'Format ungueltig (Laenderkuerzel + 2 Pruefziffern erwartet)' }
  }
  const land = iban.slice(0, 2)
  if (land === 'DE' && iban.length !== 22) {
    return { gueltig: false, grund: 'Deutsche IBAN muss genau 22 Zeichen haben (aktuell ' + iban.length + ')', land }
  }
  if (iban.length < 15 || iban.length > 34) {
    return { gueltig: false, grund: 'Laenge ausserhalb 15-34 Zeichen', land }
  }
  const umgestellt = iban.slice(4) + iban.slice(0, 4)
  let numerisch = ''
  for (const ch of umgestellt) {
    if (ch >= '0' && ch <= '9') numerisch += ch
    else numerisch += (ch.charCodeAt(0) - 55).toString()
  }
  let rest = 0
  for (const ziffer of numerisch) {
    rest = (rest * 10 + Number(ziffer)) % 97
  }
  if (rest !== 1) return { gueltig: false, grund: 'Pruefziffer stimmt nicht (Tippfehler in der IBAN?)', land }
  const blz = land === 'DE' ? iban.slice(4, 12) : undefined
  return { gueltig: true, land, blz }
}

// Gaengige Laendercodes fuer schoenere Klartext-Ausgabe
const LAENDER: { [code: string]: string } = {
  DE: 'Deutschland', AT: 'Oesterreich', CH: 'Schweiz', FR: 'Frankreich', IT: 'Italien',
  NL: 'Niederlande', BE: 'Belgien', LU: 'Luxemburg', ES: 'Spanien', PT: 'Portugal',
  PL: 'Polen', CZ: 'Tschechien', SK: 'Slowakei', DK: 'Daenemark', SE: 'Schweden',
  FI: 'Finnland', NO: 'Norwegen', GB: 'Grossbritannien', IE: 'Irland', HU: 'Ungarn',
  SI: 'Slowenien', HR: 'Kroatien', RO: 'Rumaenien', BG: 'Bulgarien', GR: 'Griechenland',
}
export function landName(code: string): string {
  return LAENDER[code] || code
}

// ---- Eingabe-Form (Lieferant) ----
export type LieferantEingabe = {
  id: string
  name?: string | null
  email?: string | null
  adresse?: string | null
  iban?: string | null
  aktiv?: boolean | null
}

export type LieferantBefund = {
  id: string
  name: string
  schwere: Schwere
  text: string
}

export type LieferantenBericht = {
  gesamt: number
  aktiv: number
  befunde: LieferantBefund[]
  anzahlFehler: number
  anzahlWarnung: number
  anzahlInfo: number
  betroffene: number // Anzahl verschiedener Lieferanten mit mind. einem Befund
}

function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, '').toUpperCase()
}

export function pruefeLieferantenListe(list: LieferantEingabe[]): LieferantenBericht {
  const befunde: LieferantBefund[] = []

  // Dubletten vorbereiten (gleiche IBAN / gleiche E-Mail)
  const ibanMap = new Map<string, string[]>()
  const emailMap = new Map<string, string[]>()
  for (const l of list) {
    const nm = l.name ?? 'Ohne Namen'
    const ib = norm(l.iban)
    if (ib) ibanMap.set(ib, [...(ibanMap.get(ib) ?? []), nm])
    const em = norm(l.email)
    if (em) emailMap.set(em, [...(emailMap.get(em) ?? []), nm])
  }

  for (const l of list) {
    const name = l.name ?? 'Ohne Namen'
    const aktiv = l.aktiv !== false // undefined/true = aktiv

    // --- IBAN ---
    const ibanRoh = (l.iban ?? '').trim()
    if (ibanRoh === '') {
      if (aktiv) befunde.push({ id: l.id, name, schwere: 'warnung', text: 'Keine IBAN hinterlegt.' })
    } else {
      const r = pruefeIban(ibanRoh)
      if (!r.gueltig) {
        befunde.push({ id: l.id, name, schwere: 'fehler', text: 'IBAN ungueltig: ' + (r.grund || 'unbekannt') + '.' })
      } else if (r.land && r.land !== 'DE') {
        befunde.push({
          id: l.id, name, schwere: 'info',
          text: 'Auslaendische IBAN (' + landName(r.land) + ') – andere Zahlungsregeln/Gebuehren beachten.',
        })
      }
    }

    // --- E-Mail ---
    const email = (l.email ?? '').trim()
    if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      befunde.push({ id: l.id, name, schwere: 'warnung', text: 'E-Mail-Format ungueltig: ' + email })
    }

    // --- Adresse (Freitext) ---
    const adr = (l.adresse ?? '').trim()
    if (adr === '') {
      if (aktiv) befunde.push({ id: l.id, name, schwere: 'warnung', text: 'Keine Adresse hinterlegt.' })
    } else if (!/\b\d{5}\b/.test(adr)) {
      befunde.push({ id: l.id, name, schwere: 'info', text: 'Adresse enthaelt keine 5-stellige PLZ – evtl. unvollstaendig.' })
    }
  }

  // --- Dubletten ---
  for (const [ib, namen] of ibanMap) {
    if (namen.length > 1) {
      befunde.push({
        id: 'dup-iban-' + ib, name: namen.join(', '), schwere: 'warnung',
        text: 'Gleiche IBAN bei ' + namen.length + ' Lieferanten – moegliche Dublette.',
      })
    }
  }
  for (const [em, namen] of emailMap) {
    if (namen.length > 1) {
      befunde.push({
        id: 'dup-email-' + em, name: namen.join(', '), schwere: 'info',
        text: 'Gleiche E-Mail bei ' + namen.length + ' Lieferanten – evtl. Dublette.',
      })
    }
  }

  const anzahlFehler = befunde.filter((b) => b.schwere === 'fehler').length
  const anzahlWarnung = befunde.filter((b) => b.schwere === 'warnung').length
  const anzahlInfo = befunde.filter((b) => b.schwere === 'info').length
  const betroffene = new Set(befunde.map((b) => b.id)).size
  const aktiv = list.filter((l) => l.aktiv !== false).length

  return { gesamt: list.length, aktiv, befunde, anzahlFehler, anzahlWarnung, anzahlInfo, betroffene }
}

// ---- KI-Kontext fuer die Plausibilitaets-/Prioritaeten-Zusammenfassung ----
export function baueLieferantenKiKontext(bericht: LieferantenBericht): string {
  const zeilen = bericht.befunde.slice(0, 40).map((b) => '- ' + b.name + ': ' + b.text)
  return (
    'Ergebnis der Lieferanten-Stammdatenpruefung: ' + bericht.gesamt + ' Lieferanten gesamt, '
    + bericht.betroffene + ' mit Auffaelligkeiten ('
    + bericht.anzahlFehler + ' Fehler, ' + bericht.anzahlWarnung + ' Warnungen, ' + bericht.anzahlInfo + ' Hinweise).\n\n'
    + 'Einzelbefunde:\n' + zeilen.join('\n') + '\n\n'
    + 'Fasse fuer den Chef in Klartext zusammen, was zuerst korrigiert werden sollte. '
    + 'Wichtigste Prioritaet: falsche IBANs zuerst, weil dort Geld ans falsche Konto gehen kann. '
    + 'Weise kurz darauf hin, worauf er bei auslaendischen Lieferanten achten muss (Gebuehren, laengere Laufzeiten).'
  )
}
