'use client';

// ============================================================
// ARGONAUT OS · Command Center · Datei-Sicherung (Paket 350, A2)
//
// Stand der stündlichen, verschlüsselten Kopie des Speichers an den zweiten
// Ort: Ampel, Zahlen, Läufe, Dateien mit Fehler. Knöpfe: „Jetzt sichern",
// „Probe-Wiederherstellung" (echt geprobt, Ergebnis im Protokoll) und die
// Notfall-Wiederherstellung je Bucket (überschreibt NIE, nur mit Eintippen).
// Ohne die sechs Umgebungsvariablen: Einrichtungs-Anleitung.
// Zugang: /admin/* hinter dem Admin-Schloss; die Route verlangt zusätzlich den
// bestätigten zweiten Faktor. Rechnen: lib/speicherSicherung.ts.
// ============================================================

import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { ART_TEXT, BESTAETIGUNG_WORT, groesseText, LOESCH_TAGE, PROBE_TAGE, type Ampel, type SicherungZahlen } from '@/lib/speicherSicherung';

type Lauf = { id: string; art: string; ausgeloest: string; gestartet_am: string; beendet_am: string | null; dateien: number; bytes: number; fehler: number; geloescht: number; ok: boolean | null; meldung: string | null };
type Stand = {
  ok?: boolean; error?: string; eingerichtet?: boolean; fehlend?: string[]; konfigFehler?: string[]; envNamen?: string[];
  ziel?: { endpoint: string; region: string; bucket: string } | null; ampel?: Ampel; sqlFehlt?: boolean; zahlen?: SicherungZahlen | null;
  laeufe?: Lauf[]; letzterErfolg?: string | null; letzteProbe?: { gestartet_am: string; ok: boolean | null; meldung: string | null } | null;
  stand?: { cursor_zeit: string | null; laeuft_bis: string | null; letzter_abgleich: string | null } | null;
  fehlerDateien?: Array<{ bucket: string; name: string; fehler: string; versuche: number }>;
};

