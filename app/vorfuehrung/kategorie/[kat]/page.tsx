// ============================================================================
// ARGONAUT OS · app/vorfuehrung/kategorie/[kat]/page.tsx
//
// Alle Branchen einer Kategorie zum Blättern — für Besucher, die auf einem
// fremden Bildschirm nichts eintippen wollen. Bewusst nur Namen in großen
// Flächen: auf einem Touchscreen zählt die Trefferfläche, nicht die Gestaltung.
// ============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { alleBranchenKurz, kategorienKurz } from '@/lib/vorfuehrung';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff',
  text: '#E8EDF4', dim: '#8FA3BE', rand: 'rgba(143,163,190,0.18)',
};

export function generateStaticParams() {
  return kategorienKurz().map((k) => ({ kat: encodeURIComponent(k.kategorie) }));
}

export default async function KategorieSeite({ params }: { params: Promise<{ kat: string }> }) {
  const { kat } = await params;
  const name = decodeURIComponent(kat);
  const liste = alleBranchenKurz().filter((b) => b.kategorie === name);
  if (liste.length === 0) notFound();

  return (
    <div style={s.seite}>
      <div style={s.kopf}>
        <Link href="/vorfuehrung" style={s.zurueck}>‹ Zurück zur Suche</Link>
        <h1 style={s.h1}>{name}</h1>
        <p style={s.unter}>{liste.length} Branchen. Tippen Sie auf Ihre.</p>
      </div>
      <div style={s.gitter}>
        {liste.map((b) => (
          <Link key={b.slug} href={`/vorfuehrung/${b.slug}`} style={s.eintrag}>
            <span>{b.name}</span>
            <span style={s.pfeil}>›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  seite: { minHeight: '100vh', background: `radial-gradient(1200px 600px at 50% -10%, #14243c 0%, ${C.navy} 60%)`, color: C.text, padding: '38px 30px 60px', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  kopf: { maxWidth: 1400, margin: '0 auto 26px' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 16, fontWeight: 700, border: `1px solid ${C.rand}`, borderRadius: 10, padding: '10px 16px', display: 'inline-block' },
  h1: { fontSize: 42, fontWeight: 800, margin: '20px 0 0', lineHeight: 1.1 },
  unter: { color: C.dim, fontSize: 19, margin: '8px 0 0' },
  gitter: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12, maxWidth: 1400, margin: '0 auto' },
  eintrag: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 14, padding: '20px 22px', textDecoration: 'none', color: C.text, fontSize: 19, fontWeight: 600, lineHeight: 1.3 },
  pfeil: { color: C.cyan, fontSize: 26, fontWeight: 800 },
};
