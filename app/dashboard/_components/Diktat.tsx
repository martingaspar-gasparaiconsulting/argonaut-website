'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  uebernimm, sollNeuStarten, fehlerText, wirdUnterstuetzt, alsUhr, woerter,
  KEIN_DIKTAT_HINWEIS, MAX_SEKUNDEN, type EndeGrund,
} from '@/lib/diktat';

// ============================================================================
// ARGONAUT OS · Diktat-Knopf (D4)
//
// Ein Knopf, der jedes Textfeld im System zum Diktiergerät macht. Gedacht für
// den Menschen mit dreckigen Händen: Monteur auf dem Dach, Ticket zwischen
// zwei Anrufen, Bautagebuch im Regen.
//
// WAS HIER ANDERS IST ALS IN DER ALTEN CRM-FASSUNG:
// Die Browser-Spracherkennung beendet sich nach jeder Sprechpause von selbst
// — auf dem Telefon oft nach Sekunden. Bisher stand die Aufnahme dann
// kommentarlos still, mitten im Satz. Hier wird automatisch weitergehört,
// solange niemand auf „Stopp" gedrückt hat, und der bereits erkannte Text
// lebt getrennt vom laufenden Zwischenstand — es geht nichts verloren.
//
// Der Text wird IMMER angehängt, nie ersetzt. Wer schon getippt hat, verliert
// nichts.
//
// Die Regeln liegen in lib/diktat.ts und sind dort node-getestet.
// ============================================================================

