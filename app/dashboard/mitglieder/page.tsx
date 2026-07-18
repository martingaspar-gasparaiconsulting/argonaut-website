'use client';

// ============================================================
// ARGONAUT OS · Bündel 8 · Mitglieds-/Abo-Verwaltung mit SEPA
// Mitglieder/Abos pflegen (Beitrag, Intervall, Mandat, IBAN) und daraus eine
// SEPA-Basislastschrift (pain.008.001.02) fürs Bankprogramm erzeugen.
// Gläubigerdaten liegen am Profil. Pfad: app/dashboard/mitglieder/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { baueSepaXml, ibanGueltig, type SepaLastschrift } from '@/lib/sepa';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C', line: 'rgba(201,168,76,0.18)',
};

type Mitglied = {
  id: string; name: string; email: string | null; telefon: string | null;
  betrag: number | null; intervall: string; status: string;
  beginn_am: string | null; kuendigung_zum: string | null;
  iban: string | null; bic: string | null; mandatsreferenz: string | null; mandat_datum: string | null;
  notiz: string | null; erst_einzug?: boolean | null; letzte_einziehung?: string | null;
};
type MForm = {
  id: string | null; name: string; email: string; telefon: string; betrag: string;
  intervall: string; status: string; beginn_am: string; iban: string; bic: string;
  mandatsreferenz: string; mandat_datum: string; notiz: string;
};
const LEER: MForm = {
  id: null, name: '', email: '', telefon: '', betrag: '', intervall: 'monat', status: 'aktiv',
  beginn_am: '', iban: '', bic: '', mandatsreferenz: '', mandat_datum: '', notiz: '',
};
const INTERVALLE = [{ w: 'monat', l: 'monatlich' }, { w: 'quartal', l: 'vierteljährlich' }, { w: 'jahr', l: 'jährlich' }];
const STATUS = [{ w: 'aktiv', l: 'Aktiv', f: '#4CAF7D' }, { w: 'pausiert', l: 'Pausiert', f: '#E0A24C' }, { w: 'gekuendigt', l: 'Gekündigt', f: '#E06666' }];
function statusInfo(s: string) { return STATUS.find((x) => x.w === s) ?? { w: s, l: s, f: C.textDim }; }
function eur(n: number | null) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function num(s: string): number { return parseFloat((s || '').replace(',', '.')) || 0; }
function heutePlus(tage: number) { return new Date(Date.now() + tage * 86400000).toISOString().slice(0, 10); }

