'use client';

// ============================================================
// ARGONAUT OS · Paket PN · Kunden-Portal plus — Verwaltung (Dashboard)
// Je Kunde mit Portal-Link festlegen, was er zusätzlich sieht:
//   Projekte (Fortschritt aus Aufgaben oder eigener Meldung), Meldungen,
//   ausgewählte Baustellen-Fotos, Dokumente, Freigaben zum Anklicken.
// „Monteur ist unterwegs" kommt automatisch aus den Einsätzen mit der
// E-Mail-Adresse des Kunden (ohne Standort, ohne Mitarbeiternamen).
// Logik: lib/kundenPortalPlus.ts (getestet). RLS: pn-kundenportal-plus.sql.
// Unterpfad von /dashboard/portal (erbt die Freigabe „kundenportal").
// Pfad: app/dashboard/portal/baustelle/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties, ChangeEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Diktat from '../../_components/Diktat';
import {
  pruefeNeueFreigabe, leseProzent, fortschrittAus, pruefeDokument, dokPfad, DOK_BUCKET, FREIGABE_LABEL,
  freigabeStatusFuer, fristAbgelaufen,
} from '@/lib/kundenPortalPlus';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Kontakt = { id: string; anzeigename: string | null; vorname: string | null; nachname: string | null; name: string | null; email: string | null };
type Zugang = { kontakt_id: string; token: string; aktiv: boolean };
type Projekt = { id: string; name: string | null };
type Meldung = { id: string; projekt_id: string | null; text: string; fortschritt: number | null; erstellt_am: string };
type Dok = { id: string; titel: string; dateiname: string | null; pfad: string; erstellt_am: string };
type Freigabe = { id: string; titel: string; text: string; frist: string | null; status: string; antwort_name: string | null; antwort_kommentar: string | null; beantwortet_am: string | null; erstellt_am: string };
type Foto = { id: string; pfad: string; fuer_kunde: boolean; bautagebuch_id: string; erstellt_am: string };

