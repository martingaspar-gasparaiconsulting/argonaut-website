'use client'

import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="flex justify-between items-center px-20 py-7 border-b border-[#e8e4dc] bg-white sticky top-0 z-50">
      <Link href="/" className="font-[family-name:var(--font-syne)] font-bold text-xl tracking-[0.12em] text-[#1a1a2e]">
        ARG<span className="text-[#c9a84c]">O</span>NAUT
      </Link>
      <ul className="flex gap-12 list-none">
        {['Leistungen', 'Vorgehen', 'Branchen', 'Über uns'].map((item) => (
          <li key={item}>
            <Link href={`#${item.toLowerCase().replace(' ', '-')}`} className="text-sm text-[#6b6b72] tracking-[0.05em] hover:text-[#1a1a2e] transition-colors duration-200 font-light">
              {item}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="#kontakt" className="font-[family-name:var(--font-syne)] font-semibold text-xs tracking-[0.12em] uppercase px-8 py-3.5 border border-[#c9a84c] text-[#c9a84c] hover:bg-[#c9a84c] hover:text-white transition-all duration-200">
        Gespräch anfragen
      </Link>
    </nav>
  )
}