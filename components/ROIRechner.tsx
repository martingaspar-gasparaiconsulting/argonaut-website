'use client'

import { useState } from 'react'

interface Props {
  stundenProWoche: { klein: number; mittel: number; gross: number }
}

const NK = 1.2

export default function ROIRechner({ stundenProWoche }: Props) {
  const [groesse, setGroesse] = useState<'klein' | 'mittel' | 'gross'>('mittel')
  const [preset, setPreset] = useState<number>(21.6)
  const [indivMA, setIndivMA] = useState<string>('')
  const [indivStunde, setIndivStunde] = useState<string>('')
  const [indivMonat, setIndivMonat] = useState<string>('')

  const presets = [
    { label: 'Mindestlohn', brutto: 13.9, gesamt: Math.round(13.9 * NK * 10) / 10 },
    { label: 'Kaufmännisch', brutto: 18, gesamt: Math.round(18 * NK * 10) / 10 },
    { label: 'Fachkraft', brutto: 35, gesamt: Math.round(35 * NK * 10) / 10 },
  ]

  const maOptionen = [
    { key: 'klein' as const, label: '1–3 MA' },
    { key: 'mittel' as const, label: '4–10 MA' },
    { key: 'gross' as const, label: '11–25 MA' },
  ]

  const isIndiv = indivMA !== '' || indivStunde !== '' || indivMonat !== ''

  const stunden = isIndiv && indivMA
    ? Math.round(parseInt(indivMA) * stundenProWoche.mittel / 7)
    : stundenProWoche[groesse]

  let lohnMitNK = preset
  if (isIndiv) {
    if (indivStunde) lohnMitNK = Math.round(parseFloat(indivStunde) * NK * 100) / 100
    else if (indivMonat) lohnMitNK = Math.round((parseFloat(indivMonat) / 4.33 / 40) * NK * 100) / 100
  }

  const jahresersparnis = Math.round(stunden * 52 * lohnMitNK)
  const argonautKosten = 18000
  const roi = Math.round((jahresersparnis / argonautKosten) * 10) / 10
  const rating = roi >= 3 ? 'Ausgezeichnet' : roi >= 2 ? 'Sehr gut' : roi >= 1.5 ? 'Gut' : 'Positiv'

  const handlePreset = (val: number) => {
    setPreset(val)
    setIndivMA('')
    setIndivStunde('')
    setIndivMonat('')
  }

  const handleMA = (key: 'klein' | 'mittel' | 'gross') => {
    setGroesse(key)
    setIndivMA('')
  }

  return (
    <div className="bg-[#F7F6F3] rounded-2xl p-8 mb-16">
      <div className="mb-6">
        <div className="text-[#C9A84C] text-xs tracking-widest uppercase font-medium mb-2">ROI-Rechner</div>
        <h3 className="text-[#0A1628] text-2xl font-bold">Was sparen Sie konkret?</h3>
        <p className="text-gray-500 text-sm mt-1">Wählen Sie Ihre Kategorie oder geben Sie eigene Werte ein — inkl. Lohnnebenkosten.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-5">

          <div>
            <label className="text-[#0A1628] text-sm font-medium mb-3 block">Anzahl Mitarbeiter</label>
            <div className="flex gap-3">
              {maOptionen.map((opt) => (
                <button key={opt.key} onClick={() => handleMA(opt.key)}
                  className={`flex-1 border rounded-xl p-3 text-center text-sm transition-all ${
                    groesse === opt.key && !indivMA
                      ? 'border-[#C9A84C] text-[#0A1628] font-semibold bg-white'
                      : 'border-gray-200 text-gray-500 bg-white hover:border-[#C9A84C]/50'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[#0A1628] text-sm font-medium mb-3 block">
              Lohnkategorie <span className="text-gray-400 font-normal">(inkl. ~20% Arbeitgeberanteil)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((p) => (
                <button key={p.label} onClick={() => handlePreset(p.gesamt)}
                  className={`border rounded-xl p-3 text-center transition-all ${
                    preset === p.gesamt && !isIndiv
                      ? 'border-[#C9A84C] bg-white'
                      : 'border-gray-200 bg-white hover:border-[#C9A84C]/50'
                  }`}>
                  <div className="text-gray-400 text-xs mb-1">{p.label}</div>
                  <div className="text-[#0A1628] text-sm font-semibold">{p.brutto.toFixed(2).replace('.', ',')} €</div>
                  <div className="text-[#C9A84C] text-xs mt-0.5">+ NK ≈ {p.gesamt.toFixed(2).replace('.', ',')} €</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-[#0A1628] text-xs font-semibold uppercase tracking-wider mb-3">Eigene Werte eingeben</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Mitarbeiter</label>
                <input type="number" min="1" placeholder="z.B. 46"
                  value={indivMA}
                  onChange={(e) => setIndivMA(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0A1628] text-right focus:outline-none focus:border-[#C9A84C]" />
                <div className="text-gray-300 text-xs mt-1 text-right">Personen</div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Stundenlohn</label>
                <input type="number" placeholder="z.B. 17.50"
                  value={indivStunde}
                  onChange={(e) => { setIndivStunde(e.target.value); setIndivMonat('') }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0A1628] text-right focus:outline-none focus:border-[#C9A84C]" />
                <div className="text-gray-300 text-xs mt-1 text-right">€ / Std</div>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Monatsgehalt</label>
                <input type="number" placeholder="z.B. 2800"
                  value={indivMonat}
                  onChange={(e) => { setIndivMonat(e.target.value); setIndivStunde('') }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0A1628] text-right focus:outline-none focus:border-[#C9A84C]" />
                <div className="text-gray-300 text-xs mt-1 text-right">€ / Monat</div>
              </div>
            </div>
            <div className="text-gray-300 text-xs mt-2 text-center">Arbeitgeberanteile (~20%) werden automatisch addiert.</div>
          </div>

        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-4">Ihre Ersparnis</div>
          <div className="space-y-3">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <span className="text-gray-500 text-sm">Stunden gespart / Woche</span>
              <span className="text-[#0A1628] font-bold">{stunden} Std</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <span className="text-gray-500 text-sm">Stunden gespart / Jahr</span>
              <span className="text-[#0A1628] font-bold">{(stunden * 52).toLocaleString('de-DE')} Std</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <span className="text-gray-500 text-sm">Lohnkosten inkl. NK</span>
              <span className="text-[#0A1628] font-bold">{lohnMitNK.toFixed(2).replace('.', ',')} €/Std</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <span className="text-gray-500 text-sm">Ersparnis / Jahr</span>
              <span className="text-[#C9A84C] font-bold">{jahresersparnis.toLocaleString('de-DE')} €</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">ARGONAUT / Jahr</span>
              <span className="text-gray-400 text-sm">ab 18.000 €</span>
            </div>
          </div>
          <div className="mt-4 bg-[#0A1628] rounded-xl p-4 text-center">
            <div className="text-white/60 text-xs mb-1">Ihr ROI</div>
            <div className="text-[#C9A84C] text-3xl font-bold">{roi}x</div>
            <div className="text-white/40 text-xs mt-1">{rating}</div>
          </div>
        </div>
      </div>
    </div>
  )
}