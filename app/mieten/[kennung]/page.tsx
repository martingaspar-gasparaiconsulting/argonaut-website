// ============================================================
// ARGONAUT OS · Paket 294 · V2b — „Fahrzeuge mieten" eines Betriebs (ohne Login)
// argonaut-os.com/mieten/<kennung> — aktive Mietflotte mit Endpreisen (PAngV)
// und Formular „Unverbindlich anfragen". KEINE Buchung, KEINE Zahlung:
// die Anfrage landet beim Betrieb, erst der Betrieb reserviert.
// Google nur, wenn der Chef „Bei Google finden lassen" anhakt (sonst noindex).
// Daten nur über lib/mietOnlineLaden (Positivliste, Betrieb nur über Kennung).
// ============================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { datenschutzHinweis } from '@/lib/kfzBoerse';
import { mietPfad, steuerHinweis } from '@/lib/mietOnline';
import { mietDb, firmaZu, basisAdresse, betriebZuMietKennung, oeffentlicheFlotte, istKleinunternehmer } from '@/lib/mietOnlineLaden';
import { BoerseSeite, st } from '../../fahrzeuge/BoerseTeile';
import MietListe from './MietListe';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ kennung: string }> };

const NICHT_FINDEN = { index: false, follow: false };

const lade = cache(async (k: string) => {
  const db = mietDb();
  const b = await betriebZuMietKennung(db, k);
  if (!b) return null;
  const [firma, flotte, ku] = await Promise.all([firmaZu(db, b.betrieb), oeffentlicheFlotte(db, b.betrieb), istKleinunternehmer(db, b.betrieb)]);
  return { einst: b.einst, firma, flotte, ku };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kennung } = await params;
  const d = await lade(kennung);
  if (!d) return { title: 'Nicht gefunden', robots: NICHT_FINDEN };
  const name = d.firma.name || 'Fahrzeugvermietung';
  return {
    title: `Fahrzeuge mieten bei ${name}${d.firma.ort ? ' in ' + d.firma.ort : ''}`,
    description: `${d.flotte.length} Mietfahrzeuge bei ${name}${d.firma.ort ? ', ' + d.firma.ort : ''}. Preise, Bedingungen und unverbindliche Anfrage.`,
    robots: d.einst.google ? { index: true, follow: true } : NICHT_FINDEN,
    alternates: d.einst.google ? { canonical: basisAdresse() + mietPfad(kennung) } : undefined,
  };
}

export default async function MietenPage({ params }: Props) {
  const { kennung } = await params;
  const d = await lade(kennung);
  if (!d) notFound();
  return (
    <BoerseSeite firma={d.firma} fussHinweis="Alle Angaben nach bestem Wissen. Eine Anfrage über diese Seite ist unverbindlich und keine Buchung. Maßgeblich sind der Mietvertrag und die Mietbedingungen des Vermieters.">
      <h1 style={st.h1}>Fahrzeuge mieten</h1>
      <p style={{ ...st.dim, margin: '0 0 6px' }}>
        Wählen Sie ein Fahrzeug und Ihren Wunschzeitraum und senden Sie uns eine <b>unverbindliche Anfrage</b>. Wir prüfen sie und melden uns —
        reserviert ist das Fahrzeug erst mit unserer Bestätigung. Online wird nichts bezahlt.
      </p>
      <p style={{ ...st.klein, margin: '0 0 16px' }}>{steuerHinweis(d.ku)}</p>
      {d.flotte.length === 0
        ? <div style={st.box}>Gerade ist kein Fahrzeug online buchbar. Rufen Sie uns gerne an.</div>
        : <MietListe k={kennung} flotte={d.flotte} ku={d.ku} firma={d.firma.name || null} akzent={d.firma.akzent} hinweis={datenschutzHinweis(d.firma)} />}
    </BoerseSeite>
  );
}
