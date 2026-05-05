import { getBrancheBySlug, getAllBranchen } from '@/lib/branchen'
import { notFound } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export async function generateStaticParams() {
  const branchen = getAllBranchen()
  return branchen.map((b) => ({ slug: b.slug }))
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
        <h1 className="text-4xl font-bold text-[#C9A84C] mb-4">{branche.name}</h1>
        <p className="text-lg text-[#e8e6e0]/80 mb-8">{branche.beschreibung}</p>
        <div className="grid gap-4">
          {branche.automationen?.map((auto, i) => (
            <div key={i} className="border border-[#C9A84C]/20 rounded-lg p-4 bg-white/5">
              <p className="text-[#e8e6e0]">{auto}</p>
            </div>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  )
}