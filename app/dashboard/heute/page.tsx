'use client';

// ============================================================
// ARGONAUT OS · Welle 2 · „Heute"-Zentrale
// EIN Ort, der alle Ampeln quer über die Module bündelt: überfällige/fällige
// Rechnungen, Wartungen, HU/AU, Kanzlei-Fristen, Förder-Fristen, MHD, Tier-
// Wiedervorlagen, ablaufende Angebote. Sortiert nach Dringlichkeit.
// Robust: fehlt bei einem Modul das SQL, wird die Quelle still übersprungen.
// Pfad: app/dashboard/heute/page.tsx
// ============================================================

import { useState, useEffect, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Item = { icon: string; titel: string; datum: string; href: string; tage: number };

function heute() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function inTagen(iso: string) { return Math.ceil((new Date(iso + 'T00:00:00').getTime() - heute().getTime()) / 86400000); }
function d(iso: string) { const p = (iso || '').split('T')[0].split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

type Quelle = {
  icon: string; table: string; select: string; dateField: string; href: string;
  offen: (r: Record<string, unknown>) => boolean;
  titel: (r: Record<string, unknown>) => string;
};

const QUELLEN: Quelle[] = [
  { icon: '🧾', table: 'rechnungen', select: 'rechnungsnummer, titel, faelligkeitsdatum, zahlungsstatus, bezahlt_am', dateField: 'faelligkeitsdatum', href: '/dashboard/rechnungen',
    offen: (r) => !r.bezahlt_am && r.zahlungsstatus !== 'bezahlt' && r.zahlungsstatus !== 'storniert',
    titel: (r) => `Rechnung ${r.rechnungsnummer || ''} fällig` },
  { icon: '🗒', table: 'angebote', select: 'angebotsnummer, titel, gueltig_bis, status', dateField: 'gueltig_bis', href: '/dashboard/angebote',
    offen: (r) => r.status === 'entwurf' || r.status === 'gesendet',
    titel: (r) => `Angebot ${r.angebotsnummer || ''} läuft ab: ${r.titel || ''}` },
  { icon: '🛡', table: 'it_vertraege', select: 'bezeichnung, kunde_name, naechste_wartung, status', dateField: 'naechste_wartung', href: '/dashboard/it-msp',
    offen: (r) => r.status !== 'beendet',
    titel: (r) => `Wartung: ${r.bezeichnung || ''} (${r.kunde_name || '—'})` },
  { icon: '⚡', table: 'energie_anlagen', select: 'bezeichnung, wartung_faellig', dateField: 'wartung_faellig', href: '/dashboard/energie',
    offen: () => true, titel: (r) => `Anlagen-Wartung: ${r.bezeichnung || ''}` },
  { icon: '🚗', table: 'kfz_fahrzeuge', select: 'kennzeichen, marke, hu_faellig', dateField: 'hu_faellig', href: '/dashboard/kfz',
    offen: () => true, titel: (r) => `HU fällig: ${r.kennzeichen || ''} ${r.marke || ''}`.trim() },
  { icon: '⚖️', table: 'kanzlei_fristen', select: 'bezeichnung, frist, erledigt', dateField: 'frist', href: '/dashboard/kanzlei',
    offen: (r) => !r.erledigt, titel: (r) => `Frist: ${r.bezeichnung || ''}` },
  { icon: '💰', table: 'foerder_vorhaben', select: 'programm_name, frist', dateField: 'frist', href: '/dashboard/foerdermittel',
    offen: () => true, titel: (r) => `Förder-Frist: ${r.programm_name || ''}` },
  { icon: '🐾', table: 'tier_behandlungen', select: 'bezeichnung, naechste_faellig', dateField: 'naechste_faellig', href: '/dashboard/tier',
    offen: () => true, titel: (r) => `Tier-Wiedervorlage: ${r.bezeichnung || ''}` },
  { icon: '🥫', table: 'lm_chargen', select: 'bezeichnung, charge_nr, mhd', dateField: 'mhd', href: '/dashboard/lebensmittel',
    offen: () => true, titel: (r) => `MHD: ${r.bezeichnung || ''} ${r.charge_nr ? '(' + r.charge_nr + ')' : ''}`.trim() },
];

export default function HeutePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const grenze = new Date(); grenze.setDate(grenze.getDate() + 30);
      const grenzeIso = grenze.toISOString().slice(0, 10);
      const alle: Item[] = [];

      await Promise.all(QUELLEN.map(async (q) => {
        try {
          const { data: rows, error } = await supabase
            .from(q.table).select(q.select).lte(q.dateField, grenzeIso).order(q.dateField, { ascending: true }).limit(80);
          if (error || !rows) return; // Tabelle fehlt / kein Zugriff -> still überspringen
          for (const r of rows as unknown as Record<string, unknown>[]) {
            const iso = r[q.dateField] as string | null;
            if (!iso || !q.offen(r)) continue;
            const datumIso = String(iso).slice(0, 10);
            alle.push({ icon: q.icon, titel: q.titel(r), datum: datumIso, href: q.href, tage: inTagen(datumIso) });
          }
        } catch { /* Quelle überspringen */ }
      }));

      alle.sort((a, b) => a.tage - b.tage);
      setItems(alle);
      setLaden(false);
    })();
  }, []);

  const ueberfaellig = items.filter((i) => i.tage < 0);
  const dieseWoche = items.filter((i) => i.tage >= 0 && i.tage <= 7);
  const spaeter = items.filter((i) => i.tage > 7);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>📌 Heute — was ist zu tun?</h1>
      <p style={styles.sub}>Alle Fristen und Fälligkeiten aus allen Modulen an einem Ort, nach Dringlichkeit sortiert.</p>
      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.kpis}>
        <div style={{ ...styles.kpi, borderColor: ueberfaellig.length ? C.danger : C.border }}>
          <div style={{ ...styles.kWert, color: C.danger }}>{ueberfaellig.length}</div><div style={styles.kLabel}>überfällig</div>
        </div>
        <div style={{ ...styles.kpi, borderColor: dieseWoche.length ? C.warn : C.border }}>
          <div style={{ ...styles.kWert, color: C.warn }}>{dieseWoche.length}</div><div style={styles.kLabel}>diese Woche</div>
        </div>
        <div style={styles.kpi}>
          <div style={{ ...styles.kWert, color: C.green }}>{spaeter.length}</div><div style={styles.kLabel}>in Sicht</div>
        </div>
      </div>

      {laden ? <p style={styles.dim}>Sammle alle Ampeln …</p> : items.length === 0 ? (
        <div style={styles.leer}>✅ Nichts Dringendes. Alles im grünen Bereich.</div>
      ) : (
        <>
          {ueberfaellig.length > 0 && <Block titel="🔴 Überfällig" farbe={C.danger} items={ueberfaellig} />}
          {dieseWoche.length > 0 && <Block titel="🟡 Diese Woche" farbe={C.warn} items={dieseWoche} />}
          {spaeter.length > 0 && <Block titel="🟢 In den nächsten 30 Tagen" farbe={C.green} items={spaeter} />}
        </>
      )}
    </div>
  );
}

