'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  teileAuf, grundText, versandSatz, tageSeitKontakt,
  BESTANDSKUNDE_MONATE, type Regeln, type Rechtsgrund, type KontaktRoh,
} from '@/lib/zielgruppe';

// ============================================================================
// ARGONAUT OS · MODUL MARKETING · Zielgruppen aus dem CRM (D5 Teil 1)
//
// Empfänger wurden bisher von Hand in den Verteiler getippt, während die
// echten Kontakte daneben im CRM lagen.
//
// Diese Seite trennt bewusst zwei Fragen, die man leicht verwechselt:
//   1. Wer PASST zur Zielgruppe?   → die Regeln links
//   2. Wem DARF man schreiben?     → die Ampel rechts
// Nur wer beides erfüllt, kommt in die Versandliste. Und wer nicht, sieht
// hier warum — mit dem Knopf, der es in Ordnung bringt.
//
// Die Regeln liegen in lib/zielgruppe.ts und sind dort node-getestet.
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

const AMPEL: Record<'gruen' | 'gelb' | 'rot' | 'grau', string> = {
  gruen: C.gruen, gelb: C.warn, rot: C.rot, grau: C.dim,
};

const QUELLEN: { wert: string; label: string }[] = [
  { wert: 'formular', label: 'Formular auf der Webseite' },
  { wert: 'freebie', label: 'Freebie angefordert' },
  { wert: 'papier', label: 'Auf Papier unterschrieben' },
  { wert: 'telefonisch', label: 'Telefonisch bestätigt' },
  { wert: 'persoenlich', label: 'Persönlich erklärt' },
  { wert: 'sonstige', label: 'Sonstiges' },
];

type Kontakt = KontaktRoh & {
  id: string; vorname: string | null; nachname: string | null;
  firma: string | null; email: string | null; status: string | null; quelle: string | null;
};
type Zielgruppe = { id: string; name: string; beschreibung: string | null; regeln: Regeln };

const eingabe = {
  width: '100%', background: C.navy, border: `1px solid ${C.rand}`, borderRadius: 10,
  color: C.text, padding: '9px 12px', fontSize: 14, boxSizing: 'border-box' as const,
  fontFamily: 'inherit',
};

function name(k: Kontakt): string {
  return [k.vorname, k.nachname].filter(Boolean).join(' ').trim() || k.firma || k.email || 'Ohne Namen';
}

