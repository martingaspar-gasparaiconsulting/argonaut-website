'use client';

// ============================================================
// ARGONAUT OS · Bündel 12 · Fördermittel-Assistent (Dashboard)
// Fragebogen -> passende, AKTUELL AKTIVE Förderprogramme (kuratierter
// Katalog) -> auf die Merkliste setzen, Status + Frist verfolgen.
// Pfad: app/dashboard/foerdermittel/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  FOERDER_PROGRAMME, FOERDER_STAND, ART_LABEL, KATEGORIE_LABEL, BUNDESLAENDER,
  type FoerderProgramm, type FoerderKategorie, type Foerderart, type FoerderPhase,
} from './programme';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Vorhaben = {
  id: string; programm_key: string; programm_name: string;
  status: string; frist: string | null; notiz: string | null;
};

const STATUS: { key: string; label: string; farbe: string }[] = [
  { key: 'interessiert', label: 'Interessiert', farbe: C.cyan },
  { key: 'beantragt', label: 'Beantragt', farbe: C.warn },
  { key: 'bewilligt', label: 'Bewilligt', farbe: C.green },
  { key: 'abgelehnt', label: 'Abgelehnt', farbe: C.danger },
  { key: 'abgeschlossen', label: 'Abgeschlossen', farbe: C.textDim },
];
function statusInfo(k: string) { return STATUS.find((s) => s.key === k) || STATUS[0]; }
function heute() { return new Date().toISOString().slice(0, 10); }
function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function fristAmpel(frist: string | null): { txt: string; farbe: string } | null {
  if (!frist) return null;
  const tage = Math.ceil((new Date(frist + 'T00:00:00').getTime() - new Date(heute() + 'T00:00:00').getTime()) / 86400000);
  if (tage < 0) return { txt: `Frist seit ${-tage} T überfällig`, farbe: C.danger };
  if (tage <= 14) return { txt: `Frist in ${tage} T`, farbe: C.warn };
  return { txt: `Frist in ${tage} T`, farbe: C.green };
}

const KATEGORIEN = Object.keys(KATEGORIE_LABEL) as FoerderKategorie[];
const ARTEN = Object.keys(ART_LABEL) as Foerderart[];

