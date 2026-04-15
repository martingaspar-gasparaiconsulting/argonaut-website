'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

const stats = [
  { num: '3×', label: 'Schnellere Prozesse' },
  { num: '-60%', label: 'Manueller Aufwand' },
  { num: '24/7', label: 'Automatisiert & aktiv' },
  { num: 'EU', label: 'DSGVO-konform' },
  { num: '-40%', label: 'Betriebskosten' },
  { num: '100%', label: 'Mittelstand-Fokus' },
]

const outerNodes = [
  { id: 'n1', cx: 280, cy: 80, label: ['DATEN', 'ANALYSE'], delay: 200 },
  { id: 'n2', cx: 480, cy: 120, label: ['KI', 'AGENT'], delay: 400 },
  { id: 'n3', cx: 500, cy: 320, label: ['REPORT', 'ING'], delay: 600 },
  { id: 'n4', cx: 320, cy: 480, label: ['STRATE', 'GIE'], delay: 800 },
  { id: 'n5', cx: 100, cy: 420, label: ['PROZESS', 'AUTO'], delay: 1000 },
  { id: 'n6', cx: 80, cy: 180, label: ['BERATUNG', ''], delay: 1200 },
]

export default function Hero() {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const nodeGroups = svg.querySelectorAll<SVGGElement>('.anim-node')
    const lines = svg.querySelectorAll<SVGLineElement>('.anim-line')
    const rings = svg.querySelectorAll<SVGCircleElement>('.anim-ring')

    nodeGroups.forEach((g) => {
      g.style.opacity = '0'
      g.style.transform = 'scale(0)'
      g.style.transformBox = 'fill-box'
      g.style.transformOrigin = 'center'
    })
    lines.forEach((l) => { l.style.opacity = '0' })
    rings.forEach((r) => { r.style.opacity = '0' })

    nodeGroups.forEach((g) => {
      const delay = parseInt(g.dataset.delay || '0')
      setTimeout(() => {
        g.style.transition = 'opacity 0.4s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)'
        g.style.opacity = '1'
        g.style.transform = 'scale(1)'
      }, delay)
    })

    setTimeout(() => {
      lines.forEach((l) => {
        l.style.transition = 'opacity 0.8s ease'
        l.style.opacity = '1'
      })
      rings.forEach((r) => {
        r.style.transition = 'opacity 1.2s ease'
        r.style.opacity = '1'
      })
    }, 1400)
  }, [])

  return (
    <section className="bg-white">
      <div className="max-w-[1400px] mx-auto px-20">
        <div className="grid grid-cols-2 items-center min-h-[620px] gap-8">

          {/* Left */}
          <div className="py-24 pr-20 border-r border-[#e8e4dc]">
            <div className="flex items-center gap-3 mb-10">
              <span className="inline-block w-10 h-px bg-[#c9a84c]" />
              <span className="text-[#c9a84c] text-xs tracking-[0.25em] uppercase font-[family-name:var(--font-syne)] font-semibold">
                KI-Agentur für den Mittelstand
              </span>
            </div>
            <h1 className="font-[family-name:var(--font-syne)] font-semibold leading-[1.02] tracking-tight text-[#1a1a2e] mb-10" style={{fontSize:'4.8rem'}}>
              KI, die<br />wirklich<br />
              <span className="text-[#c9a84c]">wirkt.</span>
            </h1>
            <p className="text-[#6b6b72] text-xl font-light leading-relaxed mb-14" style={{maxWidth:'420px'}}>
              ARGONAUT automatisiert Prozesse, die heute noch Ihre besten Leute binden — messbar, sicher und auf Ihren Betrieb zugeschnitten.
            </p>
            <div className="flex gap-6 items-center">
              <Link href="#kontakt" className="font-[family-name:var(--font-syne)] font-semibold text-xs tracking-[0.15em] uppercase px-12 py-5 bg-[#c9a84c] text-white hover:bg-[#e0b85a] transition-all duration-200">
                Kostenloses Erstgespräch
              </Link>
              <Link href="#leistungen" className="text-sm text-[#6b6b72] hover:text-[#1a1a2e] transition-colors flex items-center gap-2 font-light">
                Leistungen entdecken <span className="text-[#c9a84c] text-base">→</span>
              </Link>
            </div>
          </div>

          {/* Right — Animated Network */}
          <div className="flex items-center justify-center pl-8 py-12">
            <svg ref={svgRef} width="100%" viewBox="0 0 580 580" xmlns="http://www.w3.org/2000/svg">

              {/* Connector lines */}
              {outerNodes.map((node) => (
                <line
                  key={`line-${node.id}`}
                  className="anim-line"
                  x1="290" y1="290"
                  x2={node.cx} y2={node.cy}
                  stroke="#e8e4dc"
                  strokeWidth="1.5"
                />
              ))}

              {/* Dashed outer ring */}
              <circle className="anim-ring" cx="290" cy="290" r="220" fill="none" stroke="#e8e4dc" strokeWidth="1" strokeDasharray="4 8"/>

              {/* Outer nodes */}
              {outerNodes.map((node) => (
                <g key={node.id} className="anim-node" data-delay={node.delay}>
                  <circle cx={node.cx} cy={node.cy} r="42" fill="#faf9f6" stroke="#e8e4dc" strokeWidth="1.5"/>
                  {node.label.filter(l => l).map((line, i) => (
                    <text
                      key={i}
                      x={node.cx}
                      y={node.cy + (node.label.filter(l=>l).length === 1 ? 4 : i === 0 ? -4 : 12)}
                      fontSize="9"
                      fill="#6b6b72"
                      textAnchor="middle"
                      fontFamily="sans-serif"
                      letterSpacing="0.8"
                      fontWeight="400"
                    >
                      {line}
                    </text>
                  ))}
                </g>
              ))}

              {/* Center node */}
              <g className="anim-node" data-delay="0">
                <circle cx="290" cy="290" r="90" fill="#fff" stroke="#c9a84c" strokeWidth="2"/>
                <circle cx="290" cy="290" r="106" fill="none" stroke="#c9a84c" strokeWidth="0.8" opacity="0.3"/>
                <text x="290" y="282" fontSize="13" fill="#c9a84c" textAnchor="middle" fontFamily="sans-serif" fontWeight="600" letterSpacing="3">ARGO</text>
                <text x="290" y="302" fontSize="13" fill="#c9a84c" textAnchor="middle" fontFamily="sans-serif" fontWeight="600" letterSpacing="3">NAUT</text>
              </g>

            </svg>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="border-t border-[#e8e4dc] bg-[#faf9f6]">
        <div className="max-w-[1400px] mx-auto grid grid-cols-6">
          {stats.map(({ num, label }, i) => (
            <div key={label} className={`px-10 py-8 ${i < 5 ? 'border-r border-[#e8e4dc]' : ''}`}>
              <div className="font-[family-name:var(--font-syne)] font-semibold text-3xl text-[#c9a84c] mb-1">{num}</div>
              <div className="text-[#6b6b72] text-xs tracking-[0.1em] uppercase font-light leading-snug">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}