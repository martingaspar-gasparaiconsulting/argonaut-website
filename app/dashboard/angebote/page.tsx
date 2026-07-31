'use client';

// ============================================================
// ARGONAUT OS · Bündel 14 · Angebote (Dashboard)
// Angebot erstellen -> Zusage-Link an den Kunden -> nach Annahme per Klick
// in eine Rechnung umwandeln. PDF über Gotenberg.
// Pfad: app/dashboard/angebote/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { signaturStarten } from '@/lib/signaturStart';
import Leerzustand from '../_components/Leerzustand';
import { rechneAngebot, freigabeNoetig, RABATT_FREIGABE_AB, type Staffel } from '@/lib/angebotRabatt';
import { normalisierePositionen, nurGefuellte, bundleName, bundleLabel, type Bundle } from '@/lib/angebotBundle';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Kontakt = { id: string; name: string; email: string };
type Pos = { bezeichnung: string; menge: string; einheit: string; einzelpreis: string; mwst_satz: string; rabatt: string };
type Angebot = {
  id: string; angebotsnummer: string | null; titel: string; kunde_name: string | null;
  status: string; gueltig_bis: string | null; brutto_summe: number; token: string; rechnung_id: string | null;
  kunde_email: string | null; kontakt_id: string | null;
  rabatt_prozent: number | null; genehmigung_noetig: boolean | null; genehmigt: boolean | null;
};

const STATUS_FARBE: Record<string, string> = {
  entwurf: C.textDim, gesendet: C.cyan, angenommen: C.green, abgelehnt: C.danger, abgelaufen: C.warn,
};
function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string) { return parseFloat((s || '').replace(/\./g, '').replace(',', '.')) || 0; }
function heutePlus(tage: number) { const d = new Date(); d.setDate(d.getDate() + tage); return d.toISOString().slice(0, 10); }

const LEER_POS: Pos = { bezeichnung: '', menge: '1', einheit: 'Stk', einzelpreis: '', mwst_satz: '19', rabatt: '0' };

// Positionen für die Rechen-Lib aufbereiten (Strings -> die Lib parst selbst).
function alsRabattPos(pos: Pos[]) {
  return pos.map((p) => ({ menge: p.menge, einzelpreis: p.einzelpreis, mwst_satz: p.mwst_satz, rabatt: p.rabatt }));
}

