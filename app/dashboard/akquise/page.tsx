'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  ARTEN, ERGEBNISSE, artLabel, ergebnisInfo, berlinTag, zaehle, vomTag,
  tagesreihe, quoten, zielStand, tagesSatz, aufwandFuerTermine,
  type Art, type Ergebnis,
} from '@/lib/aktivitaeten';
import { leseStandortCookie } from '@/lib/aktiverStandort';
import { konkreterStandort, standortOrFilter } from '@/lib/standortDaten';

// ============================================================================
// ARGONAUT OS · MODUL VERTRIEB · Akquise-Cockpit (D2)
//
// Der eine Bildschirm, der bisher gefehlt hat: nicht das Ergebnis, sondern
// der EINSATZ davor. Zwei Fingertipps je Handgriff — Art, dann Ergebnis.
//
// Warum zwei Tipps und kein Formular: Wer zwanzig Mal am Tag etwas erfassen
// soll, erfasst nur dann, wenn es schneller geht als der Zettel daneben.
// Die Notiz ist freiwillig und kommt NACH dem Speichern.
//
// Die Rechenregeln liegen in lib/aktivitaeten.ts und sind dort node-getestet;
// hier steht nur Anzeige und Datenbank.
// ============================================================================

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  gruen: '#4CAF7D', rot: '#E06666', warn: '#E0A24C',
  text: '#E8EDF4', dim: '#8FA3BE', rand: 'rgba(143,163,190,0.18)',
};

const TAGE_FENSTER = 30;   // Grundlage der Quoten
const BALKEN_TAGE = 14;

type Zeile = {
  id: string;
  art: string | null;
  ergebnis: string | null;
  notiz: string | null;
  erstellt_am: string;
};

const AMPEL_FARBE: Record<string, string> = {
  kein_ziel: C.dim, offen: C.warn, fast: C.cyan, erreicht: C.gruen,
};

function zahl(n: number | null, einheit = ''): string {
  if (n == null) return '—';
  return n.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + einheit;
}