export default function FoerdermittelPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [vorhaben, setVorhaben] = useState<Record<string, Vorhaben>>({});
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Fragebogen
  const [kats, setKats] = useState<Set<FoerderKategorie>>(new Set());
  const [arten, setArten] = useState<Set<Foerderart>>(new Set());
  const [phase, setPhase] = useState<FoerderPhase>('beide');
  const [bundesland, setBundesland] = useState('');

  const laden_ = useCallback(async () => {
    const { data } = await supabase.from('foerder_vorhaben')
      .select('id, programm_key, programm_name, status, frist, notiz');
    const map: Record<string, Vorhaben> = {};
    ((data as Vorhaben[]) ?? []).forEach((v) => { map[v.programm_key] = v; });
    setVorhaben(map);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      await laden_();
      setLaden(false);
    })();
  }, [laden_]);

  function toggle<T>(set: Set<T>, wert: T, setter: (s: Set<T>) => void) {
    const n = new Set(set); n.has(wert) ? n.delete(wert) : n.add(wert); setter(n);
  }

  // Matching
  const treffer = useMemo(() => {
    const list = FOERDER_PROGRAMME.map((p) => {
      const katTreffer = kats.size === 0 ? 0 : [...kats].filter((k) => p.kategorien.includes(k)).length;
      return { p, katTreffer };
    }).filter(({ p, katTreffer }) => {
      if (kats.size > 0 && katTreffer === 0) return false;
      if (phase !== 'beide' && p.phase !== 'beide' && p.phase !== phase) return false;
      if (arten.size > 0 && !p.art.some((a) => arten.has(a))) return false;
      return true;
    });
    // beste Übereinstimmung zuerst, dann Bund vor Land
    list.sort((a, b) => (b.katTreffer - a.katTreffer) || (a.p.ebene === b.p.ebene ? 0 : a.p.ebene === 'bund' ? -1 : 1));
    return list.map((x) => x.p);
  }, [kats, arten, phase]);

  async function verfolgen(p: FoerderProgramm) {
    if (!uid) return;
    setBusy(p.key); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('foerder_vorhaben')
        .insert({ owner_user_id: uid, programm_key: p.key, programm_name: p.name, status: 'interessiert' })
        .select('id, programm_key, programm_name, status, frist, notiz').single();
      if (error) { await laden_(); setFehler('Steht bereits auf Ihrer Merkliste.'); return; }
      setVorhaben((m) => ({ ...m, [p.key]: data as Vorhaben }));
      setOk(`„${p.name}" auf die Merkliste gesetzt.`);
    } finally { setBusy(null); }
  }

  async function aktualisieren(v: Vorhaben, felder: Partial<Vorhaben>) {
    setBusy(v.programm_key); setFehler(null);
    try {
      const { error } = await supabase.from('foerder_vorhaben')
        .update({ ...felder, aktualisiert_am: new Date().toISOString() }).eq('id', v.id);
      if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
      setVorhaben((m) => ({ ...m, [v.programm_key]: { ...v, ...felder } }));
    } finally { setBusy(null); }
  }

  async function entfernen(v: Vorhaben) {
    setBusy(v.programm_key);
    try {
      const { error } = await supabase.from('foerder_vorhaben').delete().eq('id', v.id);
      if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
      setVorhaben((m) => { const n = { ...m }; delete n[v.programm_key]; return n; });
    } finally { setBusy(null); }
  }

  const meineListe = Object.values(vorhaben);
  const landHinweis = bundesland && treffer.some((p) => p.ebene === 'land');

  return (
    <div style={styles.page}>
      <div style={styles.head}>
        <div>
          <h1 style={styles.h1}>💰 Fördermittel-Assistent</h1>
          <p style={styles.sub}>
            Beantworten Sie kurz, was Sie vorhaben — ARGONAUT zeigt die passenden, <strong>aktuell aktiven</strong>{' '}
            Förderprogramme (Bund &amp; Land), die Sie auf eine Merkliste setzen und mit Fristen verfolgen können.
          </p>
        </div>
        <div style={styles.stand}>Katalog-Stand<br /><strong style={{ color: C.gold }}>{FOERDER_STAND}</strong></div>
      </div>

      {/* --- Fragebogen --- */}
      <div style={styles.card}>
        <div style={styles.frageTitel}>1 · Was möchten Sie fördern lassen?</div>
        <div style={styles.chips}>
          {KATEGORIEN.map((k) => (
            <button key={k} type="button" onClick={() => toggle(kats, k, setKats)}
              style={{ ...styles.chip, ...(kats.has(k) ? styles.chipAn : {}) }}>{KATEGORIE_LABEL[k]}</button>
          ))}
        </div>

        <div style={styles.frageTitel}>2 · In welcher Phase ist Ihr Betrieb?</div>
        <div style={styles.chips}>
          {([['beide', 'Egal'], ['gruendung', '🚀 Gründung / jung'], ['bestand', '🏢 Bestehender Betrieb']] as [FoerderPhase, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPhase(k)}
              style={{ ...styles.chip, ...(phase === k ? styles.chipAn : {}) }}>{l}</button>
          ))}
        </div>

        <div style={styles.frageTitel}>3 · Bevorzugte Förderart <span style={{ color: C.textDim, fontWeight: 400 }}>(optional)</span></div>
        <div style={styles.chips}>
          {ARTEN.map((a) => (
            <button key={a} type="button" onClick={() => toggle(arten, a, setArten)}
              style={{ ...styles.chip, ...(arten.has(a) ? styles.chipAn : {}) }}>{ART_LABEL[a]}</button>
          ))}
        </div>

        <div style={styles.frageTitel}>4 · Bundesland <span style={{ color: C.textDim, fontWeight: 400 }}>(für Landesprogramme)</span></div>
        <select style={styles.select} value={bundesland} onChange={(e) => setBundesland(e.target.value)}>
          <option value="">— bitte wählen —</option>
          {BUNDESLAENDER.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* --- Treffer --- */}
      <h2 style={styles.h2}>Passende Programme <span style={{ color: C.textDim, fontWeight: 400 }}>({treffer.length})</span></h2>
      {landHinweis && (
        <div style={styles.infobox}>
          💡 Landesprogramme (z. B. Digitalbonus, Bürgschaftsbank) unterscheiden sich je Bundesland und sind teils zeitweise
          pausiert. Für <strong>{bundesland}</strong> prüfen Sie die aktuellen Konditionen am besten direkt in der{' '}
          <a href="https://www.foerderdatenbank.de/" target="_blank" rel="noreferrer" style={styles.link}>Förderdatenbank des Bundes</a>.
        </div>
      )}

      {laden ? (
        <p style={styles.sub}>Lädt …</p>
      ) : treffer.length === 0 ? (
        <p style={styles.sub}>Keine Programme zu dieser Auswahl. Wählen Sie oben weniger Filter.</p>
      ) : (
        <div style={styles.grid}>
          {treffer.map((p) => {
            const schon = vorhaben[p.key];
            return (
              <div key={p.key} style={styles.prog}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.25 }}>{p.name}</div>
                  <span style={{ ...styles.tag, color: p.ebene === 'bund' ? C.gold : C.cyan, borderColor: p.ebene === 'bund' ? C.gold : C.cyan }}>
                    {p.ebene === 'bund' ? 'Bund' : 'Land'}
                  </span>
                </div>
                <div style={styles.traeger}>{p.traeger}</div>
                <p style={styles.kurz}>{p.kurz}</p>
                <div style={styles.zeile}><span style={styles.feldLabel}>Für wen</span> {p.wer}</div>
                <div style={styles.zeile}><span style={styles.feldLabel}>Höhe</span> {p.hoehe}</div>
                <div style={styles.artRow}>
                  {p.art.map((a) => <span key={a} style={styles.artBadge}>{ART_LABEL[a]}</span>)}
                </div>
                <div style={styles.progFuss}>
                  <a href={p.link} target="_blank" rel="noreferrer" style={styles.link}>Zum Programm ↗</a>
                  {schon ? (
                    <span style={{ ...styles.tag, color: statusInfo(schon.status).farbe, borderColor: statusInfo(schon.status).farbe }}>
                      ✓ auf Merkliste
                    </span>
                  ) : (
                    <button style={{ ...styles.btnGold, opacity: busy === p.key ? 0.6 : 1 }} disabled={busy === p.key} onClick={() => verfolgen(p)}>
                      ＋ Verfolgen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- Meine Vorhaben --- */}
      <h2 style={{ ...styles.h2, marginTop: 34 }}>📌 Meine Vorhaben <span style={{ color: C.textDim, fontWeight: 400 }}>({meineListe.length})</span></h2>
      {meineListe.length === 0 ? (
        <p style={styles.sub}>Noch nichts auf der Merkliste. Setzen Sie oben interessante Programme mit „＋ Verfolgen" hierher.</p>
      ) : (
        <div style={styles.liste}>
          {meineListe.map((v) => {
            const amp = fristAmpel(v.frist);
            const si = statusInfo(v.status);
            return (
              <div key={v.id} style={styles.vh}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700 }}>{v.programm_name}</div>
                  {amp && <span style={{ ...styles.tag, color: amp.farbe, borderColor: amp.farbe }}>⏰ {amp.txt}</span>}
                </div>
                <div style={styles.vhRow}>
                  <label style={styles.miniLabel}>Status
                    <select style={styles.miniSelect} value={v.status} onChange={(e) => aktualisieren(v, { status: e.target.value })}>
                      {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </label>
                  <label style={styles.miniLabel}>Frist
                    <input type="date" style={styles.miniSelect} value={v.frist ?? ''} onChange={(e) => aktualisieren(v, { frist: e.target.value || null })} />
                  </label>
                  <span style={{ ...styles.tag, color: si.farbe, borderColor: si.farbe, alignSelf: 'flex-end' }}>{si.label}</span>
                </div>
                <textarea style={styles.notiz} placeholder="Notiz (z. B. Ansprechpartner, Aktenzeichen, nächster Schritt) …"
                  defaultValue={v.notiz ?? ''} onBlur={(e) => { if ((e.target.value || '') !== (v.notiz || '')) aktualisieren(v, { notiz: e.target.value || null }); }} />
                <div style={{ textAlign: 'right' }}>
                  <button style={styles.btnGhost} disabled={busy === v.programm_key} onClick={() => entfernen(v)}>🗑 Entfernen</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={styles.disclaimer}>
        Hinweis: Förderquoten, Höchstbeträge und Fristen ändern sich. Dieser Assistent gibt eine verlässliche Orientierung —
        die verbindlichen Bedingungen stehen immer beim jeweiligen Träger (Link je Programm). ARGONAUT ersetzt keine
        Fördermittelberatung. Stand des Katalogs: {FOERDER_STAND}.
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  head: { display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 20, fontWeight: 700, margin: '26px 0 12px' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 720 },
  stand: { textAlign: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '10px 18px', fontSize: 12, color: C.textDim, whiteSpace: 'nowrap' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 18 },
  frageTitel: { fontWeight: 700, fontSize: 15, margin: '14px 0 10px' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '8px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  chipAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  select: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 260 },
  infobox: { background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', fontSize: 14, lineHeight: 1.55, marginBottom: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 },
  prog: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 },
  traeger: { color: C.gold, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' },
  kurz: { margin: '2px 0 6px', fontSize: 14.5, lineHeight: 1.5 },
  zeile: { fontSize: 13.5, color: C.text, lineHeight: 1.5 },
  feldLabel: { color: C.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 6 },
  artRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  artBadge: { fontSize: 11.5, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '3px 8px' },
  progFuss: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 12, flexWrap: 'wrap' },
  tag: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  link: { color: C.gold, textDecoration: 'none', fontWeight: 700, fontSize: 14 },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  liste: { display: 'flex', flexDirection: 'column', gap: 12 },
  vh: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  vhRow: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' },
  miniLabel: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  miniSelect: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' },
  notiz: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', minHeight: 54, resize: 'vertical' },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 14 },
  disclaimer: { marginTop: 28, padding: '14px 16px', background: 'rgba(143,163,190,0.06)', border: `1px solid ${C.border}`, borderRadius: 12, color: C.textDim, fontSize: 12.5, lineHeight: 1.6 },
};
