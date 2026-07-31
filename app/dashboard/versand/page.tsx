'use client';

// ============================================================
// ARGONAUT OS · Versand-Center (Stufe 4a · Fundament)
// Sendungen erfassen (Empfänger, Gewicht, Dienstleister), Adress-Label als
// Vorschau drucken, Status verfolgen. Echte Frankierung/Tracking über einen
// Versand-Aggregator kommt anschlussfertig in Stufe 4b.
// Tabelle: versand_sendung (RLS owner + Mitarbeiter). Pfad: app/dashboard/versand/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import Leerzustand from '../_components/Leerzustand';
import { CARRIER, SERVICES, VERSAND_STATUS, RICHTUNGEN, RETOURE_GRUENDE, istRetoure, statusInfo, carrierName, trackingLink, sendungProbleme, adresseEinzeilig, formatGewicht, formatEuro, zaehleSendungen } from '@/lib/versand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Kontakt = { id: string; name: string; firma: string };
type Sendung = {
  id: string; kontakt_id: string | null; empfaenger_name: string | null; empfaenger_firma: string | null;
  strasse: string | null; plz: string | null; ort: string | null; land: string | null;
  gewicht_kg: number | null; carrier: string | null; service: string | null; status: string;
  tracking_nr: string | null; kosten: number | null; referenz: string | null;
  richtung: string | null; retoure_grund: string | null; label_url: string | null;
};
type Verbindung = { verbunden: boolean; konto_name: string; encKeyBereit: boolean };

function num(s: string): number { return parseFloat((s || '').replace(',', '.')) || 0; }
const LEER = {
  kontakt_id: '', empfaenger_name: '', empfaenger_firma: '', strasse: '', plz: '', ort: '', land: 'DE',
  gewicht_kg: '', laenge_cm: '', breite_cm: '', hoehe_cm: '', carrier: 'dhl', service: 'Paket', referenz: '', kosten: '', notiz: '',
  richtung: 'ausgehend', retoure_grund: '',
};

