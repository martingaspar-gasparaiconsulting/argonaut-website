'use client'

import { useEffect, useState } from 'react'

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
      try {
        const res = await fetch('/api/check-popup')
        const json = await res.json()
        if (json.popup_aktiv === true) setVisible(true)
      } catch {}
    }
    checkPopup()
  }, [])

  const handleClose = () => { setVisible(false); setDismissed(true) }
  const handleSnooze = () => {
    localStorage.setItem('upgrade_popup_snoozed', Date.now().toString())
    setVisible(false)
  }

  if (!visible || dismissed) return null

  const overlay = { position:'fixed' as const, inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)' }
  const box = { position:'relative' as const, background:'#0D1B3E', border:'1px solid #D4A843', borderRadius:'1rem', maxWidth:'440px', width:'100%', margin:'0 1rem', padding:'2rem' }
  const closeBtn = { position:'absolute' as const, top:'1rem', right:'1rem', color:'rgba(255,255,255,0.4)', background:'none', border:'none', fontSize:'1.2rem', cursor:'pointer' }
  const badge = { display:'inline-block', background:'#D4A843', color:'#0D1B3E', fontSize:'0.7rem', fontWeight:'bold' as const, padding:'0.2rem 0.8rem', borderRadius:'9999px', marginBottom:'1rem' }
  const h2 = { color:'white', fontSize:'1.4rem', fontWeight:'bold' as const, marginBottom:'0.75rem' }
  const p = { color:'rgba(255,255,255,0.7)', fontSize:'0.875rem', marginBottom:'1.5rem', lineHeight:1.6 }
  const grid = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'1.5rem' }
  const card = { border:'1px solid rgba(255,255,255,0.2)', borderRadius:'0.75rem', padding:'0.75rem', textAlign:'center' as const }
  const cardTitle = { color:'#D4A843', fontWeight:'bold' as const, fontSize:'0.875rem' }
  const cardSub = { color:'white', fontSize:'0.75rem', marginTop:'0.25rem' }
  const cardPrice = { color:'rgba(255,255,255,0.6)', fontSize:'0.75rem' }
  const ctaBtn = { display:'block', background:'#D4A843', color:'#0D1B3E', fontWeight:'bold' as const, textAlign:'center' as const, padding:'0.75rem', borderRadius:'0.75rem', textDecoration:'none', marginBottom:'0.75rem' }
  const snoozeBtn = { display:'block', width:'100%', textAlign:'center' as const, color:'rgba(255,255,255,0.4)', background:'none', border:'none', fontSize:'0.75rem', cursor:'pointer' }

  return (
    <div style={overlay}>
      <div style={box}>
        <button onClick={handleClose} style={closeBtn}>x</button>
        <div style={badge}>SOLO BETA LAEUFT AUS</div>
        <h2 style={h2}>Bereit fuer den naechsten Schritt?</h2>
        <p style={p}>Dein SOLO Beta-Zugang endet in wenigen Wochen. Wechsle jetzt zu einem ARGONAUT OS Paket ohne Unterbrechung.</p>
        <div style={grid}>
          <div style={card}>
            <div style={cardTitle}>START</div>
            <div style={cardSub}>8 Agenten</div>
            <div style={cardPrice}>1.500 EUR/Monat</div>
          </div>
          <div style={card}>
            <div style={cardTitle}>PRO</div>
            <div style={cardSub}>16 Agenten</div>
            <div style={cardPrice}>2.500 EUR/Monat</div>
          </div>
        </div>
        <a href='/dashboard/upgrade' style={ctaBtn}>Jetzt upgraden</a>
        <button onClick={handleSnooze} style={snoozeBtn}>Spaeter erinnern (24h)</button>
      </div>
    </div>
  )
}
