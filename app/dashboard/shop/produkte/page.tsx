'use client';

// ============================================================
// ARGONAUT OS · Webshop · „Produkte in den Shop übernehmen"
// Der eine Klick: bestehende Artikel aus der Warenwirtschaft (Tabelle artikel)
// in den Onlineshop ziehen — einzeln, ganze Kategorie oder alle. Pro Produkt
// eine kurze Shop-Beschreibung + Bild (KI-Verkaufstext folgt in Kapitel 6).
// Kein Abtippen: Name/Preis/Kategorie kommen aus dem Lager. RLS-scoped.
// Pfad: app/dashboard/shop/produkte/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', navy3: '#0c1a2e', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Artikel = {
  id: string;
  artikelnummer: string | null;
  bezeichnung: string;
  kategorie: string | null;
  einheit: string | null;
  verkaufspreis: number | null;
  aktiv: boolean | null;
  aktueller_bestand: number | null;
  im_shop: boolean | null;
  shop_beschreibung: string | null;
  shop_bild_url: string | null;
};

function eur(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export default function ShopProduktePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [liste, setListe] = useState<Artikel[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [suche, setSuche] = useState('');
  const [katFilter, setKatFilter] = useState('');
  const [nurShop, setNurShop] = useState(false);
  const [offen, setOffen] = useState<string | null>(null); // aufgeklappter Artikel (Beschreibung/Bild)
  const [emoji, setEmoji] = useState(false);               // Emoji-Schalter je Branche (seriös/lebendig)
  const [kiBusy, setKiBusy] = useState<string | null>(null); // Artikel-ID oder 'bulk'

  const lade = useCallback(async () => {
    setLaden(true); setFehler(null);
    const { data, error } = await supabase
      .from('artikel')
      .select('id, artikelnummer, bezeichnung, kategorie, einheit, verkaufspreis, aktiv, aktueller_bestand, im_shop, shop_beschreibung, shop_bild_url')
      .order('bezeichnung', { ascending: true });
    if (error) { setFehler('Artikel konnten nicht geladen werden: ' + error.message); setLaden(false); return; }
    setListe((data as Artikel[]) ?? []);
    setLaden(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      await lade();
    })();
  }, [lade]);

  const kategorien = useMemo(
    () => Array.from(new Set(liste.map((a) => (a.kategorie || '').trim()).filter(Boolean))).sort(),
    [liste],
  );

  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return liste.filter((a) => {
      if (nurShop && !a.im_shop) return false;
      if (katFilter && (a.kategorie || '') !== katFilter) return false;
      if (s && !(`${a.bezeichnung} ${a.artikelnummer || ''} ${a.kategorie || ''}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [liste, suche, katFilter, nurShop]);

  const imShopAnzahl = useMemo(() => liste.filter((a) => a.im_shop).length, [liste]);

  // Ein Artikel: an/aus im Shop.
  async function umschalten(a: Artikel) {
    const wert = !a.im_shop;
    setListe((l) => l.map((x) => (x.id === a.id ? { ...x, im_shop: wert } : x)));
    const { error } = await supabase.from('artikel').update({ im_shop: wert }).eq('id', a.id);
    if (error) { setFehler('Konnte nicht speichern.'); setListe((l) => l.map((x) => (x.id === a.id ? { ...x, im_shop: a.im_shop } : x))); }
  }

  // Sammel-Aktion: die aktuell gefilterten Artikel in den Shop übernehmen bzw. entfernen.
  async function sammel(wert: boolean) {
    const ids = gefiltert.map((a) => a.id);
    if (!ids.length) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('artikel').update({ im_shop: wert }).in('id', ids);
      if (error) throw error;
      setListe((l) => l.map((x) => (ids.includes(x.id) ? { ...x, im_shop: wert } : x)));
      setOk(wert ? `${ids.length} Artikel in den Shop übernommen.` : `${ids.length} Artikel aus dem Shop entfernt.`);
    } catch (e) {
      setFehler('Sammel-Aktion fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }

  async function feldSpeichern(a: Artikel, feld: 'shop_beschreibung' | 'shop_bild_url', wert: string) {
    setListe((l) => l.map((x) => (x.id === a.id ? { ...x, [feld]: wert } : x)));
    await supabase.from('artikel').update({ [feld]: wert || null }).eq('id', a.id);
  }

  // KI-Verkaufstext aus den echten Artikeldaten (Emoji-Schalter je Branche).
  async function kiText(a: Artikel): Promise<string | null> {
    try {
      const res = await fetch('/api/shop-produkt-text', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bezeichnung: a.bezeichnung, kategorie: a.kategorie, verkaufspreis: a.verkaufspreis, einheit: a.einheit, emoji }),
      });
      const data = await res.json();
      if (!res.ok || !data.text) { setFehler(data?.error || 'KI-Text fehlgeschlagen.'); return null; }
      return data.text as string;
    } catch { setFehler('Verbindung zur KI fehlgeschlagen.'); return null; }
  }
  async function kiEinzeln(a: Artikel) {
    setKiBusy(a.id); setFehler(null); setOk(null);
    const t = await kiText(a);
    if (t) { setListe((l) => l.map((x) => (x.id === a.id ? { ...x, shop_beschreibung: t } : x))); await supabase.from('artikel').update({ shop_beschreibung: t }).eq('id', a.id); }
    setKiBusy(null);
  }
  async function kiKatalog() {
    const ziel = gefiltert.filter((a) => a.im_shop && !(a.shop_beschreibung || '').trim()).slice(0, 30);
    if (!ziel.length) { setOk('Alle sichtbaren Shop-Produkte haben bereits einen Text.'); return; }
    setKiBusy('bulk'); setFehler(null); setOk(null);
    let n = 0;
    for (const a of ziel) {
      const t = await kiText(a);
      if (t) { n++; setListe((l) => l.map((x) => (x.id === a.id ? { ...x, shop_beschreibung: t } : x))); await supabase.from('artikel').update({ shop_beschreibung: t }).eq('id', a.id); }
    }
    setKiBusy(null); setOk(`${n} KI-Text(e) erstellt${ziel.length > n ? `, ${ziel.length - n} fehlgeschlagen` : ''}.`);
  }

  return (
    <div style={styles.page}>
      <div style={styles.head}>
        <div>
          <h1 style={styles.h1}>🛍️ Produkte in den Shop</h1>
          <p style={styles.sub}>
            Ziehen Sie Ihr bestehendes Lager mit einem Klick in den Onlineshop — Name, Preis und Kategorie kommen
            automatisch aus Ihrer Warenwirtschaft. Kein Abtippen. Den verkaufsstarken Text schreibt später die KI.
          </p>
        </div>
        <div style={styles.kpi}><div style={styles.kpiWert}>{imShopAnzahl}</div><div style={styles.kpiLabel}>im Shop</div></div>
      </div>

      {/* Werkzeugleiste */}
      <div style={styles.card}>
        <div style={styles.werkzeug}>
          <input style={styles.input} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="🔍 Artikel suchen (Name, Nummer, Kategorie)" />
          <select style={styles.select} value={katFilter} onChange={(e) => setKatFilter(e.target.value)}>
            <option value="">Alle Kategorien</option>
            {kategorien.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <label style={styles.check}><input type="checkbox" checked={nurShop} onChange={(e) => setNurShop(e.target.checked)} /> nur im Shop</label>
        </div>
        <div style={styles.sammelRow}>
          <button style={{ ...styles.btnGold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => sammel(true)}>
            ⬇ {katFilter ? `Kategorie „${katFilter}" übernehmen` : suche || nurShop ? 'Gefilterte übernehmen' : 'Alle übernehmen'} ({gefiltert.length})
          </button>
          <button style={styles.btnGhost} disabled={busy} onClick={() => sammel(false)}>Aus Shop entfernen</button>
          <label style={styles.check} title="Verkaufstexte mit oder ohne Emojis (je nach Branche)">
            <input type="checkbox" checked={emoji} onChange={(e) => setEmoji(e.target.checked)} /> Emojis im Text
          </label>
          <button style={{ ...styles.btnKi, opacity: kiBusy ? 0.6 : 1 }} disabled={!!kiBusy} onClick={kiKatalog}>
            {kiBusy === 'bulk' ? '✨ Schreibt …' : '✨ KI-Texte (sichtbare ohne Text)'}
          </button>
          <a href="/webseiten-editor" target="_blank" rel="noreferrer" style={styles.btnCyan}>🖥️ Produkt-Baustein im Editor →</a>
        </div>
        {ok && <div style={styles.ok}>{ok}</div>}
        {fehler && <div style={styles.err}>{fehler}</div>}
      </div>

      {/* Liste */}
      {laden ? (
        <p style={styles.sub}>Lädt …</p>
      ) : gefiltert.length === 0 ? (
        <p style={styles.sub}>
          {liste.length === 0
            ? 'Noch keine Artikel in der Warenwirtschaft. Legen Sie welche unter ERP → Preisliste an oder importieren Sie eine Liste.'
            : 'Keine Artikel passen zum Filter.'}
        </p>
      ) : (
        <div style={styles.liste}>
          {gefiltert.map((a) => (
            <div key={a.id} style={{ ...styles.item, ...(a.im_shop ? styles.itemAn : null) }}>
              <div style={styles.itemKopf}>
                <button style={a.im_shop ? styles.toggleAn : styles.toggleAus} onClick={() => umschalten(a)} title={a.im_shop ? 'Im Shop — klicken zum Entfernen' : 'Nicht im Shop — klicken zum Übernehmen'}>
                  {a.im_shop ? '✓ Im Shop' : '+ Übernehmen'}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.itemName}>{a.bezeichnung}</div>
                  <div style={styles.itemMeta}>
                    {a.artikelnummer ? `#${a.artikelnummer} · ` : ''}{a.kategorie || 'ohne Kategorie'} · Bestand {a.aktueller_bestand ?? '–'} {a.einheit || ''}
                  </div>
                </div>
                <div style={styles.itemPreis}>{eur(a.verkaufspreis)}</div>
                {a.im_shop && (
                  <button style={styles.miniBtn} onClick={() => setOffen(offen === a.id ? null : a.id)}>
                    {offen === a.id ? 'Schließen' : '✎ Shop-Text & Bild'}
                  </button>
                )}
              </div>

              {a.im_shop && offen === a.id && (
                <div style={styles.detail}>
                  <div style={styles.beschKopf}>
                    <label style={styles.feldLabel}>Shop-Beschreibung</label>
                    <button style={{ ...styles.btnKiKlein, opacity: kiBusy ? 0.6 : 1 }} disabled={!!kiBusy} onClick={() => kiEinzeln(a)}>
                      {kiBusy === a.id ? '✨ …' : '✨ KI-Verkaufstext'}
                    </button>
                  </div>
                  <textarea
                    style={styles.textarea}
                    value={a.shop_beschreibung || ''}
                    onChange={(e) => setListe((l) => l.map((x) => (x.id === a.id ? { ...x, shop_beschreibung: e.target.value } : x)))}
                    onBlur={(e) => feldSpeichern(a, 'shop_beschreibung', e.target.value)}
                    placeholder="Kurzer Text, den Kunden im Shop sehen … oder ✨ KI-Verkaufstext klicken."
                  />
                  <label style={styles.feldLabel}>Bild-Adresse (URL)</label>
                  <div style={styles.bildRow}>
                    <input
                      style={styles.input}
                      defaultValue={a.shop_bild_url || ''}
                      onBlur={(e) => feldSpeichern(a, 'shop_bild_url', e.target.value)}
                      placeholder="https://… (Foto-Upload & KI-Bild folgen)"
                    />
                    {a.shop_bild_url ? <img src={a.shop_bild_url} alt="" style={styles.bildVorschau} /> : null}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 980, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  head: { display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(24px,2.2vw,34px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 720 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 20px', textAlign: 'center', minWidth: 100 },
  kpiWert: { fontSize: 30, fontWeight: 800, color: C.gold, fontFamily: 'var(--font-syne), sans-serif' },
  kpiLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  werkzeug: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  input: { flex: 1, minWidth: 200, background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' },
  select: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', fontWeight: 700 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.textDim, fontWeight: 700, whiteSpace: 'nowrap' },
  sammelRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnKi: { background: `${C.gold}18`, color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  btnKiKlein: { background: `${C.gold}14`, color: C.gold, border: `1px solid ${C.gold}55`, borderRadius: 8, padding: '5px 11px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  beschKopf: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  btnCyan: { marginLeft: 'auto', background: `${C.cyan}14`, color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' },

  liste: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 },
  item: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  itemAn: { border: `1px solid ${C.green}66`, boxShadow: `0 0 0 1px ${C.green}22` },
  itemKopf: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  toggleAn: { background: `${C.green}1e`, color: C.green, border: `1px solid ${C.green}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  toggleAus: { background: C.navy, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  itemName: { fontWeight: 700, fontSize: 15 },
  itemMeta: { color: C.textDim, fontSize: 12.5, marginTop: 2 },
  itemPreis: { fontWeight: 800, whiteSpace: 'nowrap', color: C.gold },
  miniBtn: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 8, padding: '7px 11px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  detail: { borderTop: `1px solid ${C.border}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 },
  feldLabel: { fontSize: 12.5, color: C.textDim, fontWeight: 700 },
  hint: { color: C.textDim, fontWeight: 400, fontStyle: 'italic' },
  textarea: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', minHeight: 70, resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 },
  bildRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  bildVorschau: { width: 84, height: 60, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` },

  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
};
