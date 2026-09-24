'use client';

// ============================================================
// ARGONAUT OS · AngebotSprache (G01, gemeinsam freigegeben 24.09.2026)
// Aufklapp-Feld im Angebotsformular: diktieren oder Aufmaß-Zettel
// fotografieren -> Positionsvorschlag -> „Übernehmen" legt die Positionen ins
// Formular. Gespeichert wird erst mit „Angebot erstellen", wie bisher.
// Preise nur aus Katalog oder belegter Preisliste (lib/angebotSprache.ts).
// ============================================================

import { useState, ChangeEvent, CSSProperties } from 'react';
import Diktat from './Diktat';
import { verkleinereBild } from '@/lib/bildKlein';
import { alsFormPos, type SprachPosition, type FormPos } from '@/lib/angebotSprache';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

function eur(n: number) { return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

function base64Von(blob: Blob): Promise<string> {
  return new Promise((ja, nein) => {
    const r = new FileReader();
    r.onload = () => ja(String(r.result).split(',')[1] || '');
    r.onerror = () => nein(new Error('lesen'));
    r.readAsDataURL(blob);
  });
}

export default function AngebotSprache({ onUebernehmen }: { onUebernehmen: (pos: FormPos[], titel: string) => void }) {
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState('');
  const [foto, setFoto] = useState<{ base64: string; mediaType: string; name: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vorschlag, setVorschlag] = useState<{ positionen: SprachPosition[]; titel: string; hinweise: string[] } | null>(null);

  async function fotoGewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setFehler('Bitte ein Foto wählen.'); return; }
    const klein = await verkleinereBild(f, 2000, 0.88);
    setFoto({ base64: await base64Von(klein), mediaType: klein.type || f.type, name: f.name });
  }

  async function vorschlagen() {
    setLaeuft(true); setFehler(null); setVorschlag(null);
    try {
      const r = await fetch('/api/angebot-sprache', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, ...(foto ? { base64: foto.base64, mediaType: foto.mediaType } : {}) }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) { setFehler(j?.error || 'Es konnten keine Positionen erstellt werden.'); return; }
      setVorschlag({ positionen: j.positionen || [], titel: j.titel || '', hinweise: j.hinweise || [] });
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLaeuft(false); }
  }

  function uebernehmen() {
    if (!vorschlag || vorschlag.positionen.length === 0) return;
    onUebernehmen(vorschlag.positionen.map(alsFormPos), vorschlag.titel);
    setVorschlag(null); setText(''); setFoto(null); setOffen(false);
  }

  if (!offen) {
    return <button type="button" style={s.oeffnen} onClick={() => setOffen(true)}>🎙 Per Sprache oder Foto</button>;
  }

  return (
    <div style={s.box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <b>🎙 Positionen per Sprache oder Foto</b>
        <span style={{ flex: 1 }} />
        <button type="button" style={s.mini} onClick={() => setOffen(false)}>✕</button>
      </div>
      <textarea
        style={s.feld} rows={4} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={'z. B. „Bad im Obergeschoss: 12 Quadratmeter Wandfliesen, alte Fliesen raus, Silikonfugen neu, zwei Gesellen einen Tag, Anfahrt"'}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <Diktat wert={text} onWert={setText} klein />
        <label style={s.mini}>
          📷 {foto ? foto.name.slice(0, 24) : 'Aufmaß-Foto'}
          <input type="file" accept="image/*" capture="environment" onChange={fotoGewaehlt} style={{ display: 'none' }} />
        </label>
        {foto && <button type="button" style={s.mini} onClick={() => setFoto(null)}>Foto entfernen</button>}
        <span style={{ flex: 1 }} />
        <button type="button" style={{ ...s.primaer, opacity: laeuft || (!text.trim() && !foto) ? 0.55 : 1 }} disabled={laeuft || (!text.trim() && !foto)} onClick={() => void vorschlagen()}>
          {laeuft ? '⏳ Erstelle Positionen …' : 'Positionen vorschlagen'}
        </button>
      </div>
      <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 8 }}>
        Preise kommen nur aus Ihrem Leistungskatalog oder Ihren hochgeladenen Preislisten. Wo nichts belegt ist,
        bleibt der Preis leer und rot — ARGONAUT schätzt keine Preise.
      </div>

      {fehler && <div style={{ color: C.danger, fontSize: 14, marginTop: 10 }}>{fehler}</div>}

      {vorschlag && (
        <div style={{ marginTop: 12 }}>
          {vorschlag.hinweise.length > 0 && (
            <ul style={s.hinweise}>{vorschlag.hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>
          )}
          {vorschlag.positionen.map((p, i) => (
            <div key={i} style={{ ...s.zeile, borderColor: p.quelle === 'fehlt' ? C.danger : C.border }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{String(p.menge).replace('.', ',')} {p.einheit} · {p.bezeichnung}</div>
                <div style={{ fontSize: 12.5, color: p.quelle === 'fehlt' ? C.danger : C.textDim }}>
                  {p.quelle === 'katalog' && `aus dem Leistungskatalog: ${p.herkunft || ''}`}
                  {p.quelle === 'dokument' && `aus Ihrer Preisliste: ${p.herkunft || ''}`}
                  {p.quelle === 'fehlt' && 'kein belegter Preis — bitte eintragen'}
                </div>
              </div>
              <div style={{ fontWeight: 800, color: p.einzelpreis === null ? C.danger : C.text, whiteSpace: 'nowrap' }}>
                {p.einzelpreis === null ? '— €' : eur(p.einzelpreis)} <span style={{ color: C.textDim, fontWeight: 400, fontSize: 12 }}>/ {p.einheit}</span>
              </div>
            </div>
          ))}
          {vorschlag.positionen.length > 0 && (
            <button type="button" style={{ ...s.primaer, marginTop: 10 }} onClick={uebernehmen}>
              ✓ {vorschlag.positionen.length} Position{vorschlag.positionen.length === 1 ? '' : 'en'} ins Angebot übernehmen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  oeffnen: { background: 'transparent', color: C.gold, border: `1px solid rgba(201,168,76,0.5)`, borderRadius: 8, padding: '7px 13px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 8 },
  box: { background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 12, padding: '12px 14px', margin: '12px 0' },
  feld: { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8, background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 14.5, fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical' },
  zeile: { display: 'flex', gap: 12, alignItems: 'center', border: '1px solid', borderRadius: 10, padding: '8px 12px', marginTop: 6, background: C.navy },
  hinweise: { color: C.warn, fontSize: 13, lineHeight: 1.5, margin: '0 0 6px', paddingLeft: 18 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};
