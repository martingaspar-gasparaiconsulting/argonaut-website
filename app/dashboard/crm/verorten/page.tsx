'use client';

// ============================================================
// ARGONAUT OS · Block 1 · I-1d-2 · Adressen verorten
//
// WARUM IM BROWSER
//   Eine Serverless-Funktion hat ein Zeitlimit. 300 Adressen brauchen zehn
//   Minuten. Der Browser ruft /api/geocode einzeln auf, mit Pause dazwischen.
//
// WIEDERAUFNAHME IST KOSTENLOS
//   Beim Start wird gefragt: "Wer hat eine Adresse, aber keine Koordinaten?"
//   Bricht der Lauf nach 40 ab, sind es beim nächsten Start eben 260 statt 300.
//   Kein gespeicherter Zustand, keine Warteschlangen-Tabelle.
//
// DER LAUF DARF NICHT AM ERSTEN AUSRUTSCHER STERBEN
//   Eine nicht gefundene Adresse wird übersprungen. Ein Minutenlimit wird
//   abgewartet. Nur ein leeres Tageskontingent oder ein fehlender Schlüssel
//   beenden den Lauf — und dann mit einem Satz, der sagt, was zu tun ist.
//
// Pfad: app/dashboard/crm/verorten/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useRef, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  waehleOffene, deuteAntwort, zaehle, leererStand, standKlartext,
  fortschrittProzent, geschaetzteDauer, warte,
  PAUSE_MS, WARTEZEIT_429_MS, MAX_WIEDERHOLUNGEN, ANFRAGEN_PRO_MINUTE,
  type Zwischenstand, type VerortbarKandidat,
} from '../../_components/verortungsLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

type Art = 'kontakt' | 'firma';

interface Eintrag extends VerortbarKandidat {
  name: string;
  art: Art;
}

interface Protokoll {
  name: string;
  meldung: string;
  gut: boolean;
}

