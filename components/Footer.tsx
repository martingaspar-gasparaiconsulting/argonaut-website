import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-white border-t border-[#e8e4dc] px-20 py-8 flex justify-between items-center">
      <div className="font-[family-name:var(--font-syne)] font-bold text-sm tracking-widest text-[#1a1a2e]">
        ARG<span className="text-[#c9a84c]">O</span>NAUT
      </div>
      <p className="text-xs text-[#6b6b72] tracking-[0.04em]">
        © 2025 ARGONAUT · Böblingen ·{' '}
        <Link href="/impressum" className="hover:text-[#1a1a2e] transition-colors">Impressum</Link>
        {' · '}
        <Link href="/datenschutz" className="hover:text-[#1a1a2e] transition-colors">Datenschutz</Link>
      </p>
      <div className="flex gap-6">
        <a href="mailto:martin.gaspar@argonaut.de" className="text-xs text-[#6b6b72] hover:text-[#c9a84c] transition-colors tracking-[0.04em]">
          E-Mail
        </a>
        <a href="https://linkedin.com" className="text-xs text-[#6b6b72] hover:text-[#c9a84c] transition-colors tracking-[0.04em]">
          LinkedIn
        </a>
      </div>
    </footer>
  )
}