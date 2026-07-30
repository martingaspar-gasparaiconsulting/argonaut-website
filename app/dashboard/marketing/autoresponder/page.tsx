'use client';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../../_components/Leerzustand';
import {
  zaehleSequenzen,
  zaehleLaeufe,
  sortiereSchritte,
  sequenzInfo,
  naechsteVerzoegerung,
  naechstePosition,
  verzoegerungText,
} from '@/lib/autoresponder';

// ============================================================
// ARGONAUT OS · MARKETING · Autoresponder-Sequenzen
// Marketing-Autopilot Phase 2 · Paket 1 (Fundament)
// Sequenzen + Mail-Schritte anlegen/verwalten. Der automatische
// Versand kommt in Paket 2 (Vercel-Cron + Eintritt + Abmeldung).
// ============================================================

const C = {
  navy: '#0A1628',
  navy2: '#0F1F33',
  gold: '#C9A84C',
  cyan: '#00e5ff',
  green: '#4CAF7D',
  danger: '#E06666',
  warn: '#E0A24C',
  textDim: '#8FA3BE',
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

type Sequenz = {
  id: string;
  name: string;
  beschreibung: string | null;
  status: string;
  created_at: string;
};

type Schritt = {
  id: string;
  sequenz_id: string;
  position: number;
  verzoegerung_tage: number;
  betreff: string;
  inhalt: string;
  aktiv: boolean;
  created_at: string;
};

const STATUS_META: Record<string, { label: string; farbe: string }> = {
  entwurf: { label: 'Entwurf', farbe: '#8FA3BE' },
  aktiv: { label: 'Aktiv', farbe: '#4CAF7D' },
  pausiert: { label: 'Pausiert', farbe: '#E0A24C' },
};

export default function AutoresponderSeite() {
  const [sequenzen, setSequenzen] = useState<Sequenz[]>([]);
  const [schritte, setSchritte] = useState<Schritt[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null); // aufgeklappte Sequenz-ID

  // Sequenz-Dialog
  const [seqDialog, setSeqDialog] = useState(false);
  const [seqEdit, setSeqEdit] = useState<Sequenz | null>(null);
  const [sName, setSName] = useState('');
  const [sBeschreibung, setSBeschreibung] = useState('');
  const [seqBusy, setSeqBusy] = useState(false);

  // Schritt-Dialog
  const [schrittDialog, setSchrittDialog] = useState(false);
  const [schrittEdit, setSchrittEdit] = useState<Schritt | null>(null);
  const [schrittSeqId, setSchrittSeqId] = useState<string | null>(null);
  const [kBetreff, setKBetreff] = useState('');
  const [kInhalt, setKInhalt] = useState('');
  const [kTage, setKTage] = useState('0');
  const [schrittBusy, setSchrittBusy] = useState(false);

  // Eintritt (Empfänger in Sequenz aufnehmen)
  const [laufCounts, setLaufCounts] = useState<Record<string, { gesamt: number; aktiv: number; fertig: number; abgemeldet: number }>>({});
  const [eintragenSeq, setEintragenSeq] = useState<Sequenz | null>(null);
  const [eText, setEText] = useState('');
  const [eAusNewsletter, setEAusNewsletter] = useState(false);
  const [eBusy, setEBusy] = useState(false);
  const [eMeldung, setEMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null);

  async function laden() {
    setLoading(true);
    setFehler(null);
    const { data: seqD, error: seqErr } = await supabase
      .from('autoresponder_sequenz')
      .select('*')
      .order('created_at', { ascending: false });
    if (seqErr) {
      setFehler(seqErr.message);
      setSequenzen([]);
      setLoading(false);
      return;
    }
    setSequenzen((seqD ?? []) as Sequenz[]);

    const { data: schrittD } = await supabase
      .from('autoresponder_schritt')
      .select('*')
      .order('position', { ascending: true });
    setSchritte((schrittD ?? []) as Schritt[]);

    const { data: laufD } = await supabase.from('autoresponder_lauf').select('sequenz_id, status');
    const proSeq: Record<string, { status: string }[]> = {};
    for (const r of (laufD ?? []) as { sequenz_id: string; status: string }[]) {
      (proSeq[r.sequenz_id] ||= []).push({ status: r.status });
    }
    const counts: Record<string, { gesamt: number; aktiv: number; fertig: number; abgemeldet: number }> = {};
    for (const [sid, arr] of Object.entries(proSeq)) counts[sid] = zaehleLaeufe(arr);
    setLaufCounts(counts);

    setLoading(false);
  }

  useEffect(() => {
    laden();
  }, []);

  const kpi = useMemo(() => zaehleSequenzen(sequenzen), [sequenzen]);

  function schritteFuer(seqId: string): Schritt[] {
    return sortiereSchritte(schritte.filter((s) => s.sequenz_id === seqId));
  }

  // ---------- Sequenz ----------
  function seqDialogNeu() {
    setSeqEdit(null);
    setSName('');
    setSBeschreibung('');
    setSeqDialog(true);
  }

  function seqDialogBearbeiten(seq: Sequenz) {
    setSeqEdit(seq);
    setSName(seq.name);
    setSBeschreibung(seq.beschreibung ?? '');
    setSeqDialog(true);
  }

  async function seqSpeichern() {
    if (!sName.trim()) {
      alert('Bitte einen Namen für die Sequenz eingeben.');
      return;
    }
    setSeqBusy(true);
    const payload = { name: sName.trim(), beschreibung: sBeschreibung.trim() || null };
    let error;
    if (seqEdit) {
      ({ error } = await supabase.from('autoresponder_sequenz').update(payload).eq('id', seqEdit.id));
    } else {
      ({ error } = await supabase.from('autoresponder_sequenz').insert({ ...payload, status: 'entwurf' }));
    }
    setSeqBusy(false);
    if (error) {
      alert('Fehler beim Speichern: ' + error.message);
      return;
    }
    setSeqDialog(false);
    laden();
  }

  async function seqStatus(seq: Sequenz, neu: string) {
    const { error } = await supabase.from('autoresponder_sequenz').update({ status: neu }).eq('id', seq.id);
    if (error) {
      alert('Fehler: ' + error.message);
      return;
    }
    laden();
  }

  async function seqLoeschen(seq: Sequenz) {
    const anzahl = schritteFuer(seq.id).length;
    if (!confirm(`Sequenz „${seq.name}" mit ${anzahl} Schritt(en) wirklich löschen?`)) return;
    const { error } = await supabase.from('autoresponder_sequenz').delete().eq('id', seq.id);
    if (error) {
      alert('Fehler: ' + error.message);
      return;
    }
    laden();
  }

  // ---------- Schritt ----------
  function schrittDialogNeu(seqId: string) {
    setSchrittEdit(null);
    setSchrittSeqId(seqId);
    setKBetreff('');
    setKInhalt('');
    setKTage(String(naechsteVerzoegerung(schritteFuer(seqId))));
    setSchrittDialog(true);
  }

  function schrittDialogBearbeiten(s: Schritt) {
    setSchrittEdit(s);
    setSchrittSeqId(s.sequenz_id);
    setKBetreff(s.betreff);
    setKInhalt(s.inhalt);
    setKTage(String(s.verzoegerung_tage));
    setSchrittDialog(true);
  }

  async function schrittSpeichern() {
    if (!schrittSeqId) return;
    if (!kBetreff.trim() || !kInhalt.trim()) {
      alert('Bitte Betreff und Inhalt der Mail ausfüllen.');
      return;
    }
    const tage = Math.max(0, Math.round(Number(kTage.replace(',', '.')) || 0));
    setSchrittBusy(true);
    let error;
    if (schrittEdit) {
      ({ error } = await supabase
        .from('autoresponder_schritt')
        .update({ betreff: kBetreff.trim(), inhalt: kInhalt.trim(), verzoegerung_tage: tage })
        .eq('id', schrittEdit.id));
    } else {
      ({ error } = await supabase.from('autoresponder_schritt').insert({
        sequenz_id: schrittSeqId,
        position: naechstePosition(schritteFuer(schrittSeqId)),
        verzoegerung_tage: tage,
        betreff: kBetreff.trim(),
        inhalt: kInhalt.trim(),
      }));
    }
    setSchrittBusy(false);
    if (error) {
      alert('Fehler beim Speichern: ' + error.message);
      return;
    }
    setSchrittDialog(false);
    laden();
  }

  async function schrittAktiv(s: Schritt, aktiv: boolean) {
    const { error } = await supabase.from('autoresponder_schritt').update({ aktiv }).eq('id', s.id);
    if (error) {
      alert('Fehler: ' + error.message);
      return;
    }
    laden();
  }

  async function schrittLoeschen(s: Schritt) {
    if (!confirm(`Diesen Mail-Schritt („${s.betreff}") wirklich löschen?`)) return;
    const { error } = await supabase.from('autoresponder_schritt').delete().eq('id', s.id);
    if (error) {
      alert('Fehler: ' + error.message);
      return;
    }
    laden();
  }

  // ---------- Eintritt ----------
  function eintragenOeffnen(seq: Sequenz) {
    setEintragenSeq(seq);
    setEText('');
    setEAusNewsletter(false);
    setEMeldung(null);
  }

  async function eintragenSenden() {
    if (!eintragenSeq) return;
    const emails = eText
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((email) => ({ email }));
    if (emails.length === 0 && !eAusNewsletter) {
      setEMeldung({ art: 'fehler', text: 'Bitte E-Mail-Adressen eingeben oder die Newsletter-Liste wählen.' });
      return;
    }
    setEBusy(true);
    try {
      const res = await fetch('/api/autoresponder/eintragen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sequenzId: eintragenSeq.id, emails, ausNewsletter: eAusNewsletter }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setEMeldung({ art: 'fehler', text: j?.error || 'Eintragen fehlgeschlagen.' });
      } else {
        const ns = j.uebersprungen > 0 ? ` (${j.uebersprungen} übersprungen)` : '';
        const sofort = j.sofortGesendet > 0 ? ` · ${j.sofortGesendet} sofort gesendet` : '';
        setEMeldung({ art: 'ok', text: `✓ ${j.eingetragen} eingetragen${ns}${sofort}.` });
        setEText('');
        setEAusNewsletter(false);
        laden();
      }
    } catch (e: unknown) {
      setEMeldung({ art: 'fehler', text: e instanceof Error ? e.message : 'Eintragen fehlgeschlagen.' });
    } finally {
      setEBusy(false);
    }
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>
              🔄 Autoresponder
            </h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
              Automatische E-Mail-Serien, die von selbst nacheinander verschickt werden.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              href="/dashboard/marketing"
              style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}
            >
              ‹ Zurück zum Marketing
            </a>
            <button
              onClick={seqDialogNeu}
              style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 22px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(15px, 1.31vw, 21px)', cursor: 'pointer' }}
            >
              + Neue Sequenz
            </button>
          </div>
        </div>

        {/* So geht's */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '20px 24px', border: `1px solid ${C.gold}`, marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: C.gold, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 }}>
            So geht&apos;s
          </div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: 0, fontSize: 'clamp(14px, 1.2vw, 19px)', lineHeight: 1.6 }}>
            Eine <strong style={{ color: '#fff' }}>Sequenz</strong> ist eine feste Kette von E-Mails, die automatisch nacheinander an
            neue Interessenten gehen — im Branding <strong style={{ color: '#fff' }}>Ihrer Firma</strong>. Sie legen die Sequenz an,
            fügen <strong style={{ color: '#fff' }}>Schritte</strong> hinzu (z. B. Tag 0 Willkommen · Tag 2 Nutzen · Tag 5 Angebot),
            stellen sie auf <strong style={{ color: C.green }}>Aktiv</strong> und tragen über <strong style={{ color: '#fff' }}>👥 Empfänger</strong>
            die Empfänger ein. Der erste Schritt (Tag 0) geht <strong style={{ color: C.green }}>sofort</strong> raus, die weiteren
            automatisch nach Ihrem Zeitplan — im Branding Ihrer Firma, jede Mail mit Abmelde-Link (§7 UWG).
          </p>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Sequenzen gesamt', wert: kpi.gesamt, farbe: C.cyan },
            { label: 'Aktiv', wert: kpi.aktiv, farbe: C.green },
            { label: 'Entwürfe', wert: kpi.entwurf, farbe: C.gold },
          ].map((kp) => (
            <div key={kp.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(34px, 3vw, 48px)', fontWeight: 700, color: kp.farbe }}>
                {kp.wert}
              </div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
                {kp.label}
              </div>
            </div>
          ))}
        </div>

        {/* Liste */}
        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade Sequenzen…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>
            Fehler beim Laden: {fehler}
          </div>
        ) : sequenzen.length === 0 ? (
          <Leerzustand
            icon="🔄"
            titel="Noch keine Sequenz"
            text="Hier entstehen Ihre automatischen E-Mail-Serien. Legen Sie Ihre erste Sequenz an und fügen Sie die Mail-Schritte hinzu."
            schritte={['Sequenz benennen (z. B. „Willkommens-Serie")', 'Mail-Schritte mit „Tage ab Eintritt" anlegen', 'Sequenz auf „Aktiv" stellen']}
            aktionText="+ Erste Sequenz anlegen"
            onAktion={seqDialogNeu}
          />
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {sequenzen.map((seq) => {
              const meta = STATUS_META[seq.status] ?? STATUS_META.entwurf;
              const seqSchritte = schritteFuer(seq.id);
              const info = sequenzInfo(seqSchritte);
              const istOffen = offen === seq.id;
              return (
                <div key={seq.id} style={{ background: C.navy2, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  {/* Sequenz-Kopf */}
                  <div style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 26px)' }}>
                          {seq.name}
                        </span>
                        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 16px)', color: meta.farbe, border: `1px solid ${meta.farbe}`, borderRadius: 12, padding: '2px 10px' }}>
                          {meta.label}
                        </span>
                      </div>
                      {seq.beschreibung && (
                        <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 6px', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
                          {seq.beschreibung}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.06vw, 17px)', color: C.textDim }}>
                        <span>📧 {info.anzahl} Schritt{info.anzahl === 1 ? '' : 'e'}</span>
                        <span>⏱ Läuft über {info.dauerTage} Tag{info.dauerTage === 1 ? '' : 'e'}</span>
                        {(laufCounts[seq.id]?.aktiv ?? 0) > 0 && (
                          <span style={{ color: C.gold, fontWeight: 700 }}>👥 {laufCounts[seq.id].aktiv} aktiv eingetragen</span>
                        )}
                        {(laufCounts[seq.id]?.fertig ?? 0) > 0 && (
                          <span>✅ {laufCounts[seq.id].fertig} durchgelaufen</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                      <button onClick={() => setOffen(istOffen ? null : seq.id)} style={btnStyle(C.cyan)}>
                        {istOffen ? 'Zuklappen' : `Schritte (${seqSchritte.length})`}
                      </button>
                      <button onClick={() => eintragenOeffnen(seq)} style={btnStyle(C.gold)}>
                        👥 Empfänger
                      </button>
                      {seq.status !== 'aktiv' ? (
                        <button onClick={() => seqStatus(seq, 'aktiv')} style={btnStyle(C.green)}>Aktiv</button>
                      ) : (
                        <button onClick={() => seqStatus(seq, 'pausiert')} style={btnStyle(C.warn)}>Pausieren</button>
                      )}
                      <button onClick={() => seqDialogBearbeiten(seq)} style={btnStyle(C.textDim)}>Bearbeiten</button>
                      <button onClick={() => seqLoeschen(seq)} style={btnStyle(C.danger)}>Löschen</button>
                    </div>
                  </div>

                  {/* Schritte */}
                  {istOffen && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '18px 22px', background: 'rgba(0,0,0,0.15)' }}>
                      {seqSchritte.length === 0 ? (
                        <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 14px', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
                          Noch keine Mail-Schritte in dieser Sequenz.
                        </p>
                      ) : (
                        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                          {seqSchritte.map((s, idx) => (
                            <div key={s.id} style={{ background: C.navy2, borderRadius: 10, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', opacity: s.aktiv ? 1 : 0.55 }}>
                              <div style={{ flex: 1, minWidth: 220 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 2 }}>
                                  <span style={{ background: 'rgba(201,168,76,0.15)', color: C.gold, borderRadius: '50%', width: 24, height: 24, display: 'inline-grid', placeItems: 'center', fontWeight: 800, fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
                                    {idx + 1}
                                  </span>
                                  <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(14px, 1.19vw, 19px)' }}>
                                    {s.betreff}
                                  </span>
                                  <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '1px 8px' }}>
                                    {verzoegerungText(s.verzoegerung_tage)}
                                  </span>
                                  {!s.aktiv && (
                                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', color: C.textDim, border: `1px solid ${C.textDim}`, borderRadius: 10, padding: '1px 8px' }}>
                                      Pausiert
                                    </span>
                                  )}
                                </div>
                                <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '4px 0 0', fontSize: 'clamp(13px, 1.06vw, 17px)', whiteSpace: 'pre-wrap' }}>
                                  {s.inhalt.length > 160 ? s.inhalt.slice(0, 160) + '…' : s.inhalt}
                                </p>
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                                <button onClick={() => schrittAktiv(s, !s.aktiv)} style={btnStyle(s.aktiv ? C.warn : C.green)}>
                                  {s.aktiv ? 'Pausieren' : 'Aktivieren'}
                                </button>
                                <button onClick={() => schrittDialogBearbeiten(s)} style={btnStyle(C.cyan)}>Bearbeiten</button>
                                <button onClick={() => schrittLoeschen(s)} style={btnStyle(C.danger)}>Löschen</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={() => schrittDialogNeu(seq.id)} style={{ background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '9px 18px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, cursor: 'pointer', fontSize: 'clamp(14px, 1.19vw, 19px)' }}>
                        + Mail-Schritt hinzufügen
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sequenz-Dialog */}
      {seqDialog && (
        <div style={overlay} onClick={() => setSeqDialog(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <h2 style={modalTitel}>{seqEdit ? 'Sequenz bearbeiten' : 'Neue Sequenz'}</h2>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Name *</label>
              <input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="z. B. Willkommens-Serie" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Beschreibung (optional)</label>
              <textarea value={sBeschreibung} onChange={(e) => setSBeschreibung(e.target.value)} rows={3} placeholder="Wofür ist diese Sequenz?" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setSeqDialog(false)} style={btnGhost}>Abbrechen</button>
              <button onClick={seqSpeichern} disabled={seqBusy} style={{ ...btnGold, opacity: seqBusy ? 0.7 : 1, cursor: seqBusy ? 'wait' : 'pointer' }}>
                {seqBusy ? 'Speichere…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schritt-Dialog */}
      {schrittDialog && (
        <div style={overlay} onClick={() => setSchrittDialog(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <h2 style={modalTitel}>{schrittEdit ? 'Mail-Schritt bearbeiten' : 'Neuer Mail-Schritt'}</h2>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Verzögerung — Tage ab Eintritt</label>
              <input value={kTage} onChange={(e) => setKTage(e.target.value)} inputMode="numeric" placeholder="0" style={inputStyle} />
              <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0', fontSize: 'clamp(12px, 1vw, 16px)' }}>
                0 = sofort beim Eintritt. 2 = zwei Tage danach. So bauen Sie den Abstand zwischen den Mails.
              </p>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Betreff *</label>
              <input value={kBetreff} onChange={(e) => setKBetreff(e.target.value)} placeholder="z. B. Willkommen — schön, dass Sie da sind!" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Inhalt der Mail *</label>
              <textarea value={kInhalt} onChange={(e) => setKInhalt(e.target.value)} rows={8} placeholder={'Guten Tag,\n\nschön, dass Sie sich eingetragen haben …\n\nHerzliche Grüße'} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setSchrittDialog(false)} style={btnGhost}>Abbrechen</button>
              <button onClick={schrittSpeichern} disabled={schrittBusy} style={{ ...btnGold, opacity: schrittBusy ? 0.7 : 1, cursor: schrittBusy ? 'wait' : 'pointer' }}>
                {schrittBusy ? 'Speichere…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Eintragen-Dialog */}
      {eintragenSeq && (
        <div style={overlay} onClick={() => setEintragenSeq(null)}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <h2 style={modalTitel}>Empfänger eintragen</h2>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 16px', fontSize: 'clamp(13px, 1.13vw, 18px)', lineHeight: 1.55 }}>
              Sequenz <strong style={{ color: '#fff' }}>{eintragenSeq.name}</strong>. Die eingetragenen Empfänger
              durchlaufen die Schritte automatisch. Jeder Empfänger wird nur einmal je Sequenz aufgenommen.
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>E-Mail-Adressen (eine pro Zeile oder mit Komma getrennt)</label>
              <textarea value={eText} onChange={(e) => setEText(e.target.value)} rows={6} placeholder={'maria@beispiel.de\nthomas@beispiel.de'} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 4 }}>
              <input type="checkbox" checked={eAusNewsletter} onChange={(e) => setEAusNewsletter(e.target.checked)} style={{ width: 18, height: 18, accentColor: C.gold }} />
              <span style={{ fontFamily: 'DM Sans, sans-serif', color: '#fff', fontSize: 'clamp(14px, 1.19vw, 19px)' }}>
                Alle aktiven Newsletter-Abonnenten übernehmen
              </span>
            </label>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '10px 0 0', fontSize: 'clamp(12px, 1vw, 16px)', lineHeight: 1.5 }}>
              Tragen Sie nur Empfänger ein, die eingewilligt haben. Jede Mail enthält automatisch einen Abmelde-Link (§7 UWG).
            </p>
            {eMeldung && (
              <p style={{ fontFamily: 'DM Sans, sans-serif', margin: '14px 0 0', fontSize: 'clamp(13px, 1.13vw, 18px)', color: eMeldung.art === 'ok' ? C.green : C.danger }}>
                {eMeldung.text}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setEintragenSeq(null)} style={btnGhost}>Schließen</button>
              <button onClick={eintragenSenden} disabled={eBusy} style={{ ...btnGold, opacity: eBusy ? 0.7 : 1, cursor: eBusy ? 'wait' : 'pointer' }}>
                {eBusy ? 'Trage ein…' : 'Eintragen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 'clamp(13px, 1.13vw, 18px)',
  color: '#8FA3BE',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0F1F33',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 9,
  padding: '10px 12px',
  color: '#fff',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  boxSizing: 'border-box',
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 20,
};

const modal: React.CSSProperties = {
  background: '#0A1628',
  borderRadius: 18,
  padding: 32,
  width: '100%',
  maxWidth: 560,
  maxHeight: '90vh',
  overflowY: 'auto',
  border: '1px solid #C9A84C',
};

const modalTitel: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans), sans-serif',
  color: '#C9A84C',
  fontSize: 'clamp(22px, 2vw, 32px)',
  margin: '0 0 20px',
};

const btnGold: React.CSSProperties = {
  background: '#C9A84C',
  color: '#0A1628',
  border: 'none',
  borderRadius: 10,
  padding: '11px 24px',
  fontFamily: 'var(--font-dm-sans), sans-serif',
  fontWeight: 700,
};

const btnGhost: React.CSSProperties = {
  background: 'transparent',
  color: '#8FA3BE',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  padding: '11px 20px',
  fontFamily: 'DM Sans, sans-serif',
  cursor: 'pointer',
};

function btnStyle(farbe: string): React.CSSProperties {
  return {
    background: 'transparent',
    color: farbe,
    border: `1px solid ${farbe}`,
    borderRadius: 8,
    padding: '7px 13px',
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 'clamp(13px, 1.13vw, 18px)',
    cursor: 'pointer',
  };
}
