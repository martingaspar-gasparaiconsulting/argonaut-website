'use client';

// ============================================================
// ARGONAUT OS · Text-Werkstatt (Paket PC)
// EIN Text-Motor für vier Textarten:
//   📘 E-Book (B03)   Diktat -> Gliederung -> Kapitel -> PDF -> Freebie
//   🔎 Ratgeber (B04) SEO-Artikel -> Seite im Website-Bauer -> veröffentlichen
//   📰 Presse (B06)   Pressemitteilung im Redaktions-Aufbau -> PDF
//   🧭 Strategie (B11) Gesamtstrategie -> PDF
//
// Alles ist ENTWURF. Vor dem Veröffentlichen muss der Mensch bestätigen, dass er
// den Text geprüft hat (Art. 50 Abs. 4 KI-VO — redaktionelle Verantwortung;
// Anwalt-Punkt R02). Regeln und Prüfungen: lib/textMotor.ts (getestet).
//
// Pfad: app/dashboard/marketing/texte/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Diktat from '../../_components/Diktat';
import { hwgHinweise } from '@/lib/hwgWaechter';
import {
  TEXT_ARTEN, artInfo, ratgeberSlug, ratgeberBloecke, pruefeText, platzhalter,
  type TextArt, type Gliederung, type Einzeltext, type Pruefpunkt,
} from '@/lib/textMotor';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Gespeichert = { id: string; art: TextArt; titel: string; status: string; web_slug: string | null; aktualisiert_am: string; eingabe: Record<string, unknown>; inhalt: Record<string, unknown> };

type Form = { thema: string; zielgruppe: string; stichpunkte: string; keyword: string; fuerWen: string; kapitelZahl: number };
const LEER: Form = { thema: '', zielgruppe: '', stichpunkte: '', keyword: '', fuerWen: 'unser eigener Betrieb', kapitelZahl: 6 };

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j?.ok !== false, j };
}

