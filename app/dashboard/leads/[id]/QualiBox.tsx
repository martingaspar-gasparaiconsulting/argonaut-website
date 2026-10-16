'use client'

// ARGONAUT OS · Paket VK2 (16.10.2026) — Qualifizierung und Übergabe am Lead.
// Bogen wählen, Fragen beantworten, dann: „Passt → an Closer übergeben" (Glocke beim
// Closer, Datenbank p408) oder „Passt nicht" mit Grund (Lead → verloren, Nachfassen stoppt).
// Spickzettel fürs Gespräch: /dashboard/leads/<id>/spickzettel. Logik: lib/qualifizierung.ts.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import {
  bogenFragen, antwortenBereinigen, ergebnisPruefen, GRUENDE, ERGEBNIS_TEXT, grundText,
  type Antworten, type Ergebnis, type Frage,
} from '@/lib/qualifizierung'
import { auswahl, personName, type Person } from '@/lib/verkaufsteam'
import { feldwerteFuerStufe } from '@/lib/leadStufen'
import { stoppWerte } from '@/lib/leadNachfass'
import { nichtsGeschrieben } from '@/lib/speichernPruefen'
import { istModus, waehleCloser, belegung, letzteZuteilung, regelnBereinigen, type Closer, type Termin } from '@/lib/terminVerteilung'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
)

type Bogen = { id: string; name: string; angebot: string | null; mit_standard: boolean; fragen: unknown }
type Quali = { id: string; bogen_id: string | null; antworten: Record<string, unknown>; ergebnis: Ergebnis; grund: string | null; grund_text: string | null; aktualisiert_am: string }
type Uebergabe = { id: string; an_user_id: string; von_user_id: string | null; notiz: string | null; erstellt_am: string }

const box = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '18px 24px', marginBottom: '24px', display: 'grid', gap: '12px' }
const feld = { background: '#0F2036', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '9px 12px', fontFamily: 'inherit', fontSize: '15px', width: '100%', boxSizing: 'border-box' as const }
const label = { fontSize: '13px', color: 'rgba(255,255,255,0.7)', display: 'grid', gap: '6px' }
const kopf = { fontSize: '12px', color: '#C9A84C', letterSpacing: '0.12em', textTransform: 'uppercase' as const, fontWeight: 700 }
const knopf = (farbe: string, voll = false) => ({ background: voll ? farbe : 'transparent', color: voll ? '#0A1628' : farbe, border: `1px solid ${farbe}`, borderRadius: '10px', padding: '9px 14px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' })

function zeit(t: string): string {
  try { return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t)) } catch { return t }
}

