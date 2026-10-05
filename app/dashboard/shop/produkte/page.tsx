'use client';

// ============================================================
// ARGONAUT OS · Webshop · „Produkte in den Shop übernehmen"
// Der eine Klick: bestehende Artikel aus der Warenwirtschaft (Tabelle artikel)
// in den Onlineshop ziehen — einzeln, ganze Kategorie oder alle. Pro Produkt
// eine kurze Shop-Beschreibung + Bild (KI-Verkaufstext folgt in Kapitel 6).
// Kein Abtippen: Name/Preis/Kategorie kommen aus dem Lager. RLS-scoped.
// Paket 204 (B4): Auswahl per Häkchen, Übernahme nur mit Verkaufspreis und
// nur aktive Artikel (Rest wird mit Grund übersprungen), Filter „nur mit
// Bestand", MwSt-Satz je Artikel (19/7/0 %), Foto-Upload statt nur Adresse.
// Pfad: app/dashboard/shop/produkte/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import FilialZuordnung, { type FilialeLite } from '@/app/dashboard/_components/FilialZuordnung';
import { leseStandortCookie } from '@/lib/aktiverStandort';
import { konkreterStandort } from '@/lib/standortDaten';
import {
  planeUebernahme, uebernahmeMeldung, shopTauglich, hindernisText, hatBestand,
  SHOP_MWST_SAETZE, shopMwst,
} from '@/lib/shopUebernahme';

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
  shop_mwst?: number | null;
};

