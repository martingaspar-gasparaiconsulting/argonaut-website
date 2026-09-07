'use client';

import { useState, type ChangeEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  KENNZEICHEN, kennzeichenInfo, kennzeichenAusKategorie, pruefePlausibel,
  fehlendeAngaben, belegNutzlast, type Kennzeichen, type OcrFelder,
} from '@/lib/belegKennzeichen';
import { leseStandortCookie } from '@/lib/aktiverStandort';
import { konkreterStandort } from '@/lib/standortDaten';

// ============================================================
// ARGONAUT OS · Beleg-Foto je Einsatz (C1)
//
// Foto vom Beleg -> die Beleg-KI liest ihn -> der Monteur waehlt das
// Kennzeichen -> der Beleg landet in den Ausgaben UND am Einsatz.
//
// Bewusst eine eigene Datei: die Einsatz-Seite ist gross, und dieser Ablauf
// steht fuer sich. Die Regeln (Kennzeichen, Plausibilitaet, Nutzlast) liegen
// in lib/belegKennzeichen und sind dort node-getestet.
// ============================================================

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  gruen: '#4CAF7D', rot: '#E06666', warn: '#E0A24C',
  text: '#E8EDF4', dim: '#8FA3BE', rand: 'rgba(143,163,190,0.22)',
};

type Schritt = 'zu' | 'lesen' | 'pruefen' | 'fertig';

