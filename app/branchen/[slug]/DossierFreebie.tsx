'use client'

// ============================================================================
// ARGONAUT OS · app/branchen/[slug]/DossierFreebie.tsx
//
// Das Freebie-Feld auf der Branchenseite: E-Mail eintragen -> Bestaetigungslink
// -> Branchen-Dossier als PDF.
//
// NUTZT DIE VORHANDENE STRECKE, BAUT NICHTS NEU
// Der Ablauf existiert bereits vollstaendig und wird hier nur angezapft:
//   /api/oeffentlich/dossier-optin      Lead anlegen + Bestaetigungsmail
//   /api/oeffentlich/dossier-bestaetigen  Klick im Mail-Link
//   /api/oeffentlich/dossier-pdf        das PDF je Branche (Cache im Bucket)
// Gefehlt hat nur der Einstieg auf der Branchenseite selbst.
//
// WARUM KEIN SOFORT-DOWNLOAD OHNE BESTAETIGUNG
// Eine Adresse ohne nachgewiesene Einwilligung darf spaeter nicht beworben
// werden (§ 7 UWG). Wer das PDF sofort herausgibt, sammelt Adressen, die er
// nicht nutzen darf — und faengt sich beim ersten Newsletter eine Abmahnung.
// Der Umweg ueber die Bestaetigungsmail ist genau der Nachweis.
// ============================================================================

import { useState } from 'react'

type Zustand = 'ruht' | 'sendet' | 'bestaetigen' | 'erneut' | 'fehler'

export default function DossierFreebie({ slug, branche }: { slug: string; branche: string }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [zustand, setZustand] = useState<Zustand>('ruht')
  const [meldung, setMeldung] = useState('')

  const absenden = async (e: React.FormEvent) => {
    e.preventDefault()
    if (zustand === 'sendet') return
    setZustand('sendet')
    setMeldung('')
    try {
      const r = await fetch('/api/oeffentlich/dossier-optin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || null, branche: slug }),
      })
      const j = await r.json()
      if (!r.ok || !j?.ok) {
        setZustand('fehler')
        setMeldung(j?.error || 'Das hat nicht geklappt. Bitte versuchen Sie es später erneut.')
        return
      }
      setZustand(j.status === 'bereits' ? 'erneut' : 'bestaetigen')
    } catch {
      setZustand('fehler')
      setMeldung('Das hat nicht geklappt. Bitte versuchen Sie es später erneut.')
    }
  }

  // ---- Nach dem Absenden: keine Wiederholung des Formulars ----------------
  if (zustand === 'bestaetigen' || zustand === 'erneut') {
    return (
      <div className="bg-[#0A1628] border border-[#4CAF7D]/40 rounded-2xl p-10 mt-16">
        <div className="text-3xl mb-3">📬</div>
        <h3 className="text-white text-xl font-bold mb-2">
          {zustand === 'erneut' ? 'Schon dabei — wir haben es erneut geschickt' : 'Fast geschafft'}
        </h3>
        <p className="text-white/60 text-sm max-w-xl">
          {zustand === 'erneut'
            ? 'Ihre Adresse war bereits bestätigt. Das Dossier liegt erneut in Ihrem Postfach.'
            : 'Wir haben Ihnen eine E-Mail geschickt. Bestätigen Sie darin kurz den Link — danach kommt das Dossier sofort.'}
        </p>
        <p className="text-white/35 text-xs mt-4">
          Nichts angekommen? Bitte schauen Sie auch im Spam-Ordner nach.
        </p>
      </div>
    )
  }

  // ---- Das Formular --------------------------------------------------------
  return (
    <div className="bg-[#0A1628] rounded-2xl p-10 mt-16 border border-[#C9A84C]/25">
      <div className="flex flex-col lg:flex-row lg:items-start gap-8">
        <div className="lg:w-1/2">
          <div className="inline-block bg-[#C9A84C]/10 border border-[#C9A84C]/30 text-[#C9A84C] text-xs tracking-widest uppercase px-4 py-1 rounded-full mb-4">
            Kostenlos
          </div>
          <h3 className="text-white text-xl font-bold mb-2">
            Das Branchen-Dossier {branche}
          </h3>
          <p className="text-white/60 text-sm">
            Wo in {branche}-Betrieben die Zeit verloren geht, was das im Jahr kostet und
            welche Bausteine das abstellen — als PDF zum Mitnehmen. Kein Verkaufsgespräch,
            keine Kosten.
          </p>
        </div>

        <form onSubmit={absenden} className="lg:w-1/2 w-full">
          <label className="block mb-3">
            <span className="block text-white/50 text-xs mb-1">Ihre E-Mail-Adresse</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@betrieb.de"
              className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C9A84C]/60"
            />
          </label>
          <label className="block mb-4">
            <span className="block text-white/50 text-xs mb-1">Ihr Name (freiwillig)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vor- und Nachname"
              className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#C9A84C]/60"
            />
          </label>

          <button
            type="submit"
            disabled={zustand === 'sendet'}
            className="w-full bg-[#C9A84C] hover:bg-[#b8923e] disabled:opacity-60 text-white font-semibold px-8 py-3 rounded-full transition-colors"
          >
            {zustand === 'sendet' ? 'Wird gesendet …' : 'Dossier anfordern →'}
          </button>

          {zustand === 'fehler' && (
            <p className="text-[#E06666] text-sm mt-3">{meldung}</p>
          )}

          <p className="text-white/35 text-xs mt-4 leading-relaxed">
            Sie erhalten zuerst eine Bestätigungsmail — erst danach schicken wir das Dossier.
            Abmeldung jederzeit über den Link in jeder E-Mail. Mehr dazu in unserer{' '}
            <a href="/datenschutz" className="underline hover:text-white/60">Datenschutzerklärung</a>.
          </p>
        </form>
      </div>
    </div>
  )
}
