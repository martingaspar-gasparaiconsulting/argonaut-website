'use client';

// ============================================================
// ARGONAUT OS · Bündel 13 · Förder-Angebot-Generator (Dashboard)
// Erstellt ein förder-taugliches Angebot (Kostenvoranschlag) für einen Kunden,
// zeigt live die Förder-Schätzung und erzeugt ein PDF über Gotenberg
// (/api/foerder-angebot-pdf). Pfad: app/dashboard/foerder-angebot/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Pos = { bezeichnung: string; netto: string };
type Angebot = { id: string; kunde_name: string | null; titel: string; positionen: { bezeichnung: string; netto: number }[]; netto_summe: number; foerderquote: number; notiz: string | null };

function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string) { return parseFloat((s || '').replace(/\./g, '').replace(',', '.')) || 0; }

// Fertige, förder-freundliche Pakete (netto). Dienen als Startpunkt.
const PAKETE: { name: string; positionen: Pos[] }[] = [
  {
    name: 'Starter (~4.500 €)',
    positionen: [
      { bezeichnung: 'ARGONAUT OS – Einrichtung & Konfiguration des Betriebssystems', netto: '1500' },
      { bezeichnung: 'Jahreslizenz ARGONAUT OS (12 Monate)', netto: '2000' },
      { bezeichnung: 'Datenmigration bestehender Kunden-/Auftragsdaten', netto: '600' },
      { bezeichnung: 'Mitarbeiter-Schulung (Grundlagen)', netto: '400' },
    ],
  },
  {
    name: 'Betrieb (~6.900 €)',
    positionen: [
      { bezeichnung: 'ARGONAUT OS – Einrichtung & Prozess-Konfiguration', netto: '2500' },
      { bezeichnung: 'Jahreslizenz ARGONAUT OS inkl. Fachmodule (12 Monate)', netto: '2900' },
      { bezeichnung: 'Datenmigration & Dokumentenübernahme', netto: '900' },
      { bezeichnung: 'Schulung Team + Administrator', netto: '600' },
    ],
  },
  {
    name: 'Komplett + IT-Sicherheit (~9.900 €)',
    positionen: [
      { bezeichnung: 'ARGONAUT OS – Einrichtung, Prozess- & Rechte-Konfiguration', netto: '3500' },
      { bezeichnung: 'Jahreslizenz ARGONAUT OS – Vollausbau (12 Monate)', netto: '3900' },
      { bezeichnung: 'IT-Sicherheit: Rollen/Rechte, revisionssichere Ablage (GoBD), DSGVO-Setup', netto: '1500' },
      { bezeichnung: 'Datenmigration, Schulung & Begleitung erste Wochen', netto: '1000' },
    ],
  },
];

const LEER_POS: Pos = { bezeichnung: '', netto: '' };

