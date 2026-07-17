'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/BranchenAccordion.tsx
// Aufklappbare Branchen-Übersicht: 19 Kategorien als Karten, Klick klappt auf.
// Chips erscheinen gestaffelt (Reihe-für-Reihe + Chip-für-Chip = Fächer-Effekt).
// Suchfeld oben filtert live über alle Branchen. prefers-reduced-motion beachtet.
// ============================================================================

import { useMemo, useState } from 'react'
import Link from 'next/link'

const GOLD = '#c9a84c'

type Item = { name: string; slug: string }
type Kat = { kategorie: string; branchen: Item[] }

const EMOJI: Record<string, string> = {
  'Handwerk & Bau': '🔨',
  'Industrie & Produktion': '🏭',
  'Handel & E-Commerce': '🛍️',
  'Fahrzeuge & Mobilität': '🚗',
  'Gastronomie, Hotellerie & Tourismus': '🍽️',
  'Lebensmittel & Nahversorgung': '🥖',
  'Logistik & Transport': '🚚',
  'IT & Technologie': '💻',
  'Energie & Umwelt': '⚡',
  'Immobilien & Verwaltung': '🏢',
  'Marketing, Medien & Kreativ': '🎯',
  'Recht, Steuern & Finanzen': '⚖️',
  'Bildung & Wissenschaft': '🎓',
  'Gesundheit & Wellness': '💚',
  'Sport, Beauty & Lifestyle': '💇',
  'Tiere': '🐾',
  'Landwirtschaft, Garten & Forst': '🌱',
  'Dienstleistungen': '🧰',
  'Kultur, Soziales & Öffentliches': '🏛️',
}

function norm(s: string) {
  return s.toLowerCase()
}

export default function BranchenAccordion({ kategorien, total }: { kategorien: Kat[]; total: number }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ [kategorien[0]?.kategorie ?? '']: true }))

  const q = norm(query.trim())

  // Bei aktiver Suche: nur passende Chips, Kategorien mit Treffern automatisch offen.
  const view = useMemo(() => {
    if (!q) return kategorien.map((k) => ({ ...k, matches: k.branchen }))
    return kategorien
      .map((k) => ({ ...k, matches: k.branchen.filter((b) => norm(b.name).includes(q)) }))
      .filter((k) => k.matches.length > 0)
  }, [q, kategorien])

  const toggle = (kat: string) => setOpen((o) => ({ ...o, [kat]: !o[kat] }))

  return (
    <div className="ba-wrap">
      <style>{`
        .ba-wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px; }
        .ba-search { display: flex; align-items: center; gap: 12px; max-width: 520px; margin: 0 auto 34px; background: rgba(122,163,179,0.08); border: 1px solid rgba(201,168,76,0.28); border-radius: 999px; padding: 13px 20px; }
        .ba-search input { flex: 1; background: transparent; border: none; outline: none; color: #EAF1F6; font-size: 1rem; font-family: inherit; }
        .ba-search input::placeholder { color: #7f97a3; }
        .ba-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 780px) { .ba-grid { grid-template-columns: 1fr; } }
        .ba-card { background: linear-gradient(160deg, rgba(18,32,54,0.6), rgba(10,22,40,0.6)); border: 1px solid rgba(122,163,179,0.16); border-radius: 16px; overflow: hidden; transition: border-color .25s; }
        .ba-card.is-open { border-color: rgba(201,168,76,0.42); }
        .ba-head { width: 100%; display: flex; align-items: center; gap: 14px; padding: 20px 22px; background: none; border: none; cursor: pointer; text-align: left; color: #EAF1F6; }
        .ba-emoji { font-size: 1.35rem; line-height: 1; filter: saturate(0.85); }
        .ba-title { flex: 1; font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: 1.06rem; }
        .ba-count { color: ${GOLD}; font-size: .82rem; font-weight: 600; background: rgba(201,168,76,0.1); border-radius: 999px; padding: 3px 11px; }
        .ba-chev { color: #8fa9b6; transition: transform .3s ease; font-size: .9rem; }
        .ba-card.is-open .ba-chev { transform: rotate(180deg); color: ${GOLD}; }
        .ba-body { padding: 0 22px 22px; display: flex; flex-wrap: wrap; gap: 9px; }
        .ba-chip { background: rgba(122,163,179,0.06); border: 1px solid rgba(122,163,179,0.16); border-radius: 999px; padding: 8px 15px; font-size: .88rem; color: #c4d3db; text-decoration: none; transition: border-color .2s, color .2s, background .2s; opacity: 0; animation: baChipIn .34s cubic-bezier(.2,.7,.3,1) both; }
        .ba-chip:hover { border-color: rgba(201,168,76,0.55); color: #EAF1F6; background: rgba(201,168,76,0.08); }
        @keyframes baChipIn { from { opacity: 0; transform: translateY(9px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .ba-empty { text-align: center; color: #8fa9b6; padding: 40px 0; }
        @media (prefers-reduced-motion: reduce) {
          .ba-chip { animation: none; opacity: 1; }
          .ba-chev { transition: none; }
        }
      `}</style>

      <div className="ba-search">
        <span aria-hidden="true" style={{ color: GOLD }}>⌕</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ihre Branche suchen … (z. B. Bootswerft, Bäckerei, Kanzlei)"
          aria-label="Branche suchen"
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Suche leeren" style={{ background: 'none', border: 'none', color: '#8fa9b6', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
        )}
      </div>

      {view.length === 0 && (
        <p className="ba-empty">Keine Branche gefunden — fragen Sie uns einfach, ARGONAUT passt sich an.</p>
      )}

      <div className="ba-grid">
        {view.map((k) => {
          const isOpen = q ? true : !!open[k.kategorie]
          const items = k.matches
          return (
            <div key={k.kategorie} className={`ba-card${isOpen ? ' is-open' : ''}`}>
              <button className="ba-head" onClick={() => !q && toggle(k.kategorie)} aria-expanded={isOpen}>
                <span className="ba-emoji" aria-hidden="true">{EMOJI[k.kategorie] ?? '🔱'}</span>
                <span className="ba-title">{k.kategorie}</span>
                <span className="ba-count">{items.length}</span>
                {!q && <span className="ba-chev" aria-hidden="true">▾</span>}
              </button>
              {isOpen && (
                <div className="ba-body">
                  {items.map((b, i) => (
                    <Link
                      key={b.slug}
                      href={`/vorschau/branchen/${b.slug}`}
                      className="ba-chip"
                      style={{ animationDelay: `${Math.min(i * 28, 560)}ms` }}
                    >
                      {b.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p style={{ textAlign: 'center', color: '#6f8794', fontSize: '.85rem', marginTop: '30px' }}>
        {total} Branchen · 19 Bereiche
      </p>
    </div>
  )
}
