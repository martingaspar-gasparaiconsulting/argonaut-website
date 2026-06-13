'use client';

import { useState, useRef, useEffect } from 'react';

type Vorschlag = {
  templateId: string;
  name: string;
  agent: string;
  format: string;
  data: Record<string, any>;
  fehlend: string[];
};

type Nachricht = {
  rolle: 'user' | 'assistent';
  text: string;
  quellen?: string[];
  vorschlag?: Vorschlag;
  vorschlagStatus?: 'offen' | 'speichert' | 'gespeichert' | 'abgebrochen';
  erstelltesDokument?: { name: string; typ: string };
  fehlerText?: string;
};

// Schlanker Markdown-Renderer: wandelt ##, **, Listen und Absaetze in gestyltes HTML.
function renderMarkdown(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = text.split('\n');
  let html = '';
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };

  const inline = (s: string) => {
    let r = esc(s);
    r = r.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#C9A84C;font-weight:700">$1</strong>');
    r = r.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, '$1<em>$2</em>');
    return r;
  };

  for (let raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') { closeLists(); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeLists();
      const level = h[1].length;
      const size = level === 1 ? 20 : level === 2 ? 17 : 15;
      const mt = level === 1 ? 18 : 14;
      html += `<div style="font-family:Syne,sans-serif;font-weight:700;color:#C9A84C;font-size:${size}px;margin:${mt}px 0 8px">${inline(h[2])}</div>`;
      continue;
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (!inOl) { closeLists(); html += '<ol style="margin:6px 0 6px 20px;padding:0">'; inOl = true; }
      html += `<li style="margin:4px 0">${inline(ol[1])}</li>`;
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ul) {
      if (!inUl) { closeLists(); html += '<ul style="margin:6px 0 6px 20px;padding:0;list-style:none">'; inUl = true; }
      html += `<li style="margin:4px 0;position:relative;padding-left:16px"><span style="position:absolute;left:0;color:#00e5ff">›</span>${inline(ul[1])}</li>`;
      continue;
    }
    closeLists();
    html += `<div style="margin:6px 0">${inline(line)}</div>`;
  }
  closeLists();
  return html;
}

