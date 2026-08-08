'use client';

// ============================================================
// ARGONAUT OS · W3/W4 · Website-Bauer
// Zeigt eine fertige Seite aus dem CI-Speicher. Zwei aktive Wege:
//   • Vorlage        — feste Baustein-Vorlage je Zweck (W3)
//   • Komplett mit KI — die KI schreibt die Texte scharf aus (W4)
// Vorschau als echte Webseite im <iframe> (Desktop/Tablet/Handy), Speichern
// in web_seiten. Der Editor (KI + selbst justieren) folgt in W5.
// Pfad: app/dashboard/webseiten/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { seiteHtml, type CiWeb, type Block } from '@/lib/webBloecke';
import { baueVorlage, ZWECKE } from '@/lib/webVorlagen';
import SeitenEditor from './_components/SeitenEditor';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const FS = {
  h1: 'clamp(26px, 2.4vw, 40px)', titel: 'clamp(17px, 1.5vw, 24px)',
  text: 'clamp(14px, 1.25vw, 20px)', klein: 'clamp(12px, 1.06vw, 17px)',
  mini: 'clamp(11px, 0.95vw, 15px)', btn: 'clamp(14px, 1.25vw, 20px)',
};

const GERAETE: { key: string; label: string; icon: string; breite: number | null }[] = [
  { key: 'desktop', label: 'Desktop', icon: '🖥️', breite: null },
  { key: 'tablet', label: 'Tablet', icon: '📱', breite: 820 },
  { key: 'handy', label: 'Handy', icon: '📲', breite: 390 },
];

type Modus = 'vorlage' | 'ki' | 'editor';

