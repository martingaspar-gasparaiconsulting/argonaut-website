// Deterministische Pruefregeln fuer das Firmenprofil.
// Reine Funktionen – keine KI, keine Netzwerkzugriffe. Laeuft sofort und kostenlos.

export type FirmaFelder = { [key: string]: string | null | undefined }

export type PruefStatus = 'ok' | 'warnung' | 'fehler'

export type PruefErgebnis = {
  feld: string        // technischer Key, z.B. 'firma_iban'
  label: string       // Anzeigename
  status: PruefStatus
  text: string        // Klartext-Befund
}

export type PruefBericht = {
  ergebnisse: PruefErgebnis[]
  anzahlOk: number
  anzahlWarnung: number
  anzahlFehler: number
  gesamt: PruefStatus // schlechtester Einzelstatus
}

function clean(v: string | null | undefined): string {
  return (v ?? '').trim()
}

// ---- IBAN: echte Mod-97-Pruefung (ISO 13616) ----
export function pruefeIban(ibanRoh: string): { gueltig: boolean; grund?: string; blz?: string } {
  const iban = ibanRoh.replace(/\s+/g, '').toUpperCase()
  if (iban === '') return { gueltig: false, grund: 'leer' }
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) {
    return { gueltig: false, grund: 'Format ungueltig (Laenderkuerzel + 2 Pruefziffern erwartet)' }
  }
  const land = iban.slice(0, 2)
  if (land === 'DE' && iban.length !== 22) {
    return { gueltig: false, grund: 'Deutsche IBAN muss genau 22 Zeichen haben (aktuell ' + iban.length + ')' }
  }
  if (iban.length < 15 || iban.length > 34) {
    return { gueltig: false, grund: 'Laenge ausserhalb 15-34 Zeichen' }
  }
  // Erste 4 Zeichen ans Ende stellen
  const umgestellt = iban.slice(4) + iban.slice(0, 4)
  // Buchstaben -> Zahlen (A=10 ... Z=35)
  let numerisch = ''
  for (const ch of umgestellt) {
    if (ch >= '0' && ch <= '9') numerisch += ch
    else numerisch += (ch.charCodeAt(0) - 55).toString()
  }
  // Mod 97 stueckweise (fuer beliebig grosse Zahl)
  let rest = 0
  for (const ziffer of numerisch) {
    rest = (rest * 10 + Number(ziffer)) % 97
  }
  if (rest !== 1) return { gueltig: false, grund: 'Pruefziffer stimmt nicht (Tippfehler in der IBAN?)' }
  // BLZ (nur DE): Stellen 5-12
  const blz = land === 'DE' ? iban.slice(4, 12) : undefined
  return { gueltig: true, blz }
}

