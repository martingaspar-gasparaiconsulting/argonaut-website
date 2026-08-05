'use client';

// ============================================================
// ARGONAUT OS · G2b · Modul-Freischaltung je Filiale (Chef)
// Der CHEF wählt einen Standort und schaltet Module gezielt ab/an.
// Fail-open wie tenant_module: solange nichts abgeschaltet ist, sind an
// der Filiale alle (gebuchten) Module aktiv. Die echte Gate-Wirkung greift
// mit dem Filial-Umschalter (G3) — der Live-Gate bleibt hier unberührt.
// Pfad: app/dashboard/filial-module/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { MODULE_NACH_GRUPPE } from '../../../lib/rechte';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Standort = { id: string; name: string; ist_hauptsitz: boolean; aktiv: boolean };
type ModulRow = { standort_id: string; modul_key: string; aktiv: boolean };

export default function FilialModulePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [standorte, setStandorte] = useState<Standort[]>([]);
  const [sel, setSel] = useState<string>('');
  const [map, setMap] = useState<Record<string, Record<string, boolean>>>({}); // standortId -> modulKey -> aktiv
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const ladeAlles = useCallback(async () => {
    const [rSt, rMod] = await Promise.all([
      supabase.from('standorte').select('id, name, ist_hauptsitz, aktiv').order('ist_hauptsitz', { ascending: false }).order('name', { ascending: true }),
      supabase.from('standort_module').select('standort_id, modul_key, aktiv'),
    ]);
    if (rSt.error || rMod.error) { setFehler('Daten konnten nicht geladen werden.'); return; }
    const st = (rSt.data as Standort[]) ?? [];
    setStandorte(st);
    const m: Record<string, Record<string, boolean>> = {};
    ((rMod.data as ModulRow[]) ?? []).forEach((r) => { (m[r.standort_id] ??= {})[r.modul_key] = r.aktiv; });
    setMap(m);
    setSel((cur) => cur || st[0]?.id || '');
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeAlles(); setLaden(false);
    })();
  }, [ladeAlles]);

  // Effektiver Status: Zeile false -> aus; sonst (true oder keine Zeile) -> an.
  function istAn(standortId: string, key: string): boolean {
    const v = map[standortId]?.[key];
    return v === false ? false : true;
  }

  async function toggle(key: string) {
    if (!uid || !sel) return;
    setOk(null); setFehler(null);
    const neu = !istAn(sel, key);
    // optimistisch
    setMap((m) => ({ ...m, [sel]: { ...(m[sel] ?? {}), [key]: neu } }));
    const { error } = await supabase.from('standort_module').upsert(
      { owner_user_id: uid, standort_id: sel, modul_key: key, aktiv: neu, updated_at: new Date().toISOString() },
      { onConflict: 'standort_id,modul_key' }
    );
    if (error) { setFehler('Konnte nicht gespeichert werden.'); await ladeAlles(); }
  }

  async function alleAn() {
    if (!uid || !sel) return;
    setOk(null); setFehler(null);
    // Nur die abgeschalteten Zeilen dieses Standorts wieder auf aktiv setzen.
    const { error } = await supabase.from('standort_module').update({ aktiv: true, updated_at: new Date().toISOString() }).eq('standort_id', sel);
    if (error) { setFehler('Konnte nicht zurückgesetzt werden.'); return; }
    setOk('Alle Module an dieser Filiale wieder aktiv.');
    await ladeAlles();
  }

  const selStandort = standorte.find((s) => s.id === sel) || null;
  const ausCount = sel ? Object.values(map[sel] ?? {}).filter((v) => v === false).length : 0;

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🧩 Filial-Module</h1>
      <p style={styles.sub}>
        Schalten Sie einzelne Module je Standort ab, wenn eine Filiale sie nicht braucht.
        Solange Sie nichts abschalten, sind an jeder Filiale alle gebuchten Module aktiv.
      </p>

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {!laden && standorte.length === 0 ? (
        <div style={styles.warnBox}>
          ⚠️ Noch keine Standorte angelegt. Legen Sie zuerst unter <b>🏢 Standorte &amp; Filialen</b> Standorte an.
        </div>
      ) : (
        <>
          <div style={styles.card}>
            <div style={styles.selRow}>
              <div>
                <div style={styles.feldLabel}>Standort wählen</div>
                <select style={styles.select} value={sel} onChange={(e) => { setSel(e.target.value); setOk(null); setFehler(null); }}>
                  {standorte.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.ist_hauptsitz ? ' (Hauptsitz)' : ''}{!s.aktiv ? ' · inaktiv' : ''}</option>
                  ))}
                </select>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={styles.feldLabel}>Abgeschaltet</div>
                <div style={{ ...styles.zahl, color: ausCount ? C.warn : C.green }}>{ausCount}</div>
              </div>
            </div>
            {ausCount > 0 && <button style={styles.btnGhost} onClick={alleAn}>Alle Module hier wieder aktivieren</button>}
          </div>

          {laden ? <p style={styles.dim}>Lädt …</p> : selStandort && MODULE_NACH_GRUPPE.map((g) => (
            <div key={g.key} style={styles.card}>
              <div style={{ fontWeight: 800 }}>{g.label}</div>
              <div style={styles.modGrid}>
                {g.items.map((it) => {
                  const an = istAn(sel, it.key);
                  return (
                    <button key={it.key} style={{ ...styles.modBtn, ...(an ? styles.modAn : styles.modAus) }} onClick={() => toggle(it.key)}
                      title={an ? 'aktiv — klicken zum Abschalten' : 'aus — klicken zum Aktivieren'}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                      <span style={{ ...styles.pill, ...(an ? styles.pillAn : styles.pillAus) }}>{an ? 'aktiv' : 'aus'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      <div style={styles.hinweis}>
        ℹ️ Fail-open wie beim Buchungs-Gate: Erst wenn Sie hier etwas abschalten, greift die Filial-Beschränkung.
        Wirksam wird sie, sobald der <b>Filial-Umschalter</b> (nächster Schritt, G3) den aktiven Standort kennt —
        der Live-Zugriff ändert sich also durch diese Seite noch nicht.
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 660 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  selRow: { display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' },
  feldLabel: { fontSize: 12, color: C.textDim, fontWeight: 600, marginBottom: 5 },
  select: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', minWidth: 220 },
  zahl: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 30, fontWeight: 800 },
  btnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' },

  modGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 },
  modBtn: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  modAn: { background: C.navy, color: C.text, border: `1px solid ${C.green}55` },
  modAus: { background: 'rgba(224,102,102,0.06)', color: C.textDim, border: `1px solid ${C.danger}44` },
  pill: { fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 8px', flexShrink: 0 },
  pillAn: { background: `${C.green}22`, color: C.green },
  pillAus: { background: `${C.danger}22`, color: C.danger },

  warnBox: { marginTop: 12, fontSize: 14, color: C.warn, background: 'rgba(224,162,76,0.08)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '12px 14px', lineHeight: 1.5 },
  hinweis: { marginTop: 14, fontSize: 13, color: C.textDim, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
