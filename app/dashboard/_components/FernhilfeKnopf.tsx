'use client';

// ============================================================
// ARGONAUT OS · Fernhilfe — „Hilfe anfordern" (Paket 209 · Stufe 3 B10)
// Die Person teilt SELBST ihren Bildschirm, ein Fenster oder nur den
// ARGONAUT-Tab (Browser-Auswahl). Der Helfer bekommt einen Link; erst wenn
// die Person „Zulassen" klickt, fließt das Bild — direkt zwischen den beiden
// Browsern (WebRTC), ohne Aufzeichnung. Rotes Band, solange geteilt wird.
// Passwort-, IBAN- und markierte Felder werden in ARGONAUT unscharf.
// Logik/Regeln: lib/fernhilfe.ts · Server: /api/fernhilfe
// ============================================================

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { kanalName, istSignal, ICE_SERVER, VERDECKT_CSS, type HelferArt } from '@/lib/fernhilfe';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', rot: '#C0392B', border: 'rgba(143,163,190,0.25)' };

type Phase = 'aus' | 'dialog' | 'wartet' | 'anfrage' | 'live';

export default function FernhilfeKnopf() {
  const [phase, setPhase] = useState<Phase>('aus');
  const [helfer, setHelfer] = useState<HelferArt>('argonaut');
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [helferName, setHelferName] = useState('');
  const [kopiert, setKopiert] = useState(false);

  const stromRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const kanalRef = useRef<RealtimeChannel | null>(null);
  const idRef = useRef<string | null>(null);

  const senden = useCallback((art: string, daten?: unknown) => {
    kanalRef.current?.send({ type: 'broadcast', event: 'signal', payload: { art, von: 'teiler', daten } });
  }, []);

  const aufraeumen = useCallback(async (meldeServer: boolean) => {
    try { senden('ende'); } catch { /* egal */ }
    stromRef.current?.getTracks().forEach((t) => t.stop());
    stromRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (kanalRef.current) { await supabase.removeChannel(kanalRef.current); kanalRef.current = null; }
    if (typeof document !== 'undefined') document.body.classList.remove('fernhilfe-aktiv');
    const id = idRef.current;
    idRef.current = null;
    if (meldeServer && id) {
      fetch('/api/fernhilfe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aktion: 'beenden', id }) }).catch(() => {});
    }
    setPhase('aus'); setLink(''); setHelferName('');
  }, [senden]);

  useEffect(() => () => { aufraeumen(true); }, [aufraeumen]);

  async function starten() {
    setFehler(null);
    if (!navigator.mediaDevices?.getDisplayMedia) { setFehler('Ihr Browser kann den Bildschirm nicht teilen. Bitte Chrome, Edge oder Firefox am Computer nutzen.'); return; }
    let strom: MediaStream;
    try {
      // Direkt im Klick — der Browser fragt, WAS geteilt wird.
      strom = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      setFehler('Freigabe abgebrochen — es wird nichts geteilt.');
      return;
    }
    stromRef.current = strom;
    strom.getVideoTracks()[0]?.addEventListener('ended', () => { aufraeumen(true); });
    document.body.classList.add('fernhilfe-aktiv');

    const res = await fetch('/api/fernhilfe', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aktion: 'anfordern', helfer, grund }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) { setFehler(j.error || 'Hilfe-Anfrage fehlgeschlagen.'); await aufraeumen(false); return; }
    idRef.current = j.id;
    setLink(`${window.location.origin}${j.pfad}`);

    const kanal = supabase.channel(kanalName(j.kanal), { config: { broadcast: { self: false } } });
    kanal.on('broadcast', { event: 'signal' }, async ({ payload }) => {
      if (!istSignal(payload) || payload.von !== 'helfer') return;
      const d = payload.daten as Record<string, unknown> | undefined;
      if (payload.art === 'hallo') {
        if (pcRef.current) return;
        setHelferName(String(d?.name ?? 'Helfer').slice(0, 120));
        setPhase('anfrage');
      } else if (payload.art === 'antwort' && pcRef.current && d) {
        await pcRef.current.setRemoteDescription(d as unknown as RTCSessionDescriptionInit);
      } else if (payload.art === 'kandidat' && pcRef.current && d) {
        try { await pcRef.current.addIceCandidate(d as unknown as RTCIceCandidateInit); } catch { /* spät */ }
      } else if (payload.art === 'ende') {
        await aufraeumen(true);
      }
    });
    kanal.subscribe();
    kanalRef.current = kanal;
    setPhase('wartet');
  }

  async function zulassen() {
    const strom = stromRef.current;
    if (!strom) return;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVER });
    pcRef.current = pc;
    strom.getTracks().forEach((t) => pc.addTrack(t, strom));
    pc.onicecandidate = (e) => { if (e.candidate) senden('kandidat', e.candidate.toJSON()); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') setFehler('Die direkte Verbindung kam nicht zustande (Firmen-Netzwerk?). Bitte beenden und per Telefon weiterhelfen.'); };
    senden('zugelassen');
    const angebot = await pc.createOffer();
    await pc.setLocalDescription(angebot);
    senden('angebot', { type: angebot.type, sdp: angebot.sdp });
    setPhase('live');
  }

  function ablehnen() {
    senden('abgelehnt');
    setHelferName('');
    setPhase('wartet');
  }

  async function kopieren() {
    try { await navigator.clipboard.writeText(link); setKopiert(true); setTimeout(() => setKopiert(false), 1500); } catch { /* von Hand */ }
  }

  const teilt = phase === 'wartet' || phase === 'anfrage' || phase === 'live';

  return (
    <>
      <style>{VERDECKT_CSS}</style>
      <button type="button" onClick={() => setPhase(teilt ? phase : 'dialog')} title="Fernhilfe: Bildschirm teilen" style={st.knopf}>
        🆘 <span style={{ display: 'inline-block' }}>Hilfe</span>
      </button>

      {teilt && (
        <div style={st.band} role="status">
          <span>🔴 Sie teilen gerade Ihren Bildschirm{phase === 'live' && helferName ? ` mit ${helferName}` : ''} — es wird nichts aufgezeichnet.</span>
          <button type="button" onClick={() => aufraeumen(true)} style={st.bandKnopf}>Teilen beenden</button>
        </div>
      )}

      {(phase === 'dialog' || phase === 'wartet' || phase === 'anfrage') && (
        <div style={st.hinter} onClick={(e) => { if (e.target === e.currentTarget && phase === 'dialog') setPhase('aus'); }}>
          <div style={st.box} role="dialog" aria-label="Fernhilfe">
            {phase === 'dialog' && (
              <>
                <h2 style={st.h2}>🆘 Hilfe per Bildschirm-Teilen</h2>
                <p style={st.p}>Sie wählen gleich im Browser selbst, was Ihr Helfer sieht: den ganzen Bildschirm, ein Fenster oder nur diesen ARGONAUT-Tab. Am sichersten ist <b>nur dieser Tab</b> — dann werden Passwort- und Bankfelder unscharf. Andere Programme sind bei „ganzer Bildschirm" NICHT verdeckt.</p>
                <label style={st.label}>Wer soll helfen?</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setHelfer('argonaut')} style={helfer === 'argonaut' ? st.wahlAn : st.wahl}>ARGONAUT-Support</button>
                  <button type="button" onClick={() => setHelfer('betrieb')} style={helfer === 'betrieb' ? st.wahlAn : st.wahl}>Geschäftsleitung im Betrieb</button>
                </div>
                <label style={st.label}>Worum geht es? (optional)</label>
                <input value={grund} onChange={(e) => setGrund(e.target.value)} maxLength={300} placeholder="z. B. Rechnung lässt sich nicht speichern" style={st.input} />
                <ul style={st.liste}>
                  <li>Ihr Helfer sieht nur zu — er kann nichts klicken oder tippen.</li>
                  <li>Erst wenn Sie „Zulassen" klicken, wird das Bild übertragen.</li>
                  <li>Keine Aufzeichnung. Beenden jederzeit über das rote Band.</li>
                </ul>
                {fehler && <div style={st.err}>{fehler}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setPhase('aus')} style={st.wahl}>Abbrechen</button>
                  <button type="button" onClick={starten} style={st.gold}>Bildschirm auswählen und teilen</button>
                </div>
              </>
            )}
            {phase === 'wartet' && (
              <>
                <h2 style={st.h2}>Warten auf Ihren Helfer</h2>
                <p style={st.p}>Schicken Sie diesen Link an {helfer === 'argonaut' ? 'den ARGONAUT-Support' : 'Ihre Geschäftsleitung'} (z. B. per Mail oder Chat). Er ist 30 Minuten gültig und funktioniert nur für {helfer === 'argonaut' ? 'den Support' : 'Ihre Geschäftsleitung'} — angemeldet.</p>
                <div style={st.linkZeile}><code style={{ overflowWrap: 'anywhere', flex: 1 }}>{link}</code><button type="button" onClick={kopieren} style={st.gold}>{kopiert ? '✓ Kopiert' : 'Kopieren'}</button></div>
                {fehler && <div style={st.err}>{fehler}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" onClick={() => aufraeumen(true)} style={st.wahl}>Abbrechen und beenden</button></div>
              </>
            )}
            {phase === 'anfrage' && (
              <>
                <h2 style={st.h2}>{helferName} möchte zusehen</h2>
                <p style={st.p}>Wenn Sie zulassen, sieht {helferName} live, was Sie freigegeben haben. Sie können jederzeit beenden.</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={ablehnen} style={st.wahl}>Ablehnen</button>
                  <button type="button" onClick={zulassen} style={st.gold}>Zulassen</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const st: Record<string, CSSProperties> = {
  knopf: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '6px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  band: { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000, background: C.rot, color: '#fff', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', padding: '8px 12px', fontWeight: 700, fontSize: 14 },
  bandKnopf: { background: '#fff', color: C.rot, border: 'none', borderRadius: 8, padding: '5px 12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  hinter: { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(5,10,20,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  box: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, maxWidth: 560, width: '100%', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h2: { margin: 0, fontSize: 19 },
  p: { margin: 0, color: C.dim, fontSize: 14, lineHeight: 1.5 },
  label: { fontSize: 12.5, color: C.dim, fontWeight: 700, marginTop: 4 },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' },
  liste: { margin: '4px 0', paddingLeft: 18, color: C.dim, fontSize: 13.5, lineHeight: 1.6 },
  wahl: { background: 'transparent', color: C.dim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  wahlAn: { background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '8px 12px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  gold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  linkZeile: { display: 'flex', gap: 8, alignItems: 'center', background: C.navy, borderRadius: 10, padding: 10, fontSize: 13 },
  err: { color: '#F2B8B5', background: 'rgba(224,102,102,0.12)', border: '1px solid rgba(224,102,102,0.35)', borderRadius: 10, padding: '8px 12px', fontSize: 13.5 },
};
