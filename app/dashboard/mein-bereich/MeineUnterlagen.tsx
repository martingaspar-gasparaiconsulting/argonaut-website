'use client';

// ============================================================
// ARGONAUT OS · Mein Bereich → „Meine Unterlagen" (Paket A1)
// Der Mitarbeiter sieht hier seine Verträge, Lohnabrechnungen und Zeugnisse —
// aber NUR, was der Chef unter Personal → Person → Dokumente freigegeben hat
// (hr_dokumente.fuer_mitarbeiter), plus was er selbst hochgeladen hat
// (z. B. Krankmeldung). Doppelt gesichert: Zugriffsregel in der Datenbank
// (SQL A1 Teil 2) und Filter hier (lib/personalakte.ts, getestet).
// Nur lesen und öffnen — löschen oder ändern kann der Mitarbeiter hier nichts.
// ============================================================

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { gruppiereDokumente, sichtbarFuerMitarbeiter, type MeinDok } from '@/lib/personalakte';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const BUCKET = 'hr-dokumente';

const C = {
  navySoft: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', text: '#E8EDF4', textDim: '#8FA3BE',
  line: 'rgba(201,168,76,0.18)', danger: '#E06666',
};

type Zeile = MeinDok & { storage_pfad: string };

function dStr(d: string | null): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; }
}

export default function MeineUnterlagen({ maId }: { maId: string }) {
  const [docs, setDocs] = useState<Zeile[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [bereit, setBereit] = useState(true);
  const [meldung, setMeldung] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id ?? null;
      const r = await supabase.from('hr_dokumente')
        .select('id,dateiname,kategorie,hochgeladen_am,storage_pfad,fuer_mitarbeiter,hochgeladen_von')
        .eq('mitarbeiter_id', maId)
        .order('hochgeladen_am', { ascending: false });
      if (!aktiv) return;
      if (r.error) {
        // Spalten fehlen = SQL A1 noch nicht gelaufen. Dann lieber nichts zeigen als zu viel.
        setBereit(false);
        setDocs([]);
      } else {
        const zeilen: unknown = r.data;
        const liste = Array.isArray(zeilen) ? (zeilen as Zeile[]) : [];
        setDocs(liste.filter((d) => sichtbarFuerMitarbeiter(d, uid)));
      }
      setGeladen(true);
    })();
    return () => { aktiv = false; };
  }, [maId]);

  async function oeffnen(d: Zeile) {
    setMeldung(null);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_pfad, 60);
    if (error || !data) { setMeldung('Die Datei konnte nicht geöffnet werden. Bitte wenden Sie sich an Ihren Chef.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  const gruppen = gruppiereDokumente(docs) as { kategorie: string; label: string; docs: Zeile[] }[];

  return (
    <section style={{ background: C.navySoft, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, marginTop: 18 }}>
      <h2 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(18px, 1.56vw, 25px)', fontWeight: 700, margin: '0 0 6px', color: C.text }}>
        Meine Unterlagen
      </h2>
      <div style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', marginBottom: 12 }}>
        Verträge, Lohnabrechnungen und Zeugnisse, die Ihr Chef für Sie freigegeben hat. Fehlt etwas — zum Beispiel eine ältere Abrechnung für die Bank —, fragen Sie Ihren Chef: Er gibt sie unter Personal frei.
      </div>
      {!geladen && <div style={{ color: C.textDim, padding: '8px 0' }}>Lädt …</div>}
      {geladen && !bereit && (
        <div style={{ color: C.textDim, padding: '8px 0' }}>Dieser Bereich wird gerade eingerichtet.</div>
      )}
      {geladen && bereit && gruppen.length === 0 && (
        <div style={{ color: C.textDim, padding: '8px 0' }}>Noch keine Unterlagen freigegeben.</div>
      )}
      {meldung && <div style={{ color: C.danger, padding: '6px 0' }}>{meldung}</div>}
      {gruppen.map((g) => (
        <div key={g.kategorie} style={{ marginBottom: 12 }}>
          <div style={{ color: C.gold, fontWeight: 700, fontSize: 'clamp(14px, 1.25vw, 20px)', marginBottom: 4 }}>{g.label}</div>
          {g.docs.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.dateiname}>{d.dateiname}</div>
                <div style={{ color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)' }}>abgelegt am {dStr(d.hochgeladen_am)}</div>
              </div>
              <button
                onClick={() => oeffnen(d)}
                style={{ flexShrink: 0, background: 'transparent', color: C.cyan, border: '1px solid rgba(0,229,255,0.35)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
              >
                Öffnen
              </button>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
