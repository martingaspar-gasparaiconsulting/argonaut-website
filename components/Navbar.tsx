'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:1000, background:'rgba(255,255,255,0.97)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(201,168,76,0.2)', height:'70px', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px' }}>

        {/* Logo */}
        <Link href='/' style={{ textDecoration:'none', display:'flex', alignItems:'center', gap:'10px' }}>
          <Image src='/images/ARGONAUT_HELM_SPARTAN .png' alt='ARGONAUT Logo' width={40} height={40} style={{ objectFit:'contain' }} />
          <span style={{ fontSize:'20px', fontWeight:900, color:'#0A1628', letterSpacing:'0.15em', textTransform:'uppercase' }}>ARGONAUT</span>
        </Link>

        {/* Desktop Links */}
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }} className='nav-desktop'>
          <a href='#leistungen' style={{ color:'#0A1628', textDecoration:'none', fontSize:'14px', fontWeight:500, padding:'8px 16px', borderRadius:'999px' }}>Leistungen</a>
          <a href='#vorgehen' style={{ color:'#0A1628', textDecoration:'none', fontSize:'14px', fontWeight:500, padding:'8px 16px', borderRadius:'999px' }}>Vorgehen</a>
          <Link href='/multistandort' style={{ color:'#0A1628', textDecoration:'none', fontSize:'14px', fontWeight:500, padding:'8px 12px' }}>Multistandort</Link>
          <Link href='/branchen' style={{ color:'#0A1628', textDecoration:'none', fontSize:'14px', fontWeight:500, padding:'8px 16px', borderRadius:'999px' }}>Branchen</Link>
          <a href='#uber-uns' style={{ color:'#0A1628', textDecoration:'none', fontSize:'14px', fontWeight:500, padding:'8px 16px', borderRadius:'999px' }}>Ueber uns</a>
        </div>

        {/* Desktop Buttons */}
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }} className='nav-desktop'>
          <a href='/auth/login' style={{ background:'transparent', color:'#C9A84C', fontWeight:700, fontSize:'14px', padding:'10px 24px', borderRadius:'999px', letterSpacing:'0.1em', textTransform:'uppercase', textDecoration:'none', border:'2px solid #C9A84C', whiteSpace:'nowrap' }}>Login</a>
          <a href='#kontakt' style={{ background:'#C9A84C', color:'#fff', fontWeight:700, fontSize:'14px', padding:'10px 24px', borderRadius:'999px', letterSpacing:'0.1em', textTransform:'uppercase', textDecoration:'none', border:'2px solid #C9A84C', whiteSpace:'nowrap' }}>Jetzt starten</a>
        </div>

        {/* Hamburger */}
        <button onClick={() => setOpen(!open)} className='nav-mobile' style={{ background:'none', border:'none', cursor:'pointer', padding:'8px', display:'flex', flexDirection:'column', gap:'5px' }}>
          <span style={{ display:'block', width:'24px', height:'2px', background:'#0A1628', transition:'all 0.3s', transform: open ? 'rotate(45deg) translate(5px,5px)' : 'none' }}></span>
          <span style={{ display:'block', width:'24px', height:'2px', background:'#0A1628', transition:'all 0.3s', opacity: open ? 0 : 1 }}></span>
          <span style={{ display:'block', width:'24px', height:'2px', background:'#0A1628', transition:'all 0.3s', transform: open ? 'rotate(-45deg) translate(5px,-5px)' : 'none' }}></span>
        </button>

      </nav>

      {/* Mobile Menu */}
      {open && (
        <div style={{ position:'fixed', top:'70px', left:0, right:0, zIndex:999, background:'#fff', borderBottom:'2px solid rgba(201,168,76,0.3)', padding:'24px', display:'flex', flexDirection:'column', gap:'16px' }}>
          <a href='#leistungen' onClick={() => setOpen(false)} style={{ color:'#0A1628', textDecoration:'none', fontSize:'16px', fontWeight:600, padding:'12px 0', borderBottom:'1px solid #f3f4f6' }}>Leistungen</a>
          <a href='#vorgehen' onClick={() => setOpen(false)} style={{ color:'#0A1628', textDecoration:'none', fontSize:'16px', fontWeight:600, padding:'12px 0', borderBottom:'1px solid #f3f4f6' }}>Vorgehen</a>
          <Link href='/multistandort' onClick={() => setOpen(false)} style={{ color:'#0A1628', textDecoration:'none', fontSize:'16px', fontWeight:600, padding:'12px 0', borderBottom:'1px solid #f3f4f6' }}>Multistandort</Link>
          <Link href='/branchen' onClick={() => setOpen(false)} style={{ color:'#0A1628', textDecoration:'none', fontSize:'16px', fontWeight:600, padding:'12px 0', borderBottom:'1px solid #f3f4f6' }}>Branchen</Link>
          <a href='#uber-uns' onClick={() => setOpen(false)} style={{ color:'#0A1628', textDecoration:'none', fontSize:'16px', fontWeight:600, padding:'12px 0', borderBottom:'1px solid #f3f4f6' }}>Ueber uns</a>
          <div style={{ display:'flex', flexDirection:'column', gap:'12px', paddingTop:'8px' }}>
            <a href='/auth/login' style={{ background:'transparent', color:'#C9A84C', fontWeight:700, fontSize:'15px', padding:'14px 24px', borderRadius:'999px', textTransform:'uppercase', textDecoration:'none', border:'2px solid #C9A84C', textAlign:'center' }}>Login</a>
            <a href='#kontakt' onClick={() => setOpen(false)} style={{ background:'#C9A84C', color:'#fff', fontWeight:700, fontSize:'15px', padding:'14px 24px', borderRadius:'999px', textTransform:'uppercase', textDecoration:'none', textAlign:'center' }}>Jetzt starten</a>
          </div>
        </div>
      )}

      <style>{`
        .nav-desktop { display: flex; }
        .nav-mobile { display: none; }
        @media (max-width: 768px) {
          .nav-desktop { display: none !important; }
          .nav-mobile { display: flex !important; }
        }
      `}</style>
    </>
  )
}
