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

  return (
    <main className="bg-[#0a0a0b] text-[#e8e6e0] min-h-screen">
      <Navbar />
      <section className="max-w-4xl mx-auto px-6 py-24">
        <div className="mb-4 text-5xl">{branche.icon}</div>
        <h1 className="text-4xl font-bold text-[#C9A84C] mb-4">{branche.name}</h1>
        <p className="text-lg text-[#e8e6e0]/70 mb-12">{branche.beschreibung}</p>
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <h2 className="text-[#C9A84C] font-semibold text-lg mb-4">❌ Schmerzpunkte</h2>
            <ul className="space-y-2">
              {branche.schmerzen.map((s, i) => (
                <li key={i} className="text-[#e8e6e0]/80 border-l-2 border-[#C9A84C]/30 pl-3">{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-[#C9A84C] font-semibold text-lg mb-4">✅ Ergebnisse</h2>
            <ul className="space-y-2">
              {branche.ergebnisse.map((e, i) => (
                <li key={i} className="text-[#e8e6e0]/80 border-l-2 border-[#C9A84C]/30 pl-3">{e}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-[#C9A84C] font-semibold text-lg mb-4">🤖 Agenten</h2>
            <ul className="space-y-2">
              {branche.agenten.map((a, i) => (
                <li key={i} className="text-[#e8e6e0]/80 border-l-2 border-[#C9A84C]/30 pl-3">{a}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  )
}