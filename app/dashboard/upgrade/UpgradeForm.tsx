'use client'

// ============================================================================
// ARGONAUT OS · app/dashboard/upgrade/UpgradeForm.tsx  (Schritt 5 · Teil 1)
// INTERNES Upgrade — KEIN Stripe. Mitarbeiterzahl -> Stufe (lib/tarif.ts),
// Sitze dazubuchen, Live-Preis, SEPA-Mandat erteilen -> /api/kunde-abo.
// Der Einzug läuft über die Betreiber-Sammellastschrift (Teil 2); hier wird
// nichts abgebucht, sondern das Abo gemeldet.
// ============================================================================

import { useState } from 'react'
import { stufeFuerMitarbeiter, sitzPreis, monatspreis, euro } from '@/lib/tarif'
import { ibanGueltig } from '@/lib/sepa'

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666',
}

export default function UpgradeForm({ userEmail, userName }: { userEmail: string; userName: string; currentPlan?: string }) {
  const [ma, setMa] = useState(1)
  const [voll, setVoll] = useState(1)
  const [std, setStd] = useState(0)
  const [self, setSelf] = useState(0)
  const [kontoinhaber, setKontoinhaber] = useState(userName || '')
  const [iban, setIban] = useState('')
  const [bic, setBic] = useState('')
  const [mandat, setMandat] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<null | { stufe: string; brutto: number; onboarding: number; bestand: boolean }>(null)

  const stufe = stufeFuerMitarbeiter(ma)
  const solo = !!stufe.allIn
  const sitze = { voll, standard: std, self_service: self }
  const preis = monatspreis(stufe.key, sitze)
  const vp = sitzPreis('voll', stufe.key), sp = sitzPreis('standard', stufe.key), sfp = sitzPreis('self_service', stufe.key)

  function fillMix() {
    const v = Math.max(1, Math.round(ma * 0.16))
    const s = Math.round(ma * 0.32)
    const se = Math.max(0, ma - v - s)
    setVoll(v); setStd(s); setSelf(se)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!kontoinhaber.trim()) { setError('Bitte den Kontoinhaber angeben.'); return }
    if (!ibanGueltig(iban)) { setError('Bitte eine gültige IBAN angeben.'); return }
    if (!mandat) { setError('Bitte das SEPA-Lastschriftmandat bestätigen.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/kunde-abo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stufe: stufe.key, mitarbeiterAnzahl: ma, sitze,
          kontoinhaber: kontoinhaber.trim(), iban: iban.replace(/\s+/g, '').toUpperCase(), bic: bic.trim(),
          mandatAkzeptiert: mandat,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) { setError(json.error || 'Konnte nicht gespeichert werden.'); return }
      setSuccess({ stufe: json.stufe, brutto: json.monatspreisBrutto, onboarding: json.onboarding, bestand: json.istBestandskunde })
    } catch {
      setError('Netzwerkfehler. Bitte später erneut versuchen.')
    } finally { setLoading(false) }
  }

  const step: React.CSSProperties = { width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.gold}66`, background: 'transparent', color: C.gold, fontSize: 18, cursor: 'pointer', lineHeight: 1 }
  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: C.textDim, letterSpacing: '.06em', textTransform: 'uppercase', margin: '0 0 6px' }

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 24px', color: C.text, fontFamily: 'var(--font-dm-sans), sans-serif' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔱</div>
        <h2 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 10px' }}>Abo bestätigt — {success.stufe}</h2>
        <p style={{ color: C.textDim, maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
          Vielen Dank. Ihr Abo über <b style={{ color: C.gold }}>{euro(success.brutto)} brutto / Monat</b> ist hinterlegt und Ihr SEPA-Mandat erteilt.
          {success.onboarding > 0 ? ` Zzgl. einmaliger Einrichtung ${euro(success.onboarding)}.` : ' Als Bestandskunde fällt kein erneutes Onboarding an.'}
          {' '}Es wurde noch <b>nichts abgebucht</b> — wir prüfen die Freigabe und melden uns.
        </p>
      </div>
    )
  }

  const Row = ({ label, who, unit, val, set, min = 0 }: { label: string; who: string; unit: number; val: number; set: (n: number) => void; min?: number }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontWeight: 700, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 13, color: C.textDim, margin: '2px 0 0' }}>{who} · je {unit} €</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={() => set(Math.max(min, val - 1))} style={step} aria-label="weniger">−</button>
        <span style={{ minWidth: 30, textAlign: 'center', fontWeight: 700 }}>{val}</span>
        <button type="button" onClick={() => set(val + 1)} style={step} aria-label="mehr">+</button>
        <span style={{ minWidth: 90, textAlign: 'right', color: C.gold, fontWeight: 700 }}>{(val * unit).toLocaleString('de-DE')} €</span>
      </div>
    </div>
  )

  return (
    <form onSubmit={submit} style={{ color: C.text, fontFamily: 'var(--font-dm-sans), sans-serif' }}>

      {/* Betriebsgröße */}
      <section style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: C.textDim }}>Mitarbeiter im Betrieb:</span>
            <button type="button" onClick={() => setMa(Math.max(1, ma - 1))} style={step} aria-label="weniger">−</button>
            <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 800, fontSize: 18 }}>{ma}</span>
            <button type="button" onClick={() => setMa(ma + 1)} style={step} aria-label="mehr">+</button>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 12, color: C.cyan, textTransform: 'uppercase', letterSpacing: '.06em' }}>Stufe {stufe.name} · Grundgebühr</p>
            <p style={{ margin: '2px 0 0', color: C.gold, fontWeight: 800, fontSize: 22 }}>{stufe.grundgebuehr.toLocaleString('de-DE')} €<span style={{ fontSize: 13, color: C.textDim, fontWeight: 400 }}> / Monat</span></p>
          </div>
        </div>

        {solo ? (
          <p style={{ color: C.textDim, margin: '16px 0 0', lineHeight: 1.6 }}>
            <b style={{ color: C.text }}>SOLO ist all-in:</b> {stufe.grundgebuehr} €/Monat inkl. 1 Voll-Nutzer und KI unbegrenzt — keine zusätzlichen Sitze nötig.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 2px' }}>
              <span style={{ fontSize: 13, color: C.textDim, textTransform: 'uppercase', letterSpacing: '.06em' }}>Sitze dazubuchen</span>
              <button type="button" onClick={fillMix} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 12px', color: C.cyan, fontSize: 13, cursor: 'pointer' }}>Mit typischem Mix füllen</button>
            </div>
            <Row label="Voll-Nutzer" who="Chef, GF, Büro, Dispo" unit={vp} val={voll} set={setVoll} min={1} />
            <Row label="Standard-Nutzer" who="operative Nutzung" unit={sp} val={std} set={setStd} min={0} />
            <Row label="Self-Service" who="Zeiterfassung & eigene Daten" unit={sfp} val={self} set={setSelf} min={0} />
          </>
        )}

        {/* Preis */}
        <div style={{ background: 'rgba(201,168,76,0.08)', border: `1px solid ${C.gold}44`, borderRadius: 14, padding: '18px 20px', marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: C.cyan, textTransform: 'uppercase', letterSpacing: '.06em' }}>Ihr Preis</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: C.textDim }}>
              {euro(preis.netto)} netto · zzgl. {euro(preis.mwst)} USt.
              {' · '}+ einmalige Einrichtung {stufe.abPreis ? 'auf Anfrage' : euro(stufe.onboarding)} (entfällt beim Upgrade als Bestandskunde)
            </p>
          </div>
          <p style={{ fontWeight: 800, fontSize: 'clamp(1.6rem,4vw,2.2rem)', color: C.gold, margin: 0, lineHeight: 1 }}>
            {euro(preis.brutto)}<span style={{ fontSize: 14, color: C.textDim, fontWeight: 400 }}> brutto / Mon.</span>
          </p>
        </div>
      </section>

      {/* SEPA-Mandat */}
      <section style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 20 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>Bankverbindung (SEPA-Lastschrift)</h3>
        <p style={{ fontSize: 13, color: C.textDim, margin: '0 0 18px' }}>Der Monatsbeitrag wird per SEPA-Lastschrift von diesem Konto eingezogen.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Kontoinhaber</label>
            <input style={inp} value={kontoinhaber} onChange={(e) => setKontoinhaber(e.target.value)} placeholder="Vor- und Nachname / Firma" />
          </div>
          <div>
            <label style={lbl}>IBAN</label>
            <input style={{ ...inp, fontFamily: 'ui-monospace, monospace', letterSpacing: '.04em' }} value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="DE89 3704 0044 0532 0130 00" maxLength={42} />
          </div>
          <div>
            <label style={lbl}>BIC (optional)</label>
            <input style={inp} value={bic} onChange={(e) => setBic(e.target.value.toUpperCase())} placeholder="z. B. COBADEFFXXX" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>E-Mail (Rechnungsempfänger)</label>
            <input style={{ ...inp, color: C.textDim }} value={userEmail} readOnly />
          </div>
        </div>

        <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', margin: '16px 0 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={mandat} onChange={(e) => setMandat(e.target.checked)} style={{ marginTop: 3, accentColor: C.gold }} />
          <span style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>
            Ich ermächtige die <b style={{ color: C.gold }}>Gaspar AI Consulting</b>, den monatlichen Beitrag mittels SEPA-Lastschrift von meinem Konto einzuziehen, und weise mein Kreditinstitut an, die Lastschriften einzulösen. Ich kann innerhalb von 8 Wochen ab Belastung die Erstattung verlangen. Die Mandatsreferenz wird separat mitgeteilt.
          </span>
        </label>
      </section>

      {error && (
        <div style={{ padding: '13px 16px', borderRadius: 10, marginBottom: 18, background: 'rgba(224,102,102,0.1)', border: `1px solid ${C.danger}55`, color: '#f0a3a3', fontSize: 14 }}>{error}</div>
      )}

      <button type="submit" disabled={loading} style={{ width: '100%', padding: '15px 28px', borderRadius: 10, border: 'none', background: loading ? `${C.gold}88` : C.gold, color: C.navy, fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
        {loading ? 'Wird gespeichert …' : `Abo bestätigen — ${euro(preis.brutto)} brutto / Monat`}
      </button>
      <p style={{ fontSize: 12, color: C.textDim, textAlign: 'center', margin: '12px 0 0', lineHeight: 1.6 }}>
        Kein Stripe · interner SEPA-Einzug · Es wird jetzt nichts abgebucht — Ihr Abo wird gemeldet und geprüft. Kündigung jederzeit möglich.
      </p>
    </form>
  )
}
