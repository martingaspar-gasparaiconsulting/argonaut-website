'use client';

// ============================================================
// ARGONAUT OS · W5 · SeitenEditor — Bausteine selbst justieren
// Bearbeitet die Baustein-Liste (Block[]): Texte ändern, verschieben,
// hinzufügen, löschen. Meldet jede Änderung über onChange nach oben, damit
// die Live-Vorschau (iframe) sofort mitwandert. Farben & Schrift bleiben im
// Webauftritt (eine Quelle der Wahrheit) — von hier aus verlinkt.
// ============================================================

import { CSSProperties, useState } from 'react';
import { BAUSTEIN_KATALOG, type Block } from '@/lib/webBloecke';
import FotoPicker from './FotoPicker';

const C = {
  navy: '#0A1628', navy2: '#0F2036', navy3: '#0c1a2e', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666',
};
const FS = { titel: 'clamp(15px, 1.3vw, 20px)', text: 'clamp(14px, 1.2vw, 19px)', klein: 'clamp(12px, 1.02vw, 16px)', mini: 'clamp(11px, 0.9vw, 14px)' };

// Anzeigenamen der Bausteine (aus dem Katalog).
const NAME: Record<string, string> = Object.fromEntries(BAUSTEIN_KATALOG.map((k) => [k.typ, k.name]));

// Standard-Baustein beim Hinzufügen.
function neuerBlock(typ: Block['typ']): Block {
  switch (typ) {
    case 'hero': return { typ, eyebrow: 'Willkommen', titel: 'Überschrift', unterzeile: 'Kurzer Untertitel', knopf: 'Jetzt anfragen', bild: '' };
    case 'stats': return { typ, titel: 'Auf einen Blick', zahlen: [{ wert: '10+', label: 'Jahre' }, { wert: '500+', label: 'Kunden' }, { wert: '100%', label: 'Einsatz' }] };
    case 'leistungen': return { typ, eyebrow: 'Leistungen', titel: 'Unsere Leistungen', punkte: [{ titel: 'Leistung 1', text: 'Kurzbeschreibung.' }, { titel: 'Leistung 2', text: 'Kurzbeschreibung.' }] };
    case 'ueber': return { typ, eyebrow: 'Über uns', titel: 'Über uns', text: 'Zwei, drei Sätze über Ihren Betrieb.' };
    case 'galerie': return { typ, titel: 'Einblicke', anzahl: 3 };
    case 'testimonials': return { typ, eyebrow: 'Bewertungen', titel: 'Das sagen Kunden', stimmen: [{ text: 'Tolle Arbeit!', name: 'Zufriedener Kunde', rolle: 'Beispiel-Bewertung' }] };
    case 'faq': return { typ, eyebrow: 'FAQ', titel: 'Häufige Fragen', fragen: [{ frage: 'Frage?', antwort: 'Antwort.' }] };
    case 'kontakt': return { typ, titel: 'Kontakt', text: 'Schreiben Sie uns — wir melden uns schnell zurück.', knopf: 'Anfrage senden' };
    case 'cta': return { typ, titel: 'Bereit? Wir freuen uns auf Ihre Anfrage.', knopf: 'Jetzt anfragen' };
    default: return { typ: 'ueber', titel: 'Text', text: '' } as Block;
  }
}

export default function SeitenEditor({ bloecke, onChange }: { bloecke: Block[]; onChange: (b: Block[]) => void }) {
  // Bild-Auswahl: welcher Block, welches Ziel (Hero-Titelbild oder Galerie).
  const [picker, setPicker] = useState<{ index: number; ziel: 'hero' | 'galerie'; start: string } | null>(null);

  function setBlock(i: number, patch: Record<string, unknown>) {
    const kopie = bloecke.map((b, idx) => (idx === i ? ({ ...b, ...patch } as Block) : b));
    onChange(kopie);
  }

  function bildGewaehlt(url: string) {
    if (!picker) return;
    const b = bloecke[picker.index];
    if (picker.ziel === 'hero') setBlock(picker.index, { bild: url });
    else if (b && b.typ === 'galerie') setBlock(picker.index, { bilder: [...((b.bilder as string[]) || []), url] });
    setPicker(null);
  }
  function openPicker(index: number, ziel: 'hero' | 'galerie', start: string) { setPicker({ index, ziel, start }); }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= bloecke.length) return;
    const kopie = bloecke.slice();
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
    onChange(kopie);
  }
  function remove(i: number) { onChange(bloecke.filter((_, idx) => idx !== i)); }
  function add(typ: Block['typ']) { onChange([...bloecke, neuerBlock(typ)]); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {bloecke.map((b, i) => (
        <div key={i} style={styles.block}>
          <div style={styles.kopf}>
            <span style={styles.typName}>{NAME[b.typ] || b.typ}</span>
            <div style={styles.kopfBtns}>
              <button style={styles.miniBtn} title="Nach oben" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
              <button style={styles.miniBtn} title="Nach unten" onClick={() => move(i, 1)} disabled={i === bloecke.length - 1}>↓</button>
              <button style={styles.miniBtnDanger} title="Löschen" onClick={() => remove(i)}>✕</button>
            </div>
          </div>
          <div style={styles.felder}>{felderFuer(b, i, setBlock, openPicker)}</div>
        </div>
      ))}

      <div style={styles.addBar}>
        <span style={styles.addLabel}>Baustein hinzufügen:</span>
        {BAUSTEIN_KATALOG.map((k) => (
          <button key={k.typ} style={styles.addBtn} onClick={() => add(k.typ)}>{k.icon} {k.name}</button>
        ))}
      </div>

      {picker && <FotoPicker start={picker.start} onPick={bildGewaehlt} onClose={() => setPicker(null)} />}
    </div>
  );
}

