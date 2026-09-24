'use client';

// ============================================================
// ARGONAUT OS · Material anfordern vom Einsatz (Paket PB · B28)
//
// Der Monteur tippt auf „📦 Material", sieht, was er zu diesem Einsatz schon
// angefordert hat (mit Status vom Büro), und fordert Neues an. Das Büro
// bearbeitet die Anforderungen im Einkauf.
//
// Die Anforderung gehört dem BETRIEB (owner_user_id = Chef des Einsatzes);
// angefordert_von ist der eingeloggte Monteur. RLS: der Monteur sieht nur
// seine eigenen Anforderungen, der Chef alle.
// Prüfregeln (Menge nie still 0, Datum nicht in der Vergangenheit) stehen in
// lib/materialAbruf.ts und sind dort getestet.
// ============================================================

import { useState, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { pruefeAbruf, ABRUF_STATUS, istStatus } from '@/lib/materialAbruf';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  gruen: '#4CAF7D', rot: '#E06666', text: '#E8EDF4', dim: '#8FA3BE', rand: 'rgba(143,163,190,0.22)',
};
const FARBE: Record<string, string> = { gold: C.gold, cyan: C.cyan, green: C.gruen, textDim: C.dim, danger: C.rot };

type Zeile = {
  id: string; bezeichnung: string; menge: number | string; einheit: string | null;
  benoetigt_bis: string | null; status: string; antwort: string | null;
};

function heuteLokal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MaterialAbruf({
  einsatzId, ownerUserId, einsatzTitel, mitarbeiterName,
}: { einsatzId: string; ownerUserId: string | null; einsatzTitel?: string | null; mitarbeiterName?: string | null }) {
  const [offen, setOffen] = useState(false);
  const [liste, setListe] = useState<Zeile[]>([]);
  const [bezeichnung, setBezeichnung] = useState('');
  const [menge, setMenge] = useState('1');
  const [einheit, setEinheit] = useState('Stk');
  const [bis, setBis] = useState('');
  const [notiz, setNotiz] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    const { data, error } = await supabase
      .from('material_abruf')
      .select('id, bezeichnung, menge, einheit, benoetigt_bis, status, antwort')
      .eq('einsatz_id', einsatzId)
      .order('erstellt_am', { ascending: false });
    if (error) {
      setFehler(/material_abruf/.test(error.message) ? 'Der Material-Abruf ist noch nicht eingerichtet (SQL von Paket PB fehlt).' : 'Anforderungen konnten nicht geladen werden.');
      return;
    }
    setListe((data as Zeile[]) ?? []);
  }, [einsatzId]);

  function oeffnen() { setOffen(true); setFehler(null); setOk(null); void laden(); }

  async function anfordern() {
    setFehler(null); setOk(null);
    if (!ownerUserId) { setFehler('Dieser Einsatz ist keinem Betrieb zugeordnet.'); return; }
    const p = pruefeAbruf({ bezeichnung, menge, einheit, benoetigt_bis: bis, notiz }, heuteLokal());
    if (!p.ok) { setFehler(p.fehler); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const ich = u?.user?.id;
      if (!ich) { setFehler('Nicht angemeldet.'); return; }
      const { error } = await supabase.from('material_abruf').insert({
        ...p.zeile,
        owner_user_id: ownerUserId,
        angefordert_von: ich,
        einsatz_id: einsatzId,
        einsatz_titel: (einsatzTitel || '').slice(0, 200) || null,
        mitarbeiter_name: (mitarbeiterName || '').slice(0, 120) || null,
        status: 'angefordert',
      });
      if (error) { setFehler('Die Anforderung konnte nicht gespeichert werden.'); return; }
      setOk(`✓ ${p.zeile.menge} ${p.zeile.einheit || ''} ${p.zeile.bezeichnung} angefordert — das Büro sieht es im Einkauf.`);
      setBezeichnung(''); setMenge('1'); setNotiz(''); setBis('');
      await laden();
    } finally { setBusy(false); }
  }

  return (
    <>
      <button type="button" style={s.knopf} onClick={oeffnen}>📦 Material</button>
      {offen && (
        <div style={s.hinter} onClick={() => setOffen(false)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <b style={{ fontSize: 17 }}>📦 Material anfordern</b>
              <span style={{ flex: 1 }} />
              <button type="button" style={s.knopf} onClick={() => setOffen(false)}>✕</button>
            </div>
            {einsatzTitel && <div style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>für: {einsatzTitel}</div>}

            <label style={s.lab}>Was wird gebraucht?
              <input style={s.inp} value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. Silikon weiß, Kupferrohr 15 mm" />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ ...s.lab, flex: 1 }}>Menge
                <input style={s.inp} value={menge} onChange={(e) => setMenge(e.target.value)} inputMode="decimal" />
              </label>
              <label style={{ ...s.lab, flex: 1 }}>Einheit
                <input style={s.inp} value={einheit} onChange={(e) => setEinheit(e.target.value)} />
              </label>
            </div>
            <label style={s.lab}>Gebraucht bis (optional)
              <input type="date" style={s.inp} value={bis} min={heuteLokal()} onChange={(e) => setBis(e.target.value)} />
            </label>
            <label style={s.lab}>Hinweis fürs Büro (optional)
              <input style={s.inp} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Marke, Farbe, Lieferung auf die Baustelle" />
            </label>

            {fehler && <div style={{ color: C.rot, fontSize: 14, marginTop: 10 }}>{fehler}</div>}
            {ok && <div style={{ color: C.gruen, fontSize: 14, marginTop: 10 }}>{ok}</div>}

            <button type="button" style={{ ...s.primaer, opacity: busy ? 0.55 : 1 }} disabled={busy} onClick={() => void anfordern()}>
              {busy ? 'Sende …' : 'Anfordern'}
            </button>

            {liste.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ color: C.dim, fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Schon angefordert</div>
                {liste.map((z) => {
                  const st = istStatus(z.status) ? ABRUF_STATUS[z.status] : { label: z.status, farbe: 'textDim' as const };
                  return (
                    <div key={z.id} style={s.zeile}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div>{String(z.menge).replace('.', ',')} {z.einheit || ''} · <b>{z.bezeichnung}</b></div>
                        {z.antwort && <div style={{ color: C.dim, fontSize: 13 }}>Büro: {z.antwort}</div>}
                      </div>
                      <span style={{ color: FARBE[st.farbe], fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const s: Record<string, CSSProperties> = {
  knopf: { background: 'transparent', color: C.text, border: `1px solid ${C.rand}`, borderRadius: 10, padding: '8px 12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  hinter: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  fenster: { background: C.navy2, color: C.text, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', borderRadius: '18px 18px 0 0', padding: '18px 18px 28px', boxSizing: 'border-box' },
  lab: { display: 'block', color: C.dim, fontSize: 13, fontWeight: 700, marginTop: 12 },
  inp: { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, background: C.navy, color: C.text, border: `1px solid ${C.rand}`, borderRadius: 10, padding: '12px 12px', fontSize: 16, fontFamily: 'inherit' },
  primaer: { width: '100%', marginTop: 16, background: C.gold, color: C.navy, border: 'none', borderRadius: 12, padding: '14px 18px', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.rand}`, padding: '9px 0', fontSize: 14.5 },
};
