'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · BLOCK 12 · KORRESPONDENZ — K3 Brief-Editor
// Bearbeiten (Absender/Empfänger/Betreff/Text) + Status + PDF + Löschen
// ============================================================

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GOLD = '#C9A84C';
const NAVY = '#0A1628';
const CYAN = '#00e5ff';

type Brief = {
  id: string;
  brief_nummer: string | null;
  brief_art: string;
  status: string;
  betreff: string;
  brieftext: string | null;
  absender_name: string | null;
  absender_anschrift: string | null;
  empfaenger_name: string | null;
  empfaenger_anschrift: string | null;
  versendet_am: string | null;
  created_at: string;
  updated_at: string;
};

const ART_LABEL: Record<string, string> = {
  anschreiben: 'Anschreiben',
  angebot: 'Angebot',
  mahnung: 'Mahnung',
  kuendigung: 'Kündigung',
  allgemein: 'Allgemein',
};
const STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf',
  final: 'Final',
  versendet: 'Versendet',
};

function statusStil(status: string): React.CSSProperties {
  const map: Record<string, { c: string; bg: string }> = {
    entwurf: { c: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.08)' },
    final: { c: CYAN, bg: 'rgba(0,229,255,0.12)' },
    versendet: { c: '#66bb6a', bg: 'rgba(102,187,106,0.14)' },
  };
  const s = map[status] || map.entwurf;
  return {
    color: s.c,
    background: s.bg,
    border: `1px solid ${s.c}55`,
    padding: '4px 12px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };
}

export default function BriefEditorPage() {
  const params = useParams();
  const briefId = Array.isArray(params.id)
    ? params.id[0]
    : (params.id as string);

  const [brief, setBrief] = useState<Brief | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [aktion, setAktion] = useState(false);
  const [pdfLaden, setPdfLaden] = useState(false);

  // Editierbare Felder
  const [briefArt, setBriefArt] = useState('anschreiben');
  const [betreff, setBetreff] = useState('');
  const [brieftext, setBrieftext] = useState('');
  const [empfName, setEmpfName] = useState('');
  const [empfAnschrift, setEmpfAnschrift] = useState('');

  // Absender aus profiles
  const [aussteller, setAussteller] = useState<any>(null);

  // Löschen
  const [loeschDialog, setLoeschDialog] = useState(false);

  // ---- Laden ----
  const alles_laden = useCallback(async () => {
    if (!briefId) return;
    setLaden(true);
    setFehler(null);

    const { data: bData, error: bErr } = await supabase
      .from('korrespondenz')
      .select('*')
      .eq('id', briefId)
      .single();

    if (bErr) {
      setFehler(bErr.message);
      setLaden(false);
      return;
    }
    const b = bData as Brief;
    setBrief(b);
    setBriefArt(b.brief_art);
    setBetreff(b.betreff);
    setBrieftext(b.brieftext || '');
    setEmpfName(b.empfaenger_name || '');
    setEmpfAnschrift(b.empfaenger_anschrift || '');

    // Absenderdaten aus profiles (dieselbe Quelle wie Rechnung/Einstellungen)
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      const { data: p } = await supabase
        .from('profiles')
        .select(
          'firma_name, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email'
        )
        .eq('id', userData.user.id)
        .single();
      if (p) {
        const anschrift = [
          p.firma_strasse,
          [p.firma_plz, p.firma_ort].filter(Boolean).join(' '),
        ]
          .filter((s) => String(s || '').trim())
          .join('\n');
        setAussteller({
          name: p.firma_name || '',
          anschrift,
          ort: p.firma_ort || '',
          telefon: p.firma_telefon || '',
          email: p.firma_email || '',
        });
      }
    }

    setLaden(false);
  }, [briefId]);

  useEffect(() => {
    alles_laden();
  }, [alles_laden]);

  // ---- Speichern ----
  async function speichern(): Promise<boolean> {
    if (!brief) return false;
    if (!betreff.trim()) {
      setFehler('Betreff ist Pflicht.');
      return false;
    }
    setAktion(true);
    setFehler(null);
    setHinweis(null);

    const { error } = await supabase
      .from('korrespondenz')
      .update({
        brief_art: briefArt,
        betreff: betreff.trim(),
        brieftext: brieftext.trim() || null,
        empfaenger_name: empfName.trim() || null,
        empfaenger_anschrift: empfAnschrift.trim() || null,
      })
      .eq('id', brief.id);

    setAktion(false);
    if (error) {
      setFehler(error.message);
      return false;
    }
    setHinweis('Gespeichert.');
    setTimeout(() => setHinweis(null), 2000);
    alles_laden();
    return true;
  }

  // ---- Status setzen ----
  async function statusSetzen(neu: string) {
    if (!brief) return;
    setAktion(true);
    setFehler(null);
    const update: Record<string, unknown> = { status: neu };
    if (neu === 'versendet' && !brief.versendet_am) {
      update.versendet_am = new Date().toISOString();
    }
    const { error } = await supabase
      .from('korrespondenz')
      .update(update)
      .eq('id', brief.id);
    setAktion(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    alles_laden();
  }

  // ---- PDF erzeugen (erst speichern, dann PDF) ----
  async function pdfErzeugen() {
    if (!brief) return;
    setPdfLaden(true);
    setFehler(null);

    // erst speichern, damit das PDF den aktuellen Stand hat
    const ok = await speichern();
    if (!ok) {
      setPdfLaden(false);
      return;
    }

    try {
      const res = await fetch('/api/korrespondenz-pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brief: {
            brief_nummer: brief.brief_nummer,
            brief_art: briefArt,
            betreff: betreff.trim(),
            brieftext: brieftext.trim(),
            empfaenger_name: empfName.trim(),
            empfaenger_anschrift: empfAnschrift.trim(),
          },
          aussteller: aussteller || {},
        }),
      });

      if (!res.ok) {
        let msg = 'PDF-Erstellung fehlgeschlagen.';
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          // Response war kein JSON
        }
        setFehler(msg);
        setPdfLaden(false);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Brief_${brief.brief_nummer || 'Brief'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setFehler('Verbindungsfehler bei der PDF-Erstellung.');
    }
    setPdfLaden(false);
  }

  // ---- Löschen ----
  async function briefLoeschen() {
    if (!brief) return;
    setAktion(true);
    const { error } = await supabase
      .from('korrespondenz')
      .delete()
      .eq('id', brief.id);
    if (error) {
      setFehler(error.message);
      setAktion(false);
      setLoeschDialog(false);
      return;
    }
    window.location.href = '/dashboard/korrespondenz';
  }

  // ---- Styles ----
  const karte: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '18px 20px',
  };
  const inputStil: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: '#fff',
    fontSize: '14px',
    boxSizing: 'border-box',
  };
  const labelStil: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: '4px',
    fontWeight: 600,
  };

  if (laden) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '30px 4px' }}>
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Lädt …</div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '30px 4px' }}>
        <a
          href="/dashboard/korrespondenz"
          style={{ color: GOLD, textDecoration: 'none', fontSize: '14px' }}
        >
          ← Zurück zur Korrespondenz
        </a>
        <div style={{ ...karte, marginTop: '16px', color: '#ef5350' }}>
          ⚠️ Brief nicht gefunden{fehler ? `: ${fehler}` : '.'}
        </div>
      </div>
    );
  }

  // fehlt Absender? -> Hinweis
  const absenderFehlt =
    !aussteller || !String(aussteller.name || '').trim();

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '8px 4px' }}>
      {/* Zurück */}
      <a
        href="/dashboard/korrespondenz"
        style={{
          color: GOLD,
          textDecoration: 'none',
          fontSize: '14px',
          display: 'inline-block',
          marginBottom: '16px',
        }}
      >
        ← Zurück zur Korrespondenz
      </a>

      {/* KOPF */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            marginBottom: '8px',
          }}
        >
          <span
            style={{
              color: GOLD,
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: 'monospace',
            }}
          >
            {brief.brief_nummer || '—'}
          </span>
          <span style={statusStil(brief.status)}>
            {STATUS_LABEL[brief.status] || brief.status}
          </span>
        </div>
        <h1 style={{ color: '#fff', fontSize: '26px', fontWeight: 700, margin: 0 }}>
          {betreff || 'Neuer Brief'}
        </h1>
      </div>

      {fehler && (
        <div
          style={{
            ...karte,
            borderColor: '#ef535055',
            color: '#ef5350',
            marginBottom: '16px',
          }}
        >
          ⚠️ {fehler}
        </div>
      )}
      {hinweis && (
        <div
          style={{
            ...karte,
            borderColor: '#66bb6a55',
            color: '#66bb6a',
            marginBottom: '16px',
          }}
        >
          ✓ {hinweis}
        </div>
      )}

      {/* AKTIONSLEISTE: Status + PDF */}
      <div style={{ ...karte, marginBottom: '16px' }}>
        <div style={{ ...labelStil, marginBottom: '10px' }}>
          STATUS & AKTIONEN
        </div>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {['entwurf', 'final', 'versendet'].map((s) => {
            const aktiv = s === brief.status;
            return (
              <button
                key={s}
                onClick={() => statusSetzen(s)}
                disabled={aktion || aktiv}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: aktiv || aktion ? 'default' : 'pointer',
                  border: aktiv
                    ? `1px solid ${GOLD}`
                    : '1px solid rgba(255,255,255,0.15)',
                  background: aktiv
                    ? 'rgba(201,168,76,0.15)'
                    : 'rgba(255,255,255,0.05)',
                  color: aktiv ? GOLD : 'rgba(255,255,255,0.75)',
                  opacity: aktion && !aktiv ? 0.5 : 1,
                }}
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}

          <div style={{ flex: 1 }} />

          <button
            onClick={pdfErzeugen}
            disabled={pdfLaden || aktion}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              background: GOLD,
              color: NAVY,
              border: 'none',
              fontSize: '14px',
              fontWeight: 700,
              cursor: pdfLaden || aktion ? 'not-allowed' : 'pointer',
              opacity: pdfLaden || aktion ? 0.6 : 1,
            }}
          >
            {pdfLaden ? 'Erstellt PDF …' : '📄 PDF erstellen'}
          </button>
        </div>

        {absenderFehlt && (
          <div
            style={{
              marginTop: '12px',
              fontSize: '12.5px',
              color: '#b8860b',
              background: 'rgba(184,134,11,0.1)',
              border: '1px solid rgba(184,134,11,0.3)',
              borderRadius: '8px',
              padding: '8px 12px',
            }}
          >
            ⚠ Absenderdaten (Firmenname/Anschrift) sind noch nicht in den
            Einstellungen hinterlegt — sie erscheinen als Platzhalter im PDF.
          </div>
        )}
      </div>

      {/* EDITOR-GRID */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {/* LINKS: Empfänger + Meta */}
        <div style={karte}>
          <div style={{ ...labelStil, marginBottom: '12px', fontSize: '13px' }}>
            BRIEFKOPF
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStil}>Brief-Art</label>
            <select
              style={inputStil}
              value={briefArt}
              onChange={(e) => setBriefArt(e.target.value)}
            >
              <option value="anschreiben">Anschreiben</option>
              <option value="angebot">Angebot</option>
              <option value="mahnung">Mahnung</option>
              <option value="kuendigung">Kündigung</option>
              <option value="allgemein">Allgemein</option>
            </select>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStil}>Empfänger-Name</label>
            <input
              style={inputStil}
              value={empfName}
              onChange={(e) => setEmpfName(e.target.value)}
              placeholder="z.B. Schäfer Holzernteservice"
            />
          </div>

          <div style={{ marginBottom: '4px' }}>
            <label style={labelStil}>Empfänger-Anschrift</label>
            <textarea
              style={{ ...inputStil, minHeight: '90px', resize: 'vertical' }}
              value={empfAnschrift}
              onChange={(e) => setEmpfAnschrift(e.target.value)}
              placeholder={'Straße Hausnummer\nPLZ Ort'}
            />
          </div>

          {/* Absender-Vorschau */}
          <div
            style={{
              marginTop: '16px',
              paddingTop: '14px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ ...labelStil, marginBottom: '6px' }}>
              ABSENDER (aus Einstellungen)
            </div>
            {aussteller && String(aussteller.name || '').trim() ? (
              <div
                style={{
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.75)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 600, color: '#fff' }}>
                  {aussteller.name}
                </div>
                {String(aussteller.anschrift || '')
                  .split('\n')
                  .map((z: string, i: number) => (
                    <div key={i}>{z}</div>
                  ))}
                {aussteller.telefon && <div>Tel.: {aussteller.telefon}</div>}
                {aussteller.email && <div>{aussteller.email}</div>}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: '#b8860b' }}>
                ⚠ Noch nicht hinterlegt (Einstellungen → Firmendaten)
              </div>
            )}
          </div>
        </div>

        {/* RECHTS: Betreff + Brieftext */}
        <div style={karte}>
          <div style={{ ...labelStil, marginBottom: '12px', fontSize: '13px' }}>
            INHALT
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStil}>Betreff *</label>
            <input
              style={inputStil}
              value={betreff}
              onChange={(e) => setBetreff(e.target.value)}
              placeholder="z.B. Angebot für Ihre Anfrage vom …"
            />
          </div>

          <div>
            <label style={labelStil}>Brieftext</label>
            <textarea
              style={{
                ...inputStil,
                minHeight: '280px',
                resize: 'vertical',
                lineHeight: 1.6,
              }}
              value={brieftext}
              onChange={(e) => setBrieftext(e.target.value)}
              placeholder={
                'Sehr geehrte Damen und Herren,\n\n…\n\nMit freundlichen Grüßen\n[Ihr Name]'
              }
            />
          </div>
        </div>
      </div>

      {/* SPEICHERN + LÖSCHEN */}
      <div
        style={{
          marginTop: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => setLoeschDialog(true)}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            background: 'transparent',
            color: '#ef5350',
            border: '1px solid #ef535055',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🗑 Brief löschen
        </button>

        <button
          onClick={speichern}
          disabled={aktion}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            background: GOLD,
            color: NAVY,
            border: 'none',
            fontSize: '15px',
            fontWeight: 700,
            cursor: aktion ? 'not-allowed' : 'pointer',
            opacity: aktion ? 0.6 : 1,
          }}
        >
          {aktion ? 'Speichert …' : '💾 Speichern'}
        </button>
      </div>

      {/* LÖSCH-DIALOG */}
      {loeschDialog && (
        <div
          onClick={() => !aktion && setLoeschDialog(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: NAVY,
              border: '1px solid #ef535055',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '420px',
            }}
          >
            <h2
              style={{
                color: '#ef5350',
                fontSize: '18px',
                fontWeight: 700,
                margin: '0 0 12px 0',
              }}
            >
              Brief wirklich löschen?
            </h2>
            <p
              style={{
                color: 'rgba(255,255,255,0.7)',
                fontSize: '14px',
                margin: '0 0 20px 0',
                lineHeight: 1.5,
              }}
            >
              {brief.brief_nummer} „{brief.betreff}" wird unwiderruflich
              gelöscht.
            </p>
            <div
              style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}
            >
              <button
                onClick={() => setLoeschDialog(false)}
                disabled={aktion}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: aktion ? 'not-allowed' : 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={briefLoeschen}
                disabled={aktion}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: '#ef5350',
                  color: '#fff',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: aktion ? 'not-allowed' : 'pointer',
                  opacity: aktion ? 0.6 : 1,
                }}
              >
                {aktion ? 'Löscht …' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
