'use client';

// ============================================================
// ARGONAUT OS · Marketing · Branchenverzeichnisse (Paket 206 · Stufe 3 B5)
// Bereitet aus den Firmendaten (Webauftritt) den Eintrag für die wichtigsten
// Online-Verzeichnisse vor — überall genau gleich geschrieben. Jedes Feld mit
// einem Klick kopieren, Verzeichnis öffnen, eintragen, abhaken.
// ARGONAUT trägt nicht selbst ein: jeder Eintrag braucht die Bestätigung
// des Inhabers beim Verzeichnis.
// Pfad: app/dashboard/marketing/verzeichnisse/page.tsx
// ============================================================

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
};

type Feld = { key: string; label: string; wert: string; pflicht: boolean };
type Verz = { key: string; name: string; url: string; maxBeschreibung: number; hinweis: string; beschreibung: string };
type Stand = Record<string, { eingetragen_am: string | null; link: string }>;
type Daten = {
  ok: boolean; error?: string; hatFirmendaten: boolean; speicherBereit: boolean; darfAendern: boolean;
  eintrag: { felder: Feld[]; luecken: string[]; napBlock: string };
  verzeichnisse: Verz[]; stand: Stand; fortschritt: { erledigt: number; gesamt: number };
};

function datumDe(iso: string | null): string {
  if (!iso) return '';
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

export default function VerzeichnissePage() {
  const [d, setD] = useState<Daten | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const lade = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const res = await fetch('/api/marketing/verzeichnisse');
      const j = (await res.json()) as Daten;
      if (!res.ok || !j.ok) { setFehler(j.error || 'Konnte nicht geladen werden.'); return; }
      setD(j);
      setLinks(Object.fromEntries(Object.entries(j.stand).map(([k, v]) => [k, v.link])));
    } catch { setFehler('Konnte nicht geladen werden.'); } finally { setLaden(false); }
  }, []);
  useEffect(() => { lade(); }, [lade]);

  async function kopiere(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(id);
      setTimeout(() => setKopiert((k) => (k === id ? null : k)), 1500);
    } catch { setFehler('Kopieren nicht möglich — bitte von Hand markieren.'); }
  }

  async function speichere(key: string, eingetragen: boolean) {
    setBusy(key); setFehler(null);
    try {
      const res = await fetch('/api/marketing/verzeichnisse', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, eingetragen, link: links[key] || '' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setFehler(j.error || 'Speichern fehlgeschlagen.'); return; }
      setD((alt) => (alt ? { ...alt, stand: j.stand, fortschritt: j.fortschritt } : alt));
    } catch { setFehler('Speichern fehlgeschlagen.'); } finally { setBusy(null); }
  }

  return (
    <div style={st.page}>
      <h1 style={st.h1}>📍 Branchenverzeichnisse</h1>
      <p style={st.sub}>
        Ihr Eintrag für Google, Bing, Apple und die bekannten Verzeichnisse — vorbereitet aus Ihren Firmendaten
        und überall genau gleich geschrieben. Das hilft bei Suchen wie „… in Ihrer Stadt". Feld kopieren,
        Verzeichnis öffnen, eintragen, abhaken. Die Bestätigung beim Verzeichnis (Postkarte, Anruf) machen Sie selbst.
      </p>

      {laden ? <p style={st.sub}>Lädt …</p> : fehler && !d ? <div style={st.err}>{fehler}</div> : d && (
        <>
          {fehler && <div style={st.err}>{fehler}</div>}
          {!d.hatFirmendaten || d.eintrag.luecken.length > 0 ? (
            <div style={st.warn}>
              {d.hatFirmendaten ? `Es fehlen noch: ${d.eintrag.luecken.join(', ')}.` : 'Noch keine Firmendaten hinterlegt.'}{' '}
              <a href="/dashboard/webauftritt" style={{ color: C.gold, fontWeight: 700 }}>Firmendaten im Webauftritt ergänzen →</a>
            </div>
          ) : null}

          <div style={st.karte}>
            <div style={st.kopf}>
              <h2 style={st.h2}>Ihre Angaben</h2>
              <span style={st.fort}>{d.fortschritt.erledigt} von {d.fortschritt.gesamt} Verzeichnissen eingetragen</span>
            </div>
            <div style={st.nap}>
              <div style={{ whiteSpace: 'pre-line', flex: 1 }}>{d.eintrag.napBlock || '—'}</div>
              <button style={st.btnGold} onClick={() => kopiere('nap', d.eintrag.napBlock)} disabled={!d.eintrag.napBlock}>
                {kopiert === 'nap' ? '✓ Kopiert' : 'Name, Adresse, Telefon kopieren'}
              </button>
            </div>
            <div style={st.felder}>
              {d.eintrag.felder.filter((f) => f.key !== 'beschreibung').map((f) => (
                <div key={f.key} style={st.feld}>
                  <div style={st.feldLabel}>{f.label}{f.pflicht ? ' *' : ''}</div>
                  <div style={st.feldZeile}>
                    <span style={{ flex: 1, color: f.wert ? C.text : C.textDim }}>{f.wert || 'nicht hinterlegt'}</span>
                    {f.wert && <button style={st.mini} onClick={() => kopiere(f.key, f.wert)}>{kopiert === f.key ? '✓' : 'Kopieren'}</button>}
                  </div>
                </div>
              ))}
            </div>
            <p style={st.hint}>Die Telefonnummer steht im internationalen Format (+49), die Website mit https:// — bitte überall so übernehmen.</p>
          </div>

          <div style={st.liste}>
            {d.verzeichnisse.map((v) => {
              const s = d.stand[v.key];
              const fertig = !!s?.eingetragen_am;
              return (
                <div key={v.key} style={{ ...st.karte, ...(fertig ? st.fertig : null) }}>
                  <div style={st.kopf}>
                    <h3 style={st.h3}>{fertig ? '✓ ' : ''}{v.name}</h3>
                    <a href={v.url} target="_blank" rel="noreferrer noopener" style={st.btnCyan}>Verzeichnis öffnen ↗</a>
                  </div>
                  <p style={st.hint}>{v.hinweis}</p>
                  <div style={st.feldLabel}>Beschreibung (höchstens {v.maxBeschreibung} Zeichen · {v.beschreibung.length} genutzt)</div>
                  <div style={st.feldZeile}>
                    <span style={{ flex: 1, color: v.beschreibung ? C.text : C.textDim, fontSize: 14 }}>
                      {v.beschreibung || 'Kein „Über uns"-Text hinterlegt — im Webauftritt ergänzen.'}
                    </span>
                    {v.beschreibung && <button style={st.mini} onClick={() => kopiere('b-' + v.key, v.beschreibung)}>{kopiert === 'b-' + v.key ? '✓' : 'Kopieren'}</button>}
                  </div>
                  {d.speicherBereit && d.darfAendern && (
                    <div style={st.abhaken}>
                      <input
                        style={st.input}
                        value={links[v.key] ?? ''}
                        onChange={(e) => setLinks((l) => ({ ...l, [v.key]: e.target.value }))}
                        placeholder="Link zu Ihrem Eintrag (optional), https://…"
                      />
                      <button style={fertig ? st.btnGhost : st.btnGold} disabled={busy === v.key} onClick={() => speichere(v.key, !fertig)}>
                        {busy === v.key ? '…' : fertig ? 'Haken entfernen' : '✓ Eingetragen'}
                      </button>
                      {fertig && <span style={st.hint}>seit {datumDe(s.eingetragen_am)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 980, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(24px,2.2vw,34px)', fontWeight: 800, margin: 0 },
  h2: { margin: 0, fontSize: 18 },
  h3: { margin: 0, fontSize: 16 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 760 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  fertig: { border: `1px solid ${C.green}66` },
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  fort: { color: C.gold, fontWeight: 700, fontSize: 13 },
  nap: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: C.navy, borderRadius: 10, padding: 12, fontSize: 15, lineHeight: 1.5 },
  felder: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 },
  feld: { display: 'flex', flexDirection: 'column', gap: 4 },
  feldLabel: { fontSize: 12.5, color: C.textDim, fontWeight: 700 },
  feldZeile: { display: 'flex', gap: 8, alignItems: 'center', background: C.navy, borderRadius: 9, padding: '8px 10px', fontSize: 14, minWidth: 0, overflowWrap: 'anywhere' },
  liste: { display: 'flex', flexDirection: 'column' },
  abhaken: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  input: { flex: 1, minWidth: 200, background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' },
  hint: { color: C.textDim, fontSize: 13, margin: 0 },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnCyan: { background: `${C.cyan}14`, color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' },
  mini: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  warn: { color: C.warn, background: 'rgba(224,162,76,0.1)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginTop: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginTop: 14 },
};
