'use client'

// ARGONAUT OS · Paket VK6 (16.10.2026) — Gesprächsergebnis am Lead.
// Nach jedem Verkaufsgespräch: erschienen?, angeboten?, Ergebnis, vereinbart, Anzahlung,
// Haupteinwand, nächster Schritt. Speichert über /api/gespraech-ergebnis (Tabelle vk_gespraech,
// SQL p414); die Lead-Stufe zieht nach (nie zurück). Logik: lib/gespraechErgebnis.ts.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { ERGEBNISSE, EINWAENDE, ergebnisLabel, einwandLabel, type Ergebnis } from '@/lib/gespraechErgebnis'
import { euro } from '@/lib/geld'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
)

type Gespraech = {
  id: string; gespraech_am: string; ergebnis: string; angeboten: boolean
  vereinbart_cent: number | null; anzahlung_cent: number | null
  einwand: string | null; einwand_text: string | null; naechster_schritt: string | null
  folgetermin_am: string | null; notiz: string | null; termin_id: string | null
  angebot_id: string | null; auftrag_id: string | null; projekt_id: string | null; portal_mail_am: string | null
}
type TerminKurz = { id: string; titel: string | null; beginn_am: string }

const box = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '18px 24px', marginBottom: '24px', display: 'grid', gap: '12px' }
const feld = { background: '#0F2036', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '9px 12px', fontFamily: 'inherit', fontSize: '15px', width: '100%', boxSizing: 'border-box' as const }
const label = { fontSize: '13px', color: 'rgba(255,255,255,0.7)', display: 'grid', gap: '6px' }
const kopf = { fontSize: '12px', color: '#C9A84C', letterSpacing: '0.12em', textTransform: 'uppercase' as const, fontWeight: 700 }
const knopf = (farbe: string, voll = false) => ({ background: voll ? farbe : 'transparent', color: voll ? '#0A1628' : farbe, border: `1px solid ${farbe}`, borderRadius: '10px', padding: '9px 14px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' })
const FARBE: Record<string, string> = { gruen: '#4CAF7D', gold: '#C9A84C', rot: '#E06666', grau: '#8FA3BE' }

function zeit(t: string | null): string {
  if (!t) return ''
  try { return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t)) } catch { return t }
}

