'use client';

// ============================================================
// ARGONAUT OS · G2a · Filialleitung & Rollen (Chef-Verwaltung)
// Der CHEF gibt jedem Mitarbeiter einen Leitungs-Titel (Preset ODER
// eigener Titel) und ordnet ihn Standorten zu. Getrennt von der
// Rechte-Hierarchie (mitarbeiter.rolle) — die bleibt unberührt.
// Die eigentliche Daten-/Rechte-Wirkung folgt in G2c/G3.
// Pfad: app/dashboard/filialleitung/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { LEITUNGSROLLEN_GEBIET, LEITUNGSROLLEN_BETRIEB, istGebietsrolle } from '../../../lib/leitungsrollen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Ma = { id: string; vorname: string | null; nachname: string | null; email: string | null; leitungsrolle: string | null };
type Standort = { id: string; name: string; ist_hauptsitz: boolean; aktiv: boolean };
type EigenerTitel = { id: string; name: string };

function name(m: Ma) {
  const n = `${m.vorname ?? ''} ${m.nachname ?? ''}`.trim();
  return n || m.email || 'Mitarbeiter';
}

export default function FilialleitungPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [mas, setMas] = useState<Ma[]>([]);
  const [standorte, setStandorte] = useState<Standort[]>([]);
  const [eigene, setEigene] = useState<EigenerTitel[]>([]);
  const [scope, setScope] = useState<Record<string, string[]>>({}); // maId -> standortId[]
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [neuerTitel, setNeuerTitel] = useState('');
  const [speichertTitel, setSpeichertTitel] = useState(false);
  const [offen, setOffen] = useState<string | null>(null); // maId dessen Standort-Panel offen ist

  const ladeAlles = useCallback(async () => {
    const [rMa, rSt, rEig, rScope] = await Promise.all([
      supabase.from('mitarbeiter').select('id, vorname, nachname, email, leitungsrolle').order('nachname', { ascending: true }),
      supabase.from('standorte').select('id, name, ist_hauptsitz, aktiv').order('ist_hauptsitz', { ascending: false }).order('name', { ascending: true }),
      supabase.from('leitungsrolle_eigen').select('id, name').order('name', { ascending: true }),
      supabase.from('mitarbeiter_standorte').select('mitarbeiter_id, standort_id'),
    ]);
    if (rMa.error || rSt.error || rEig.error || rScope.error) { setFehler('Daten konnten nicht geladen werden.'); return; }
    setMas((rMa.data as Ma[]) ?? []);
    setStandorte((rSt.data as Standort[]) ?? []);
    setEigene((rEig.data as EigenerTitel[]) ?? []);
    const map: Record<string, string[]> = {};
    ((rScope.data as { mitarbeiter_id: string; standort_id: string }[]) ?? []).forEach((z) => {
      (map[z.mitarbeiter_id] ??= []).push(z.standort_id);
    });
    setScope(map);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeAlles(); setLaden(false);
    })();
  }, [ladeAlles]);

  async function rolleSetzen(m: Ma, wert: string) {
    const neu = wert || null;
    setOk(null); setFehler(null);
    setMas((l) => l.map((x) => (x.id === m.id ? { ...x, leitungsrolle: neu } : x)));
    const { error } = await supabase.from('mitarbeiter').update({ leitungsrolle: neu }).eq('id', m.id);
    if (error) { setFehler('Titel konnte nicht gespeichert werden.'); await ladeAlles(); return; }
    setOk(`${name(m)} → ${neu ?? 'keine Leitungsrolle'} gespeichert.`);
  }

  async function titelAnlegen() {
    const n = neuerTitel.trim();
    if (!n) return;
    if (!uid) { setFehler('Nicht angemeldet.'); return; }
    if (eigene.some((t) => t.name.toLowerCase() === n.toLowerCase())) { setFehler('Diesen eigenen Titel gibt es schon.'); return; }
    setSpeichertTitel(true); setOk(null); setFehler(null);
    const { error } = await supabase.from('leitungsrolle_eigen').insert({ owner_user_id: uid, name: n });
    if (error) { setFehler('Titel konnte nicht gespeichert werden.'); setSpeichertTitel(false); return; }
    setNeuerTitel(''); setSpeichertTitel(false);
    setOk(`Eigener Titel „${n}" gespeichert.`);
    await ladeAlles();
  }

  async function titelLoeschen(t: EigenerTitel) {
    setOk(null); setFehler(null);
    const { error } = await supabase.from('leitungsrolle_eigen').delete().eq('id', t.id);
    if (error) { setFehler('Titel konnte nicht gelöscht werden.'); return; }
    setOk(`Eigener Titel „${t.name}" gelöscht.`);
    await ladeAlles();
  }

  async function standortToggle(m: Ma, st: Standort) {
    if (!uid) return;
    setOk(null); setFehler(null);
    const drin = (scope[m.id] ?? []).includes(st.id);
    // optimistisch
    setScope((s) => {
      const cur = new Set(s[m.id] ?? []);
      if (drin) cur.delete(st.id); else cur.add(st.id);
      return { ...s, [m.id]: [...cur] };
    });
    if (drin) {
      const { error } = await supabase.from('mitarbeiter_standorte').delete().eq('mitarbeiter_id', m.id).eq('standort_id', st.id);
      if (error) { setFehler('Standort-Zuordnung konnte nicht geändert werden.'); await ladeAlles(); }
    } else {
      const { error } = await supabase.from('mitarbeiter_standorte').insert({ owner_user_id: uid, mitarbeiter_id: m.id, standort_id: st.id });
      if (error) { setFehler('Standort-Zuordnung konnte nicht geändert werden.'); await ladeAlles(); }
    }
  }

  const zMitRolle = mas.filter((m) => m.leitungsrolle).length;

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>👔 Filialleitung &amp; Rollen</h1>
      <p style={styles.sub}>
        Geben Sie jedem Mitarbeiter einen Leitungs-Titel und ordnen Sie ihn seinen Standorten zu.
        Die Presets decken die meisten Fälle ab — für Sonderfälle legen Sie unten einen eigenen Titel an.
      </p>

      {!laden && (
        <div style={styles.kpiGrid}>
          <Kpi label="Mit Leitungsrolle" value={String(zMitRolle)} accent={C.gold} />
          <Kpi label="Standorte" value={String(standorte.length)} accent={C.cyan} />
          <Kpi label="Eigene Titel" value={String(eigene.length)} accent={C.green} />
        </div>
      )}

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {!laden && standorte.length === 0 && (
        <div style={styles.warnBox}>
          ⚠️ Noch keine Standorte angelegt. Legen Sie zuerst unter <b>🏢 Standorte &amp; Filialen</b> Ihre Standorte an,
          dann können Sie hier Mitarbeiter zuordnen.
        </div>
      )}

      {/* Eigene Titel verwalten */}
      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Eigene Titel (Spezialfälle)</div>
        <div style={styles.titelRow}>
          <input
            style={styles.input}
            value={neuerTitel}
            placeholder='z. B. „Bayern-Leiter"'
            onChange={(e) => setNeuerTitel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') titelAnlegen(); }}
          />
          <button style={{ ...styles.btnGold, opacity: speichertTitel ? 0.6 : 1 }} disabled={speichertTitel} onClick={titelAnlegen}>
            {speichertTitel ? 'Speichert …' : '+ Titel speichern'}
          </button>
        </div>
        {eigene.length > 0 ? (
          <div style={styles.chipWrap}>
            {eigene.map((t) => (
              <span key={t.id} style={styles.chip}>
                {t.name}
                <button style={styles.chipX} title="Titel löschen" onClick={() => titelLoeschen(t)}>×</button>
              </span>
            ))}
          </div>
        ) : <p style={styles.dim}>Noch keine eigenen Titel — die Presets reichen meist aus.</p>}
      </div>

      {/* Mitarbeiter-Zuweisung */}
      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Mitarbeiter</div>
        {laden ? <p style={styles.dim}>Lädt …</p> : mas.length === 0 ? (
          <p style={styles.dim}>Noch keine Mitarbeiter angelegt (unter „Rechte" bzw. „Personal").</p>
        ) : mas.map((m) => {
          const zug = scope[m.id] ?? [];
          const gebiet = istGebietsrolle(m.leitungsrolle);
          return (
            <div key={m.id} style={styles.maBlock}>
              <div style={styles.maKopf}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name(m)}</div>
                  <div style={{ fontSize: 13, color: C.textDim }}>{m.email || '—'}</div>
                </div>
                <select style={styles.select} value={m.leitungsrolle ?? ''} onChange={(e) => rolleSetzen(m, e.target.value)}>
                  <option value="">— keine Leitungsrolle —</option>
                  <optgroup label="Gebiet (mehrere Standorte)">
                    {LEITUNGSROLLEN_GEBIET.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                  </optgroup>
                  <optgroup label="Betrieb / Team / Schicht">
                    {LEITUNGSROLLEN_BETRIEB.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                  </optgroup>
                  {eigene.length > 0 && (
                    <optgroup label="Eigene Titel">
                      {eigene.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>

              <div style={styles.maFuss}>
                <button style={styles.btnMini} disabled={standorte.length === 0} onClick={() => setOffen(offen === m.id ? null : m.id)}>
                  🏢 Standorte ({zug.length}){offen === m.id ? ' ▲' : ' ▾'}
                </button>
                {m.leitungsrolle && (
                  <span style={gebiet ? styles.badgeCyan : styles.badgeGold}>
                    {m.leitungsrolle}{gebiet ? ' · Gebiet' : ''}
                  </span>
                )}
                {zug.length > 0 && (
                  <span style={{ fontSize: 13, color: C.textDim }}>
                    {standorte.filter((s) => zug.includes(s.id)).map((s) => s.name).join(', ')}
                  </span>
                )}
              </div>

              {offen === m.id && standorte.length > 0 && (
                <div style={styles.stPanel}>
                  {standorte.map((s) => (
                    <label key={s.id} style={styles.stCheck}>
                      <input type="checkbox" checked={zug.includes(s.id)} onChange={() => standortToggle(m, s)} />
                      <span>{s.name}{s.ist_hauptsitz ? ' (Hauptsitz)' : ''}{!s.aktiv ? ' · inaktiv' : ''}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.hinweis}>
        ℹ️ Der Leitungs-Titel ist eine <b>eigene Ebene</b> — die Zugriffsrechte stellen Sie weiterhin unter „Rechte" ein.
        Dass ein Filialleiter automatisch nur seine Standort-Daten sieht, kommt im nächsten Schritt (Daten-Zuschnitt).
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={styles.kpiBox}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValue, color: accent || C.text }}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 660 },

  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 },
  kpiBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' },
  kpiLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiValue: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 30, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  titelRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', flex: 1, minWidth: 180, boxSizing: 'border-box' },
  select: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', flexShrink: 0, maxWidth: 260 },

  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer' },
  btnMini: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 11px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },

  chipWrap: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, background: `${C.green}18`, color: C.text, border: `1px solid ${C.green}55`, borderRadius: 999, padding: '5px 10px', fontSize: 13, fontWeight: 600 },
  chipX: { background: 'transparent', color: C.textDim, border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 },

  maBlock: { borderBottom: `1px solid ${C.border}`, paddingBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  maKopf: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  maFuss: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  stPanel: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 },
  stCheck: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.text },

  badgeGold: { background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 8, padding: '3px 9px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  badgeCyan: { background: 'rgba(0,229,255,0.14)', color: C.cyan, border: `1px solid rgba(0,229,255,0.4)`, borderRadius: 8, padding: '3px 9px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },

  warnBox: { marginTop: 12, fontSize: 14, color: C.warn, background: 'rgba(224,162,76,0.08)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '12px 14px', lineHeight: 1.5 },
  hinweis: { marginTop: 14, fontSize: 13, color: C.textDim, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 4 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
