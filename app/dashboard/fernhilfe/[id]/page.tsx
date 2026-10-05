'use client';

// ============================================================
// ARGONAUT OS · Fernhilfe — Helfer-Ansicht (Paket 209 · Stufe 3 B10)
// Der Helfer öffnet den Link, der Server prüft die Rechte (/api/fernhilfe
// „beitreten") und gibt erst dann den geheimen Kanal heraus. Die Person, die
// teilt, muss den Helfer noch „zulassen". Nur Zuschauen, keine Aufzeichnung.
// Pfad: app/dashboard/fernhilfe/[id]/page.tsx
// ============================================================

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { kanalName, istSignal, ICE_SERVER } from '@/lib/fernhilfe';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', rot: '#E06666', gruen: '#4CAF7D', border: 'rgba(143,163,190,0.2)' };

type Stand = 'laedt' | 'fehler' | 'wartet' | 'abgelehnt' | 'live' | 'beendet';

export default function FernhilfeHelferPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [stand, setStand] = useState<Stand>('laedt');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [grund, setGrund] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const kanalRef = useRef<RealtimeChannel | null>(null);
  const halloRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const senden = useCallback((art: string, daten?: unknown) => {
    kanalRef.current?.send({ type: 'broadcast', event: 'signal', payload: { art, von: 'helfer', daten } });
  }, []);

  const aufraeumen = useCallback(async () => {
    if (halloRef.current) { clearInterval(halloRef.current); halloRef.current = null; }
    pcRef.current?.close(); pcRef.current = null;
    if (kanalRef.current) { await supabase.removeChannel(kanalRef.current); kanalRef.current = null; }
  }, []);

  useEffect(() => {
    let aus = false;
    (async () => {
      const res = await fetch('/api/fernhilfe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aktion: 'beitreten', id }) });
      const j = await res.json().catch(() => ({}));
      if (aus) return;
      if (!res.ok || !j.ok) { setStand('fehler'); setText(j.error || 'Die Hilfe-Sitzung konnte nicht geöffnet werden.'); return; }
      setName(String(j.sitzung?.angefordert_name ?? ''));
      setGrund(String(j.sitzung?.grund ?? ''));
      const { data: { user } } = await supabase.auth.getUser();
      const meinName = String(user?.email?.split('@')[0] ?? 'Helfer');

      const kanal = supabase.channel(kanalName(j.kanal), { config: { broadcast: { self: false } } });
      kanal.on('broadcast', { event: 'signal' }, async ({ payload }) => {
        if (!istSignal(payload) || payload.von !== 'teiler') return;
        const d = payload.daten as Record<string, unknown> | undefined;
        if (payload.art === 'zugelassen' || payload.art === 'angebot') {
          if (halloRef.current) { clearInterval(halloRef.current); halloRef.current = null; }
        }
        if (payload.art === 'abgelehnt') {
          if (halloRef.current) { clearInterval(halloRef.current); halloRef.current = null; }
          setStand('abgelehnt');
        }
        else if (payload.art === 'angebot' && d) {
          const pc = new RTCPeerConnection({ iceServers: ICE_SERVER });
          pcRef.current = pc;
          pc.ontrack = (e) => { if (videoRef.current) videoRef.current.srcObject = e.streams[0]; };
          pc.onicecandidate = (e) => { if (e.candidate) senden('kandidat', e.candidate.toJSON()); };
          pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') setText('Die direkte Verbindung kam nicht zustande (Firmen-Netzwerk?). Bitte telefonisch weiterhelfen.'); };
          await pc.setRemoteDescription(d as unknown as RTCSessionDescriptionInit);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          senden('antwort', { type: ans.type, sdp: ans.sdp });
          setStand('live');
        } else if (payload.art === 'kandidat' && pcRef.current && d) {
          try { await pcRef.current.addIceCandidate(d as unknown as RTCIceCandidateInit); } catch { /* spät */ }
        } else if (payload.art === 'ende') {
          setStand('beendet');
          await aufraeumen();
        }
      });
      kanal.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        // „Hallo" wiederholen, bis die Person zulässt (sie kann den Link vor oder nach uns öffnen).
        senden('hallo', { name: meinName });
        halloRef.current = setInterval(() => senden('hallo', { name: meinName }), 3000);
      });
      kanalRef.current = kanal;
      setStand('wartet');
    })();
    return () => { aus = true; aufraeumen(); };
  }, [id, senden, aufraeumen]);

  async function beenden() {
    senden('ende');
    await aufraeumen();
    await fetch('/api/fernhilfe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aktion: 'beenden', id }) }).catch(() => {});
    setStand('beendet');
  }

  return (
    <div style={st.page}>
      <h1 style={st.h1}>🆘 Fernhilfe {name ? `für ${name}` : ''}</h1>
      {grund && <p style={st.sub}>Anliegen: {grund}</p>}
      {stand === 'laedt' && <p style={st.sub}>Verbinde …</p>}
      {stand === 'fehler' && <div style={st.err}>{text}</div>}
      {stand === 'wartet' && <div style={st.info}>Warte, bis {name || 'die Person'} Sie zulässt …</div>}
      {stand === 'abgelehnt' && <div style={st.err}>{name || 'Die Person'} hat das Zusehen abgelehnt.</div>}
      {stand === 'beendet' && <div style={st.info}>Die Fernhilfe ist beendet.</div>}
      {text && stand !== 'fehler' && <div style={st.err}>{text}</div>}
      <div style={{ ...st.bild, display: stand === 'live' ? 'block' : 'none' }}>
        {/* Nur Ansehen: kein Ton, keine Aufzeichnung, keine Steuerung. */}
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: 'auto', display: 'block', background: '#000', borderRadius: 12 }} />
      </div>
      {(stand === 'wartet' || stand === 'live') && (
        <div><button type="button" onClick={beenden} style={st.knopf}>Fernhilfe beenden</button></div>
      )}
      <p style={st.hint}>Sie sehen nur zu — Sie können nichts klicken oder tippen. Es wird nichts aufgezeichnet. Bitte keine Bildschirmfotos von Kundendaten.</p>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1280, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 12 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(22px,2vw,30px)', fontWeight: 800, margin: 0 },
  sub: { color: C.dim, fontSize: 15, margin: 0 },
  info: { color: C.text, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  err: { color: C.rot, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  bild: { border: `2px solid ${C.gruen}`, borderRadius: 14, padding: 4, background: '#000' },
  knopf: { background: 'transparent', color: C.rot, border: `1px solid ${C.rot}`, borderRadius: 10, padding: '9px 14px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: C.dim, fontSize: 13, margin: 0 },
};
