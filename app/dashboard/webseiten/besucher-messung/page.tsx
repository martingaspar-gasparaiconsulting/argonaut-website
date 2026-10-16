'use client';

// ============================================================
// ARGONAUT OS · Besucher-Messung mit Einwilligung (Paket C1, 16.10.2026)
// Der Betrieb schaltet für SEINE Website das Einwilligungs-Fenster ein:
// „Annehmen" und „Ablehnen" gleichwertig, Cookie erst nach Ja, Nachweis je
// Entscheidung, Widerruf über „Cookie-Einstellungen" im Fuß jeder Seite.
// Wirkt nur mit Start-Schalter cookieMessung (Anwalt R68) — bis dahin ist der
// Schalter hier gesperrt und die Website zählt weiter ohne Cookie.
// Logik: lib/cookieEinwilligung.ts (getestet). Kein KI-Aufruf.
// Pfad: app/dashboard/webseiten/besucher-messung/page.tsx (Unterpfad, nur Chef)
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { startFrei, startSperrGrund } from '@/lib/startSperre';
import { useFreigabeStand } from '@/lib/useFreigabeStand';
import { betriebsKennung } from '@/lib/betriebBesitzer';
import { fensterHtml, fensterCss, FENSTER, EINWILLIGUNG_VERSION, DATENSCHUTZ_ABSCHNITT } from '@/lib/cookieEinwilligung';
import Leerzustand from '@/app/dashboard/_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Nachweis = { id: string; entscheidung: 'ja' | 'nein' | 'widerruf'; besucher_id: string | null; text_version: string; erstellt_am: string };
const ENTSCHEIDUNG_TEXT: Record<Nachweis['entscheidung'], string> = { ja: '✓ Angenommen', nein: '✗ Abgelehnt', widerruf: '↩ Widerrufen' };

function zeit(t: string): string {
  try {
    return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
  } catch { return t; }
}

