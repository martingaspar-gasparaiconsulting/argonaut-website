'use client';

// ============================================================
// ARGONAUT OS · W3 · Website-Bauer · Vorschau „So könnte Ihre Seite aussehen"
// Lädt den CI-Speicher, baut je nach ZWECK eine fertige Vorlage und zeigt sie
// als echte Webseite in einem <iframe> — umschaltbar für Desktop/Tablet/Handy.
// Die drei Bau-Wege (KI komplett · KI + Editor · selbst) docken hier in W4/W5 an.
// Pfad: app/dashboard/webseiten/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { seiteHtml, type CiWeb } from '@/lib/webBloecke';
import { baueVorlage, ZWECKE } from '@/lib/webVorlagen';

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

const WEGE: { key: string; icon: string; name: string; text: string }[] = [
  { key: 'ki', icon: '✨', name: 'Komplett mit KI', text: 'Die KI baut alles fertig — Sie schauen nur noch drüber.' },
  { key: 'ki-editor', icon: '🎛️', name: 'KI + selbst justieren', text: 'Die KI macht den Vorschlag, Sie passen Farben, Texte und Reihenfolge an.' },
  { key: 'selbst', icon: '🧱', name: 'Komplett selbst', text: 'Von null mit unserem Baustein-Katalog — volle Freiheit.' },
];

export default function WebseitenPage() {
  const [ci, setCi] = useState<CiWeb | null>(null);
  const [laden, setLaden] = useState(true);
  const [zweck, setZweck] = useState('webseite');
  const [geraet, setGeraet] = useState('desktop');

  const ladeCi = useCallback(async (userId: string) => {
    const { data } = await supabase.from('web_ci').select('*').eq('owner_user_id', userId).maybeSingle();
    setCi((data as CiWeb) ?? null);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (id) await ladeCi(id);
      setLaden(false);
    })();
  }, [ladeCi]);

  const html = useMemo(() => {
    if (!ci) return '';
    const jahr = new Date().getFullYear();
    return seiteHtml(baueVorlage(ci, zweck), ci, jahr);
  }, [ci, zweck]);

  const breite = GERAETE.find((g) => g.key === geraet)?.breite ?? null;
  const zweckInfo = ZWECKE.find((z) => z.key === zweck);
  const hatFirma = !!(ci && (ci.firma ?? '').trim());

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🖥️ Website-Bauer</h1>
      <p style={styles.sub}>
        Aus Ihrem Firmen-Auftritt entsteht in Sekunden eine fertige Seite. Wählen Sie den Zweck — die Vorschau baut
        sich sofort neu. Impressum, Datenschutz und AGB sitzen automatisch im Fuß.
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
          {/* Zweck-Auswahl */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>1 · Wofür ist die Seite?</div>
            <div style={styles.tabRow}>
              {ZWECKE.map((zk) => (
                <button key={zk.key} onClick={() => setZweck(zk.key)} style={zweck === zk.key ? styles.tabAktiv : styles.tab}>{zk.label}</button>
              ))}
            </div>
            {zweckInfo && <p style={styles.mini}>{zweckInfo.beschreibung}</p>}
          </div>

          {/* Vorschau */}
          <div style={styles.card}>
            <div style={styles.vorschauKopf}>
              <div style={styles.cardTitel}>2 · Vorschau</div>
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

          {/* Die drei Wege (docken in W4/W5 an) */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>3 · So bauen Sie weiter</div>
            <div style={styles.wegeGrid}>
              {WEGE.map((w) => (
                <div key={w.key} style={styles.weg}>
                  <div style={styles.wegIcon}>{w.icon}</div>
                  <div style={styles.wegName}>{w.name}</div>
                  <div style={styles.wegText}>{w.text}</div>
                  <div style={styles.bald}>folgt im nächsten Schritt</div>
                </div>
              ))}
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
  sub: { color: C.textDim, fontSize: FS.text, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 760 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  cardTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: FS.titel },
  mini: { fontSize: FS.klein, color: C.textDim, margin: 0, lineHeight: 1.5 },

  tabRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  tab: { background: C.navy, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 15px', fontSize: FS.klein, fontWeight: 700, cursor: 'pointer' },
  tabAktiv: { background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 8, padding: '8px 15px', fontSize: FS.klein, fontWeight: 700, cursor: 'pointer' },

  vorschauKopf: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  rahmen: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, overflow: 'hidden' },
  iframe: { width: '100%', height: 620, border: '1px solid rgba(143,163,190,0.25)', borderRadius: 8, background: '#fff', display: 'block' },

  wegeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 },
  weg: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 },
  wegIcon: { fontSize: 26 },
  wegName: { fontWeight: 800, fontSize: FS.text },
  wegText: { color: C.textDim, fontSize: FS.klein, lineHeight: 1.5 },
  bald: { marginTop: 4, alignSelf: 'flex-start', background: `${C.cyan}18`, color: C.cyan, border: `1px solid ${C.cyan}44`, borderRadius: 7, padding: '3px 9px', fontSize: FS.mini, fontWeight: 700 },

  warnBox: { marginTop: 14, fontSize: FS.text, color: C.text, background: `${C.warn}18`, border: `1px solid ${C.warn}55`, borderRadius: 12, padding: '14px 16px', lineHeight: 1.6 },
  link: { color: C.gold, fontWeight: 700 },
  hinweis: { marginTop: 14, fontSize: FS.klein, color: C.textDim, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 },
  dim: { color: C.textDim, fontSize: FS.text, marginTop: 8 },
};