function kontaktName(k: Kontakt): string {
  if (k.anzeigename && k.anzeigename.trim()) return k.anzeigename.trim();
  const vn = `${k.vorname || ''} ${k.nachname || ''}`.trim();
  return vn || (k.name || '').trim() || (k.email || '(ohne Namen)').trim();
}
function datumDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = iso.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function heuteIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const feld: CSSProperties = { width: '100%', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box' };
const knopf = (farbe: string, voll = false): CSSProperties => ({
  background: voll ? farbe : 'transparent', color: voll ? C.navy : farbe, border: `1px solid ${farbe}`,
  borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
});

export default function PortalBaustelleVerwaltung() {
  const [uid, setUid] = useState<string | null>(null);
  const [istMitarbeiter, setIstMitarbeiter] = useState(false);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [zugaenge, setZugaenge] = useState<Record<string, Zugang>>({});
  const [kontaktId, setKontaktId] = useState<string>('');
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [verknuepft, setVerknuepft] = useState<string[]>([]);
  const [aufgaben, setAufgaben] = useState<{ projekt_id: string; erledigt: boolean | null; status: string | null }[]>([]);
  const [meldungen, setMeldungen] = useState<Meldung[]>([]);
  const [doks, setDoks] = useState<Dok[]>([]);
  const [freigaben, setFreigaben] = useState<Freigabe[]>([]);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [neuM, setNeuM] = useState({ projekt_id: '', text: '', prozent: '' });
  const [neuF, setNeuF] = useState({ titel: '', text: '', frist: '', projekt_id: '' });
  const [dokTitel, setDokTitel] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sqlFehlt, setSqlFehlt] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setUid(id);
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstMitarbeiter(!!chef && chef !== id);
      const [{ data: kd }, { data: zd }, { data: pd }] = await Promise.all([
        supabase.from('kontakte').select('id, anzeigename, vorname, nachname, name, email'),
        supabase.from('portal_zugaenge').select('kontakt_id, token, aktiv'),
        supabase.from('projekte').select('id, name').eq('archiviert', false),
      ]);
      const map: Record<string, Zugang> = {};
      for (const z of (zd as Zugang[]) ?? []) map[z.kontakt_id] = z;
      setZugaenge(map);
      setKontakte(((kd as Kontakt[]) ?? []).filter((k) => map[k.id]?.aktiv).sort((a, b) => kontaktName(a).localeCompare(kontaktName(b), 'de')));
      setProjekte((pd as Projekt[]) ?? []);
      try {
        const q = new URLSearchParams(window.location.search).get('kontakt');
        if (q && map[q]) setKontaktId(q);
      } catch { /* egal */ }
    })();
  }, []);

  const laden = useCallback(async () => {
    if (!kontaktId) return;
    setFehler(null);
    const [pp, m, d, f] = await Promise.all([
      supabase.from('portal_projekt').select('projekt_id').eq('kontakt_id', kontaktId),
      supabase.from('portal_meldung').select('id, projekt_id, text, fortschritt, erstellt_am').eq('kontakt_id', kontaktId).order('erstellt_am', { ascending: false }).limit(100),
      supabase.from('portal_dokument').select('id, titel, dateiname, pfad, erstellt_am').eq('kontakt_id', kontaktId).order('erstellt_am', { ascending: false }),
      supabase.from('portal_freigabe').select('*').eq('kontakt_id', kontaktId).order('erstellt_am', { ascending: false }),
    ]);
    if (pp.error) { if (/portal_projekt/.test(pp.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen.'); return; }
    const ids = ((pp.data as { projekt_id: string }[]) ?? []).map((x) => x.projekt_id);
    setVerknuepft(ids);
    setMeldungen((m.data as Meldung[]) ?? []);
    setDoks((d.data as Dok[]) ?? []);
    setFreigaben((f.data as Freigabe[]) ?? []);
    if (ids.length) {
      const [{ data: a }, { data: b }] = await Promise.all([
        supabase.from('aufgaben').select('projekt_id, erledigt, status').in('projekt_id', ids),
        supabase.from('bautagebuch').select('id').in('projekt_id', ids),
      ]);
      setAufgaben((a as typeof aufgaben) ?? []);
      const tIds = ((b as { id: string }[]) ?? []).map((x) => x.id);
      if (tIds.length) {
        const { data: fo } = await supabase.from('baustellen_fotos').select('id, pfad, fuer_kunde, bautagebuch_id, erstellt_am').in('bautagebuch_id', tIds).order('erstellt_am', { ascending: false }).limit(120);
        const liste = (fo as Foto[]) ?? [];
        setFotos(liste);
        const fehlend = liste.map((x) => x.pfad).filter((p) => p);
        if (fehlend.length) {
          const { data: s } = await supabase.storage.from('baustellen-fotos').createSignedUrls(fehlend, 3600);
          const u: Record<string, string> = {};
          for (const x of s ?? []) if (x.path && x.signedUrl) u[x.path] = x.signedUrl;
          setFotoUrls(u);
        }
      } else setFotos([]);
    } else { setAufgaben([]); setFotos([]); }
  }, [kontaktId]);

  useEffect(() => { void laden(); }, [laden]);

  const kontakt = useMemo(() => kontakte.find((k) => k.id === kontaktId) ?? null, [kontakte, kontaktId]);
  const portalUrl = kontaktId && zugaenge[kontaktId] && typeof window !== 'undefined' ? `${window.location.origin}/portal/${zugaenge[kontaktId].token}` : null;

  function meldung(t: string) { setOk(t); setFehler(null); }

  async function projektUmschalten(pid: string) {
    if (!uid) return;
    setBusy(true);
    const drin = verknuepft.includes(pid);
    const r = drin
      ? await supabase.from('portal_projekt').delete().eq('kontakt_id', kontaktId).eq('projekt_id', pid)
      : await supabase.from('portal_projekt').insert({ owner_user_id: uid, kontakt_id: kontaktId, projekt_id: pid });
    setBusy(false);
    if (r.error) { setFehler('Das hat nicht geklappt (nur der Inhaber darf das Portal einrichten).'); return; }
    meldung(drin ? 'Projekt im Portal ausgeblendet.' : 'Projekt im Portal sichtbar.');
    await laden();
  }

  async function meldungSpeichern() {
    if (!uid) return;
    const text = neuM.text.trim();
    if (text.length < 3) { setFehler('Bitte eine Nachricht an den Kunden schreiben.'); return; }
    const prozent = leseProzent(neuM.prozent);
    if (neuM.prozent.trim() && prozent === null) { setFehler('Der Fortschritt muss zwischen 0 und 100 liegen.'); return; }
    setBusy(true);
    const { error } = await supabase.from('portal_meldung').insert({ owner_user_id: uid, kontakt_id: kontaktId, projekt_id: neuM.projekt_id || null, text: text.slice(0, 4000), fortschritt: prozent });
    setBusy(false);
    if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
    setNeuM({ projekt_id: neuM.projekt_id, text: '', prozent: '' });
    meldung('Meldung steht jetzt im Portal.');
    await laden();
  }

  async function meldungLoeschen(m: Meldung) {
    const { error } = await supabase.from('portal_meldung').delete().eq('id', m.id);
    if (error) setFehler('Löschen fehlgeschlagen.'); else await laden();
  }

  async function fotoUmschalten(f: Foto) {
    const { error } = await supabase.from('baustellen_fotos').update({ fuer_kunde: !f.fuer_kunde }).eq('id', f.id);
    if (error) { setFehler('Das Foto konnte nicht umgestellt werden.'); return; }
    setFotos((l) => l.map((x) => (x.id === f.id ? { ...x, fuer_kunde: !f.fuer_kunde } : x)));
  }

  async function dokHochladen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !uid) return;
    const f = pruefeDokument(file.name, file.size);
    if (f) { setFehler(f); return; }
    setBusy(true);
    const id = crypto.randomUUID();
    const pfad = dokPfad(uid, kontaktId, id, file.name);
    const up = await supabase.storage.from(DOK_BUCKET).upload(pfad, file, { upsert: false });
    if (up.error) { setBusy(false); setFehler('Hochladen fehlgeschlagen.'); return; }
    const { error } = await supabase.from('portal_dokument').insert({
      id, owner_user_id: uid, kontakt_id: kontaktId, titel: (dokTitel.trim() || file.name).slice(0, 160), dateiname: file.name.slice(0, 200), pfad, groesse: file.size,
    });
    setBusy(false);
    if (error) { await supabase.storage.from(DOK_BUCKET).remove([pfad]); setFehler('Speichern fehlgeschlagen.'); return; }
    setDokTitel('');
    meldung('Dokument steht jetzt im Portal.');
    await laden();
  }

  async function dokLoeschen(d: Dok) {
    const { error } = await supabase.from('portal_dokument').delete().eq('id', d.id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    await supabase.storage.from(DOK_BUCKET).remove([d.pfad]);
    await laden();
  }

  async function freigabeAnlegen() {
    if (!uid) return;
    const p = pruefeNeueFreigabe(neuF, heuteIso());
    if (p.fehler) { setFehler(p.fehler); return; }
    setBusy(true);
    const { error } = await supabase.from('portal_freigabe').insert({ owner_user_id: uid, kontakt_id: kontaktId, projekt_id: neuF.projekt_id || null, titel: p.titel, text: p.text, frist: p.frist });
    setBusy(false);
    if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
    setNeuF({ titel: '', text: '', frist: '', projekt_id: '' });
    meldung('Freigabe steht im Portal. Schicken Sie dem Kunden den Portal-Link.');
    await laden();
  }

  async function zurueckziehen(f: Freigabe) {
    const { error } = await supabase.from('portal_freigabe').update({ status: 'zurueckgezogen' }).eq('id', f.id).eq('status', 'offen');
    if (error) setFehler('Das hat nicht geklappt.'); else await laden();
  }

  if (sqlFehlt) {
    return <div style={{ padding: 24, color: C.text }}><div style={{ ...karte, borderColor: C.warn, color: C.warn }}>Dieser Bereich ist noch nicht eingerichtet (SQL von Paket PN fehlt).</div></div>;
  }

  const projektName = (id: string | null) => (id ? projekte.find((p) => p.id === id)?.name || 'Projekt' : 'Allgemein');

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 28px)', color: C.text, maxWidth: 1100, margin: '0 auto' }}>
      <a href="/dashboard/portal" style={{ color: C.cyan, textDecoration: 'none', fontSize: 14 }}>← Kunden-Portal</a>
      <h1 style={{ color: C.gold, margin: '8px 0 4px' }}>🏗 Portal plus: Baufortschritt, Fotos, Dokumente, Freigaben</h1>
      <p style={{ color: C.textDim, margin: '0 0 16px' }}>
        Was Sie hier einstellen, sieht der Kunde zusätzlich in seinem Portal-Link. Nichts erscheint automatisch — nur freigeschaltete Projekte, angehakte Fotos und Ihre Meldungen.
        „Ihr Monteur ist unterwegs" kommt von selbst aus den Einsätzen mit seiner E-Mail-Adresse (ohne Standort, ohne Namen).
      </p>
      {istMitarbeiter && <div style={{ ...karte, borderColor: C.warn, color: C.warn }}>Nur der Inhaber kann das Portal einrichten. Sie sehen den Stand.</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      <div style={karte}>
        <strong>Kunde</strong>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          <select value={kontaktId} onChange={(e) => { setKontaktId(e.target.value); setOk(null); }} style={{ ...feld, width: 'auto', minWidth: 260 }}>
            <option value="">— Kunden mit Portal-Link wählen —</option>
            {kontakte.map((k) => <option key={k.id} value={k.id}>{kontaktName(k)}</option>)}
          </select>
          {portalUrl && <a href={portalUrl} target="_blank" rel="noreferrer" style={{ color: C.cyan }}>Portal ansehen ↗</a>}
        </div>
        {kontakte.length === 0 && <div style={{ color: C.textDim, fontSize: 14, marginTop: 8 }}>Noch kein Kunde mit aktivem Portal-Link — Links erstellen Sie unter „Kunden-Portal".</div>}
        {kontakt && !kontakt.email && <div style={{ color: C.warn, fontSize: 14, marginTop: 8 }}>Dieser Kunde hat keine E-Mail-Adresse — der Monteur-Status kann nicht zugeordnet werden.</div>}
      </div>

      {kontaktId && (
        <>
          <div style={karte}>
            <strong>Projekte im Portal</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {projekte.length === 0 && <div style={{ color: C.textDim }}>Keine aktiven Projekte.</div>}
              {projekte.map((p) => {
                const an = verknuepft.includes(p.id);
                const fs = fortschrittAus(aufgaben.filter((a) => a.projekt_id === p.id)).pct;
                return (
                  <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: istMitarbeiter ? 'default' : 'pointer' }}>
                    <input type="checkbox" checked={an} disabled={busy || istMitarbeiter} onChange={() => projektUmschalten(p.id)} />
                    <span>{p.name || 'Projekt'}</span>
                    {an && <span style={{ color: C.textDim, fontSize: 13 }}>· Fortschritt aus Aufgaben: {fs === null ? 'keine Aufgaben' : `${fs} %`}</span>}
                  </label>
                );
              })}
            </div>
          </div>

          <div style={karte}>
            <strong>Neue Meldung an den Kunden</strong>
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              <select value={neuM.projekt_id} onChange={(e) => setNeuM({ ...neuM, projekt_id: e.target.value })} style={feld}>
                <option value="">Allgemein (ohne Projekt)</option>
                {verknuepft.map((id) => <option key={id} value={id}>{projektName(id)}</option>)}
              </select>
              <textarea value={neuM.text} onChange={(e) => setNeuM({ ...neuM, text: e.target.value })} rows={3} style={feld} placeholder="z. B. Estrich ist fertig, ab Montag verlegen wir die Fliesen." />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Diktat wert={neuM.text} onWert={(t) => setNeuM((m) => ({ ...m, text: t }))} klein />
                <input value={neuM.prozent} onChange={(e) => setNeuM({ ...neuM, prozent: e.target.value })} placeholder="Fortschritt in % (optional)" style={{ ...feld, width: 220 }} />
                <button style={knopf(C.gold, true)} disabled={busy || istMitarbeiter} onClick={meldungSpeichern}>Ins Portal stellen</button>
              </div>
            </div>
            {meldungen.length > 0 && (
              <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                {meldungen.slice(0, 20).map((m) => (
                  <div key={m.id} style={{ borderLeft: `3px solid ${C.gold}`, paddingLeft: 10, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ color: C.textDim, fontSize: 12 }}>{datumDe(m.erstellt_am)} · {projektName(m.projekt_id)}{m.fortschritt !== null ? ` · ${m.fortschritt} %` : ''}</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                    </div>
                    {!istMitarbeiter && <button style={{ ...knopf(C.textDim), padding: '2px 8px', fontSize: 12 }} onClick={() => meldungLoeschen(m)}>Entfernen</button>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={karte}>
            <strong>Baustellen-Fotos für den Kunden</strong>
            <div style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>Aus dem Bautagebuch der freigeschalteten Projekte. Nur angehakte Fotos sieht der Kunde.</div>
            {fotos.length === 0 ? (
              <div style={{ color: C.textDim, marginTop: 8 }}>{verknuepft.length ? 'Noch keine Fotos im Bautagebuch dieser Projekte.' : 'Erst ein Projekt freischalten.'}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginTop: 8 }}>
                {fotos.map((f) => (
                  <label key={f.id} style={{ position: 'relative', cursor: istMitarbeiter ? 'default' : 'pointer', border: `2px solid ${f.fuer_kunde ? C.green : C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                    {fotoUrls[f.pfad]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={fotoUrls[f.pfad]} alt="" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ aspectRatio: '1 / 1', background: C.navy }} />}
                    <span style={{ position: 'absolute', left: 6, top: 6, background: C.navy, borderRadius: 6, padding: '2px 6px', fontSize: 12 }}>
                      <input type="checkbox" checked={f.fuer_kunde} disabled={istMitarbeiter} onChange={() => fotoUmschalten(f)} style={{ marginRight: 4 }} />
                      {f.fuer_kunde ? 'sichtbar' : 'intern'}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={karte}>
            <strong>Dokumente für den Kunden</strong>
            {!istMitarbeiter && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                <input value={dokTitel} onChange={(e) => setDokTitel(e.target.value)} placeholder="Titel (optional), z. B. Farbkonzept" style={{ ...feld, width: 280 }} />
                <label style={{ ...knopf(C.cyan), display: 'inline-block' }}>
                  Datei wählen (PDF, Bild, Word, Excel · max. 20 MB)
                  <input type="file" onChange={dokHochladen} style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx" />
                </label>
              </div>
            )}
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              {doks.length === 0 && <div style={{ color: C.textDim }}>Keine Dokumente im Portal.</div>}
              {doks.map((d) => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{d.titel} <span style={{ color: C.textDim, fontSize: 12 }}>· {datumDe(d.erstellt_am)}</span></span>
                  {!istMitarbeiter && <button style={{ ...knopf(C.textDim), padding: '2px 8px', fontSize: 12 }} onClick={() => dokLoeschen(d)}>Entfernen</button>}
                </div>
              ))}
            </div>
          </div>

          <div style={karte}>
            <strong>Freigaben</strong>
            <div style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>
              Der Kunde entscheidet im Portal mit Namen, bei Ablehnung mit Grund. Das ist ein Nachweis in Textform — für Verträge und Nachträge mit Geldfolge zusätzlich schriftlich bestätigen lassen.
            </div>
            {!istMitarbeiter && (
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <input value={neuF.titel} onChange={(e) => setNeuF({ ...neuF, titel: e.target.value })} placeholder="Titel, z. B. Fliesenmuster Bad" style={feld} maxLength={160} />
                <textarea value={neuF.text} onChange={(e) => setNeuF({ ...neuF, text: e.target.value })} rows={3} placeholder="Was genau soll der Kunde freigeben?" style={feld} maxLength={4000} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select value={neuF.projekt_id} onChange={(e) => setNeuF({ ...neuF, projekt_id: e.target.value })} style={{ ...feld, width: 'auto' }}>
                    <option value="">ohne Projekt</option>
                    {verknuepft.map((id) => <option key={id} value={id}>{projektName(id)}</option>)}
                  </select>
                  <label style={{ color: C.textDim, fontSize: 14 }}>Antwort bis <input type="date" value={neuF.frist} onChange={(e) => setNeuF({ ...neuF, frist: e.target.value })} style={{ ...feld, width: 'auto' }} /></label>
                  <button style={knopf(C.gold, true)} disabled={busy} onClick={freigabeAnlegen}>Freigabe anfragen</button>
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {freigaben.length === 0 && <div style={{ color: C.textDim }}>Noch keine Freigaben.</div>}
              {freigaben.map((f) => {
                const st = freigabeStatusFuer(f.status);
                const farbe = st === 'freigegeben' ? C.green : st === 'abgelehnt' ? C.danger : st === 'offen' ? C.warn : C.textDim;
                return (
                  <div key={f.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <strong>{f.titel}</strong>
                      <span style={{ color: farbe, fontSize: 14 }}>{st === 'offen' ? 'offen' : FREIGABE_LABEL[st]}{st === 'offen' && fristAbgelaufen(f.frist, heuteIso()) ? ' · Frist abgelaufen' : ''}</span>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', color: C.textDim, fontSize: 14, marginTop: 4 }}>{f.text}</div>
                    {f.beantwortet_am && (
                      <div style={{ marginTop: 6, fontSize: 14 }}>
                        {f.antwort_name} · {datumDe(f.beantwortet_am)}{f.antwort_kommentar ? ` · „${f.antwort_kommentar}"` : ''}
                      </div>
                    )}
                    {st === 'offen' && !istMitarbeiter && (
                      <button style={{ ...knopf(C.textDim), padding: '2px 8px', fontSize: 12, marginTop: 6 }} onClick={() => zurueckziehen(f)}>Zurückziehen</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