export default function VerortenPage() {
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [offen, setOffen] = useState<Eintrag[]>([]);
  const [schonVerortet, setSchonVerortet] = useState(0);
  const [ohneAdresse, setOhneAdresse] = useState(0);

  const [stand, setStand] = useState<Zwischenstand>(leererStand());
  const [protokoll, setProtokoll] = useState<Protokoll[]>([]);
  const [wartesekunden, setWartesekunden] = useState(0);

  /** Erlaubt das Anhalten mitten im Lauf. */
  const abbrechen = useRef(false);

  // --- Wer braucht Koordinaten? -----------------------------------------
  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { setFehler('Nicht angemeldet.'); return; }

      const [kRes, fRes] = await Promise.all([
        supabase.from('kontakte')
          .select('id, vorname, nachname, firma, strasse, plz, ort, geo_lat, geo_lon'),
        supabase.from('firmen')
          .select('id, name, strasse, plz, ort, geo_lat, geo_lon'),
      ]);
      if (kRes.error) throw kRes.error;

      const kontakte: Eintrag[] = ((kRes.data as unknown as Array<Record<string, unknown>>) ?? []).map((k) => ({
        id: k.id as string,
        art: 'kontakt',
        name: [k.vorname, k.nachname].filter(Boolean).join(' ') || (k.firma as string) || 'Unbenannt',
        strasse: (k.strasse as string) ?? null,
        plz: (k.plz as string) ?? null,
        ort: (k.ort as string) ?? null,
        geo_lat: (k.geo_lat as number) ?? null,
        geo_lon: (k.geo_lon as number) ?? null,
      }));

      const firmen: Eintrag[] = ((fRes.data as unknown as Array<Record<string, unknown>>) ?? []).map((f) => ({
        id: f.id as string,
        art: 'firma',
        name: (f.name as string) || 'Unbenannte Firma',
        strasse: (f.strasse as string) ?? null,
        plz: (f.plz as string) ?? null,
        ort: (f.ort as string) ?? null,
        geo_lat: (f.geo_lat as number) ?? null,
        geo_lon: (f.geo_lon as number) ?? null,
      }));

      const b = waehleOffene([...kontakte, ...firmen]);
      setOffen(b.offen);
      setSchonVerortet(b.schonVerortet);
      setOhneAdresse(b.ohneAdresse);
      setStand(leererStand(b.offen.length));
      setProtokoll([]);
    } catch (e: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => { void laden_(); }, [laden_]);

  // --- Der Lauf ----------------------------------------------------------
  async function starten() {
    if (offen.length === 0) return;
    const dauer = geschaetzteDauer(offen.length);

    if (!window.confirm(
      `${offen.length} Adressen verorten?\n\n` +
      `Das dauert ${dauer.text}. Der Kartendienst erlaubt nur ${ANFRAGEN_PRO_MINUTE} Anfragen pro Minute.\n\n` +
      'Lass dieses Fenster offen. Bricht der Lauf ab, geht es beim nächsten Mal ' +
      'dort weiter, wo er stehen geblieben ist.'
    )) return;

    abbrechen.current = false;
    setProtokoll([]);
    let s: Zwischenstand = { ...leererStand(offen.length), laeuft: true };
    setStand(s);

    for (let i = 0; i < offen.length; i++) {
      if (abbrechen.current) {
        s = { ...s, laeuft: false, abgebrochen: 'Vom Benutzer angehalten. Der Fortschritt bleibt erhalten.' };
        setStand(s);
        return;
      }

      const e = offen[i];
      let versuche = 0;
      let fertig = false;

      while (!fertig) {
        let status = 0;
        let daten: unknown = {};

        try {
          const res = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ art: e.art, id: e.id }),
          });
          status = res.status;
          daten = await res.json();
        } catch {
          status = 0;
          daten = { error: 'Netzwerkfehler.' };
        }

        const deutung = deuteAntwort(status, daten);

        if (deutung.weitermachen === 'abbrechen') {
          s = { ...s, laeuft: false, abgebrochen: deutung.meldung };
          setStand(s);
          return;
        }

        if (deutung.weitermachen === 'wiederholen') {
          versuche++;
          if (versuche > MAX_WIEDERHOLUNGEN) {
            s = zaehle({ ...s }, 'fehler');
            setStand(s);
            setProtokoll((p) => [{ name: e.name, meldung: 'Auch nach Wartezeit abgelehnt.', gut: false }, ...p].slice(0, 60));
            fertig = true;
            break;
          }

          // Sichtbar warten. Sonst denkt der Bediener, es hängt.
          s = { ...s, wartetBis: Date.now() + WARTEZEIT_429_MS };
          setStand(s);
          for (let rest = Math.ceil(WARTEZEIT_429_MS / 1000); rest > 0; rest--) {
            if (abbrechen.current) break;
            setWartesekunden(rest);
            await warte(1000);
          }
          setWartesekunden(0);
          s = { ...s, wartetBis: null };
          setStand(s);
          continue;
        }

        // 'weiter'
        s = zaehle({ ...s }, deutung.ausgang);
        setStand(s);
        setProtokoll((p) => [
          { name: e.name, meldung: deutung.meldung, gut: deutung.ausgang === 'verortet' },
          ...p,
        ].slice(0, 60));
        fertig = true;
      }

      // Drosselung. Nach der letzten Adresse nicht mehr warten.
      if (i < offen.length - 1 && !abbrechen.current) await warte(PAUSE_MS);
    }

    setStand((x) => ({ ...x, laeuft: false }));
    await laden_();
  }

  function anhalten() {
    abbrechen.current = true;
  }

  // ----------------------------------------------------------------------
  const prozent = fortschrittProzent(stand);
  const dauer = geschaetzteDauer(offen.length);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · CRM</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Adressen verorten</h1>
          <p style={styles.sub}>
            Ohne Koordinaten kann ARGONAUT keine Anfahrt berechnen und keinen Preis nennen.
            Hier werden alle Kontakte und Firmen mit vollständiger Anschrift auf einmal verortet.
          </p>
        </div>
        <a href="/dashboard/crm" style={styles.ghostBtn}>← Zum CRM</a>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? (
        <div style={styles.hint}>Prüft, wer Koordinaten braucht …</div>
      ) : (
        <>
          <div style={styles.zahlenGrid}>
            <Zahl label="Warten auf Koordinaten" wert={offen.length} farbe={offen.length ? C.warn : C.green} />
            <Zahl label="Bereits verortet" wert={schonVerortet} farbe={C.green} />
            <Zahl label="Ohne Anschrift" wert={ohneAdresse} farbe={ohneAdresse ? C.textDim : C.green} />
          </div>

          {ohneAdresse > 0 && (
            <div style={styles.warnBox}>
              ⚠ {ohneAdresse} Datensätze haben keine vollständige Anschrift (Straße, PLZ und Ort).
              Sie können nicht verortet werden. Ergänze die Adresse im jeweiligen Kontakt.
            </div>
          )}

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Verortung</h2>

            {offen.length === 0 ? (
              <div style={styles.hint}>
                ✓ Alle Datensätze mit vollständiger Anschrift sind verortet. Nichts zu tun.
              </div>
            ) : (
              <>
                <div style={styles.infoBox}>
                  <strong>Was passiert</strong><br />
                  {offen.length} Adressen werden nacheinander an den Kartendienst geschickt —
                  gedrosselt auf {ANFRAGEN_PRO_MINUTE} pro Minute, weil er nicht mehr erlaubt.
                  Das dauert <strong>{dauer.text}</strong>.
                  <br /><br />
                  <span style={{ color: C.textDim }}>
                    Lass dieses Fenster offen. Bricht der Lauf ab — Stromausfall, Kontingent leer —
                    geht es beim nächsten Start dort weiter, wo er stehen geblieben ist. Bereits
                    verortete Adressen werden nicht noch einmal abgefragt.
                  </span>
                </div>

                {/* Fortschritt */}
                {(stand.laeuft || stand.erledigt > 0 || stand.abgebrochen) && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ color: stand.abgebrochen ? C.warn : C.textDim }}>
                        {stand.wartetBis
                          ? `Kartendienst gedrosselt — weiter in ${wartesekunden} s`
                          : standKlartext(stand)}
                      </span>
                      <span style={{ color: C.gold, fontWeight: 700 }}>{prozent} %</span>
                    </div>
                    <div style={styles.balkenSpur}>
                      <div style={{
                        ...styles.balken,
                        width: `${prozent}%`,
                        background: stand.abgebrochen ? C.warn : C.green,
                      }} />
                    </div>
                  </div>
                )}

                {stand.abgebrochen && (
                  <div style={styles.warnBox}>⚠ {stand.abgebrochen}</div>
                )}

                <div style={styles.aktionen}>
                  {stand.laeuft ? (
                    <button onClick={anhalten} style={styles.ghostBtn}>Anhalten</button>
                  ) : (
                    <>
                      <button onClick={laden_} style={styles.ghostBtn}>Neu prüfen</button>
                      <button onClick={starten} style={styles.goldBtn}>
                        {stand.erledigt > 0 ? 'Weiter verorten' : `${offen.length} Adressen verorten`}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Protokoll */}
          {protokoll.length > 0 && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Verlauf</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 320, overflowY: 'auto' }}>
                {protokoll.map((p, i) => (
                  <div key={i} style={styles.protokollZeile}>
                    <span style={{ color: p.gut ? C.green : C.warn, width: 16 }}>{p.gut ? '✓' : '·'}</span>
                    <span style={{ flex: '1 1 180px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </span>
                    <span style={{ color: C.textDim, fontSize: 12, flex: '1 1 220px' }}>{p.meldung}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Zahl({ label, wert, farbe }: { label: string; wert: number; farbe: string }) {
  return (
    <div style={styles.zahlBox}>
      <div style={styles.zahlLabel}>{label}</div>
      <div style={{ ...styles.zahlWert, color: farbe }}>{wert}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 640, lineHeight: 1.5 },

  zahlenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 },
  zahlBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  zahlLabel: { fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  zahlWert: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 18 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: C.text, textTransform: 'uppercase', letterSpacing: 1 },

  balkenSpur: { height: 10, background: C.navy, borderRadius: 999, overflow: 'hidden', border: `1px solid ${C.border}` },
  balken: { height: '100%', borderRadius: 999, transition: 'width 0.3s ease' },

  protokollZeile: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(143,163,190,0.06)', flexWrap: 'wrap' },

  aktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' },
  goldBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },

  hint: { color: C.textDim, fontSize: 14, padding: '14px 0', lineHeight: 1.6 },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  infoBox: { marginTop: 8, padding: '12px 14px', background: 'rgba(0,229,255,0.07)', border: `1px solid rgba(0,229,255,0.22)`, borderRadius: 10, fontSize: 13, color: C.text, lineHeight: 1.6 },
  warnBox: { marginTop: 14, marginBottom: 14, padding: '12px 14px', background: 'rgba(224,162,76,0.09)', border: `1px solid rgba(224,162,76,0.3)`, borderRadius: 10, fontSize: 13, color: C.text, lineHeight: 1.6 },
};
