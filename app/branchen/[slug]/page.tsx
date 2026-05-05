import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import Services from '@/components/Services'
import Process from '@/components/Process'
import Industries from '@/components/Industries'
import CtaSection from '@/components/CtaSection'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main className="bg-[#0a0a0b] text-[#e8e6e0] min-h-screen">
      <Navbar />
      <Hero />
      <Services />
      <Process />
      <Industries />
      <CtaSection />
      <Footer />
    </main>
  )
}
