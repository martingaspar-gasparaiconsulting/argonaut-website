import { getBrancheBySlug, getAllBrancheSlugs } from '@/lib/branchen'
import { notFound } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export async function generateStaticParams() {
  const slugs = getAllBrancheSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const branche = getBrancheBySlug(slug)
  if (!branche) return {}
  return {
    title: `${branche.name} | ARGONAUT OS`,
    description: branche.beschreibung,
  }
}

export default async function BranchenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const branche = getBrancheBySlug(slug)
  if (!branche) notFound()

  const stundenKlein = branche.stundenProWoche.klein
  const stundenMittel = branche.stundenProWoche.mittel
  const stundenGross = branche.stundenProWoche.gross

  return (
    <main className="min-h-screen bg-white">
      <Navbar />

      {/* HERO */}
      <section className="bg-[#0A1628] pt-32 pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="inline-block bg-[#C9A84C]/10 border border-[#C9A84C]/30 text-[#C9A84C] text-xs tracking-widest uppercase px-4 py-1 rounded-full mb-6">
            {branche.kategorie}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">{branche.name}</h1>
          <p className="text-white/60 text-lg max-w-2xl mb-10">{branche.beschreibung}</p>
          <div className="flex flex-wrap gap-12">
            <div>
              <div className="text-[#C9A84C] text-2xl font-bold">–{Math.round(stundenMittel * 100 / 40)}%</div>
              <div className="text-white/40 text-xs mt-1">Verwaltungsaufwand</div>
            </div>
            <div>
              <div className="text-[#C9A84C] text-2xl font-bold">{stundenMittel} Std/Woche</div>
              <div className="text-white/40 text-xs mt-1">durchschnittlich gespart</div>
            </div>
            <div>
              <div className="text-[#C9A84C] text-2xl font-bold">ab Tag 1</div>
              <div className="text-white/40 text-xs mt-1">messbare Ergebnisse</div>
            </div>
          </div>
        </div>
      </section>

      <div className="h-1 bg-gradient-to-r from-[#C9A84C] to-transparent" />

      <section className="max-w-5xl mx-auto px-6 py-16">

        {/* VIDEO */}
        <div className="bg-[#0A1628] rounded-2xl aspect-video flex items-center justify-center mb-16 relative overflow-hidden">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#C9A84C] flex items-center justify-center">
              <div className="w-0 h-0 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-l-[18px] border-l-[#0A1628] ml-1" />
            </div>
            <span className="text-white/50 text-sm tracking-wide">Vorher / Nachher — {branche.name}</span>
          </div>
          <div className="absolute bottom-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded">2:30</div>
        </div>

        {/* CARDS */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="2" x2="12" y2="12" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="2" x2="2" y2="12" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
              <h2 className="text-[#0A1628] font-semibold text-sm uppercase tracking-wider">Schmerzpunkte</h2>
            </div>
            <ul className="space-y-3">
              {branche.schmerzen.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-gray-500 text-sm">
                  <span className="w-1 h-1 rounded-full bg-[#C9A84C] mt-2 flex-shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polyline points="2,7 6,11 12,3" stroke="#639922" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h2 className="text-[#0A1628] font-semibold text-sm uppercase tracking-wider">Ergebnisse</h2>
            </div>
            <ul className="space-y-3">
              {branche.ergebnisse.map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-gray-500 text-sm">
                  <span className="w-1 h-1 rounded-full bg-[#C9A84C] mt-2 flex-shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="2" stroke="#0A1628" strokeWidth="1.5"/><line x1="5" y1="7" x2="9" y2="7" stroke="#0A1628" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="5" x2="7" y2="9" stroke="#0A1628" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <h2 className="text-[#0A1628] font-semibold text-sm uppercase tracking-wider">Agenten</h2>
            </div>
            <ul className="space-y-3">
              {branche.agenten.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-gray-500 text-sm">
                  <span className="w-1 h-1 rounded-full bg-[#C9A84C] mt-2 flex-shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ROI RECHNER */}
        <div className="bg-[#F7F6F3] rounded-2xl p-8 mb-16">
          <div className="mb-6">
            <div className="text-[#C9A84C] text-xs tracking-widest uppercase font-medium mb-2">ROI-Rechner</div>
            <h3 className="text-[#0A1628] text-2xl font-bold">Was sparen Sie konkret?</h3>
            <p className="text-gray-500 text-sm mt-1">Berechnen Sie Ihre individuelle Ersparnis — basierend auf Praxisdaten aus Ihrer Branche.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="text-[#0A1628] text-sm font-medium mb-2 block">Anzahl Mitarbeiter</label>
                <div className="flex gap-3">
                  {[
                    { label: '1–3 MA', key: 'klein', stunden: stundenKlein },
                    { label: '4–10 MA', key: 'mittel', stunden: stundenMittel },
                    { label: '11–25 MA', key: 'gross', stunden: stundenGross },
                  ].map((opt) => (
                    <label key={opt.key} className="flex-1 cursor-pointer">
                      <input type="radio" name="groesse" value={opt.key} className="sr-only peer" defaultChecked={opt.key === 'mittel'} />
                      <div className="border border-gray-200 rounded-xl p-3 text-center text-sm text-gray-500 peer-checked:border-[#C9A84C] peer-checked:text-[#0A1628] peer-checked:font-semibold transition-all">
                        {opt.label}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[#0A1628] text-sm font-medium mb-2 block">Stundenlohn (€)</label>
                <input
                  type="number"
                  defaultValue={35}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[#0A1628] text-sm focus:outline-none focus:border-[#C9A84C]"
                />
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-100">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-4">Ihre Ersparnis</div>
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <span className="text-gray-500 text-sm">Stunden gespart / Woche</span>
                  <span className="text-[#0A1628] font-bold">{stundenMittel} Std</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <span className="text-gray-500 text-sm">Stunden gespart / Jahr</span>
                  <span className="text-[#0A1628] font-bold">{stundenMittel * 52} Std</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <span className="text-gray-500 text-sm">Wert bei 35 €/Std</span>
                  <span className="text-[#C9A84C] font-bold">{(stundenMittel * 52 * 35).toLocaleString('de-DE')} €</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">ARGONAUT Kosten / Jahr</span>
                  <span className="text-gray-400 text-sm">ab 18.000 €</span>
                </div>
              </div>
              <div className="mt-4 bg-[#0A1628] rounded-xl p-4 text-center">
                <div className="text-white/60 text-xs mb-1">Ihr ROI</div>
                <div className="text-[#C9A84C] text-2xl font-bold">
                  {Math.round((stundenMittel * 52 * 35) / 18000 * 10) / 10}x
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="bg-[#0A1628] rounded-2xl p-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-white text-xl font-bold mb-2">Bereit für KI-Automatisierung?</h3>
            <p className="text-white/50 text-sm">Werde Früh-Kunde — exklusive Konditionen sichern.</p>
          </div>
          <a href="/#kontakt" className="bg-[#C9A84C] hover:bg-[#b8923e] text-white font-semibold px-8 py-3 rounded-full transition-colors whitespace-nowrap">
            Jetzt starten →
          </a>
        </div>

      </section>

      <Footer />
    </main>
  )
}