export default function VersandSeite() {
  const [uid, setUid] = useState<string | null>(null);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [sendungen, setSendungen] = useState<Sendung[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [formAuf, setFormAuf] = useState(false);
  const [form, setForm] = useState({ ...LEER });
  const [trackEntwurf, setTrackEntwurf] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'ausgehend' | 'retoure'>('ausgehend');
  const [verb, setVerb] = useState<Verbindung | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [kontoName, setKontoName] = useState('');
  const [verbAuf, setVerbAuf] = useState(false);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [s, k] = await Promise.all([
        supabase.from('versand_sendung').select('id, kontakt_id, empfaenger_name, empfaenger_firma, strasse, plz, ort, land, gewicht_kg, carrier, service, status, tracking_nr, kosten, referenz, richtung, retoure_grund, label_url').order('erstellt_am', { ascending: false }),
        supabase.from('kontakte').select('id, anzeigename, vorname, nachname, firma').order('nachname', { ascending: true }),
      ]);
      setSendungen((s.data as Sendung[]) ?? []);
      setKontakte(((k.data as Record<string, string>[]) ?? []).map((x) => ({
        id: x.id, firma: x.firma || '',
        name: (x.anzeigename || `${x.vorname || ''} ${x.nachname || ''}`.trim() || x.firma || '—'),
      })));
    } catch (e) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  const verbLaden = useCallback(async () => {
    try {
      const r = await fetch('/api/versand/verbindung');
      const j = await r.json();
      if (j?.ok) setVerb({ verbunden: !!j.verbunden, konto_name: j.konto_name || '', encKeyBereit: !!j.encKeyBereit });
    } catch { /* egal */ }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      await laden_();
      await verbLaden();
    })();
  }, [laden_, verbLaden]);

  async function verbinden() {
    if (!apiKey.trim()) { setFehler('Bitte den shipcloud-API-Key eingeben.'); return; }
    setBusy('verb'); setFehler(null);
    try {
      const r = await fetch('/api/versand/verbindung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey.trim(), konto_name: kontoName.trim() }) });
      const j = await r.json();
      if (!j?.ok) { setFehler(j?.error || 'Verbinden fehlgeschlagen.'); return; }
      setApiKey(''); setVerbAuf(false); await verbLaden();
    } finally { setBusy(null); }
  }
  async function trennen() {
    if (!window.confirm('Versand-Konto wirklich trennen?')) return;
    setBusy('verb'); setFehler(null);
    try {
      const r = await fetch('/api/versand/verbindung', { method: 'DELETE' });
      const j = await r.json();
      if (!j?.ok) { setFehler(j?.error || 'Trennen fehlgeschlagen.'); return; }
      await verbLaden();
    } finally { setBusy(null); }
  }
  async function buchen(s: Sendung) {
    setBusy(s.id); setFehler(null);
    try {
      const r = await fetch('/api/versand/buchen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sendungId: s.id }) });
      const j = await r.json();
      if (!j?.ok) { setFehler(j?.error || 'Buchung fehlgeschlagen.'); return; }
      await laden_();
    } catch (e) { setFehler('Buchung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  const ausgehendListe = useMemo(() => sendungen.filter((s) => (s.richtung || 'ausgehend') !== 'retoure'), [sendungen]);
  const retourenListe = useMemo(() => sendungen.filter((s) => (s.richtung || 'ausgehend') === 'retoure'), [sendungen]);
  const gefiltert = tab === 'retoure' ? retourenListe : ausgehendListe;
  const kpi = useMemo(() => zaehleSendungen(gefiltert), [gefiltert]);
  const probleme = useMemo(() => sendungProbleme({
    empfaenger_name: form.empfaenger_name, strasse: form.strasse, plz: form.plz, ort: form.ort, gewicht_kg: form.gewicht_kg, carrier: form.carrier,
  }), [form]);

  const augeRegel = {
    klartext: kpi.gesamt === 0
      ? 'Noch keine Sendungen — erfasse dein erstes Paket.'
      : kpi.unterwegs > 0
        ? `${kpi.unterwegs} Sendung${kpi.unterwegs === 1 ? '' : 'en'} unterwegs · ${kpi.offen} noch zu buchen.`
        : `${kpi.offen} Sendung${kpi.offen === 1 ? '' : 'en'} offen zum Buchen.`,
    punkte: [
      `Gesamt: ${kpi.gesamt} · unterwegs: ${kpi.unterwegs} · zugestellt: ${kpi.zugestellt}`,
      kpi.kostenGesamt > 0 ? `Erfasste Versandkosten: ${formatEuro(kpi.kostenGesamt)}` : 'Noch keine Versandkosten erfasst',
    ],
    stimmung: (kpi.offen > 0 ? 'neutral' : 'gut') as 'gut' | 'neutral' | 'achtung',
  };

  function kontaktWaehlen(name: string) {
    const k = kontakte.find((x) => x.name === name);
    setForm((f) => ({ ...f, kontakt_id: k?.id || '', empfaenger_name: name, empfaenger_firma: k?.firma || f.empfaenger_firma }));
  }

  async function anlegen() {
    if (!uid) return;
    if (probleme.length) { setFehler('Bitte vervollständigen: ' + probleme.join(', ')); return; }
    setBusy('neu'); setFehler(null);
    try {
      const { error } = await supabase.from('versand_sendung').insert({
        owner_user_id: uid, kontakt_id: form.kontakt_id || null,
        empfaenger_name: form.empfaenger_name.trim(), empfaenger_firma: form.empfaenger_firma.trim() || null,
        strasse: form.strasse.trim(), plz: form.plz.trim(), ort: form.ort.trim(), land: (form.land.trim() || 'DE').toUpperCase(),
        gewicht_kg: num(form.gewicht_kg), laenge_cm: num(form.laenge_cm) || null, breite_cm: num(form.breite_cm) || null, hoehe_cm: num(form.hoehe_cm) || null,
        carrier: form.carrier, service: form.service, status: 'entwurf',
        kosten: form.kosten ? num(form.kosten) : null, referenz: form.referenz.trim() || null, notiz: form.notiz.trim() || null,
        richtung: form.richtung, retoure_grund: form.richtung === 'retoure' ? (form.retoure_grund || null) : null,
      });
      if (error) throw error;
      setForm({ ...LEER }); setFormAuf(false); await laden_();
    } catch (e) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function statusSetzen(s: Sendung, status: string) {
    setBusy(s.id); setFehler(null);
    try {
      const { error } = await supabase.from('versand_sendung').update({ status, aktualisiert_am: new Date().toISOString() }).eq('id', s.id);
      if (error) throw error;
      await laden_();
    } catch (e) { setFehler('Änderung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function trackingSpeichern(s: Sendung) {
    const nr = (trackEntwurf[s.id] ?? '').trim();
    setBusy(s.id); setFehler(null);
    try {
      const { error } = await supabase.from('versand_sendung')
        .update({ tracking_nr: nr || null, status: nr && s.status === 'entwurf' ? 'gebucht' : s.status, aktualisiert_am: new Date().toISOString() })
        .eq('id', s.id);
      if (error) throw error;
      await laden_();
    } catch (e) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function loeschen(s: Sendung) {
    if (!window.confirm(`Sendung an „${s.empfaenger_name || '—'}" wirklich löschen?`)) return;
    setBusy(s.id);
    try {
      const { error } = await supabase.from('versand_sendung').delete().eq('id', s.id);
      if (error) throw error;
      await laden_();
    } catch (e) { setFehler('Löschen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Logistik</div>
      <div style={styles.kopf}>
        <div>
          <h1 style={styles.h1}>📦 Versand</h1>
          <p style={styles.sub}>Erfasse deine Sendungen, druck ein Adress-Label und behalte den Status im Blick. Die echte Frankierung und automatische Sendungsverfolgung schalten wir über einen Versand-Anbieter frei (nächster Schritt).</p>
        </div>
        <button style={styles.primaer} onClick={() => { if (!formAuf) setForm({ ...LEER, richtung: tab }); setFormAuf((v) => !v); }}>{formAuf ? 'Abbrechen' : (tab === 'retoure' ? '↩️ Neue Retoure' : '＋ Neue Sendung')}</button>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.kpis}>
        <Kpi label="Sendungen" value={String(kpi.gesamt)} accent={C.text} />
        <Kpi label="Offen (zu buchen)" value={String(kpi.offen)} accent={kpi.offen > 0 ? C.cyan : C.text} />
        <Kpi label="Unterwegs" value={String(kpi.unterwegs)} accent={C.gold} />
        <Kpi label="Zugestellt" value={String(kpi.zugestellt)} accent={C.green} />
        <Kpi label="Versandkosten" value={formatEuro(kpi.kostenGesamt)} accent={C.text} />
      </div>

      {!laden && <div style={{ marginBottom: 14 }}><KiAuge modul="Versand" regel={augeRegel} /></div>}

      {/* Versand-Konto (shipcloud) — anschlussfertig */}
      {verb && (
        <div style={styles.verbBox}>
          {verb.verbunden ? (
            <>
              <span style={{ color: C.green, fontWeight: 800 }}>✓ Versand-Konto verbunden</span>
              {verb.konto_name && <span style={{ color: C.textDim, fontSize: 13 }}>· {verb.konto_name}</span>}
              <span style={{ flex: 1 }} />
              <button style={styles.mini} disabled={busy === 'verb'} onClick={trennen}>Trennen</button>
            </>
          ) : (
            <>
              <span style={{ color: C.textDim, fontSize: 13.5 }}>📮 Verbinde ein Versand-Konto (shipcloud), um <strong>echte Paketscheine</strong> zu frankieren und Tracking automatisch zu holen.</span>
              <span style={{ flex: 1 }} />
              <button style={styles.mini} onClick={() => setVerbAuf((v) => !v)}>{verbAuf ? 'Abbrechen' : 'Versand-Konto verbinden'}</button>
            </>
          )}
        </div>
      )}
      {verb && !verb.verbunden && verbAuf && (
        <div style={{ ...styles.card, marginBottom: 12 }}>
          {!verb.encKeyBereit && <div style={styles.hinweisWarn}>Hinweis: Der Sicherheits-Schlüssel (APP_ENC_KEY) ist noch nicht gesetzt — das Speichern klappt erst danach.</div>}
          <div style={styles.grid}>
            <label style={styles.lab}>shipcloud-API-Key<input style={styles.inp} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Aus deinem shipcloud-Konto" /></label>
            <label style={styles.lab}>Konto-Name (optional)<input style={styles.inp} value={kontoName} onChange={(e) => setKontoName(e.target.value)} placeholder="z. B. Hauptkonto" /></label>
          </div>
          <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'verb' ? 0.6 : 1 }} disabled={busy === 'verb'} onClick={verbinden}>🔗 Verbinden</button>
          <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 8 }}>Der Key wird verschlüsselt gespeichert und nie im Browser angezeigt. Ein shipcloud-Konto deckt DHL/DPD/GLS/Hermes/UPS über einen Vertrag ab.</div>
        </div>
      )}

      <div style={styles.tabs}>
        {RICHTUNGEN.map((r) => {
          const anzahl = r.key === 'retoure' ? retourenListe.length : ausgehendListe.length;
          const aktiv = tab === r.key;
          return (
            <button key={r.key} onClick={() => setTab(r.key)} style={{ ...styles.tab, ...(aktiv ? styles.tabAktiv : {}) }}>
              {r.icon} {r.label} <span style={{ color: C.textDim, fontWeight: 400 }}>({anzahl})</span>
            </button>
          );
        })}
      </div>

      {formAuf && (
        <div style={styles.card}>
          <div style={styles.cardTitel}>{form.richtung === 'retoure' ? '↩️ Neue Retoure' : 'Neue Sendung'}</div>
          <div style={styles.richtungWahl}>
            {RICHTUNGEN.map((r) => (
              <label key={r.key} style={{ ...styles.richtungOpt, ...(form.richtung === r.key ? styles.richtungAktiv : {}) }}>
                <input type="radio" name="richtung" checked={form.richtung === r.key} onChange={() => setForm({ ...form, richtung: r.key })} />
                {r.icon} {r.label}
              </label>
            ))}
            {form.richtung === 'retoure' && (
              <select style={{ ...styles.inp, maxWidth: 220 }} value={form.retoure_grund} onChange={(e) => setForm({ ...form, retoure_grund: e.target.value })}>
                <option value="">— Retouren-Grund —</option>
                {RETOURE_GRUENDE.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
          </div>
          {form.richtung === 'retoure' && <div style={styles.retoureHinweis}>↩️ Retoure: Das Label wird als <strong>Rücksende-Etikett an dich</strong> gedruckt — trag hier die Adresse des Kunden ein, der zurückschickt.</div>}
          <div style={styles.grid}>
            <label style={styles.lab}>Empfänger (Kontakt oder frei)
              <input list="vk" style={styles.inp} value={form.empfaenger_name} onChange={(e) => kontaktWaehlen(e.target.value)} placeholder="Name" />
              <datalist id="vk">{kontakte.map((k) => <option key={k.id} value={k.name} />)}</datalist>
            </label>
            <label style={styles.lab}>Firma (optional)<input style={styles.inp} value={form.empfaenger_firma} onChange={(e) => setForm({ ...form, empfaenger_firma: e.target.value })} /></label>
            <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>Straße & Hausnummer<input style={styles.inp} value={form.strasse} onChange={(e) => setForm({ ...form, strasse: e.target.value })} placeholder="Musterweg 1" /></label>
            <label style={styles.lab}>PLZ<input style={styles.inp} value={form.plz} onChange={(e) => setForm({ ...form, plz: e.target.value })} /></label>
            <label style={styles.lab}>Ort<input style={styles.inp} value={form.ort} onChange={(e) => setForm({ ...form, ort: e.target.value })} /></label>
            <label style={styles.lab}>Land<input style={styles.inp} value={form.land} onChange={(e) => setForm({ ...form, land: e.target.value })} /></label>
            <label style={styles.lab}>Gewicht (kg)<input style={styles.inp} inputMode="decimal" value={form.gewicht_kg} onChange={(e) => setForm({ ...form, gewicht_kg: e.target.value })} placeholder="0" /></label>
            <label style={styles.lab}>Dienstleister
              <select style={styles.inp} value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })}>
                {CARRIER.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.name}</option>)}
              </select>
            </label>
            <label style={styles.lab}>Versandart
              <select style={styles.inp} value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
                {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={styles.lab}>Maße L×B×H (cm, optional)
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={{ ...styles.inp, width: '33%' }} inputMode="decimal" value={form.laenge_cm} onChange={(e) => setForm({ ...form, laenge_cm: e.target.value })} placeholder="L" />
                <input style={{ ...styles.inp, width: '33%' }} inputMode="decimal" value={form.breite_cm} onChange={(e) => setForm({ ...form, breite_cm: e.target.value })} placeholder="B" />
                <input style={{ ...styles.inp, width: '33%' }} inputMode="decimal" value={form.hoehe_cm} onChange={(e) => setForm({ ...form, hoehe_cm: e.target.value })} placeholder="H" />
              </div>
            </label>
            <label style={styles.lab}>Referenz (optional)<input style={styles.inp} value={form.referenz} onChange={(e) => setForm({ ...form, referenz: e.target.value })} placeholder="z. B. Auftrag / Rechnung" /></label>
            <label style={styles.lab}>Versandkosten € (optional)<input style={styles.inp} inputMode="decimal" value={form.kosten} onChange={(e) => setForm({ ...form, kosten: e.target.value })} placeholder="0" /></label>
            <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>Notiz<input style={styles.inp} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
          </div>
          {probleme.length > 0 && <div style={styles.hinweisWarn}>Noch nötig: {probleme.join(' · ')}</div>}
          <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'neu' ? 0.6 : 1 }} disabled={busy === 'neu'} onClick={anlegen}>＋ Sendung anlegen</button>
        </div>
      )}

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : gefiltert.length === 0 ? (
        tab === 'retoure' ? (
          <Leerzustand icon="↩️" titel="Noch keine Retouren"
            text="Wenn ein Kunde etwas zurückschickt, legst du hier eine Retoure an — ARGONAUT druckt ein Rücksende-Etikett an dich und verfolgt den Status."
            schritte={['Oben „↩️ Neue Retoure" anlegen', 'Kundenadresse + Grund erfassen', '🖨 Rücksende-Label an den Kunden geben']}
            aktionText="↩️ Neue Retoure" onAktion={() => { setForm({ ...LEER, richtung: 'retoure' }); setFormAuf(true); }} />
        ) : (
          <Leerzustand icon="📦" titel="Noch keine Sendungen"
            text="Erfasse dein erstes Paket — ARGONAUT druckt dir ein Adress-Label und behält den Versandstatus im Blick."
            schritte={['Oben „＋ Neue Sendung" anlegen', 'Empfänger, Gewicht und Dienstleister erfassen', '🖨 Label drucken und Paket auf die Reise schicken']}
            aktionText="＋ Neue Sendung" onAktion={() => { setForm({ ...LEER, richtung: 'ausgehend' }); setFormAuf(true); }} />
        )
      ) : (
        <div style={styles.liste}>
          {gefiltert.map((s) => {
            const st = statusInfo(s.status);
            const track = trackingLink(s.carrier, s.tracking_nr);
            return (
              <div key={s.id} style={styles.item}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 700 }}>{adresseEinzeilig(s)}</div>
                  <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>
                    {carrierName(s.carrier)}{s.service ? ` · ${s.service}` : ''} · {formatGewicht(s.gewicht_kg)}{s.kosten ? ` · ${formatEuro(s.kosten)}` : ''}{s.referenz ? ` · ${s.referenz}` : ''}{istRetoure(s.richtung) && s.retoure_grund ? ` · ↩️ ${s.retoure_grund}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input style={styles.trackInp} placeholder="Tracking-Nr eintragen"
                      value={trackEntwurf[s.id] ?? (s.tracking_nr || '')} disabled={busy === s.id}
                      onChange={(e) => setTrackEntwurf((t) => ({ ...t, [s.id]: e.target.value }))} />
                    <button style={styles.mini} disabled={busy === s.id} onClick={() => trackingSpeichern(s)}>Speichern</button>
                    {track && <a href={track} target="_blank" rel="noreferrer" style={styles.miniLink}>🔎 Verfolgen</a>}
                  </div>
                </div>
                <span style={{ ...styles.badge, color: st.farbe, borderColor: st.farbe }}>{st.label}</span>
                <div style={styles.itemBtns}>
                  {verb?.verbunden && !istRetoure(s.richtung) && s.carrier !== 'spedition' && !s.label_url && (
                    <button style={{ ...styles.miniLink, background: C.gold, color: C.navy, borderColor: C.gold, cursor: 'pointer' }} disabled={busy === s.id} onClick={() => buchen(s)}>📮 Buchen</button>
                  )}
                  {s.label_url
                    ? <a href={s.label_url} target="_blank" rel="noreferrer" style={styles.miniLink}>🏷 Paketschein</a>
                    : <a href={`/api/versand/label?id=${encodeURIComponent(s.id)}`} target="_blank" rel="noreferrer" style={styles.miniLink}>🖨 Label</a>}
                  <select style={styles.sel} value={s.status} disabled={busy === s.id} onChange={(e) => statusSetzen(s, e.target.value)}>
                    {VERSAND_STATUS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                  </select>
                  <button style={styles.miniWeg} disabled={busy === s.id} onClick={() => loeschen(s)}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '10px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 22, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 18px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 18px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  verbBox: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12 },
  tabs: { display: 'flex', gap: 8, margin: '4px 0 14px', flexWrap: 'wrap' },
  tab: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 999, padding: '8px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAktiv: { background: 'rgba(201,168,76,0.12)', color: C.gold, borderColor: C.gold },
  richtungWahl: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  richtungOpt: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.text, cursor: 'pointer', border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 12px' },
  richtungAktiv: { borderColor: C.gold, color: C.gold, background: 'rgba(201,168,76,0.08)' },
  retoureHinweis: { color: C.cyan, background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.25)', borderRadius: 10, padding: '9px 13px', fontSize: 13, marginBottom: 12, lineHeight: 1.5 },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 },
  item: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', flexWrap: 'wrap' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  itemBtns: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  miniLink: { color: C.gold, textDecoration: 'none', fontWeight: 800, fontSize: 12.5, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px' },
  miniWeg: { background: 'transparent', color: C.danger, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  sel: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 8px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' },
  trackInp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 9px', fontSize: 13, fontFamily: 'inherit', width: 180, boxSizing: 'border-box' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  hinweisWarn: { color: C.warn, background: 'rgba(224,162,76,0.1)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '9px 13px', fontSize: 13, marginTop: 10 },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