export default function MitgliederPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [firma, setFirma] = useState('');
  const [cred, setCred] = useState({ glaeubiger: '', inhaber: '', iban: '', bic: '' });
  const [credBusy, setCredBusy] = useState(false);
  const [liste, setListe] = useState<Mitglied[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<MForm>(LEER);
  const [speichert, setSpeichert] = useState(false);
  const [ausfuehrung, setAusfuehrung] = useState(heutePlus(6));

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
    })();
  }, []);

  const laden_ = useCallback(async () => {
    if (!uid) return;
    setLaden(true); setFehler(null);
    try {
      const { data, error } = await supabase.from('mitglieder').select('*').order('name', { ascending: true });
      if (error) throw error;
      setListe((data as Mitglied[]) ?? []);
    } catch (e: unknown) {
      setFehler('Mitglieder konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid]);
  useEffect(() => { void laden_(); }, [laden_]);

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

  function neu() { setForm(LEER); setModal(true); }
  function bearbeiten(m: Mitglied) {
    setForm({
      id: m.id, name: m.name ?? '', email: m.email ?? '', telefon: m.telefon ?? '',
      betrag: m.betrag != null ? String(m.betrag) : '', intervall: m.intervall ?? 'monat', status: m.status ?? 'aktiv',
      beginn_am: m.beginn_am ?? '', iban: m.iban ?? '', bic: m.bic ?? '',
      mandatsreferenz: m.mandatsreferenz ?? '', mandat_datum: m.mandat_datum ?? '', notiz: m.notiz ?? '',
    });
    setModal(true);
  }
  function setF<K extends keyof MForm>(k: K, v: MForm[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function speichern() {
    if (!uid) return;
    if (!form.name.trim()) { setFehler('Bitte einen Namen angeben.'); return; }
    setSpeichert(true); setFehler(null);
    try {
      const payload = {
        owner_user_id: uid, name: form.name.trim(), email: form.email.trim() || null, telefon: form.telefon.trim() || null,
        betrag: form.betrag.trim() ? num(form.betrag) : null, intervall: form.intervall, status: form.status,
        beginn_am: form.beginn_am || null, iban: form.iban.replace(/\s+/g, '').toUpperCase() || null, bic: form.bic.replace(/\s+/g, '').toUpperCase() || null,
        mandatsreferenz: form.mandatsreferenz.trim() || null, mandat_datum: form.mandat_datum || null, notiz: form.notiz.trim() || null,
      };
      if (form.id) {
        const { error } = await supabase.from('mitglieder').update(payload).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('mitglieder').insert(payload);
        if (error) throw error;
      }
      setModal(false); await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }
  async function loeschen(m: Mitglied) {
    if (!window.confirm(`Mitglied „${m.name}" löschen?`)) return;
    try {
      const { error } = await supabase.from('mitglieder').delete().eq('id', m.id);
      if (error) throw error;
      setModal(false); await laden_();
    } catch (e: unknown) {
      setFehler('Löschen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  const aktive = useMemo(() => liste.filter((m) => m.status === 'aktiv'), [liste]);
  const einziehbar = useMemo(() => aktive.filter((m) => m.iban && m.mandatsreferenz && m.mandat_datum && (m.betrag ?? 0) > 0), [aktive]);
  const monatsumsatz = useMemo(() => aktive.reduce((s, m) => {
    const b = m.betrag ?? 0; const teiler = m.intervall === 'jahr' ? 12 : m.intervall === 'quartal' ? 3 : 1;
    return s + b / teiler;
  }, 0), [aktive]);

  async function sepaErzeugen() {
    setFehler(null); setOk(null);
    if (!cred.glaeubiger.trim() || !cred.iban.trim() || !cred.inhaber.trim()) {
      setFehler('Bitte zuerst die Gläubigerdaten (Gläubiger-ID, Kontoinhaber, IBAN) oben speichern.'); return;
    }
    if (!ibanGueltig(cred.iban)) { setFehler('Deine Gläubiger-IBAN ist ungültig (Prüfsumme stimmt nicht). Bitte oben korrigieren.'); return; }
    if (!einziehbar.length) {
      setFehler('Keine einziehbaren Mitglieder: es braucht Status „aktiv", IBAN, Mandatsreferenz, Mandatsdatum und einen Betrag > 0.'); return;
    }
    // Nur Mitglieder mit gültiger IBAN-Prüfsumme aufnehmen.
    const gueltige = einziehbar.filter((m) => ibanGueltig(m.iban as string));
    const ungueltige = einziehbar.length - gueltige.length;
    if (!gueltige.length) { setFehler('Keine gültige IBAN gefunden — bitte die IBANs prüfen (Prüfsumme falsch).'); return; }

    const posten: SepaLastschrift[] = gueltige.map((m) => ({
      name: m.name, iban: m.iban as string, bic: m.bic || undefined, betrag: m.betrag as number,
      mandatsreferenz: m.mandatsreferenz as string, mandatDatum: m.mandat_datum as string,
      verwendungszweck: `Beitrag ${firma || ''}`.trim() || 'Beitrag',
      seqTp: (m.erst_einzug !== false) ? 'FRST' : 'RCUR',  // erster Einzug = FRST, sonst RCUR
    }));
    const msgId = 'ARGO' + Date.now();
    const creDtTm = new Date().toISOString().slice(0, 19);
    const xml = baueSepaXml(
      { name: cred.inhaber.trim(), iban: cred.iban.replace(/\s+/g, '').toUpperCase(), bic: cred.bic.replace(/\s+/g, '').toUpperCase() || undefined, glaeubigerId: cred.glaeubiger.trim() },
      posten, ausfuehrung, msgId, creDtTm,
    );
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `SEPA-Lastschrift_${ausfuehrung}.xml`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);

    // Nach dem Erzeugen fortschreiben: nächster Einzug ist Folge-Lastschrift (RCUR).
    try {
      await supabase.from('mitglieder').update({ erst_einzug: false, letzte_einziehung: ausfuehrung }).in('id', gueltige.map((m) => m.id));
      await laden_();
    } catch { /* Datei ist erzeugt; Fortschreiben ist Zugabe */ }

    const summe = posten.reduce((s, p) => s + p.betrag, 0);
    setOk(`SEPA-Datei mit ${posten.length} Lastschrift(en) über ${eur(summe)} erzeugt.` + (ungueltige > 0 ? ` ${ungueltige} mit ungültiger IBAN wurden ausgelassen.` : ''));
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Beiträge & Abos</div>
      <h1 style={styles.h1}>Mitglieder &amp; Abos</h1>
      <p style={styles.sub}>Beiträge und Laufzeit-Verträge verwalten und per SEPA-Lastschrift einziehen (Datei fürs Bankprogramm).</p>

      <div style={styles.summenGrid}>
        <SummeKarte label="Aktive" value={String(aktive.length)} accent={C.green} />
        <SummeKarte label="≈ Umsatz / Monat" value={eur(monatsumsatz)} accent={C.gold} />
        <SummeKarte label="Einziehbar" value={String(einziehbar.length)} accent={C.cyan} />
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {/* Gläubigerdaten */}
      <div style={styles.card}>
        <h2 style={styles.cardTitel}>🏦 Deine SEPA-Gläubigerdaten</h2>
        <p style={{ color: C.textDim, fontSize: 'clamp(12.5px, 1.06vw, 17px)', margin: '0 0 12px' }}>
          Einmal hinterlegen — kommt in jede Lastschrift-Datei. Die Gläubiger-ID bekommst du bei der Deutschen Bundesbank (kostenlos).
        </p>
        <div style={styles.formGrid}>
          <div><label style={styles.lbl}>Gläubiger-ID</label><input style={styles.input} value={cred.glaeubiger} onChange={(e) => setCred((c) => ({ ...c, glaeubiger: e.target.value }))} placeholder="DE98ZZZ09999999999" /></div>
          <div><label style={styles.lbl}>Kontoinhaber</label><input style={styles.input} value={cred.inhaber} onChange={(e) => setCred((c) => ({ ...c, inhaber: e.target.value }))} /></div>
          <div><label style={styles.lbl}>IBAN (Empfänger)</label><input style={styles.input} value={cred.iban} onChange={(e) => setCred((c) => ({ ...c, iban: e.target.value }))} placeholder="DE.." /></div>
          <div><label style={styles.lbl}>BIC (optional)</label><input style={styles.input} value={cred.bic} onChange={(e) => setCred((c) => ({ ...c, bic: e.target.value }))} /></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={credSpeichern} disabled={credBusy} style={{ ...styles.ghostBtn, opacity: credBusy ? 0.6 : 1 }}>{credBusy ? 'Speichert …' : 'Gläubigerdaten speichern'}</button>
        </div>
      </div>

      {/* SEPA erzeugen */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <h2 style={styles.cardTitel}>💶 SEPA-Lastschrift erzeugen</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div><label style={styles.lbl}>Fälligkeitstag (Ausführung)</label><input type="date" style={{ ...styles.input, maxWidth: 200 }} value={ausfuehrung} onChange={(e) => setAusfuehrung(e.target.value)} /></div>
          <button onClick={sepaErzeugen} style={styles.primaer}>⭱ SEPA-Datei erzeugen ({einziehbar.length})</button>
        </div>
        <div style={styles.infoBox}>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>So funktioniert's:</div>
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            <li>ARGONAUT erzeugt die <b>SEPA-Datei</b> (Download) — es überweist selbst kein Geld.</li>
            <li>Du lädst die Datei in dein <b>Online-Banking</b> hoch („SEPA-Datei / Sammellastschrift importieren") oder in ein Banking-Programm (SFirm, StarMoney, ProfiCash …).</li>
            <li>Die <b>Bank zieht</b> am Fälligkeitstag von den Mitglieder-Konten ein → das Geld landet auf deinem Konto.</li>
          </ol>
          <div style={{ marginTop: 8 }}>
            Voraussetzungen: <b>Gläubiger-ID</b> (kostenlos bei der Deutschen Bundesbank), ein <b>unterschriebenes Mandat</b> je
            Mitglied und eine <b>Vorabinformation</b> vor dem Einzug. Der erste Einzug eines Mandats läuft als „FRST",
            Folge-Einzüge automatisch als „RCUR" — IBANs werden per Prüfsumme kontrolliert.
          </div>
        </div>
      </div>

      {/* Liste */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <h2 style={{ ...styles.cardTitel, margin: 0 }}>Mitglieder</h2>
          <button onClick={neu} style={styles.primaer}>+ Neues Mitglied</button>
        </div>
        {laden ? <div style={styles.hint}>Lädt …</div> : liste.length === 0 ? (
          <div style={styles.hint}>Noch keine Mitglieder. Leg oben rechts das erste an.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>Name</th><th style={styles.th}>Beitrag</th><th style={styles.th}>Mandat / IBAN</th><th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}></th>
              </tr></thead>
              <tbody>
                {liste.map((m) => {
                  const si = statusInfo(m.status);
                  const intv = INTERVALLE.find((i) => i.w === m.intervall)?.l ?? m.intervall;
                  const bereit = m.iban && m.mandatsreferenz && m.mandat_datum;
                  return (
                    <tr key={m.id}>
                      <td style={styles.td}><div style={{ fontWeight: 600 }}>{m.name}</div>{m.email && <div style={{ color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)' }}>{m.email}</div>}</td>
                      <td style={styles.td}>{m.betrag != null ? `${eur(m.betrag)} / ${intv}` : '—'}</td>
                      <td style={styles.td}>{bereit ? <span style={{ color: C.green }}>✓ Mandat</span> : <span style={{ color: C.warn }}>fehlt</span>}</td>
                      <td style={styles.td}><span style={{ color: si.f }}>{si.l}</span></td>
                      <td style={{ ...styles.td, textAlign: 'right' }}><button onClick={() => bearbeiten(m)} style={styles.miniBtnGhost}>Bearbeiten</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div style={styles.overlay} onClick={() => !speichert && setModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>{form.id ? 'Mitglied bearbeiten' : 'Neues Mitglied'}</h2>
            <div style={styles.formGrid}>
              <div style={{ gridColumn: '1 / -1' }}><label style={styles.lbl}>Name *</label><input style={styles.input} value={form.name} onChange={(e) => setF('name', e.target.value)} /></div>
              <div><label style={styles.lbl}>E-Mail</label><input style={styles.input} value={form.email} onChange={(e) => setF('email', e.target.value)} /></div>
              <div><label style={styles.lbl}>Telefon</label><input style={styles.input} value={form.telefon} onChange={(e) => setF('telefon', e.target.value)} /></div>
              <div><label style={styles.lbl}>Beitrag (€)</label><input style={styles.input} value={form.betrag} onChange={(e) => setF('betrag', e.target.value)} placeholder="z. B. 29,90" /></div>
              <div><label style={styles.lbl}>Intervall</label><select style={styles.input} value={form.intervall} onChange={(e) => setF('intervall', e.target.value)}>{INTERVALLE.map((i) => <option key={i.w} value={i.w}>{i.l}</option>)}</select></div>
              <div><label style={styles.lbl}>Status</label><select style={styles.input} value={form.status} onChange={(e) => setF('status', e.target.value)}>{STATUS.map((s) => <option key={s.w} value={s.w}>{s.l}</option>)}</select></div>
              <div><label style={styles.lbl}>Beginn</label><input type="date" style={styles.input} value={form.beginn_am} onChange={(e) => setF('beginn_am', e.target.value)} /></div>
              <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4, color: C.gold, fontWeight: 700, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>SEPA-Mandat</div>
              <div><label style={styles.lbl}>IBAN</label><input style={styles.input} value={form.iban} onChange={(e) => setF('iban', e.target.value)} placeholder="DE.." /></div>
              <div><label style={styles.lbl}>BIC (optional)</label><input style={styles.input} value={form.bic} onChange={(e) => setF('bic', e.target.value)} /></div>
              <div><label style={styles.lbl}>Mandatsreferenz</label><input style={styles.input} value={form.mandatsreferenz} onChange={(e) => setF('mandatsreferenz', e.target.value)} placeholder="eindeutig, z. B. M-2025-001" /></div>
              <div><label style={styles.lbl}>Mandat unterschrieben am</label><input type="date" style={styles.input} value={form.mandat_datum} onChange={(e) => setF('mandat_datum', e.target.value)} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={styles.lbl}>Notiz</label><textarea style={{ ...styles.input, minHeight: 44, resize: 'vertical' }} value={form.notiz} onChange={(e) => setF('notiz', e.target.value)} /></div>
            </div>
            <div style={styles.modalAktionen}>
              {form.id && <button onClick={() => loeschen(liste.find((x) => x.id === form.id) as Mitglied)} disabled={speichert} style={{ ...styles.ghostBtn, color: C.danger, borderColor: C.danger, marginRight: 'auto' }}>Löschen</button>}
              <button onClick={() => setModal(false)} disabled={speichert} style={styles.ghostBtn}>Abbrechen</button>
              <button onClick={speichern} disabled={speichert} style={{ ...styles.primaer, opacity: speichert ? 0.6 : 1 }}>{speichert ? 'Speichert …' : (form.id ? 'Speichern' : 'Anlegen')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummeKarte({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.summeBox}><div style={styles.summeLabel}>{label}</div><div style={{ ...styles.summeValue, color: accent || C.text }}>{value}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 20px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 700, lineHeight: 1.5 },
  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(22px, 2vw, 32px)', fontWeight: 800 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(17px, 1.5vw, 24px)', fontWeight: 700, margin: '0 0 8px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  lbl: { display: 'block', fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit' },
  primaer: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit', cursor: 'pointer' },
  miniBtnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontFamily: 'inherit', cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '11px 10px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'top' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '14px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 },
  infoBox: { marginTop: 12, background: 'rgba(0,229,255,0.05)', border: `1px solid rgba(0,229,255,0.22)`, borderRadius: 12, padding: '14px 16px', color: C.textDim, fontSize: 'clamp(12.5px, 1.06vw, 17px)', lineHeight: 1.5 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 640, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 800, margin: '0 0 18px', color: C.text },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' },
};
