'use client';

// ============================================================
// ARGONAUT OS · Welle 3 · Schritt 4 · SEPA-Lastschrift (Rechnungen)
// Ein gemeinsames SEPA-Mandat je Kontakt — einmal erfassen, dann offene
// Rechnungen dieses Kontakts per Sammellastschrift (pain.008.001.02) einziehen.
// Gläubigerdaten liegen (wie im Mitglieder-Modul) am profiles-Datensatz.
// ARGONAUT erzeugt nur die Datei — der Einzug läuft über das Online-Banking.
// Pfad: app/dashboard/sepa-einzug/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { baueSepaXml, ibanGueltig, type SepaLastschrift } from '@/lib/sepa';
import { signaturStarten } from '@/lib/signaturStart';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Kontakt = { id: string; name: string; email: string | null };
type Mandat = {
  id?: string; kontakt_id: string; kontoinhaber: string | null; iban: string | null; bic: string | null;
  mandatsreferenz: string | null; mandat_datum: string | null; erst_einzug: boolean | null; aktiv: boolean | null;
};
type Rechnung = {
  id: string; rechnungsnummer: string | null; kontakt_id: string | null; brutto_summe: number | null;
  faelligkeitsdatum: string | null; titel: string | null; empfaenger_name: string | null;
  zahlungsstatus: string; bezahlt_am: string | null;
};

function eur(n: number | null | undefined) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function heutePlus(tage: number) { return new Date(Date.now() + tage * 86400000).toISOString().slice(0, 10); }
function ibanKurz(iban: string | null | undefined) { const s = (iban || '').replace(/\s+/g, ''); return s ? `${s.slice(0, 4)} … ${s.slice(-4)}` : '—'; }
function kontaktName(k: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return s(k.anzeigename) || [s(k.vorname), s(k.nachname)].filter(Boolean).join(' ') || s(k.name) || s(k.firmenname) || s(k.firma) || s(k.email) || 'Kontakt';
}

