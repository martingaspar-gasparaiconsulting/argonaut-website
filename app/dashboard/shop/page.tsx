'use client';

// ============================================================
// ARGONAUT OS · Bündel 17 · Shop-/Marktplatz-Anbindung (Dashboard)
// Bestellungen sammeln: im Manuell-Modus per CSV-Import oder Handeingabe,
// mit echtem Anbieter (Shopware/Shopify/Woo) später per API (Konnektor).
// Status-Board (neu -> in Bearbeitung -> versendet).
// Pfad: app/dashboard/shop/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { nameSplit } from '@/lib/leadKontakt';
import { planeLagerabzug } from '@/lib/lagerAbzug';
import { createBrowserClient } from '@supabase/ssr';
import { anbieterVon, type IntegrationTyp } from '@/lib/konnektoren';
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../_components/EigeneFelder';
import type { EigenesFeld } from '@/lib/eigeneFelder';

const MODUL = 'shop_bestellungen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Position = { bezeichnung: string; menge: number; einzelpreis: number; mwst?: number; artikelnummer?: string };
type Bestellung = {
  id: string; quelle: string; extern_id: string | null; besteller: string | null; email: string | null;
  status: string; brutto_summe: number; positionen: Position[]; bestell_am: string | null; erstellt_am: string; rechnung_id: string | null; kontakt_id: string | null; lager_gebucht: boolean;
};

const STATUS: { key: string; label: string; farbe: string }[] = [
  { key: 'neu', label: 'Neu', farbe: C.cyan },
  { key: 'in_bearbeitung', label: 'In Bearbeitung', farbe: C.warn },
  { key: 'versendet', label: 'Versendet', farbe: C.green },
  { key: 'storniert', label: 'Storniert', farbe: C.danger },
];
function statusInfo(k: string) { return STATUS.find((s) => s.key === k) || STATUS[0]; }
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }

// CSV: Kopfzeile optional. Spalten: extern_id ; besteller ; email ; bezeichnung ; menge ; einzelpreis
// Mehrere Zeilen mit gleicher extern_id werden zu EINER Bestellung zusammengefasst.
function parseCsv(text: string): { extern_id: string; besteller: string; email: string; positionen: Position[]; brutto: number }[] {
  const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  if (!zeilen.length) return [];
  const trenner = zeilen[0].includes(';') ? ';' : ',';
  const map: Record<string, { extern_id: string; besteller: string; email: string; positionen: Position[]; brutto: number }> = {};
  let start = 0;
  const erste = zeilen[0].toLowerCase();
  if (erste.includes('bezeichnung') || erste.includes('besteller') || erste.includes('extern') || erste.includes('mwst')) start = 1;
  for (let i = start; i < zeilen.length; i++) {
    const t = zeilen[i].split(trenner).map((x) => x.trim().replace(/^"|"$/g, ''));
    const [extern_id = '', besteller = '', email = '', bezeichnung = '', menge = '1', einzelpreis = '0', mwst = '', artikelnummer = ''] = t;
    const key = extern_id || `zeile-${i}`;
    const satz = mwst.trim() ? num(mwst) : 0;
    const pos: Position = { bezeichnung: bezeichnung || 'Position', menge: num(menge) || 1, einzelpreis: num(einzelpreis), mwst: satz > 0 ? satz : undefined, artikelnummer: artikelnummer.trim() || undefined };
    if (!map[key]) map[key] = { extern_id: extern_id || '', besteller, email, positionen: [], brutto: 0 };
    map[key].positionen.push(pos);
    map[key].brutto += pos.menge * pos.einzelpreis;
    if (besteller && !map[key].besteller) map[key].besteller = besteller;
    if (email && !map[key].email) map[key].email = email;
  }
  return Object.values(map);
}