function Block({ titel, farbe, items }: { titel: string; farbe: string; items: Item[] }) {
  return (
    <div style={styles.block}>
      <div style={{ ...styles.blockTitel, color: farbe }}>{titel} <span style={{ color: C.textDim, fontWeight: 400 }}>({items.length})</span></div>
      <div style={styles.liste}>
        {items.map((i, k) => (
          <a key={k} href={i.href} style={styles.item}>
            <span style={{ fontSize: 18 }}>{i.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{i.titel}</span>
            <span style={{ ...styles.tage, color: farbe, borderColor: farbe }}>
              {i.tage < 0 ? `${-i.tage} T über` : i.tage === 0 ? 'heute' : `in ${i.tage} T`}
            </span>
            <span style={{ color: C.textDim, fontSize: 13, minWidth: 82, textAlign: 'right' }}>{d(i.datum)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '16px 0' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px', textAlign: 'center' },
  kWert: { fontSize: 30, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 12.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  block: { marginTop: 18 },
  blockTitel: { fontWeight: 800, fontSize: 16, marginBottom: 10 },
  liste: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', textDecoration: 'none', color: C.text, fontSize: 14.5, flexWrap: 'wrap' },
  tage: { border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  leer: { color: C.green, background: 'rgba(76,175,125,0.08)', border: `1px solid ${C.green}`, borderRadius: 14, padding: 26, textAlign: 'center', fontSize: 16, marginTop: 12 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
