'use client';

// ============================================================
// ARGONAUT OS · Paket 347 (13.10.2026) · A1 Vorlagen-Prinzip Teil 1
// „Meine Rechtstexte": Die Geschäftsleitung hinterlegt ihre eigenen, von
// ihrem Anwalt geprüften Texte (Verwahrbedingungen, Kaufvertrag,
// Probefahrt …). ARGONAUT liefert nur leere Gerüste (Überschriften), keinen
// Wortlaut. Jede Änderung wird eine neue Fassung; frühere Fassungen bleiben
// unveränderbar belegbar (SQL p347). Dokumente nehmen immer die gültige
// Fassung, ohne eigenen Text erscheint dort ein Hinweis — nie ein Mustertext.
// Prüfen und Füllen: lib/rechtsTexte.ts (tests/rechtstexteP347).
// Nur Geschäftsleitung (Menü nurChef; RLS: schreiben nur der Inhaber).
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import {
  RECHTS_TEXTE, HINWEIS_ANWALT, TEXT_MAX, VERMERK_MAX, geruest, nachBereich, textPruefen, standText, uebersicht,
  type RechtsTextEintrag,
} from '@/lib/rechtsTexte';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };

type Zeile = { schluessel: string; text: string; fassung: number; geaendert_am: string | null; geprueft_vermerk: string | null };
type Fassung = { id: string; fassung: number; text: string; geprueft_vermerk: string | null; gueltig_ab: string; gueltig_bis: string };
type Form = { schluessel: string; text: string; vermerk: string };

