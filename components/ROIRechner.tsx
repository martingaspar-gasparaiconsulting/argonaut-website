'use client'

import { useState } from 'react'

interface Props {
  stundenProWoche: { klein: number; mittel: number; gross: number }
}

export default function ROIRechner({ stundenProWoche }: Props) {
  const [groesse, setGroesse] = useState<'klein' | 'mittel' | 'gross'>('mittel')
  const [stundenlohn, setStundenlohn] = useState(35)

  const stunden = stundenProWoche[groesse]
  const jahresersparnis = stunden * 52 * stundenlohn
  const argonautKosten = 18000
  const roi = Math.round((jahresersparnis / argonautKosten) * 10) / 10

  const optionen = [
    { key: 'klein' as const, label: '1–3 MA' },
    { key: 'mittel' as const, label: '4–10 MA' },
    { key: 'gross' as const, label: '11–25 MA' },
  ]

  return (
    <div className="bg-[#F7F6F3] rounded-2xl p-8 mb-16">
      <div className="mb-6">
        <div className="text-[#C9A84C] text-xs tracking-widest uppercase font-medium mb-2">ROI-Rechner</div>
        <h3 className="text-[#0A1628] text-2xl font-bold">Was sparen Sie konkret?</h3>
        <p className="text-gray-500 text-sm mt-1">Berechnen Sie Ihre individuelle Ersparnis — basierend auf Praxisdaten aus Ihrer Branche.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <label className="text-[#0A1628] text-sm font-medium mb-3 block">Anzahl Mitarbeiter</label>
            <div className="flex gap-3">
              {optionen.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setGroesse(opt.key)}
                  className={`flex-1 border rounded-xl p-3 text-center text-sm transition-all ${
                    groesse === opt.key
                      ? 'border-[#C9A84C] text-[#0A1628] font-semibold bg-white'
                      : 'border-gray-200 text-gray-500 bg-white hover:border-[#C9A84C]/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[#0A1628] text-sm font-medium mb-3 block">
              Stundenlohn: <span className="text-[#C9A84C] font-bold">{stundenlohn} €</span>
            </label>
            <input
              type="range"
              min={12}
              max={120}
              step={1}
              value={stundenlohn}
              onChange={(e) => setStundenlohn(Number(e.target.value))}
              className="w-full accent-[#C9A84C]"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>12 €</span>
              <span>120 €</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {[12, 35, 75].map((val) => (
              <button
                key={val}
                onClick={() => setStundenlohn(val)}
                className={`border rounded-lg py-2 text-xs transition-all ${
                  stundenlohn === val
                    ? 'border-[#C9A84C] text-[#0A1628] font-semibold bg-white'
                    : 'border-gray-200 text-gray-400 bg-white hover:border-[#C9A84C]/50'
                }`}
              >
                {val === 12 ? 'Mindestlohn' : val === 35 ? 'Mittelstand' : 'Fachkraft'}
                <div className="font-bold mt-0.5">{val} €</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-4">Ihre Ersparnis</div>
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <span className="text-gray-500 text-sm">Stunden gespart / Woche</span>
              <span className="text-[#0A1628] font-bold">{stunden} Std</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <span className="text-gray-500 text-sm">Stunden gespart / Jahr</span>
              <span className="text-[#0A1628] font-bold">{stunden * 52} Std</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <span className="text-gray-500 text-sm">Wert bei {stundenlohn} €/Std</span>
              <span className="text-[#C9A84C] font-bold">{jahresersparnis.toLocaleString('de-DE')} €</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">ARGONAUT Kosten / Jahr</span>
              <span className="text-gray-400 text-sm">ab 18.000 €</span>
            </div>
          </div>
          <div className="mt-4 bg-[#0A1628] rounded-xl p-4 text-center">
            <div className="text-white/60 text-xs mb-1">Ihr ROI</div>
            <div className="text-[#C9A84C] text-3xl font-bold">{roi}x</div>
            <div className="text-white/40 text-xs mt-1">
              {roi >= 3 ? 'Ausgezeichnet' : roi >= 2 ? 'Sehr gut' : 'Positiv'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}