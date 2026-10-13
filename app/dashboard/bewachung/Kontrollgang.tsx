'use client';

// ============================================================
// ARGONAUT OS · Paket 353 (13.10.2026) · Kontrollgang
// Rundgang beginnen → Kontrollpunkte scannen (Kamera) oder Code eintippen →
// Rundgang beenden. Zeit jedes Scans setzt die Datenbank (Serverzeit).
// Standort nur, wenn die Wachkraft „Standort mitsenden" einschaltet
// (Einstellung je Gerät, Vorgabe aus).
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  codeLesen, punktZumCode, rundgangAuswerten, dauerText, uhrDe, zeitDe, statusName,
  type Kontrollpunkt, type Rundgang, type Scan,
} from '@/lib/bewachung';
import { C, s, schreiben, type Db, type Objekt, type Melde } from './bewachungUi';

export type RundgangZeile = Rundgang & { mitarbeiter_user: string | null };
type ScanZeile = Scan & { id: string; rundgang_id: string };

const GPS_SCHLUESSEL = 'argonaut_bewachung_gps';
function gpsGemerkt(): boolean {
  try { return window.localStorage.getItem(GPS_SCHLUESSEL) === '1'; } catch { return false; }
}
function gpsMerken(an: boolean) {
  try { window.localStorage.setItem(GPS_SCHLUESSEL, an ? '1' : '0'); } catch { /* ohne Speicher geht es auch */ }
}
function standort(): Promise<{ lat: number; lon: number; genauigkeit_m: number } | null> {
  return new Promise((ok) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { ok(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lon: Math.round(p.coords.longitude * 1e6) / 1e6, genauigkeit_m: Math.min(100000, Math.round(p.coords.accuracy)) }),
      () => ok(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

export default function Kontrollgang({ supabase, objekt, punkte, rundgaenge, uid, istChef, melde, onGeaendert }: {
  supabase: Db; objekt: Objekt; punkte: Kontrollpunkt[]; rundgaenge: RundgangZeile[]; uid: string | null; istChef: boolean;
  melde: Melde; onGeaendert: () => Promise<void>;
}) {
  const meiner = rundgaenge.find((r) => r.status === 'laeuft' && r.mitarbeiter_user === uid) ?? null;
  const meinerHier = meiner && meiner.objekt_id === objekt.id ? meiner : null;
  const [scans, setScans] = useState<ScanZeile[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState(false);
  const [notiz, setNotiz] = useState('');
  const [kameraGeht, setKameraGeht] = useState(false);
  const [kameraAuf, setKameraAuf] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const jetzt = Date.now();

  useEffect(() => {
    setGps(gpsGemerkt());
    setKameraGeht(typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  const scansLaden = useCallback(async () => {
    if (!meinerHier) { setScans([]); return; }
    const { data, error } = await supabase.from('wach_scan').select('id, rundgang_id, kontrollpunkt_id, gescannt_am, art, lat, lon').eq('rundgang_id', meinerHier.id).order('gescannt_am', { ascending: true }).limit(1000);
    setScans(error ? [] : (((data as unknown) as ScanZeile[]) ?? []));
  }, [supabase, meinerHier]);
  useEffect(() => { void scansLaden(); }, [scansLaden]);

  const aktiv = punkte.filter((p) => p.objekt_id === objekt.id && p.aktiv).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));
  const ausw = meinerHier ? rundgangAuswerten(meinerHier, punkte, scans, jetzt) : null;

  async function beginnen() {
    if (!aktiv.length) { melde('Für dieses Objekt sind noch keine Kontrollpunkte angelegt (Reiter „Kontrollpunkte").'); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('wach_rundgang').insert({ objekt_id: objekt.id }).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, `Rundgang „${objekt.bezeichnung ?? 'Objekt'}" läuft — jetzt die Kontrollpunkte scannen.`);
      await onGeaendert();
    } finally { setBusy(false); }
  }

  async function erfassen(roh: string, art: 'qr' | 'code') {
    if (!meinerHier) return;
    const z = punktZumCode(punkte, codeLesen(roh), objekt.id);
    if (!z.ok) { melde(z.fehler); return; }
    setBusy(true); melde(null);
    try {
      const ort = gps ? await standort() : null;
      const r = await schreiben(supabase.from('wach_scan').insert({ rundgang_id: meinerHier.id, kontrollpunkt_id: z.punkt.id, art, ...(ort ?? {}) }).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      const schon = scans.some((x) => x.kontrollpunkt_id === z.punkt.id);
      melde(null, `✓ ${z.punkt.name}${schon ? ' (erneut erfasst)' : ''}${gps && !ort ? ' — Standort war nicht verfügbar' : ''}`);
      setCode('');
      await scansLaden();
    } finally { setBusy(false); }
  }

  async function beenden(status: 'beendet' | 'abgebrochen', r: RundgangZeile = meinerHier as RundgangZeile) {
    if (!r) return;
    if (status === 'beendet' && ausw && ausw.fehlend.length && r.id === meinerHier?.id
      && !window.confirm(`Noch nicht erreicht: ${ausw.fehlend.join(', ')}.\n\nRundgang trotzdem beenden? Die fehlenden Punkte stehen dann im Nachweis.`)) return;
    if (status === 'abgebrochen' && !window.confirm('Rundgang abbrechen? Er bleibt mit dem Vermerk „abgebrochen" erhalten.')) return;
    setBusy(true); melde(null);
    try {
      const w = await schreiben(supabase.from('wach_rundgang').update({ status, notiz: notiz.trim() || null }).eq('id', r.id).select('id'));
      if (!w.ok) { melde(w.fehler); return; }
      setNotiz('');
      melde(null, status === 'beendet' ? 'Rundgang beendet.' : 'Rundgang abgebrochen.');
      await onGeaendert();
    } finally { setBusy(false); }
  }

  // --- Kamera (wie Lager-Scanner) ---------------------------------------------------
  const stopKamera = useCallback(() => {
    if (loopRef.current) { window.clearInterval(loopRef.current); loopRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    setKameraAuf(false);
  }, []);
  useEffect(() => () => stopKamera(), [stopKamera]);

  async function startKamera() {
    if (!kameraGeht) return;
    melde(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setKameraAuf(true);
      window.setTimeout(async () => {
        const v = videoRef.current; if (!v) return;
        v.srcObject = stream; await v.play().catch(() => {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Detector = (window as any).BarcodeDetector;
        const det = new Detector({ formats: ['qr_code'] });
        loopRef.current = window.setInterval(async () => {
          try {
            const codes = await det.detect(v);
            const raw = codes?.[0]?.rawValue as string | undefined;
            if (raw) { stopKamera(); await erfassen(raw, 'qr'); }
          } catch { /* Bild ohne Treffer */ }
        }, 400);
      }, 100);
    } catch {
      melde('Kamera nicht verfügbar — bitte den Code unter dem Aufkleber eintippen.');
      setKameraAuf(false);
    }
  }

  const andereLaufend = rundgaenge.filter((r) => r.status === 'laeuft' && r.objekt_id === objekt.id && r.id !== meinerHier?.id);
  const letzte = rundgaenge.filter((r) => r.objekt_id === objekt.id && r.status !== 'laeuft').slice(0, 15);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {meiner && !meinerHier && (
        <div style={s.hinweis}>Noch ein eigener Rundgang läuft in einem anderen Objekt — oben dieses Objekt wählen, um ihn fortzusetzen oder zu beenden.</div>
      )}

      {!meinerHier && !meiner && (
        <div style={s.box}>
          <b style={{ color: C.gold }}>Kontrollgang · {objekt.bezeichnung ?? 'Objekt'}</b>
          <p style={s.klein}>{aktiv.length} aktive Kontrollpunkte. Beginn, jeder Scan und das Ende werden mit der Serverzeit festgehalten und lassen sich nicht nachträglich ändern.</p>
          <button style={{ ...s.btnGold, fontSize: 16, padding: '12px 18px' }} disabled={busy} onClick={() => void beginnen()}>▶ Rundgang beginnen</button>
        </div>
      )}

      {meinerHier && ausw && (
        <div style={{ ...s.box, borderColor: C.gold }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ color: C.gold }}>Rundgang läuft seit {uhrDe(meinerHier.gestartet_am)} Uhr</b>
            <span style={s.klein}>{ausw.erreicht}/{ausw.soll} Punkte · {dauerText(ausw.dauerMin)}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
            {kameraGeht && !kameraAuf && <button style={{ ...s.btnGold, fontSize: 16, padding: '12px 18px' }} disabled={busy} onClick={() => void startKamera()}>📷 Kontrollpunkt scannen</button>}
            {kameraAuf && <button style={s.btnAus} onClick={stopKamera}>Kamera schließen</button>}
          </div>
          {kameraAuf && <video ref={videoRef} playsInline muted style={{ width: '100%', maxWidth: 420, borderRadius: 10, border: `1px solid ${C.border}` }} />}
          {!kameraGeht && <p style={s.klein}>Dieser Browser kann QR-Codes nicht selbst lesen — bitte den Code unter dem Aufkleber eintippen (oder einen Handscanner nutzen).</p>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={{ ...s.input, minWidth: 180, fontSize: 16, letterSpacing: 1 }} placeholder="Code, z. B. A1B2C-3D4E5" value={code} maxLength={30}
              onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) void erfassen(code, /^ARGW/i.test(code.trim()) ? 'qr' : 'code'); }} />
            <button style={s.btnAus} disabled={busy || !code.trim()} onClick={() => void erfassen(code, 'code')}>Erfassen</button>
          </div>
          <label style={{ ...s.klein, display: 'block', marginTop: 8 }}>
            <input type="checkbox" checked={gps} onChange={(e) => { setGps(e.target.checked); gpsMerken(e.target.checked); }} /> Standort beim Scan mitsenden (freiwillig, nur auf diesem Gerät gemerkt — der Nachweis für den Auftraggeber enthält keinen Standort)
          </label>

          <table style={{ ...s.tabelle, marginTop: 10 }}>
            <thead><tr><th style={s.th}>Kontrollpunkt</th><th style={s.th}>Erfasst</th></tr></thead>
            <tbody>
              {aktiv.map((p) => {
                const sc = scans.filter((x) => x.kontrollpunkt_id === p.id);
                return (
                  <tr key={p.id}>
                    <td style={s.td}>{sc.length ? '✅' : '⬜'} {p.name}{p.hinweis ? <div style={s.klein}>{p.hinweis}</div> : null}</td>
                    <td style={s.td}>{sc.length ? sc.map((x) => uhrDe(x.gescannt_am)).join(', ') : <span style={{ color: C.dim }}>offen</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <label style={{ ...s.feld, marginTop: 10 }}>Bemerkung zum Rundgang (optional)
            <input style={s.input} value={notiz} maxLength={500} onChange={(e) => setNotiz(e.target.value)} />
          </label>
          <p style={s.klein}>Vorkommnisse gehören ins Wachbuch (Reiter „Wachbuch") — dort werden sie mit diesem Rundgang verknüpft.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button style={s.btnGold} disabled={busy} onClick={() => void beenden('beendet')}>■ Rundgang beenden</button>
            <button style={s.btnAus} disabled={busy} onClick={() => void beenden('abgebrochen')}>Abbrechen</button>
          </div>
        </div>
      )}

      {istChef && andereLaufend.length > 0 && (
        <div style={s.box}>
          <b style={{ color: C.gold }}>Laufende Rundgänge in diesem Objekt</b>
          {andereLaufend.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <span>{r.mitarbeiter_name ?? '—'} · seit {zeitDe(r.gestartet_am)}</span>
              <button style={s.mini} disabled={busy} onClick={() => void beenden('abgebrochen', r)}>als abgebrochen schließen</button>
            </div>
          ))}
        </div>
      )}

      <div style={s.box}>
        <b style={{ color: C.gold }}>Letzte Rundgänge</b>
        {!letzte.length ? <p style={s.dim}>Noch keine abgeschlossenen Rundgänge in diesem Objekt.</p> : (
          <table style={{ ...s.tabelle, marginTop: 6 }}>
            <thead><tr><th style={s.th}>Beginn</th><th style={s.th}>Wachkraft</th><th style={s.th}>Dauer</th><th style={s.th}>Status</th></tr></thead>
            <tbody>
              {letzte.map((r) => {
                const min = r.beendet_am ? Math.round((new Date(r.beendet_am).getTime() - new Date(r.gestartet_am).getTime()) / 60000) : null;
                return (
                  <tr key={r.id}>
                    <td style={s.td}>{zeitDe(r.gestartet_am)}</td><td style={s.td}>{r.mitarbeiter_name ?? '—'}</td>
                    <td style={s.td}>{dauerText(min)}</td><td style={s.td}>{statusName(r.status)}{r.notiz ? <div style={s.klein}>{r.notiz}</div> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p style={s.klein}>Welche Punkte je Rundgang erreicht wurden, zeigt der Reiter „Nachweis".</p>
      </div>
    </div>
  );
}