function datum(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export default function RechtstextePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [fassungen, setFassungen] = useState<{ schluessel: string; liste: Fassung[] } | null>(null);

  const laden = useCallback(async (betrieb: string) => {
    const { data, error } = await supabase.from('rechtstext')
      .select('schluessel, text, fassung, geaendert_am, geprueft_vermerk').eq('owner_user_id', betrieb).limit(500);
    if (error) { setFehler('„Meine Rechtstexte" ist noch nicht eingerichtet (SQL Paket 347).'); setZeilen([]); return; }
    setZeilen((data as Zeile[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setFehler('Nicht angemeldet.'); return; }
        const { data: chef } = await supabase.rpc('mein_chef_id');
        const chefId = typeof chef === 'string' && chef ? chef : null;
        setUid(user.id);
        setIstChef(!chefId);
        await laden(chefId ?? user.id);
      } finally { setLaedt(false); }
    })();
  }, [laden]);

  const je = new Map(zeilen.map((z) => [z.schluessel, z]));
  const ue = uebersicht(zeilen);
  const eintragForm = form ? RECHTS_TEXTE.find((e) => e.schluessel === form.schluessel) ?? null : null;
  const formFehler = form && eintragForm ? textPruefen(eintragForm, form.text, form.vermerk) : [];

  function oeffnen(e: RechtsTextEintrag) {
    const z = je.get(e.schluessel);
    setForm({ schluessel: e.schluessel, text: z?.text ?? '', vermerk: z?.geprueft_vermerk ?? '' });
    setOk(null); setFehler(null); setFassungen(null);
  }

  async function speichern() {
    if (!form || !eintragForm || !uid || formFehler.length) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('rechtstext')
        .upsert({ owner_user_id: uid, schluessel: form.schluessel, text: form.text.trim(), geprueft_vermerk: form.vermerk.trim() || null }, { onConflict: 'owner_user_id,schluessel' })
        .select('schluessel, fassung');
      if (error) { setFehler('Speichern ging nicht: ' + error.message); return; }
      if (nichtsGeschrieben(data)) { setFehler('Speichern ging nicht — nur die Geschäftsleitung hinterlegt Rechtstexte.'); return; }
      const f = (data as { fassung: number }[])[0]?.fassung ?? 1;
      setOk(`„${eintragForm.titel}" gespeichert — Fassung ${f}. Neue Dokumente nehmen ab sofort diese Fassung.`);
      setForm(null);
      await laden(uid);
    } finally { setBusy(false); }
  }

  async function entfernen(e: RechtsTextEintrag) {
    if (!uid) return;
    if (!window.confirm(`Eigenen Text für „${e.titel}" entfernen? Neue Dokumente erscheinen dann ohne diese Bedingungen (mit Hinweis). Die bisherigen Fassungen bleiben belegbar.`)) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('rechtstext').delete().eq('owner_user_id', uid).eq('schluessel', e.schluessel).select('schluessel');
      if (error) { setFehler('Entfernen ging nicht: ' + error.message); return; }
      if (nichtsGeschrieben(data)) { setFehler('Entfernen ging nicht — nur die Geschäftsleitung.'); return; }
      setOk(`Eigener Text für „${e.titel}" entfernt. Die letzte Fassung bleibt unter „Frühere Fassungen" belegbar.`);
      await laden(uid);
    } finally { setBusy(false); }
  }

  async function fassungenZeigen(e: RechtsTextEintrag) {
    if (!uid) return;
    if (fassungen?.schluessel === e.schluessel) { setFassungen(null); return; }
    const { data, error } = await supabase.from('rechtstext_fassung')
      .select('id, fassung, text, geprueft_vermerk, gueltig_ab, gueltig_bis')
      .eq('owner_user_id', uid).eq('schluessel', e.schluessel).order('fassung', { ascending: false }).limit(50);
    if (error) { setFehler('Frühere Fassungen konnten nicht geladen werden.'); return; }
    setFassungen({ schluessel: e.schluessel, liste: (data as Fassung[]) ?? [] });
  }

  return (
    <div style={s.page}>
      <a href="/dashboard" style={s.zurueck}>← Dashboard</a>
      <h1 style={s.h1}>📜 Meine Rechtstexte</h1>
      <p style={s.dim}>
        So geht&apos;s: Hier hinterlegen Sie Ihre eigenen Texte für Verträge, Bedingungen und Erklärungen, die Ihre Kunden unterschreiben —
        zum Beispiel die Bedingungen der Einlagerung im Verwahrprotokoll. ARGONAUT setzt Ihren Text in das Dokument ein und füllt Platzhalter wie
        {' '}<code>{'{{kunde}}'}</code> automatisch. Jede Änderung wird eine neue Fassung; welche Fassung wann galt, bleibt belegbar.
      </p>
      <div style={s.hinweis}>⚖️ {HINWEIS_ANWALT} Das Gerüst enthält nur Überschriften als Gliederungshilfe — es ist kein Vertragstext.</div>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok} role="status">{ok}</div>}
      {!laedt && !istChef && <div style={s.hinweis}>Rechtstexte hinterlegt nur die Geschäftsleitung. Sie sehen hier, was für Ihren Betrieb gilt.</div>}

      {!laedt && (
        <div style={s.kacheln}>
          <div style={s.kachel}><span style={s.klein}>Rechtstexte im Katalog</span><b style={s.zahl}>{ue.gesamt}</b></div>
          <div style={s.kachel}><span style={s.klein}>eigener Text hinterlegt</span><b style={{ ...s.zahl, color: C.ok }}>{ue.hinterlegt}</b></div>
          <div style={s.kachel}><span style={s.klein}>schon genutzt, aber noch ohne Text</span><b style={{ ...s.zahl, color: ue.fehlenAngebunden ? C.warn : C.ok }}>{ue.fehlenAngebunden}</b></div>
        </div>
      )}

      {laedt && <p style={s.dim}>Wird geladen …</p>}

      {!laedt && nachBereich().map(({ bereich, eintraege }) => (
        <section key={bereich} style={{ marginTop: 16 }}>
          <h2 style={s.h2}>{bereich}</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {eintraege.map((e) => {
              const z = je.get(e.schluessel);
              const offen = form?.schluessel === e.schluessel;
              return (
                <div key={e.schluessel} style={s.karte}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <b>{e.titel}</b>
                    {z
                      ? <span style={{ ...s.pill, borderColor: C.ok, color: C.ok }}>hinterlegt · {standText(z)}</span>
                      : <span style={{ ...s.pill, borderColor: e.angebunden ? C.warn : C.dim, color: e.angebunden ? C.warn : C.dim }}>kein eigener Text</span>}
                    {!e.angebunden && <span style={{ ...s.pill, borderColor: C.info, color: C.info }}>wird in Kürze angebunden</span>}
                  </div>
                  <div style={{ ...s.klein, marginTop: 6 }}>
                    {e.wofuer}<br />
                    Erscheint in: {e.wo} · Bekommt: {e.empfaenger}<br />
                    Platzhalter: {e.platzhalter.map((p) => <span key={p.key} title={p.label}><code>{`{{${p.key}}}`}</code> ({p.label}) </span>)}
                    {z?.geprueft_vermerk && <><br />Prüf-Vermerk: {z.geprueft_vermerk}</>}
                    {!z && e.angebunden && <><br /><span style={{ color: C.warn }}>Ohne eigenen Text erscheint im Dokument nur der Hinweis, dass keine Bedingungen hinterlegt sind.</span></>}
                  </div>
                  {istChef && !offen && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      <button style={s.btnGold} disabled={busy} onClick={() => oeffnen(e)}>{z ? 'Text bearbeiten' : 'Eigenen Text hinterlegen'}</button>
                      {z && <button style={s.btnAus} disabled={busy} onClick={() => void entfernen(e)}>Entfernen</button>}
                      <button style={s.btnAus} disabled={busy} onClick={() => void fassungenZeigen(e)}>{fassungen?.schluessel === e.schluessel ? 'Fassungen ausblenden' : 'Frühere Fassungen'}</button>
                    </div>
                  )}

                  {offen && form && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                      {!form.text.trim() && (
                        <button style={{ ...s.btnAus, justifySelf: 'start' }} onClick={() => setForm({ ...form, text: geruest(e) })}>Gerüst einfügen (nur Überschriften)</button>
                      )}
                      <label style={s.feld}>Ihr Text (von Ihrem Anwalt geprüft)
                        <textarea style={{ ...s.input, minHeight: 260, lineHeight: 1.5 }} maxLength={TEXT_MAX} value={form.text} onChange={(ev) => setForm({ ...form, text: ev.target.value })} />
                      </label>
                      <label style={s.feld}>Prüf-Vermerk (freiwillig, z. B. „geprüft von Kanzlei … am …")
                        <input style={s.input} maxLength={VERMERK_MAX} value={form.vermerk} onChange={(ev) => setForm({ ...form, vermerk: ev.target.value })} />
                      </label>
                      <span style={s.klein}>{form.text.trim().length.toLocaleString('de-DE')} Zeichen</span>
                      {formFehler.length > 0 && <div style={{ color: C.warn, fontSize: 13 }}>{formFehler.join(' ')}</div>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={s.btnGold} disabled={busy || formFehler.length > 0} onClick={() => void speichern()}>{z ? 'Als neue Fassung speichern' : 'Speichern'}</button>
                        <button style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
                      </div>
                    </div>
                  )}

                  {fassungen?.schluessel === e.schluessel && (
                    <div style={{ marginTop: 10 }}>
                      {fassungen.liste.length === 0
                        ? <p style={s.klein}>Noch keine früheren Fassungen.</p>
                        : fassungen.liste.map((f) => (
                          <details key={f.id} style={{ ...s.fach, marginTop: 6 }}>
                            <summary style={{ cursor: 'pointer', fontSize: 13 }}>Fassung {f.fassung} · gültig {datum(f.gueltig_ab)} bis {datum(f.gueltig_bis)}{f.geprueft_vermerk ? ` · ${f.geprueft_vermerk}` : ''}</summary>
                            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: C.text, margin: '8px 0 0' }}>{f.text}</pre>
                          </details>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1000, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '8px 0 6px', color: C.text },
  h2: { fontSize: 16, margin: '6px 0 8px', color: C.gold },
  dim: { color: C.dim, fontSize: 13.5, lineHeight: 1.55 },
  klein: { color: C.dim, fontSize: 12.5, lineHeight: 1.5 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 14 },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 14 },
  hinweis: { background: 'rgba(224,162,76,0.10)', border: `1px solid ${C.warn}`, color: C.text, borderRadius: 10, padding: '10px 12px', margin: '10px 0', fontSize: 13.5, lineHeight: 1.5 },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, margin: '14px 0' },
  kachel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  zahl: { fontSize: 22, display: 'block', marginTop: 4 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  fach: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px' },
  pill: { border: '1px solid', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  btnAus: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14, fontFamily: 'inherit' },
  feld: { display: 'grid', gap: 4, fontSize: 13, color: C.dim },
};