// ---- Gesamtpruefung des Firmenprofils ----
export function pruefeFirma(f: FirmaFelder): PruefBericht {
  const e: PruefErgebnis[] = []
  const add = (feld: string, label: string, status: PruefStatus, text: string) =>
    e.push({ feld, label, status, text })

  // --- Pflichtfelder fuer Rechnungen / Geschaeftsbriefe ---
  const name = clean(f.firma_name)
  if (name === '') add('firma_name', 'Firmenname', 'fehler', 'Firmenname fehlt – Pflicht auf jeder Rechnung.')
  else add('firma_name', 'Firmenname', 'ok', name)

  const strasse = clean(f.firma_strasse)
  if (strasse === '') add('firma_strasse', 'Strasse', 'fehler', 'Strasse & Hausnummer fehlen.')
  else add('firma_strasse', 'Strasse', 'ok', strasse)

  const plz = clean(f.firma_plz)
  if (plz === '') add('firma_plz', 'PLZ', 'fehler', 'PLZ fehlt.')
  else if (!/^[0-9]{5}$/.test(plz)) add('firma_plz', 'PLZ', 'fehler', 'PLZ muss 5 Ziffern haben (aktuell: ' + plz + ').')
  else add('firma_plz', 'PLZ', 'ok', plz)

  const ort = clean(f.firma_ort)
  if (ort === '') add('firma_ort', 'Ort', 'fehler', 'Ort fehlt.')
  else add('firma_ort', 'Ort', 'ok', ort)

  // --- Kontakt ---
  const email = clean(f.firma_email)
  if (email === '') add('firma_email', 'E-Mail', 'warnung', 'Keine E-Mail hinterlegt.')
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) add('firma_email', 'E-Mail', 'fehler', 'E-Mail-Format ungueltig.')
  else add('firma_email', 'E-Mail', 'ok', email)

  const tel = clean(f.firma_telefon)
  if (tel !== '' && !/[0-9]/.test(tel)) add('firma_telefon', 'Telefon', 'warnung', 'Telefonnummer enthaelt keine Ziffern.')
  else if (tel !== '') add('firma_telefon', 'Telefon', 'ok', tel)

  const web = clean(f.firma_website)
  if (web !== '' && (/\s/.test(web) || !web.includes('.'))) add('firma_website', 'Website', 'warnung', 'Website sieht ungueltig aus.')
  else if (web !== '') add('firma_website', 'Website', 'ok', web)

  // --- Steuer: USt-ID oder Steuernummer sollte vorhanden sein ---
  const ust = clean(f.firma_ust_id).replace(/\s+/g, '').toUpperCase()
  const stnr = clean(f.firma_steuernummer)
  if (ust !== '') {
    if (/^DE[0-9]{9}$/.test(ust)) add('firma_ust_id', 'USt-IdNr.', 'ok', ust)
    else add('firma_ust_id', 'USt-IdNr.', 'fehler', 'USt-IdNr. muss "DE" + 9 Ziffern sein (z.B. DE123456789).')
  }
  if (stnr !== '') {
    const nurZiffern = stnr.replace(/\D/g, '')
    if (nurZiffern.length === 10 || nurZiffern.length === 11) add('firma_steuernummer', 'Steuernummer', 'ok', stnr)
    else add('firma_steuernummer', 'Steuernummer', 'warnung', 'Steuernummer hat ungewoehnliche Laenge (' + nurZiffern.length + ' Ziffern, erwartet 10-11).')
  }
  if (ust === '' && stnr === '') {
    add('firma_steuernummer', 'Steuer', 'warnung', 'Weder USt-IdNr. noch Steuernummer hinterlegt – mind. eine ist fuer Rechnungen noetig.')
  }

  // --- Rechtsform ---
  const rechtsform = clean(f.firma_rechtsform)
  if (rechtsform === '') add('firma_rechtsform', 'Rechtsform', 'warnung', 'Keine Rechtsform angegeben.')
  else add('firma_rechtsform', 'Rechtsform', 'ok', rechtsform)

  // --- Bankverbindung ---
  const ibanRoh = clean(f.firma_iban)
  const bic = clean(f.firma_bic).replace(/\s+/g, '').toUpperCase()
  const bank = clean(f.firma_bank)
  let blzHinweis = ''
  if (ibanRoh === '') {
    add('firma_iban', 'IBAN', 'warnung', 'Keine IBAN hinterlegt – fuer Rechnungen empfohlen.')
  } else {
    const r = pruefeIban(ibanRoh)
    if (r.gueltig) {
      add('firma_iban', 'IBAN', 'ok', ibanRoh + (r.blz ? '  (BLZ ' + r.blz + ')' : ''))
      if (r.blz) blzHinweis = r.blz
    } else {
      add('firma_iban', 'IBAN', 'fehler', 'IBAN ungueltig: ' + (r.grund || 'unbekannt') + '.')
    }
  }
  if (bic !== '') {
    if (/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
      const bicLand = bic.slice(4, 6)
      if (bicLand !== 'DE') add('firma_bic', 'BIC', 'warnung', 'BIC-Format ok, aber Laenderteil ist "' + bicLand + '" (nicht DE).')
      else add('firma_bic', 'BIC', 'ok', bic)
    } else {
      add('firma_bic', 'BIC', 'fehler', 'BIC-Format ungueltig (8 oder 11 Stellen erwartet).')
    }
  }
  if (bank === '' && ibanRoh !== '') {
    add('firma_bank', 'Bank', 'warnung', 'Kein Bankname hinterlegt' + (blzHinweis ? ' (BLZ aus IBAN: ' + blzHinweis + ').' : '.'))
  } else if (bank !== '') {
    add('firma_bank', 'Bank', 'ok', bank)
  }

  const anzahlOk = e.filter((x) => x.status === 'ok').length
  const anzahlWarnung = e.filter((x) => x.status === 'warnung').length
  const anzahlFehler = e.filter((x) => x.status === 'fehler').length
  const gesamt: PruefStatus = anzahlFehler > 0 ? 'fehler' : anzahlWarnung > 0 ? 'warnung' : 'ok'

  return { ergebnisse: e, anzahlOk, anzahlWarnung, anzahlFehler, gesamt }
}

// ---- Kontext fuer die KI-Plausibilitaetspruefung ----
export function baueKiKontext(f: FirmaFelder): string {
  const zeile = (label: string, v: string | null | undefined) => label + ': ' + (clean(v) || '(leer)')
  const daten = [
    zeile('Firmenname', f.firma_name),
    zeile('Rechtsform', f.firma_rechtsform),
    zeile('Geschaeftsfuehrer/Inhaber', f.firma_geschaeftsfuehrer),
    zeile('Strasse', f.firma_strasse),
    zeile('PLZ', f.firma_plz),
    zeile('Ort', f.firma_ort),
    zeile('Registergericht', f.firma_registergericht),
    zeile('Handelsregister-Nr', f.firma_hrb),
    zeile('USt-IdNr', f.firma_ust_id),
    zeile('Steuernummer', f.firma_steuernummer),
    zeile('IBAN', f.firma_iban),
    zeile('Bank', f.firma_bank),
    zeile('BIC', f.firma_bic),
  ].join('\n')

  return (
    'Pruefe die folgenden Firmen-Stammdaten auf inhaltliche Plausibilitaet und Konsistenz. '
    + 'Formale Formatpruefungen (IBAN-Pruefziffer, USt-ID-Laenge, PLZ) sind bereits erledigt – '
    + 'konzentriere dich rein auf inhaltliche Stimmigkeit. Pruefe insbesondere:\n'
    + '- Passt die Rechtsform zum Firmennamen? (Enthaelt der Name z.B. "GmbH", "UG", "e.K.", aber Rechtsform ist leer oder widerspricht?)\n'
    + '- Sind bei einer GmbH/UG die Pflichtangaben (Registergericht, Handelsregister-Nr, Geschaeftsfuehrer) vorhanden?\n'
    + '- Passt der Bankname plausibel zur IBAN (deutsche Bankleitzahl in Stellen 5-12)?\n'
    + '- Ist die Anschrift vollstaendig und stimmig (passt die PLZ grob zum Ort)?\n'
    + '- Faellt sonst etwas auf, das der Chef pruefen sollte?\n\n'
    + 'Antworte kurz und konkret. Wenn alles stimmig ist, sag das klar.\n\n'
    + 'DATEN:\n' + daten
  )
}