const C = { navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', info: '#5FA8E8', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)' };
const FARBE: Record<string, string> = { aus: C.textDim, gruen: C.green, gelb: C.warn, rot: C.danger };
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 12 };
const feld: CSSProperties = { padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(143,163,190,0.3)', background: 'rgba(10,22,40,0.7)', color: '#fff', fontSize: 14, fontFamily: 'inherit' };
const knopf: CSSProperties = { padding: '8px 13px', borderRadius: 9, border: 'none', background: C.gold, color: C.navy, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 };
const knopfAus: CSSProperties = { padding: '7px 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 };
const zeit = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export default function CcSpeicherSicherung() {
  const [s, setS] = useState<Stand>({});
  const [laedt, setLaedt] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [buckets, setBuckets] = useState<string[] | null>(null);
  const [notfall, setNotfall] = useState<{ bucket: string; schritt: 1 | 2; getippt: string; weiter: string | null } | null>(null);

  const laden = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/speicher-sicherung', { cache: 'no-store' });
      setS(await r.json() as Stand);
    } catch { setS({ ok: false, error: 'Nicht erreichbar.' }); }
    setLaedt(false);
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  async function senden(aktion: string, extra: Record<string, unknown> = {}) {
    setBusy(aktion); setMeldung(null);
    try {
      const r = await fetch('/api/admin/speicher-sicherung', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aktion, ...extra }) });
      const j = await r.json() as { ok?: boolean; meldung?: string; error?: string; buckets?: string[]; bericht?: { weiter?: string | null } };
      if (aktion === 'ziel_buckets' && j.ok) setBuckets(j.buckets ?? []);
      else setMeldung({ ok: !!j.ok, text: j.ok ? (j.meldung ?? 'Erledigt.') : (j.error ?? 'Fehler.') });
      if (aktion === 'wiederherstellen' && notfall) {
        const weiter = j.bericht?.weiter ?? null;
        setNotfall(weiter !== null && weiter !== undefined ? { ...notfall, weiter } : null);
      }
      await laden();
    } catch { setMeldung({ ok: false, text: 'Nicht erreichbar — der Durchgang läuft auf dem Server ggf. weiter. Bitte in einer Minute neu laden.' }); }
    setBusy(null);
  }

  const z = s.zahlen;
  const a = s.ampel;

  return (
    <div style={{ background: C.navy, minHeight: '100vh', color: '#fff', padding: '28px 20px', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <a href="/admin/command-center" style={{ color: C.textDim, textDecoration: 'none', fontSize: 14 }}>← Command Center</a>
        <h1 style={{ fontSize: 26, margin: '12px 0 4px' }}>🗄️ Datei-Sicherung</h1>
        <p style={{ color: C.textDim, marginTop: 0, lineHeight: 1.55 }}>
          Die Datenbank sichert Supabase täglich. Die <b>Dateien</b> im Speicher (Belege, Rechnungs-PDFs, Fotos, Dokumente) gehen hier stündlich
          <b> verschlüsselt</b> (AES-256-GCM) an einen zweiten Ort in Deutschland. In Supabase gelöschte Dateien bleiben dort noch {LOESCH_TAGE} Tage liegen.
          Die Wiederherstellung wird mit dem Knopf unten echt geprobt — mindestens alle {PROBE_TAGE} Tage, sonst kommt eine Glocke.
        </p>

        {laedt && <div style={karte}>Lädt …</div>}
        {!laedt && s.ok === false && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{s.error ?? 'Nicht erreichbar.'}</div>}
        {meldung && <div style={{ ...karte, borderColor: meldung.ok ? C.green : C.danger, color: meldung.ok ? C.green : C.danger }}>{meldung.text}</div>}

        {!laedt && s.ok && (<>
          {a && (
            <div style={{ ...karte, borderColor: FARBE[a.farbe], display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 14, height: 14, borderRadius: 999, background: FARBE[a.farbe], flex: '0 0 auto' }} />
              <b style={{ color: FARBE[a.farbe] }}>{a.text}</b>
            </div>
          )}

          {s.sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Tabellen fehlen noch — bitte SQL Paket 350 im Supabase-Editor einspielen.</div>}

          {!s.eingerichtet && (
            <div style={karte}>
              <h2 style={{ fontSize: 16, color: C.gold, margin: '0 0 8px' }}>Einrichten (einmalig)</h2>
              {!!s.konfigFehler?.length && <div style={{ color: C.danger, marginBottom: 8 }}>{s.konfigFehler.join(' ')}</div>}
              <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, color: '#fff' }}>
                <li>Bei einem S3-kompatiblen Anbieter mit Rechenzentrum in Deutschland ein Konto anlegen (Empfehlung: Hetzner Object Storage, Standort Falkenstein oder Nürnberg) und den Vertrag zur Auftragsverarbeitung abschließen.</li>
                <li>Einen <b>privaten</b> Bucket anlegen, Versionierung einschalten (falls angeboten), Zugangsschlüssel nur für diesen Bucket erzeugen.</li>
                <li>Einen Sicherungs-Schlüssel erzeugen (64 Hex-Zeichen) und ihn <b>offline</b> aufbewahren (Ausdruck im Tresor + Passwort-Manager). Ohne ihn ist die Sicherung wertlos.</li>
                <li>In Vercel unter Settings → Environment Variables die sechs Werte eintragen und neu bereitstellen:</li>
              </ol>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {(s.envNamen ?? []).map((n) => (
                  <code key={n} style={{ border: `1px solid ${s.fehlend?.includes(n) ? C.danger : C.green}`, color: s.fehlend?.includes(n) ? C.danger : C.green, borderRadius: 8, padding: '2px 8px', fontSize: 12 }}>
                    {s.fehlend?.includes(n) ? '✗ ' : '✓ '}{n}
                  </code>
                ))}
              </div>
            </div>
          )}

          {s.eingerichtet && s.ziel && (
            <div style={{ ...karte, color: C.textDim, fontSize: 13 }}>
              Ziel: <code style={{ color: '#fff' }}>{s.ziel.endpoint}</code> · Region <code style={{ color: '#fff' }}>{s.ziel.region}</code> · Bucket <code style={{ color: '#fff' }}>{s.ziel.bucket}</code>
              {' '}· letzter fehlerfreier Durchgang: <b style={{ color: '#fff' }}>{zeit(s.letzterErfolg)}</b>
              {' '}· letzter Abgleich: {zeit(s.stand?.letzter_abgleich)}
              {s.stand?.laeuft_bis && new Date(s.stand.laeuft_bis) > new Date() && <span style={{ color: C.info }}> · läuft gerade</span>}
            </div>
          )}

          {z && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
              {([
                ['Dateien im Speicher', `${z.quelle_dateien}`, groesseText(z.quelle_bytes), '#fff'],
                ['gesichert', `${z.gesichert}`, groesseText(z.gesichert_bytes), C.green],
                ['noch offen', `${z.offen}`, 'neu oder geändert', z.offen ? C.warn : C.textDim],
                ['mit Fehler', `${z.fehler}`, 'wird erneut versucht', z.fehler ? C.warn : C.textDim],
                ['dauerhaft fehlerhaft', `${z.dauerhaft}`, 'nach 5 Versuchen', z.dauerhaft ? C.danger : C.textDim],
                ['in Supabase gelöscht', `${z.fehlend}`, `bleibt ${LOESCH_TAGE} Tage im Ziel`, C.textDim],
              ] as const).map(([t, n, u, f]) => (
                <div key={t} style={{ ...karte, marginBottom: 0 }}>
                  <div style={{ color: C.textDim, fontSize: 13 }}>{t}</div>
                  <b style={{ fontSize: 22, color: f }}>{n}</b>
                  <div style={{ color: C.textDim, fontSize: 12 }}>{u}</div>
                </div>
              ))}
            </div>
          )}

          {s.eingerichtet && (
            <div style={{ ...karte, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button style={knopf} disabled={!!busy} onClick={() => void senden('jetzt')}>{busy === 'jetzt' ? 'Sichert … (bis 4 Min.)' : 'Jetzt sichern'}</button>
              <button style={knopf} disabled={!!busy} onClick={() => void senden('probe')}>{busy === 'probe' ? 'Probe läuft …' : 'Probe-Wiederherstellung'}</button>
              <span style={{ color: C.textDim, fontSize: 13 }}>
                Letzte Probe: {s.letzteProbe ? <>{zeit(s.letzteProbe.gestartet_am)} · <b style={{ color: s.letzteProbe.ok ? C.green : C.danger }}>{s.letzteProbe.ok ? 'bestanden' : 'nicht bestanden'}</b></> : <b style={{ color: C.warn }}>noch nie</b>}
              </span>
              {s.letzteProbe?.meldung && <div style={{ color: C.textDim, fontSize: 12, width: '100%' }}>{s.letzteProbe.meldung}</div>}
            </div>
          )}

          {!!s.fehlerDateien?.length && (
            <div style={karte}>
              <h2 style={{ fontSize: 16, color: C.warn, margin: '0 0 8px' }}>Dateien mit Fehler</h2>
              {s.fehlerDateien.map((f) => (
                <div key={f.bucket + '/' + f.name} style={{ fontSize: 13, padding: '4px 0', borderTop: `1px solid ${C.border}` }}>
                  <code>{f.bucket}/{f.name}</code> · {f.versuche} Versuch(e) · <span style={{ color: C.textDim }}>{f.fehler}</span>
                </div>
              ))}
            </div>
          )}

          {s.eingerichtet && (
            <div style={{ ...karte, borderColor: 'rgba(224,102,102,0.35)' }}>
              <h2 style={{ fontSize: 16, color: C.danger, margin: '0 0 6px' }}>Notfall-Wiederherstellung</h2>
              <p style={{ color: C.textDim, fontSize: 13, margin: '0 0 10px', lineHeight: 1.5 }}>
                Holt alle Dateien eines Buckets aus dem Ziel zurück nach Supabase. Dateien, die dort schon liegen, werden <b>nie überschrieben</b>.
                Nur im Ernstfall nutzen (z. B. versehentlich gelöschter Ordner).
              </p>
              {buckets === null
                ? <button style={knopfAus} disabled={!!busy} onClick={() => void senden('ziel_buckets')}>{busy === 'ziel_buckets' ? 'Lädt …' : 'Buckets im Ziel anzeigen'}</button>
                : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {!buckets.length && <span style={{ color: C.textDim }}>Im Ziel liegt noch nichts.</span>}
                    {buckets.map((b) => (
                      <button key={b} style={knopfAus} disabled={!!busy} onClick={() => setNotfall({ bucket: b, schritt: 1, getippt: '', weiter: null })}>{b}</button>
                    ))}
                  </div>
                )}
              {notfall && (
                <div style={{ marginTop: 12, padding: 12, border: `1px solid ${C.danger}`, borderRadius: 10 }}>
                  {notfall.schritt === 1 && notfall.weiter === null ? (<>
                    <div style={{ marginBottom: 8 }}>Bucket <b>{notfall.bucket}</b> aus der Sicherung zurückholen? Vorhandene Dateien bleiben unangetastet.</div>
                    <button style={knopf} onClick={() => setNotfall({ ...notfall, schritt: 2 })}>Ja, weiter</button>{' '}
                    <button style={knopfAus} onClick={() => setNotfall(null)}>Abbrechen</button>
                  </>) : (<>
                    <div style={{ marginBottom: 8 }}>Zur Bestätigung <b>{BESTAETIGUNG_WORT}</b> eintippen:</div>
                    <input style={{ ...feld, width: 240 }} value={notfall.getippt} onChange={(e) => setNotfall({ ...notfall, getippt: e.target.value })} />{' '}
                    <button style={knopf} disabled={!!busy || notfall.getippt.trim() !== BESTAETIGUNG_WORT}
                      onClick={() => void senden('wiederherstellen', { bucket: notfall.bucket, weiter: notfall.weiter, bestaetigt: notfall.getippt.trim() })}>
                      {busy === 'wiederherstellen' ? 'Läuft … (bis 4 Min.)' : notfall.weiter !== null ? 'Weiter' : 'Zurückholen'}
                    </button>{' '}
                    <button style={knopfAus} disabled={!!busy} onClick={() => setNotfall(null)}>Abbrechen</button>
                  </>)}
                </div>
              )}
            </div>
          )}

          <div style={karte}>
            <h2 style={{ fontSize: 16, color: C.gold, margin: '0 0 8px' }}>Protokoll</h2>
            {!s.laeufe?.length && <div style={{ color: C.textDim }}>Noch keine Läufe.</div>}
            {(s.laeufe ?? []).map((l) => (
              <div key={l.id} style={{ fontSize: 13, padding: '6px 0', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ color: l.ok === null ? C.info : l.ok ? C.green : C.danger, fontWeight: 700 }}>{l.ok === null ? '…' : l.ok ? '✓' : '✗'}</span>
                <span>{zeit(l.gestartet_am)}</span>
                <b>{ART_TEXT[l.art] ?? l.art}</b>
                <span style={{ color: C.textDim }}>{l.ausgeloest === 'betreiber' ? 'per Knopf' : 'Zeitplan'}</span>
                <span style={{ color: C.textDim }}>{l.meldung ?? ''}</span>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
  );
}