export default function BesucherMessungSeite() {
  const freigabe = useFreigabeStand().start;
  const frei = startFrei('cookieMessung', freigabe);
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [an, setAn] = useState(false);
  const [primaer, setPrimaer] = useState('#1F3A5F');
  const [hatCi, setHatCi] = useState(true);
  const [nachweise, setNachweise] = useState<Nachweis[]>([]);
  const [zaehler, setZaehler] = useState<Record<string, number>>({ ja: 0, nein: 0, widerruf: 0 });
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const laden = useCallback(async (id: string) => {
    const seit = new Date(Date.now() - 90 * 86400000).toISOString();
    const [c, n, ...z] = await Promise.all([
      supabase.from('web_ci').select('*').eq('owner_user_id', id).maybeSingle(),
      supabase.from('web_einwilligung').select('id, entscheidung, besucher_id, text_version, erstellt_am').eq('owner_user_id', id).order('erstellt_am', { ascending: false }).limit(50),
      ...(['ja', 'nein', 'widerruf'] as const).map((e) =>
        supabase.from('web_einwilligung').select('id', { count: 'exact', head: true }).eq('owner_user_id', id).eq('entscheidung', e).gte('erstellt_am', seit)),
    ]);
    const ci = c.data as { cookie_messung?: boolean | null; farbe_primaer?: string | null } | null;
    setHatCi(!!ci);
    setAn(ci?.cookie_messung === true);
    if (ci?.farbe_primaer) setPrimaer(ci.farbe_primaer);
    const fehlt = !!(n.error && /web_einwilligung/.test(n.error.message)) || (!!ci && !('cookie_messung' in ci));
    setSqlFehlt(fehlt);
    setNachweise(((n.data as Nachweis[]) ?? []));
    setZaehler({ ja: z[0]?.count ?? 0, nein: z[1]?.count ?? 0, widerruf: z[2]?.count ?? 0 });
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      if (!uid) { setFehler('Nicht angemeldet.'); return; }
      const { data: chef } = await supabase.rpc('mein_chef_id');
      const id = betriebsKennung(chef, uid);
      setBetrieb(id);
      if (id) await laden(id);
    })();
  }, [laden]);

  async function umschalten(neu: boolean) {
    if (!betrieb) return;
    setOk(null); setFehler(null);
    if (neu && !frei) { setFehler(startSperrGrund('cookieMessung', freigabe)); return; }
    if (!hatCi) { setFehler('Bitte zuerst den Firmen-Auftritt anlegen (Webauftritt).'); return; }
    if (neu && !window.confirm('Einwilligungs-Fenster auf allen Ihren veröffentlichten Seiten einschalten? Ihre Datenschutzerklärung wird automatisch um den Abschnitt zum Cookie ergänzt.')) return;
    setLaeuft(true);
    const { data, error } = await supabase.from('web_ci').update({ cookie_messung: neu }).eq('owner_user_id', betrieb).select('owner_user_id');
    setLaeuft(false);
    if (error) { setFehler(/cookie_messung/.test(error.message) ? 'Noch nicht eingerichtet (SQL von Paket C1 fehlt).' : 'Speichern fehlgeschlagen.'); return; }
    if (!data || data.length === 0) { setFehler('Speichern fehlgeschlagen – nur die Geschäftsleitung kann das ändern.'); return; }
    setAn(neu);
    setOk(neu
      ? 'Eingeschaltet. Veröffentlichte Seiten zeigen das Fenster nach spätestens einer Minute.'
      : 'Ausgeschaltet. Ihre Seiten zählen wieder nur ohne Cookie; „Cookie-Einstellungen" verschwindet aus dem Fuß.');
  }

  const vorschau = useMemo(() =>
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><style>body{margin:0;font-family:system-ui,sans-serif;background:#eef1f5;min-height:340px}'
    + fensterCss(primaer) + '.ao-einw{position:absolute}</style></head><body>' + fensterHtml().replace(' hidden>', '>') + '</body></html>',
  [primaer]);

  return (
    <div style={s.page}>
      <a href="/dashboard/webseiten" style={s.zurueck}>← Website-Bauer</a>
      <h1 style={s.h1}>🍪 Besucher-Messung mit Einwilligung</h1>
      <p style={s.sub}>Ihre Website zählt Besucher heute ohne Cookie: anonym und nur für einen Tag. Wer wiederkommt oder über welche Anzeige jemand nach Tagen zum Anrufer wird, sehen Sie so nicht. Mit dem Einwilligungs-Fenster fragen Sie Ihre Besucher – nur wer zustimmt, wird wiedererkannt. Die Daten bleiben bei Ihnen in ARGONAUT, nichts geht an Google oder Werbenetzwerke.</p>

      {!frei && <div style={s.warn}>🔒 {startSperrGrund('cookieMessung', freigabe)}</div>}
      {sqlFehlt && <div style={s.err}>Noch nicht eingerichtet (SQL von Paket C1 fehlt).</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {fehler && <div style={s.err}>{fehler}</div>}

      <div style={s.card}>
        <b>So geht&apos;s</b>
        <ol style={s.liste}>
          <li>Vorschau des Fensters unten ansehen – „Annehmen" und „Ablehnen" sind bewusst gleich groß und gleich farbig.</li>
          <li>„Fenster einschalten" klicken. Es erscheint auf allen veröffentlichten Seiten, bis der Besucher wählt.</li>
          <li>Ihre Datenschutzerklärung bekommt automatisch den passenden Abschnitt, im Fuß erscheint „{FENSTER.einstellungen}".</li>
          <li>Unter „Nachweise" sehen Sie jede Entscheidung mit Zeitpunkt – das ist Ihr Beleg bei einer Nachfrage.</li>
        </ol>
      </div>

      <div style={s.card}>
        <b>1 · Fenster auf Ihrer Website</b>
        <div style={s.zeile}>
          <span style={{ ...s.punkt, background: an && frei ? C.green : C.textDim }} />
          <span>{an && frei ? 'Eingeschaltet – Besucher werden gefragt.' : an ? 'Eingeschaltet, wirkt aber erst nach der Freischaltung.' : 'Aus – Ihre Seiten zählen nur ohne Cookie.'}</span>
        </div>
        <div style={s.knoepfe}>
          {an
            ? <button style={s.mini} disabled={laeuft} onClick={() => umschalten(false)}>Fenster ausschalten</button>
            : <button style={{ ...s.primaer, opacity: frei && !sqlFehlt ? 1 : 0.45, cursor: frei && !sqlFehlt ? 'pointer' : 'not-allowed' }} disabled={!frei || sqlFehlt || laeuft} onClick={() => umschalten(true)}>Fenster einschalten</button>}
        </div>
        <div style={s.hint}>Wer ablehnt, wird weiter wie bisher anonym ohne Cookie gezählt. Das Cookie läuft nach 12 Monaten ab, danach fragt das Fenster neu.</div>
      </div>

      <div style={s.card}>
        <b>2 · Vorschau des Fensters</b>
        <iframe title="Vorschau Einwilligungs-Fenster" srcDoc={vorschau} sandbox="" style={s.rahmen} />
        <div style={s.hint}>Knopffarbe = Ihre Hauptfarbe aus dem Webauftritt. Text-Fassung: {EINWILLIGUNG_VERSION}.</div>
      </div>

      <div style={s.card}>
        <b>3 · Nachweise</b>
        <div style={s.zahlen}>
          <div style={s.kachel}><div style={s.kz}>{zaehler.ja}</div><div style={s.kt}>angenommen (90 Tage)</div></div>
          <div style={s.kachel}><div style={s.kz}>{zaehler.nein}</div><div style={s.kt}>abgelehnt (90 Tage)</div></div>
          <div style={s.kachel}><div style={s.kz}>{zaehler.widerruf}</div><div style={s.kt}>widerrufen (90 Tage)</div></div>
        </div>
        {nachweise.length === 0 ? (
          <Leerzustand icon="🧾" titel="Noch keine Nachweise"
            text="Sobald Besucher im Fenster wählen, steht hier jede Entscheidung mit Zeitpunkt und Text-Fassung – ohne IP-Adresse."
            schritte={['Freischaltung abwarten', 'Fenster einschalten', 'Erste Besucher wählen lassen']} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tab}>
              <thead><tr><th style={s.th}>Zeitpunkt</th><th style={s.th}>Entscheidung</th><th style={s.th}>Kennung</th><th style={s.th}>Text-Fassung</th></tr></thead>
              <tbody>{nachweise.map((x) => (
                <tr key={x.id}>
                  <td style={s.td}>{zeit(x.erstellt_am)}</td>
                  <td style={s.td}>{ENTSCHEIDUNG_TEXT[x.entscheidung] ?? x.entscheidung}</td>
                  <td style={{ ...s.td, fontFamily: 'monospace' }}>{x.besucher_id ? x.besucher_id.slice(0, 8) + '…' : '—'}</td>
                  <td style={s.td}>{x.text_version}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
        <div style={s.hint}>Nachweise lassen sich nicht ändern. Die Kennung ist eine Zufallszahl ohne Bezug zu Name oder IP-Adresse.</div>
      </div>

      <div style={s.card}>
        <b>4 · Abschnitt in Ihrer Datenschutzerklärung</b>
        <div style={s.vorschauText}>{DATENSCHUTZ_ABSCHNITT.titel + '\n\n' + DATENSCHUTZ_ABSCHNITT.absaetze.join('\n\n')}</div>
        <div style={s.hint}>Steht automatisch auf Ihren Seiten, solange das Fenster eingeschaltet ist.</div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1060, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.textDim, fontSize: 13.5, textDecoration: 'none' },
  h1: { fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  liste: { margin: '4px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.6 },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 15 },
  punkt: { width: 10, height: 10, borderRadius: 5, display: 'inline-block' },
  knoepfe: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: C.textDim, fontSize: 12.5, lineHeight: 1.5 },
  rahmen: { width: '100%', height: 340, border: `1px solid ${C.border}`, borderRadius: 10, background: '#eef1f5' },
  zahlen: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  kachel: { flex: '1 1 140px', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  kz: { fontSize: 24, fontWeight: 800, color: C.gold },
  kt: { fontSize: 12.5, color: C.textDim },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { textAlign: 'left', color: C.textDim, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}` },
  td: { padding: '6px 8px', borderBottom: `1px solid ${C.border}` },
  vorschauText: { whiteSpace: 'pre-wrap', background: '#fff', color: '#111', borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.5 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  warn: { color: C.warn, background: 'rgba(224,162,76,0.1)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14, lineHeight: 1.5 },
};