type Props = {
  /** Der aktuelle Feldinhalt. */
  wert: string;
  /** Wird mit dem neuen Feldinhalt gerufen (angehängt, nie ersetzt). */
  onWert: (neu: string) => void;
  /** Kleiner Knopf für enge Stellen. */
  klein?: boolean;
  /** Eigene Beschriftung, falls „Diktieren" nicht passt. */
  label?: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function Diktat({ wert, onWert, klein = false, label }: Props) {
  const [laeuft, setLaeuft] = useState(false);
  const [kann, setKann] = useState<boolean | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zwischen, setZwischen] = useState('');
  const [sekunden, setSekunden] = useState(0);

  const rec = useRef<any>(null);
  const gewollt = useRef(false);        // hat der Mensch auf Stopp gedrückt?
  const neustarts = useRef(0);
  const sekundenRef = useRef(0);
  const wertRef = useRef(wert);
  const uhr = useRef<ReturnType<typeof setInterval> | null>(null);

  // Der Feldinhalt kann sich von außen ändern, während die Aufnahme läuft.
  useEffect(() => { wertRef.current = wert; }, [wert]);

  useEffect(() => {
    setKann(wirdUnterstuetzt(typeof window === 'undefined' ? null : window));
  }, []);

  const aufraeumen = useCallback(() => {
    if (uhr.current) { clearInterval(uhr.current); uhr.current = null; }
    try { rec.current?.abort?.(); } catch { /* egal */ }
    rec.current = null;
  }, []);

  // Beim Verlassen der Seite das Mikrofon freigeben — sonst leuchtet die
  // Aufnahme-Anzeige im Browser weiter, obwohl niemand mehr zuhört.
  useEffect(() => () => aufraeumen(), [aufraeumen]);

  const starte = useCallback(() => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (typeof SR !== 'function') { setKann(false); return; }

    const r = new SR();
    r.lang = 'de-DE';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = (e: any) => {
      let endgueltig = '';
      let vorlaeufig = '';
      // Nur ab resultIndex lesen: Alles davor wurde bereits übernommen.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const stueck = e.results[i]?.[0]?.transcript ?? '';
        if (e.results[i]?.isFinal) endgueltig += stueck;
        else vorlaeufig += stueck;
      }
      if (endgueltig.trim()) {
        const neu = uebernimm(wertRef.current, endgueltig);
        wertRef.current = neu;
        onWert(neu);
        setZwischen('');
      } else {
        setZwischen(vorlaeufig);
      }
    };

    r.onerror = (e: any) => {
      const code = String(e?.error ?? '');
      // „no-speech" ist kein Fehler, sondern eine Pause — dafür gibt es den
      // Neustart. Alles andere sagen wir dem Menschen.
      if (code === 'no-speech' || code === 'aborted') return;
      gewollt.current = true;
      setFehler(fehlerText(code));
      setLaeuft(false);
    };

    r.onend = () => {
      const grund: EndeGrund = gewollt.current ? 'gewollt' : 'stille';
      if (sollNeuStarten(grund, gewollt.current, neustarts.current, sekundenRef.current)) {
        neustarts.current += 1;
        try { r.start(); return; } catch { /* fällt unten durch */ }
      }
      if (!gewollt.current && sekundenRef.current >= MAX_SEKUNDEN) {
        setFehler('Nach zehn Minuten wurde die Aufnahme beendet. Der Text ist gespeichert.');
      }
      setLaeuft(false);
      setZwischen('');
      if (uhr.current) { clearInterval(uhr.current); uhr.current = null; }
    };

    rec.current = r;
    gewollt.current = false;
    neustarts.current = 0;
    sekundenRef.current = 0;
    setSekunden(0);
    setFehler(null);
    setZwischen('');

    try {
      r.start();
      setLaeuft(true);
      uhr.current = setInterval(() => {
        sekundenRef.current += 1;
        setSekunden(sekundenRef.current);
        if (sekundenRef.current >= MAX_SEKUNDEN) {
          gewollt.current = true;
          try { r.stop(); } catch { /* egal */ }
        }
      }, 1000);
    } catch {
      setFehler('Die Aufnahme konnte nicht gestartet werden. Bitte erneut versuchen.');
      setLaeuft(false);
    }
  }, [onWert]);

  function stoppe() {
    gewollt.current = true;
    // Zwischenstand nicht wegwerfen: Was gerade erkannt, aber noch nicht
    // endgültig war, gehört dem Menschen genauso.
    if (zwischen.trim()) {
      const neu = uebernimm(wertRef.current, zwischen);
      wertRef.current = neu;
      onWert(neu);
      setZwischen('');
    }
    try { rec.current?.stop(); } catch { /* egal */ }
    setLaeuft(false);
    if (uhr.current) { clearInterval(uhr.current); uhr.current = null; }
  }

  if (kann === false) {
    return (
      <div style={{ color: '#8FA3BE', fontSize: 12.5, lineHeight: 1.5, marginTop: 6 }}>
        {KEIN_DIKTAT_HINWEIS}
      </div>
    );
  }

  const hoehe = klein ? '9px 14px' : '13px 20px';
  const schrift = klein ? 13 : 15;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => (laeuft ? stoppe() : starte())}
          style={{
            background: laeuft ? '#E06666' : 'transparent',
            border: `1px solid ${laeuft ? '#E06666' : 'rgba(143,163,190,0.35)'}`,
            borderRadius: 12,
            color: laeuft ? '#fff' : '#E8EDF4',
            padding: hoehe,
            fontSize: schrift,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: schrift + 3 }}>{laeuft ? '⏹' : '🎙'}</span>
          {laeuft ? 'Stopp' : (label || 'Diktieren')}
        </button>

        {laeuft && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8FA3BE', fontSize: 13 }}>
            <span style={{
              width: 9, height: 9, borderRadius: '50%', background: '#E06666',
              display: 'inline-block', animation: 'argPuls 1.2s ease-in-out infinite',
            }} />
            {alsUhr(sekunden)} · {woerter(wert)} Wörter
          </span>
        )}
      </div>

      {laeuft && zwischen.trim() && (
        <div style={{ color: '#8FA3BE', fontSize: 13, fontStyle: 'italic', marginTop: 8, lineHeight: 1.45 }}>
          … {zwischen}
        </div>
      )}

      {laeuft && (
        <div style={{ color: '#8FA3BE', fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
          Sie können ruhig Pausen machen — es wird weiter zugehört. Sagen Sie
          „Punkt", „Komma" oder „neuer Absatz" für die Zeichen.
        </div>
      )}

      {fehler && (
        <div style={{ color: '#E0A24C', fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
          {fehler}
        </div>
      )}

      <style>{'@keyframes argPuls { 0%,100% { opacity: 1 } 50% { opacity: .25 } }'}</style>
    </div>
  );
}
