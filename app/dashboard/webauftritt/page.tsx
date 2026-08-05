'use client';

// ============================================================
// ARGONAUT OS · W1 · Webauftritt · CI-Speicher (Firmen-Gedächtnis)
// Der CHEF hinterlegt hier EINMAL alles, was seine Webseite/Funnel braucht:
// Firmenname, Claim, Kurz-Story, Kernsätze, Logo, drei Farben, Schriftwahl,
// Kontaktdaten und das Pflicht-Impressum (Impressum/Datenschutz/AGB-Fuß).
// Auf diesem Speicher setzen später alle drei Bau-Wege auf:
//   • KI baut komplett   • KI + Editor   • selbst von null
// Genau EIN Datensatz je Betrieb (upsert auf owner_user_id).
// Pfad: app/dashboard/webauftritt/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

// Schriftwahl → echte CSS-Schriftfamilie (mit sicheren Rückfällen).
const SCHRIFTEN: { key: string; label: string; stack: string }[] = [
  { key: 'modern', label: 'Modern (klar, sachlich)', stack: "'Inter','Segoe UI',system-ui,sans-serif" },
  { key: 'klassisch', label: 'Klassisch (seriös)', stack: "Georgia,'Times New Roman',serif" },
  { key: 'elegant', label: 'Elegant (edel)', stack: "'Playfair Display',Georgia,serif" },
  { key: 'freundlich', label: 'Freundlich (weich)', stack: "'Nunito','Segoe UI',sans-serif" },
  { key: 'technisch', label: 'Technisch (nüchtern)', stack: "'Roboto Mono',ui-monospace,monospace" },
  { key: 'system', label: 'System (neutral)', stack: 'system-ui,sans-serif' },
];
function schriftStack(key: string) {
  return (SCHRIFTEN.find((s) => s.key === key) ?? SCHRIFTEN[0]).stack;
}

type CI = {
  firma: string; slogan: string; ueber_uns: string; kernsaetze: string;
  logo_url: string; farbe_primaer: string; farbe_sekundaer: string; farbe_akzent: string; schrift: string;
  telefon: string; email: string; web: string; strasse: string; plz: string; ort: string; oeffnungszeiten: string;
  impressum_inhaber: string; impressum_ustid: string; impressum_register: string; impressum_aufsicht: string;
};

const LEER: CI = {
  firma: '', slogan: '', ueber_uns: '', kernsaetze: '',
  logo_url: '', farbe_primaer: '#1F3A5F', farbe_sekundaer: '#E0A24C', farbe_akzent: '#4CAF7D', schrift: 'modern',
  telefon: '', email: '', web: '', strasse: '', plz: '', ort: '', oeffnungszeiten: '',
  impressum_inhaber: '', impressum_ustid: '', impressum_register: '', impressum_aufsicht: '',
};

