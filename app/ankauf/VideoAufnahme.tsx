'use client';

// ============================================================
// ARGONAUT OS · Paket 305 · Fahrzeugmappe — Video direkt auf der Seite drehen
//
// Nimmt mit der Kamera des Handys in 720p und mäßiger Datenrate auf
// (ca. 2,5 Mbit/s -> 60 Sekunden ≈ 19 MB). So passt das Video sicher unter
// die 50-MB-Grenze — Videos aus der Kamera-App sind oft 100 MB und mehr.
// Stoppt spätestens nach 60 Sekunden. Kann der Browser das nicht
// (sehr alte Geräte), meldet die Komponente das und die Seite nimmt
// stattdessen ein Video aus der Kamera-App bzw. Galerie.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Symbol } from './Symbole';

const MAX_SEK = 60;
const TYPEN = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export function aufnahmeMoeglich(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== 'undefined';
}

function typWaehlen(): string {
  for (const t of TYPEN) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* weiter */ } }
  return '';
}

export function VideoAufnahme({ titel, hinweis, vorne, akzent, vorneText, onFertig, onAbbruch, onGehtNicht }: {
  titel: string; hinweis: string; vorne: boolean; akzent: string; vorneText: string;
  onFertig: (datei: File) => void; onAbbruch: () => void; onGehtNicht: () => void;
}) {
  const live = useRef<HTMLVideoElement | null>(null);
  const strom = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const teile = useRef<Blob[]>([]);
  const uhr = useRef<number | null>(null);
  const [stand, setStand] = useState<'start' | 'bereit' | 'laeuft' | 'fertig' | 'fehler'>('start');
  const [sek, setSek] = useState(0);
  const [ergebnis, setErgebnis] = useState<{ blob: Blob; url: string; typ: string } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  function stromStopp() {
    strom.current?.getTracks().forEach((t) => t.stop());
    strom.current = null;
  }

  async function kameraAn() {
    setFehler(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: vorne ? 'user' : 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: true,
      });
      strom.current = s;
      if (live.current) { live.current.srcObject = s; await live.current.play().catch(() => undefined); }
      setStand('bereit');
    } catch {
      setFehler('Die Kamera ist nicht freigegeben. Bitte erlauben Sie den Zugriff in Ihrem Browser oder wählen Sie ein Video aus Ihrer Galerie.');
      setStand('fehler');
    }
  }

  useEffect(() => {
    if (!aufnahmeMoeglich()) { onGehtNicht(); return; }
    void kameraAn();
    return () => {
      if (uhr.current) window.clearInterval(uhr.current);
      try { if (rec.current && rec.current.state !== 'inactive') rec.current.stop(); } catch { /* egal */ }
      stromStopp();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (ergebnis) URL.revokeObjectURL(ergebnis.url); }, [ergebnis]);

  function starten() {
    if (!strom.current) return;
    const typ = typWaehlen();
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(strom.current, { ...(typ ? { mimeType: typ } : {}), videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 });
    } catch { onGehtNicht(); return; }
    teile.current = [];
    r.ondataavailable = (e) => { if (e.data && e.data.size > 0) teile.current.push(e.data); };
    r.onstop = () => {
      if (uhr.current) { window.clearInterval(uhr.current); uhr.current = null; }
      const basis = (r.mimeType || typ || 'video/webm').split(';')[0];
      const blob = new Blob(teile.current, { type: basis });
      if (blob.size === 0) { setFehler('Die Aufnahme ist leer. Bitte noch einmal versuchen.'); setStand('bereit'); return; }
      setErgebnis({ blob, url: URL.createObjectURL(blob), typ: basis });
      setStand('fertig');
    };
    rec.current = r;
    r.start(1000);
    setSek(0);
    setStand('laeuft');
    const beginn = Date.now();
    uhr.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - beginn) / 1000);
      setSek(s);
      if (s >= MAX_SEK && r.state === 'recording') r.stop();
    }, 250);
  }

  function stoppen() {
    if (rec.current && rec.current.state === 'recording') rec.current.stop();
  }

  function nochmal() {
    if (ergebnis) URL.revokeObjectURL(ergebnis.url);
    setErgebnis(null);
    setStand('bereit');
  }

  function uebernehmen() {
    if (!ergebnis) return;
    const endung = ergebnis.typ === 'video/mp4' ? 'mp4' : 'webm';
    stromStopp();
    onFertig(new File([ergebnis.blob], `${titel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${endung}`, { type: ergebnis.typ }));
  }

  const rest = Math.max(0, MAX_SEK - sek);
  return (
    <div className="fm-overlay" role="dialog" aria-modal="true" aria-label={`Video aufnehmen: ${titel}`}>
      <div className="fm-rec">
        <div className="fm-rec-kopf">
          <div>
            <div className="fm-rec-titel">{titel}</div>
            <div className="fm-rec-hinweis">{hinweis}</div>
          </div>
          <button className="fm-rund" onClick={() => { stromStopp(); onAbbruch(); }} aria-label="Schließen"><Symbol name="kreuz" /></button>
        </div>
        <div className="fm-rec-bild">
          {stand !== 'fertig' && <video ref={live} muted playsInline autoPlay className="fm-rec-video" style={vorne ? { transform: 'scaleX(-1)' } : undefined} />}
          {stand === 'fertig' && ergebnis && <video src={ergebnis.url} controls playsInline className="fm-rec-video" />}
          {stand === 'laeuft' && <div className="fm-rec-zeit"><span className="fm-rec-punkt" />{String(Math.floor(sek / 60)).padStart(1, '0')}:{String(sek % 60).padStart(2, '0')} · noch {rest} s</div>}
          {stand === 'start' && <div className="fm-rec-mitte">Kamera wird gestartet …</div>}
          {stand === 'fehler' && <div className="fm-rec-mitte">{fehler}</div>}
        </div>
        {fehler && stand !== 'fehler' && <div className="fm-fehler" role="alert">{fehler}</div>}
        <div className="fm-rec-fuss">
          {stand === 'bereit' && <button className="fm-aufnahme" onClick={starten} aria-label="Aufnahme starten"><span /></button>}
          {stand === 'laeuft' && <button className="fm-aufnahme an" onClick={stoppen} aria-label="Aufnahme beenden"><span /></button>}
          {stand === 'fertig' && (
            <div className="fm-zeile">
              <button className="fm-knopf zweit" onClick={nochmal}><Symbol name="neu" /> Neu aufnehmen</button>
              <button className="fm-knopf" style={{ background: akzent, color: vorneText }} onClick={uebernehmen}><Symbol name="haken" /> Video übernehmen</button>
            </div>
          )}
          {stand === 'fehler' && <button className="fm-knopf zweit" onClick={() => { stromStopp(); onGehtNicht(); }}><Symbol name="hochladen" /> Video aus der Galerie wählen</button>}
        </div>
        <div className="fm-rec-klein">Höchstens {MAX_SEK} Sekunden. Das Video wird erst beim Übernehmen hochgeladen.</div>
      </div>
    </div>
  );
}
