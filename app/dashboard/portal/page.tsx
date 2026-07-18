'use client';

// ============================================================
// ARGONAUT OS · Bündel 11 · Kunden-Portal — Verwaltung (Dashboard)
// Je Kontakt einen login-freien Portal-Link erzeugen, kopieren oder
// deaktivieren. Der Kunde sieht darüber NUR seine eigenen Rechnungen
// und Termine (öffentliche Seite /portal/<token>).
// Pfad: app/dashboard/portal/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Kontakt = {
  id: string; anzeigename: string | null; vorname: string | null; nachname: string | null;
  name: string | null; email: string | null;
};
type Zugang = { id: string; kontakt_id: string; token: string; aktiv: boolean };

function kontaktName(k: Kontakt): string {
  if (k.anzeigename && k.anzeigename.trim()) return k.anzeigename.trim();
  const vn = `${k.vorname || ''} ${k.nachname || ''}`.trim();
  if (vn) return vn;
  if (k.name && k.name.trim()) return k.name.trim();
  return (k.email || '(ohne Namen)').trim();
}

export default function PortalVerwaltung() {
  const [uid, setUid] = useState<string | null>(null);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [zugaenge, setZugaenge] = useState<Record<string, Zugang>>({});
  const [suche, setSuche] = useState('');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nurMitLink, setNurMitLink] = useState(false);

  const basisUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const alles = useCallback(async () => {
    setFehler(null);
    const { data: kd } = await supabase.from('kontakte')
      .select('id, anzeigename, vorname, nachname, name, email')
      .order('anzeigename', { ascending: true });
    setKontakte((kd as Kontakt[]) ?? []);
    const { data: zd } = await supabase.from('portal_zugaenge')
      .select('id, kontakt_id, token, aktiv');
    const map: Record<string, Zugang> = {};
    ((zd as Zugang[]) ?? []).forEach((z) => { map[z.kontakt_id] = z; });
    setZugaenge(map);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      await alles();
      setLaden(false);
    })();
  }, [alles]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return kontakte.filter((k) => {
      if (nurMitLink && !zugaenge[k.id]) return false;
      if (!q) return true;
      return (kontaktName(k).toLowerCase().includes(q) || (k.email || '').toLowerCase().includes(q));
    });
  }, [kontakte, zugaenge, suche, nurMitLink]);

  async function linkErstellen(k: Kontakt) {
    if (!uid) return;
    setBusyId(k.id); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('portal_zugaenge')
        .insert({ owner_user_id: uid, kontakt_id: k.id })
        .select('id, kontakt_id, token, aktiv').single();
      if (error) {
        // Vielleicht existiert schon einer (unique je Kontakt) -> neu laden.
        await alles();
        setFehler('Für diesen Kunden gab es bereits einen Link — er ist jetzt sichtbar.');
        return;
      }
      setZugaenge((m) => ({ ...m, [k.id]: data as Zugang }));
      setOk(`Portal-Link für ${kontaktName(k)} erstellt.`);
    } finally { setBusyId(null); }
  }

  async function aktivSetzen(z: Zugang, aktiv: boolean) {
    setBusyId(z.kontakt_id); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('portal_zugaenge').update({ aktiv }).eq('id', z.id);
      if (error) { setFehler('Änderung fehlgeschlagen.'); return; }
      setZugaenge((m) => ({ ...m, [z.kontakt_id]: { ...z, aktiv } }));
      setOk(aktiv ? 'Portal-Link wieder aktiv.' : 'Portal-Link deaktiviert — der Link zeigt keine Daten mehr.');
    } finally { setBusyId(null); }
  }

  async function kopieren(z: Zugang) {
    const url = `${basisUrl}/portal/${z.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setOk('Link kopiert — jetzt an den Kunden schicken.');
    } catch {
      setOk(url); // Fallback: Link anzeigen zum manuellen Kopieren.
    }
  }

  const anzahlLinks = Object.values(zugaenge).filter((z) => z.aktiv).length;

  return (
    <div style={styles.page}>
      <div style={styles.head}>
        <div>
          <h1 style={styles.h1}>👤 Kunden-Portal</h1>
          <p style={styles.sub}>
            Geben Sie einem Kunden einen eigenen Link. Er sieht darüber <strong>nur seine eigenen</strong> Rechnungen
            und Termine — ohne Anmeldung, ohne Passwort, komplett aus Ihrem System.
          </p>
        </div>
        <div style={styles.zaehler}>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.gold }}>{anzahlLinks}</div>
          <div style={{ fontSize: 12, color: C.textDim }}>aktive Portal-Links</div>
        </div>
      </div>

      <div style={styles.infobox}>
        💡 <strong>So funktioniert&apos;s:</strong> „Link erstellen" erzeugt einen geheimen Portal-Link für den Kunden.
        Kopieren und z. B. per E-Mail schicken. Der Kunde braucht kein Konto. Deaktivieren Sie den Link,
        wird er sofort ungültig — ideal, wenn ein Link nicht mehr gebraucht wird.
        <br />
        <span style={{ color: C.textDim }}>
          Der Kunde kann im Portal jede Rechnung als <strong>PDF herunterladen</strong> und jeden Termin per
          <strong> „📅 Zum Kalender"</strong> in Google, Apple oder Outlook übernehmen (.ics).
          Termine erscheinen, wenn beim Termin dieselbe E-Mail-Adresse wie beim Kontakt hinterlegt ist.
        </span>
      </div>

      <div style={styles.toolbar}>
        <input style={styles.suche} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="🔎 Kunde suchen (Name oder E-Mail) …" />
        <label style={styles.check}>
          <input type="checkbox" checked={nurMitLink} onChange={(e) => setNurMitLink(e.target.checked)} /> nur mit Link
        </label>
      </div>

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? (
        <p style={styles.sub}>Lädt …</p>
      ) : gefiltert.length === 0 ? (
        <p style={styles.sub}>Keine Kontakte gefunden. Legen Sie zuerst unter „🤝 Vertrieb/CRM" Kunden an.</p>
      ) : (
        <div style={styles.liste}>
          {gefiltert.map((k) => {
            const z = zugaenge[k.id];
            const busy = busyId === k.id;
            return (
              <div key={k.id} style={styles.zeile}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{kontaktName(k)}</div>
                  <div style={{ color: C.textDim, fontSize: 13 }}>{k.email || 'keine E-Mail hinterlegt'}</div>
                  {z && (
                    <div style={{ marginTop: 6, fontSize: 12, color: C.textDim, wordBreak: 'break-all' }}>
                      {basisUrl}/portal/{z.token}
                    </div>
                  )}
                </div>
                <div style={styles.aktionen}>
                  {!z ? (
                    <button style={{ ...styles.btn, ...styles.primaer, opacity: busy ? 0.6 : 1 }} onClick={() => linkErstellen(k)} disabled={busy}>
                      {busy ? '…' : '🔗 Link erstellen'}
                    </button>
                  ) : (
                    <>
                      <span style={{ ...styles.badge, color: z.aktiv ? C.green : C.textDim, borderColor: z.aktiv ? C.green : C.border }}>
                        {z.aktiv ? '● aktiv' : '○ inaktiv'}
                      </span>
                      <button style={{ ...styles.btn, ...styles.ghost }} onClick={() => kopieren(z)} disabled={!z.aktiv}>📋 Kopieren</button>
                      <button style={{ ...styles.btn, ...styles.ghost }} onClick={() => aktivSetzen(z, !z.aktiv)} disabled={busy}>
                        {z.aktiv ? '⏸ Deaktivieren' : '▶ Aktivieren'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 980, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  head: { display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 640 },
  zaehler: { textAlign: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 20px', minWidth: 120 },
  infobox: { marginTop: 18, background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', fontSize: 14, lineHeight: 1.55 },
  toolbar: { display: 'flex', gap: 12, alignItems: 'center', margin: '18px 0 8px', flexWrap: 'wrap' },
  suche: { flex: 1, minWidth: 220, background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 14px', fontSize: 15, fontFamily: 'inherit' },
  check: { display: 'flex', alignItems: 'center', gap: 6, color: C.textDim, fontSize: 14, cursor: 'pointer' },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 },
  zeile: { display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' },
  aktionen: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  btn: { border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  primaer: { background: C.gold, color: C.navy },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}` },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 700 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 14, wordBreak: 'break-all' },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 14 },
};
