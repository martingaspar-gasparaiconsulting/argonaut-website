'use client';

// ============================================================
// ARGONAUT OS · Globale Suche — ein Feld, alle Module.
// Sucht parallel über Kunden, Rechnungen, Angebote, Aufträge, Projekte, Leads.
// Jede Quelle defensiv (fehlt die Tabelle oder greift RLS, wird sie still
// übersprungen) und RLS-scoped — jeder sieht nur, was er darf.
// Kein neues SQL — liest die vorhandenen Tabellen.
// Pfad: app/dashboard/suche/page.tsx
// ============================================================

import { useState, useEffect, useRef, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666',
};

type Row = Record<string, unknown>;
type Treffer = { id: string; titel: string; unter: string };
type Gruppe = { key: string; icon: string; label: string; href: string; treffer: Treffer[] };

function s(v: unknown): string { return v == null ? '' : String(v); }
function join(parts: unknown[], sep = ' · '): string { return parts.map(s).filter(Boolean).join(sep); }

type Quelle = {
  key: string; icon: string; label: string; table: string; href: string;
  cols: string; suchspalten: string[];
  titel: (r: Row) => string; unter: (r: Row) => string;
};

const QUELLEN: Quelle[] = [
  {
    key: 'kunden', icon: '🧭', label: 'Kunden', table: 'kontakte', href: '/dashboard/kunde-akte',
    cols: 'id, anzeigename, vorname, nachname, firma_name, email, telefon',
    suchspalten: ['anzeigename', 'firma_name', 'email', 'nachname', 'vorname'],
    titel: (r) => s(r.anzeigename) || join([r.vorname, r.nachname], ' ') || s(r.firma_name) || s(r.email) || '(ohne Namen)',
    unter: (r) => join([r.firma_name, r.email, r.telefon]),
  },
  {
    key: 'rechnungen', icon: '🧾', label: 'Rechnungen', table: 'rechnungen', href: '/dashboard/rechnungen',
    cols: 'id, rechnungsnummer, titel, brutto_summe, zahlungsstatus',
    suchspalten: ['rechnungsnummer', 'titel'],
    titel: (r) => `Rechnung ${s(r.rechnungsnummer)}`.trim(),
    unter: (r) => join([r.titel, r.zahlungsstatus]),
  },
  {
    key: 'angebote', icon: '🗒', label: 'Angebote', table: 'angebote', href: '/dashboard/angebote',
    cols: 'id, angebotsnummer, titel, status',
    suchspalten: ['angebotsnummer', 'titel'],
    titel: (r) => `Angebot ${s(r.angebotsnummer)}`.trim(),
    unter: (r) => join([r.titel, r.status]),
  },
  {
    key: 'auftraege', icon: '📋', label: 'Aufträge', table: 'auftraege', href: '/dashboard/auftraege',
    cols: 'id, auftragsnummer, titel, status',
    suchspalten: ['auftragsnummer', 'titel'],
    titel: (r) => `Auftrag ${s(r.auftragsnummer)}`.trim(),
    unter: (r) => join([r.titel, r.status]),
  },
  {
    key: 'projekte', icon: '📁', label: 'Projekte', table: 'projekte', href: '/dashboard/projekte',
    cols: 'id, name',
    suchspalten: ['name'],
    titel: (r) => s(r.name) || 'Projekt',
    unter: () => '',
  },
  {
    key: 'leads', icon: '🎯', label: 'Leads', table: 'leads', href: '/dashboard/leads',
    cols: 'id, name, email, telefon, dienstleistung, status',
    suchspalten: ['name', 'email', 'telefon', 'dienstleistung'],
    titel: (r) => s(r.name) || s(r.email) || 'Lead',
    unter: (r) => join([r.dienstleistung, r.email, r.status]),
  },
];

/** Baut den PostgREST-.or()-Filter; entschärft Zeichen, die die Filtersyntax brechen. */
function orFilter(q: string, cols: string[]): string {
  const clean = q.replace(/[,%()*\\]/g, ' ').trim();
  return cols.map((c) => `${c}.ilike.%${clean}%`).join(',');
}

