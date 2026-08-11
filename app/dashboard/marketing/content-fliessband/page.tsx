'use client';

import { useEffect, useState } from 'react';
import { VARIANTEN_STUFEN, type TextVariante, type TextVariantenGruppe } from '@/lib/contentFliessband';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · KI-Content-Fließband (Punkt 3)
// EIN Thema -> fertige Beiträge für alle Kanäle. Zwei Modi:
//   · "einzeln"   — 1 Beitrag je Kanal (mit Bildvorschlag, In-den-Plan).
//   · "varianten" — je Kanal viele Varianten (Fließband), zum Kopieren/Picken.
// Look = Kunden-Dashboard (Navy/Gold/Cyan) — für Kunde UND Betreiber identisch.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
};

type Vorschlag = {
  kanal: string; name: string; icon: string;
  ziel: 'social' | 'newsletter' | 'whatsapp';
  plattformId: string | null;
  betreff: string | null; text: string;
  bildStichwort: string | null;
  zeichen: number; zeichenLimit: number; zuLang: boolean; bildPflicht: boolean;
};
type Antwort = {
  ok: boolean; error?: string; thema?: string; modus?: 'einzeln' | 'varianten';
  vorschlaege?: Vorschlag[]; gruppen?: TextVariantenGruppe[];
};

type Foto = { url: string; thumb: string; autor: string };

