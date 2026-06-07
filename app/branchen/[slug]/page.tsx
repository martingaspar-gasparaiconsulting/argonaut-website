import { getAllBrancheSlugs, getBrancheBySlug } from '@/lib/branchen'
import { notFound } from 'next/navigation'
import BranchenPageClient from './BranchenPageClient'

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
  return <BranchenPageClient slug={slug} />
}
