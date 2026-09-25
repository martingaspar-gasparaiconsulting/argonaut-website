'use client';

// ============================================================
// ARGONAUT OS · Personalakte-Ampel (Paket A1)
// Sitzt oben im Reiter „Stammdaten" des Personal-Drawers und zeigt,
// was zu einer vollständigen Personalakte noch fehlt — je Punkt mit
// Klick an die richtige Stelle. Die Liste selbst steht in
// lib/personalakte.ts (getestet); hier wird nur geladen und gezeigt.
// Nur lesen: Diese Komponente schreibt nichts in die Datenbank.
// ============================================================

import { useEffect, useMemo, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { akteStand, akteSatz, ORT_TEXT, type AkteEingabe, type AkteOrt } from '@/lib/personalakte';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
};

type Schul = { kategorie: string | null; status: string | null; gueltig_bis: string | null };

function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PersonalakteAmpel(props: {
  maId: string;
  /** Aktuelle Werte aus dem Formular (auch ungespeicherte), damit die Ampel sofort mitgeht. */
  werte: Omit<AkteEingabe, 'dokKategorien' | 'nachweisErteiltAm' | 'schulungen'>;
  /** Wechselt im Drawer auf den passenden Reiter. */
  onGehe: (ort: AkteOrt) => void;
}) {
  const { maId, werte, onGehe } = props;
  const [kats, setKats] = useState<string[]>([]);
  const [nachweis, setNachweis] = useState<string | null>(null);
  const [schul, setSchul] = useState<Schul[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [offen, setOffen] = useState(true);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const [d, v, s] = await Promise.all([
        supabase.from('hr_dokumente').select('kategorie').eq('mitarbeiter_id', maId),
        supabase.from('personal_vertrag').select('nachweis_erteilt_am').eq('mitarbeiter_id', maId).limit(1),
        supabase.from('hr_schulungen').select('kategorie,status,gueltig_bis').eq('mitarbeiter_id', maId),
      ]);
      if (!aktiv) return;
      const dZeilen: unknown = d.data;
      const vZeilen: unknown = v.data;
      const sZeilen: unknown = s.data;
      setKats(Array.isArray(dZeilen) ? dZeilen.map((z) => String((z as { kategorie?: unknown })?.kategorie ?? '')) : []);
      const erste = Array.isArray(vZeilen) && vZeilen.length > 0 ? (vZeilen[0] as { nachweis_erteilt_am?: string | null }) : null;
      setNachweis(erste?.nachweis_erteilt_am ?? null);
      setSchul(Array.isArray(sZeilen) ? (sZeilen as Schul[]) : []);
      setGeladen(true);
    })();
    return () => { aktiv = false; };
  }, [maId]);

  const stand = useMemo(
    () => akteStand({ ...werte, dokKategorien: kats, nachweisErteiltAm: nachweis, schulungen: schul }, heuteIso()),
    [werte, kats, nachweis, schul],
  );

  const farbe = stand.ampel === 'gruen' ? C.green : stand.ampel === 'gelb' ? C.warn : C.danger;

  function gehe(ort: AkteOrt) {
    if (ort === 'nachweis') { window.location.href = '/dashboard/personal/dokumente'; return; }
    onGehe(ort);
  }

  const box: CSSProperties = { border: `1px solid ${farbe}`, borderRadius: 12, padding: '14px 16px', marginBottom: 18, background: 'rgba(255,255,255,0.03)' };

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, color: farbe, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
            ● Personalakte {geladen ? `${stand.prozent} %` : '…'}
          </div>
          <div style={{ color: C.text, fontSize: 'clamp(13px, 1.13vw, 18px)', marginTop: 4 }}>
            {geladen ? akteSatz(stand) : 'Wird geprüft …'}
          </div>
        </div>
        <button
          onClick={() => setOffen((o) => !o)}
          style={{ background: 'transparent', color: C.gold, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 'clamp(12px, 1.06vw, 17px)' }}
        >
          {offen ? 'Liste zuklappen' : 'Was fehlt?'}
        </button>
      </div>

      {offen && geladen && (
        <div style={{ marginTop: 12 }}>
          {(['pflicht', 'empfohlen'] as const).map((gruppe) => (
            <div key={gruppe} style={{ marginBottom: 10 }}>
              <div style={{ color: C.gold, fontWeight: 700, fontSize: 'clamp(12px, 1.06vw, 17px)', marginBottom: 4 }}>
                {gruppe === 'pflicht' ? 'Pflicht' : 'Empfohlen'}
              </div>
              {stand.punkte.filter((p) => p.gruppe === gruppe).map((p) => (
                <div key={p.key} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: p.ok ? C.textDim : C.text, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
                      <span style={{ color: p.ok ? C.green : (gruppe === 'pflicht' ? C.danger : C.warn), marginRight: 8 }}>{p.ok ? '✓' : '○'}</span>
                      {p.text}
                    </div>
                    {!p.ok && (
                      <div style={{ color: C.textDim, fontSize: 'clamp(11px, 0.94vw, 15px)', marginTop: 2, marginLeft: 22 }}>
                        {p.hinweis ? <span style={{ color: C.warn }}>{p.hinweis} </span> : null}
                        {p.warum}
                      </div>
                    )}
                  </div>
                  {!p.ok && (
                    <button
                      onClick={() => gehe(p.ort)}
                      title={ORT_TEXT[p.ort]}
                      style={{ flexShrink: 0, background: 'transparent', color: C.cyan, border: '1px solid rgba(0,229,255,0.35)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 'clamp(11px, 0.94vw, 15px)' }}
                    >
                      {p.ort === 'stamm' || p.ort === 'zugang' ? 'unten eintragen' : 'hinführen →'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div style={{ color: C.textDim, fontSize: 'clamp(11px, 0.94vw, 15px)', marginTop: 6 }}>
            Stammdaten zählen sofort, gespeichert werden sie erst mit „Speichern". Arbeitshilfe, keine Rechtsberatung.
          </div>
        </div>
      )}
    </div>
  );
}