export default function AngebotePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [liste, setListe] = useState<Angebot[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Formular
  const [kunde, setKunde] = useState('');
  const [titel, setTitel] = useState('Angebot');
  const [gueltig, setGueltig] = useState(heutePlus(30));
  const [positionen, setPositionen] = useState<Pos[]>([{ ...LEER_POS }]);
  const [notiz, setNotiz] = useState('');
  const [gesamtRabatt, setGesamtRabatt] = useState('0');
  const [staffelAn, setStaffelAn] = useState(false);
  const [staffeln, setStaffeln] = useState<Staffel[]>([{ abMenge: 10, rabatt: 5 }, { abMenge: 50, rabatt: 10 }]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundleNeuName, setBundleNeuName] = useState('');

  const basisUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const laden_ = useCallback(async () => {
    const { data } = await supabase.from('angebote')
      .select('id, angebotsnummer, titel, kunde_name, status, gueltig_bis, brutto_summe, token, rechnung_id, kunde_email, kontakt_id, rabatt_prozent, genehmigung_noetig, genehmigt')
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
        id: k.id, email: k.email || '',
        name: (k.anzeigename || `${k.vorname || ''} ${k.nachname || ''}`.trim() || k.name || k.email || '—'),
      })));
      await laden_();
      await bundleLaden();
      setLaden(false);
    })();
  }, [laden_]);

  const bundleLaden = useCallback(async () => {
    try {
      const { data } = await supabase.from('angebot_bundle').select('id, name, positionen').order('name', { ascending: true });
      setBundles(((data as Array<{ id: string; name: string; positionen: unknown }>) ?? []).map((b) => ({
        id: b.id, name: b.name, positionen: normalisierePositionen(b.positionen),
      })));
    } catch { /* Tabelle evtl. noch nicht eingespielt */ }
  }, []);

  function bundleEinfuegen(id: string) {
    const b = bundles.find((x) => x.id === id);
    if (!b) return;
    setPositionen((ps) => [...nurGefuellte(ps), ...b.positionen]);
  }

  async function bundleSpeichern() {
    if (!uid) return;
    const name = bundleName(bundleNeuName);
    if (!name) { setFehler('Bitte einen Namen für den Baustein angeben.'); return; }
    const pos = nurGefuellte(positionen);
    if (!pos.length) { setFehler('Keine Positionen zum Speichern.'); return; }
    setBusy('bundle'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('angebot_bundle').insert({ owner_user_id: uid, name, positionen: pos });
      if (error) { setFehler('Baustein konnte nicht gespeichert werden.'); return; }
      setBundleNeuName(''); setOk(`Baustein „${name}" gespeichert — ab jetzt mit einem Klick einfügbar.`);
      await bundleLaden();
    } finally { setBusy(null); }
  }

  const aktiveStaffeln = useMemo(() => (staffelAn ? staffeln.filter((s) => s.abMenge > 0 && s.rabatt > 0) : []), [staffelAn, staffeln]);
  const summe = useMemo(() => rechneAngebot(alsRabattPos(positionen), gesamtRabatt, aktiveStaffeln), [positionen, gesamtRabatt, aktiveStaffeln]);
  const freigabe = freigabeNoetig(summe.rabattProzentGesamt);

  function setPos(i: number, f: keyof Pos, v: string) { setPositionen((ps) => ps.map((p, k) => (k === i ? { ...p, [f]: v } : p))); }
  function posWeg(i: number) { setPositionen((ps) => ps.filter((_, k) => k !== i)); }
  function posDazu() { setPositionen((ps) => [...ps, { ...LEER_POS }]); }

  async function speichern() {
    if (!uid) return;
    if (!kunde.trim()) { setFehler('Bitte einen Kunden angeben.'); return; }
    const posClean = positionen.filter((p) => p.bezeichnung.trim() || num(p.einzelpreis) > 0);
    if (!posClean.length) { setFehler('Bitte mindestens eine Position erfassen.'); return; }
    setBusy('neu'); setFehler(null); setOk(null);
    try {
      const treffer = kontakte.find((k) => k.name === kunde.trim());
      const s = rechneAngebot(alsRabattPos(posClean), gesamtRabatt, aktiveStaffeln);
      const brauchtFreigabe = freigabeNoetig(s.rabattProzentGesamt);
      const { data: ang, error } = await supabase.from('angebote').insert({
        owner_user_id: uid, kontakt_id: treffer?.id ?? null, kunde_name: kunde.trim(), kunde_email: treffer?.email || null,
        titel: titel.trim() || 'Angebot', status: 'entwurf', gueltig_bis: gueltig || null,
        netto_summe: s.netto, mwst_summe: s.mwst, brutto_summe: s.brutto, notiz: notiz.trim() || null,
        rabatt_prozent: s.rabattProzentGesamt, rabatt_betrag: s.rabattBetrag,
        genehmigung_noetig: brauchtFreigabe, genehmigt: false,
      }).select('id, token').single();
      if (error || !ang) { setFehler('Angebot konnte nicht gespeichert werden.'); return; }

      const posRows = posClean.map((p, i) => ({
        owner_user_id: uid, angebot_id: ang.id, position: i + 1,
        bezeichnung: p.bezeichnung.trim() || '(ohne Bezeichnung)', menge: num(p.menge), einheit: p.einheit.trim() || 'Stk',
        einzelpreis: num(p.einzelpreis), mwst_satz: num(p.mwst_satz),
        rabatt_prozent: s.positionen[i]?.effektivProzent ?? 0,
        gesamt_netto: s.positionen[i]?.netto ?? Math.round(num(p.menge) * num(p.einzelpreis) * 100) / 100,
      }));
      const { error: pErr } = await supabase.from('angebot_positionen').insert(posRows);
      if (pErr) { await supabase.from('angebote').delete().eq('id', ang.id); setFehler('Positionen konnten nicht gespeichert werden.'); return; }

      setOk('Angebot erstellt. Zusage-Link ist jetzt bereit zum Kopieren.');
      setKunde(''); setTitel('Angebot'); setPositionen([{ ...LEER_POS }]); setNotiz(''); setGueltig(heutePlus(30)); setGesamtRabatt('0');
      await laden_();
    } finally { setBusy(null); }
  }

  async function statusSetzen(a: Angebot, status: string) {
    setBusy(a.id);
    try {
      const { error } = await supabase.from('angebote').update({ status, aktualisiert_am: new Date().toISOString() }).eq('id', a.id);
      if (error) { setFehler('Änderung fehlgeschlagen.'); return; }
      setListe((l) => l.map((x) => (x.id === a.id ? { ...x, status } : x)));
    } finally { setBusy(null); }
  }
  async function freigeben(a: Angebot) {
    setBusy(a.id); setFehler(null);
    try {
      const { error } = await supabase.from('angebote').update({ genehmigt: true, aktualisiert_am: new Date().toISOString() }).eq('id', a.id);
      if (error) { setFehler('Freigabe fehlgeschlagen.'); return; }
      setListe((l) => l.map((x) => (x.id === a.id ? { ...x, genehmigt: true } : x)));
      setOk('Angebot freigegeben — es kann jetzt versendet werden.');
    } finally { setBusy(null); }
  }
  async function kopieren(a: Angebot) {
    const url = `${basisUrl}/angebot/${a.token}`;
    try { await navigator.clipboard.writeText(url); setOk('Zusage-Link kopiert — an den Kunden schicken.'); }
    catch { setOk(url); }
  }
  async function inRechnung(a: Angebot) {
    setBusy(a.id); setFehler(null); setOk(null);
    try {
      const res = await fetch('/api/rechnung-aus-angebot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ angebotId: a.id }) });
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Umwandlung fehlgeschlagen.'); return; }
      setOk(j.bereitsVorhanden ? 'Zu diesem Angebot gibt es bereits eine Rechnung.' : 'Rechnung erstellt — sie liegt jetzt unter „🧾 Rechnungen".');
      setListe((l) => l.map((x) => (x.id === a.id ? { ...x, rechnung_id: j.rechnungId } : x)));
    } finally { setBusy(null); }
  }
  async function loeschen(a: Angebot) {
    setBusy(a.id);
    try {
      const { error } = await supabase.from('angebote').delete().eq('id', a.id);
      if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
      setListe((l) => l.filter((x) => x.id !== a.id));
    } finally { setBusy(null); }
  }
  async function zurUnterschrift(a: Angebot) {
    if (!uid) return;
    setBusy(a.id); setFehler(null); setOk(null);
    try {
      const { data: pos } = await supabase.from('angebot_positionen').select('position, bezeichnung, menge, einheit, einzelpreis').eq('angebot_id', a.id).order('position', { ascending: true });
      const zeilen = ((pos as Record<string, unknown>[]) || []).map((p) => `- ${Number(p.menge) || 0} ${String(p.einheit || '')} ${String(p.bezeichnung || '')} — ${eur(Number(p.einzelpreis) || 0)}`).join('\n');
      const dok = `ANGEBOT ${a.angebotsnummer || ''}\n${a.titel}\nKunde: ${a.kunde_name || ''}\n\nPositionen:\n${zeilen}\n\nGesamtbetrag (brutto): ${eur(a.brutto_summe)}\n\nMit meiner Unterschrift nehme ich dieses Angebot verbindlich an.`;
      const r = await signaturStarten(supabase, uid, {
        titel: `Angebot ${a.angebotsnummer || a.titel}`, empfaenger_name: a.kunde_name,
        empfaenger_email: a.kunde_email, kontakt_id: a.kontakt_id, dokument: dok,
      });
      if (!r.ok) { setFehler(r.error || 'Signatur-Anfrage fehlgeschlagen.'); return; }
      try { await navigator.clipboard.writeText(r.link || ''); } catch { /* egal */ }
      setOk(`Unterschrifts-Link erstellt & kopiert: ${r.link}`);
    } finally { setBusy(null); }
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🧾 Angebote</h1>
      <p style={styles.sub}>
        Erstellen Sie ein Angebot, schicken Sie dem Kunden den <strong>Zusage-Link</strong> — er nimmt online an oder
        lehnt ab. Aus einem angenommenen Angebot wird mit einem Klick eine Rechnung.
      </p>

      {/* --- Neues Angebot --- */}
      <div style={styles.card}>
        <div style={styles.row2}>
          <label style={styles.lab}>Kunde
            <input list="kl" style={styles.inp} value={kunde} onChange={(e) => setKunde(e.target.value)} placeholder="Name / Firma" />
            <datalist id="kl">{kontakte.map((k) => <option key={k.id} value={k.name} />)}</datalist>
          </label>
          <label style={styles.lab}>Titel
            <input style={styles.inp} value={titel} onChange={(e) => setTitel(e.target.value)} />
          </label>
          <label style={styles.lab}>Gültig bis
            <input type="date" style={styles.inp} value={gueltig} onChange={(e) => setGueltig(e.target.value)} />
          </label>
        </div>

        <div style={styles.posKopf}>
          <span>Bezeichnung</span><span style={{ textAlign: 'right' }}>Menge</span><span>Einheit</span>
          <span style={{ textAlign: 'right' }}>Einzel €</span><span style={{ textAlign: 'right' }}>MwSt %</span><span style={{ textAlign: 'right' }}>Rabatt %</span><span />
        </div>
        {positionen.map((p, i) => (
          <div key={i} style={styles.posRow}>
            <input style={styles.inp} value={p.bezeichnung} onChange={(e) => setPos(i, 'bezeichnung', e.target.value)} placeholder="Leistung / Artikel" />
            <input style={{ ...styles.inp, textAlign: 'right' }} value={p.menge} onChange={(e) => setPos(i, 'menge', e.target.value)} inputMode="decimal" />
            <input style={styles.inp} value={p.einheit} onChange={(e) => setPos(i, 'einheit', e.target.value)} />
            <input style={{ ...styles.inp, textAlign: 'right' }} value={p.einzelpreis} onChange={(e) => setPos(i, 'einzelpreis', e.target.value)} inputMode="decimal" placeholder="0" />
            <input style={{ ...styles.inp, textAlign: 'right' }} value={p.mwst_satz} onChange={(e) => setPos(i, 'mwst_satz', e.target.value)} inputMode="decimal" />
            <input style={{ ...styles.inp, textAlign: 'right' }} value={p.rabatt} onChange={(e) => setPos(i, 'rabatt', e.target.value)} inputMode="decimal" placeholder="0" title="Positionsrabatt in %" />
            <button type="button" style={styles.wegBtn} onClick={() => posWeg(i)} aria-label="entfernen">✕</button>
          </div>
        ))}
        <button type="button" style={styles.dazuBtn} onClick={posDazu}>＋ Position</button>

        {/* --- Bausteine / Bundles (CPQ A8b) --- */}
        <div style={styles.bundleBox}>
          <span style={{ color: C.textDim, fontSize: 13, fontWeight: 700 }}>📦 Bausteine:</span>
          {bundles.length > 0 && (
            <select style={{ ...styles.inp, maxWidth: 260 }} value="" onChange={(e) => { if (e.target.value) bundleEinfuegen(e.target.value); }}>
              <option value="">— Bundle einfügen —</option>
              {bundles.map((b) => <option key={b.id} value={b.id}>{bundleLabel(b)}</option>)}
            </select>
          )}
          <input style={{ ...styles.inp, maxWidth: 180 }} value={bundleNeuName} onChange={(e) => setBundleNeuName(e.target.value)} placeholder="Name für neuen Baustein" />
          <button type="button" style={{ ...styles.dazuBtn, opacity: busy === 'bundle' ? 0.6 : 1 }} disabled={busy === 'bundle'} onClick={bundleSpeichern}>＋ Als Baustein speichern</button>
        </div>

        {/* --- Rabatte & Staffeln (CPQ) --- */}
        <div style={styles.rabattBox}>
          <div style={styles.rabattZeile}>
            <label style={{ ...styles.lab, flex: '0 0 auto' }}>Gesamtrabatt %
              <input style={{ ...styles.inp, width: 110, textAlign: 'right' }} value={gesamtRabatt} onChange={(e) => setGesamtRabatt(e.target.value)} inputMode="decimal" placeholder="0" />
            </label>
            <label style={styles.staffelToggle}>
              <input type="checkbox" checked={staffelAn} onChange={(e) => setStaffelAn(e.target.checked)} />
              Mengenrabatt (Staffel) automatisch anwenden
            </label>
          </div>
          {staffelAn && (
            <div style={styles.staffelListe}>
              {staffeln.map((st, i) => (
                <div key={i} style={styles.staffelRow}>
                  <span style={{ color: C.textDim, fontSize: 13 }}>ab Menge</span>
                  <input style={{ ...styles.inp, width: 80, textAlign: 'right' }} value={String(st.abMenge)} inputMode="decimal"
                    onChange={(e) => setStaffeln((s) => s.map((x, k) => (k === i ? { ...x, abMenge: num(e.target.value) } : x)))} />
                  <span style={{ color: C.textDim, fontSize: 13 }}>→ Rabatt</span>
                  <input style={{ ...styles.inp, width: 80, textAlign: 'right' }} value={String(st.rabatt)} inputMode="decimal"
                    onChange={(e) => setStaffeln((s) => s.map((x, k) => (k === i ? { ...x, rabatt: num(e.target.value) } : x)))} />
                  <span style={{ color: C.textDim, fontSize: 13 }}>%</span>
                  <button type="button" style={styles.wegBtn} onClick={() => setStaffeln((s) => s.filter((_, k) => k !== i))} aria-label="entfernen">✕</button>
                </div>
              ))}
              <button type="button" style={styles.dazuBtn} onClick={() => setStaffeln((s) => [...s, { abMenge: 0, rabatt: 0 }])}>＋ Staffel</button>
              <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>Die Staffel greift je Position, wenn die Menge erreicht ist — und nur, wenn sie höher ist als der eingetippte Positionsrabatt.</div>
            </div>
          )}
        </div>

        <label style={styles.lab}>Anmerkung (optional)
          <input style={styles.inp} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Lieferzeit, Zahlungsbedingungen" />
        </label>

        <div style={styles.summe}>
          {summe.rabattBetrag > 0 && <div><span style={styles.sk}>Zwischensumme</span> {eur(summe.zwischenNetto)}</div>}
          {summe.rabattBetrag > 0 && <div style={{ color: C.green }}><span style={styles.sk}>Rabatt ({summe.rabattProzentGesamt} %)</span> −{eur(summe.rabattBetrag)}</div>}
          <div><span style={styles.sk}>Netto</span> {eur(summe.netto)}</div>
          <div><span style={styles.sk}>MwSt</span> {eur(summe.mwst)}</div>
          <div style={styles.brutto}><span style={styles.sk}>Gesamt</span> {eur(summe.brutto)}</div>
        </div>

        {freigabe && (
          <div style={styles.freigabeHinweis}>
            ⚠️ Rabatt {summe.rabattProzentGesamt} % liegt ab {RABATT_FREIGABE_AB} % — dieses Angebot wird als <strong>„Freigabe nötig"</strong> gespeichert und sollte vor dem Versand freigegeben werden.
          </div>
        )}

        {ok && <div style={styles.ok}>{ok}</div>}
        {fehler && <div style={styles.err}>{fehler}</div>}
        <button style={{ ...styles.speichern, opacity: busy === 'neu' ? 0.6 : 1 }} disabled={busy === 'neu'} onClick={speichern}>
          {busy === 'neu' ? 'Speichert …' : '💾 Angebot erstellen'}
        </button>
      </div>

      {/* --- Liste --- */}
      <h2 style={styles.h2}>Angebote <span style={{ color: C.textDim, fontWeight: 400 }}>({liste.length})</span></h2>
      {laden ? (
        <p style={styles.sub}>Lädt …</p>
      ) : liste.length === 0 ? (
        <Leerzustand
          icon="📄"
          titel="Noch keine Angebote"
          text="Hier entstehen deine Angebote — vom Entwurf bis zum versendeten PDF."
          schritte={["Kunde und Positionen wählen", "Preise und Text prüfen", "Als PDF speichern oder direkt an den Kunden senden"]}
        />
      ) : (
        <div style={styles.liste}>
          {liste.map((a) => (
            <div key={a.id} style={styles.item}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{a.titel} <span style={{ color: C.textDim, fontWeight: 400 }}>· {a.kunde_name || '—'}</span></div>
                <div style={{ color: C.textDim, fontSize: 13 }}>{eur(a.brutto_summe)} brutto{(a.rabatt_prozent ?? 0) > 0 ? ` · ${a.rabatt_prozent} % Rabatt` : ''}{a.gueltig_bis ? ` · gültig bis ${a.gueltig_bis.split('-').reverse().join('.')}` : ''}</div>
              </div>
              {a.genehmigung_noetig && (a.genehmigt
                ? <span style={{ ...styles.badge, color: C.green, borderColor: C.green }}>✓ freigegeben</span>
                : <span style={{ ...styles.badge, color: C.warn, borderColor: C.warn }}>⚠️ Freigabe nötig</span>)}
              <span style={{ ...styles.badge, color: STATUS_FARBE[a.status] || C.textDim, borderColor: STATUS_FARBE[a.status] || C.border }}>
                {a.status}
              </span>
              <div style={styles.itemBtns}>
                <button style={styles.mini} onClick={() => kopieren(a)}>🔗 Link</button>
                <a href={`/api/angebot-pdf?id=${encodeURIComponent(a.id)}`} target="_blank" rel="noreferrer" style={styles.miniLink}>⬇ PDF</a>
                <button style={styles.mini} disabled={busy === a.id} onClick={() => zurUnterschrift(a)}>✍️ Unterschrift</button>
                {a.genehmigung_noetig && !a.genehmigt && <button style={{ ...styles.mini, color: C.navy, background: C.warn, borderColor: C.warn }} disabled={busy === a.id} onClick={() => freigeben(a)}>✓ Freigeben</button>}
                {a.status === 'entwurf' && <button style={styles.mini} disabled={busy === a.id} onClick={() => statusSetzen(a, 'gesendet')}>✓ gesendet</button>}
                {a.status === 'angenommen' && (a.rechnung_id
                  ? <span style={{ ...styles.badge, color: C.green, borderColor: C.green }}>✓ Rechnung</span>
                  : <button style={{ ...styles.mini, color: C.navy, background: C.gold, borderColor: C.gold }} disabled={busy === a.id} onClick={() => inRechnung(a)}>→ Rechnung</button>)}
                <button style={styles.miniWeg} disabled={busy === a.id} onClick={() => loeschen(a)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 960, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 20, fontWeight: 700, margin: '28px 0 12px' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 720 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 },
  row2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  posKopf: { display: 'grid', gridTemplateColumns: '1fr 58px 54px 80px 52px 58px 32px', gap: 6, color: C.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 2px' },
  posRow: { display: 'grid', gridTemplateColumns: '1fr 58px 54px 80px 52px 58px 32px', gap: 6, alignItems: 'center' },
  bundleBox: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px' },
  rabattBox: { display: 'flex', flexDirection: 'column', gap: 10, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  rabattZeile: { display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' },
  staffelToggle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.text, cursor: 'pointer' },
  staffelListe: { display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 10 },
  staffelRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  freigabeHinweis: { color: C.warn, background: 'rgba(224,162,76,0.1)', border: '1px solid rgba(224,162,76,0.35)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, lineHeight: 1.5 },
  wegBtn: { background: 'transparent', color: C.danger, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 0', fontSize: 13, cursor: 'pointer' },
  dazuBtn: { alignSelf: 'flex-start', background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '8px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  summe: { display: 'flex', gap: 20, justifyContent: 'flex-end', flexWrap: 'wrap', fontSize: 15, borderTop: `1px solid ${C.border}`, paddingTop: 12 },
  sk: { color: C.textDim, marginRight: 6 },
  brutto: { fontWeight: 800, color: C.gold, fontSize: 18 },
  speichern: { background: C.gold, color: C.navy, border: 'none', borderRadius: 11, padding: '13px 20px', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10 },
  item: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  itemBtns: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  miniLink: { color: C.gold, textDecoration: 'none', fontWeight: 800, fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 11px' },
  miniWeg: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 10px', fontSize: 13, cursor: 'pointer' },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14, wordBreak: 'break-all' },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
};
