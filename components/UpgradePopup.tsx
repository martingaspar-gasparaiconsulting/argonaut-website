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
      const res = await fetch('/api/check-popup')
      const json = await res.json()
      if (json.popup_aktiv === true) setVisible(true)
    }
    checkPopup()
  }, [])

  const handleClose = () => { setVisible(false); setDismissed(true) }
  const handleSnooze = () => { localStorage.setItem('upgrade_popup_snoozed', Date.now().toString()); setVisible(false) }

  if (!visible || dismissed) return null

  return (
    <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
      <div style={{position:'relative',background:'#0D1B3E',border:'1px solid #D4A843',borderRadius:'1rem',maxWidth:'440px',width:'100%',margin:'0 1rem',padding:'2rem'}}>
        <button onClick={handleClose} style={{position:'absolute',top:'1rem',right:'1rem',color:'rgba(255,255,255,0.4)',background:'none',border:'none',fontSize:'1.2rem',cursor:'pointer'}}>x</button>
        <div style={{display:'inline-block',background:'#D4A843',color:'#0D1B3E',fontSize:'0.7rem',fontWeight:'bold',padding:'0.2rem 0.8rem',borderRadius:'9999px',marginBottom:'1rem'}}>SOLO BETA LAEUFT AUS</div>
        <h2 style={{color:'white',fontSize:'1.4rem',fontWeight:'bold',marginBottom:'0.75rem'}}>Bereit fuer den naechsten Schritt?</h2>
        <p style={{color:'rgba(255,255,255,0.7)',fontSize:'0.875rem',marginBottom:'1.5rem',lineHeight:1.6}}>Dein SOLO Beta-Zugang endet in wenigen Wochen. Wechsle jetzt zu einem ARGONAUT OS Paket ohne Unterbrechung.</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem',marginBottom:'1.5rem'}}>
          <div style={{border:'1px solid rgba(255,255,255,0.2)',borderRadius:'0.75rem',padding:'0.75rem',textAlign:'center'}}><div style={{color:'#D4A843',fontWeight:'bold'}}>START</div><div style={{color:'white',fontSize:'0.75rem'}}>8 Agenten</div><div style={{color:'rgba(255,255,255,0.6)',fontSize:'0.75rem'}}>1.500 EUR/Monat</div></div>
          <div style={{border:'1px solid rgba(255,255,255,0.2)',borderRadius:'0.75rem',padding:'0.75rem',textAlign:'center'}}><div style={{color:'#D4A843',fontWeight:'bold'}}>PRO</div><div style={{color:'white',fontSize:'0.75rem'}}>16 Agenten</div><div style={{color:'rgba(255,255,255,0.6)',fontSize:'0.75rem'}}>2.500 EUR/Monat</div></div>
        </div>
        <a href='/dashboard/upgrade' style={{display:'block',background:'#D4A843',color:'#0D1B3E',fontWeight:'bold',textAlign:'center',padding:'0.75rem',borderRadius:'0.75rem',textDecoration:'none',marginBottom:'0.75rem'}}>Jetzt upgraden</a>
        <button onClick={handleSnooze} style={{display:'block',width:'100%',textAlign:'center',color:'rgba(255,255,255,0.4)',background:'none',border:'none',fontSize:'0.75rem',cursor:'pointer'}}>Spaeter erinnern (24h)</button>
      </div>
    </div>
  )
}
