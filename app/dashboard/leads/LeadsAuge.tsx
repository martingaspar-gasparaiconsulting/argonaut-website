'use client'

import KiAuge from '../_components/KiAuge'
import { verstricheneStunden } from '../_components/fristLogik'
import type { Lead } from './LeadsClient'

// Baut den Kontext-String fuer das KI-Auge – ausschliesslich aus echten Feldern,
// nichts erfunden. Geschlossen kostet das Auge nichts; erst beim Klick liest die
// KI diesen Kontext und sagt dem Chef in Klartext, worum er sich kuemmern soll.
function baueKontext(leads: Lead[]): string {
  if (!leads || leads.length === 0) {
    return 'Es sind aktuell keine Anfragen oder Leads vorhanden.'
  }

  const zeilen: string[] = []

  const neueAnfragen = leads.filter((l) => l.ist_bestand !== true)
  const bestand = leads.filter((l) => l.ist_bestand === true)
  zeilen.push(
    'Insgesamt ' + leads.length + ' Eintraege: ' + neueAnfragen.length +
    ' neue Anfragen, ' + bestand.length + ' Bestandskontakte.'
  )

  const statusZahl = (s: string) => leads.filter((l) => l.status === s).length
  zeilen.push(
    'Status-Verteilung: ' + statusZahl('neu') + ' neu, ' + statusZahl('offen') +
    ' offen, ' + statusZahl('gewonnen') + ' gewonnen, ' + statusZahl('verloren') + ' verloren.'
  )

  // Offene, unbeantwortete Neuanfragen nach Wartezeit sortiert (aelteste zuerst).
  const offen = leads
    .filter((l) => l.status === 'neu' && l.ist_bestand !== true)
    .map((l) => ({ l, std: verstricheneStunden(l.created_at) ?? 0 }))
    .sort((a, b) => b.std - a.std)

  if (offen.length > 0) {
    const ueber4 = offen.filter((x) => x.std >= 4).length
    const ueber24 = offen.filter((x) => x.std >= 24).length
    zeilen.push(
      offen.length + ' neue Anfrage(n) unbeantwortet, davon ' + ueber4 +
      ' seit ueber 4 Std. und ' + ueber24 + ' seit ueber 24 Std.'
    )
    const top = offen.slice(0, 5).map((x) => {
      const std = Math.round(x.std)
      const dauer = std >= 24 ? Math.floor(std / 24) + ' Tag(e)' : std + ' Std.'
      const score = x.l.score ? ', Prioritaet ' + x.l.score + '/5' : ''
      const leistung = x.l.dienstleistung ? ', ' + x.l.dienstleistung : ''
      const schritt = x.l.ki_naechster_schritt ? ' [KI-Empfehlung: ' + x.l.ki_naechster_schritt + ']' : ''
      return '- ' + (x.l.name || 'Ohne Namen') + ': wartet seit ' + dauer + score + leistung + schritt
    })
    zeilen.push('Aelteste offene Anfragen:\n' + top.join('\n'))
  }

  // Heisse Leads: hohe Prioritaet (4-5), noch nicht abgeschlossen.
  const heiss = leads
    .filter((l) => (l.score ?? 0) >= 4 && l.status !== 'gewonnen' && l.status !== 'verloren')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  if (heiss.length > 0) {
    const liste = heiss.slice(0, 5).map((l) =>
      '- ' + (l.name || 'Ohne Namen') + ' (Prioritaet ' + l.score + '/5' +
      (l.dienstleistung ? ', ' + l.dienstleistung : '') + ')'
    ).join('\n')
    zeilen.push(heiss.length + ' heisse Anfrage(n) mit hoher Prioritaet (4-5), noch offen:\n' + liste)
  }

  return zeilen.join('\n\n')
}

export default function LeadsAuge({ leads }: { leads: Lead[] }) {
  const kontext = baueKontext(leads)
  return (
    <div style={{ marginBottom: '24px' }}>
      <KiAuge modul="Leads / Anfragen" kontext={kontext} />
    </div>
  )
}