export default function WebseitenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [ci, setCi] = useState<CiWeb | null>(null);
  const [laden, setLaden] = useState(true);
  const [zweck, setZweck] = useState('webseite');
  const [geraet, setGeraet] = useState('desktop');

  const [modus, setModus] = useState<Modus>('vorlage');
  const [story, setStory] = useState('');
  const [kiBloecke, setKiBloecke] = useState<Block[] | null>(null);
  const [editBloecke, setEditBloecke] = useState<Block[] | null>(null);
  const [kiLaden, setKiLaden] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const [speichert, setSpeichert] = useState(false);
  const [gespeichert, setGespeichert] = useState<string | null>(null);
  const [liveInfo, setLiveInfo] = useState<{ oeffentlich_id: string | null; status: string } | null>(null);
  const [veroeffLaden, setVeroeffLaden] = useState(false);
  const [domain, setDomain] = useState('');
  const [domainMsg, setDomainMsg] = useState<string | null>(null);
  const [domainSpeichert, setDomainSpeichert] = useState(false);

  const ladeCi = useCallback(async (userId: string) => {
    const { data } = await supabase.from('web_ci').select('*').eq('owner_user_id', userId).maybeSingle();
    setCi((data as CiWeb) ?? null);
  }, []);

  const ladeLive = useCallback(async (userId: string, slug: string) => {
    const { data } = await supabase.from('web_seiten').select('oeffentlich_id, status, domain').eq('owner_user_id', userId).eq('slug', slug).maybeSingle();
    const d = data as { oeffentlich_id: string | null; status: string; domain: string | null } | null;
    setLiveInfo(d ? { oeffentlich_id: d.oeffentlich_id, status: d.status } : null);
    setDomain(d?.domain || '');
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setUid(id);
      if (id) await ladeCi(id);
      setLaden(false);
    })();
  }, [ladeCi]);

  useEffect(() => { if (uid) ladeLive(uid, zweck); }, [uid, zweck, ladeLive]);

  // Beim Zweck-Wechsel das KI-Ergebnis verwerfen (es gehörte zum alten Zweck).
  function waehleZweck(z: string) { setZweck(z); setKiBloecke(null); setEditBloecke(null); setMeldung(null); setGespeichert(null); if (modus === 'editor') setModus('vorlage'); }

  function editorStart() {
    if (!ci) return;
    setEditBloecke(kiBloecke ?? baueVorlage(ci, zweck).bloecke);
    setModus('editor');
    setGespeichert(null);
  }

  const aktuelleBloecke: Block[] = useMemo(() => {
    if (!ci) return [];
    if (modus === 'editor' && editBloecke) return editBloecke;
    if (modus === 'ki' && kiBloecke) return kiBloecke;
    return baueVorlage(ci, zweck).bloecke;
  }, [ci, zweck, modus, kiBloecke, editBloecke]);

  const html = useMemo(() => {
    if (!ci) return '';
    return seiteHtml({ bloecke: aktuelleBloecke }, ci, new Date().getFullYear());
  }, [ci, aktuelleBloecke]);

  async function kiBauen() {
    setFehler(null); setMeldung(null); setGespeichert(null); setKiLaden(true);
    try {
      const res = await fetch('/api/webseite-ki', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ zweck, story }),
      });
      const data = await res.json();
      if (!res.ok) { setFehler(data?.error || 'Die KI konnte die Seite nicht bauen.'); setKiLaden(false); return; }
      setKiBloecke(Array.isArray(data.bloecke) ? data.bloecke : null);
      setMeldung(data?.hinweis || 'Fertig — die KI hat Ihre Seite geschrieben. Schauen Sie in die Vorschau.');
    } catch {
      setFehler('Verbindung zur KI fehlgeschlagen. Bitte erneut versuchen.');
    }
    setKiLaden(false);
  }

  async function speichern() {
    if (!uid || !ci) return;
    setFehler(null); setGespeichert(null); setSpeichert(true);
    const row = {
      owner_user_id: uid,
      titel: (ci.firma ?? 'Meine Seite').toString(),
      slug: zweck,
      zweck,
      status: 'entwurf',
      ist_startseite: zweck === 'webseite',
      bloecke: aktuelleBloecke,
      aktualisiert_am: new Date().toISOString(),
    };
    const { error } = await supabase.from('web_seiten').upsert(row, { onConflict: 'owner_user_id,slug' });
    if (error) { setFehler('Konnte nicht gespeichert werden.'); setSpeichert(false); return; }
    setGespeichert('Seite gespeichert.');
    setSpeichert(false);
    await ladeLive(uid, zweck);
  }

  async function setzeLive(live: boolean) {
    if (!uid || !ci) return;
    setFehler(null); setVeroeffLaden(true);
    await speichern(); // aktuelle Bausteine sichern (Zeile anlegen, falls nötig)
    try {
      const res = await fetch('/api/webseite-veroeffentlichen', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: zweck, live }),
      });
      const data = await res.json();
      if (!res.ok) { setFehler(data?.error || 'Konnte nicht veröffentlichen.'); setVeroeffLaden(false); return; }
      setLiveInfo({ oeffentlich_id: data.oeffentlich_id, status: data.status });
    } catch {
      setFehler('Verbindung fehlgeschlagen. Bitte erneut versuchen.');
    }
    setVeroeffLaden(false);
  }

  async function domainSpeichern() {
    if (!uid) return;
    setDomainMsg(null); setDomainSpeichert(true);
    const norm = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    await speichern(); // Zeile sicherstellen
    const { error } = await supabase.from('web_seiten')
      .update({ domain: norm || null, aktualisiert_am: new Date().toISOString() })
      .eq('owner_user_id', uid).eq('slug', zweck);
    if (error) {
      setDomainMsg(error.code === '23505' ? 'Diese Domain ist bereits mit einer anderen Seite verbunden.' : 'Konnte die Domain nicht speichern.');
      setDomainSpeichert(false); return;
    }
    setDomain(norm);
    setDomainMsg(norm ? 'Domain gespeichert. Jetzt die DNS-Einträge setzen und die Domain im Hoster hinterlegen.' : 'Domain entfernt.');
    setDomainSpeichert(false);
  }

  const breite = GERAETE.find((g) => g.key === geraet)?.breite ?? null;
  const zweckInfo = ZWECKE.find((z) => z.key === zweck);
  const hatFirma = !!(ci && (ci.firma ?? '').trim());

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🖥️ Website-Bauer</h1>
      <p style={styles.sub}>
        Aus Ihrem Firmen-Auftritt entsteht in Sekunden eine fertige Seite. Wählen Sie den Zweck, lassen Sie die KI
        die Texte schreiben — oder nehmen Sie die Vorlage. Impressum, Datenschutz und AGB sitzen automatisch im Fuß.
      </p>

      {laden ? (
        <p style={styles.dim}>Lädt …</p>
      ) : !hatFirma ? (
        <div style={styles.warnBox}>
          Bitte zuerst unter <a href="/dashboard/webauftritt" style={styles.link}>🌐 Webauftritt</a> Ihren Firmennamen
          und Look hinterlegen. Daraus baut der Website-Bauer Ihre Seite.
        </div>
      ) : (
        <>
          {/* 1 · Zweck */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>1 · Wofür ist die Seite?</div>
            <div style={styles.tabRow}>
              {ZWECKE.map((zk) => (
                <button key={zk.key} onClick={() => waehleZweck(zk.key)} style={zweck === zk.key ? styles.tabAktiv : styles.tab}>{zk.label}</button>
              ))}
            </div>
            {zweckInfo && <p style={styles.mini}>{zweckInfo.beschreibung}</p>}
          </div>

          {/* 2 · Bau-Weg */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>2 · Wie soll gebaut werden?</div>
            <div style={styles.wegeGrid}>
              <button onClick={() => { setModus('ki'); setGespeichert(null); }} style={{ ...styles.weg, ...(modus === 'ki' ? styles.wegAktiv : {}) }}>
                <div style={styles.wegIcon}>✨</div>
                <div style={styles.wegName}>Komplett mit KI</div>
                <div style={styles.wegText}>Die KI schreibt die Texte aus Ihren Angaben und Ihrer Story.</div>
                <div style={styles.aktivBadge}>aktiv</div>
              </button>
              <button onClick={() => { setModus('vorlage'); setGespeichert(null); }} style={{ ...styles.weg, ...(modus === 'vorlage' ? styles.wegAktiv : {}) }}>
                <div style={styles.wegIcon}>🧩</div>
                <div style={styles.wegName}>Feste Vorlage</div>
                <div style={styles.wegText}>Fertige Baustein-Vorlage je Zweck — sofort ohne KI.</div>
                <div style={styles.aktivBadge}>aktiv</div>
              </button>
              <button onClick={editorStart} style={{ ...styles.weg, ...(modus === 'editor' ? styles.wegAktiv : {}) }}>
                <div style={styles.wegIcon}>🎛️</div>
                <div style={styles.wegName}>KI + selbst justieren</div>
                <div style={styles.wegText}>Erst KI oder Vorlage, dann Texte und Reihenfolge selbst anpassen.</div>
                <div style={styles.aktivBadge}>aktiv</div>
              </button>
            </div>

            {modus === 'editor' && editBloecke && (
              <div style={styles.editPanel}>
                <div style={styles.vollbildBar}>
                  <div style={styles.feldLabel}>Bausteine bearbeiten — die Vorschau unten wandert live mit.</div>
                  <a href={`/webseiten-editor?seite=${zweck}`} target="_blank" rel="noreferrer" style={styles.vollbildBtn}>🖥️ Im Vollbild-Editor öffnen ↗</a>
                </div>
                <SeitenEditor bloecke={editBloecke} onChange={setEditBloecke} />
                <p style={styles.mini}>🎨 Farben &amp; Schrift ändern Sie im <a href="/dashboard/webauftritt" style={styles.link}>Webauftritt</a> — das gilt dann überall.</p>
              </div>
            )}

            {modus === 'ki' && (
              <div style={styles.kiPanel}>
                <label style={styles.feldLabel}>Erzählen Sie kurz, worum es geht (optional, macht es besser)</label>
                <textarea
                  style={styles.textarea}
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                  placeholder={'z. B. „Wir sind ein Elektro-Meisterbetrieb in Rosenheim, machen Neubau, Sanierung und 24-h-Notdienst. Wir wollen mehr Anfragen für Photovoltaik."'}
                />
                <div style={styles.kiBtnRow}>
                  <button style={{ ...styles.btnGold, opacity: kiLaden ? 0.6 : 1 }} disabled={kiLaden} onClick={kiBauen}>
                    {kiLaden ? 'KI schreibt …' : '✨ KI baut die Seite'}
                  </button>
                  {kiBloecke && <span style={styles.okInline}>✓ KI-Text geladen</span>}
                </div>
              </div>
            )}

            {meldung && <div style={styles.ok}>{meldung}</div>}
            {fehler && <div style={styles.err}>{fehler}</div>}
          </div>

          {/* 3 · Vorschau */}
          <div style={styles.card}>
            <div style={styles.vorschauKopf}>
              <div style={styles.cardTitel}>3 · Vorschau</div>
              <div style={styles.tabRow}>
                {GERAETE.map((g) => (
                  <button key={g.key} onClick={() => setGeraet(g.key)} style={geraet === g.key ? styles.tabAktiv : styles.tab}>{g.icon} {g.label}</button>
                ))}
              </div>
            </div>
            <div style={styles.rahmen}>
              <div style={{ width: breite ? breite : '100%', maxWidth: '100%', margin: '0 auto', transition: 'width .2s' }}>
                <iframe title="Seiten-Vorschau" srcDoc={html} style={styles.iframe} />
              </div>
            </div>
            <p style={styles.mini}>Das ist eine echte, in sich geschlossene Webseite — genau so wird sie später veröffentlicht.</p>
          </div>

          {/* 4 · Speichern */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>4 · Speichern</div>
            <p style={styles.mini}>Sichert die aktuelle Vorschau als Ihre Seite. Bearbeiten und Veröffentlichen folgen in den nächsten Schritten.</p>
            <div style={styles.saveBar}>
              <button style={{ ...styles.btnGold, opacity: speichert ? 0.6 : 1 }} disabled={speichert} onClick={speichern}>
                {speichert ? 'Speichert …' : '💾 Als meine Seite speichern'}
              </button>
              {gespeichert && <span style={styles.okInline}>{gespeichert}</span>}
            </div>
          </div>

          {/* 5 · Veröffentlichen */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>5 · Veröffentlichen</div>
            <p style={styles.mini}>Schaltet Ihre Seite live auf einer ARGONAUT-Adresse — sofort online. (Eigene Domain mit SSL folgt.)</p>
            <div style={styles.saveBar}>
              {liveInfo?.status === 'live'
                ? <button style={styles.btnGhost} disabled={veroeffLaden} onClick={() => setzeLive(false)}>{veroeffLaden ? '…' : '⏸ Offline nehmen'}</button>
                : <button style={{ ...styles.btnGold, opacity: veroeffLaden ? 0.6 : 1 }} disabled={veroeffLaden} onClick={() => setzeLive(true)}>{veroeffLaden ? 'Veröffentlicht …' : '🌐 Jetzt veröffentlichen'}</button>}
            </div>
            {liveInfo?.status === 'live' && liveInfo.oeffentlich_id && (
              <div style={styles.liveBox}>
                ✅ Live: <a href={`/p/${liveInfo.oeffentlich_id}`} target="_blank" rel="noreferrer" style={styles.link}>{(typeof window !== 'undefined' ? window.location.origin : '')}/p/{liveInfo.oeffentlich_id}</a>
              </div>
            )}
          </div>

          {/* 6 · Eigene Domain */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>6 · Eigene Domain <span style={styles.optional}>optional</span></div>
            <p style={styles.mini}>Verbinden Sie eine gekaufte Domain (z. B. meine-firma.de) — die Seite läuft dann direkt auf Ihrer Adresse mit https.</p>
            <div style={styles.saveBar}>
              <input style={styles.eingabe} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="meine-firma.de" />
              <button style={{ ...styles.btnGold, opacity: domainSpeichert ? 0.6 : 1 }} disabled={domainSpeichert} onClick={domainSpeichern}>{domainSpeichert ? '…' : 'Domain speichern'}</button>
            </div>
            {domainMsg && <div style={styles.liveBox}>{domainMsg}</div>}
            <div style={styles.dnsBox}>
              <b>So verbinden Sie die Domain (einmalig):</b>
              <div style={{ marginTop: 6 }}>1) Beim Domain-Anbieter eintragen: Root-Domain per <b>A-Record</b> auf <code style={styles.code}>76.76.21.21</code>, und <code style={styles.code}>www</code> per <b>CNAME</b> auf <code style={styles.code}>cname.vercel-dns.com</code>.</div>
              <div style={{ marginTop: 4 }}>2) Die Domain einmal im Hoster (Vercel) hinterlegen — das SSL-Zertifikat kommt dann automatisch.</div>
              <div style={{ marginTop: 4 }}>Danach ist Ihre Seite unter der eigenen Adresse erreichbar.</div>
            </div>
          </div>

          <div style={styles.hinweis}>
            ℹ️ Sobald jemand auf Ihrer Seite eine Anfrage schickt, landet der Kontakt automatisch in Ihrem CRM —
            Website und Vertrieb sind dieselbe Maschine.
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 980, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontSize: FS.text },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: FS.h1, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: FS.text, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 780 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  cardTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: FS.titel },
  mini: { fontSize: FS.klein, color: C.textDim, margin: 0, lineHeight: 1.5 },

  tabRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  tab: { background: C.navy, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 15px', fontSize: FS.klein, fontWeight: 700, cursor: 'pointer' },
  tabAktiv: { background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 8, padding: '8px 15px', fontSize: FS.klein, fontWeight: 700, cursor: 'pointer' },

  wegeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 },
  weg: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', cursor: 'pointer', color: C.text, font: 'inherit' },
  wegAktiv: { border: `1px solid ${C.gold}88`, background: `${C.gold}12`, boxShadow: `0 0 0 1px ${C.gold}44` },
  wegIcon: { fontSize: 26 },
  wegName: { fontWeight: 800, fontSize: FS.text },
  wegText: { color: C.textDim, fontSize: FS.klein, lineHeight: 1.5 },
  aktivBadge: { marginTop: 4, alignSelf: 'flex-start', background: `${C.green}1e`, color: C.green, border: `1px solid ${C.green}55`, borderRadius: 7, padding: '3px 9px', fontSize: FS.mini, fontWeight: 700 },
  bald: { marginTop: 4, alignSelf: 'flex-start', background: `${C.cyan}18`, color: C.cyan, border: `1px solid ${C.cyan}44`, borderRadius: 7, padding: '3px 9px', fontSize: FS.mini, fontWeight: 700 },

  kiPanel: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, borderTop: `1px solid ${C.border}`, paddingTop: 12 },
  editPanel: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4, borderTop: `1px solid ${C.border}`, paddingTop: 12 },
  vollbildBar: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  vollbildBtn: { background: `${C.cyan}14`, color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 9, padding: '9px 16px', fontSize: FS.klein, fontWeight: 800, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },
  feldLabel: { fontSize: FS.klein, color: C.textDim, fontWeight: 600 },
  textarea: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '11px 13px', fontSize: FS.text, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', minHeight: 92, resize: 'vertical', lineHeight: 1.5 },
  kiBtnRow: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },

  vorschauKopf: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  rahmen: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, overflow: 'hidden' },
  iframe: { width: '100%', height: 620, border: '1px solid rgba(143,163,190,0.25)', borderRadius: 8, background: '#fff', display: 'block' },

  saveBar: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: FS.btn, fontWeight: 800, cursor: 'pointer' },
  btnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 20px', fontSize: FS.klein, fontWeight: 700, cursor: 'pointer' },
  okInline: { color: C.green, fontSize: FS.klein, fontWeight: 700 },
  liveBox: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: FS.klein, wordBreak: 'break-all' },
  optional: { background: 'rgba(143,163,190,0.14)', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 7, padding: '2px 8px', fontSize: FS.mini, fontWeight: 700, marginLeft: 8, verticalAlign: 'middle' },
  eingabe: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '11px 13px', fontSize: FS.text, fontFamily: 'inherit', flex: 1, minWidth: 200, maxWidth: 360, boxSizing: 'border-box' },
  dnsBox: { fontSize: FS.klein, color: C.textDim, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 },
  code: { background: 'rgba(0,229,255,0.1)', color: C.cyan, borderRadius: 5, padding: '1px 6px', fontFamily: 'ui-monospace, monospace', fontSize: '0.92em' },

  warnBox: { marginTop: 14, fontSize: FS.text, color: C.text, background: `${C.warn}18`, border: `1px solid ${C.warn}55`, borderRadius: 12, padding: '14px 16px', lineHeight: 1.6 },
  link: { color: C.gold, fontWeight: 700 },
  hinweis: { marginTop: 14, fontSize: FS.klein, color: C.textDim, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 },
  dim: { color: C.textDim, fontSize: FS.text, marginTop: 8 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: FS.klein },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: FS.klein },
};
