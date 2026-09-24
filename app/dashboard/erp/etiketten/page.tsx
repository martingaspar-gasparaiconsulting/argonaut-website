'use client';

// ============================================================
// ARGONAUT OS · QR-Etiketten für Geräte und Fahrzeuge (Paket PJ, B24)
// Auswählen, drucken, aufkleben. Jeder Code führt auf die Akte im
// angemeldeten Bereich (/dashboard/erp/inventar/<id> bzw. /fuhrpark/<id>) —
// wer ihn ohne Login scannt, landet auf der Anmeldeseite. Der QR-Code wird
// hier im Browser erzeugt (lib/qr.ts), kein fremder Dienst.
// Aufruf mit ?geraet=<id> oder ?fahrzeug=<id> markiert das Etikett vor.
//
// Pfad: app/dashboard/erp/etiketten/page.tsx
// ============================================================

import { useState, useEffect, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { akteLink, qrSvg } from '@/lib/fuhrparkGeraete';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', danger: '#E06666',
};

type Eintrag = { key: string; art: 'geraet' | 'fahrzeug'; id: string; titel: string; zeile: string };

export default function Etiketten() {
  const [liste, setListe] = useState<Eintrag[]>([]);
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [suche, setSuche] = useState('');
  const [origin, setOrigin] = useState('');
  const [firma, setFirma] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    const q = new URLSearchParams(window.location.search);
    const vor = new Set<string>();
    const g = q.get('geraet'); if (g) vor.add(`geraet:${g}`);
    const f = q.get('fahrzeug'); if (f) vor.add(`fahrzeug:${f}`);
    (async () => {
      const [inv, fz] = await Promise.all([
        supabase.from('inventar').select('id, bezeichnung, inventarnummer').order('bezeichnung', { ascending: true }),
        supabase.from('fahrzeuge').select('id, bezeichnung, kennzeichen').order('bezeichnung', { ascending: true }),
      ]);
      if (inv.error && fz.error) setFehler('Geräte und Fahrzeuge konnten nicht geladen werden.');
      const a: Eintrag[] = [
        ...((inv.data as { id: string; bezeichnung: string; inventarnummer: string | null }[]) ?? []).map((x) => ({
          key: `geraet:${x.id}`, art: 'geraet' as const, id: x.id, titel: x.bezeichnung, zeile: x.inventarnummer ? `Nr. ${x.inventarnummer}` : 'Gerät',
        })),
        ...((fz.data as { id: string; bezeichnung: string; kennzeichen: string | null }[]) ?? []).map((x) => ({
          key: `fahrzeug:${x.id}`, art: 'fahrzeug' as const, id: x.id, titel: x.bezeichnung, zeile: x.kennzeichen || 'Fahrzeug',
        })),
      ];
      setListe(a);
      setGewaehlt(vor);
      try {
        const { data: u } = await supabase.auth.getUser();
        if (u?.user?.id) {
          const { data: ci } = await supabase.from('web_ci').select('firma').eq('owner_user_id', u.user.id).maybeSingle();
          setFirma(String((ci as { firma?: string | null } | null)?.firma ?? '').trim());
        }
      } catch { /* egal */ }
    })();
  }, []);

  const sichtbar = useMemo(() => {
    const t = suche.trim().toLowerCase();
    return t ? liste.filter((x) => `${x.titel} ${x.zeile}`.toLowerCase().includes(t)) : liste;
  }, [liste, suche]);

  const druck = useMemo(() => liste.filter((x) => gewaehlt.has(x.key)).map((x) => {
    const link = origin ? akteLink(origin, x.art, x.id) : null;
    return { ...x, svg: link ? qrSvg(link).svg : null };
  }), [liste, gewaehlt, origin]);

  function umschalten(key: string) {
    setGewaehlt((alt) => { const n = new Set(alt); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  return (
    <div style={s.page}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .argo-druck, .argo-druck * { visibility: visible !important; }
          .argo-druck { position: absolute; left: 0; top: 0; width: 100%; }
          @page { margin: 8mm; }
        }
      `}</style>
      <a href="/dashboard/erp/inventar" style={s.zurueck}>← Inventar</a>
      <h1 style={s.h1}>🏷 QR-Etiketten</h1>
      <p style={s.sub}>Etiketten für Werkzeuge, Geräte, Maschinen und Fahrzeuge. Scannen öffnet die Akte: wer hat es, ist es geprüft, Defekt melden, Tanken eintragen. Nur für angemeldete Personen Ihres Betriebs.</p>
      {fehler && <div style={s.err}>{fehler}</div>}

      <div style={s.leiste}>
        <input style={{ ...s.inp, flex: 1, minWidth: 200 }} placeholder="Suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <button style={s.klein} onClick={() => setGewaehlt(new Set(sichtbar.map((x) => x.key)))}>Alle sichtbaren wählen</button>
        <button style={s.klein} onClick={() => setGewaehlt(new Set())}>Keine</button>
        <button style={{ ...s.primaer, opacity: druck.length ? 1 : 0.5 }} disabled={!druck.length} onClick={() => window.print()}>🖨 {druck.length} drucken</button>
      </div>

      <div style={s.auswahl}>
        {sichtbar.map((x) => (
          <label key={x.key} style={{ ...s.wahl, borderColor: gewaehlt.has(x.key) ? C.gold : C.border }}>
            <input type="checkbox" checked={gewaehlt.has(x.key)} onChange={() => umschalten(x.key)} />
            <span>{x.art === 'fahrzeug' ? '🚐' : '🧰'} <b>{x.titel}</b> <span style={{ color: C.textDim }}>· {x.zeile}</span></span>
          </label>
        ))}
        {!sichtbar.length && <div style={{ color: C.textDim }}>Keine Geräte oder Fahrzeuge gefunden.</div>}
      </div>

      {druck.length > 0 && (
        <>
          <div style={{ fontWeight: 800, marginTop: 20 }}>Vorschau</div>
          <div className="argo-druck" style={s.bogen}>
            {druck.map((x) => (
              <div key={x.key} style={s.etikett}>
                {x.svg ? <div style={s.code} dangerouslySetInnerHTML={{ __html: x.svg }} /> : <div style={s.code} />}
                <div style={{ minWidth: 0 }}>
                  <div style={s.etTitel}>{x.titel}</div>
                  <div style={s.etZeile}>{x.zeile}</div>
                  {firma && <div style={s.etFirma}>{firma}</div>}
                  <div style={s.etHinweis}>Scannen: Akte, Ausgabe, Defekt melden</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.textDim, fontSize: 13, textDecoration: 'none' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  sub: { color: C.textDim, fontSize: 14.5, margin: '6px 0 0', maxWidth: 760 },
  leiste: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  klein: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  auswahl: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8, marginTop: 12 },
  wahl: { display: 'flex', gap: 8, alignItems: 'center', background: C.navy2, border: '1px solid', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontSize: 14 },
  bogen: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 70mm)', gap: '4mm', marginTop: 10, background: '#fff', padding: '6mm', borderRadius: 8 },
  etikett: { width: '70mm', height: '32mm', border: '0.3mm dashed #999', borderRadius: '2mm', display: 'flex', gap: '3mm', alignItems: 'center', padding: '2mm', boxSizing: 'border-box', background: '#fff', color: '#000', breakInside: 'avoid', overflow: 'hidden' },
  code: { width: '27mm', height: '27mm', flex: '0 0 27mm' },
  etTitel: { fontWeight: 800, fontSize: '10pt', lineHeight: 1.15, color: '#000', overflow: 'hidden', maxHeight: '2.4em' },
  etZeile: { fontSize: '8.5pt', color: '#222', marginTop: '1mm' },
  etFirma: { fontSize: '7.5pt', color: '#444', marginTop: '1mm' },
  etHinweis: { fontSize: '6.5pt', color: '#666', marginTop: '1mm' },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