export default function ShopPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [liste, setListe] = useState<Bestellung[]>([]);
  const [modus, setModus] = useState<'live' | 'demo'>('demo');
  const [anbieter, setAnbieter] = useState('manuell');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [rechBusy, setRechBusy] = useState<string | null>(null);
  const [crmBusy, setCrmBusy] = useState<string | null>(null);
  const [lagerBusy, setLagerBusy] = useState<string | null>(null);
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nmExtra, setNmExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});

  const laden_ = useCallback(async () => {
    const { data } = await supabase.from('shop_bestellungen')
      .select('id, quelle, extern_id, besteller, email, status, brutto_summe, positionen, bestell_am, erstellt_am, rechnung_id, kontakt_id, lager_gebucht')
      .order('erstellt_am', { ascending: false });
    const rows = (data as Bestellung[]) ?? [];
    setListe(rows);
    setFelder(await ladeFelder(MODUL));
    setWerteMap(await ladeWerte(MODUL, rows.map((r) => r.id)));
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const { data: intg } = await supabase.from('betrieb_integrationen').select('anbieter, aktiv').eq('typ', 'shop').maybeSingle();
      if (intg) {
        setAnbieter((intg as { anbieter: string }).anbieter);
        const a = anbieterVon('shop' as IntegrationTyp, (intg as { anbieter: string }).anbieter);
        setModus((intg as { aktiv: boolean }).aktiv && a && !a.demo ? 'live' : 'demo');
      }
      await laden_();
      setLaden(false);
    })();
  }, [laden_]);

  async function importieren() {
    if (!uid) return;
    const orders = parseCsv(csv);
    if (!orders.length) { setFehler('Keine Zeilen erkannt. Format: extern_id;besteller;email;bezeichnung;menge;einzelpreis'); return; }
    setBusy(true); setFehler(null); setOk(null);
    let neu = 0, uebersprungen = 0;
    try {
      for (const o of orders) {
        const row = {
          owner_user_id: uid, quelle: 'manuell', extern_id: o.extern_id || null,
          besteller: o.besteller || null, email: o.email || null, status: 'neu',
          brutto_summe: Math.round(o.brutto * 100) / 100, positionen: o.positionen,
          bestell_am: new Date().toISOString(),
        };
        const { data: neuRow, error } = await supabase.from('shop_bestellungen').insert(row).select('id').single();
        if (error || !neuRow) { uebersprungen++; }
        else {
          neu++;
          try { await speichereWerte(MODUL, (neuRow as { id: string }).id, uid, nmExtra); } catch { /* eigene Felder optional */ }
        }
      }
      setOk(`${neu} Bestellung(en) importiert${uebersprungen ? `, ${uebersprungen} übersprungen (bereits vorhanden)` : ''}.`);
      setCsv(''); setNmExtra({});
      await laden_();
    } finally { setBusy(false); }
  }

  async function statusSetzen(b: Bestellung, status: string) {
    setBusy(true);
    try {
      const { error } = await supabase.from('shop_bestellungen').update({ status, aktualisiert_am: new Date().toISOString() }).eq('id', b.id);
      if (error) { setFehler('Änderung fehlgeschlagen.'); return; }
      setListe((l) => l.map((x) => (x.id === b.id ? { ...x, status } : x)));
    } finally { setBusy(false); }
  }

  // Bestellung -> echte Rechnung (fließt danach automatisch in Rechnungen & Finanzen)
  async function rechnungErstellen(b: Bestellung) {
    setRechBusy(b.id); setFehler(null); setOk(null);
    try {
      const res = await fetch('/api/rechnung-aus-shop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bestellungId: b.id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'Rechnung konnte nicht erstellt werden.');
      setOk(j?.bereitsVorhanden ? 'Für diese Bestellung gibt es bereits eine Rechnung.' : 'Rechnung erstellt — jetzt in Rechnungen & Finanzen sichtbar.');
      await laden_();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Fehler bei der Rechnungserstellung.');
    } finally { setRechBusy(null); }
  }

  // Besteller -> CRM-Kontakt (mit E-Mail-Dedup: Stammkunde wird verknüpft statt doppelt angelegt)
  async function inCrm(b: Bestellung) {
    if (b.kontakt_id) return;
    setCrmBusy(b.id); setFehler(null); setOk(null);
    try {
      let kontaktId: string | null = null;
      const email = (b.email || '').trim();
      if (email) {
        const { data: vorhanden } = await supabase.from('kontakte').select('id').eq('email', email).limit(1);
        if (vorhanden && vorhanden.length) kontaktId = (vorhanden[0] as { id: string }).id;
      }
      if (!kontaktId) {
        const { vorname, nachname } = nameSplit(b.besteller);
        const { data: neu, error } = await supabase.from('kontakte').insert({
          vorname, nachname, email: email || null, telefon: null, position: null, firma: null,
          status: 'kunde', quelle: 'Online-Shop', betreuungs_intervall_tage: 30,
          notizen: `Aus Online-Bestellung${b.extern_id ? ' ' + b.extern_id : ''} übernommen.`,
        }).select('id').single();
        if (error) throw error;
        kontaktId = (neu as { id: string }).id;
      }
      const { error: updErr } = await supabase.from('shop_bestellungen').update({ kontakt_id: kontaktId }).eq('id', b.id);
      if (updErr) throw updErr;
      setListe((l) => l.map((x) => (x.id === b.id ? { ...x, kontakt_id: kontaktId } : x)));
      setOk('Kunde ins CRM übernommen.');
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'CRM-Übernahme fehlgeschlagen.');
    } finally { setCrmBusy(null); }
  }

  // Bestell-Positionen vom Lagerbestand abziehen (Zuordnung per Artikelname) — idempotent
  async function lagerBuchen(b: Bestellung) {
    if (b.lager_gebucht) return;
    setLagerBusy(b.id); setFehler(null); setOk(null);
    try {
      const { data: artikelD } = await supabase.from('artikel').select('id, bezeichnung, artikelnummer, aktueller_bestand');
      const artikel = (artikelD ?? []) as { id: string; bezeichnung: string | null; artikelnummer: string | null; aktueller_bestand: number | null }[];
      const plan = planeLagerabzug(b.positionen || [], artikel);
      for (const ab of plan.abzuege) {
        const a = artikel.find((x) => x.id === ab.artikel_id);
        const neu = (Number(a?.aktueller_bestand) || 0) - ab.menge;
        const { error } = await supabase.from('artikel').update({ aktueller_bestand: neu }).eq('id', ab.artikel_id);
        if (error) throw error;
      }
      const { error: updErr } = await supabase.from('shop_bestellungen').update({ lager_gebucht: true }).eq('id', b.id);
      if (updErr) throw updErr;
      setListe((l) => l.map((x) => (x.id === b.id ? { ...x, lager_gebucht: true } : x)));
      setOk(`Lager gebucht: ${plan.zugeordnet} Position(en) abgezogen (${plan.perNummer}× per Artikelnr., ${plan.perName}× per Name)${plan.offen ? `, ${plan.offen} ohne passenden Artikel übersprungen` : ''}.`);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Lager-Buchung fehlgeschlagen.');
    } finally { setLagerBusy(null); }
  }

  const proStatus = (k: string) => liste.filter((b) => b.status === k).length;

  return (
    <div style={styles.page}>
      <div style={styles.head}>
        <div>
          <h1 style={styles.h1}>🛒 Shop / Marktplatz</h1>
          <p style={styles.sub}>
            Bestellungen aus Ihrem Online-Shop an einem Ort. Im <strong>Manuell-Modus</strong> per CSV importieren;
            mit hinterlegtem Anbieter (unter „🔌 Schnittstellen") später automatisch per Schnittstelle.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <span style={{ ...styles.badge, color: modus === 'live' ? C.green : C.warn, borderColor: modus === 'live' ? C.green : C.warn }}>
            {modus === 'live' ? `● Live · ${anbieter}` : '○ Manuell-Modus'}
          </span>
          <a href="/dashboard/shop/produkte" style={styles.produkteBtn}>🛍️ Produkte in den Shop übernehmen →</a>
          <a href="/dashboard/shop/zahlung" style={styles.zahlungBtn}>💳 Online-Zahlung einrichten →</a>
        </div>
      </div>

      {/* CSV-Import */}
      <div style={styles.card}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Bestellungen importieren (CSV)</div>
        <div style={styles.hinweis}>
          Eine Zeile je Position. Spalten: <code>extern_id ; besteller ; email ; bezeichnung ; menge ; einzelpreis ; mwst ; artikelnummer</code>. Die <strong>Artikelnummer</strong> (optional, letzte Spalte) ordnet die Position beim Lagerabzug eindeutig dem Artikel zu — sonst per Name.
          Zeilen mit gleicher <code>extern_id</code> werden zu einer Bestellung zusammengefasst. Kopfzeile optional.
          <br /><br />
          <span style={{ color: C.warn, fontWeight: 700 }}>Steuersatz (letzte Spalte):</span> <strong>7</strong> für Lebensmittel, <strong>19</strong> für Getränke &amp; Non-Food. Fehlt die Angabe, rechnen wir mit <strong>19 %</strong> — bei Lebensmitteln bitte <strong>7</strong> eintragen. Verschiedene Sätze in einer Bestellung sind erlaubt (werden korrekt getrennt ausgewiesen).
        </div>
        <textarea style={styles.textarea} value={csv} onChange={(e) => setCsv(e.target.value)}
          placeholder={'1001;Max Muster;max@mail.de;Winterreifen 205/55;4;89,90;19\n1001;Max Muster;max@mail.de;Montage;1;40,00;19\n2002;Hofladen Meier;kunde@mail.de;Bio-Gemüsekiste;1;24,90;7'} />
        {felder.length > 0 && (
          <div style={styles.extraRow}>
            <span style={{ color: C.textDim, fontSize: 12.5, alignSelf: 'center' }}>Eigene Felder (gelten für alle importierten Bestellungen):</span>
            <EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} />
          </div>
        )}
        {ok && <div style={styles.ok}>{ok}</div>}
        {fehler && <div style={styles.err}>{fehler}</div>}
        <button style={{ ...styles.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={importieren}>
          {busy ? 'Importiert …' : '⬆ Importieren'}
        </button>
      </div>

      {uid && <EigeneFelderManager modul={MODUL} ownerId={uid} onChange={laden_} />}

      {/* Status-Übersicht */}
      <div style={styles.statusRow}>
        {STATUS.map((s) => (
          <div key={s.key} style={styles.statusKarte}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.farbe }}>{proStatus(s.key)}</div>
            <div style={{ fontSize: 12, color: C.textDim }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Liste */}
      {laden ? (
        <p style={styles.sub}>Lädt …</p>
      ) : liste.length === 0 ? (
        <p style={styles.sub}>Noch keine Bestellungen. Oben eine CSV importieren.</p>
      ) : (
        <div style={styles.liste}>
          {liste.map((b) => {
            const si = statusInfo(b.status);
            return (
              <div key={b.id} style={styles.item}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>
                    {b.extern_id ? `#${b.extern_id} · ` : ''}{b.besteller || 'Kunde'} <span style={{ color: C.textDim, fontWeight: 400 }}>· {b.quelle}</span>
                  </div>
                  <div style={{ color: C.textDim, fontSize: 13 }}>
                    {(b.positionen || []).map((p) => `${p.menge}× ${p.bezeichnung}`).join(', ') || '—'}
                  </div>
                  <EigeneFelderAnzeige felder={felder} werte={werteMap[b.id]} />
                </div>
                <div style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{eur(b.brutto_summe)}</div>
                {b.rechnung_id ? (
                  <a href={`/dashboard/rechnungen/${b.rechnung_id}`} style={styles.rechBtn}>🧾 Rechnung</a>
                ) : (
                  <button
                    style={{ ...styles.rechBtn, opacity: rechBusy === b.id ? 0.6 : 1, cursor: rechBusy === b.id ? 'default' : 'pointer' }}
                    disabled={rechBusy === b.id || b.status === 'storniert'}
                    onClick={() => rechnungErstellen(b)}
                    title={b.status === 'storniert' ? 'Stornierte Bestellung wird nicht abgerechnet' : 'Rechnung aus dieser Bestellung erstellen'}
                  >
                    {rechBusy === b.id ? '…' : '🧾 Rechnung'}
                  </button>
                )}
                {b.kontakt_id ? (
                  <a href={`/dashboard/crm/${b.kontakt_id}`} style={styles.crmBtn}>👤 Im CRM</a>
                ) : (
                  <button
                    style={{ ...styles.crmBtn, opacity: crmBusy === b.id ? 0.6 : 1, cursor: crmBusy === b.id ? 'default' : 'pointer' }}
                    disabled={crmBusy === b.id}
                    onClick={() => inCrm(b)}
                    title="Kunde ins CRM übernehmen"
                  >
                    {crmBusy === b.id ? '…' : '👤 CRM'}
                  </button>
                )}
                {b.lager_gebucht ? (
                  <span style={{ ...styles.lagerBtn, opacity: 0.7 }}>✓ Lager</span>
                ) : (
                  <button
                    style={{ ...styles.lagerBtn, opacity: lagerBusy === b.id ? 0.6 : 1, cursor: lagerBusy === b.id ? 'default' : 'pointer' }}
                    disabled={lagerBusy === b.id}
                    onClick={() => lagerBuchen(b)}
                    title="Positionen vom Lagerbestand abziehen"
                  >
                    {lagerBusy === b.id ? '…' : '📦 Lager'}
                  </button>
                )}
                <select style={styles.statusSelect} value={b.status} onChange={(e) => statusSetzen(b, e.target.value)}>
                  {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <span style={{ ...styles.punkt, background: si.farbe }} title={si.label} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 960, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  head: { display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 680 },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  produkteBtn: { background: `${C.gold}18`, color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' },
  zahlungBtn: { background: `${C.cyan}14`, color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 },
  hinweis: { background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5 },
  textarea: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', fontSize: 14, fontFamily: 'monospace', minHeight: 120, resize: 'vertical' },
  primaer: { alignSelf: 'flex-start', background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  extraRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  statusRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, margin: '18px 0' },
  statusKarte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px', textAlign: 'center' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10 },
  item: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  statusSelect: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' },
  rechBtn: { background: 'rgba(201,168,76,0.12)', color: C.gold, border: `1px solid ${C.gold}55`, borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', textDecoration: 'none', fontFamily: 'inherit', display: 'inline-block' },
  crmBtn: { background: 'rgba(0,229,255,0.10)', color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', textDecoration: 'none', fontFamily: 'inherit', display: 'inline-block' },
  lagerBtn: { background: 'rgba(76,175,125,0.10)', color: C.green, border: `1px solid ${C.green}55`, borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', textDecoration: 'none', fontFamily: 'inherit', display: 'inline-block' },
  punkt: { width: 12, height: 12, borderRadius: 999, display: 'inline-block' },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
};
