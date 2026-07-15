'use client'

import { useState, type CSSProperties, type FormEvent } from 'react'
import PruefAuge from './PruefAuge'

export type FirmaProfil = {
  firma_name?: string | null
  firma_strasse?: string | null
  firma_plz?: string | null
  firma_ort?: string | null
  firma_telefon?: string | null
  firma_email?: string | null
  firma_website?: string | null
  firma_rechtsform?: string | null
  firma_registergericht?: string | null
  firma_hrb?: string | null
  firma_geschaeftsfuehrer?: string | null
  firma_ust_id?: string | null
  firma_steuernummer?: string | null
  firma_iban?: string | null
  firma_bank?: string | null
  firma_bic?: string | null
  firma_akzentfarbe?: string | null
}

type FeldKey = keyof FirmaProfil
type FeldDef = { key: FeldKey; label: string; placeholder?: string; breit?: boolean }
type Gruppe = { titel: string; hinweis?: string; felder: FeldDef[] }

const GRUPPEN: Gruppe[] = [
  {
    titel: 'Firma & Anschrift',
    felder: [
      { key: 'firma_name', label: 'Firmenname', placeholder: 'Schäfer Holzernteservice', breit: true },
      { key: 'firma_strasse', label: 'Straße & Hausnummer', placeholder: 'Hauptstraße 1', breit: true },
      { key: 'firma_plz', label: 'PLZ', placeholder: '71032' },
      { key: 'firma_ort', label: 'Ort', placeholder: 'Böblingen' },
    ],
  },
  {
    titel: 'Kontakt',
    felder: [
      { key: 'firma_telefon', label: 'Telefon', placeholder: '07031 123456' },
      { key: 'firma_email', label: 'E-Mail', placeholder: 'info@firma.de' },
      { key: 'firma_website', label: 'Website', placeholder: 'www.firma.de', breit: true },
    ],
  },
  {
    titel: 'Registerdaten',
    hinweis: 'Pflichtangaben für Geschäftsbriefe bei GmbH/UG (§ 35a GmbHG). Einzelunternehmen/Kleingewerbe lassen nicht zutreffende Felder leer.',
    felder: [
      { key: 'firma_rechtsform', label: 'Rechtsform', placeholder: 'GmbH / Einzelunternehmen' },
      { key: 'firma_geschaeftsfuehrer', label: 'Geschäftsführer / Inhaber', placeholder: 'Max Mustermann' },
      { key: 'firma_registergericht', label: 'Registergericht', placeholder: 'Amtsgericht Stuttgart' },
      { key: 'firma_hrb', label: 'Handelsregister-Nr.', placeholder: 'HRB 12345' },
    ],
  },
  {
    titel: 'Steuer',
    felder: [
      { key: 'firma_ust_id', label: 'USt-IdNr.', placeholder: 'DE123456789' },
      { key: 'firma_steuernummer', label: 'Steuernummer', placeholder: '12/345/67890' },
    ],
  },
  {
    titel: 'Bankverbindung',
    hinweis: 'Wird für Rechnungen verwendet (V4).',
    felder: [
      { key: 'firma_iban', label: 'IBAN', placeholder: 'DE00 0000 0000 0000 0000 00', breit: true },
      { key: 'firma_bank', label: 'Bank', placeholder: 'Kreissparkasse Böblingen' },
      { key: 'firma_bic', label: 'BIC', placeholder: 'BBKRDE6B' },
    ],
  },
]

const ALLE_KEYS: FeldKey[] = GRUPPEN.flatMap((g) => g.felder.map((f) => f.key))

const card: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  padding: '24px',
  marginBottom: '20px',
}
const gruppenTitel: CSSProperties = { fontSize: 'clamp(13px, 1.13vw, 18px)', fontWeight: 800, color: '#C9A84C', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px' }
const hinweisStil: CSSProperties = { fontSize: 'clamp(12px, 1.06vw, 17px)', color: 'rgba(255,255,255,0.45)', margin: '0 0 18px', lineHeight: 1.5 }
const labelStil: CSSProperties = { display: 'block', fontSize: 'clamp(12px, 1.06vw, 17px)', color: 'rgba(255,255,255,0.6)', marginBottom: '6px', fontWeight: 600 }
const inputStil: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(10,22,40,0.6)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  color: '#FFFFFF',
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-dm-sans), sans-serif',
}

