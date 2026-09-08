'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { zaehleLeads, seitenUrl, DATEI_MAX_BYTES } from '@/lib/freebie';

// ============================================================================
// ARGONAUT OS · MODUL MARKETING · Freebie-Baukasten (D3)
//
// Ein Thema anlegen, ein PDF hochladen, fünf E-Mails anpassen — fertig ist
// die öffentliche Seite mit Double-Opt-in, Auslieferung und Nachfass-Strecke.
//
// Das PDF geht über eine signierte Adresse direkt vom Browser in den
// Speicher: Eine Serverless-Funktion nimmt nur wenige Megabyte entgegen,
// ein 20-MB-Ratgeber käme nie an.
//
// Alle Regeln liegen in lib/freebie.ts und sind dort node-getestet.
// ============================================================================

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  gruen: '#4CAF7D', rot: '#E06666', warn: '#E0A24C',
  text: '#E8EDF4', dim: '#8FA3BE', rand: 'rgba(143,163,190,0.18)',
};

type Freebie = {
  id: string; titel: string; untertitel: string | null; beschreibung: string | null;
  nutzen: string[] | null; datei_pfad: string | null; datei_name: string | null;
  datei_bytes: number | null; oeffentlich_key: string; aktiv: boolean; erstellt_am: string;
};
type Mail = { id: string; freebie_id: string; schritt: number; tag: number; betreff: string; text: string; aktiv: boolean };
type Lead = { id: string; freebie_id: string; email: string; name: string | null; status: string; erstellt_am: string };

const eingabe = {
  width: '100%', background: C.navy, border: `1px solid ${C.rand}`, borderRadius: 10,
  color: C.text, padding: '10px 12px', fontSize: 14.5, boxSizing: 'border-box' as const,
  fontFamily: 'inherit',
};