export default function QualiBox({ leadId, team, ich, nachfassAktiv }: { leadId: string; team: Person[]; ich: string | null; nachfassAktiv: boolean }) {
  const router = useRouter()
  const [boegen, setBoegen] = useState<Bogen[]>([])
  const [quali, setQuali] = useState<Quali | null>(null)
  const [uebergaben, setUebergaben] = useState<Uebergabe[]>([])
  const [bogenId, setBogenId] = useState('')
  const [antworten, setAntworten] = useState<Antworten>({})
  const [modus, setModus] = useState<'' | 'passt' | 'passt_nicht'>('')
  const [closer, setCloser] = useState('')
  const [notiz, setNotiz] = useState('')
  const [grund, setGrund] = useState('')
  const [grundFrei, setGrundFrei] = useState('')
  const [sqlFehlt, setSqlFehlt] = useState(false)
  const [busy, setBusy] = useState(false)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const [offen, setOffen] = useState(false)

  const laden = useCallback(async () => {
    const [b, q, u] = await Promise.all([
      supabase.from('vk_bogen').select('id, name, angebot, mit_standard, fragen').eq('aktiv', true).order('name'),
      supabase.from('lead_qualifizierung').select('id, bogen_id, antworten, ergebnis, grund, grund_text, aktualisiert_am').eq('lead_id', leadId).maybeSingle(),
      supabase.from('vk_uebergabe').select('id, an_user_id, von_user_id, notiz, erstellt_am').eq('lead_id', leadId).order('erstellt_am', { ascending: false }).limit(10),
    ])
    if (q.error && /lead_qualifizierung/.test(q.error.message)) { setSqlFehlt(true); return }
    setBoegen((b.data as Bogen[]) ?? [])
    const qq = (q.data as Quali | null) ?? null
    setQuali(qq)
    setUebergaben((u.data as Uebergabe[]) ?? [])
    if (qq) {
      setBogenId(qq.bogen_id ?? '')
      setAntworten(Object.fromEntries(Object.entries(qq.antworten ?? {}).map(([k, v]) => [k, String(v ?? '')])))
    }
    setOffen(!qq || qq.ergebnis === 'offen')
  }, [leadId])
  useEffect(() => { void laden() }, [laden])

  const bogen = boegen.find((x) => x.id === bogenId) ?? null
  const fragen: Frage[] = useMemo(() => bogenFragen(bogen?.fragen ?? [], bogen ? bogen.mit_standard : true), [bogen])
  const closerListe = auswahl(team, 'closer', closer || null)
  const closerIds = closerListe.map((p) => p.user_id)

  async function quali_speichern(ergebnis: Ergebnis, extra: { grund?: string | null; grund_text?: string | null } = {}): Promise<boolean> {
    const zeile = {
      lead_id: leadId, bogen_id: bogenId || null, antworten: antwortenBereinigen(fragen, antworten),
      ergebnis, grund: ergebnis === 'passt_nicht' ? (extra.grund ?? null) : null,
      grund_text: ergebnis === 'passt_nicht' ? ((extra.grund_text ?? '').trim() || null) : null,
    }
    const res = quali
      ? await supabase.from('lead_qualifizierung').update(zeile).eq('id', quali.id).select('id')
      : await supabase.from('lead_qualifizierung').insert(zeile).select('id')
    if (res.error) {
      setMeldung({ ok: false, text: /gehört nicht/.test(res.error.message) ? res.error.message : /lead_qualifizierung/.test(res.error.message) ? 'Noch nicht eingerichtet (SQL von Paket VK2 fehlt).' : 'Nicht gespeichert — dafür ist das Schreibrecht „Leads" nötig.' })
      return false
    }
    if (nichtsGeschrieben(res.data)) { setMeldung({ ok: false, text: 'Nicht gespeichert — dafür ist das Schreibrecht „Leads" nötig.' }); return false }
    return true
  }

  async function zwischenspeichern() {
    setBusy(true); setMeldung(null)
    try {
      if (await quali_speichern(quali?.ergebnis === 'offen' || !quali ? 'offen' : quali.ergebnis, { grund: quali?.grund, grund_text: quali?.grund_text })) {
        setMeldung({ ok: true, text: 'Antworten gespeichert.' }); await laden()
      }
    } finally { setBusy(false) }
  }

  async function uebergeben() {
    const a = antwortenBereinigen(fragen, antworten)
    const f = ergebnisPruefen({ ergebnis: 'passt', anUser: closer || null, notiz }, fragen, a, closerIds)
    if (f.length) { setMeldung({ ok: false, text: f.join(' ') }); return }
    setBusy(true); setMeldung(null)
    try {
      if (!(await quali_speichern('passt'))) return
      const { error } = await supabase.from('vk_uebergabe').insert({ lead_id: leadId, an_user_id: closer, notiz: notiz.trim() || null })
      if (error) { setMeldung({ ok: false, text: /gehört nicht/.test(error.message) ? error.message : 'Übergabe nicht gespeichert.' }); return }
      setMeldung({ ok: true, text: `An ${personName(team, closer) ?? 'den Closer'} übergeben${closer === ich ? '' : ' — die Glocke ist unterwegs'}.` })
      setModus(''); setNotiz(''); await laden(); router.refresh()
    } finally { setBusy(false) }
  }

  // Paket VK3: Closer nach den Verteil-Regeln vorschlagen (reihum / nach freier Zeit / Regeln aus den Antworten).
  async function vorschlag() {
    setMeldung(null)
    const jetzt = new Date()
    const bis = new Date(jetzt.getTime() + 14 * 86400000)
    const [v, m, t, u] = await Promise.all([
      supabase.from('vk_verteilung').select('modus, regeln').maybeSingle(),
      supabase.from('mitarbeiter').select('id, auth_user_id').limit(2000),
      supabase.from('termine').select('mitarbeiter_id, beginn_am, ende_am, status').gte('ende_am', jetzt.toISOString()).lte('beginn_am', bis.toISOString()).limit(5000),
      supabase.from('vk_uebergabe').select('an_user_id, erstellt_am').gte('erstellt_am', new Date(jetzt.getTime() - 90 * 86400000).toISOString()).limit(5000),
    ])
    const cfg = (v.data as { modus?: string; regeln?: unknown } | null) ?? null
    const modus = cfg && istModus(cfg.modus) && cfg.modus !== 'aus' ? cfg.modus : 'reihum'
    const maId = new Map(((m.data as { id: string; auth_user_id: string | null }[] | null) ?? []).filter((x) => x.auth_user_id).map((x) => [x.auth_user_id as string, x.id]))
    const pool = team.filter((p) => p.aktiv && p.funktion === 'closer')
    const liste: Closer[] = (pool.length ? pool : closerListe).map((p) => ({ user_id: p.user_id, name: p.name, mitarbeiter_id: maId.get(p.user_id) ?? null }))
    const w = waehleCloser({
      modus, closer: liste,
      zuletzt: letzteZuteilung(((u.data as { an_user_id: string; erstellt_am: string }[] | null) ?? []).map((x) => ({ user_id: x.an_user_id, am: x.erstellt_am }))),
      minuten: belegung((t.data as Termin[] | null) ?? [], jetzt, bis),
      antworten: antwortenBereinigen(fragen, antworten), regeln: regelnBereinigen(cfg?.regeln, liste.map((c) => c.user_id)),
    })
    if (!w) { setMeldung({ ok: false, text: 'Kein Closer verfügbar — bitte unter „Verkaufsteam" Closer festlegen.' }); return }
    setCloser(w.user_id)
    setMeldung({ ok: true, text: `Vorschlag: ${personName(team, w.user_id) ?? 'Closer'} (${w.grund})${!cfg || cfg.modus === 'aus' ? ' · Verteilung ist aus, vorgeschlagen wird reihum' : ''}.` })
  }

  async function passtNicht() {
    const f = ergebnisPruefen({ ergebnis: 'passt_nicht', grund, grundText: grundFrei }, fragen, antworten, closerIds)
    if (f.length) { setMeldung({ ok: false, text: f.join(' ') }); return }
    if (!window.confirm(`Lead als „Passt nicht" abschließen (${grundText(grund)})? Er wird auf „Verloren" gesetzt${nachfassAktiv ? ' und das Nachfassen beendet' : ''}.`)) return
    setBusy(true); setMeldung(null)
    try {
      if (!(await quali_speichern('passt_nicht', { grund, grund_text: grundFrei }))) return
      const felder = { ...feldwerteFuerStufe('verloren', new Date().toISOString()), ...(nachfassAktiv ? stoppWerte('gestoppt') : {}) }
      const { error } = await supabase.from('leads').update(felder).eq('id', leadId)
      setMeldung(error
        ? { ok: false, text: 'Grund gespeichert, die Stufe konnte aber nicht auf „Verloren" gesetzt werden.' }
        : { ok: true, text: 'Abgeschlossen: Passt nicht. Der Grund zählt in der Auswertung „Verkaufsteam".' })
      setModus(''); await laden(); router.refresh()
    } finally { setBusy(false) }
  }

  if (sqlFehlt) return <div style={box}><span style={kopf}>🎯 Qualifizierung</span><span style={{ color: 'rgba(255,255,255,0.6)' }}>Noch nicht eingerichtet (SQL von Paket VK2 fehlt).</span></div>

  const stand = quali?.ergebnis ?? 'offen'
  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={kopf}>🎯 Qualifizierung · {ERGEBNIS_TEXT[stand]}{stand === 'passt_nicht' && quali?.grund ? ` (${grundText(quali.grund)})` : ''}</span>
        <span style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a href={`/dashboard/leads/${leadId}/spickzettel`} style={{ ...knopf('#C9A84C'), textDecoration: 'none' }}>📋 Spickzettel</a>
          {!offen && <button style={knopf('#8FA3BE')} onClick={() => setOffen(true)}>Bogen öffnen</button>}
        </span>
      </div>

      {uebergaben.length > 0 && (
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', display: 'grid', gap: '4px' }}>
          {uebergaben.slice(0, 3).map((u) => (
            <span key={u.id}>➡ {zeit(u.erstellt_am)}: {personName(team, u.von_user_id) ?? 'Jemand'} → {personName(team, u.an_user_id) ?? 'Closer'}{u.notiz ? ` · „${u.notiz}"` : ''}</span>
          ))}
        </div>
      )}

      {offen && (
        <>
          {boegen.length > 0 && (
            <label style={label}>Bogen (je Angebot)
              <select style={feld} value={bogenId} onChange={(e) => setBogenId(e.target.value)}>
                <option value="">Standard-Bogen</option>
                {boegen.map((b) => <option key={b.id} value={b.id}>{b.name}{b.angebot ? ` · ${b.angebot}` : ''}</option>)}
              </select>
            </label>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            {fragen.map((f) => (
              <label key={f.key} style={label}>{f.frage}{f.pflicht ? ' *' : ''}
                {f.typ === 'auswahl' ? (
                  <select style={feld} value={antworten[f.key] ?? ''} onChange={(e) => setAntworten({ ...antworten, [f.key]: e.target.value })}>
                    <option value="">— bitte wählen —</option>
                    {(f.optionen ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.typ === 'janein' ? (
                  <select style={feld} value={antworten[f.key] ?? ''} onChange={(e) => setAntworten({ ...antworten, [f.key]: e.target.value })}>
                    <option value="">—</option><option value="ja">ja</option><option value="nein">nein</option>
                  </select>
                ) : f.typ === 'text' ? (
                  <textarea style={{ ...feld, minHeight: '64px' }} value={antworten[f.key] ?? ''} onChange={(e) => setAntworten({ ...antworten, [f.key]: e.target.value })} />
                ) : (
                  <input style={feld} inputMode="decimal" value={antworten[f.key] ?? ''} onChange={(e) => setAntworten({ ...antworten, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button style={knopf('#8FA3BE')} disabled={busy} onClick={zwischenspeichern}>Zwischenspeichern</button>
            <button style={knopf('#4CAF7D', modus === 'passt')} disabled={busy} onClick={() => setModus(modus === 'passt' ? '' : 'passt')}>✓ Passt → an Closer übergeben</button>
            <button style={knopf('#E06666', modus === 'passt_nicht')} disabled={busy} onClick={() => setModus(modus === 'passt_nicht' ? '' : 'passt_nicht')}>✗ Passt nicht</button>
          </div>

          {modus === 'passt' && (
            <div style={{ display: 'grid', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
              <label style={label}>Closer
                <span style={{ display: 'flex', gap: '8px' }}>
                  <select style={feld} value={closer} onChange={(e) => setCloser(e.target.value)}>
                    <option value="">— bitte wählen —</option>
                    {closerListe.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}{p.user_id === ich ? ' (Sie)' : ''}</option>)}
                  </select>
                  <button type="button" style={knopf('#C9A84C')} disabled={busy} onClick={() => void vorschlag()} title="Nach den Regeln unter Verkaufsteam → Termin-Verteilung">⚡ Vorschlag</button>
                </span>
              </label>
              <label style={label}>Notiz für den Closer (steht auf dem Spickzettel)
                <textarea style={{ ...feld, minHeight: '64px' }} maxLength={2000} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. will das Bad bis Mai fertig, Frau entscheidet mit" />
              </label>
              <div><button style={knopf('#4CAF7D', true)} disabled={busy} onClick={uebergeben}>Übergeben und Closer benachrichtigen</button></div>
            </div>
          )}

          {modus === 'passt_nicht' && (
            <div style={{ display: 'grid', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
              <label style={label}>Grund
                <select style={feld} value={grund} onChange={(e) => setGrund(e.target.value)}>
                  <option value="">— bitte wählen —</option>
                  {GRUENDE.map((g) => <option key={g.key} value={g.key}>{g.text}</option>)}
                </select>
              </label>
              <label style={label}>Kurz erklärt {grund === 'sonstiges' ? '*' : '(freiwillig)'}
                <input style={feld} maxLength={300} value={grundFrei} onChange={(e) => setGrundFrei(e.target.value)} />
              </label>
              <div><button style={knopf('#E06666', true)} disabled={busy} onClick={passtNicht}>Abschließen: Passt nicht</button></div>
            </div>
          )}
        </>
      )}

      {meldung && <div style={{ fontSize: '14px', color: meldung.ok ? '#4CAF7D' : '#E06666' }}>{meldung.text}</div>}
    </div>
  )
}

