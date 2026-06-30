'use client';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · M2 Cockpit
// Kampagnen-Übersicht + KPI-Strip + Health-Ampel + CRUD
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

type Kampagne = {
  id: string;
  name: string;
  ziel: string | null;
  beschreibung: string | null;
  status: string;
  kanaele: string[] | null;
  budget: number | null;
  start_datum: string | null;
  end_datum: string | null;
  zielgruppe_id: string | null;
  created_at: string;
};

const STATUS_OPTS = [
  { v: 'entwurf', label: 'Entwurf' },
  { v: 'aktiv', label: 'Aktiv' },
  { v: 'pausiert', label: 'Pausiert' },
  { v: 'abgeschlossen', label: 'Abgeschlossen' },
];

const KANAL_OPTS = ['email', 'instagram', 'facebook', 'linkedin', 'google', 'website', 'print'];

// ---------- Health-Ampel-Logik ----------
function ampel(k: Kampagne): { farbe: string; text: string } {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  if (k.status === 'abgeschlossen') return { farbe: C.textDim, text: 'Abgeschlossen' };
  if (k.status === 'pausiert') return { farbe: C.warn, text: 'Pausiert' };

  if (k.end_datum) {
    const ende = new Date(k.end_datum);
    ende.setHours(0, 0, 0, 0);
    const diffTage = Math.round((ende.getTime() - heute.getTime()) / 86400000);
    if (diffTage < 0) return { farbe: C.danger, text: 'Überfällig' };
    if (diffTage <= 7) return { farbe: C.warn, text: 'Endet bald' };
  }
  return { farbe: C.green, text: 'Im Plan' };
}

function statusLabel(v: string): string {
  return STATUS_OPTS.find((s) => s.v === v)?.label ?? v;
}

