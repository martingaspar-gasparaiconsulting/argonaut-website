'use client';

// ============================================================
// ARGONAUT OS · W8 · Vollbild-Editor — Gerüst (Phase 1)
// Eigener Vollbild-Tab (/webseiten-editor?seite=<slug>) mit 3 Spalten:
//   • links   — Baustein-Palette (klick fügt hinzu; Drag&Drop folgt Phase 2)
//   • Mitte   — echte Live-Leinwand (iframe, Desktop/Tablet/Handy)
//   • rechts  — Eigenschaften (bestehender SeitenEditor, voll wiederverwendet)
// Lädt + speichert web_seiten.bloecke. Farben/Schrift bleiben im Webauftritt.
// Pfad: app/webseiten-editor/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { seiteHtml, BAUSTEIN_KATALOG, type CiWeb, type Block } from '@/lib/webBloecke';
import { baueVorlage, ZWECKE } from '@/lib/webVorlagen';
import SeitenEditor, { neuerBlock } from '@/app/dashboard/webseiten/_components/SeitenEditor';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', navy3: '#0c1a2e', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const FS = { titel: 'clamp(15px, 1.3vw, 20px)', text: 'clamp(13px, 1.15vw, 17px)', klein: 'clamp(12px, 1.02vw, 15px)', mini: 'clamp(11px, 0.9vw, 14px)' };

const GERAETE: { key: string; label: string; icon: string; breite: number | null }[] = [
  { key: 'desktop', label: 'Desktop', icon: '🖥️', breite: null },
  { key: 'tablet', label: 'Tablet', icon: '📱', breite: 820 },
  { key: 'handy', label: 'Handy', icon: '📲', breite: 390 },
];

type SeitenRow = { bloecke: Block[] | null; status: string | null; oeffentlich_id: string | null };

// Editor-Modus-HTML für die Leinwand: mit Klick-Auswahl + direkt editierbaren Texten.
function baueDoc(bl: Block[], c: CiWeb): string {
  return seiteHtml({ bloecke: bl }, c, new Date().getFullYear(), { editor: true });
}