export default function FreebiesPage() {
  const [freebies, setFreebies] = useState<Freebie[]>([]);
  const [mails, setMails] = useState<Mail[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [offen, setOffen] = useState<string | null>(null);
  const [basis, setBasis] = useState('');

  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fehlt, setFehlt] = useState<string[]>([]);
  const [meldung, setMeldung] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') setBasis(window.location.origin);
  }, []);

  const holen = useCallback(async () => {
    setLaden(true);
    const [{ data: f, error }, { data: m }, { data: l }] = await Promise.all([
      supabase.from('freebie').select('*').order('erstellt_am', { ascending: false }),
      supabase.from('freebie_mail').select('*').order('schritt', { ascending: true }),
      supabase.from('freebie_lead').select('id, freebie_id, email, name, status, erstellt_am')
        .order('erstellt_am', { ascending: false }).limit(500),
    ]);
    if (error) setFehler(error.message);
    setFreebies((f as Freebie[]) ?? []);
    setMails((m as Mail[]) ?? []);
    setLeads((l as Lead[]) ?? []);
    setLaden(false);
  }, []);

  useEffect(() => { void holen(); }, [holen]);

  async function ruf(nutzlast: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true); setFehler(null); setFehlt([]);
    try {
      const res = await fetch('/api/marketing/freebie', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nutzlast),
      });
      const j = (await res.json()) as Record<string, unknown>;
      if (!res.ok || !j?.ok) {
        setFehler(String(j?.error || 'Das hat nicht geklappt.'));
        if (Array.isArray(j?.fehlt)) setFehlt((j.fehlt as string[]));
        return null;
      }
      return j;
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
      return null;
    } finally { setBusy(false); }
  }

  async function anlegen() {
    const j = await ruf({ aktion: 'anlegen' });
    if (!j) return;
    await holen();
    setOffen(String(j.id));
    setMeldung('Angelegt — die fünf Standard-E-Mails liegen schon bereit.');
  }

  async function loeschen(id: string) {
    setBusy(true); setFehler(null);
    const res = await fetch(`/api/marketing/freebie?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const j = await res.json();
    setBusy(false);
    if (!res.ok || !j?.ok) { setFehler(j?.error || 'Löschen fehlgeschlagen.'); return; }
    if (offen === id) setOffen(null);
    await holen();
  }

  async function dateiGewaehlt(e: ChangeEvent<HTMLInputElement>, id: string) {
    const datei = e.target.files?.[0];
    e.target.value = '';
    if (!datei) return;

    const vorbereitet = await ruf({
      aktion: 'datei', id, dateiname: datei.name, typ: datei.type, groesse: datei.size,
    });
    if (!vorbereitet) return;

    setBusy(true);
    try {
      // Direkt vom Browser in den Speicher — an der Serverless-Funktion vorbei.
      const put = await fetch(String(vorbereitet.signedUrl), {
        method: 'PUT',
        headers: { 'Content-Type': datei.type || 'application/pdf' },
        body: datei,
      });
      if (!put.ok) throw new Error('Upload fehlgeschlagen');
      setBusy(false);
      const ok = await ruf({
        aktion: 'datei-fertig', id, pfad: String(vorbereitet.pfad),
        dateiname: datei.name, groesse: datei.size,
      });
      if (ok) { await holen(); setMeldung('PDF hochgeladen.'); }
    } catch {
      setBusy(false);
      setFehler('Die Datei konnte nicht hochgeladen werden. Bitte erneut versuchen.');
    }
  }

  const zahlenJeFreebie = useMemo(() => {
    const map = new Map<string, ReturnType<typeof zaehleLeads>>();
    for (const f of freebies) map.set(f.id, zaehleLeads(leads.filter((l) => l.freebie_id === f.id)));
    return map;
  }, [freebies, leads]);

  const aktives = freebies.find((f) => f.id === offen) || null;
  const aktiveMails = mails.filter((m) => m.freebie_id === offen).sort((a, b) => a.schritt - b.schritt);

  return (
    <div style={{ padding: '28px 22px 60px', color: C.text, maxWidth: 1180, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 26, margin: 0 }}>
        🎁 Freebie-Baukasten
      </h1>
      <p style={{ color: C.dim, fontSize: 14.5, lineHeight: 1.55, margin: '8px 0 22px', maxWidth: 860 }}>
        Ein Thema, ein PDF — und Sie haben eine öffentliche Seite, auf der sich Interessenten eintragen.
        Sie bestätigen per E-Mail, bekommen die Unterlage sofort und danach ein paar wenige Nachrichten
        von Ihnen. <b style={{ color: C.text }}>Alles unter Ihrem Namen</b>, nicht unter unserem.
      </p>

      {fehler && (
        <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.rot}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 13.5 }}>
          {fehler}
          {fehlt.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {fehlt.map((x, i) => <li key={i} style={{ marginTop: 3 }}>{x}</li>)}
            </ul>
          )}
        </div>
      )}
      {meldung && (
        <div style={{ background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.gruen}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 13.5 }}>
          {meldung}
        </div>
      )}

      <button
        onClick={() => void anlegen()} disabled={busy}
        style={{ background: C.gold, border: 'none', borderRadius: 10, color: C.navy, padding: '11px 20px', fontSize: 14.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', marginBottom: 22 }}
      >
        + Neues Freebie
      </button>

      {laden && <div style={{ color: C.dim }}>Wird geladen …</div>}
      {!laden && freebies.length === 0 && (
        <div style={{ background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 16, padding: 24, color: C.dim, fontSize: 14.5, lineHeight: 1.6 }}>
          Noch nichts angelegt. Ein gutes erstes Freebie beantwortet <b style={{ color: C.text }}>eine</b> Frage,
          die Ihre Kunden Ihnen ohnehin ständig stellen — auf fünf bis zehn Seiten, nicht auf fünfzig.
        </div>
      )}

      {freebies.map((f) => {
        const z = zahlenJeFreebie.get(f.id);
        const url = seitenUrl(basis, f.oeffentlich_key);
        const istOffen = offen === f.id;
        return (
          <div key={f.id} style={{ background: C.navy2, border: `1px solid ${istOffen ? C.gold : C.rand}`, borderRadius: 16, padding: 20, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 220, flex: 1 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 17 }}>{f.titel}</span>
                  <span style={{ fontSize: 11.5, padding: '2px 10px', borderRadius: 999, border: `1px solid ${f.aktiv ? C.gruen : C.dim}`, color: f.aktiv ? C.gruen : C.dim }}>
                    {f.aktiv ? 'öffentlich' : 'Entwurf'}
                  </span>
                </div>
                {f.untertitel && <div style={{ color: C.dim, fontSize: 13.5, marginTop: 4 }}>{f.untertitel}</div>}
                {f.aktiv && (
                  <div style={{ marginTop: 8, fontSize: 12.5 }}>
                    <a href={url} target="_blank" rel="noreferrer" style={{ color: C.cyan }}>{url}</a>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                <Zahl label="Eintragungen" wert={String(z?.gesamt ?? 0)} farbe={C.cyan} />
                <Zahl label="Bestätigt" wert={String(z?.aktiv ?? 0)} farbe={C.gruen} />
                <Zahl label="Quote" wert={z?.bestaetigungsquote != null ? `${z.bestaetigungsquote} %` : '—'} farbe={C.gold} />
                <button
                  onClick={() => setOffen(istOffen ? null : f.id)}
                  style={{ background: 'transparent', border: `1px solid ${C.rand}`, borderRadius: 10, color: C.text, padding: '9px 16px', fontSize: 13.5, cursor: 'pointer' }}
                >
                  {istOffen ? 'Schließen' : 'Bearbeiten'}
                </button>
              </div>
            </div>

            {istOffen && aktives && (
              <Bearbeiten
                f={aktives}
                mails={aktiveMails}
                busy={busy}
                onDatei={(e) => void dateiGewaehlt(e, f.id)}
                onSpeichern={async (felder) => {
                  const ok = await ruf({ aktion: 'speichern', id: f.id, ...felder });
                  if (ok) { await holen(); setMeldung('Gespeichert.'); }
                }}
                onMail={async (m) => {
                  const ok = await ruf({ aktion: 'mail', id: f.id, ...m });
                  if (ok) { await holen(); setMeldung(`E-Mail ${m.schritt} gespeichert.`); }
                }}
                onSchalten={async (aktiv) => {
                  const ok = await ruf({ aktion: 'schalten', id: f.id, aktiv });
                  if (ok) { await holen(); setMeldung(aktiv ? 'Ihre Seite ist jetzt öffentlich.' : 'Seite wieder auf Entwurf gestellt.'); }
                }}
                onLoeschen={() => void loeschen(f.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Zahl({ label, wert, farbe }: { label: string; wert: string; farbe: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ color: '#8FA3BE', fontSize: 11 }}>{label}</div>
      <div style={{ color: farbe, fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 19 }}>{wert}</div>
    </div>
  );
}

function Bearbeiten({
  f, mails, busy, onDatei, onSpeichern, onMail, onSchalten, onLoeschen,
}: {
  f: Freebie;
  mails: Mail[];
  busy: boolean;
  onDatei: (e: ChangeEvent<HTMLInputElement>) => void;
  onSpeichern: (felder: Record<string, unknown>) => void | Promise<void>;
  onMail: (m: { schritt: number; tag: number; betreff: string; text: string; aktiv: boolean }) => void | Promise<void>;
  onSchalten: (aktiv: boolean) => void | Promise<void>;
  onLoeschen: () => void;
}) {
  const [titel, setTitel] = useState(f.titel);
  const [untertitel, setUntertitel] = useState(f.untertitel ?? '');
  const [beschreibung, setBeschreibung] = useState(f.beschreibung ?? '');
  const [nutzen, setNutzen] = useState((f.nutzen ?? []).join('\n'));

  return (
    <div style={{ marginTop: 20, borderTop: `1px solid ${C.rand}`, paddingTop: 20 }}>
      {/* ---- Kopfdaten ---- */}
      <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
        <Feld label="Titel" hinweis="Was der Interessent groß auf der Seite liest.">
          <input style={eingabe} value={titel} onChange={(e) => setTitel(e.target.value)} />
        </Feld>
        <Feld label="Untertitel" hinweis="Ein Satz, der den Nutzen benennt. Freiwillig.">
          <input style={eingabe} value={untertitel} onChange={(e) => setUntertitel(e.target.value)} />
        </Feld>
        <Feld label="Beschreibung" hinweis="Zwei bis vier Sätze: Was steht drin, und für wen ist das?">
          <textarea style={{ ...eingabe, minHeight: 92, resize: 'vertical' }} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
        </Feld>
        <Feld label="Die Punkte auf der Seite" hinweis="Eine Zeile je Punkt, höchstens acht.">
          <textarea style={{ ...eingabe, minHeight: 78, resize: 'vertical' }} value={nutzen} onChange={(e) => setNutzen(e.target.value)} />
        </Feld>
        <div>
          <button
            onClick={() => void onSpeichern({
              titel, untertitel, beschreibung,
              nutzen: nutzen.split('\n').map((n) => n.trim()).filter(Boolean),
            })}
            disabled={busy}
            style={{ background: C.gold, border: 'none', borderRadius: 10, color: C.navy, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
          >
            Speichern
          </button>
        </div>
      </div>

      {/* ---- Datei ---- */}
      <div style={{ background: C.navy, border: `1px solid ${C.rand}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 6 }}>Die Unterlage</div>
        <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 12, lineHeight: 1.55 }}>
          Nur PDF, höchstens {Math.round(DATEI_MAX_BYTES / 1024 / 1024)} MB. Andere Formate öffnen sich nicht
          auf jedem Gerät zuverlässig — und was der Empfänger nicht aufbekommt, hat er nicht bekommen.
        </div>
        {f.datei_pfad ? (
          <div style={{ color: C.gruen, fontSize: 13.5, marginBottom: 12 }}>
            ✓ {f.datei_name}{f.datei_bytes ? ` · ${(f.datei_bytes / 1024 / 1024).toFixed(1)} MB` : ''}
          </div>
        ) : (
          <div style={{ color: C.warn, fontSize: 13.5, marginBottom: 12 }}>Noch keine Datei hinterlegt.</div>
        )}
        <label style={{ display: 'inline-block', background: 'transparent', border: `1px solid ${C.rand}`, borderRadius: 10, color: C.text, padding: '9px 16px', fontSize: 13.5, cursor: 'pointer' }}>
          {f.datei_pfad ? 'Andere Datei wählen' : 'PDF hochladen'}
          <input type="file" accept="application/pdf,.pdf" onChange={onDatei} style={{ display: 'none' }} />
        </label>
      </div>

      {/* ---- Strecke ---- */}
      <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>Die Nachfass-Strecke</div>
      <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 14, lineHeight: 1.55 }}>
        Die Unterlage selbst geht sofort nach der Bestätigung raus — diese E-Mails kommen danach.
        Platzhalter: <code style={{ color: C.cyan }}>{'{{firma}}'}</code>{' '}
        <code style={{ color: C.cyan }}>{'{{name}}'}</code>{' '}
        <code style={{ color: C.cyan }}>{'{{titel}}'}</code>. Ein Abmeldelink hängt automatisch unter jeder E-Mail.
      </div>

      {mails.map((m) => <MailZeile key={m.id} m={m} busy={busy} onMail={onMail} />)}

      {/* ---- Schalten ---- */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 18, borderTop: `1px solid ${C.rand}`, paddingTop: 18 }}>
        <button
          onClick={() => void onSchalten(!f.aktiv)}
          disabled={busy}
          style={{ background: f.aktiv ? 'transparent' : C.gruen, border: `1px solid ${f.aktiv ? C.rand : C.gruen}`, borderRadius: 10, color: f.aktiv ? C.text : C.navy, padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
        >
          {f.aktiv ? 'Auf Entwurf zurückstellen' : 'Öffentlich schalten'}
        </button>
        <span style={{ color: C.dim, fontSize: 12.5 }}>
          Vor dem Schalten prüfen wir Titel, Beschreibung, PDF, Strecke und Ihr Impressum.
        </span>
        <button
          onClick={onLoeschen}
          disabled={busy}
          style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: C.rot, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
        >
          Freebie löschen
        </button>
      </div>
    </div>
  );
}

