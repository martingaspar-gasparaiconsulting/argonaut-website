'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function UpgradePopup() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const snoozed = localStorage.getItem('upgrade_popup_snoozed')
    if (snoozed) {
      const snoozedAt = parseInt(snoozed)
      const hoursPassed = (Date.now() - snoozedAt) / (1000 * 60 * 60)
      if (hoursPassed < 24) return
    }

    const checkPopup = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: customer } = await supabase
        .from('customers')
        .select('popup_aktiv, paket')
        .eq('supabase_user_id', user.id)
        .single()

      if (customer?.popup_aktiv === true) {
        setVisible(true)
      }
    }

    checkPopup()
  }, [])

  const handleClose = () => {
    setVisible(false)
    setDismissed(true)
  }

  const handleSnooze = () => {
    localStorage.setItem('upgrade_popup_snoozed', Date.now().toString())
    setVisible(false)
  }

  if (!visible || dismissed) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-[#0D1B3E] border border-[#D4A843] rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
        
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white text-xl leading-none"
        >
          ✕
        </button>

        {/* Badge */}
        <div className="inline-block bg-[#D4A843] text-[#0D1B3E] text-xs font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">
          Dein SOLO Beta läuft aus
        </div>

        {/* Headline */}
        <h2 className="text-white text-2xl font-bold mb-3 leading-tight">
          Bereit für den nächsten Schritt?
        </h2>

        {/* Text */}
        <p className="text-white/70 text-sm mb-6 leading-relaxed">
          Dein SOLO Beta-Zugang endet in wenigen Wochen. Wechsle jetzt zu einem vollwertigen ARGONAUT OS Paket und behalte alle Agenten, alle Automatisierungen — ohne Unterbrechung.
        </p>

        {/* Paket Optionen */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { name: 'START', agents: '8 Agenten', preis: '1.500€' },
            { name: 'PRO', agents: '16 Agenten', preis: '2.500€' },
          ].map((p) => (
            <div key={p.name} className="border border-white/20 rounded-xl p-3 text-center hover:border-[#D4A843] transition-colors cursor-pointer">
              <div className="text-[#D4A843] font-bold text-sm">{p.name}</div>
              <div className="text-white text-xs mt-1">{p.agents}</div>
              <div className="text-white/60 text-xs">{p.preis}/Monat</div>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        
          href="/dashboard/upgrade"
          className="block w-full bg-[#D4A843] hover:bg-[#C9A84C] text-[#0D1B3E] font-bold text-center py-3 rounded-xl transition-colors mb-3"
        >
          Jetzt upgraden →
        </a>

        {/* Snooze */}
        <button
          onClick={handleSnooze}
          className="block w-full text-center text-white/40 hover:text-white/70 text-xs transition-colors"
        >
          Später erinnern (24h)
        </button>

      </div>
    </div>
  )
}