// Feld-key -> lesbares Label, Wert -> lesbarer Text
function feldLabel(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function feldWert(v: any): string {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('\n');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

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
    const verlauf = nachrichten.map((m) => ({ rolle: m.rolle, text: m.text }));
    setNachrichten((n) => [...n, { rolle: 'user', text: frage }]);
    setLaedt(true);
    try {
      const res = await fetch('/api/mitarbeiter-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frage, verlauf }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNachrichten((n) => [...n, { rolle: 'assistent', text: data.error || 'Es ist ein Fehler aufgetreten.' }]);
      } else if (data.modus === 'vorschlag' && data.vorschlag) {
        setNachrichten((n) => [
          ...n,
          { rolle: 'assistent', text: data.text || '', vorschlag: data.vorschlag, vorschlagStatus: 'offen' },
        ]);
      } else {
        setNachrichten((n) => [
          ...n,
          { rolle: 'assistent', text: data.antwort ?? data.text ?? '', quellen: data.quellen },
        ]);
      }
    } catch {
      setNachrichten((n) => [...n, { rolle: 'assistent', text: 'Verbindung fehlgeschlagen. Bitte erneut versuchen.' }]);
    } finally {
      setLaedt(false);
    }
  }

  async function speichern(index: number) {
    const m = nachrichten[index];
    if (!m?.vorschlag) return;
    setNachrichten((n) => n.map((x, i) => (i === index ? { ...x, vorschlagStatus: 'speichert', fehlerText: undefined } : x)));
    try {
      const res = await fetch('/api/chat/generate-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: m.vorschlag.templateId, data: m.vorschlag.data }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNachrichten((n) =>
          n.map((x, i) =>
            i === index
              ? { ...x, vorschlagStatus: 'gespeichert', erstelltesDokument: { name: data.dokument.name, typ: data.dokument.typ } }
              : x,
          ),
        );
      } else {
        setNachrichten((n) =>
          n.map((x, i) => (i === index ? { ...x, vorschlagStatus: 'offen', fehlerText: data.error || 'Speichern fehlgeschlagen.' } : x)),
        );
      }
    } catch {
      setNachrichten((n) =>
        n.map((x, i) => (i === index ? { ...x, vorschlagStatus: 'offen', fehlerText: 'Verbindung fehlgeschlagen.' } : x)),
      );
    }
  }

  function abbrechen(index: number) {
    setNachrichten((n) => n.map((x, i) => (i === index ? { ...x, vorschlagStatus: 'abgebrochen' } : x)));
  }

  function tasten(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      senden();
    }
  }

  function vorschlagKarte(m: Nachricht, i: number) {
    const v = m.vorschlag!;
    const hatFehlende = v.fehlend && v.fehlend.length > 0;
    return (
      <div style={{ marginTop: 12, padding: 16, borderRadius: 12, background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.3)' }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, color: '#C9A84C', fontSize: 16, marginBottom: 4 }}>
          Dokument-Vorschlag: {v.name} ({v.format.toUpperCase()})
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Agent: {v.agent}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', fontSize: 14 }}>
          {Object.entries(v.data).map(([key, wert]) => (
            <div key={key} style={{ display: 'contents' }}>
              <div style={{ color: 'rgba(255,255,255,0.55)' }}>{feldLabel(key)}</div>
              <div style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>{feldWert(wert)}</div>
            </div>
          ))}
        </div>

        {m.vorschlagStatus === 'gespeichert' && m.erstelltesDokument ? (
          <div style={{ marginTop: 14, color: '#00e5ff', fontWeight: 600 }}>
            ✓ Erstellt: {m.erstelltesDokument.name} — sichtbar unter „Dokumente"
          </div>
        ) : m.vorschlagStatus === 'abgebrochen' ? (
          <div style={{ marginTop: 14, color: 'rgba(255,255,255,0.5)' }}>Abgebrochen.</div>
        ) : hatFehlende ? (
          <div style={{ marginTop: 14, color: '#C9A84C' }}>
            Es fehlen noch Pflichtangaben: <strong>{v.fehlend.join(', ')}</strong>. Bitte ergänze sie in einer Nachricht, dann erstelle ich das Dokument.
          </div>
        ) : (
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button
              onClick={() => speichern(i)}
              disabled={m.vorschlagStatus === 'speichert'}
              style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: m.vorschlagStatus === 'speichert' ? 'rgba(201,168,76,0.4)' : '#C9A84C', color: '#0A1628', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, cursor: m.vorschlagStatus === 'speichert' ? 'not-allowed' : 'pointer' }}
            >
              {m.vorschlagStatus === 'speichert' ? 'Speichert…' : 'Speichern'}
            </button>
            <button
              onClick={() => abbrechen(i)}
              disabled={m.vorschlagStatus === 'speichert'}
              style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              Abbrechen
            </button>
          </div>
        )}

        {m.fehlerText && <div style={{ marginTop: 10, color: '#ff6b6b', fontSize: 13 }}>{m.fehlerText}</div>}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(201,168,76,0.2)' }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 700, color: '#C9A84C', margin: 0 }}>
          Mitarbeiter-Chat
        </h1>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: '6px 0 0' }}>
          Stellen Sie Fragen zu Ihren Dokumenten &ndash; oder lassen Sie neue Dokumente erstellen.
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
              background: m.rolle === 'user' ? '#C9A84C' : 'rgba(255,255,255,0.06)',
              color: m.rolle === 'user' ? '#0A1628' : '#fff',
              border: m.rolle === 'user' ? 'none' : '1px solid rgba(0,229,255,0.2)',
            }}>
              {m.rolle === 'assistent'
                ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
                : <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>}
              {m.vorschlag && vorschlagKarte(m, i)}
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
              Einen Moment &hellip;
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
            placeholder="Ihre Frage oder ein Dokumentwunsch ..."
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