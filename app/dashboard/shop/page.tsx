'use client';

// ============================================================
// ARGONAUT OS · Bündel 17 · Shop-/Marktplatz-Anbindung (Dashboard)
// Bestellungen sammeln: im Manuell-Modus per CSV-Import oder Handeingabe,
// mit echtem Anbieter (Shopware/Shopify/Woo) später per API (Konnektor).
// Status-Board (neu -> in Bearbeitung -> versendet).
// Pfad: app/dashboard/shop/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { anbieterVon, type IntegrationTyp } from '@/lib/konnektoren';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Position = { bezeichnung: string; menge: number; einzelpreis: number };
type Bestellung = {
  id: string; quelle: string; extern_id: string | null; besteller: string | null; email: string | null;
  status: string; brutto_summe: number; positionen: Position[]; bestell_am: string | null; erstellt_am: string;
};

const STATUS: { key: string; label: string; farbe: string }[] = [
  { key: 'neu', label: 'Neu', farbe: C.cyan },
  { key: 'in_bearbeitung', label: 'In Bearbeitung', farbe: C.warn },
  { key: 'versendet', label: 'Versendet', farbe: C.green },
  { key: 'storniert', label: 'Storniert', farbe: C.danger },
];
function statusInfo(k: string) { return STATUS.find((s) => s.key === k) || STATUS[0]; }
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }

// CSV: Kopfzeile optional. Spalten: extern_id ; besteller ; email ; bezeichnung ; menge ; einzelpreis
// Mehrere Zeilen mit gleicher extern_id werden zu EINER Bestellung zusammengefasst.
function parseCsv(text: string): { extern_id: string; besteller: string; email: string; positionen: Position[]; brutto: number }[] {
  const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  if (!zeilen.length) return [];
  const trenner = zeilen[0].includes(';') ? ';' : ',';
  const map: Record<string, { extern_id: string; besteller: string; email: string; positionen: Position[]; brutto: number }> = {};
  let start = 0;
  const erste = zeilen[0].toLowerCase();
  if (erste.includes('bezeichnung') || erste.includes('besteller') || erste.includes('extern')) start = 1;
  for (let i = start; i < zeilen.length; i++) {
    const t = zeilen[i].split(trenner).map((x) => x.trim().replace(/^"|"$/g, ''));
    const [extern_id = '', besteller = '', email = '', bezeichnung = '', menge = '1', einzelpreis = '0'] = t;
    const key = extern_id || `zeile-${i}`;
    const pos: Position = { bezeichnung: bezeichnung || 'Position', menge: num(menge) || 1, einzelpreis: num(einzelpreis) };
    if (!map[key]) map[key] = { extern_id: extern_id || '', besteller, email, positionen: [], brutto: 0 };
    map[key].positionen.push(pos);
    map[key].brutto += pos.menge * pos.einzelpreis;
    if (besteller && !map[key].besteller) map[key].besteller = besteller;
    if (email && !map[key].email) map[key].email = email;
  }
  return Object.values(map);
}