export default function SepaEinzugPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [firma, setFirma] = useState('');
  const [cred, setCred] = useState({ glaeubiger: '', inhaber: '', iban: '', bic: '' });
  const [credBusy, setCredBusy] = useState(false);

  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [mandate, setMandate] = useState<Record<string, Mandat>>({});
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
  const [auswahl, setAuswahl] = useState<Record<string, boolean>>({});
  const [ausfuehrung, setAusfuehrung] = useState(heutePlus(6));

  const [mform, setMform] = useState<Mandat>({ kontakt_id: '', kontoinhaber: '', iban: '', bic: '', mandatsreferenz: '', mandat_datum: '', erst_einzug: true, aktiv: true });
  const [mbusy, setMbusy] = useState(false);

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const kontaktMap = useMemo(() => {
    const m: Record<string, string> = {};
    kontakte.forEach((k) => { m[k.id] = k.name; });
    return m;
  }, [kontakte]);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data: kData } = await supabase.from('kontakte').select('*');
      const ks: Kontakt[] = ((kData as Record<string, unknown>[]) || []).map((k) => ({
        id: String(k.id), name: kontaktName(k), email: (typeof k.email === 'string' ? k.email : null),
      })).sort((a, b) => a.name.localeCompare(b.name));
      setKontakte(ks);

      const { data: mData } = await supabase.from('kunden_mandate').select('*');
      const mm: Record<string, Mandat> = {};
      ((mData as Mandat[]) || []).forEach((m) => { mm[m.kontakt_id] = m; });
      setMandate(mm);

      const { data: rData } = await supabase.from('rechnungen')
        .select('id, rechnungsnummer, kontakt_id, brutto_summe, faelligkeitsdatum, titel, empfaenger_name, zahlungsstatus, bezahlt_am')
        .order('faelligkeitsdatum', { ascending: true });
      const offen = ((rData as Rechnung[]) || []).filter((r) =>
        !r.bezahlt_am && r.zahlungsstatus !== 'bezahlt' && r.zahlungsstatus !== 'storniert' && (Number(r.brutto_summe) || 0) > 0
      );
      setRechnungen(offen);
    } catch (e: unknown) {
      setFehler('Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const { data: p } = await supabase.from('profiles')
        .select('firma_name, sepa_glaeubiger_id, sepa_kontoinhaber, sepa_iban, sepa_bic').eq('id', id).maybeSingle();
      setFirma((p?.firma_name as string) || '');
      setCred({
        glaeubiger: (p?.sepa_glaeubiger_id as string) || '',
        inhaber: (p?.sepa_kontoinhaber as string) || (p?.firma_name as string) || '',
        iban: (p?.sepa_iban as string) || '', bic: (p?.sepa_bic as string) || '',
      });
      await laden_();
    })();
  }, [laden_]);

  async function credSpeichern() {
    if (!uid) return;
    setCredBusy(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('profiles').update({
        sepa_glaeubiger_id: cred.glaeubiger.trim() || null, sepa_kontoinhaber: cred.inhaber.trim() || null,
        sepa_iban: cred.iban.replace(/\s+/g, '').toUpperCase() || null, sepa_bic: cred.bic.replace(/\s+/g, '').toUpperCase() || null,
      }).eq('id', uid);
      if (error) throw error;
      setOk('Gläubigerdaten gespeichert.'); setTimeout(() => setOk(null), 2500);
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setCredBusy(false); }
  }

  function mandatWaehlen(kontaktId: string) {
    const vorhanden = mandate[kontaktId];
    if (vorhanden) {
      setMform({ ...vorhanden, kontoinhaber: vorhanden.kontoinhaber || kontaktMap[kontaktId] || '', mandat_datum: vorhanden.mandat_datum || '' });
    } else {
      setMform({ kontakt_id: kontaktId, kontoinhaber: kontaktMap[kontaktId] || '', iban: '', bic: '', mandatsreferenz: '', mandat_datum: '', erst_einzug: true, aktiv: true });
    }
  }

  async function mandatSpeichern() {
    if (!uid) return;
    if (!mform.kontakt_id) { setFehler('Bitte einen Kontakt wählen.'); return; }
    const iban = (mform.iban || '').replace(/\s+/g, '').toUpperCase();
    if (!ibanGueltig(iban)) { setFehler('Die IBAN ist ungültig (Prüfsumme stimmt nicht).'); return; }
    if (!(mform.mandatsreferenz || '').trim() || !mform.mandat_datum) { setFehler('Mandatsreferenz und Mandatsdatum sind Pflicht.'); return; }
    setMbusy(true); setFehler(null); setOk(null);
    try {
      const payload = {
        owner_user_id: uid, kontakt_id: mform.kontakt_id,
        kontoinhaber: (mform.kontoinhaber || '').trim() || null, iban,
        bic: (mform.bic || '').replace(/\s+/g, '').toUpperCase() || null,
        mandatsreferenz: (mform.mandatsreferenz || '').trim(), mandat_datum: mform.mandat_datum,
        aktiv: mform.aktiv !== false, updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('kunden_mandate').upsert(payload, { onConflict: 'owner_user_id,kontakt_id' });
      if (error) throw error;
      setOk('Mandat gespeichert.');
      setMform({ kontakt_id: '', kontoinhaber: '', iban: '', bic: '', mandatsreferenz: '', mandat_datum: '', erst_einzug: true, aktiv: true });
      await laden_();
    } catch (e: unknown) {
      setFehler('Mandat speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setMbusy(false); }
  }

  async function mandatUnterschrift(m: Mandat) {
    if (!uid) return;
    setFehler(null); setOk(null);
    const k = kontakte.find((x) => x.id === m.kontakt_id);
    const dok = `SEPA-LASTSCHRIFTMANDAT\n\nGläubiger: ${cred.inhaber || '—'}\nGläubiger-ID: ${cred.glaeubiger || '—'}\nZahlungspflichtiger: ${kontaktMap[m.kontakt_id] || '—'}\nIBAN: ${ibanKurz(m.iban)}\nMandatsreferenz: ${m.mandatsreferenz || '—'}\n\nIch ermächtige den oben genannten Gläubiger, Zahlungen von meinem Konto mittels SEPA-Lastschrift einzuziehen. Zugleich weise ich mein Kreditinstitut an, die vom Gläubiger auf mein Konto gezogenen Lastschriften einzulösen. Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen.`;
    const r = await signaturStarten(supabase, uid, {
      titel: `SEPA-Mandat ${m.mandatsreferenz || ''}`.trim(), empfaenger_name: kontaktMap[m.kontakt_id],
      empfaenger_email: k?.email || null, kontakt_id: m.kontakt_id, dokument: dok,
    });
    if (!r.ok) { setFehler(r.error || 'Signatur-Anfrage fehlgeschlagen.'); return; }
    try { await navigator.clipboard.writeText(r.link || ''); } catch { /* egal */ }
    setOk(`Unterschrifts-Link erstellt & kopiert: ${r.link}`);
  }

  // Einziehbar: offene Rechnung + Kontakt hat ein aktives, gültiges Mandat.
  const einziehbar = useMemo(() => rechnungen.filter((r) => {
    const m = r.kontakt_id ? mandate[r.kontakt_id] : undefined;
    return !!m && m.aktiv !== false && !!m.iban && ibanGueltig(m.iban) && !!m.mandatsreferenz && !!m.mandat_datum;
  }), [rechnungen, mandate]);

  const gewaehlt = useMemo(() => einziehbar.filter((r) => auswahl[r.id]), [einziehbar, auswahl]);
  const summeGewaehlt = useMemo(() => gewaehlt.reduce((s, r) => s + (Number(r.brutto_summe) || 0), 0), [gewaehlt]);

  function alleWaehlen(an: boolean) {
    const next: Record<string, boolean> = {};
    if (an) einziehbar.forEach((r) => { next[r.id] = true; });
    setAuswahl(next);
  }

  async function sepaErzeugen() {
    setFehler(null); setOk(null);
    if (!cred.glaeubiger.trim() || !cred.iban.trim() || !cred.inhaber.trim()) {
      setFehler('Bitte zuerst die Gläubigerdaten (Gläubiger-ID, Kontoinhaber, IBAN) oben speichern.'); return;
    }
    if (!ibanGueltig(cred.iban)) { setFehler('Deine Gläubiger-IBAN ist ungültig (Prüfsumme stimmt nicht).'); return; }
    if (!gewaehlt.length) { setFehler('Bitte mindestens eine Rechnung mit gültigem Mandat auswählen.'); return; }

    // Je Mandat nur EINE Sequenz (FRST/RCUR) je Datei — nach Mandat gruppieren.
    const genutzteMandate = new Set<string>();
    const posten: SepaLastschrift[] = gewaehlt.map((r) => {
      const m = mandate[r.kontakt_id as string];
      const erst = m.erst_einzug !== false && !genutzteMandate.has(r.kontakt_id as string);
      genutzteMandate.add(r.kontakt_id as string);
      return {
        name: kontaktMap[r.kontakt_id as string] || r.empfaenger_name || 'Kunde',
        iban: (m.iban as string).replace(/\s+/g, '').toUpperCase(),
        bic: m.bic || undefined,
        betrag: Number(r.brutto_summe) || 0,
        mandatsreferenz: m.mandatsreferenz as string,
        mandatDatum: m.mandat_datum as string,
        verwendungszweck: `Rechnung ${r.rechnungsnummer || ''}`.trim(),
        endToEndId: (r.rechnungsnummer || r.id).slice(0, 35),
        seqTp: erst ? 'FRST' : 'RCUR',
      };
    });

    const msgId = 'ARGO' + Date.now();
    const creDtTm = new Date().toISOString().slice(0, 19);
    const xml = baueSepaXml(
      { name: cred.inhaber.trim(), iban: cred.iban.replace(/\s+/g, '').toUpperCase(), bic: cred.bic.replace(/\s+/g, '').toUpperCase() || undefined, glaeubigerId: cred.glaeubiger.trim() },
      posten, ausfuehrung, msgId, creDtTm,
    );
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `SEPA-Rechnungen_${ausfuehrung}.xml`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);

    // Genutzte Mandate fortschreiben: nächster Einzug = Folge-Lastschrift (RCUR).
    try {
      const ids = [...genutzteMandate].map((kid) => mandate[kid]?.id).filter(Boolean) as string[];
      if (ids.length) await supabase.from('kunden_mandate').update({ erst_einzug: false, letzte_einziehung: ausfuehrung }).in('id', ids);
      await laden_();
    } catch { /* Datei ist erzeugt; Fortschreiben ist Zugabe */ }

    setAuswahl({});
    setOk(`SEPA-Datei mit ${posten.length} Lastschrift(en) über ${eur(summeGewaehlt)} erzeugt.`);
  }

  const ohneMandat = useMemo(() => {
    const s = new Set(einziehbar.map((r) => r.id));
    return rechnungen.filter((r) => !s.has(r.id));
  }, [rechnungen, einziehbar]);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>💶 SEPA-Lastschrift (Rechnungen)</h1>
      <p style={styles.sub}>
        Ein Mandat je Kontakt einmal erfassen — dann offene Rechnungen dieses Kontakts als Sammellastschrift einziehen.
        ARGONAUT erzeugt nur die Datei fürs Online-Banking; das Geld zieht Ihre Bank ein.
      </p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.green }}>{Object.keys(mandate).length}</div><div style={styles.kLabel}>Mandate</div></div>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.cyan }}>{einziehbar.length}</div><div style={styles.kLabel}>einziehbar</div></div>
        <div style={styles.kpi}><div style={{ ...styles.kWert, color: C.gold }}>{eur(summeGewaehlt)}</div><div style={styles.kLabel}>ausgewählt</div></div>
      </div>

      {/* Gläubigerdaten */}
      <div style={styles.card}>
        <div style={styles.cardTitel}>🏦 Deine SEPA-Gläubigerdaten</div>
        <p style={styles.cardSub}>Einmal hinterlegen — kommt in jede Lastschrift-Datei. Die Gläubiger-ID gibt es kostenlos bei der Deutschen Bundesbank.</p>
        <div style={styles.grid2}>
          <label style={styles.lab}>Gläubiger-ID<input style={styles.inp} value={cred.glaeubiger} onChange={(e) => setCred((c) => ({ ...c, glaeubiger: e.target.value }))} placeholder="DE98ZZZ09999999999" /></label>
          <label style={styles.lab}>Kontoinhaber<input style={styles.inp} value={cred.inhaber} onChange={(e) => setCred((c) => ({ ...c, inhaber: e.target.value }))} /></label>
          <label style={styles.lab}>IBAN (Empfänger)<input style={styles.inp} value={cred.iban} onChange={(e) => setCred((c) => ({ ...c, iban: e.target.value }))} placeholder="DE.." /></label>
          <label style={styles.lab}>BIC (optional)<input style={styles.inp} value={cred.bic} onChange={(e) => setCred((c) => ({ ...c, bic: e.target.value }))} /></label>
        </div>
        <button onClick={credSpeichern} disabled={credBusy} style={{ ...styles.ghost, marginTop: 12, opacity: credBusy ? 0.6 : 1 }}>{credBusy ? 'Speichert …' : 'Gläubigerdaten speichern'}</button>
      </div>

      {/* Mandat erfassen */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={styles.cardTitel}>📝 Mandat je Kontakt</div>
        <p style={styles.cardSub}>Kontakt wählen, IBAN + Mandatsreferenz + Unterschriftsdatum eintragen. Ein Mandat gilt für alle Rechnungen dieses Kontakts.</p>
        <div style={styles.grid2}>
          <label style={styles.lab}>Kontakt
            <select style={styles.inp} value={mform.kontakt_id} onChange={(e) => mandatWaehlen(e.target.value)}>
              <option value="">— Kontakt wählen —</option>
              {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}{mandate[k.id] ? ' ✓' : ''}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Kontoinhaber<input style={styles.inp} value={mform.kontoinhaber || ''} onChange={(e) => setMform((f) => ({ ...f, kontoinhaber: e.target.value }))} /></label>
          <label style={styles.lab}>IBAN<input style={styles.inp} value={mform.iban || ''} onChange={(e) => setMform((f) => ({ ...f, iban: e.target.value }))} placeholder="DE.." /></label>
          <label style={styles.lab}>BIC (optional)<input style={styles.inp} value={mform.bic || ''} onChange={(e) => setMform((f) => ({ ...f, bic: e.target.value }))} /></label>
          <label style={styles.lab}>Mandatsreferenz<input style={styles.inp} value={mform.mandatsreferenz || ''} onChange={(e) => setMform((f) => ({ ...f, mandatsreferenz: e.target.value }))} placeholder="eindeutig, z. B. K-2026-001" /></label>
          <label style={styles.lab}>Mandat unterschrieben am<input type="date" style={styles.inp} value={mform.mandat_datum || ''} onChange={(e) => setMform((f) => ({ ...f, mandat_datum: e.target.value }))} /></label>
        </div>
        <button onClick={mandatSpeichern} disabled={mbusy || !mform.kontakt_id} style={{ ...styles.primaer, marginTop: 12, opacity: (mbusy || !mform.kontakt_id) ? 0.6 : 1 }}>{mbusy ? 'Speichert …' : '💾 Mandat speichern'}</button>

        {Object.keys(mandate).length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.values(mandate).map((m) => (
              <div key={m.kontakt_id} style={styles.mandZeile}>
                <span style={{ fontWeight: 700, flex: 1 }}>{kontaktMap[m.kontakt_id] || 'Kontakt'}</span>
                <span style={{ color: C.textDim }}>{ibanKurz(m.iban)}</span>
                <span style={{ color: C.textDim, fontSize: 12.5 }}>Ref: {m.mandatsreferenz || '—'}</span>
                <span style={{ ...styles.badge, color: m.erst_einzug === false ? C.cyan : C.gold, borderColor: m.erst_einzug === false ? C.cyan : C.gold }}>{m.erst_einzug === false ? 'RCUR' : 'FRST'}</span>
                <button style={styles.mini} onClick={() => mandatUnterschrift(m)}>✍️ unterschreiben</button>
                <button style={styles.mini} onClick={() => mandatWaehlen(m.kontakt_id)}>Bearbeiten</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Einzug */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={styles.cardTitel}>💶 Offene Rechnungen einziehen</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}>
          <label style={styles.lab}>Fälligkeitstag (Ausführung)<input type="date" style={{ ...styles.inp, maxWidth: 200 }} value={ausfuehrung} onChange={(e) => setAusfuehrung(e.target.value)} /></label>
          <button style={styles.ghost} onClick={() => alleWaehlen(true)}>Alle wählen</button>
          <button style={styles.ghost} onClick={() => alleWaehlen(false)}>Keine</button>
          <button style={styles.primaer} onClick={sepaErzeugen}>⭱ SEPA-Datei erzeugen ({gewaehlt.length})</button>
        </div>

        {laden ? <p style={styles.dim}>Lädt …</p> : einziehbar.length === 0 ? (
          <p style={styles.dim}>Keine einziehbaren Rechnungen. Es braucht eine offene Rechnung, deren Kontakt ein gültiges Mandat hat.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {einziehbar.map((r) => {
              const m = mandate[r.kontakt_id as string];
              const seq = m?.erst_einzug === false ? 'RCUR' : 'FRST';
              return (
                <label key={r.id} style={styles.rZeile}>
                  <input type="checkbox" checked={!!auswahl[r.id]} onChange={(e) => setAuswahl((a) => ({ ...a, [r.id]: e.target.checked }))} />
                  <span style={{ fontWeight: 700, color: C.gold, minWidth: 96 }}>{r.rechnungsnummer || '—'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{kontaktMap[r.kontakt_id as string] || r.empfaenger_name || '—'}</span>
                  <span style={{ ...styles.badge, color: seq === 'RCUR' ? C.cyan : C.gold, borderColor: seq === 'RCUR' ? C.cyan : C.gold }}>{seq}</span>
                  <span style={{ fontWeight: 700, minWidth: 96, textAlign: 'right' }}>{eur(r.brutto_summe)}</span>
                </label>
              );
            })}
          </div>
        )}

        {ohneMandat.length > 0 && (
          <div style={styles.hinweis}>
            {ohneMandat.length} offene Rechnung(en) ohne (gültiges) Mandat werden hier nicht angezeigt — erfasse oben ein Mandat für den jeweiligen Kontakt.
          </div>
        )}

        <div style={styles.infoBox}>
          <b style={{ color: C.text }}>So funktioniert&apos;s:</b> ARGONAUT erzeugt die SEPA-Datei (Download). Sie laden sie in Ihr Online-Banking
          („Sammellastschrift / SEPA-Datei importieren"). Die Bank zieht am Fälligkeitstag ein. Erster Einzug eines Mandats = „FRST",
          Folge-Einzüge automatisch „RCUR". Voraussetzung: Gläubiger-ID, unterschriebenes Mandat und Vorabinformation an den Kunden.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 780 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '16px 0' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px', textAlign: 'center' },
  kWert: { fontSize: 26, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 12.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 17 },
  cardSub: { color: C.textDim, fontSize: 13.5, lineHeight: 1.5, margin: '6px 0 12px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 11px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' },
  mandZeile: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  rZeile: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 14px', fontSize: 14, cursor: 'pointer' },
  badge: { border: '1px solid', borderRadius: 999, padding: '2px 9px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' },
  hinweis: { marginTop: 12, background: 'rgba(224,162,76,0.08)', border: `1px solid ${C.warn}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.text },
  infoBox: { marginTop: 12, background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.22)', borderRadius: 12, padding: '13px 16px', color: C.textDim, fontSize: 12.5, lineHeight: 1.55 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