export default function ZielgruppenPage() {
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [gruppen, setGruppen] = useState<Zielgruppe[]>([]);
  const [regeln, setRegeln] = useState<Regeln>({});
  const [gruppenId, setGruppenId] = useState<string>('');
  const [gruppenName, setGruppenName] = useState('Neue Zielgruppe');

  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [offenerKontakt, setOffenerKontakt] = useState<string | null>(null);

  const jetzt = useMemo(() => new Date().toISOString(), [kontakte]);

  const holen = useCallback(async () => {
    setLaden(true);
    const [{ data: k, error }, { data: z }] = await Promise.all([
      // ▄▄▄ DIE SPALTENLISTE MUSS EINE EINZIGE ZEICHENKETTE SEIN ▄▄▄
      // Der Supabase-Client liest sie auf TYP-Ebene aus. Setzt man sie mit `+`
      // aus zwei Stuecken zusammen, ist sie fuer den Compiler nur noch
      // `string` — und die Abfrage liefert statt der Zeilen einen Fehlertyp
      // (`GenericStringError`). Der Build bricht dann ab, obwohl die Abfrage
      // zur Laufzeit funktionieren wuerde. Gefunden am 08.09.26.
      // Also: nie umbrechen, auch wenn die Zeile lang wird.
      supabase.from('kontakte')
        .select('id, vorname, nachname, firma, email, status, quelle, letzter_kontakt_am, werbe_einwilligung, werbe_einwilligung_am, werbe_einwilligung_quelle, werbe_widerspruch_am, kunde_seit')
        .order('nachname', { ascending: true }).limit(2000),
      supabase.from('zielgruppe').select('id, name, beschreibung, regeln').order('erstellt_am', { ascending: false }),
    ]);
    if (error) setFehler(error.message);
    setKontakte((k as Kontakt[]) ?? []);
    setGruppen((z as Zielgruppe[]) ?? []);
    setLaden(false);
  }, []);

  useEffect(() => { void holen(); }, [holen]);

  async function ruf(nutzlast: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true); setFehler(null); setMeldung(null);
    try {
      const res = await fetch('/api/marketing/zielgruppe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nutzlast),
      });
      const j = (await res.json()) as Record<string, unknown>;
      if (!res.ok || !j?.ok) { setFehler(String(j?.error || 'Das hat nicht geklappt.')); return null; }
      return j;
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
      return null;
    } finally { setBusy(false); }
  }

  const auf = useMemo(() => teileAuf(kontakte, regeln, jetzt), [kontakte, regeln, jetzt]);

  const statusWerte = useMemo(() => {
    const s = new Set<string>();
    for (const k of kontakte) if (k.status) s.add(String(k.status));
    return Array.from(s).sort();
  }, [kontakte]);

  function statusUmschalten(w: string) {
    const jetztListe = regeln.status ?? [];
    setRegeln({
      ...regeln,
      status: jetztListe.includes(w) ? jetztListe.filter((x) => x !== w) : [...jetztListe, w],
    });
  }

  async function gruppeSpeichern() {
    const j = await ruf({ aktion: 'speichern', id: gruppenId || undefined, name: gruppenName, regeln });
    if (!j) return;
    setGruppenId(String(j.id));
    setMeldung('Zielgruppe gespeichert.');
    await holen();
  }

  function gruppeLaden(z: Zielgruppe) {
    setGruppenId(z.id);
    setGruppenName(z.name);
    setRegeln(z.regeln || {});
    setMeldung(null);
  }

  async function einwilligung(kontaktId: string, quelle: string) {
    const j = await ruf({ aktion: 'einwilligung', kontaktId, setzen: true, quelle });
    if (!j) return;
    setOffenerKontakt(null);
    setMeldung('Einwilligung eingetragen — mit Datum und Herkunft als Nachweis.');
    await holen();
  }

  async function widerspruch(kontaktId: string) {
    const j = await ruf({ aktion: 'widerspruch', kontaktId });
    if (!j) return;
    setMeldung('Widerspruch eingetragen. Der Kontakt bekommt keine Werbepost mehr.');
    await holen();
  }

  async function uebernehmen() {
    const ids = auf.erlaubt
      .filter((k) => k.werbe_einwilligung === true)
      .map((k) => String((k as Kontakt).id));
    if (ids.length === 0) { setFehler('Es ist niemand mit ausdrücklicher Einwilligung dabei.'); return; }
    const j = await ruf({ aktion: 'uebernehmen', kontaktIds: ids });
    if (!j) return;
    const teile = [`${j.uebernommen} in den Verteiler übernommen`];
    if (Number(j.schonDrin) > 0) teile.push(`${j.schonDrin} standen schon drin`);
    if (Number(j.abgelehnt) > 0) teile.push(`${j.abgelehnt} abgelehnt`);
    setMeldung(teile.join(' · ') + '.');
    await holen();
  }

  const mitEinwilligung = auf.erlaubt.filter((k) => k.werbe_einwilligung === true).length;
  const nurBestand = auf.erlaubt.length - mitEinwilligung;

  return (
    <div style={{ padding: '28px 22px 60px', color: C.text, maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 26, margin: 0 }}>
        🎯 Zielgruppen aus dem CRM
      </h1>
      <p style={{ color: C.dim, fontSize: 14.5, lineHeight: 1.55, margin: '8px 0 6px', maxWidth: 880 }}>
        Empfänger mussten Sie bisher von Hand eintippen, während Ihre echten Kontakte daneben im CRM lagen.
        Hier stellen Sie eine Zielgruppe aus Ihren Kontakten zusammen — und sehen zu jedem,
        <b style={{ color: C.text }}> ob Sie ihm überhaupt schreiben dürfen</b>.
      </p>
      <p style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.55, margin: '0 0 22px', maxWidth: 880 }}>
        Ein Kontakt im CRM hat nicht automatisch in Werbung eingewilligt. Wer alle anschreibt, verschickt
        unzulässige Werbung — je Empfänger abmahnfähig. Deshalb sperrt diese Seite, was keine Grundlage hat.
        Das ist die Umsetzung des Gesetzestextes, kein Rechtsrat.
      </p>

      {fehler && (
        <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.rot}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 13.5 }}>{fehler}</div>
      )}
      {meldung && (
        <div style={{ background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.gruen}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 13.5 }}>{meldung}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 16, alignItems: 'start' }}>

        {/* ---------- Regeln ---------- */}
        <div style={{ background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16, padding: 20 }}>
          <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 14 }}>
            Wer soll hinein?
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 5 }}>Name, Firma oder Adresse enthält</div>
              <input style={eingabe} value={regeln.suche ?? ''}
                     onChange={(e) => setRegeln({ ...regeln, suche: e.target.value })} placeholder="z. B. Dachbau" />
            </div>

            {statusWerte.length > 0 && (
              <div>
                <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 6 }}>Status (nichts angehakt = alle)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {statusWerte.map((w) => {
                    const an = (regeln.status ?? []).includes(w);
                    return (
                      <button key={w} onClick={() => statusUmschalten(w)}
                        style={{ background: an ? C.gold : 'transparent', border: `1px solid ${an ? C.gold : C.rand}`,
                                 borderRadius: 999, color: an ? C.navy : C.text, padding: '5px 13px', fontSize: 12.5,
                                 cursor: 'pointer', fontWeight: an ? 700 : 400 }}>
                        {w}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 5 }}>Seit mindestens … Tagen kein Kontakt</div>
              <input style={eingabe} inputMode="numeric" value={regeln.stillSeitTagen ?? ''}
                     onChange={(e) => setRegeln({ ...regeln, stillSeitTagen: Number(e.target.value) || null })}
                     placeholder="z. B. 90" />
            </div>

            <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={regeln.nurKunden === true}
                     onChange={(e) => setRegeln({ ...regeln, nurKunden: e.target.checked })} />
              Nur Kunden (mit Kaufdatum)
            </label>
            <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={regeln.nurEinwilligung === true}
                     onChange={(e) => setRegeln({ ...regeln, nurEinwilligung: e.target.checked })} />
              Nur mit ausdrücklicher Einwilligung
            </label>

            <div style={{ height: 1, background: C.rand, margin: '4px 0' }} />

            <input style={eingabe} value={gruppenName} onChange={(e) => setGruppenName(e.target.value)}
                   placeholder="Name der Zielgruppe" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => void gruppeSpeichern()} disabled={busy}
                style={{ flex: 1, background: C.gold, border: 'none', borderRadius: 10, color: C.navy, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
                {gruppenId ? 'Speichern' : 'Anlegen'}
              </button>
              {gruppenId && (
                <button onClick={() => { setGruppenId(''); setGruppenName('Neue Zielgruppe'); setRegeln({}); }}
                  style={{ background: 'transparent', border: `1px solid ${C.rand}`, borderRadius: 10, color: C.text, padding: '10px 14px', fontSize: 13.5, cursor: 'pointer' }}>
                  Neu
                </button>
              )}
            </div>

            {gruppen.length > 0 && (
              <div>
                <div style={{ fontSize: 12.5, color: C.dim, margin: '8px 0 6px' }}>Gespeicherte Zielgruppen</div>
                {gruppen.map((z) => (
                  <button key={z.id} onClick={() => gruppeLaden(z)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: z.id === gruppenId ? C.navy : 'transparent',
                             border: `1px solid ${C.rand}`, borderRadius: 10, color: C.text, padding: '9px 12px',
                             fontSize: 13.5, cursor: 'pointer', marginBottom: 6 }}>
                    {z.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ---------- Ergebnis ---------- */}
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 12 }}>{versandSatz(auf)}</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              <Kachel label="Einwilligung" wert={String(auf.gruende.einwilligung)} farbe={C.gruen} />
              <Kachel label="Bestandskunden" wert={String(auf.gruende.bestandskunde)} farbe={C.warn} />
              <Kachel label="Keine Grundlage" wert={String(auf.gruende.keine)} farbe={C.dim} />
              <Kachel label="Widersprochen" wert={String(auf.gruende.widerspruch)} farbe={C.rot} />
              <Kachel label="Ohne Adresse" wert={String(auf.gruende.keine_adresse)} farbe={C.dim} />
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => void uebernehmen()} disabled={busy || mitEinwilligung === 0}
                style={{ background: mitEinwilligung > 0 ? C.gold : 'transparent',
                         border: `1px solid ${mitEinwilligung > 0 ? C.gold : C.rand}`, borderRadius: 10,
                         color: mitEinwilligung > 0 ? C.navy : C.dim, padding: '11px 20px', fontSize: 14,
                         fontWeight: 700, cursor: mitEinwilligung > 0 ? 'pointer' : 'not-allowed' }}>
                {mitEinwilligung} in den Newsletter-Verteiler übernehmen
              </button>
            </div>
            {nurBestand > 0 && (
              <div style={{ color: C.dim, fontSize: 12.5, marginTop: 10, lineHeight: 1.55, maxWidth: 720 }}>
                Die {nurBestand} Bestandskunden bleiben bewusst außen vor: Sie dürfen ihnen eine Mail zu einer
                <b style={{ color: C.text }}> ähnlichen eigenen Leistung</b> schicken — das ist aber kein
                Newsletter-Abo. Wer beides vermischt, verliert die Ausnahme. Fragen Sie sie lieber einmal,
                ob sie den Newsletter möchten.
              </div>
            )}
          </div>

          {/* ---------- Die Liste ---------- */}
          <div style={{ background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
              Die Kontakte dieser Zielgruppe
            </div>
            <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 14 }}>
              {auf.ausserhalb > 0 ? `${auf.ausserhalb} weitere Kontakte passen nicht auf die Regeln.` : 'Alle Kontakte passen auf die Regeln.'}
            </div>

            {laden && <div style={{ color: C.dim, fontSize: 13.5 }}>Wird geladen …</div>}
            {!laden && auf.erlaubt.length === 0 && auf.gesperrt.length === 0 && (
              <div style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.6 }}>
                Kein Kontakt in dieser Zielgruppe. Lockern Sie die Regeln — oder legen Sie zuerst Kontakte im CRM an.
              </div>
            )}

            {[...auf.erlaubt.map((k) => ({ k: k as Kontakt, grund: (k.werbe_einwilligung === true ? 'einwilligung' : 'bestandskunde') as Rechtsgrund })),
              ...auf.gesperrt.map((g) => ({ k: g.kontakt as Kontakt, grund: g.grund }))]
              .slice(0, 200)
              .map(({ k, grund }) => {
                const info = grundText(grund);
                const tage = tageSeitKontakt(k, jetzt);
                const offen = offenerKontakt === k.id;
                return (
                  <div key={k.id} style={{ borderBottom: `1px solid ${C.rand}`, padding: '11px 0' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: AMPEL[info.farbe], flexShrink: 0 }} />
                      <span style={{ fontSize: 14, minWidth: 150, flex: 1 }}>{name(k)}</span>
                      <span style={{ fontSize: 12.5, color: C.dim, minWidth: 150 }}>{k.email || 'ohne Adresse'}</span>
                      <span style={{ fontSize: 12, color: AMPEL[info.farbe], border: `1px solid ${AMPEL[info.farbe]}`, borderRadius: 999, padding: '2px 10px' }}>
                        {info.kurz}
                      </span>
                      {tage != null && <span style={{ fontSize: 11.5, color: C.dim }}>{tage} T. still</span>}
                      {(grund === 'keine' || grund === 'bestandskunde') && (
                        <button onClick={() => setOffenerKontakt(offen ? null : k.id)}
                          style={{ background: 'transparent', border: `1px solid ${C.rand}`, borderRadius: 8, color: C.text, padding: '5px 11px', fontSize: 12, cursor: 'pointer' }}>
                          Einwilligung eintragen
                        </button>
                      )}
                      {grund !== 'widerspruch' && (
                        <button onClick={() => void widerspruch(k.id)} disabled={busy} title="Hat der Werbung widersprochen"
                          style={{ background: 'transparent', border: 'none', color: C.dim, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                          Widerspruch
                        </button>
                      )}
                    </div>

                    {offen && (
                      <div style={{ marginTop: 10, background: C.navy, border: `1px solid ${C.rand}`, borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 10, lineHeight: 1.55 }}>
                          Tragen Sie hier nur ein, was Sie im Streitfall auch belegen können. Datum und Herkunft
                          werden mitgeschrieben — ein Häkchen allein ist kein Nachweis.
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {QUELLEN.map((q) => (
                            <button key={q.wert} onClick={() => void einwilligung(k.id, q.wert)} disabled={busy}
                              style={{ background: 'transparent', border: `1px solid ${C.gruen}`, borderRadius: 8, color: C.gruen, padding: '7px 13px', fontSize: 12.5, cursor: 'pointer' }}>
                              {q.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {grund === 'bestandskunde' && (
                      <div style={{ color: C.dim, fontSize: 11.5, marginTop: 6, lineHeight: 1.5, paddingLeft: 21 }}>
                        Kauf liegt weniger als {BESTANDSKUNDE_MONATE} Monate zurück — erlaubt sind nur eigene,
                        ähnliche Leistungen, mit Widerspruchs-Hinweis in jeder Mail.
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kachel({ label, wert, farbe }: { label: string; wert: string; farbe: string }) {
  return (
    <div style={{ background: '#0A1628', border: '1px solid rgba(143,163,190,0.18)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ color: '#8FA3BE', fontSize: 11.5, marginBottom: 4 }}>{label}</div>
      <div style={{ color: farbe, fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 21 }}>{wert}</div>
    </div>
  );
}