export default function BelegErfassen({
  einsatzId, ownerUserId,
}: {
  einsatzId: string;
  ownerUserId: string | null;
}) {
  const [schritt, setSchritt] = useState<Schritt>('zu');
  const [ocr, setOcr] = useState<OcrFelder>({});
  const [kennzeichen, setKennzeichen] = useState<Kennzeichen>('material');
  const [anlass, setAnlass] = useState('');
  const [teilnehmer, setTeilnehmer] = useState('');
  const [dateiPfad, setDateiPfad] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const info = kennzeichenInfo(kennzeichen);
  const pruefung = pruefePlausibel(kennzeichen, ocr.kategorie, ocr.lieferant);
  const fehlt = fehlendeAngaben(kennzeichen, anlass, teilnehmer);

  function zuruecksetzen() {
    setSchritt('zu'); setOcr({}); setKennzeichen('material');
    setAnlass(''); setTeilnehmer(''); setDateiPfad(null); setFehler(null);
  }

  async function dateiGewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    e.target.value = '';
    if (!datei || !ownerUserId) return;

    setSchritt('lesen'); setFehler(null);
    try {
      const dataUrl = await new Promise<string>((ja, nein) => {
        const r = new FileReader();
        r.onload = () => ja(String(r.result));
        r.onerror = () => nein(new Error('lesen'));
        r.readAsDataURL(datei);
      });
      const base64 = dataUrl.split(',')[1] || '';
      const mediaType = datei.type || 'image/jpeg';

      // Beleg ablegen — best effort. Scheitert die Ablage, geht der Beleg
      // trotzdem durch; die Zahlen sind wichtiger als die Datei.
      let pfad: string | null = null;
      try {
        const sicher = datei.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
        const p = `${ownerUserId}/eingangsbelege/${Date.now()}_${sicher}`;
        const { error } = await supabase.storage.from('dokumente').upload(p, datei, { upsert: false });
        if (!error) pfad = p;
      } catch { /* Ablage optional */ }
      setDateiPfad(pfad);

      const res = await fetch('/api/beleg-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType }),
      });
      const j = await res.json();
      if (!res.ok) {
        setFehler(j?.error || 'Der Beleg konnte nicht gelesen werden. Sie können die Felder von Hand ausfüllen.');
        setSchritt('pruefen');
        return;
      }
      setOcr(j as OcrFelder);
      setKennzeichen(kennzeichenAusKategorie(j?.kategorie));
      setSchritt('pruefen');
    } catch {
      setFehler('Das Foto konnte nicht verarbeitet werden.');
      setSchritt('pruefen');
    }
  }

  async function speichern() {
    if (!ownerUserId || busy) return;
    if (fehlt.length > 0) {
      setFehler(`Bei einer Bewirtung fehlt noch: ${fehlt.join(' und ')}. Das verlangt das Finanzamt auf dem Beleg.`);
      return;
    }
    setBusy(true); setFehler(null);
    try {
      const nutzlast = belegNutzlast({
        ocr, kennzeichen, einsatzId, ownerUserId,
        anlass, teilnehmer, dateiPfad,
        // Filiale wie in den Eingangsbelegen aus dem aktiven Standort.
        standortId: konkreterStandort(leseStandortCookie()),
      });
      const { error } = await supabase.from('eingangsbelege').insert(nutzlast);
      if (error) throw error;
      setSchritt('fertig');
    } catch (err: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally {
      setBusy(false);
    }
  }

  function feld(name: keyof OcrFelder, label: string, breit = false) {
    return (
      <label style={{ display: 'block', gridColumn: breit ? 'span 2' : 'span 1' }}>
        <span style={{ display: 'block', fontSize: 12, color: C.dim, marginBottom: 4 }}>{label}</span>
        <input
          value={String(ocr[name] ?? '')}
          onChange={(ev) => setOcr((alt) => ({ ...alt, [name]: ev.target.value }))}
          style={{
            width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text,
            border: `1px solid ${C.rand}`, borderRadius: 8, padding: '9px 11px',
            fontSize: 14, fontFamily: 'inherit',
          }}
        />
      </label>
    );
  }

  if (schritt === 'zu') {
    return (
      <label
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, cursor: ownerUserId ? 'pointer' : 'default',
          background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 999,
          padding: '6px 14px', fontSize: 13, fontWeight: 700, opacity: ownerUserId ? 1 : 0.5,
        }}
      >
        🧾 Beleg erfassen
        <input type="file" accept="image/*,application/pdf" capture="environment"
               disabled={!ownerUserId} style={{ display: 'none' }} onChange={dateiGewaehlt} />
      </label>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.rand}` }}>
          <strong style={{ color: C.text, fontSize: 16 }}>Beleg vom Einsatz</strong>
          <button onClick={zuruecksetzen} style={{ background: 'none', border: 'none', color: C.dim, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>

        <div style={{ padding: 20 }}>
          {schritt === 'lesen' && (
            <p style={{ color: C.dim, fontSize: 14, margin: 0 }}>Der Beleg wird gelesen — einen Moment.</p>
          )}

          {schritt === 'fertig' && (
            <>
              <p style={{ color: C.gruen, fontSize: 15, margin: '0 0 6px', fontWeight: 700 }}>Beleg gespeichert.</p>
              <p style={{ color: C.dim, fontSize: 13.5, margin: '0 0 18px', lineHeight: 1.6 }}>
                Er steht jetzt in den Eingangsbelegen (Vorsteuer, DATEV) und hängt gleichzeitig an diesem Einsatz —
                die Materialkosten dieser Baustelle stimmen damit von selbst.
              </p>
              <button onClick={zuruecksetzen} style={knopf(true)}>Fertig</button>
            </>
          )}

          {schritt === 'pruefen' && (
            <>
              <p style={{ color: C.dim, fontSize: 13.5, margin: '0 0 16px', lineHeight: 1.6 }}>
                Kurz prüfen und ergänzen — die KI liest gut, aber nicht unfehlbar.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                {feld('lieferant', 'Lieferant', true)}
                {feld('belegdatum', 'Belegdatum')}
                {feld('belegnummer', 'Belegnummer')}
                {feld('netto', 'Netto')}
                {feld('ust_satz', 'USt-Satz %')}
                {feld('ust_betrag', 'USt-Betrag')}
                {feld('brutto', 'Brutto')}
              </div>

              <span style={{ display: 'block', fontSize: 12, color: C.dim, marginBottom: 8 }}>Wofür war das?</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {KENNZEICHEN.map((k) => {
                  const aktiv = k.schluessel === kennzeichen;
                  return (
                    <button key={k.schluessel} onClick={() => setKennzeichen(k.schluessel)}
                      style={{
                        background: aktiv ? C.gold : 'transparent', color: aktiv ? C.navy : C.dim,
                        border: `1px solid ${aktiv ? C.gold : C.rand}`, borderRadius: 999,
                        padding: '6px 13px', fontSize: 13, fontWeight: aktiv ? 800 : 600,
                        fontFamily: 'inherit', cursor: 'pointer',
                      }}>
                      {k.label}
                    </button>
                  );
                })}
              </div>
              <p style={{ color: C.dim, fontSize: 12.5, margin: '0 0 14px', lineHeight: 1.55 }}>{info.hinweis}</p>

              {info.brauchtAnlass && (
                <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
                  <label style={{ display: 'block' }}>
                    <span style={{ display: 'block', fontSize: 12, color: C.dim, marginBottom: 4 }}>Anlass</span>
                    <input value={anlass} onChange={(e) => setAnlass(e.target.value)} placeholder="z. B. Abnahme Bauabschnitt 2"
                      style={{ width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.rand}`, borderRadius: 8, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit' }} />
                  </label>
                  <label style={{ display: 'block' }}>
                    <span style={{ display: 'block', fontSize: 12, color: C.dim, marginBottom: 4 }}>Teilnehmer</span>
                    <input value={teilnehmer} onChange={(e) => setTeilnehmer(e.target.value)} placeholder="alle Personen, auch Sie selbst"
                      style={{ width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.rand}`, borderRadius: 8, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit' }} />
                  </label>
                </div>
              )}

              {pruefung.warnung && (
                <p style={{ color: C.warn, fontSize: 12.5, lineHeight: 1.55, margin: '0 0 12px', paddingLeft: 10, borderLeft: `2px solid ${C.warn}` }}>
                  {pruefung.warnung}
                </p>
              )}
              {fehler && (
                <p style={{ color: C.rot, fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' }}>{fehler}</p>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={speichern} disabled={busy} style={knopf(true)}>
                  {busy ? 'Wird gespeichert …' : 'Beleg speichern'}
                </button>
                <button onClick={zuruecksetzen} disabled={busy} style={knopf(false)}>Abbrechen</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function knopf(betont: boolean) {
  return {
    background: betont ? C.gold : 'transparent',
    color: betont ? C.navy : C.dim,
    border: `1px solid ${betont ? C.gold : C.rand}`,
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: betont ? 800 : 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  } as const;
}