export default function GespraechBox({ leadId, kontaktId, email }: { leadId: string; kontaktId: string | null; email: string | null }) {
  const router = useRouter()
  const [liste, setListe] = useState<Gespraech[]>([])
  const [bereit, setBereit] = useState<boolean | null>(null)
  const [termine, setTermine] = useState<TerminKurz[]>([])
  const [offen, setOffen] = useState(false)
  const [ergebnis, setErgebnis] = useState<Ergebnis | ''>('')
  const [angeboten, setAngeboten] = useState(false)
  const [vereinbart, setVereinbart] = useState('')
  const [anzahlung, setAnzahlung] = useState('')
  const [einwand, setEinwand] = useState('')
  const [einwandText, setEinwandText] = useState('')
  const [schritt, setSchritt] = useState('')
  const [folge, setFolge] = useState('')
  const [notiz, setNotiz] = useState('')
  const [terminId, setTerminId] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const laden = useCallback(async () => {
    const { data, error } = await supabase.from('vk_gespraech')
      .select('id, gespraech_am, ergebnis, angeboten, vereinbart_cent, anzahlung_cent, einwand, einwand_text, naechster_schritt, folgetermin_am, notiz, termin_id, angebot_id, auftrag_id, projekt_id, portal_mail_am')
      .eq('lead_id', leadId).order('gespraech_am', { ascending: false }).limit(20)
    if (error) { setBereit(false); return }
    setBereit(true)
    setListe((data as Gespraech[] | null) ?? [])
  }, [leadId])

  useEffect(() => { void laden() }, [laden])

  // Termine dieses Kunden aus den letzten 14 Tagen (zum Verknüpfen)
  useEffect(() => {
    if (!offen || (!kontaktId && !email)) return
    ;(async () => {
      try {
        const ab = new Date(Date.now() - 14 * 86400000).toISOString()
        const bis = new Date(Date.now() + 86400000).toISOString()
        let q = supabase.from('termine').select('id, titel, beginn_am').gte('beginn_am', ab).lte('beginn_am', bis)
        q = kontaktId ? q.eq('kontakt_id', kontaktId) : q.ilike('kunde_email', String(email).replace(/[%_\\]/g, '\\$&'))
        const { data } = await q.order('beginn_am', { ascending: false }).limit(10)
        const t = (data as TerminKurz[] | null) ?? []
        setTermine(t)
        if (t.length) setTerminId((alt) => alt || t[0].id)
      } catch { /* Verknüpfen ist Zugabe */ }
    })()
  }, [offen, kontaktId, email])

  function zuruecksetzen() {
    setErgebnis(''); setAngeboten(false); setVereinbart(''); setAnzahlung(''); setEinwand(''); setEinwandText('')
    setSchritt(''); setFolge(''); setNotiz('')
  }

  async function speichern() {
    setBusy(true); setFehler(null); setOk(null)
    try {
      const res = await fetch('/api/gespraech-ergebnis', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId, termin_id: terminId || null,
          eingabe: {
            ergebnis, angeboten, vereinbart, anzahlung, einwand: einwand || null, einwand_text: einwandText,
            naechster_schritt: schritt, folgetermin_am: folge ? new Date(folge).toISOString() : null, notiz,
          },
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setFehler(d?.error || 'Speichern fehlgeschlagen.'); return }
      setOk(d?.stufe ? `Gespeichert — Lead steht jetzt auf „${d.stufe === 'kunde' ? 'Kunde' : d.stufe === 'verloren' ? 'Verloren' : 'Termin gehalten'}“.` : 'Gespeichert.')
      zuruecksetzen(); setOffen(false)
      await laden()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (bereit === false) {
    return (
      <section style={box}>
        <div style={kopf}>💬 Gesprächsergebnis</div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>Wird nach der Datenbank-Erweiterung p414 freigeschaltet.</div>
      </section>
    )
  }

  const nichtDa = ergebnis === 'nicht_erschienen'
  return (
    <section style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={kopf}>💬 Gesprächsergebnis</div>
        {!offen && <button style={knopf('#C9A84C', true)} onClick={() => { setOffen(true); setOk(null) }}>+ Ergebnis eintragen</button>}
      </div>
      {ok && <div style={{ color: '#4CAF7D', fontSize: '14px' }}>✅ {ok}</div>}

      {offen && (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {ERGEBNISSE.map((e) => (
              <button key={e.key} onClick={() => setErgebnis(e.key)}
                style={{ ...knopf(FARBE[e.farbe], ergebnis === e.key), padding: '8px 12px' }}>{e.label}</button>
            ))}
          </div>
          {termine.length > 0 && (
            <label style={label}>Zu welchem Termin?
              <select style={feld} value={terminId} onChange={(e) => setTerminId(e.target.value)}>
                <option value="">— keinem Termin zuordnen —</option>
                {termine.map((t) => <option key={t.id} value={t.id}>{zeit(t.beginn_am)} · {t.titel || 'Termin'}</option>)}
              </select>
            </label>
          )}
          {!nichtDa && ergebnis && (
            <>
              <label style={{ ...label, display: 'flex', gap: '10px', alignItems: 'center', color: '#FFFFFF' }}>
                <input type="checkbox" checked={angeboten} onChange={(e) => setAngeboten(e.target.checked)} /> Angebot gemacht bzw. Preis genannt
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <label style={label}>Vereinbart (€){ergebnis === 'abgeschlossen' ? ' *' : ''}
                  <input style={feld} inputMode="decimal" value={vereinbart} onChange={(e) => setVereinbart(e.target.value)} placeholder="z. B. 12.500" />
                </label>
                <label style={label}>Davon angezahlt (€)
                  <input style={feld} inputMode="decimal" value={anzahlung} onChange={(e) => setAnzahlung(e.target.value)} placeholder="z. B. 2.500" />
                </label>
              </div>
              <label style={label}>Haupteinwand{ergebnis === 'verloren' ? ' *' : ''}
                <select style={feld} value={einwand} onChange={(e) => setEinwand(e.target.value)}>
                  <option value="">— kein Einwand —</option>
                  {EINWAENDE.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
                </select>
              </label>
              {einwand && (
                <label style={label}>Einwand genauer{einwand === 'sonstiges' ? ' *' : ''}
                  <input style={feld} value={einwandText} maxLength={500} onChange={(e) => setEinwandText(e.target.value)} />
                </label>
              )}
            </>
          )}
          {ergebnis && ergebnis !== 'abgeschlossen' && ergebnis !== 'verloren' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <label style={label}>Nächster Schritt{ergebnis === 'offen' ? ' (oder Folgetermin) *' : ''}
                <input style={feld} value={schritt} maxLength={500} onChange={(e) => setSchritt(e.target.value)} placeholder="z. B. Angebot bis Freitag schicken" />
              </label>
              <label style={label}>Folgetermin
                <input type="datetime-local" style={feld} value={folge} onChange={(e) => setFolge(e.target.value)} />
              </label>
            </div>
          )}
          {ergebnis && (
            <label style={label}>Notiz
              <textarea style={{ ...feld, minHeight: '70px' }} maxLength={2000} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
            </label>
          )}
          {fehler && <div style={{ color: '#E06666', fontSize: '14px' }}>⚠️ {fehler}</div>}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button style={knopf('#C9A84C', true)} disabled={!ergebnis || busy} onClick={speichern}>{busy ? 'Speichert…' : 'Ergebnis speichern'}</button>
            <button style={knopf('rgba(255,255,255,0.6)')} onClick={() => { setOffen(false); setFehler(null) }}>Abbrechen</button>
          </div>
        </div>
      )}

      {liste.length > 0 && (
        <div style={{ display: 'grid', gap: '8px' }}>
          {liste.map((g) => {
            const farbe = FARBE[ERGEBNISSE.find((e) => e.key === g.ergebnis)?.farbe ?? 'grau']
            return (
              <div key={g.id} style={{ borderLeft: `3px solid ${farbe}`, padding: '6px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '14px', display: 'grid', gap: '3px' }}>
                <div><b style={{ color: farbe }}>{ergebnisLabel(g.ergebnis)}</b> <span style={{ color: 'rgba(255,255,255,0.55)' }}>· {zeit(g.gespraech_am)}{g.angeboten ? ' · angeboten' : ''}</span></div>
                {(g.vereinbart_cent || g.anzahlung_cent) ? (
                  <div>Vereinbart {euro((g.vereinbart_cent ?? 0) / 100)}{g.anzahlung_cent ? ` · angezahlt ${euro(g.anzahlung_cent / 100)}` : ''}</div>
                ) : null}
                {g.einwand ? <div style={{ color: 'rgba(255,255,255,0.75)' }}>Einwand: {einwandLabel(g.einwand)}{g.einwand_text ? ` – ${g.einwand_text}` : ''}</div> : null}
                {g.naechster_schritt || g.folgetermin_am ? <div style={{ color: 'rgba(255,255,255,0.75)' }}>Nächster Schritt: {g.naechster_schritt || '—'}{g.folgetermin_am ? ` · ${zeit(g.folgetermin_am)}` : ''}</div> : null}
                {g.notiz ? <div style={{ color: 'rgba(255,255,255,0.6)', whiteSpace: 'pre-wrap' }}>{g.notiz}</div> : null}
              </div>
            )
          })}
        </div>
      )}
      {liste.length === 0 && !offen && bereit && (
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '14px' }}>Nach dem Gespräch hier festhalten, wie es ausgegangen ist — daraus entstehen Abschlussquote und Einwand-Statistik.</div>
      )}
    </section>
  )
}
