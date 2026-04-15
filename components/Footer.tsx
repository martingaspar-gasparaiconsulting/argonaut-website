import Link from 'next/link'

export default function Footer() {
  return (
    <footer style={{background:'#0d1b2e', borderTop:'1px solid #1e3a5f'}} className="px-8 md:px-16 py-6 flex flex-col md:flex-row justify-between items-center gap-4">
      <div className="font-[family-name:var(--font-syne)] font-bold text-sm tracking-widest text-[#e8e6e0]">
        ARG<span className="text-[#c9a84c]">O</span>NAUT
      </div>
      <p className="text-xs text-[#7a8fa6] tracking-[0.04em]">
        © 2025 ARGONAUT · Böblingen ·{' '}
        <Link href="/impressum" className="hover:text-[#e8e6e0] transition-colors">Impressum</Link>
        {' · '}
        <Link href="/datenschutz" className="hover:text-[#e8e6e0] transition-colors">Datenschutz</Link>
      </p>
    </footer>
  )
}