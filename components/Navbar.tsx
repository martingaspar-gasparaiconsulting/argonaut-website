'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav style={{background:'#0d1b2e', borderBottom:'1px solid #1e3a5f'}} className="flex justify-between items-center px-8 md:px-16 py-6 sticky top-0 z-50 backdrop-blur-md">
      <Link href="/" className="font-[family-name:var(--font-syne)] font-bold text-xl tracking-widest text-[#e8e6e0]">
        ARG<span className="text-[#c9a84c]">O</span>NAUT
      </Link>
      <ul className="hidden md:flex gap-10 list-none">
        {['Leistungen', 'Vorgehen', 'Branchen', 'Über uns'].map((item) => (
          <li key={item}>
            <Link href={`#${item.toLowerCase().replace(' ', '-')}`} className="text-sm text-[#7a8fa6] tracking-[0.04em] hover:text-[#e8e6e0] transition-colors duration-200">
              {item}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="#kontakt" className="hidden md:inline-flex font-[family-name:var(--font-syne)] font-semibold text-xs tracking-[0.1em] uppercase px-5 py-3 border border-[#c9a84c] text-[#c9a84c] hover:bg-[#c9a84c] hover:text-[#0d1b2e] transition-all duration-200">
        Gespräch anfragen
      </Link>
      <button className="md:hidden text-[#7a8fa6]" onClick={() => setMenuOpen(!menuOpen)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          {menuOpen ? <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /> : <><line x1="3" y1="8" x2="21" y2="8" /><line x1="3" y1="16" x2="21" y2="16" /></>}
        </svg>
      </button>
      {menuOpen && (
        <div style={{background:'#0d1b2e', borderBottom:'1px solid #1e3a5f'}} className="absolute top-full left-0 right-0 py-6 px-8 flex flex-col gap-4 md:hidden">
          {['Leistungen', 'Vorgehen', 'Branchen', 'Über uns'].map((item) => (
            <Link key={item} href={`#${item.toLowerCase().replace(' ', '-')}`} className="text-sm text-[#7a8fa6] hover:text-[#e8e6e0] transition-colors" onClick={() => setMenuOpen(false)}>
              {item}
            </Link>
          ))}
          <Link href="#kontakt" className="font-[family-name:var(--font-syne)] font-semibold text-xs tracking-[0.1em] uppercase px-5 py-3 border border-[#c9a84c] text-[#c9a84c] text-center mt-2" onClick={() => setMenuOpen(false)}>
            Gespräch anfragen
          </Link>
        </div>
      )}
    </nav>
  )
}