export default function ShopPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [liste, setListe] = useState<Bestellung[]>([]);
  const [modus, setModus] = useState<'live' | 'demo'>('demo');
  const [anbieter, setAnbieter] = useState('manuell');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);

  const laden_ = useCallback(async () => {
    const { data } = await supabase.from('shop_bestellungen')
      .select('id, quelle, extern_id, besteller, email, status, brutto_summe, positionen, bestell_am, erstellt_am')
      .order('erstellt_am', { ascending: false });
    setListe((data as Bestellung[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const { data: intg } = await supabase.from('betrieb_integrationen').select('anbieter, aktiv').eq('typ', 'shop').maybeSingle();
      if (intg) {
        setAnbieter((intg as { anbieter: string }).anbieter);
        const a = anbieterVon('shop' as IntegrationTyp, (intg as { anbieter: string }).anbieter);
        setModus((intg as { aktiv: boolean }).aktiv && a && !a.demo ? 'live' : 'demo');
      }
      await laden_();
      setLaden(false);
    })();
  }, [laden_]);

  async function importieren() {
    if (!uid) return;
    const orders = parseCsv(csv);
    if (!orders.length) { setFehler('Keine Zeilen erkannt. Format: extern_id;besteller;email;bezeichnung;menge;einzelpreis'); return; }
    setBusy(true); setFehler(null); setOk(null);
    let neu = 0, uebersprungen = 0;
    try {
      for (const o of orders) {
        const row = {
          owner_user_id: uid, quelle: 'manuell', extern_id: o.extern_id || null,
          besteller: o.besteller || null, email: o.email || null, status: 'neu',
          brutto_summe: Math.round(o.brutto * 100) / 100, positionen: o.positionen,
          bestell_am: new Date().toISOString(),
        };
        const { error } = await supabase.from('shop_bestellungen').insert(row);
        if (error) uebersprungen++; else neu++;
      }
      setOk(`${neu} Bestellung(en) importiert${uebersprungen ? `, ${uebersprungen} übersprungen (bereits vorhanden)` : ''}.`);
      setCsv('');
      await laden_();
    } finally { setBusy(false); }
  }

  async function statusSetzen(b: Bestellung, status: string) {
    setBusy(true);
    try {
      const { error } = await supabase.from('shop_bestellungen').update({ status, aktualisiert_am: new Date().toISOString() }).eq('id', b.id);
      if (error) { setFehler('Änderung fehlgeschlagen.'); return; }
      setListe((l) => l.map((x) => (x.id === b.id ? { ...x, status } : x)));
    } finally { setBusy(false); }
  }

  const proStatus = (k: string) => liste.filter((b) => b.status === k).length;

  return (
    <div style={styles.page}>
      <div style={styles.head}>
        <div>
          <h1 style={styles.h1}>🛒 Shop / Marktplatz</h1>
          <p style={styles.sub}>
            Bestellungen aus Ihrem Online-Shop an einem Ort. Im <strong>Manuell-Modus</strong> per CSV importieren;
            mit hinterlegtem Anbieter (unter „🔌 Schnittstellen") später automatisch per Schnittstelle.
          </p>
        </div>
        <span style={{ ...styles.badge, color: modus === 'live' ? C.green : C.warn, borderColor: modus === 'live' ? C.green : C.warn }}>
          {modus === 'live' ? `● Live · ${anbieter}` : '○ Manuell-Modus'}
        </span>
      </div>

      {/* CSV-Import */}
      <div style={styles.card}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Bestellungen importieren (CSV)</div>
        <div style={styles.hinweis}>
          Eine Zeile je Position. Spalten: <code>extern_id ; besteller ; email ; bezeichnung ; menge ; einzelpreis</code>.
          Zeilen mit gleicher <code>extern_id</code> werden zu einer Bestellung zusammengefasst. Kopfzeile optional.
        </div>
        <textarea style={styles.textarea} value={csv} onChange={(e) => setCsv(e.target.value)}
          placeholder={'1001;Max Muster;max@mail.de;Winterreifen 205/55;4;89,90\n1001;Max Muster;max@mail.de;Montage;1;40,00\n1002;Erika Beispiel;erika@mail.de;Ölwechsel;1;79,00'} />
        {ok && <div style={styles.ok}>{ok}</div>}
        {fehler && <div style={styles.err}>{fehler}</div>}
        <button style={{ ...styles.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={importieren}>
          {busy ? 'Importiert …' : '⬆ Importieren'}
        </button>
      </div>

      {/* Status-Übersicht */}
      <div style={styles.statusRow}>
        {STATUS.map((s) => (
          <div key={s.key} style={styles.statusKarte}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.farbe }}>{proStatus(s.key)}</div>
            <div style={{ fontSize: 12, color: C.textDim }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Liste */}
      {laden ? (
        <p style={styles.sub}>Lädt …</p>
      ) : liste.length === 0 ? (
        <p style={styles.sub}>Noch keine Bestellungen. Oben eine CSV importieren.</p>
      ) : (
        <div style={styles.liste}>
          {liste.map((b) => {
            const si = statusInfo(b.status);
            return (
              <div key={b.id} style={styles.item}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>
                    {b.extern_id ? `#${b.extern_id} · ` : ''}{b.besteller || 'Kunde'} <span style={{ color: C.textDim, fontWeight: 400 }}>· {b.quelle}</span>
                  </div>
                  <div style={{ color: C.textDim, fontSize: 13 }}>
                    {(b.positionen || []).map((p) => `${p.menge}× ${p.bezeichnung}`).join(', ') || '—'}
                  </div>
                </div>
                <div style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{eur(b.brutto_summe)}</div>
                <select style={styles.statusSelect} value={b.status} onChange={(e) => statusSetzen(b, e.target.value)}>
                  {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <span style={{ ...styles.punkt, background: si.farbe }} title={si.label} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 960, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  head: { display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 680 },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 },
  hinweis: { background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5 },
  textarea: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', fontSize: 14, fontFamily: 'monospace', minHeight: 120, resize: 'vertical' },
  primaer: { alignSelf: 'flex-start', background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  statusRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, margin: '18px 0' },
  statusKarte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px', textAlign: 'center' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  statusSelect: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' },
  punkt: { width: 12, height: 12, borderRadius: 999, display: 'inline-block' },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
};