// --- Felder je Baustein-Typ -------------------------------------------------
function felderFuer(
  b: Block,
  i: number,
  setBlock: (i: number, patch: Record<string, unknown>) => void,
  openPicker: (index: number, ziel: 'hero' | 'galerie', start: string) => void,
) {
  const T = (label: string, key: string, val: string, area = false) =>
    area
      ? <Area key={key} label={label} value={val} onChange={(v) => setBlock(i, { [key]: v })} />
      : <Feld key={key} label={label} value={val} onChange={(v) => setBlock(i, { [key]: v })} />;

  switch (b.typ) {
    case 'hero':
      return [
        T('Label (klein oben)', 'eyebrow', b.eyebrow || ''), T('Überschrift', 'titel', b.titel), T('Untertitel', 'unterzeile', b.unterzeile), T('Knopf-Text', 'knopf', b.knopf),
        <div key="bild" style={styles.bildFeld}>
          <span style={styles.feldLabel}>Titelbild</span>
          {b.bild
            ? <div style={styles.bildVorschauRow}><img src={b.bild} alt="" style={styles.bildVorschau} /><button style={styles.miniBtnDanger} onClick={() => setBlock(i, { bild: '' })}>Entfernen</button></div>
            : <span style={styles.keinBild}>Kein Bild — es erscheint der Farb-Hintergrund.</span>}
          <button style={styles.bildBtn} onClick={() => openPicker(i, 'hero', b.titel || 'business')}>🖼️ Titelbild wählen</button>
        </div>,
      ];
    case 'ueber':
      return [T('Label', 'eyebrow', b.eyebrow || ''), T('Überschrift', 'titel', b.titel), T('Text', 'text', b.text, true)];
    case 'kontakt':
      return [T('Überschrift', 'titel', b.titel), T('Text', 'text', b.text, true), T('Knopf-Text (Formular)', 'knopf', b.knopf || 'Anfrage senden')];
    case 'cta':
      return [T('Überschrift', 'titel', b.titel), T('Knopf-Text', 'knopf', b.knopf)];
    case 'galerie': {
      const bilder = (b.bilder as string[]) || [];
      return [
        T('Überschrift', 'titel', b.titel),
        <div key="bilder" style={styles.bildFeld}>
          <span style={styles.feldLabel}>Bilder</span>
          {bilder.length > 0
            ? <div style={styles.galRow}>{bilder.map((u, k) => (
                <div key={k} style={styles.galThumbWrap}>
                  <img src={u} alt="" style={styles.galThumb} />
                  <button style={styles.galRemove} title="Entfernen" onClick={() => setBlock(i, { bilder: bilder.filter((_, x) => x !== k) })}>✕</button>
                </div>
              ))}</div>
            : <span style={styles.keinBild}>Noch keine Bilder — es erscheinen graue Platzhalter.</span>}
          <button style={styles.bildBtn} onClick={() => openPicker(i, 'galerie', b.titel || 'business')}>🖼️ Bild hinzufügen</button>
        </div>,
      ];
    }
    case 'stats':
      return [
        T('Überschrift (optional)', 'titel', b.titel || ''),
        <Liste key="zahlen" titel="Zahlen" items={b.zahlen} felder={[['wert', 'Wert'], ['label', 'Label']]}
          onChange={(arr) => setBlock(i, { zahlen: arr })} leer={{ wert: '', label: '' }} />,
      ];
    case 'leistungen':
      return [
        T('Label', 'eyebrow', b.eyebrow || ''), T('Überschrift', 'titel', b.titel),
        <Liste key="punkte" titel="Leistungen" items={b.punkte} felder={[['titel', 'Titel'], ['text', 'Text']]}
          onChange={(arr) => setBlock(i, { punkte: arr })} leer={{ titel: '', text: '' }} />,
      ];
    case 'testimonials':
      return [
        T('Label', 'eyebrow', b.eyebrow || ''), T('Überschrift', 'titel', b.titel),
        <Liste key="stimmen" titel="Bewertungen (Beispiele)" items={b.stimmen} felder={[['text', 'Text'], ['name', 'Name']]}
          onChange={(arr) => setBlock(i, { stimmen: arr.map((s) => ({ ...s, rolle: 'Beispiel-Bewertung' })) })} leer={{ text: '', name: '', rolle: 'Beispiel-Bewertung' }} />,
      ];
    case 'faq':
      return [
        T('Label', 'eyebrow', b.eyebrow || ''), T('Überschrift', 'titel', b.titel),
        <Liste key="fragen" titel="Fragen" items={b.fragen} felder={[['frage', 'Frage'], ['antwort', 'Antwort']]}
          onChange={(arr) => setBlock(i, { fragen: arr })} leer={{ frage: '', antwort: '' }} />,
      ];
    default:
      return null;
  }
}