export default function FoerderAngebotPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [kontakte, setKontakte] = useState<{ id: string; name: string }[]>([]);
  const [liste, setListe] = useState<Angebot[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Formular
  const [kunde, setKunde] = useState('');
  const [titel, setTitel] = useState('ARGONAUT Einführungspaket');
  const [positionen, setPositionen] = useState<Pos[]>(PAKETE[1].positionen);
  const [quote, setQuote] = useState(50);
  const [notiz, setNotiz] = useState('');

  const laden_ = useCallback(async () => {
    const { data } = await supabase.from('foerder_angebote')
      .select('id, kunde_name, titel, positionen, netto_summe, foerderquote, notiz')
      .order('erstellt_am', { ascending: false });
    setListe((data as Angebot[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const { data: kd } = await supabase.from('kontakte').select('id, anzeigename, vorname, nachname, name, email').order('anzeigename', { ascending: true });
      setKontakte(((kd as Record<string, string>[]) ?? []).map((k) => ({
        id: k.id,
        name: (k.anzeigename || `${k.vorname || ''} ${k.nachname || ''}`.trim() || k.name || k.email || '—'),
      })));
      await laden_();
      setLaden(false);
    })();
  }, [laden_]);

  const netto = useMemo(() => positionen.reduce((s, p) => s + num(p.netto), 0), [positionen]);
  const zuschuss = useMemo(() => Math.round(netto * quote) / 100, [netto, quote]);

  function setPos(i: number, feld: keyof Pos, wert: string) {
    setPositionen((ps) => ps.map((p, k) => (k === i ? { ...p, [feld]: wert } : p)));
  }
  function posWeg(i: number) { setPositionen((ps) => ps.filter((_, k) => k !== i)); }
  function posDazu() { setPositionen((ps) => [...ps, { ...LEER_POS }]); }

  async function speichern() {
    if (!uid) return;
    if (!kunde.trim()) { setFehler('Bitte einen Kundennamen angeben.'); return; }
    if (netto <= 0) { setFehler('Bitte mindestens eine Position mit Netto-Betrag erfassen.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const posClean = positionen.filter((p) => p.bezeichnung.trim() || num(p.netto) > 0)
        .map((p) => ({ bezeichnung: p.bezeichnung.trim(), netto: num(p.netto) }));
      const { data, error } = await supabase.from('foerder_angebote')
        .insert({ owner_user_id: uid, kunde_name: kunde.trim(), titel: titel.trim() || 'ARGONAUT Einführungspaket', positionen: posClean, netto_summe: netto, foerderquote: quote, notiz: notiz.trim() || null })
        .select('id, kunde_name, titel, positionen, netto_summe, foerderquote, notiz').single();
      if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
      setListe((l) => [data as Angebot, ...l]);
      setOk('Angebot gespeichert. Sie können jetzt das PDF herunterladen.');
    } finally { setBusy(false); }
  }

  async function loeschen(id: string) {
    const { error } = await supabase.from('foerder_angebote').delete().eq('id', id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    setListe((l) => l.filter((a) => a.id !== id));
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>📝 Förder-Angebot-Generator</h1>
      <p style={styles.sub}>
        Erstellen Sie ein förder-taugliches Angebot als <strong>Investition</strong> (Einrichtung + Jahreslizenz +
        Schulung). Das PDF enthält eine passende Leistungsbeschreibung, die Förder-Schätzung und den wichtigen
        Hinweis zur Reihenfolge — ideal als Kostenvoranschlag für den Digitalbonus-Antrag des Kunden.
      </p>

      <div style={styles.card}>
        <div style={styles.row2}>
          <label style={styles.lab}>Kunde
            <input list="kontaktliste" style={styles.inp} value={kunde} onChange={(e) => setKunde(e.target.value)} placeholder="Name des Kunden / Firma" />
            <datalist id="kontaktliste">{kontakte.map((k) => <option key={k.id} value={k.name} />)}</datalist>
          </label>
          <label style={styles.lab}>Titel des Pakets
            <input style={styles.inp} value={titel} onChange={(e) => setTitel(e.target.value)} />
          </label>
        </div>

        <div style={styles.paketRow}>
          <span style={{ color: C.textDim, fontSize: 13 }}>Fertiges Paket laden:</span>
          {PAKETE.map((pk) => (
            <button key={pk.name} type="button" style={styles.paketBtn} onClick={() => setPositionen(pk.positionen.map((p) => ({ ...p })))}>{pk.name}</button>
          ))}
        </div>

        <div style={styles.posKopf}><span>Leistung</span><span style={{ textAlign: 'right' }}>Netto (€)</span><span /></div>
        {positionen.map((p, i) => (
          <div key={i} style={styles.posRow}>
            <input style={styles.inp} value={p.bezeichnung} onChange={(e) => setPos(i, 'bezeichnung', e.target.value)} placeholder="z. B. Einrichtung & Konfiguration" />
            <input style={{ ...styles.inp, textAlign: 'right' }} value={p.netto} onChange={(e) => setPos(i, 'netto', e.target.value)} placeholder="0" inputMode="decimal" />
            <button type="button" style={styles.wegBtn} onClick={() => posWeg(i)} aria-label="Position entfernen">✕</button>
          </div>
        ))}
        <button type="button" style={styles.dazuBtn} onClick={posDazu}>＋ Position hinzufügen</button>

        <div style={styles.row2}>
          <label style={styles.lab}>Angenommene Förderquote
            <select style={styles.inp} value={quote} onChange={(e) => setQuote(Number(e.target.value))}>
              <option value={30}>30 %</option>
              <option value={40}>40 %</option>
              <option value={50}>50 % (typisch Digitalbonus)</option>
              <option value={80}>80 % (typisch BAFA-Beratung)</option>
            </select>
          </label>
          <label style={styles.lab}>Anmerkung (optional)
            <input style={styles.inp} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Zielprogramm, Ansprechpartner" />
          </label>
        </div>

        {/* Live-Schätzung */}
        <div style={styles.schaetz}>
          <div><div style={styles.sk}>Netto-Kosten</div><div style={styles.sv}>{eur(netto)}</div></div>
          <div><div style={styles.sk}>Voraussichtl. Zuschuss ({quote} %)</div><div style={{ ...styles.sv, color: C.green }}>{eur(zuschuss)}</div></div>
          <div><div style={styles.sk}>Eigenanteil (netto)</div><div style={styles.sv}>{eur(netto - zuschuss)}</div></div>
        </div>

        {ok && <div style={styles.ok}>{ok}</div>}
        {fehler && <div style={styles.err}>{fehler}</div>}

        <button style={{ ...styles.speichern, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={speichern}>
          {busy ? 'Speichert …' : '💾 Angebot speichern'}
        </button>
      </div>

      <h2 style={styles.h2}>Gespeicherte Angebote <span style={{ color: C.textDim, fontWeight: 400 }}>({liste.length})</span></h2>
      {laden ? (
        <p style={styles.sub}>Lädt …</p>
      ) : liste.length === 0 ? (
        <p style={styles.sub}>Noch keine Angebote. Oben eines erstellen und speichern.</p>
      ) : (
        <div style={styles.liste}>
          {liste.map((a) => (
            <div key={a.id} style={styles.item}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{a.titel}</div>
                <div style={{ color: C.textDim, fontSize: 13 }}>
                  {a.kunde_name || '—'} · netto {eur(a.netto_summe)} · Zuschuss ~{eur(Math.round(a.netto_summe * a.foerderquote) / 100)} ({a.foerderquote} %)
                </div>
              </div>
              <div style={styles.itemBtns}>
                <a href={`/api/foerder-angebot-pdf?id=${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer" style={styles.dl}>⬇ PDF</a>
                <button style={styles.wegBtn2} onClick={() => loeschen(a.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.disclaimer}>
        Hinweis: Die Förder-Schätzung ist unverbindlich. Ob und in welcher Höhe gefördert wird, entscheidet das
        jeweilige Landesprogramm (z. B. Digitalbonus) bzw. der Zuwendungsbescheid. Der Antrag muss vor der
        Beauftragung gestellt und bewilligt sein. ARGONAUT ersetzt keine Fördermittelberatung.
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 20, fontWeight: 700, margin: '28px 0 12px' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 720 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 },
  row2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit' },
  paketRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  paketBtn: { background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 999, padding: '7px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  posKopf: { display: 'grid', gridTemplateColumns: '1fr 140px 34px', gap: 8, color: C.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 2px' },
  posRow: { display: 'grid', gridTemplateColumns: '1fr 140px 34px', gap: 8, alignItems: 'center' },
  wegBtn: { background: 'transparent', color: C.danger, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 0', fontSize: 14, cursor: 'pointer' },
  dazuBtn: { alignSelf: 'flex-start', background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  schaetz: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, background: 'rgba(76,175,125,0.07)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  sk: { color: C.textDim, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  sv: { fontSize: 18, fontWeight: 800, marginTop: 2 },
  speichern: { background: C.gold, color: C.navy, border: 'none', borderRadius: 11, padding: '13px 20px', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10 },
  item: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  itemBtns: { display: 'flex', gap: 10, alignItems: 'center' },
  dl: { color: C.gold, textDecoration: 'none', fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap' },
  wegBtn2: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 10px', fontSize: 14, cursor: 'pointer' },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  disclaimer: { marginTop: 24, padding: '14px 16px', background: 'rgba(143,163,190,0.06)', border: `1px solid ${C.border}`, borderRadius: 12, color: C.textDim, fontSize: 12.5, lineHeight: 1.6 },
};
