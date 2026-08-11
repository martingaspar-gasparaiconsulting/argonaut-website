'use client'

// ============================================================================
// ARGONAUT OS · app/vorschau/_components/BranchenRaster.tsx
// Branchen-Übersicht als Kachel-Raster (Anzahl Kacheln = übergebene Bereiche). Klick auf eine
// Kachel öffnet darunter ein Panel mit den Branchen der Kategorie (Chips →
// Branchenseite). Suchfeld filtert live über alle Branchen. Navy/Gold-Look.
// ============================================================================

import { useMemo, useState, useRef, useEffect } from 'react'
import Link from 'next/link'

const GOLD = '#c9a84c'

type Item = { name: string; slug: string }
type Kat = { kategorie: string; branchen: Item[] }

const EMOJI: Record<string, string> = {
  'Handwerk & Bau': '🔨',
  'Industrie & Produktion': '🏭',
  'Handel & E-Commerce': '🛍️',
  'Handel — Mode, Wohnen & Genuss': '🛍️',
  'Handel — Technik, Bau, Garten & Freizeit': '🔧',
  'Fahrzeuge & Mobilität': '🚗',
  'Auto & KFZ': '🚗',
  'Zweirad, Nutzfahrzeug, Boot & Luft': '🏍️',
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

function emojiFuer(name: string): string {
  if (EMOJI[name]) return EMOJI[name]
  const key = Object.keys(EMOJI).find((k) => name.startsWith(k)) // „Handwerk & Bau I/II"
  return key ? EMOJI[key] : '🔱'
}

const norm = (s: string) => s.toLowerCase()

export default function BranchenRaster({ kategorien, total }: { kategorien: Kat[]; total: number }) {
  const [query, setQuery] = useState('')
  const [offen, setOffen] = useState<string | null>(null)
  const q = norm(query.trim())

  // Beim Aufklappen automatisch zum Branchen-Panel springen (kein Runterscrollen).
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (offen && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [offen])

  // Suche: alle passenden Branchen flach (mit Kategorie-Label).
  const treffer = useMemo(() => {
    if (!q) return []
    const out: Array<Item & { kategorie: string }> = []
    for (const k of kategorien) for (const b of k.branchen) if (norm(b.name).includes(q)) out.push({ ...b, kategorie: k.kategorie })
    return out
  }, [q, kategorien])

  const aktiv = offen ? kategorien.find((k) => k.kategorie === offen) : null

  return (
    <div className="br-wrap">
      <style>{`
        .br-wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
        .br-search { display: flex; align-items: center; gap: 12px; max-width: 560px; margin: 0 auto 30px; background: rgba(122,163,179,0.08); border: 1px solid rgba(201,168,76,0.28); border-radius: 999px; padding: 13px 20px; }
        .br-search input { flex: 1; background: transparent; border: none; outline: none; color: #EAF1F6; font-size: 1rem; font-family: inherit; }
        .br-search input::placeholder { color: #7f97a3; }
        .br-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        @media (max-width: 1080px) { .br-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 760px)  { .br-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 460px)  { .br-grid { grid-template-columns: 1fr; } }
        .br-tile { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; text-align: left; background: linear-gradient(160deg, rgba(18,32,54,0.7), rgba(10,22,40,0.7)); border: 1px solid rgba(122,163,179,0.16); border-radius: 16px; padding: 18px 18px 16px; cursor: pointer; color: #EAF1F6; transition: transform .18s ease, border-color .2s, box-shadow .2s; min-height: 132px; justify-content: space-between; }
        .br-tile:hover { transform: translateY(-3px); border-color: rgba(201,168,76,0.5); box-shadow: 0 14px 30px -20px rgba(0,0,0,0.7); }
        .br-tile.is-active { border-color: ${GOLD}; background: linear-gradient(160deg, rgba(201,168,76,0.14), rgba(10,22,40,0.7)); }
        .br-emoji { font-size: 1.7rem; line-height: 1; }
        .br-name { font-family: var(--font-dm-sans), sans-serif; font-weight: 700; font-size: 1.02rem; line-height: 1.25; }
        .br-count { color: ${GOLD}; font-size: .8rem; font-weight: 600; background: rgba(201,168,76,0.12); border-radius: 999px; padding: 3px 11px; align-self: flex-start; }
        .br-panel { margin-top: 18px; background: rgba(10,22,40,0.7); border: 1px solid rgba(201,168,76,0.34); border-radius: 18px; padding: 22px 24px; scroll-margin-top: 88px; }
        .br-panel-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .br-panel-title { flex: 1; font-family: var(--font-syne), sans-serif; font-weight: 700; font-size: 1.2rem; }
        .br-close { background: none; border: 1px solid rgba(234,241,246,0.22); color: #c4d3db; border-radius: 999px; width: 34px; height: 34px; cursor: pointer; font-size: 1.1rem; }
        .br-chips { display: flex; flex-wrap: wrap; gap: 9px; }
        .br-chip { background: rgba(122,163,179,0.06); border: 1px solid rgba(122,163,179,0.16); border-radius: 999px; padding: 8px 15px; font-size: .88rem; color: #c4d3db; text-decoration: none; transition: border-color .2s, color .2s, background .2s; }
        .br-chip:hover { border-color: rgba(201,168,76,0.55); color: #EAF1F6; background: rgba(201,168,76,0.08); }
        .br-empty { text-align: center; color: #8fa9b6; padding: 40px 0; }
        .br-hint { text-align: center; color: #6f8794; font-size: .85rem; margin-top: 26px; }
      `}</style>

      <div className="br-search">
        <span aria-hidden="true" style={{ color: GOLD }}>⌕</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ihre Branche suchen … (z. B. Bootswerft, Bäckerei, Kanzlei)" aria-label="Branche suchen" />
        {query && <button onClick={() => setQuery('')} aria-label="Suche leeren" style={{ background: 'none', border: 'none', color: '#8fa9b6', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>}
      </div>

      {q ? (
        treffer.length === 0 ? (
          <p className="br-empty">Keine Branche gefunden — fragen Sie uns einfach, ARGONAUT passt sich an.</p>
        ) : (
          <div className="br-chips" style={{ maxWidth: 900, margin: '0 auto' }}>
            {treffer.map((b) => (
              <Link key={b.slug} href={`/vorschau/branchen/${b.slug}`} className="br-chip">{b.name}</Link>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="br-grid">
            {kategorien.map((k) => (
              <button key={k.kategorie} className={`br-tile${offen === k.kategorie ? ' is-active' : ''}`} onClick={() => setOffen(offen === k.kategorie ? null : k.kategorie)} aria-expanded={offen === k.kategorie}>
                <span className="br-emoji" aria-hidden="true">{emojiFuer(k.kategorie)}</span>
                <span className="br-name">{k.kategorie}</span>
                <span className="br-count">{k.branchen.length} Branchen</span>
              </button>
            ))}
          </div>

          {aktiv && (
            <div className="br-panel" ref={panelRef}>
              <div className="br-panel-head">
                <span className="br-emoji" aria-hidden="true">{emojiFuer(aktiv.kategorie)}</span>
                <span className="br-panel-title">{aktiv.kategorie}</span>
                <button className="br-close" onClick={() => setOffen(null)} aria-label="Schließen">×</button>
              </div>
              <div className="br-chips">
                {aktiv.branchen.map((b) => (
                  <Link key={b.slug} href={`/vorschau/branchen/${b.slug}`} className="br-chip">{b.name}</Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <p className="br-hint">{total} Branchen · {kategorien.length} Bereiche</p>
    </div>
  )
}