export default function TextWerkstatt() {
  const [uid, setUid] = useState<string | null>(null);
  const [art, setArt] = useState<TextArt>('ebook');
  const [form, setForm] = useState<Form>({ ...LEER });
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  // E-Book
  const [gliederung, setGliederung] = useState<Gliederung | null>(null);
  const [kapitelTexte, setKapitelTexte] = useState<string[]>([]);

  // Ratgeber / Presse / Strategie
  const [einzel, setEinzel] = useState<Einzeltext | null>(null);
  const [seo, setSeo] = useState<Pruefpunkt[]>([]);

  const [geprueft, setGeprueft] = useState(false);
  const [aktuelleId, setAktuelleId] = useState<string | null>(null);
  const [webSlug, setWebSlug] = useState<string | null>(null);
  const [liveLink, setLiveLink] = useState<string | null>(null);
  const [liste, setListe] = useState<Gespeichert[]>([]);
  const [listeHinweis, setListeHinweis] = useState<string | null>(null);

  const info = artInfo(art)!;
  const setF = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const ladeListe = useCallback(async () => {
    const { data, error } = await supabase.from('text_werk')
      .select('id, art, titel, status, web_slug, aktualisiert_am, eingabe, inhalt')
      .order('aktualisiert_am', { ascending: false }).limit(50);
    if (error) { setListeHinweis(/text_werk/.test(error.message) ? 'Das Speichern ist noch nicht eingerichtet (SQL von Paket PC fehlt).' : null); return; }
    setListeHinweis(null);
    setListe((data as Gespeichert[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUid(data?.user?.id ?? null);
      await ladeListe();
    })();
  }, [ladeListe]);

  function neu(a: TextArt) {
    setArt(a); setGliederung(null); setKapitelTexte([]); setEinzel(null); setSeo([]);
    setGeprueft(false); setAktuelleId(null); setWebSlug(null); setLiveLink(null); setFehler(null); setMeldung(null);
  }

  // --- Erzeugen ----------------------------------------------------------------

  async function gliederungErstellen() {
    setLaeuft('Gliederung wird erstellt …'); setFehler(null); setMeldung(null); setGeprueft(false);
    const { ok, j } = await post('/api/text-motor', { schritt: 'gliederung', art, eingabe: form });
    setLaeuft(null);
    if (!ok) { setFehler(j?.error || 'Die Gliederung konnte nicht erstellt werden.'); return; }
    setGliederung(j.gliederung as Gliederung);
    setKapitelTexte(new Array((j.gliederung as Gliederung).kapitel.length).fill(''));
  }

  async function kapitelSchreiben(nur?: number) {
    if (!gliederung) return;
    setFehler(null); setMeldung(null); setGeprueft(false);
    const indizes = nur !== undefined ? [nur] : gliederung.kapitel.map((_, i) => i).filter((i) => !kapitelTexte[i]);
    const neuTexte = [...kapitelTexte];
    for (const i of indizes) {
      setLaeuft(`Kapitel ${i + 1} von ${gliederung.kapitel.length} wird geschrieben …`);
      const { ok, j } = await post('/api/text-motor', { schritt: 'kapitel', art, eingabe: form, gliederung, index: i });
      if (!ok) { setFehler(`Kapitel ${i + 1}: ${j?.error || 'fehlgeschlagen'} — die übrigen bleiben erhalten, einfach erneut starten.`); break; }
      neuTexte[i] = String(j.text || '');
      setKapitelTexte([...neuTexte]);
    }
    setLaeuft(null);
  }

  async function einzelErstellen() {
    setLaeuft('Text wird geschrieben … (dauert bis zu einer Minute)'); setFehler(null); setMeldung(null); setGeprueft(false);
    const { ok, j } = await post('/api/text-motor', { schritt: 'einzel', art, eingabe: form });
    setLaeuft(null);
    if (!ok) { setFehler(j?.error || 'Der Text konnte nicht erstellt werden.'); return; }
    setEinzel(j.ergebnis as Einzeltext);
    setSeo(Array.isArray(j.seo) ? j.seo : []);
  }

  // --- Weiterverwenden ------------------------------------------------------------

  const gesamtText = art === 'ebook'
    ? [gliederung?.titel ?? '', ...kapitelTexte].join('\n')
    : einzel ? [einzel.titel, einzel.beschreibung, einzel.text, ...einzel.faq.map((f) => `${f.frage} ${f.antwort}`)].join('\n') : '';
  // Paket PQ (H02): Gesundheitstexte zusaetzlich gegen das Heilmittelwerbegesetz pruefen.
  // Ohne Gesundheitsbezug liefert hwgHinweise nichts.
  const hinweise = gesamtText.trim() ? [...pruefeText(gesamtText), ...hwgHinweise(gesamtText)] : [];
  const offen = platzhalter(gesamtText);
  const fertig = art === 'ebook' ? !!gliederung && kapitelTexte.length > 0 && kapitelTexte.every((t) => t.trim()) : !!einzel;

  async function pdf() {
    setLaeuft('PDF wird erstellt …'); setFehler(null);
    const body = art === 'ebook' && gliederung
      ? { titel: gliederung.titel, untertitel: gliederung.untertitel, kapitel: gliederung.kapitel.map((k, i) => ({ titel: k.titel, text: kapitelTexte[i] || '' })) }
      : einzel
        ? { titel: einzel.titel, untertitel: art === 'presse' ? einzel.beschreibung : '', kapitel: [{ titel: einzel.titel, text: einzel.text + (einzel.faq.length ? '\n\n## Häufige Fragen\n' + einzel.faq.map((f) => `**${f.frage}**\n${f.antwort}`).join('\n\n') : '') }] }
        : null;
    if (!body) { setLaeuft(null); return; }
    try {
      const r = await fetch('/api/text-motor/pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setFehler(j?.error || 'PDF fehlgeschlagen.'); return; }
      const blob = await r.blob();
      const name = (r.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'Dokument.pdf';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (art === 'ebook') setMeldung('PDF heruntergeladen. Als Geschenk oder Freebie: im Freebie-Baukasten ein Thema anlegen und dieses PDF hochladen.');
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLaeuft(null); }
  }

  async function speichern(slugNeu?: string): Promise<string | null> {
    if (!uid) return null;
    const titel = art === 'ebook' ? gliederung?.titel : einzel?.titel;
    if (!titel) return null;
    const zeile = {
      owner_user_id: uid, art, titel: titel.slice(0, 200),
      eingabe: form,
      inhalt: art === 'ebook' ? { gliederung, kapitel: kapitelTexte } : { ...einzel, seo },
      status: geprueft ? 'geprueft' : 'entwurf',
      web_slug: slugNeu ?? webSlug,
      aktualisiert_am: new Date().toISOString(),
    };
    const res = aktuelleId
      ? await supabase.from('text_werk').update(zeile).eq('id', aktuelleId).select('id').single()
      : await supabase.from('text_werk').insert(zeile).select('id').single();
    if (res.error) { setFehler(/text_werk/.test(res.error.message) ? 'Speichern noch nicht eingerichtet (SQL von Paket PC fehlt).' : 'Speichern fehlgeschlagen.'); return null; }
    const id = (res.data as { id: string }).id;
    setAktuelleId(id); setMeldung('Gespeichert.'); await ladeListe();
    return id;
  }

  async function alsWebseite() {
    if (!uid || !einzel) return;
    if (!geprueft) { setFehler('Bitte zuerst bestätigen, dass Sie den Text geprüft haben.'); return; }
    setLaeuft('Seite wird angelegt …'); setFehler(null);
    let slug = webSlug || ratgeberSlug(einzel.titel);
    const bloecke = ratgeberBloecke(einzel);
    const jetzt = new Date().toISOString();
    let error: { message: string; code?: string } | null = null;
    if (webSlug) {
      // Bestehende Seite: NUR Inhalt aktualisieren, den Status (live/entwurf) nicht
      // anfassen — sonst ginge ein veröffentlichter Artikel beim Aktualisieren offline.
      ({ error } = await supabase.from('web_seiten').update({ titel: einzel.titel.slice(0, 120), bloecke, aktualisiert_am: jetzt })
        .eq('owner_user_id', uid).eq('slug', slug));
    } else {
      // Neue Seite: niemals eine vorhandene überschreiben. Ist der Name vergeben,
      // wird eine Nummer angehängt (-2, -3 …).
      for (let n = 1; n <= 9; n++) {
        const versuch = n === 1 ? slug : `${slug}-${n}`;
        ({ error } = await supabase.from('web_seiten').insert({
          owner_user_id: uid, titel: einzel.titel.slice(0, 120), slug: versuch, zweck: 'ratgeber', status: 'entwurf',
          ist_startseite: false, bloecke, aktualisiert_am: jetzt,
        }));
        if (!error) { slug = versuch; break; }
        if (error.code !== '23505') break;
      }
    }
    setLaeuft(null);
    if (error) { setFehler('Die Seite konnte nicht angelegt werden.'); return; }
    setWebSlug(slug);
    setMeldung(webSlug ? 'Ratgeber-Seite aktualisiert.' : 'Ratgeber-Seite angelegt (noch nicht öffentlich). Mit „Veröffentlichen" geht sie online.');
    void speichern(slug);
  }

  async function veroeffentlichen(live: boolean) {
    if (!webSlug) return;
    if (live && !geprueft) { setFehler('Bitte zuerst bestätigen, dass Sie den Text geprüft haben.'); return; }
    setLaeuft(live ? 'Wird veröffentlicht …' : 'Wird offline genommen …');
    const r = await fetch('/api/webseite-veroeffentlichen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: webSlug, live }) });
    const j = await r.json().catch(() => ({}));
    setLaeuft(null);
    if (!r.ok) { setFehler(j?.error || 'Veröffentlichen fehlgeschlagen.'); return; }
    setLiveLink(live && j.oeffentlich_id ? `${window.location.origin}/p/${j.oeffentlich_id}` : null);
    setMeldung(live ? 'Der Artikel ist online.' : 'Der Artikel ist offline.');
  }

  function laden(g: Gespeichert) {
    neu(g.art);
    const e = (g.eingabe ?? {}) as Partial<Form>;
    setForm({ ...LEER, ...e });
    const inh = g.inhalt ?? {};
    if (g.art === 'ebook') {
      setGliederung((inh.gliederung as Gliederung) ?? null);
      setKapitelTexte(Array.isArray(inh.kapitel) ? (inh.kapitel as string[]) : []);
    } else {
      setEinzel({ titel: String(inh.titel ?? g.titel), beschreibung: String(inh.beschreibung ?? ''), text: String(inh.text ?? ''), faq: Array.isArray(inh.faq) ? (inh.faq as Einzeltext['faq']) : [] });
      setSeo(Array.isArray(inh.seo) ? (inh.seo as Pruefpunkt[]) : []);
    }
    setAktuelleId(g.id); setWebSlug(g.web_slug); setGeprueft(g.status === 'geprueft');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loeschen(g: Gespeichert) {
    if (!window.confirm(`„${g.titel}" löschen? Eine angelegte Website-Seite bleibt bestehen.`)) return;
    await supabase.from('text_werk').delete().eq('id', g.id);
    if (aktuelleId === g.id) setAktuelleId(null);
    await ladeListe();
  }

  // --- Darstellung ---------------------------------------------------------------

  return (
    <div style={s.page}>
      <div style={s.eyebrow}>ARGONAUT OS · Marketing</div>
      <h1 style={s.h1}>✍️ Text-Werkstatt</h1>
      <p style={s.sub}>
        E-Book, Ratgeber-Artikel, Pressemitteilung oder Strategie — Thema diktieren oder eintippen,
        ARGONAUT schreibt den Entwurf. Zahlen, Namen und Zitate setzt ARGONAUT nie selbst ein, sondern
        lässt Platzhalter in eckigen Klammern stehen. Die füllen Sie aus.
      </p>

      <div style={s.arten}>
        {TEXT_ARTEN.map((a) => (
          <button key={a.art} onClick={() => neu(a.art)} style={{ ...s.art, borderColor: art === a.art ? C.gold : C.border, background: art === a.art ? 'rgba(201,168,76,0.10)' : C.navy2 }}>
            <div style={{ fontSize: 22 }}>{a.icon}</div>
            <div style={{ fontWeight: 800, marginTop: 4 }}>{a.label}</div>
            <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 4, lineHeight: 1.45 }}>{a.beschreibung}</div>
          </button>
        ))}
      </div>

      {/* Eingabe */}
      <div style={s.karte}>
        <label style={s.lab}>Worum geht es?</label>
        <textarea style={s.feld} rows={2} value={form.thema} onChange={(e) => setF('thema', e.target.value)} placeholder={info.beispiel} />
        <Diktat wert={form.thema} onWert={(v) => setF('thema', v)} klein />
        <div style={s.zwei}>
          <div>
            <label style={s.lab}>Für wen ist der Text? (Zielgruppe)</label>
            <input style={s.feld} value={form.zielgruppe} onChange={(e) => setF('zielgruppe', e.target.value)} placeholder="z. B. Hausbesitzer ab 50 im Landkreis Böblingen" />
          </div>
          {art === 'ratgeber' && (
            <div>
              <label style={s.lab}>Schlüsselwort (wonach gesucht wird)</label>
              <input style={s.feld} value={form.keyword} onChange={(e) => setF('keyword', e.target.value)} placeholder="z. B. Wärmepumpe Altbau Kosten" />
            </div>
          )}
          {art === 'strategie' && (
            <div>
              <label style={s.lab}>Strategie für wen?</label>
              <input style={s.feld} value={form.fuerWen} onChange={(e) => setF('fuerWen', e.target.value)} placeholder="unser eigener Betrieb — oder Name und Branche eines anderen" />
            </div>
          )}
          {art === 'ebook' && (
            <div>
              <label style={s.lab}>Wie viele Kapitel?</label>
              <select style={s.feld} value={form.kapitelZahl} onChange={(e) => setF('kapitelZahl', Number(e.target.value))}>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} Kapitel</option>)}
              </select>
            </div>
          )}
        </div>
        <label style={s.lab}>Was unbedingt hinein soll (Stichpunkte oder einfach drauflos erzählen)</label>
        <textarea style={s.feld} rows={4} value={form.stichpunkte} onChange={(e) => setF('stichpunkte', e.target.value)} placeholder="Erfahrungen, typische Kundenfragen, Besonderheiten Ihres Betriebs …" />
        <Diktat wert={form.stichpunkte} onWert={(v) => setF('stichpunkte', v)} klein label="Erzählen" />

        <div style={{ marginTop: 14 }}>
          {art === 'ebook'
            ? <button style={{ ...s.primaer, opacity: laeuft ? 0.55 : 1 }} disabled={!!laeuft} onClick={() => void gliederungErstellen()}>{gliederung ? '↻ Neue Gliederung' : '① Gliederung erstellen'}</button>
            : <button style={{ ...s.primaer, opacity: laeuft ? 0.55 : 1 }} disabled={!!laeuft} onClick={() => void einzelErstellen()}>{einzel ? '↻ Neu schreiben' : `${info.icon} ${info.label} schreiben`}</button>}
        </div>
      </div>

      {laeuft && <div style={s.lauf}>⏳ {laeuft}</div>}
      {fehler && <div style={s.err}>{fehler}</div>}
      {meldung && <div style={s.ok}>{meldung}</div>}

      {/* E-Book: Gliederung + Kapitel */}
      {art === 'ebook' && gliederung && (
        <div style={s.karte}>
          <label style={s.lab}>Titel</label>
          <input style={{ ...s.feld, fontWeight: 800, fontSize: 18 }} value={gliederung.titel} onChange={(e) => setGliederung({ ...gliederung, titel: e.target.value })} />
          <label style={s.lab}>Untertitel</label>
          <input style={s.feld} value={gliederung.untertitel} onChange={(e) => setGliederung({ ...gliederung, untertitel: e.target.value })} />
          {gliederung.kapitel.map((k, i) => (
            <div key={i} style={s.kapitel}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: C.gold, fontWeight: 800 }}>{i + 1}.</span>
                <input style={{ ...s.feld, marginTop: 0 }} value={k.titel} onChange={(e) => {
                  const kap = [...gliederung.kapitel]; kap[i] = { ...k, titel: e.target.value }; setGliederung({ ...gliederung, kapitel: kap });
                }} />
                {kapitelTexte[i] && <button style={s.mini} disabled={!!laeuft} onClick={() => void kapitelSchreiben(i)}>↻</button>}
              </div>
              {kapitelTexte[i]
                ? <textarea style={{ ...s.feld, fontSize: 14 }} rows={10} value={kapitelTexte[i]} onChange={(e) => { const t = [...kapitelTexte]; t[i] = e.target.value; setKapitelTexte(t); }} />
                : <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>{k.punkte.join(' · ')}</div>}
            </div>
          ))}
          {!kapitelTexte.every((t) => t.trim()) && (
            <button style={{ ...s.primaer, marginTop: 14, opacity: laeuft ? 0.55 : 1 }} disabled={!!laeuft} onClick={() => void kapitelSchreiben()}>
              ② {kapitelTexte.some((t) => t.trim()) ? 'Fehlende Kapitel schreiben' : 'Alle Kapitel schreiben'}
            </button>
          )}
        </div>
      )}

      {/* Einzeltext */}
      {art !== 'ebook' && einzel && (
        <div style={s.karte}>
          <label style={s.lab}>Titel</label>
          <input style={{ ...s.feld, fontWeight: 800, fontSize: 18 }} value={einzel.titel} onChange={(e) => setEinzel({ ...einzel, titel: e.target.value })} />
          {(art === 'ratgeber' || art === 'presse') && (
            <>
              <label style={s.lab}>{art === 'ratgeber' ? `Beschreibung für Google (${einzel.beschreibung.length} Zeichen, gut: 120–155)` : 'Unterzeile'}</label>
              <textarea style={s.feld} rows={2} value={einzel.beschreibung} onChange={(e) => setEinzel({ ...einzel, beschreibung: e.target.value })} />
            </>
          )}
          <label style={s.lab}>Text</label>
          <textarea style={{ ...s.feld, fontSize: 14 }} rows={22} value={einzel.text} onChange={(e) => setEinzel({ ...einzel, text: e.target.value })} />
          {einzel.faq.length > 0 && (
            <>
              <label style={s.lab}>Fragen & Antworten</label>
              {einzel.faq.map((f, i) => (
                <div key={i} style={{ marginTop: 6 }}>
                  <input style={{ ...s.feld, fontWeight: 700 }} value={f.frage} onChange={(e) => { const faq = [...einzel.faq]; faq[i] = { ...f, frage: e.target.value }; setEinzel({ ...einzel, faq }); }} />
                  <textarea style={s.feld} rows={2} value={f.antwort} onChange={(e) => { const faq = [...einzel.faq]; faq[i] = { ...f, antwort: e.target.value }; setEinzel({ ...einzel, faq }); }} />
                </div>
              ))}
            </>
          )}
          {seo.length > 0 && (
            <div style={s.pruef}>
              <b>SEO-Prüfung</b>
              {seo.map((p, i) => <div key={i} style={{ color: p.ok ? C.green : C.warn, fontSize: 13.5, marginTop: 3 }}>{p.ok ? '✓' : '!'} {p.text}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Prüfen + Weiterverwenden */}
      {fertig && (
        <div style={s.karte}>
          {hinweise.length > 0 && (
            <ul style={s.hinweise}>{hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>
          )}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5, marginTop: 6 }}>
            <input type="checkbox" checked={geprueft} onChange={(e) => setGeprueft(e.target.checked)} style={{ marginTop: 4 }} />
            <span>
              Ich habe den Text gelesen, die Angaben geprüft und alle Platzhalter ersetzt. Ich verantworte die Veröffentlichung.
              {offen.length > 0 && <b style={{ color: C.warn }}> (Noch {offen.length} Platzhalter offen.)</b>}
            </span>
          </label>
          <div style={s.knoepfe}>
            <button style={s.primaer} disabled={!!laeuft} onClick={() => void speichern()}>💾 Speichern</button>
            <button style={s.mini} disabled={!!laeuft} onClick={() => void pdf()}>📄 PDF</button>
            <button style={s.mini} onClick={() => { try { void navigator.clipboard.writeText(gesamtText); setMeldung('Text kopiert.'); } catch { /* egal */ } }}>📋 Kopieren</button>
            {art === 'ebook' && <a href="/dashboard/marketing/freebies" style={s.mini}>🎁 Zum Freebie-Baukasten</a>}
            {art === 'ratgeber' && <button style={s.mini} disabled={!!laeuft || !geprueft} onClick={() => void alsWebseite()}>{webSlug ? '🌐 Seite aktualisieren' : '🌐 Als Ratgeber-Seite anlegen'}</button>}
            {art === 'ratgeber' && webSlug && (
              <>
                <button style={s.mini} disabled={!!laeuft || !geprueft} onClick={() => void veroeffentlichen(true)}>🚀 Veröffentlichen</button>
                <button style={s.mini} disabled={!!laeuft} onClick={() => void veroeffentlichen(false)}>Offline nehmen</button>
              </>
            )}
          </div>
          {liveLink && <div style={{ marginTop: 10, fontSize: 14 }}>Online unter: <a href={liveLink} target="_blank" rel="noreferrer" style={{ color: C.cyan }}>{liveLink}</a></div>}
          {art === 'ratgeber' && webSlug && <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 8 }}>Die Seite liegt im Website-Bauer unter „{webSlug}". Änderungen am Text hier übernehmen Sie mit „Seite aktualisieren".</div>}
        </div>
      )}

      {/* Gespeicherte Texte */}
      <h2 style={s.h2}>Gespeicherte Texte</h2>
      {listeHinweis && <div style={s.hint}>{listeHinweis}</div>}
      {!listeHinweis && liste.length === 0 && <div style={s.hint}>Noch nichts gespeichert.</div>}
      {liste.map((g) => {
        const a = artInfo(g.art);
        return (
          <div key={g.id} style={s.zeile}>
            <span style={{ fontSize: 20 }}>{a?.icon}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{g.titel}</div>
              <div style={{ color: C.textDim, fontSize: 12.5 }}>
                {a?.label} · {new Date(g.aktualisiert_am).toLocaleDateString('de-DE')} · {g.status === 'geprueft' ? '✓ geprüft' : 'Entwurf'}{g.web_slug ? ' · auf der Website' : ''}
              </div>
            </div>
            <button style={s.mini} onClick={() => laden(g)}>Öffnen</button>
            <button style={{ ...s.mini, color: C.textDim }} onClick={() => void loeschen(g)}>Löschen</button>
          </div>
        );
      })}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 1000, margin: '0 auto' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  h2: { fontSize: 'clamp(20px, 1.8vw, 28px)', fontWeight: 800, margin: '28px 0 10px' },
  sub: { color: C.textDim, margin: '8px 0 18px', fontSize: 'clamp(14px, 1.25vw, 19px)', maxWidth: 820, lineHeight: 1.5 },
  arten: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 16 },
  art: { textAlign: 'left', color: C.text, border: '1px solid', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit' },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 22px', marginBottom: 16 },
  lab: { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginTop: 12 },
  feld: { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical' },
  zwei: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 },
  kapitel: { borderTop: `1px solid ${C.border}`, marginTop: 14, paddingTop: 12 },
  pruef: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginTop: 14 },
  hinweise: { color: C.warn, fontSize: 13.5, lineHeight: 1.55, margin: '0 0 8px', paddingLeft: 18 },
  knoepfe: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 },
  zeile: { display: 'flex', gap: 12, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginTop: 8 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 13px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' },
  lauf: { color: C.cyan, fontSize: 14.5, margin: '0 0 12px' },
  hint: { color: C.textDim, fontSize: 14.5, padding: '8px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '12px 14px', margin: '0 0 12px' },
  ok: { color: C.green, fontSize: 14, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.35)', borderRadius: 10, padding: '12px 14px', margin: '0 0 12px' },
};
