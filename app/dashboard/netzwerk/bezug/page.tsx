'use client';

// ============================================================
// ARGONAUT OS · Paket 303 · N1 — Partner-Aufträge an einem Projekt, Auftrag oder Objekt
// /dashboard/netzwerk/bezug?typ=projekt|auftrag|objekt&id=<uuid>
// Ohne Angabe: Auswahl (Art + Suche) aus den eigenen Projekten, Aufträgen, Objekten.
// Ob die Person das darf, prüft die Datenbank (Zugriffsregeln je Art, Paket 303).
// Fahrzeuge laufen weiter über die Handelsakte (Reiter „Partner").
// ============================================================

import { useCallback, useEffect, useMemo, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import PartnerAuftraege, { type Bezug } from '../PartnerAuftraege';
import { BEZUG_ARTEN, bezugAusAdresse, bezugTitel } from '@/lib/netzwerk';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', bad: '#E06666' };

type Art = typeof BEZUG_ARTEN[number]['key'];
type Zeile = Record<string, unknown> & { id: string };

export default function NetzwerkBezugSeite() {
  const [bezug, setBezug] = useState<Bezug | null>(null);
  const [ziel, setZiel] = useState<{ typ: Art; id: string } | null>(null);
  const [art, setArt] = useState<Art>('projekt');
  const [liste, setListe] = useState<Zeile[]>([]);
  const [suche, setSuche] = useState('');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const b = bezugAusAdresse(q);
      if (b) setZiel(b);
      else { const t = q.get('typ'); if (BEZUG_ARTEN.some((a) => a.key === t)) setArt(t as Art); setLaden(false); }
    } catch { setLaden(false); }
  }, []);

  // Gewählter Bezug: Zeile laden (nur eigener Betrieb)
  const ladeBezug = useCallback(async (z: { typ: Art; id: string }) => {
    setLaden(true); setFehler(null);
    const tab = BEZUG_ARTEN.find((a) => a.key === z.typ)!.tabelle;
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) { setLaden(false); return; }
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const betrieb = typeof chef === 'string' && chef ? chef : u.user.id;
    const { data, error } = await supabase.from(tab).select('*').eq('id', z.id).maybeSingle();
    setLaden(false);
    const zeile = data as Zeile | null;
    if (error || !zeile || zeile.owner_user_id !== betrieb) {
      setFehler('Nicht gefunden — oder Ihnen fehlt das Recht dafür.');
      return;
    }
    setBezug({ typ: z.typ, id: z.id, owner_user_id: betrieb, titel: bezugTitel(z.typ, zeile) });
  }, []);
  useEffect(() => { if (ziel) void ladeBezug(ziel); }, [ziel, ladeBezug]);

  // Auswahl-Liste
  const ladeListe = useCallback(async (a: Art) => {
    const tab = BEZUG_ARTEN.find((x) => x.key === a)!.tabelle;
    const { data, error } = await supabase.from(tab).select('*').limit(300);
    setListe(error ? [] : ((data as Zeile[] | null) ?? []));
    if (error) setFehler(`${BEZUG_ARTEN.find((x) => x.key === a)!.mehrzahl}: nicht lesbar — Modul nicht gebucht oder kein Recht.`);
    else setFehler(null);
  }, []);
  useEffect(() => { if (!ziel) void ladeListe(art); }, [art, ziel, ladeListe]);

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return liste
      .map((z) => ({ id: z.id, titel: bezugTitel(art, z) }))
      .filter((z) => !s || z.titel.toLowerCase().includes(s))
      .sort((x, y) => x.titel.localeCompare(y.titel, 'de'))
      .slice(0, 100);
  }, [liste, suche, art]);

  const artInfo = BEZUG_ARTEN.find((a) => a.key === (bezug?.typ ?? art))!;

  return (
    <div style={s.seite}>
      <a href="/dashboard/netzwerk?reiter=ausgang" style={s.zurueck}>← Betriebs-Netzwerk</a>
      <h1 style={s.h1}>🤝 Auftrag an Partner vergeben</h1>
      {fehler && <div style={s.warn}>{fehler}</div>}
      {laden && <div style={s.dim}>Lädt …</div>}

      {bezug && (
        <>
          <div style={{ ...s.karte, marginBottom: 12 }}>
            <div style={s.dim}>{artInfo.icon} {artInfo.name}</div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{bezug.titel}</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
              <a href={artInfo.akte(bezug.id)} style={s.link}>Zur {artInfo.key === 'auftrag' ? 'Auftrags' : artInfo.key === 'objekt' ? 'Objekt' : 'Projekt'}-Seite →</a>
              <a href={`/dashboard/netzwerk/bezug?typ=${bezug.typ}`} style={s.link}>{artInfo.key === 'auftrag' ? 'Anderen Auftrag' : `Anderes ${artInfo.name}`} wählen</a>
            </div>
          </div>
          <PartnerAuftraege bezug={bezug} />
        </>
      )}

      {!ziel && !laden && (
        <div style={s.karte}>
          <div style={s.dim}>Wählen Sie, woran der Partner arbeiten soll. Er sieht später nur den Namen und seine Aufgabe — nie Kunde, Adresse oder Preise.</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }} role="tablist">
            {BEZUG_ARTEN.map((a) => (
              <button key={a.key} role="tab" aria-selected={art === a.key} style={art === a.key ? s.reiterAn : s.reiterAus} onClick={() => { setArt(a.key); setSuche(''); }}>{a.icon} {a.mehrzahl}</button>
            ))}
          </div>
          <input style={s.inp} value={suche} placeholder="Suchen …" onChange={(e) => setSuche(e.target.value)} />
          <div style={{ display: 'grid', gap: 2, marginTop: 8 }}>
            {treffer.length === 0 && <div style={s.dim}>Keine {artInfo.mehrzahl} gefunden.</div>}
            {treffer.map((z) => (
              <a key={z.id} href={`/dashboard/netzwerk/bezug?typ=${art}&id=${z.id}`} style={s.zeile}>{z.titel} <span style={{ color: C.gold }}>→</span></a>
            ))}
          </div>
          <div style={{ ...s.dim, marginTop: 10 }}>Fahrzeuge geben Sie in der Handelsakte (Reiter „Partner“) an Partner.</div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  seite: { padding: '20px 16px 60px', maxWidth: 1100, margin: '0 auto', color: C.text },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 22, fontWeight: 800, margin: '10px 0' },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0 },
  dim: { color: C.dim, fontSize: 13 },
  warn: { background: 'rgba(224,102,102,0.1)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '10px 12px', margin: '10px 0', fontSize: 13.5 },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  reiterAn: { background: C.navy, border: `1px solid ${C.gold}`, color: C.gold, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  reiterAus: { background: C.navy, border: `1px solid ${C.border}`, color: C.dim, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  zeile: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 4px', borderTop: `1px solid ${C.border}`, color: C.text, textDecoration: 'none', fontSize: 14 },
  link: { color: C.gold, textDecoration: 'none', fontWeight: 700, fontSize: 13 },
};
