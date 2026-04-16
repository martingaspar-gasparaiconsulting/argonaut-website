import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import Services from '@/components/Services'
import AgentTeam from '@/components/AgentTeam'
import ScrollingBanner from '@/components/ScrollingBanner'
import Process from '@/components/Process'
import Industries from '@/components/Industries'
import CtaSection from '@/components/CtaSection'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <ScrollingBanner />
      <AgentTeam />
      <Services />
      <Process />
      <Industries />
      <CtaSection />
      <Footer />
    </main>
  )
}