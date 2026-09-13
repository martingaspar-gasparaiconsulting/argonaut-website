'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  MIN_RUHE_TAGE, MAX_SCHRITTE, SPERRE_TAGE,
  fehltZumStarten, beschreibe, letzterKaufJeKontakt, istRuhend, nochGesperrt, VORLAGE,
  type Schritt,
} from '@/lib/rueckholung';

// ============================================================================
// ARGONAUT OS · /dashboard/marketing/rueckholung   (3.15 Paket 3)
//
// Eine Strecke je Betrieb: ab wann gilt jemand als ruhend, und welche
// Nachrichten bekommt er dann. Der Versand läuft im Cron
// /api/cron/rueckholung — hier wird nur eingestellt und nachgesehen.
//
// Die Vorschau zählt mit denselben Funktionen, die nachts auch wirklich
// entscheiden (lib/rueckholung). Eine zweite Zählung in der Oberfläche wäre
// die, die irgendwann andere Zahlen zeigt als der Versand.
// ============================================================================

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
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

/** EINE Zeichenkette — siehe tests/selectLiteral.test.mjs. */
const KONTAKT_SPALTEN = 'id, email, vorname, nachname, firma, status, kunde_seit, letzter_kontakt_am, werbe_einwilligung, werbe_widerspruch_am';

type StreckeZeile = { id: string; name: string; aktiv: boolean; ruhe_tage: number };
type LaufZeile = {
  id: string; email: string; gestartet_am: string; schritt: number;
  faellig_am: string | null; status: string; stopp_grund: string | null;
};
type Kontakt = Record<string, unknown> & { id: string };

const heuteIso = () => new Date().toISOString().slice(0, 10);

const karte: CSSProperties = {
  background: '#fff', border: '1px solid #e8ecf2', borderRadius: 12,
  padding: 18, marginBottom: 16,
};
const feld: CSSProperties = {
  width: '100%', padding: '9px 11px', border: '1px solid #d8dee8',
  borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
};
const knopf = (farbe: string, aus = false): CSSProperties => ({
  background: aus ? '#e8ecf2' : farbe,
  color: aus ? C.textDim : '#fff',
  border: 'none', borderRadius: 8, padding: '9px 16px',
  fontSize: 14, fontWeight: 600, cursor: aus ? 'not-allowed' : 'pointer',
});

