'use client';

import { useState, useRef, useEffect } from 'react';

type Nachricht = {
  rolle: 'user' | 'assistent';
  text: string;
  quellen?: string[];
};

export default function MitarbeiterChatSeite() {
  const [nachrichten, setNachrichten] = useState<Nachricht[]>([]);
  const [eingabe, setEingabe] = useState('');
  const [laedt, setLaedt] = useState(false);
  const endeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endeRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [nachrichten, laedt]);

  async function senden() {
    const frage = eingabe.trim();
    if (!frage || laedt) return;
    setEingabe('');
    setNachrichten((n) => [...n, { rolle: 'user', text: frage }]);
    setLaedt(true);
    try {
      const res = await fetch('/api/mitarbeiter-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNachrichten((n) => [...n, { rolle: 'assistent', text: data.error || 'Es ist ein Fehler aufgetreten.' }]);
      } else {
        setNachrichten((n) => [...n, { rolle: 'assistent', text: data.antwort, quellen: data.quellen }]);
      }
    } catch {
      setNachrichten((n) => [...n, { rolle: 'assistent', text: 'Verbindung fehlgeschlagen. Bitte erneut versuchen.' }]);
    } finally {
      setLaedt(false);
    }
  }

  function tasten(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      senden();
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(201,168,76,0.2)' }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 700, color: '#C9A84C', margin: 0 }}>
          Mitarbeiter-Chat
        </h1>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
          Stellen Sie Fragen zu Ihren Dokumenten &ndash; die Antworten basieren ausschlie&szlig;lich auf Ihren eigenen Daten.
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 900, width: '100%', margin: '0 auto' }}>
        {nachrichten.length === 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', marginTop: 80, fontFamily: 'DM Sans, sans-serif' }}>
            Noch keine Nachrichten. Stellen Sie Ihre erste Frage.
          </div>
        )}
        {nachrichten.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.rolle === 'user' ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
            <div style={{
              maxWidth: '75%',
              padding: '14px 18px',
              borderRadius: 14,
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 15,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              background: m.rolle === 'user' ? '#C9A84C' : 'rgba(255,255,255,0.06)',
              color: m.rolle === 'user' ? '#0A1628' : '#fff',
              border: m.rolle === 'user' ? 'none' : '1px solid rgba(0,229,255,0.2)',
            }}>
              {m.text}
              {m.quellen && m.quellen.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(0,229,255,0.2)', fontSize: 12, color: '#00e5ff' }}>
                  Quellen: {m.quellen.join(', ')}
                </div>
              )}
            </div>
          </div>
        ))}
        {laedt && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
            <div style={{ padding: '14px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,229,255,0.2)', color: 'rgba(255,255,255,0.6)', fontFamily: 'DM Sans, sans-serif', fontSize: 15 }}>
              Durchsucht Ihre Dokumente &hellip;
            </div>
          </div>
        )}
        <div ref={endeRef} />
      </div>

      <div style={{ padding: '20px 32px', borderTop: '1px solid rgba(201,168,76,0.2)', maxWidth: 900, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <textarea
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            onKeyDown={tasten}
            placeholder="Ihre Frage ..."
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              padding: '14px 16px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.04)',
              color: '#fff',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 15,
              outline: 'none',
            }}
          />
          <button
            onClick={senden}
            disabled={laedt || !eingabe.trim()}
            style={{
              padding: '14px 24px',
              borderRadius: 12,
              border: 'none',
              background: laedt || !eingabe.trim() ? 'rgba(201,168,76,0.4)' : '#C9A84C',
              color: '#0A1628',
              fontFamily: 'Syne, sans-serif',
              fontWeight: 700,
              fontSize: 15,
              cursor: laedt || !eingabe.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            Senden
          </button>
        </div>
      </div>
    </div>
  );
}