export default function AkquisePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [mitarbeiterId, setMitarbeiterId] = useState<string | null>(null);

  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [ziel, setZiel] = useState<number>(0);
  const [zielEingabe, setZielEingabe] = useState('');
  const [termineZiel, setTermineZiel] = useState('');

  const [art, setArt] = useState<Art | null>(null);
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zuletzt, setZuletzt] = useState<string | null>(null);

  // ---------- Wer bin ich, und in welchen Betrieb gehoert die Zeile? ----------
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);

      // Mitarbeiter schreiben in den Betrieb ihres Chefs, nicht auf sich selbst.
      // Faellt die Funktion aus, bleibt der eigene Schluessel — dann greift
      // hoechstens RLS und meldet es sauber, statt still falsch zu buchen.
      const { data: ma } = await supabase
        .from('mitarbeiter').select('id').eq('auth_user_id', id).maybeSingle();
      if (ma?.id) {
        setMitarbeiterId(String(ma.id));
        const { data: chef } = await supabase.rpc('mein_chef_id');
        setOwnerId(typeof chef === 'string' && chef ? chef : id);
      } else {
        setIstChef(true);
        setOwnerId(id);
      }
    })();
  }, []);

  // ---------- Daten holen ----------
  const holen = useCallback(async () => {
    if (!ownerId) return;
    setLaden(true);
    const ab = new Date(Date.now() - TAGE_FENSTER * 86_400_000).toISOString();

    let q = supabase
      .from('vertrieb_aktivitaet')
      .select('id, art, ergebnis, notiz, erstellt_am')
      .gte('erstellt_am', ab)
      .order('erstellt_am', { ascending: false })
      .limit(2000);

    // Mehrstandort: fehlt die Zuordnung, wird NICHT versteckt (fail-open).
    const sid = konkreterStandort(leseStandortCookie());
    if (sid) q = q.or(standortOrFilter(sid));

    const { data, error } = await q;
    if (error) setFehler(error.message);
    setZeilen((data as Zeile[]) ?? []);

    const { data: profil } = await supabase
      .from('profiles').select('vertrieb_tagesziel').eq('id', ownerId).maybeSingle();
    const z = Number((profil as { vertrieb_tagesziel?: number | null } | null)?.vertrieb_tagesziel ?? 0) || 0;
    setZiel(z);
    setZielEingabe(z > 0 ? String(z) : '');
    setLaden(false);
  }, [ownerId]);

  useEffect(() => { void holen(); }, [holen]);

  // ---------- Rechnen ----------
  const heuteTag = berlinTag(new Date().toISOString());
  const heuteZeilen = useMemo(() => vomTag(zeilen, heuteTag), [zeilen, heuteTag]);
  const heute = useMemo(() => zaehle(heuteTag ? heuteZeilen : []), [heuteZeilen, heuteTag]);
  const fenster = useMemo(() => zaehle(zeilen), [zeilen]);
  const q = useMemo(() => quoten(fenster), [fenster]);
  const stand = zielStand(heute.gesamt, ziel);
  const reihe = useMemo(
    () => tagesreihe(zeilen, new Date().toISOString(), BALKEN_TAGE),
    [zeilen],
  );
  const maxBalken = Math.max(1, ...reihe.map((r) => r.gesamt));
  const aufwand = aufwandFuerTermine(termineZiel, q);

  // ---------- Erfassen ----------
  async function erfassen(ergebnis: Ergebnis) {
    if (!art || !ownerId || busy) return;
    setBusy(true); setFehler(null);
    const { data, error } = await supabase
      .from('vertrieb_aktivitaet')
      .insert({
        owner_user_id: ownerId,
        mitarbeiter_id: mitarbeiterId,
        art,
        ergebnis,
        standort_id: konkreterStandort(leseStandortCookie()),
      })
      .select('id, art, ergebnis, notiz, erstellt_am')
      .maybeSingle();
    setBusy(false);

    if (error || !data) {
      setFehler(error?.message || 'Konnte nicht gespeichert werden.');
      return;
    }
    setZeilen((alt) => [data as Zeile, ...alt]);
    setZuletzt(String((data as Zeile).id));
    setArt(null);
  }

  async function rueckgaengig(id: string) {
    setBusy(true);
    const { error } = await supabase.from('vertrieb_aktivitaet').delete().eq('id', id);
    setBusy(false);
    if (error) { setFehler(error.message); return; }
    setZeilen((alt) => alt.filter((z) => z.id !== id));
    if (zuletzt === id) setZuletzt(null);
  }

  async function zielSpeichern() {
    if (!istChef || !uid) return;
    const n = Math.max(0, Math.floor(Number(zielEingabe.replace(',', '.'))) || 0);
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ vertrieb_tagesziel: n }).eq('id', uid);
    setBusy(false);
    if (error) { setFehler(error.message); return; }
    setZiel(n);
  }

  // ---------- Anzeige ----------
  return (
    <div style={{ padding: '28px 22px 60px', color: C.text, maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 26, margin: 0 }}>
        📞 Akquise-Cockpit
      </h1>
      <p style={{ color: C.dim, fontSize: 14.5, lineHeight: 1.55, margin: '8px 0 22px', maxWidth: 840 }}>
        Hier zählt nicht das Ergebnis, sondern der Einsatz davor. Zwei Tipps je Handgriff —
        was Sie getan haben und was dabei herauskam. Nach ein paar Tagen wissen Sie,
        <b style={{ color: C.text }}> wie viele Anrufe ein Termin kostet</b>. Genau diese Zahl
        macht Vertrieb planbar und übergebbar.
      </p>

      {fehler && (
        <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.rot}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 13.5 }}>
          {fehler}
        </div>
      )}

      {/* ---------- Erfassen ---------- */}
      <div style={{ background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16, padding: 20, marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
          {art ? `${artLabel(art)} — und was kam dabei heraus?` : 'Was haben Sie gerade getan?'}
        </div>
        <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 16 }}>
          {art ? 'Ein Tipp noch, dann ist es gebucht.' : 'Erster Tipp: die Art. Zweiter Tipp: das Ergebnis.'}
        </div>

        {!art ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {ARTEN.map((a) => (
              <button
                key={a.schluessel}
                onClick={() => { setFehler(null); setArt(a.schluessel); }}
                style={{
                  background: C.navy, border: `1px solid ${C.rand}`, borderRadius: 14,
                  color: C.text, padding: '20px 12px', fontSize: 15.5, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 26 }}>{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {ERGEBNISSE.map((e) => (
                <button
                  key={e.schluessel}
                  disabled={busy}
                  onClick={() => void erfassen(e.schluessel)}
                  style={{
                    background: C.navy, border: `1px solid ${e.farbe}`, borderRadius: 14,
                    color: e.farbe, padding: '20px 12px', fontSize: 15, fontWeight: 700,
                    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
                  }}
                >
                  {e.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setArt(null)}
              style={{ marginTop: 12, background: 'transparent', border: 'none', color: C.dim, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Abbrechen
            </button>
          </>
        )}

        {zuletzt && (
          <div style={{ marginTop: 14, fontSize: 13, color: C.dim, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Gebucht.</span>
            <button
              onClick={() => void rueckgaengig(zuletzt)}
              disabled={busy}
              style={{ background: 'transparent', border: `1px solid ${C.rand}`, borderRadius: 8, color: C.text, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer' }}
            >
              Rückgängig
            </button>
          </div>
        )}
      </div>

      {/* ---------- Heute ---------- */}
      <div style={{ background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16, padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16 }}>Heute</div>
          <div style={{ color: AMPEL_FARBE[stand.ampel] ?? C.dim, fontSize: 13.5, fontWeight: 600 }}>
            {tagesSatz(heute.gesamt, ziel)}
          </div>
        </div>

        {stand.ampel !== 'kein_ziel' && (
          <div style={{ height: 10, background: C.navy, borderRadius: 999, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ width: `${stand.prozent}%`, height: '100%', background: AMPEL_FARBE[stand.ampel], transition: 'width .3s ease' }} />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <Kachel label="Aktivitäten" wert={String(heute.gesamt)} farbe={C.cyan} />
          <Kachel label="Gespräche" wert={String(heute.gespraeche)} farbe={C.gold} unter="jemand war dran" />
          <Kachel label="Termine" wert={String(heute.termine)} farbe={C.gruen} />
          <Kachel label="Absagen" wert={String(heute.absagen)} farbe={C.rot} />
        </div>

        {istChef && (
          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ color: C.dim, fontSize: 13 }}>Tagesziel (Aktivitäten):</label>
            <input
              value={zielEingabe}
              onChange={(e) => setZielEingabe(e.target.value)}
              inputMode="numeric"
              placeholder="z. B. 20"
              style={{ width: 110, background: C.navy, border: `1px solid ${C.rand}`, borderRadius: 10, color: C.text, padding: '8px 10px', fontSize: 14 }}
            />
            <button
              onClick={() => void zielSpeichern()}
              disabled={busy}
              style={{ background: C.gold, border: 'none', borderRadius: 10, color: C.navy, padding: '8px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Speichern
            </button>
            <span style={{ color: C.dim, fontSize: 12 }}>0 = kein Ziel, dann zeigt die Seite nur die Zahlen.</span>
          </div>
        )}
      </div>

      {/* ---------- Die drei Quoten ---------- */}
      <div style={{ background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16, padding: 20, marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
          Ihre Quoten der letzten {TAGE_FENSTER} Tage
        </div>
        <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 16 }}>
          Grundlage: {fenster.gesamt} Aktivitäten. Fehlt die Grundlage, steht hier ein Strich —
          geschätzt wird nichts.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Kachel label="Erreichbarkeit" wert={zahl(q.erreichbarkeit, ' %')} farbe={C.cyan}
                  unter="von allen Versuchen war jemand dran" />
          <Kachel label="Terminquote" wert={zahl(q.terminquote, ' %')} farbe={C.gold}
                  unter="aus Gesprächen werden Termine" />
          <Kachel label="Aufwand je Termin" wert={zahl(q.aktivitaetenJeTermin)} farbe={C.gruen}
                  unter="so viele Aktivitäten kostet ein Termin" />
        </div>

        <div style={{ height: 1, background: C.rand, margin: '18px 0' }} />

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ color: C.dim, fontSize: 13.5 }}>Ich brauche</label>
          <input
            value={termineZiel}
            onChange={(e) => setTermineZiel(e.target.value)}
            inputMode="numeric"
            placeholder="5"
            style={{ width: 80, background: C.navy, border: `1px solid ${C.rand}`, borderRadius: 10, color: C.text, padding: '8px 10px', fontSize: 14 }}
          />
          <label style={{ color: C.dim, fontSize: 13.5 }}>Termine —</label>
          <span style={{ fontSize: 15, fontWeight: 700, color: aufwand != null ? C.gold : C.dim }}>
            {aufwand != null
              ? `das sind rund ${aufwand} Aktivitäten.`
              : 'dafür fehlt noch mindestens ein erfasster Termin.'}
          </span>
        </div>
        <div style={{ color: C.dim, fontSize: 12, marginTop: 8 }}>
          Was ein Termin wert <i>ist</i>, rechnet der{' '}
          <a href="/dashboard/marketing/termin-wert" style={{ color: C.cyan }}>Termin-Wert-Rechner</a>.
          Hier steht, was er <i>kostet</i>.
        </div>
      </div>

      {/* ---------- Verlauf ---------- */}
      <div style={{ background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16, padding: 20, marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 16 }}>
          Die letzten {BALKEN_TAGE} Tage
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
          {reihe.map((r) => (
            <div key={r.tag} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <div
                  title={`${r.label} — ${r.gesamt} Aktivitäten, ${r.termine} Termine`}
                  style={{
                    width: '100%',
                    height: `${Math.round((r.gesamt / maxBalken) * 100)}%`,
                    minHeight: r.gesamt > 0 ? 4 : 2,
                    background: r.termine > 0 ? C.gruen : (r.gesamt > 0 ? C.cyan : C.rand),
                    borderRadius: '6px 6px 0 0',
                  }}
                />
              </div>
              <span style={{ fontSize: 10, color: C.dim, whiteSpace: 'nowrap' }}>{r.label}</span>
            </div>
          ))}
        </div>
        <div style={{ color: C.dim, fontSize: 12, marginTop: 12 }}>
          Grün = an diesem Tag ist mindestens ein Termin entstanden.
        </div>
      </div>

      {/* ---------- Letzte Einträge ---------- */}
      <div style={{ background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16, padding: 20 }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 14 }}>
          Zuletzt erfasst
        </div>
        {laden && <div style={{ color: C.dim, fontSize: 13.5 }}>Wird geladen …</div>}
        {!laden && zeilen.length === 0 && (
          <div style={{ color: C.dim, fontSize: 13.5 }}>
            Noch nichts erfasst. Der erste Eintrag dauert zwei Tipps.
          </div>
        )}
        {zeilen.slice(0, 12).map((z) => {
          const e = ergebnisInfo(z.ergebnis);
          return (
            <div key={z.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.rand}`, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>{ARTEN.find((a) => a.schluessel === z.art)?.icon ?? '•'}</span>
                <span style={{ fontSize: 14 }}>{artLabel(z.art)}</span>
                <span style={{ fontSize: 12.5, color: e.farbe, border: `1px solid ${e.farbe}`, borderRadius: 999, padding: '2px 10px' }}>
                  {e.label}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: C.dim }}>
                  {new Date(z.erstellt_am).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  onClick={() => void rueckgaengig(z.id)}
                  disabled={busy}
                  style={{ background: 'transparent', border: 'none', color: C.dim, fontSize: 12.5, cursor: 'pointer' }}
                  title="Eintrag löschen"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kachel({ label, wert, farbe, unter }: { label: string; wert: string; farbe: string; unter?: string }) {
  return (
    <div style={{ background: '#0A1628', border: '1px solid rgba(143,163,190,0.18)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ color: '#8FA3BE', fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ color: farbe, fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 24 }}>{wert}</div>
      {unter && <div style={{ color: '#8FA3BE', fontSize: 11.5, marginTop: 4 }}>{unter}</div>}
    </div>
  );
}