export default function RueckholungSeite() {
  const [laedt, setLaedt] = useState(true);
  const [meldung, setMeldung] = useState('');
  const [strecke, setStrecke] = useState<StreckeZeile | null>(null);
  const [name, setName] = useState(VORLAGE.name);
  const [ruheTageFeld, setRuheTageFeld] = useState(String(VORLAGE.ruhe_tage));
  const [schritte, setSchritte] = useState<Schritt[]>(VORLAGE.schritte);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [kaeufe, setKaeufe] = useState<Map<string, string>>(new Map());
  const [laeufe, setLaeufe] = useState<LaufZeile[]>([]);
  const [speichert, setSpeichert] = useState(false);

  const heute = heuteIso();

  // ------------------------------------------------------------------ Laden
  const laden = useCallback(async () => {
    setLaedt(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLaedt(false); setMeldung('Nicht angemeldet.'); return; }

    const { data: sRoh } = await supabase
      .from('rueckhol_strecke').select('id, name, aktiv, ruhe_tage')
      .eq('owner_user_id', user.id).order('erstellt_am', { ascending: true }).limit(1);

    const s = ((sRoh ?? []) as StreckeZeile[])[0] ?? null;
    setStrecke(s);

    if (s) {
      setName(s.name);
      setRuheTageFeld(String(s.ruhe_tage));
      const { data: schRoh } = await supabase
        .from('rueckhol_schritt').select('schritt, nach_tagen, betreff, text, aktiv')
        .eq('strecke_id', s.id).order('schritt', { ascending: true });
      const geladen = (schRoh ?? []) as Schritt[];
      if (geladen.length > 0) setSchritte(geladen);

      const { data: lRoh } = await supabase
        .from('rueckhol_lauf').select('id, email, gestartet_am, schritt, faellig_am, status, stopp_grund')
        .eq('strecke_id', s.id).order('gestartet_am', { ascending: false }).limit(200);
      setLaeufe((lRoh ?? []) as LaufZeile[]);
    }

    const [{ data: kRoh }, { data: rRoh }] = await Promise.all([
      supabase.from('kontakte').select(KONTAKT_SPALTEN).eq('owner_user_id', user.id).limit(2000),
      supabase.from('rechnungen').select('kontakt_id, bezahlt_am, faelligkeitsdatum')
        .eq('owner_user_id', user.id).not('kontakt_id', 'is', null).limit(5000),
    ]);

    setKontakte((kRoh ?? []) as Kontakt[]);
    setKaeufe(letzterKaufJeKontakt(
      ((rRoh ?? []) as { kontakt_id: string | null; bezahlt_am: string | null; faelligkeitsdatum: string | null }[])
        .map((r) => ({ kontakt_id: r.kontakt_id, datum: r.bezahlt_am ?? r.faelligkeitsdatum })),
    ));
    setLaedt(false);
  }, []);

  useEffect(() => { void laden(); }, [laden]);

  // --------------------------------------------------------------- Vorschau
  const entwurf = useMemo(
    () => ({ name, ruhe_tage: Number(ruheTageFeld) || MIN_RUHE_TAGE, schritte }),
    [name, ruheTageFeld, schritte],
  );

  const fehlt = useMemo(() => fehltZumStarten(entwurf), [entwurf]);

  const vorschau = useMemo(() => {
    const offen = new Set(laeufe.filter((l) => l.status === 'aktiv').map((l) => l.email));
    const letztesEnde = new Map<string, string>();
    for (const l of laeufe) {
      if (l.status === 'aktiv') continue;
      const alt = letztesEnde.get(l.email);
      if (!alt || l.gestartet_am > alt) letztesEnde.set(l.email, l.gestartet_am);
    }

    let treffer = 0, schonDrin = 0, gesperrt = 0, zuFrisch = 0, ohnePost = 0;
    const beispiele: { name: string; tage: number | null }[] = [];

    for (const k of kontakte) {
      const r = istRuhend(k, kaeufe.get(String(k.id)) ?? null, heute, entwurf.ruhe_tage);
      if (r.ruhend) {
        const mail = String(k.email ?? '');
        if (offen.has(mail)) { schonDrin += 1; continue; }
        if (nochGesperrt(letztesEnde.get(mail), heute)) { gesperrt += 1; continue; }
        treffer += 1;
        if (beispiele.length < 8) {
          beispiele.push({
            name: [k.vorname, k.nachname].filter(Boolean).join(' ') || String(k.firma ?? mail),
            tage: r.tageStill,
          });
        }
        continue;
      }
      if (r.tageStill != null && r.tageStill >= 0) zuFrisch += 1;
      else ohnePost += 1;
    }

    return { gesamt: kontakte.length, treffer, schonDrin, gesperrt, zuFrisch, ohnePost, beispiele };
  }, [kontakte, kaeufe, entwurf.ruhe_tage, heute, laeufe]);

  // --------------------------------------------------------------- Speichern
  function setzeSchritt(i: number, teil: Partial<Schritt>) {
    setSchritte((alt) => alt.map((s, x) => (x === i ? { ...s, ...teil } : s)));
  }

  function schrittDazu() {
    setSchritte((alt) => {
      if (alt.length >= MAX_SCHRITTE) return alt;
      const letzter = alt[alt.length - 1];
      return [...alt, {
        schritt: (letzter?.schritt ?? 0) + 1,
        nach_tagen: (letzter?.nach_tagen ?? 0) + 14,
        betreff: '', text: '', aktiv: true,
      }];
    });
  }

  async function speichern(scharf: boolean) {
    setSpeichert(true);
    setMeldung('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht angemeldet.');

      const werte = {
        owner_user_id: user.id,
        name: name.trim(),
        ruhe_tage: Number(ruheTageFeld) || MIN_RUHE_TAGE,
        aktiv: scharf,
        geaendert_am: new Date().toISOString(),
      };

      let streckeId = strecke?.id ?? '';
      if (streckeId) {
        const { error } = await supabase.from('rueckhol_strecke').update(werte).eq('id', streckeId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('rueckhol_strecke').insert(werte).select('id').single();
        if (error) throw error;
        streckeId = (data as { id: string }).id;
      }

      // Schritte: vorhandene aktualisieren, neue anlegen. Bewusst kein
      // Löschen-und-neu-Anlegen — daran hängen die Versand-Sperren.
      for (const s of schritte) {
        const zeile = {
          owner_user_id: user.id,
          strecke_id: streckeId,
          schritt: s.schritt,
          nach_tagen: Number(s.nach_tagen) || 0,
          betreff: String(s.betreff ?? ''),
          text: String(s.text ?? ''),
          aktiv: s.aktiv !== false,
        };
        const { error } = await supabase
          .from('rueckhol_schritt')
          .upsert(zeile, { onConflict: 'strecke_id,schritt' });
        if (error) throw error;
      }

      setMeldung(scharf ? 'Gespeichert und scharfgeschaltet.' : 'Gespeichert. Die Strecke läuft noch nicht.');
      await laden();
    } catch (e) {
      setMeldung('Konnte nicht gespeichert werden: ' + (e instanceof Error ? e.message : 'unbekannter Fehler'));
    } finally {
      setSpeichert(false);
    }
  }

  // ------------------------------------------------------------------ Anzeige
  if (laedt) {
    return <div style={{ padding: 24, color: C.textDim }}>Lade …</div>;
  }

  const aktiv = strecke?.aktiv === true;
  const aktiveLaeufe = laeufe.filter((l) => l.status === 'aktiv');
  const beendet = laeufe.filter((l) => l.status !== 'aktiv');

  return (
    <div style={{ padding: '22px 24px 60px', maxWidth: 980, margin: '0 auto' }}>

      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.navy, margin: '0 0 6px' }}>
        ↩️ Rückhol-Strecke
      </h1>
      <p style={{ color: C.textDim, margin: '0 0 18px', fontSize: 14, maxWidth: '70ch' }}>
        Kunden, die lange nichts mehr gekauft haben, bekommen automatisch eine kurze Folge von
        Nachrichten. Wer zwischendurch kauft oder sich meldet, fällt sofort heraus.
      </p>

      <div style={{
        ...karte,
        background: aktiv ? 'rgba(76,175,125,0.08)' : 'rgba(224,162,76,0.08)',
        borderColor: aktiv ? 'rgba(76,175,125,0.4)' : 'rgba(224,162,76,0.4)',
      }}>
        <strong style={{ color: aktiv ? C.green : C.warn }}>
          {aktiv ? 'Die Strecke läuft.' : 'Die Strecke ist ausgeschaltet.'}
        </strong>
        <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 4 }}>{beschreibe(entwurf)}</div>
      </div>

      {/* ------------------------------------------------------ Einstellung */}
      <div style={karte}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: '0 0 12px' }}>Einstellung</h2>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 4 }}>
          Name der Strecke
        </label>
        <input style={{ ...feld, marginBottom: 14 }} value={name} onChange={(e) => setName(e.target.value)} />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 4 }}>
          Als ruhend gilt, wer seit so vielen Tagen nichts gekauft hat
        </label>
        <input
          style={{ ...feld, maxWidth: 180 }}
          type="number"
          min={MIN_RUHE_TAGE}
          value={ruheTageFeld}
          onChange={(e) => setRuheTageFeld(e.target.value)}
        />
        <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 6 }}>
          Mindestens {MIN_RUHE_TAGE} Tage. Wer früher anschreibt, erwischt seine Stammkunden.
          Maßgeblich ist der letzte Kauf; gibt es keine Rechnung, der letzte Kontakt.
        </div>
      </div>

      {/* --------------------------------------------------------- Vorschau */}
      <div style={karte}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>
          Wen würde das heute betreffen?
        </h2>
        <p style={{ color: C.textDim, fontSize: 12.5, margin: '0 0 12px' }}>
          Gezählt wird mit denselben Regeln, nach denen nachts auch wirklich versendet wird.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          {[
            { label: 'geprüft', wert: vorschau.gesamt, farbe: C.textDim },
            { label: 'kämen neu hinein', wert: vorschau.treffer, farbe: C.green },
            { label: 'sind schon drin', wert: vorschau.schonDrin, farbe: C.cyan },
            { label: 'noch gesperrt', wert: vorschau.gesperrt, farbe: C.warn },
            { label: 'noch zu frisch', wert: vorschau.zuFrisch, farbe: C.textDim },
            { label: 'dürfen keine Post', wert: vorschau.ohnePost, farbe: C.danger },
          ].map((z) => (
            <div key={z.label} style={{ background: '#f7f9fc', borderRadius: 9, padding: '11px 13px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: z.farbe, fontVariantNumeric: 'tabular-nums' }}>{z.wert}</div>
              <div style={{ fontSize: 12, color: C.textDim }}>{z.label}</div>
            </div>
          ))}
        </div>

        <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 10 }}>
          „Dürfen keine Post" sind Kontakte ohne E-Mail-Adresse, ohne Einwilligung oder mit
          Widerspruch — sie werden nie angeschrieben. „Noch gesperrt" heißt: war in den letzten
          {' '}{SPERRE_TAGE} Tagen schon einmal in dieser Strecke.
        </div>

        {vorschau.beispiele.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid #eef1f6', paddingTop: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.navy, marginBottom: 6 }}>
              Beispiele aus der Gruppe
            </div>
            {vorschau.beispiele.map((b, i) => (
              <div key={i} style={{ fontSize: 13, color: C.navy2, padding: '3px 0' }}>
                {b.name} <span style={{ color: C.textDim }}>— seit {b.tage} Tagen still</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* -------------------------------------------------------- Nachrichten */}
      <div style={karte}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>
          Die Nachrichten
        </h2>
        <p style={{ color: C.textDim, fontSize: 12.5, margin: '0 0 14px' }}>
          Platzhalter: <code>{'{{name}}'}</code>, <code>{'{{firma}}'}</code>, <code>{'{{betrieb}}'}</code>,
          {' '}<code>{'{{tage}}'}</code>, <code>{'{{letzter_kauf}}'}</code>. Die Anrede und der
          Abmelde-Hinweis werden automatisch ergänzt.
        </p>

        {schritte.map((s, i) => (
          <div key={s.schritt} style={{
            border: '1px solid #e8ecf2', borderRadius: 10, padding: 14, marginBottom: 12,
            background: s.aktiv === false ? '#f7f9fc' : '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <strong style={{ color: C.navy }}>Nachricht {s.schritt}</strong>
              <label style={{ fontSize: 13, color: C.textDim }}>
                nach{' '}
                <input
                  type="number" min={0}
                  value={s.nach_tagen}
                  onChange={(e) => setzeSchritt(i, { nach_tagen: Number(e.target.value) })}
                  style={{ ...feld, width: 80, display: 'inline-block', padding: '5px 8px' }}
                />{' '}Tagen
              </label>
              <label style={{ fontSize: 13, color: C.textDim, marginLeft: 'auto' }}>
                <input
                  type="checkbox"
                  checked={s.aktiv !== false}
                  onChange={(e) => setzeSchritt(i, { aktiv: e.target.checked })}
                /> aktiv
              </label>
            </div>

            <input
              style={{ ...feld, marginBottom: 8 }}
              placeholder="Betreff"
              value={s.betreff}
              onChange={(e) => setzeSchritt(i, { betreff: e.target.value })}
            />
            <textarea
              style={{ ...feld, minHeight: 120, resize: 'vertical' }}
              placeholder="Text der Nachricht"
              value={s.text}
              onChange={(e) => setzeSchritt(i, { text: e.target.value })}
            />
          </div>
        ))}

        {schritte.length < MAX_SCHRITTE && (
          <button type="button" style={knopf(C.navy2)} onClick={schrittDazu}>
            + Nachricht hinzufügen
          </button>
        )}
      </div>

      {/* ---------------------------------------------------------- Speichern */}
      <div style={karte}>
        {fehlt.length > 0 && (
          <div style={{
            background: 'rgba(224,102,102,0.08)', border: '1px solid rgba(224,102,102,0.3)',
            borderRadius: 9, padding: '10px 13px', marginBottom: 12, fontSize: 13.5, color: C.navy,
          }}>
            <strong style={{ color: C.danger }}>Zum Scharfschalten fehlt noch:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              {fehlt.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={knopf(C.navy2, speichert)} disabled={speichert} onClick={() => void speichern(false)}>
            Nur speichern
          </button>
          <button
            type="button"
            style={knopf(C.green, speichert || fehlt.length > 0)}
            disabled={speichert || fehlt.length > 0}
            onClick={() => void speichern(true)}
          >
            Speichern und scharfschalten
          </button>
          {aktiv && (
            <button type="button" style={knopf(C.warn, speichert)} disabled={speichert} onClick={() => void speichern(false)}>
              Ausschalten
            </button>
          )}
        </div>

        {meldung && <div style={{ marginTop: 10, fontSize: 13.5, color: C.navy }}>{meldung}</div>}
      </div>

      {/* ------------------------------------------------------------ Läufe */}
      {laeufe.length > 0 && (
        <div style={karte}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: '0 0 12px' }}>
            Wer gerade in der Strecke ist ({aktiveLaeufe.length})
          </h2>

          {aktiveLaeufe.length === 0 && (
            <div style={{ color: C.textDim, fontSize: 13.5 }}>Im Moment niemand.</div>
          )}

          {aktiveLaeufe.slice(0, 50).map((l) => (
            <div key={l.id} style={{
              display: 'flex', justifyContent: 'space-between', gap: 12,
              padding: '7px 0', borderBottom: '1px solid #f1f4f8', fontSize: 13.5, flexWrap: 'wrap',
            }}>
              <span style={{ color: C.navy }}>{l.email}</span>
              <span style={{ color: C.textDim }}>
                Nachricht {l.schritt} verschickt · nächste {l.faellig_am ?? '—'}
              </span>
            </div>
          ))}

          {beendet.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: '18px 0 8px' }}>
                Abgeschlossen ({beendet.length})
              </h3>
              {beendet.slice(0, 30).map((l) => (
                <div key={l.id} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  padding: '6px 0', borderBottom: '1px solid #f1f4f8', fontSize: 13, flexWrap: 'wrap',
                }}>
                  <span style={{ color: C.textDim }}>{l.email}</span>
                  <span style={{ color: l.status === 'gestoppt' ? C.warn : C.textDim }}>
                    {l.stopp_grund ?? 'Strecke durchlaufen'}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