export default function WebauftrittPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [ci, setCi] = useState<CI>(LEER);
  const [laden, setLaden] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const ladeCi = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('web_ci')
      .select('*')
      .eq('owner_user_id', userId)
      .maybeSingle();
    if (error) { setFehler('CI konnte nicht geladen werden.'); return; }
    if (data) {
      setCi({
        firma: data.firma ?? '', slogan: data.slogan ?? '', ueber_uns: data.ueber_uns ?? '', kernsaetze: data.kernsaetze ?? '',
        logo_url: data.logo_url ?? '', farbe_primaer: data.farbe_primaer ?? LEER.farbe_primaer,
        farbe_sekundaer: data.farbe_sekundaer ?? LEER.farbe_sekundaer, farbe_akzent: data.farbe_akzent ?? LEER.farbe_akzent,
        schrift: data.schrift ?? 'modern', telefon: data.telefon ?? '', email: data.email ?? '', web: data.web ?? '',
        strasse: data.strasse ?? '', plz: data.plz ?? '', ort: data.ort ?? '', oeffnungszeiten: data.oeffnungszeiten ?? '',
        impressum_inhaber: data.impressum_inhaber ?? '', impressum_ustid: data.impressum_ustid ?? '',
        impressum_register: data.impressum_register ?? '', impressum_aufsicht: data.impressum_aufsicht ?? '',
      });
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeCi(id); setLaden(false);
    })();
  }, [ladeCi]);

  function setF<K extends keyof CI>(k: K, v: CI[K]) {
    setCi((c) => ({ ...c, [k]: v }));
    setOk(null);
  }

  async function speichern() {
    setOk(null); setFehler(null);
    if (!uid) { setFehler('Nicht angemeldet.'); return; }
    if (!ci.firma.trim()) { setFehler('Bitte mindestens den Firmennamen angeben.'); return; }
    setSpeichert(true);

    const werte = {
      owner_user_id: uid,
      firma: ci.firma.trim(),
      slogan: ci.slogan.trim() || null,
      ueber_uns: ci.ueber_uns.trim() || null,
      kernsaetze: ci.kernsaetze.trim() || null,
      logo_url: ci.logo_url.trim() || null,
      farbe_primaer: ci.farbe_primaer, farbe_sekundaer: ci.farbe_sekundaer, farbe_akzent: ci.farbe_akzent,
      schrift: ci.schrift,
      telefon: ci.telefon.trim() || null, email: ci.email.trim() || null, web: ci.web.trim() || null,
      strasse: ci.strasse.trim() || null, plz: ci.plz.trim() || null, ort: ci.ort.trim() || null,
      oeffnungszeiten: ci.oeffnungszeiten.trim() || null,
      impressum_inhaber: ci.impressum_inhaber.trim() || null,
      impressum_ustid: ci.impressum_ustid.trim() || null,
      impressum_register: ci.impressum_register.trim() || null,
      impressum_aufsicht: ci.impressum_aufsicht.trim() || null,
      aktualisiert_am: new Date().toISOString(),
    };

    const { error } = await supabase.from('web_ci').upsert(werte, { onConflict: 'owner_user_id' });
    if (error) { setFehler('Konnte nicht gespeichert werden.'); setSpeichert(false); return; }
    setOk('Ihr Firmen-Auftritt wurde gespeichert. Darauf setzen jetzt Webseite und Funnel auf.');
    setSpeichert(false);
  }

  const stack = schriftStack(ci.schrift);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🌐 Webauftritt · Ihr Firmen-Auftritt</h1>
      <p style={styles.sub}>
        Hinterlegen Sie hier einmal alles, was Ihre Webseite und Ihre Werbe-Seiten brauchen: Look, Texte und das
        Pflicht-Impressum. Danach baut die KI auf Wunsch daraus in Sekunden eine fertige Seite — oder Sie gestalten
        selbst. Alles ist jederzeit änderbar.
      </p>

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? (
        <p style={styles.dim}>Lädt …</p>
      ) : (
        <>
          {/* Live-Vorschau des Looks */}
          <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
            <div style={{ background: ci.farbe_primaer, padding: '22px 20px', fontFamily: stack }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {ci.logo_url
                  ? <img src={ci.logo_url} alt="Logo" style={{ height: 40, width: 'auto', borderRadius: 6, background: '#fff2' }} />
                  : <div style={{ height: 40, width: 40, borderRadius: 8, background: ci.farbe_sekundaer, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: ci.farbe_primaer }}>{(ci.firma || 'A').charAt(0).toUpperCase()}</div>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ci.firma || 'Ihr Firmenname'}</div>
                  <div style={{ color: ci.farbe_sekundaer, fontSize: 14, fontWeight: 600 }}>{ci.slogan || 'Ihr Claim / Slogan erscheint hier'}</div>
                </div>
              </div>
              <button style={{ marginTop: 16, background: ci.farbe_akzent, color: ci.farbe_primaer, border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 800, fontSize: 14, cursor: 'default', fontFamily: stack }}>Jetzt anfragen →</button>
            </div>
            <div style={styles.vorschauFuss}>Live-Vorschau · so wirken Ihre Farben und Schrift zusammen</div>
          </div>

          {/* 1) Firma & Auftritt */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>1 · Firma &amp; Auftritt</div>
            <Feld label="Firmenname *" value={ci.firma} onChange={(v) => setF('firma', v)} placeholder="z. B. Elektro Bauer GmbH" />
            <Feld label="Claim / Slogan" value={ci.slogan} onChange={(v) => setF('slogan', v)} placeholder="z. B. Strom vom Meisterbetrieb aus Rosenheim" />
            <FeldArea label="Kurz-Story (Über uns)" value={ci.ueber_uns} onChange={(v) => setF('ueber_uns', v)} placeholder="2–4 Sätze: wer Sie sind, wofür Sie stehen, was Kunden von Ihnen bekommen." />
            <FeldArea label="Kernsätze / Stärken (eine je Zeile)" value={ci.kernsaetze} onChange={(v) => setF('kernsaetze', v)} placeholder={'Meisterbetrieb seit 1998\n24-Stunden-Notdienst\nFestpreis-Garantie'} />
          </div>

          {/* 2) Look */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>2 · Look &amp; Farben</div>
            <p style={styles.mini}>Frei wählbar — auch anders als Ihre Branchenfarbe. Später schlägt die KI passende Farben vor, Sie entscheiden.</p>
            <div style={styles.formGrid}>
              <FarbFeld label="Hauptfarbe" value={ci.farbe_primaer} onChange={(v) => setF('farbe_primaer', v)} />
              <FarbFeld label="Zweitfarbe" value={ci.farbe_sekundaer} onChange={(v) => setF('farbe_sekundaer', v)} />
              <FarbFeld label="Akzent (Knöpfe)" value={ci.farbe_akzent} onChange={(v) => setF('farbe_akzent', v)} />
            </div>
            <label style={styles.feld}>
              <span style={styles.feldLabel}>Schriftart</span>
              <select style={styles.input} value={ci.schrift} onChange={(e) => setF('schrift', e.target.value)}>
                {SCHRIFTEN.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <Feld label="Logo (Web-Adresse zum Bild)" value={ci.logo_url} onChange={(v) => setF('logo_url', v)} placeholder="https://…/logo.png  ·  direkter Upload folgt" />
          </div>

          {/* 3) Kontakt */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>3 · Kontakt</div>
            <div style={styles.formGrid}>
              <Feld label="Telefon" value={ci.telefon} onChange={(v) => setF('telefon', v)} placeholder="08031 123456" />
              <Feld label="E-Mail" value={ci.email} onChange={(v) => setF('email', v)} placeholder="info@elektro-bauer.de" />
              <Feld label="Wunsch-Domain" value={ci.web} onChange={(v) => setF('web', v)} placeholder="elektro-bauer.de" />
              <Feld label="Straße & Nr." value={ci.strasse} onChange={(v) => setF('strasse', v)} placeholder="Musterstraße 1" />
              <Feld label="PLZ" value={ci.plz} onChange={(v) => setF('plz', v)} placeholder="83022" />
              <Feld label="Ort" value={ci.ort} onChange={(v) => setF('ort', v)} placeholder="Rosenheim" />
            </div>
            <FeldArea label="Öffnungszeiten (optional)" value={ci.oeffnungszeiten} onChange={(v) => setF('oeffnungszeiten', v)} placeholder={'Mo–Fr 08:00–17:00\nSa nach Vereinbarung'} />
          </div>

          {/* 4) Impressum (Pflicht) */}
          <div style={styles.card}>
            <div style={styles.cardTitel}>4 · Impressum &amp; Rechtliches <span style={styles.pflicht}>Pflicht in Deutschland</span></div>
            <p style={styles.mini}>Diese Angaben stehen automatisch auf <b>jeder</b> Seite im Fuß (Impressum · Datenschutz · AGB). Genau das vergessen Laien-Baukästen — wir machen es richtig.</p>
            <Feld label="Vertretungsberechtigte(r) / Inhaber(in)" value={ci.impressum_inhaber} onChange={(v) => setF('impressum_inhaber', v)} placeholder="z. B. Max Bauer" />
            <div style={styles.formGrid}>
              <Feld label="USt-IdNr. (falls vorhanden)" value={ci.impressum_ustid} onChange={(v) => setF('impressum_ustid', v)} placeholder="DE123456789" />
              <Feld label="Handelsregister (falls eingetragen)" value={ci.impressum_register} onChange={(v) => setF('impressum_register', v)} placeholder="HRB 12345, Amtsgericht Traunstein" />
            </div>
            <Feld label="Aufsichtsbehörde / Kammer (falls zutreffend)" value={ci.impressum_aufsicht} onChange={(v) => setF('impressum_aufsicht', v)} placeholder="z. B. Handwerkskammer München" />
          </div>

          <div style={styles.saveBar}>
            <button style={{ ...styles.btnGold, opacity: speichert ? 0.6 : 1 }} disabled={speichert} onClick={speichern}>
              {speichert ? 'Speichert …' : '💾 Firmen-Auftritt speichern'}
            </button>
          </div>

          <div style={styles.hinweis}>
            ℹ️ Das ist der Grundstein. Im nächsten Schritt kommt das Seiten-Gerüst mit dem automatischen
            Impressum-Fuß — danach die drei Bau-Wege (KI komplett · KI + Editor · selbst) und die Verbindung
            zu CRM &amp; Funnel: Wer auf Ihrer Seite seine E-Mail hinterlässt, landet direkt bei Ihnen.
          </div>
        </>
      )}
    </div>
  );
}

function Feld({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={styles.feld}>
      <span style={styles.feldLabel}>{label}</span>
      <input style={styles.input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function FeldArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={styles.feld}>
      <span style={styles.feldLabel}>{label}</span>
      <textarea style={{ ...styles.input, minHeight: 84, resize: 'vertical', lineHeight: 1.5 }} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function FarbFeld({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={styles.feld}>
      <span style={styles.feldLabel}>{label}</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 44, height: 40, border: `1px solid ${C.border}`, borderRadius: 8, background: C.navy, padding: 2, cursor: 'pointer' }} />
        <input style={{ ...styles.input, flex: 1 }} value={value} placeholder="#1F3A5F" onChange={(e) => onChange(e.target.value)} />
      </div>
    </label>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 660 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  cardTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 17 },
  mini: { fontSize: 13, color: C.textDim, margin: '-4px 0 2px', lineHeight: 1.5 },
  pflicht: { background: `${C.warn}22`, color: C.warn, border: `1px solid ${C.warn}66`, borderRadius: 7, padding: '2px 8px', fontSize: 11, fontWeight: 700, marginLeft: 8, verticalAlign: 'middle' },

  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
  feld: { display: 'flex', flexDirection: 'column', gap: 5 },
  feldLabel: { fontSize: 12, color: C.textDim, fontWeight: 600 },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },

  vorschauFuss: { fontSize: 12, color: C.textDim, padding: '10px 16px', borderTop: `1px solid ${C.border}`, background: C.navy2 },

  saveBar: { display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 15, fontWeight: 800, cursor: 'pointer' },

  hinweis: { marginTop: 14, fontSize: 13, color: C.textDim, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