function MailZeile({
  m, busy, onMail,
}: {
  m: Mail;
  busy: boolean;
  onMail: (x: { schritt: number; tag: number; betreff: string; text: string; aktiv: boolean }) => void | Promise<void>;
}) {
  const [tag, setTag] = useState(String(m.tag));
  const [betreff, setBetreff] = useState(m.betreff);
  const [text, setText] = useState(m.text);
  const [aktiv, setAktiv] = useState(m.aktiv);
  const [auf, setAuf] = useState(false);

  return (
    <div style={{ background: C.navy, border: `1px solid ${C.rand}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: C.gold, fontWeight: 700, fontSize: 13.5, minWidth: 74 }}>E-Mail {m.schritt}</span>
        <span style={{ color: C.dim, fontSize: 12.5 }}>Tag</span>
        <input
          value={tag} onChange={(e) => setTag(e.target.value)} inputMode="numeric"
          style={{ ...eingabe, width: 62, padding: '7px 9px' }}
        />
        <span style={{ flex: 1, minWidth: 160, color: aktiv ? C.text : C.dim, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {betreff || '(kein Betreff)'}
        </span>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: C.dim, cursor: 'pointer' }}>
          <input type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} />
          aktiv
        </label>
        <button
          onClick={() => setAuf((v) => !v)}
          style={{ background: 'transparent', border: `1px solid ${C.rand}`, borderRadius: 8, color: C.text, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' }}
        >
          {auf ? 'Zu' : 'Text'}
        </button>
      </div>

      {auf && (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <input style={eingabe} value={betreff} onChange={(e) => setBetreff(e.target.value)} placeholder="Betreff" />
          <textarea
            style={{ ...eingabe, minHeight: 140, resize: 'vertical', lineHeight: 1.55 }}
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Der Text der E-Mail. Die Anrede setzen wir davor, den Abmeldelink darunter."
          />
          <div>
            <button
              onClick={() => void onMail({
                schritt: m.schritt,
                tag: Math.max(1, Math.floor(Number(tag)) || 1),
                betreff, text, aktiv,
              })}
              disabled={busy}
              style={{ background: C.gold, border: 'none', borderRadius: 10, color: C.navy, padding: '9px 18px', fontSize: 13.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
            >
              E-Mail {m.schritt} speichern
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Feld({ label, hinweis, children }: { label: string; hinweis?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 5 }}>{label}</div>
      {children}
      {hinweis && <div style={{ color: '#8FA3BE', fontSize: 11.5, marginTop: 4 }}>{hinweis}</div>}
    </div>
  );
}