function fmtDatum(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtBudget(b: number | null): string {
  if (b == null) return '—';
  return b.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export default function MarketingCockpit() {
  const [kampagnen, setKampagnen] = useState<Kampagne[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('alle');
  const [dialogOffen, setDialogOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<Kampagne | null>(null);

  // Formularfelder
  const [fName, setFName] = useState('');
  const [fZiel, setFZiel] = useState('');
  const [fBeschreibung, setFBeschreibung] = useState('');
  const [fStatus, setFStatus] = useState('entwurf');
  const [fKanaele, setFKanaele] = useState<string[]>([]);
  const [fBudget, setFBudget] = useState('');
  const [fStart, setFStart] = useState('');
  const [fEnde, setFEnde] = useState('');
  const [speichern, setSpeichern] = useState(false);

  async function laden() {
    setLoading(true);
    setFehler(null);
    const { data, error } = await supabase
      .from('marketing_kampagnen')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setFehler(error.message);
      setKampagnen([]);
    } else {
      setKampagnen((data ?? []) as Kampagne[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    laden();
  }, []);

  const kpi = useMemo(() => {
    return {
      gesamt: kampagnen.length,
      aktiv: kampagnen.filter((k) => k.status === 'aktiv').length,
      entwurf: kampagnen.filter((k) => k.status === 'entwurf').length,
      abgeschlossen: kampagnen.filter((k) => k.status === 'abgeschlossen').length,
    };
  }, [kampagnen]);

  const gefiltert = useMemo(() => {
    if (filter === 'alle') return kampagnen;
    return kampagnen.filter((k) => k.status === filter);
  }, [kampagnen, filter]);

  function dialogNeu() {
    setBearbeite(null);
    setFName('');
    setFZiel('');
    setFBeschreibung('');
    setFStatus('entwurf');
    setFKanaele([]);
    setFBudget('');
    setFStart('');
    setFEnde('');
    setDialogOffen(true);
  }

  function dialogBearbeiten(k: Kampagne) {
    setBearbeite(k);
    setFName(k.name);
    setFZiel(k.ziel ?? '');
    setFBeschreibung(k.beschreibung ?? '');
    setFStatus(k.status);
    setFKanaele(k.kanaele ?? []);
    setFBudget(k.budget != null ? String(k.budget) : '');
    setFStart(k.start_datum ?? '');
    setFEnde(k.end_datum ?? '');
    setDialogOffen(true);
  }

  function toggleKanal(kanal: string) {
    setFKanaele((prev) =>
      prev.includes(kanal) ? prev.filter((x) => x !== kanal) : [...prev, kanal]
    );
  }

  async function speichernKlick() {
    if (!fName.trim()) {
      alert('Bitte einen Namen für die Kampagne eingeben.');
      return;
    }
    setSpeichern(true);

    const payload: Record<string, unknown> = {
      name: fName.trim(),
      ziel: fZiel.trim() || null,
      beschreibung: fBeschreibung.trim() || null,
      status: fStatus,
      kanaele: fKanaele,
      budget: fBudget.trim() ? Number(fBudget.replace(',', '.')) : null,
      start_datum: fStart || null,
      end_datum: fEnde || null,
    };

    let error;
    if (bearbeite) {
      ({ error } = await supabase
        .from('marketing_kampagnen')
        .update(payload)
        .eq('id', bearbeite.id));
    } else {
      ({ error } = await supabase.from('marketing_kampagnen').insert(payload));
    }

    setSpeichern(false);
    if (error) {
      alert('Fehler beim Speichern: ' + error.message);
      return;
    }
    setDialogOffen(false);
    laden();
  }

  async function archivieren(k: Kampagne) {
    if (!confirm(`Kampagne „${k.name}" auf „Abgeschlossen" setzen?`)) return;
    const { error } = await supabase
      .from('marketing_kampagnen')
      .update({ status: 'abgeschlossen' })
      .eq('id', k.id);
    if (error) {
      alert('Fehler: ' + error.message);
      return;
    }
    laden();
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Kopf */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 28,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'Syne, sans-serif',
              fontSize: 32,
              fontWeight: 700,
              color: C.gold,
              margin: 0,
            }}
          >
            📣 Marketing
          </h1>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
            Kampagnen, Inhalte und Redaktionsplanung an einem Ort.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href="/dashboard/marketing/studio"
            style={{
              background: 'transparent',
              color: C.gold,
              border: `1px solid ${C.gold}`,
              borderRadius: 10,
              padding: '12px 20px',
              fontFamily: 'Syne, sans-serif',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            ✨ KI-Content-Studio
          </a>
          <a
            href="/dashboard/marketing/kalender"
            style={{
              background: 'transparent',
              color: C.cyan,
              border: `1px solid ${C.cyan}`,
              borderRadius: 10,
              padding: '12px 20px',
              fontFamily: 'Syne, sans-serif',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            📅 Redaktionskalender
          </a>
          <button
            onClick={dialogNeu}
            style={{
              background: C.gold,
              color: C.navy,
              border: 'none',
              borderRadius: 10,
              padding: '12px 22px',
              fontFamily: 'Syne, sans-serif',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            + Neue Kampagne
          </button>
        </div>
      </div>

      {/* KPI-Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        {[
          { label: 'Kampagnen gesamt', wert: kpi.gesamt, farbe: C.cyan },
          { label: 'Aktiv', wert: kpi.aktiv, farbe: C.green },
          { label: 'Entwürfe', wert: kpi.entwurf, farbe: C.gold },
          { label: 'Abgeschlossen', wert: kpi.abgeschlossen, farbe: C.textDim },
        ].map((kp) => (
          <div
            key={kp.label}
            style={{
              background: C.navy2,
              borderRadius: 14,
              padding: '18px 22px',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: 34,
                fontWeight: 700,
                color: kp.farbe,
              }}
            >
              {kp.wert}
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 14 }}>
              {kp.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[{ v: 'alle', label: 'Alle' }, ...STATUS_OPTS].map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            style={{
              background: filter === f.v ? C.gold : 'transparent',
              color: filter === f.v ? C.navy : C.textDim,
              border: `1px solid ${filter === f.v ? C.gold : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 20,
              padding: '6px 16px',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 14,
              fontWeight: filter === f.v ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade Kampagnen…</p>
      ) : fehler ? (
        <div
          style={{
            background: 'rgba(224,102,102,0.12)',
            border: `1px solid ${C.danger}`,
            borderRadius: 12,
            padding: 18,
            color: C.danger,
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          Fehler beim Laden: {fehler}
        </div>
      ) : gefiltert.length === 0 ? (
        <div
          style={{
            background: C.navy2,
            borderRadius: 14,
            padding: '48px 24px',
            textAlign: 'center',
            border: '1px dashed rgba(255,255,255,0.12)',
          }}
        >
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 16 }}>
            {filter === 'alle'
              ? 'Noch keine Kampagne angelegt. Leg deine erste an.'
              : 'Keine Kampagne in diesem Status.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {gefiltert.map((k) => {
            const a = ampel(k);
            return (
              <div
                key={k.id}
                style={{
                  background: C.navy2,
                  borderRadius: 14,
                  padding: '20px 24px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 20,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: a.farbe,
                        flexShrink: 0,
                      }}
                      title={a.text}
                    />
                    <a
                      href={`/dashboard/marketing/${k.id}`}
                      style={{
                        fontFamily: 'Syne, sans-serif',
                        fontSize: 19,
                        fontWeight: 700,
                        color: '#fff',
                        textDecoration: 'none',
                      }}
                    >
                      {k.name}
                    </a>
                    <span
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 12,
                        color: a.farbe,
                        border: `1px solid ${a.farbe}`,
                        borderRadius: 12,
                        padding: '2px 10px',
                      }}
                    >
                      {a.text}
                    </span>
                  </div>
                  {k.ziel && (
                    <p
                      style={{
                        fontFamily: 'DM Sans, sans-serif',
                        color: C.textDim,
                        margin: '0 0 8px',
                        fontSize: 14,
                      }}
                    >
                      🎯 {k.ziel}
                    </p>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      gap: 18,
                      flexWrap: 'wrap',
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 13,
                      color: C.textDim,
                    }}
                  >
                    <span>Status: {statusLabel(k.status)}</span>
                    <span>
                      {fmtDatum(k.start_datum)} – {fmtDatum(k.end_datum)}
                    </span>
                    <span>Budget: {fmtBudget(k.budget)}</span>
                    {k.kanaele && k.kanaele.length > 0 && (
                      <span>Kanäle: {k.kanaele.join(', ')}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => dialogBearbeiten(k)}
                    style={{
                      background: 'transparent',
                      color: C.cyan,
                      border: `1px solid ${C.cyan}`,
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Bearbeiten
                  </button>
                  {k.status !== 'abgeschlossen' && (
                    <button
                      onClick={() => archivieren(k)}
                      style={{
                        background: 'transparent',
                        color: C.textDim,
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        padding: '8px 14px',
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      Abschließen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog Anlegen/Bearbeiten */}
      {dialogOffen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setDialogOffen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.navy,
              borderRadius: 18,
              padding: 32,
              width: '100%',
              maxWidth: 560,
              maxHeight: '90vh',
              overflowY: 'auto',
              border: `1px solid ${C.gold}`,
            }}
          >
            <h2
              style={{
                fontFamily: 'Syne, sans-serif',
                color: C.gold,
                fontSize: 24,
                margin: '0 0 20px',
              }}
            >
              {bearbeite ? 'Kampagne bearbeiten' : 'Neue Kampagne'}
            </h2>

            <Feld label="Name *">
              <input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="z. B. Herbst-Kampagne Holzernte"
                style={inputStyle}
              />
            </Feld>

            <Feld label="Ziel">
              <input
                value={fZiel}
                onChange={(e) => setFZiel(e.target.value)}
                placeholder="z. B. 30 neue Anfragen im Herbst"
                style={inputStyle}
              />
            </Feld>

            <Feld label="Beschreibung">
              <textarea
                value={fBeschreibung}
                onChange={(e) => setFBeschreibung(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Feld>

            <div style={{ display: 'flex', gap: 14 }}>
              <Feld label="Status">
                <select
                  value={fStatus}
                  onChange={(e) => setFStatus(e.target.value)}
                  style={inputStyle}
                >
                  {STATUS_OPTS.map((s) => (
                    <option key={s.v} value={s.v}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Feld>
              <Feld label="Budget (€)">
                <input
                  value={fBudget}
                  onChange={(e) => setFBudget(e.target.value)}
                  placeholder="z. B. 1500"
                  inputMode="decimal"
                  style={inputStyle}
                />
              </Feld>
            </div>

            <div style={{ display: 'flex', gap: 14 }}>
              <Feld label="Start">
                <input
                  type="date"
                  value={fStart}
                  onChange={(e) => setFStart(e.target.value)}
                  style={inputStyle}
                />
              </Feld>
              <Feld label="Ende">
                <input
                  type="date"
                  value={fEnde}
                  onChange={(e) => setFEnde(e.target.value)}
                  style={inputStyle}
                />
              </Feld>
            </div>

            <Feld label="Kanäle">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {KANAL_OPTS.map((kanal) => {
                  const an = fKanaele.includes(kanal);
                  return (
                    <button
                      key={kanal}
                      onClick={() => toggleKanal(kanal)}
                      style={{
                        background: an ? C.cyan : 'transparent',
                        color: an ? C.navy : C.textDim,
                        border: `1px solid ${an ? C.cyan : 'rgba(255,255,255,0.15)'}`,
                        borderRadius: 16,
                        padding: '5px 14px',
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      {kanal}
                    </button>
                  );
                })}
              </div>
            </Feld>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button
                onClick={() => setDialogOffen(false)}
                style={{
                  background: 'transparent',
                  color: C.textDim,
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10,
                  padding: '11px 20px',
                  fontFamily: 'DM Sans, sans-serif',
                  cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={speichernKlick}
                disabled={speichern}
                style={{
                  background: C.gold,
                  color: C.navy,
                  border: 'none',
                  borderRadius: 10,
                  padding: '11px 24px',
                  fontFamily: 'Syne, sans-serif',
                  fontWeight: 700,
                  cursor: speichern ? 'wait' : 'pointer',
                  opacity: speichern ? 0.7 : 1,
                }}
              >
                {speichern ? 'Speichere…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0F1F33',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 9,
  padding: '10px 12px',
  color: '#fff',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 14,
  boxSizing: 'border-box',
};

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16, flex: 1 }}>
      <label
        style={{
          display: 'block',
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 13,
          color: C.textDim,
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