const FELDER = 'id, artikelnummer, bezeichnung, kategorie, einheit, verkaufspreis, aktiv, aktueller_bestand, im_shop, shop_beschreibung, shop_bild_url';

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
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set()); // Paket 204: Häkchen-Auswahl
  const [nurBestand, setNurBestand] = useState(false);
  const [mwstSpalte, setMwstSpalte] = useState(true);   // false, solange SQL p204 fehlt
  const [bildBusy, setBildBusy] = useState<string | null>(null);

  // Filialen (Block D · D3): Sortiment je Standort.
  const [standorte, setStandorte] = useState<FilialeLite[]>([]);
  const [zuord, setZuord] = useState<{ artikel_id: string; standort_id: string }[]>([]);
  const [aktStandort, setAktStandort] = useState<string | null>(null);

  const lade = useCallback(async () => {
    setLaden(true); setFehler(null);
    // Paket 204: shop_mwst mitlesen; fehlt die Spalte noch, ohne sie (MwSt-Wahl ausgeblendet).
    const lies = (felder: string) => supabase.from('artikel').select(felder).order('bezeichnung', { ascending: true });
    const erst = await lies(FELDER + ', shop_mwst');
    const mitMwst = !erst.error;
    setMwstSpalte(mitMwst);
    const { data, error } = mitMwst ? erst : await lies(FELDER);
    if (error) { setFehler('Artikel konnten nicht geladen werden: ' + error.message); setLaden(false); return; }
    setListe((data as unknown as Artikel[]) ?? []);
    setLaden(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      setAktStandort(konkreterStandort(leseStandortCookie()));
      // Filialen + Sortiment-Zuordnungen laden (Tabelle evtl. noch nicht migriert -> leer).
      const [{ data: st }, { data: zu }] = await Promise.all([
        supabase.from('standorte').select('id, name, ist_hauptsitz').eq('aktiv', true)
          .order('ist_hauptsitz', { ascending: false }).order('name', { ascending: true }),
        supabase.from('artikel_standorte').select('artikel_id, standort_id'),
      ]);
      setStandorte((st as FilialeLite[]) ?? []);
      setZuord((zu as { artikel_id: string; standort_id: string }[]) ?? []);
      await lade();
    })();
  }, [lade]);

  // Neue Sortiment-Zuordnung eines Artikels in den lokalen State uebernehmen.
  function setzeZuord(artikelId: string, ids: string[]) {
    setZuord((prev) => [
      ...prev.filter((z) => z.artikel_id !== artikelId),
      ...ids.map((sid) => ({ artikel_id: artikelId, standort_id: sid })),
    ]);
  }

  const kategorien = useMemo(
    () => Array.from(new Set(liste.map((a) => (a.kategorie || '').trim()).filter(Boolean))).sort(),
    [liste],
  );

  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return liste.filter((a) => {
      if (nurShop && !a.im_shop) return false;
      if (nurBestand && !hatBestand(a)) return false;
      if (katFilter && (a.kategorie || '') !== katFilter) return false;
      if (s && !(`${a.bezeichnung} ${a.artikelnummer || ''} ${a.kategorie || ''}`.toLowerCase().includes(s))) return false;
      // Fail-open-Zuschnitt: bei aktivem Standort nur Artikel ohne Zuordnung
      // (ueberall) ODER die dieser Filiale zugeordneten.
      if (aktStandort) {
        const zug = zuord.filter((z) => z.artikel_id === a.id).map((z) => z.standort_id);
        if (zug.length > 0 && !zug.includes(aktStandort)) return false;
      }
      return true;
    });
  }, [liste, suche, katFilter, nurShop, nurBestand, zuord, aktStandort]);

  const imShopAnzahl = useMemo(() => liste.filter((a) => a.im_shop).length, [liste]);

  // Ein Artikel: an/aus im Shop. Übernehmen nur, wenn er verkaufsfähig ist (Paket 204).
  async function umschalten(a: Artikel) {
    const wert = !a.im_shop;
    if (wert && !shopTauglich(a)) {
      setOk(null);
      setFehler(`„${a.bezeichnung}" kann nicht in den Shop: ${hindernisText(a)}. Bitte unter ERP → Preisliste ergänzen.`);
      return;
    }
    setListe((l) => l.map((x) => (x.id === a.id ? { ...x, im_shop: wert } : x)));
    const { error } = await supabase.from('artikel').update({ im_shop: wert }).eq('id', a.id);
    if (error) { setFehler('Konnte nicht speichern.'); setListe((l) => l.map((x) => (x.id === a.id ? { ...x, im_shop: a.im_shop } : x))); }
  }

  // Sammel-Aktion (Filter oder Häkchen-Auswahl). Übernehmen: nur verkaufsfähige
  // Artikel, der Rest wird mit Grund gemeldet (Paket 204). Entfernen: alle.
  async function sammel(wert: boolean, quelle: Artikel[]) {
    if (!quelle.length) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      if (wert) {
        const plan = planeUebernahme(quelle);
        if (plan.neu.length) {
          const { error } = await supabase.from('artikel').update({ im_shop: true }).in('id', plan.neu);
          if (error) throw error;
          setListe((l) => l.map((x) => (plan.neu.includes(x.id) ? { ...x, im_shop: true } : x)));
        }
        setOk(uebernahmeMeldung(plan));
      } else {
        const ids = quelle.filter((a) => a.im_shop).map((a) => a.id);
        if (ids.length) {
          const { error } = await supabase.from('artikel').update({ im_shop: false }).in('id', ids);
          if (error) throw error;
          setListe((l) => l.map((x) => (ids.includes(x.id) ? { ...x, im_shop: false } : x)));
        }
        setOk(`${ids.length} Artikel aus dem Shop entfernt.`);
      }
      setAuswahl(new Set());
    } catch (e) {
      setFehler('Sammel-Aktion fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }

  const ausgewaehlt = useMemo(() => liste.filter((a) => auswahl.has(a.id)), [liste, auswahl]);
  function waehle(id: string) {
    setAuswahl((alt) => { const n = new Set(alt); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  const alleSichtbarGewaehlt = gefiltert.length > 0 && gefiltert.every((a) => auswahl.has(a.id));
  function alleSichtbarWaehlen() {
    setAuswahl(alleSichtbarGewaehlt ? new Set() : new Set(gefiltert.map((a) => a.id)));
  }

  async function mwstSpeichern(a: Artikel, wert: number) {
    const vorher = a.shop_mwst;
    setListe((l) => l.map((x) => (x.id === a.id ? { ...x, shop_mwst: wert } : x)));
    const { error } = await supabase.from('artikel').update({ shop_mwst: wert }).eq('id', a.id);
    if (error) { setFehler('MwSt-Satz konnte nicht gespeichert werden.'); setListe((l) => l.map((x) => (x.id === a.id ? { ...x, shop_mwst: vorher } : x))); }
  }

  // Foto hochladen (öffentlicher Bild-Speicher, wie Landingpages) -> Adresse am Artikel.
  async function bildHochladen(a: Artikel, datei: File | null | undefined) {
    if (!datei) return;
    setBildBusy(a.id); setFehler(null); setOk(null);
    try {
      const fd = new FormData();
      fd.append('datei', datei);
      const res = await fetch('/api/marketing/lp-medien', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) { setFehler(d?.error || 'Foto-Upload fehlgeschlagen.'); return; }
      await feldSpeichern(a, 'shop_bild_url', d.url as string);
      setOk('Foto gespeichert.');
    } catch { setFehler('Foto-Upload fehlgeschlagen.'); }
    finally { setBildBusy(null); }
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
            automatisch aus Ihrer Warenwirtschaft. Kein Abtippen. Übernommen werden nur aktive Artikel mit
            Verkaufspreis — alles andere wird mit Grund übersprungen.
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
          <label style={styles.check} title="Nur Artikel mit Lagerbestand über 0 anzeigen"><input type="checkbox" checked={nurBestand} onChange={(e) => setNurBestand(e.target.checked)} /> nur mit Bestand</label>
        </div>
        <div style={styles.sammelRow}>
          {ausgewaehlt.length > 0 ? (
            <>
              <button style={{ ...styles.btnGold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => sammel(true, ausgewaehlt)}>
                ⬇ Auswahl übernehmen ({ausgewaehlt.length})
              </button>
              <button style={styles.btnGhost} disabled={busy} onClick={() => sammel(false, ausgewaehlt)}>Auswahl aus Shop entfernen</button>
              <button style={styles.btnGhost} disabled={busy} onClick={() => setAuswahl(new Set())}>Auswahl aufheben</button>
            </>
          ) : (
            <>
              <button style={{ ...styles.btnGold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => sammel(true, gefiltert)}>
                ⬇ {katFilter ? `Kategorie „${katFilter}" übernehmen` : suche || nurShop || nurBestand ? 'Gefilterte übernehmen' : 'Alle übernehmen'} ({gefiltert.length})
              </button>
              <button style={styles.btnGhost} disabled={busy} onClick={() => sammel(false, gefiltert)}>Aus Shop entfernen</button>
            </>
          )}
          <label style={styles.check} title="Alle sichtbaren Artikel an- bzw. abhaken">
            <input type="checkbox" checked={alleSichtbarGewaehlt} onChange={alleSichtbarWaehlen} /> alle sichtbaren wählen
          </label>
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
                <input
                  type="checkbox"
                  aria-label={`${a.bezeichnung} auswählen`}
                  checked={auswahl.has(a.id)}
                  onChange={() => waehle(a.id)}
                  style={{ width: 18, height: 18, accentColor: C.gold, cursor: 'pointer' }}
                />
                <button style={a.im_shop ? styles.toggleAn : styles.toggleAus} onClick={() => umschalten(a)} title={a.im_shop ? 'Im Shop — klicken zum Entfernen' : 'Nicht im Shop — klicken zum Übernehmen'}>
                  {a.im_shop ? '✓ Im Shop' : '+ Übernehmen'}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.itemName}>{a.bezeichnung}</div>
                  <div style={styles.itemMeta}>
                    {a.artikelnummer ? `#${a.artikelnummer} · ` : ''}{a.kategorie || 'ohne Kategorie'} · Bestand {a.aktueller_bestand ?? '–'} {a.einheit || ''}
                    {mwstSpalte && a.im_shop ? ` · ${shopMwst(a.shop_mwst)} % MwSt` : ''}
                  </div>
                  {!shopTauglich(a) && (
                    <div style={a.im_shop ? styles.warnZeile : styles.hinweisZeile}>
                      {a.im_shop ? '⚠ Im Shop, aber für Kunden unsichtbar: ' : 'Nicht übernehmbar: '}{hindernisText(a)}
                    </div>
                  )}
                </div>
                <div style={styles.itemPreis}>{eur(a.verkaufspreis)}</div>
                <FilialZuordnung
                  tabelle="artikel_standorte"
                  fkSpalte="artikel_id"
                  recordId={a.id}
                  ownerUserId={uid ?? ''}
                  standorte={standorte}
                  initial={zuord.filter((z) => z.artikel_id === a.id).map((z) => z.standort_id)}
                  onChange={(ids) => setzeZuord(a.id, ids)}
                />
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
                  {mwstSpalte && (
                    <>
                      <label style={styles.feldLabel}>MwSt-Satz im Shop</label>
                      <select
                        style={{ ...styles.select, maxWidth: 260 }}
                        value={shopMwst(a.shop_mwst)}
                        onChange={(e) => mwstSpeichern(a, Number(e.target.value))}
                      >
                        {SHOP_MWST_SAETZE.map((m) => (
                          <option key={m} value={m}>{m === 19 ? '19 % (Regelsatz)' : m === 7 ? '7 % (ermäßigt, z. B. Lebensmittel)' : '0 % (steuerfrei)'}</option>
                        ))}
                      </select>
                    </>
                  )}
                  <label style={styles.feldLabel}>Foto</label>
                  <div style={styles.bildRow}>
                    <label style={{ ...styles.miniBtn, opacity: bildBusy === a.id ? 0.6 : 1 }}>
                      {bildBusy === a.id ? 'Lädt hoch …' : '📷 Foto hochladen'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        style={{ display: 'none' }}
                        disabled={bildBusy === a.id}
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; bildHochladen(a, f); }}
                      />
                    </label>
                    <span style={styles.hint}>JPG, PNG, WebP oder GIF · das Foto ist auf Ihrer Webseite öffentlich sichtbar</span>
                  </div>
                  <label style={styles.feldLabel}>oder Bild-Adresse (URL)</label>
                  <div style={styles.bildRow}>
                    <input
                      style={styles.input}
                      key={a.shop_bild_url || 'leer'}
                      defaultValue={a.shop_bild_url || ''}
                      onBlur={(e) => feldSpeichern(a, 'shop_bild_url', e.target.value)}
                      placeholder="https://…"
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
  warnZeile: { color: C.warn, fontSize: 12.5, marginTop: 4, fontWeight: 700 },
  hinweisZeile: { color: C.textDim, fontSize: 12.5, marginTop: 4, fontStyle: 'italic' },
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