export default function SuchePage() {
  const [q, setQ] = useState('');
  const [gruppen, setGruppen] = useState<Gruppe[]>([]);
  const [laden, setLaden] = useState(false);
  const [gesucht, setGesucht] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lauf = useRef(0);

  const suchen = useCallback(async (text: string) => {
    const clean = text.replace(/[,%()*\\]/g, ' ').trim();
    if (clean.length < 2) { setGruppen([]); setGesucht(false); setLaden(false); return; }
    const meinLauf = ++lauf.current;
    setLaden(true);
    const ergebnisse = await Promise.all(
      QUELLEN.map(async (quelle) => {
        try {
          const { data, error } = await supabase
            .from(quelle.table)
            .select(quelle.cols)
            .or(orFilter(text, quelle.suchspalten))
            .limit(8);
          if (error || !data) return { quelle, treffer: [] as Treffer[] };
          const treffer = (data as unknown as Row[]).map((r) => ({ id: s(r.id), titel: quelle.titel(r), unter: quelle.unter(r) }));
          return { quelle, treffer };
        } catch {
          return { quelle, treffer: [] as Treffer[] };
        }
      }),
    );
    if (meinLauf !== lauf.current) return; // veraltetes Ergebnis verwerfen
    setGruppen(
      ergebnisse
        .filter((e) => e.treffer.length > 0)
        .map((e) => ({ key: e.quelle.key, icon: e.quelle.icon, label: e.quelle.label, href: e.quelle.href, treffer: e.treffer })),
    );
    setGesucht(true);
    setLaden(false);
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void suchen(q); }, 280);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, suchen]);

  const gesamt = gruppen.reduce((n, g) => n + g.treffer.length, 0);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Verzahnung</div>
      <h1 style={styles.h1}>🔎 Globale Suche</h1>
      <p style={styles.sub}>Ein Feld über alles: Kunden, Rechnungen, Angebote, Aufträge, Projekte und Leads. Sie sehen nur, was Sie sehen dürfen.</p>

      <input
        style={styles.input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name, Nummer, Stichwort …"
        autoFocus
        autoComplete="off"
      />

      {laden && <div style={styles.hint}>Sucht …</div>}

      {!laden && gesucht && gesamt === 0 && (
        <div style={styles.hint}>Nichts gefunden zu „{q.trim()}". Andere Schreibweise oder Nummer versuchen.</div>
      )}

      {!laden && gesamt > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 20 }}>
          {gruppen.map((g) => (
            <div key={g.key}>
              <div style={styles.katKopf}>{g.icon} {g.label} <span style={styles.count}>{g.treffer.length}</span></div>
              <div style={styles.liste}>
                {g.treffer.map((t) => (
                  <a key={t.id} href={g.href} style={styles.zeile}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{t.titel}</div>
                    {t.unter && <div style={{ color: C.textDim, fontSize: 13, marginTop: 2 }}>{t.unter}</div>}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!gesucht && !laden && q.trim().length < 2 && (
        <div style={styles.hint}>Mindestens zwei Zeichen eingeben.</div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 900, margin: '0 auto' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(26px, 2.4vw, 38px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '8px 0 18px', fontSize: 15, lineHeight: 1.5, maxWidth: 720 },
  input: { width: '100%', background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', fontSize: 17, fontFamily: 'inherit', outline: 'none' },
  hint: { color: C.textDim, fontSize: 15, padding: '16px 2px' },
  katKopf: { color: C.gold, fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 },
  count: { background: 'rgba(201,168,76,0.14)', color: C.gold, borderRadius: 999, padding: '1px 9px', fontSize: 12, fontWeight: 700 },
  liste: { display: 'flex', flexDirection: 'column', gap: 8 },
  zeile: { display: 'block', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', textDecoration: 'none', color: C.text },
};