export default function VollbildEditor() {
  const [uid, setUid] = useState<string | null>(null);
  const [ci, setCi] = useState<CiWeb | null>(null);
  const [slug, setSlug] = useState('webseite');
  const [bloecke, setBloecke] = useState<Block[]>([]);
  const [status, setStatus] = useState('entwurf');
  const [oeffentlichId, setOeffentlichId] = useState<string | null>(null);

  const [geraet, setGeraet] = useState('desktop');
  const [laden, setLaden] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [gespeichert, setGespeichert] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [paletteZieht, setPaletteZieht] = useState(false);
  const [auswahl, setAuswahl] = useState<number | null>(null);
  const [docHtml, setDocHtml] = useState('');

  // Eine Seite (slug) laden — gespeicherte Bausteine oder frische Vorlage.
  const ladeSeite = useCallback(async (userId: string, s: string, ciData: CiWeb | null) => {
    const { data } = await supabase
      .from('web_seiten').select('bloecke, status, oeffentlich_id')
      .eq('owner_user_id', userId).eq('slug', s).maybeSingle();
    const row = data as SeitenRow | null;
    let neu: Block[];
    if (row && Array.isArray(row.bloecke) && row.bloecke.length > 0) {
      neu = row.bloecke;
      setStatus(row.status || 'entwurf');
      setOeffentlichId(row.oeffentlich_id || null);
    } else {
      neu = ciData ? baueVorlage(ciData, s).bloecke : [];
      setStatus('entwurf');
      setOeffentlichId(null);
    }
    setBloecke(neu);
    if (ciData) setDocHtml(baueDoc(neu, ciData));
    setAuswahl(null);
    setDirty(false);
    setGespeichert(null);
  }, []);

  useEffect(() => {
    (async () => {
      const s = (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('seite') : null) || 'webseite';
      setSlug(s);
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setUid(id);
      if (id) {
        const { data: ciData } = await supabase.from('web_ci').select('*').eq('owner_user_id', id).maybeSingle();
        const c = (ciData as CiWeb) ?? null;
        setCi(c);
        await ladeSeite(id, s, c);
      }
      setLaden(false);
    })();
  }, [ladeSeite]);

  // Vor dem Verlassen warnen, wenn ungespeicherte Änderungen offen sind.
  useEffect(() => {
    function warnen(e: BeforeUnloadEvent) { if (dirty) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', warnen);
    return () => window.removeEventListener('beforeunload', warnen);
  }, [dirty]);

  // Struktur-Änderung (Palette, Umsortieren, Panel-Felder): Leinwand neu aufbauen.
  function setBloeckeReflow(b: Block[]) {
    setBloecke(b); setDirty(true); setGespeichert(null);
    if (ci) setDocHtml(baueDoc(b, ci));
  }
  function add(typ: Block['typ']) { setBloeckeReflow([...bloecke, neuerBlock(typ)]); }

  // Nachrichten aus der Leinwand (iframe): Baustein wählen + Text direkt bearbeiten.
  useEffect(() => {
    function onNachricht(e: MessageEvent) {
      const d = e.data as { ao?: string; index?: number; feld?: string; wert?: string };
      if (!d || typeof d !== 'object') return;
      if (d.ao === 'select' && typeof d.index === 'number') {
        setAuswahl(d.index);
      } else if (d.ao === 'edit' && typeof d.index === 'number' && typeof d.feld === 'string') {
        // In-Place-Text: die Leinwand zeigt es bereits — nur die Daten nachziehen (kein Neuaufbau).
        const feld = d.feld, wert = d.wert ?? '';
        setBloecke((prev) => prev.map((b, i) => (i === d.index ? ({ ...b, [feld]: wert } as Block) : b)));
        setDirty(true); setGespeichert(null);
      }
    }
    window.addEventListener('message', onNachricht);
    return () => window.removeEventListener('message', onNachricht);
  }, []);

  async function wechsleSeite(s: string) {
    if (s === slug) return;
    if (dirty && typeof window !== 'undefined' && !window.confirm('Ungespeicherte Änderungen gehen verloren. Trotzdem wechseln?')) return;
    setSlug(s);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('seite', s);
      window.history.replaceState(null, '', url.toString());
    }
    if (uid) await ladeSeite(uid, s, ci);
  }

  async function speichern() {
    if (!uid || !ci) return;
    setFehler(null); setGespeichert(null); setSpeichert(true);
    const row = {
      owner_user_id: uid,
      titel: (ci.firma ?? 'Meine Seite').toString(),
      slug,
      zweck: slug,
      status: status === 'live' ? 'live' : 'entwurf',
      ist_startseite: slug === 'webseite',
      bloecke,
      aktualisiert_am: new Date().toISOString(),
    };
    const { error } = await supabase.from('web_seiten').upsert(row, { onConflict: 'owner_user_id,slug' });
    if (error) { setFehler('Konnte nicht gespeichert werden.'); setSpeichert(false); return; }
    setGespeichert('Gespeichert.'); setDirty(false); setSpeichert(false);
  }

  const breite = GERAETE.find((g) => g.key === geraet)?.breite ?? null;
  const hatFirma = !!(ci && (ci.firma ?? '').trim());

  // --- Zustände ohne Editor ---
  if (laden) {
    return <div style={styles.zentrum}><div style={styles.zentrumText}>Lädt …</div></div>;
  }
  if (!uid) {
    return (
      <div style={styles.zentrum}>
        <div style={styles.zentrumBox}>
          <div style={styles.zentrumTitel}>Bitte anmelden</div>
          <p style={styles.zentrumText}>Zum Bearbeiten Ihrer Website müssen Sie angemeldet sein.</p>
          <a href="/anmelden" style={styles.btnGold}>Zur Anmeldung</a>
        </div>
      </div>
    );
  }
  if (!hatFirma) {
    return (
      <div style={styles.zentrum}>
        <div style={styles.zentrumBox}>
          <div style={styles.zentrumTitel}>Zuerst den Webauftritt anlegen</div>
          <p style={styles.zentrumText}>Hinterlegen Sie Firmenname, Farben und Logo — daraus baut der Editor Ihre Seite.</p>
          <a href="/dashboard/webauftritt" style={styles.btnGold}>🌐 Zum Webauftritt</a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      {/* Kopfleiste */}
      <header style={styles.top}>
        <div style={styles.topLinks}>
          <a href="/dashboard/webseiten" style={styles.zurueck} title="Zurück zum Website-Bauer">←</a>
          <span style={styles.marke}>Vollbild-Editor</span>
          <select style={styles.seiteWahl} value={slug} onChange={(e) => wechsleSeite(e.target.value)}>
            {ZWECKE.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
          </select>
          {status === 'live'
            ? <span style={styles.liveBadge}>● Live</span>
            : <span style={styles.entwurfBadge}>Entwurf</span>}
          {dirty && <span style={styles.dirtyBadge}>• nicht gespeichert</span>}
        </div>

        <div style={styles.topRechts}>
          <div style={styles.geraeteRow}>
            {GERAETE.map((g) => (
              <button key={g.key} onClick={() => setGeraet(g.key)} style={geraet === g.key ? styles.geraetAktiv : styles.geraet} title={g.label}>{g.icon}</button>
            ))}
          </div>
          {oeffentlichId && status === 'live' && (
            <a href={`/p/${oeffentlichId}`} target="_blank" rel="noreferrer" style={styles.btnGhost}>↗ Live ansehen</a>
          )}
          {gespeichert && <span style={styles.okInline}>{gespeichert}</span>}
          <button style={{ ...styles.btnGold, opacity: speichert ? 0.6 : 1 }} disabled={speichert} onClick={speichern}>
            {speichert ? 'Speichert …' : '💾 Speichern'}
          </button>
        </div>
      </header>

      {fehler && <div style={styles.fehlerBar}>{fehler}</div>}

      {/* 3 Spalten */}
      <div style={styles.body}>
        {/* links · Palette */}
        <aside style={styles.spalteLinks}>
          <div style={styles.spalteTitel}>Bausteine</div>
          <p style={styles.spalteHinweis}>Klicken fügt an — oder in die Seite ziehen. Reihenfolge rechts per ⠿ ziehen.</p>
          <div style={styles.paletteListe}>
            {BAUSTEIN_KATALOG.map((k) => (
              <button
                key={k.typ}
                style={styles.paletteBtn}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('application/x-ao-typ', k.typ); e.dataTransfer.effectAllowed = 'copy'; setPaletteZieht(true); }}
                onDragEnd={() => setPaletteZieht(false)}
                onClick={() => add(k.typ)}
                title={k.beschreibung}
              >
                <span style={styles.paletteIcon}>{k.icon}</span>
                <span style={styles.paletteText}>
                  <span style={styles.paletteName}>{k.name}</span>
                  <span style={styles.paletteBesch}>{k.beschreibung}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Mitte · Live-Leinwand */}
        <main style={styles.spalteMitte}>
          <div style={styles.leinwandAussen}>
            <div style={styles.leinwandRahmen}>
              <div style={{ width: breite ? breite : '100%', maxWidth: '100%', height: '100%', margin: '0 auto', transition: 'width .2s' }}>
                <iframe title="Live-Vorschau" srcDoc={docHtml} style={styles.iframe} />
              </div>
            </div>
            {paletteZieht && (
              <div
                style={styles.dropOverlay}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                onDrop={(e) => {
                  e.preventDefault();
                  const typ = e.dataTransfer.getData('application/x-ao-typ');
                  if (typ) add(typ as Block['typ']);
                  setPaletteZieht(false);
                }}
              >
                <div style={styles.dropOverlayInner}>⬇ Baustein hier ablegen — wird ans Ende angefügt</div>
              </div>
            )}
          </div>
        </main>

        {/* rechts · Eigenschaften */}
        <aside style={styles.spalteRechts}>
          <div style={styles.spalteTitel}>Eigenschaften</div>
          <p style={styles.spalteHinweis}>Klicke einen Baustein auf der Seite an — der passende springt hier hoch. Überschriften &amp; Texte änderst du direkt auf der Seite.</p>
          {bloecke.length === 0
            ? <p style={styles.spalteHinweis}>Noch keine Bausteine — links einen hinzufügen.</p>
            : <SeitenEditor bloecke={bloecke} onChange={setBloeckeReflow} auswahl={auswahl} onAuswahl={setAuswahl} />}
          <p style={styles.fussHinweis}>🎨 Farben &amp; Schrift ändern Sie im <a href="/dashboard/webauftritt" style={styles.link}>Webauftritt</a> — das gilt überall.</p>
        </aside>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  app: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontSize: FS.text },

  top: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 16px', background: C.navy2, borderBottom: `1px solid ${C.border}`, flex: '0 0 auto' },
  topLinks: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  topRechts: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  zurueck: { color: C.text, textDecoration: 'none', fontSize: 20, fontWeight: 800, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 8, padding: '2px 12px', lineHeight: 1.6 },
  marke: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: FS.titel },
  seiteWahl: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 11px', fontSize: FS.klein, fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' },
  liveBadge: { color: C.green, background: `${C.green}1e`, border: `1px solid ${C.green}55`, borderRadius: 7, padding: '3px 10px', fontSize: FS.mini, fontWeight: 800 },
  entwurfBadge: { color: C.textDim, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 7, padding: '3px 10px', fontSize: FS.mini, fontWeight: 700 },
  dirtyBadge: { color: C.warn, fontSize: FS.mini, fontWeight: 700 },

  geraeteRow: { display: 'flex', gap: 4, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 9, padding: 3 },
  geraet: { background: 'transparent', color: C.textDim, border: 'none', borderRadius: 7, padding: '6px 10px', fontSize: 16, cursor: 'pointer' },
  geraetAktiv: { background: `${C.gold}22`, color: C.gold, border: 'none', borderRadius: 7, padding: '6px 10px', fontSize: 16, cursor: 'pointer' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: FS.klein, fontWeight: 800, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
  btnGhost: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 9, padding: '8px 14px', fontSize: FS.klein, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  okInline: { color: C.green, fontSize: FS.klein, fontWeight: 700 },

  fehlerBar: { background: 'rgba(224,102,102,0.12)', color: C.danger, border: `1px solid ${C.danger}55`, padding: '8px 16px', fontSize: FS.klein, flex: '0 0 auto' },

  body: { flex: '1 1 auto', display: 'flex', minHeight: 0 },
  spalteLinks: { flex: '0 0 250px', width: 250, borderRight: `1px solid ${C.border}`, background: C.navy2, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
  spalteMitte: { flex: '1 1 auto', minWidth: 0, background: C.navy3, padding: 16, display: 'flex', flexDirection: 'column' },
  spalteRechts: { flex: '0 0 430px', width: 430, borderLeft: `1px solid ${C.border}`, background: C.navy2, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 },

  spalteTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: FS.titel, color: C.text },
  spalteHinweis: { fontSize: FS.mini, color: C.textDim, margin: 0, lineHeight: 1.5 },
  fussHinweis: { fontSize: FS.mini, color: C.textDim, margin: '4px 0 0', lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: 10 },
  link: { color: C.gold, fontWeight: 700 },

  paletteListe: { display: 'flex', flexDirection: 'column', gap: 7 },
  paletteBtn: { display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 11px', cursor: 'pointer', color: C.text, font: 'inherit' },
  paletteIcon: { fontSize: 20, flex: '0 0 auto', lineHeight: 1.2 },
  paletteText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  paletteName: { fontWeight: 800, fontSize: FS.klein },
  paletteBesch: { fontSize: FS.mini, color: C.textDim, lineHeight: 1.4 },

  leinwandAussen: { position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex' },
  leinwandRahmen: { flex: '1 1 auto', minHeight: 0, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, overflow: 'auto', display: 'flex' },
  dropOverlay: { position: 'absolute', inset: 0, background: 'rgba(0,229,255,0.10)', border: `2px dashed ${C.cyan}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  dropOverlayInner: { background: C.navy2, color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 10, padding: '12px 20px', fontWeight: 800, fontSize: FS.klein, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' },
  iframe: { width: '100%', height: '100%', minHeight: 560, border: '1px solid rgba(143,163,190,0.25)', borderRadius: 8, background: '#fff', display: 'block' },

  zentrum: { position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: 20 },
  zentrumBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' },
  zentrumTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 'clamp(18px,1.8vw,26px)' },
  zentrumText: { color: C.textDim, fontSize: FS.text, margin: 0, lineHeight: 1.5 },
};