export default function EinstellungenClient({ profil }: { profil: FirmaProfil }) {
  const initial: Record<FeldKey, string> = {} as Record<FeldKey, string>
  for (const k of ALLE_KEYS) initial[k] = (profil[k] ?? '') as string

  const [werte, setWerte] = useState<Record<FeldKey, string>>(initial)
  const [akzentfarbe, setAkzentfarbe] = useState<string>(profil.firma_akzentfarbe || '#1A1A2E')
  const [speichernd, setSpeichernd] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [istFehler, setIstFehler] = useState(false)

  function aendern(key: FeldKey, v: string) {
    setWerte((alt) => ({ ...alt, [key]: v }))
  }

  async function speichern(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSpeichernd(true)
    setMeldung(null)
    setIstFehler(false)
    try {
      const res = await fetch('/api/profil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...werte, firma_akzentfarbe: akzentfarbe }),
      })
      if (res.ok) {
        setMeldung('Firmenprofil gespeichert.')
      } else {
        const data = await res.json().catch(() => null)
        setIstFehler(true)
        setMeldung(data?.error || 'Speichern fehlgeschlagen.')
      }
    } catch {
      setIstFehler(true)
      setMeldung('Verbindungsfehler.')
    } finally {
      setSpeichernd(false)
    }
  }

  return (
    <form onSubmit={speichern}>
      <PruefAuge daten={werte} />

      {GRUPPEN.map((g) => (
        <section key={g.titel} style={card}>
          <h2 style={gruppenTitel}>{g.titel}</h2>
          {g.hinweis ? <p style={hinweisStil}>{g.hinweis}</p> : <div style={{ height: '12px' }} />}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {g.felder.map((f) => (
              <div key={f.key} style={f.breit ? { gridColumn: '1 / -1' } : undefined}>
                <label style={labelStil} htmlFor={f.key}>{f.label}</label>
                <input
                  id={f.key}
                  value={werte[f.key]}
                  onChange={(e) => aendern(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  style={inputStil}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <section style={card}>
        <h2 style={gruppenTitel}>Dokument-Branding</h2>
        <p style={hinweisStil}>Akzentfarbe für Überschriften und Linien in Ihren PDF-Dokumenten. Der Text bleibt schwarz/weiß. (Logo-Upload folgt.)</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <input
            type="color"
            value={akzentfarbe}
            onChange={(e) => setAkzentfarbe(e.target.value)}
            style={{ width: '56px', height: '40px', padding: 0, border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', background: 'transparent', cursor: 'pointer' }}
          />
          <input
            value={akzentfarbe}
            onChange={(e) => setAkzentfarbe(e.target.value)}
            placeholder="#1A1A2E"
            style={{ ...inputStil, maxWidth: '160px', marginBottom: 0 }}
          />
          <span style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: 'rgba(255,255,255,0.5)' }}>z. B. Dunkelgrün für einen Gärtnerbetrieb</span>
        </div>
      </section>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px' }}>
        <button
          type="submit"
          disabled={speichernd}
          style={{
            padding: '12px 28px',
            borderRadius: '10px',
            border: 'none',
            background: '#C9A84C',
            color: '#0A1628',
            fontSize: 'clamp(14px, 1.25vw, 20px)',
            fontWeight: 800,
            cursor: speichernd ? 'default' : 'pointer',
            opacity: speichernd ? 0.6 : 1,
            fontFamily: 'var(--font-dm-sans), sans-serif',
          }}
        >
          {speichernd ? 'Wird gespeichert…' : 'Firmenprofil speichern'}
        </button>
        {meldung ? (
          <span style={{ fontSize: 'clamp(14px, 1.25vw, 20px)', color: istFehler ? '#ef4444' : '#3ddc84', fontWeight: 600 }}>{meldung}</span>
        ) : null}
      </div>
    </form>
  )
}