const KANAELE: { id: string; name: string; icon: string }[] = [
  { id: 'instagram', name: 'Instagram', icon: '📸' },
  { id: 'facebook', name: 'Facebook', icon: '📘' },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
  { id: 'newsletter', name: 'Newsletter', icon: '✉️' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10,
  padding: '10px 12px', color: C.text, fontSize: 14.5,
  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', boxSizing: 'border-box',
};

export default function ContentFliessbandPage() {
  const [thema, setThema] = useState('');
  const [firma, setFirma] = useState('');
  const [branche, setBranche] = useState('');
  const [ton, setTon] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string[]>(KANAELE.map((k) => k.id));
  const [ciOffen, setCiOffen] = useState(false);
  const [modus, setModus] = useState<'einzeln' | 'varianten'>('einzeln');
  const [anzahl, setAnzahl] = useState(10);

  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[] | null>(null);
  const [gruppen, setGruppen] = useState<TextVariantenGruppe[] | null>(null);

  function toggle(id: string) {
    setGewaehlt((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function erzeugen() {
    setFehler(null);
    if (!thema.trim()) { setFehler('Bitte ein Thema oder einen Anlass eingeben.'); return; }
    if (gewaehlt.length === 0) { setFehler('Bitte mindestens einen Kanal auswählen.'); return; }
    setLaden(true);
    setVorschlaege(null);
    setGruppen(null);
    try {
      const res = await fetch('/api/marketing/content-fliessband', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ thema, kanaele: gewaehlt, modus, anzahl, firma, branche, ton }),
      });
      const j = (await res.json()) as Antwort;
      if (!j.ok) { setFehler(j.error || 'Es konnten keine Vorschläge erzeugt werden.'); setLaden(false); return; }
      if (j.modus === 'varianten') setGruppen(j.gruppen ?? []);
      else setVorschlaege(j.vorschlaege ?? []);
    } catch {
      setFehler('Verbindung fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setLaden(false);
    }
  }

  const varStufen = VARIANTEN_STUFEN.filter((n) => n >= 2);
  const gesamt = gewaehlt.length * anzahl;

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', fontWeight: 800, margin: 0 }}>
        🏭 KI-Content-Fließband
      </h1>
      <p style={{ color: C.textDim, fontSize: 14.5, lineHeight: 1.5, margin: '8px 0 22px', maxWidth: 780 }}>
        Ein Thema rein — fertige Beiträge raus. Entweder <b style={{ color: C.text }}>ein Beitrag je Kanal</b> mit Bildvorschlag, oder als Fließband <b style={{ color: C.text }}>viele Varianten je Kanal</b> zum Auswählen. Aus 5 Minuten Idee wird eine Woche — oder ein Monat — Sichtbarkeit.
      </p>

      {/* Eingabe */}
      <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 22 }}>
        {/* Modus-Umschalter */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 8 }}>Modus</div>
          <div style={{ display: 'inline-flex', background: C.navy, borderRadius: 12, padding: 4, gap: 4, border: `1px solid ${C.border}` }}>
            {([['einzeln', '📝 Ein Beitrag je Kanal'], ['varianten', '🏭 Varianten (viele je Kanal)']] as const).map(([m, label]) => {
              const an = modus === m;
              return (
                <button
                  key={m}
                  onClick={() => setModus(m)}
                  style={{
                    background: an ? C.gold : 'transparent', color: an ? C.navy : C.textDim,
                    border: 'none', borderRadius: 9, padding: '8px 15px', cursor: 'pointer',
                    fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <label style={{ display: 'block', fontSize: 13, color: C.textDim, marginBottom: 6 }}>Thema / Anlass *</label>
        <textarea
          value={thema}
          onChange={(e) => setThema(e.target.value)}
          rows={2}
          placeholder={modus === 'varianten'
            ? 'z. B. verschiedene Wege, unsere Herbstaktion anzukündigen'
            : 'z. B. Neue Öffnungszeiten ab Montag · Herbstaktion auf Winterreifen · Wir suchen einen Azubi'}
          style={{ ...inputStyle, resize: 'vertical' }}
        />

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 8 }}>Kanäle</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {KANAELE.map((k) => {
              const an = gewaehlt.includes(k.id);
              return (
                <button
                  key={k.id}
                  onClick={() => toggle(k.id)}
                  style={{
                    background: an ? C.gold : 'transparent', color: an ? C.navy : C.textDim,
                    border: `1px solid ${an ? C.gold : C.border}`, borderRadius: 999,
                    padding: '7px 15px', fontSize: 14, fontWeight: an ? 700 : 500, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {k.icon} {k.name}
                </button>
              );
            })}
          </div>
        </div>

        {modus === 'varianten' && (
          <div style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: C.textDim, marginBottom: 6 }}>Varianten je Kanal</label>
              <select value={anzahl} onChange={(e) => setAnzahl(Number(e.target.value))} style={{ ...inputStyle, width: 'auto', minWidth: 160 }}>
                {varStufen.map((n) => <option key={n} value={n}>{n}{n === 30 ? ' (Monatsplan)' : ''}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 13, color: C.textDim, paddingBottom: 10 }}>
              ergibt <b style={{ color: C.cyan }}>{gesamt}</b> Beiträge ({gewaehlt.length} × {anzahl}) — größere Mengen dauern etwas länger.
            </div>
          </div>
        )}

        <button
          onClick={() => setCiOffen((o) => !o)}
          style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: 13, marginTop: 14, padding: 0, fontFamily: 'inherit' }}
        >
          {ciOffen ? '▾' : '▸'} Firmen-Angaben (optional — macht die Texte persönlicher)
        </button>
        {ciOffen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: C.textDim, marginBottom: 5 }}>Firma/Betrieb</label>
              <input value={firma} onChange={(e) => setFirma(e.target.value)} placeholder="z. B. Bäckerei Müller" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: C.textDim, marginBottom: 5 }}>Branche</label>
              <input value={branche} onChange={(e) => setBranche(e.target.value)} placeholder="z. B. Handwerksbäckerei" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: C.textDim, marginBottom: 5 }}>Grundton</label>
              <input value={ton} onChange={(e) => setTon(e.target.value)} placeholder="z. B. herzlich, bodenständig" style={inputStyle} />
            </div>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <button
            onClick={erzeugen}
            disabled={laden}
            style={{
              background: C.gold, color: C.navy, border: 'none', borderRadius: 10,
              padding: '12px 24px', fontWeight: 700, fontSize: 15, cursor: laden ? 'wait' : 'pointer',
              opacity: laden ? 0.7 : 1, fontFamily: 'var(--font-syne), sans-serif',
            }}
          >
            {laden ? 'Die KI schreibt …' : modus === 'varianten' ? '🏭 Varianten erzeugen' : '✨ Vorschläge erzeugen'}
          </button>
        </div>

        {fehler && (
          <div style={{ color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginTop: 14 }}>
            {fehler}
          </div>
        )}
      </div>

      {/* Ergebnis · EINZELN */}
      {vorschlaege && (
        <>
          <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 18, margin: '4px 0 14px' }}>
            {vorschlaege.length} fertige{vorschlaege.length === 1 ? 'r' : ''} Vorschlag{vorschlaege.length === 1 ? '' : 'e'} — prüfen, anpassen, übernehmen
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            {vorschlaege.map((v) => <VorschlagKarte key={v.kanal} v={v} />)}
          </div>
        </>
      )}

      {/* Ergebnis · VARIANTEN */}
      {gruppen && (
        <div style={{ display: 'grid', gap: 26 }}>
          {gruppen.map((g) => <VariantenGruppeView key={g.kanal} g={g} />)}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// VARIANTEN-Modus: eine Kanal-Gruppe mit vielen Kurz-Varianten (kopieren).
// ------------------------------------------------------------------
function VariantenGruppeView({ g }: { g: TextVariantenGruppe }) {
  const [kopiert, setKopiert] = useState<number | 'alle' | null>(null);

  function textVon(v: TextVariante): string {
    return v.betreff ? `Betreff: ${v.betreff}\n\n${v.text}` : v.text;
  }
  async function kopiere(inhalt: string, marke: number | 'alle') {
    try {
      await navigator.clipboard.writeText(inhalt);
      setKopiert(marke);
      setTimeout(() => setKopiert((m) => (m === marke ? null : m)), 1800);
    } catch { /* still */ }
  }

  const zielModul = g.ziel === 'newsletter' ? '/dashboard/marketing/newsletter'
    : g.ziel === 'whatsapp' ? '/dashboard/marketing/whatsapp'
    : '/dashboard/marketing/social';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 18 }}>
          {g.icon} {g.name} <span style={{ color: C.textDim, fontWeight: 500, fontSize: 14 }}>· {g.varianten.length} Varianten</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => kopiere(g.varianten.map((v, i) => `— Variante ${i + 1} —\n${textVon(v)}`).join('\n\n'), 'alle')}
            style={{ background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 9, padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {kopiert === 'alle' ? '✓ Kopiert' : '📋 Alle kopieren'}
          </button>
          <a href={zielModul} style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 14px', fontWeight: 700, fontSize: 13, textDecoration: 'none', fontFamily: 'inherit' }}>
            {g.ziel === 'social' ? 'Social-Plan' : g.ziel === 'newsletter' ? 'Newsletter' : 'WhatsApp'} öffnen →
          </a>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {g.varianten.map((v) => (
          <div key={v.nummer} style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.cyan, fontWeight: 700, fontSize: 13 }}>#{v.nummer}</span>
              <span style={{ fontSize: 12, color: v.zuLang ? C.danger : C.textDim, fontWeight: v.zuLang ? 700 : 500 }}>
                {v.zeichen} / {v.zeichenLimit}{v.zuLang ? ' — zu lang' : ''}
              </span>
            </div>
            {v.betreff && <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{v.betreff}</div>}
            <div style={{ color: '#cdd9ea', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{v.text}</div>
            {v.bildStichwort && <div style={{ color: C.textDim, fontSize: 12 }}>🖼 Bildidee: {v.bildStichwort}</div>}
            <div style={{ marginTop: 'auto', paddingTop: 4 }}>
              <button
                onClick={() => kopiere(textVon(v), v.nummer)}
                style={{ background: 'transparent', color: C.green, border: `1px solid ${C.green}`, borderRadius: 8, padding: '7px 13px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {kopiert === v.nummer ? '✓ Kopiert' : '📋 Kopieren'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// EINZELN-Modus: eine Karte je Kanal — eigener Zustand (Text/Betreff/Bild + Aktion).
// ------------------------------------------------------------------
function VorschlagKarte({ v }: { v: Vorschlag }) {
  const [text, setText] = useState(v.text);
  const [betreff, setBetreff] = useState(v.betreff || '');
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [bildUrl, setBildUrl] = useState<string | null>(null);
  const [bildLaden, setBildLaden] = useState(false);
  const [aktion, setAktion] = useState<'idle' | 'laeuft' | 'ok' | 'fehler'>('idle');
  const [meldung, setMeldung] = useState<string | null>(null);

  const zeichen = Array.from(text).length;
  const zuLang = zeichen > v.zeichenLimit;

  useEffect(() => {
    if (!v.bildStichwort) return;
    let ab = false;
    (async () => {
      setBildLaden(true);
      try {
        const res = await fetch(`/api/fotos?q=${encodeURIComponent(v.bildStichwort as string)}`);
        const j = await res.json();
        const liste: Foto[] = Array.isArray(j.fotos) ? j.fotos.slice(0, 6) : [];
        if (ab) return;
        setFotos(liste);
        if (v.bildPflicht && liste.length > 0) setBildUrl(liste[0].url);
      } catch { /* Bilder sind optional (außer Instagram) */ }
      finally { if (!ab) setBildLaden(false); }
    })();
    return () => { ab = true; };
  }, [v.bildStichwort, v.bildPflicht]);

  async function kopieren() {
    const inhalt = v.ziel === 'newsletter' && betreff ? `Betreff: ${betreff}\n\n${text}` : text;
    try {
      await navigator.clipboard.writeText(inhalt);
      setMeldung('In die Zwischenablage kopiert.');
      setAktion('ok');
    } catch {
      setMeldung('Kopieren nicht möglich — bitte Text markieren und mit Strg+C kopieren.');
      setAktion('fehler');
    }
  }

  async function uebernehmen() {
    if (!text.trim()) { setMeldung('Der Text ist leer.'); setAktion('fehler'); return; }
    if (v.bildPflicht && !bildUrl) { setMeldung('Instagram braucht ein Bild — bitte eines auswählen.'); setAktion('fehler'); return; }
    setAktion('laeuft'); setMeldung(null);
    try {
      const res = await fetch('/api/marketing/social-beitraege', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          kanaele: v.plattformId ? [v.plattformId] : [],
          medien_urls: bildUrl ? [bildUrl] : [],
          status: 'entwurf',
        }),
      });
      const j = await res.json();
      if (!j.ok) { setMeldung(j.error || 'Übernehmen fehlgeschlagen.'); setAktion('fehler'); return; }
      setMeldung('Als Entwurf gespeichert.'); setAktion('ok');
    } catch {
      setMeldung('Verbindung fehlgeschlagen.'); setAktion('fehler');
    }
  }

  const zielModul = v.ziel === 'newsletter' ? '/dashboard/marketing/newsletter'
    : v.ziel === 'whatsapp' ? '/dashboard/marketing/whatsapp'
    : '/dashboard/marketing/social';

  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16 }}>
          {v.icon} {v.name}
        </div>
        <span style={{ fontSize: 12.5, color: zuLang ? C.danger : C.textDim, fontWeight: zuLang ? 700 : 500 }}>
          {zeichen} / {v.zeichenLimit} Zeichen{zuLang ? ' — zu lang' : ''}
        </span>
      </div>

      {v.ziel === 'newsletter' && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 12.5, color: C.textDim, marginBottom: 5 }}>Betreff</label>
          <input value={betreff} onChange={(e) => setBetreff(e.target.value)} style={inputStyle} />
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={v.ziel === 'whatsapp' ? 4 : 6}
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
      />

      {v.bildStichwort && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12.5, color: C.textDim, marginBottom: 8 }}>
            Bildvorschlag zu „{v.bildStichwort}"{v.bildPflicht ? ' (Instagram braucht ein Bild)' : ' (optional)'} · {bildLaden ? 'lädt …' : `${fotos.length} Motive`}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {fotos.map((f) => {
              const aktiv = bildUrl === f.url;
              return (
                <button
                  key={f.url}
                  onClick={() => setBildUrl(aktiv ? null : f.url)}
                  title={`Foto: ${f.autor}`}
                  style={{
                    padding: 0, border: `2px solid ${aktiv ? C.cyan : 'transparent'}`, borderRadius: 10,
                    cursor: 'pointer', background: 'none', lineHeight: 0, outline: aktiv ? 'none' : undefined,
                  }}
                >
                  { /* eslint-disable-next-line @next/next/no-img-element */ }
                  <img src={f.thumb} alt={v.bildStichwort as string} width={90} height={64} style={{ objectFit: 'cover', borderRadius: 8, display: 'block', opacity: aktiv ? 1 : 0.85 }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        {v.ziel === 'social' ? (
          <button
            onClick={uebernehmen}
            disabled={aktion === 'laeuft'}
            style={{
              background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 18px',
              fontWeight: 700, fontSize: 14, cursor: aktion === 'laeuft' ? 'wait' : 'pointer',
              fontFamily: 'var(--font-syne), sans-serif', opacity: aktion === 'laeuft' ? 0.7 : 1,
            }}
          >
            {aktion === 'laeuft' ? 'Speichere …' : '📥 In den Plan übernehmen'}
          </button>
        ) : (
          <button
            onClick={kopieren}
            style={{
              background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 18px',
              fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-syne), sans-serif',
            }}
          >
            📋 Text kopieren
          </button>
        )}
        <a
          href={zielModul}
          style={{
            background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10,
            padding: '9px 16px', fontWeight: 700, fontSize: 13.5, textDecoration: 'none', fontFamily: 'var(--font-syne), sans-serif',
          }}
        >
          {v.ziel === 'social' ? 'Social-Plan öffnen' : v.ziel === 'newsletter' ? 'Newsletter öffnen' : 'WhatsApp öffnen'} →
        </a>
        {meldung && (
          <span style={{ fontSize: 13, color: aktion === 'ok' ? C.green : aktion === 'fehler' ? C.danger : C.textDim }}>
            {meldung}
          </span>
        )}
      </div>
    </div>
  );
}