// --- kleine Bausteine -------------------------------------------------------
function Feld({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={styles.feld}>
      <span style={styles.feldLabel}>{label}</span>
      <input style={styles.input} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={styles.feld}>
      <span style={styles.feldLabel}>{label}</span>
      <textarea style={{ ...styles.input, minHeight: 68, resize: 'vertical', lineHeight: 1.5 }} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

type Row = Record<string, string>;
function Liste({ titel, items, felder, onChange, leer }: { titel: string; items: Row[]; felder: [string, string][]; onChange: (arr: Row[]) => void; leer: Row }) {
  function setRow(idx: number, key: string, v: string) { onChange(items.map((r, k) => (k === idx ? { ...r, [key]: v } : r))); }
  function del(idx: number) { onChange(items.filter((_, k) => k !== idx)); }
  function add() { onChange([...items, { ...leer }]); }
  return (
    <div style={styles.liste}>
      <div style={styles.feldLabel}>{titel}</div>
      {items.map((r, idx) => (
        <div key={idx} style={styles.listItem}>
          {felder.map(([key, lbl]) => (
            <input key={key} style={{ ...styles.input, flex: 1, minWidth: 120 }} placeholder={lbl} value={r[key] ?? ''} onChange={(e) => setRow(idx, key, e.target.value)} />
          ))}
          <button style={styles.miniBtnDanger} title="Zeile löschen" onClick={() => del(idx)}>✕</button>
        </div>
      ))}
      <button style={styles.addRow} onClick={add}>+ Zeile</button>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  block: { background: C.navy3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  kopf: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  typName: { fontWeight: 800, fontSize: FS.klein, color: C.gold },
  kopfBtns: { display: 'flex', gap: 5 },
  miniBtn: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 10px', fontSize: FS.klein, fontWeight: 700, cursor: 'pointer' },
  miniBtnDanger: { background: C.navy, color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 7, padding: '5px 10px', fontSize: FS.klein, fontWeight: 700, cursor: 'pointer' },
  felder: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 9 },
  feld: { display: 'flex', flexDirection: 'column', gap: 4 },
  feldLabel: { fontSize: FS.mini, color: C.textDim, fontWeight: 600 },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 11px', fontSize: FS.klein, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  liste: { gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 7, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 9, padding: 10 },
  listItem: { display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' },
  addRow: { alignSelf: 'flex-start', background: 'transparent', color: C.cyan, border: `1px dashed ${C.cyan}55`, borderRadius: 7, padding: '6px 12px', fontSize: FS.mini, fontWeight: 700, cursor: 'pointer' },
  addBar: { display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', background: C.navy3, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 12 },
  addLabel: { fontSize: FS.klein, color: C.textDim, fontWeight: 700, marginRight: 4 },
  addBtn: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: FS.mini, fontWeight: 700, cursor: 'pointer' },

  bildFeld: { gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 7, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 9, padding: 10 },
  keinBild: { fontSize: FS.mini, color: C.textDim },
  bildVorschauRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  bildVorschau: { width: 120, height: 72, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` },
  bildBtn: { alignSelf: 'flex-start', background: `${C.cyan}14`, color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 8, padding: '7px 13px', fontSize: FS.klein, fontWeight: 700, cursor: 'pointer' },
  galRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  galThumbWrap: { position: 'relative', width: 92, height: 62 },
  galThumb: { width: 92, height: 62, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}`, display: 'block' },
  galRemove: { position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: 999, background: C.danger, color: '#fff', border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer', lineHeight: '22px', padding: 0 },
};
