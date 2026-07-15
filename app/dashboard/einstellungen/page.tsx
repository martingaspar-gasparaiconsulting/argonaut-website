import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import EinstellungenClient, { type FirmaProfil } from './EinstellungenClient'
import ModulFreischaltung from './ModulFreischaltung'
import PasswortAendern from './PasswortAendern'
import AnfahrtEinstellungen from './AnfahrtEinstellungen'
import ApiSchluesselKarte from './ApiSchluesselKarte'

// ============================================================
// ARGONAUT OS · Einstellungen
//
// E1.7 — Rollen-Weiche ergaenzt.
//
// /dashboard/einstellungen steht auf "immer" — jeder eingeloggte Nutzer darf
// die Seite oeffnen. Richtig so: ein Mitarbeiter muss seine Kontodaten sehen.
// Falsch war, dass ihm dabei das FIRMENPROFIL entgegenkam: Bankverbindung,
// Steuernummer, USt-IdNr., der API-Schluessel-Tresor und der Starter-Modus,
// mit dem der Chef die Navigation konfiguriert.
//
// Ein Leck war es nicht — die RLS auf `profiles` erlaubt nur `auth.uid() = id`,
// der Mitarbeiter sah also nur seine eigene, leere Zeile mit Platzhaltern.
// Aber er haette die Karten nie zu Gesicht bekommen duerfen.
//
// Ab hier: Mitarbeiter sehen ihr Konto. Chefs sehen den Betrieb.
// ============================================================

export default async function EinstellungenPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  // Rollen-Weiche: ein mitarbeiter-Datensatz bedeutet Angestellter.
  // Kein Datensatz = Chef. Dieselbe Regel wie in proxy.ts und DashboardNav.
  const { data: mitarbeiter } = await supabase
    .from('mitarbeiter')
    .select('id, vorname, nachname')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (mitarbeiter) {
    return <MitarbeiterKonto email={user.email ?? ''} mitarbeiter={mitarbeiter as MitarbeiterZeile} />
  }

  const { data } = await supabase
    .from('profiles')
    .select('firma_name, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, firma_website, firma_rechtsform, firma_registergericht, firma_hrb, firma_geschaeftsfuehrer, firma_ust_id, firma_steuernummer, firma_iban, firma_bank, firma_bic, firma_akzentfarbe')
    .eq('id', user.id)
    .single()
  const profil = (data ?? {}) as FirmaProfil

  return (
    <div style={{ background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: 'clamp(26px, 2.25vw, 36px)', fontWeight: 900, margin: '0 0 8px' }}>Firmenprofil</h1>
          <p style={{ fontSize: 'clamp(14px, 1.25vw, 20px)', color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6, maxWidth: '640px' }}>
            Diese Daten erscheinen im Briefkopf Ihrer Angebote, Rechnungen und weiterer Dokumente. Einmal ausfüllen – ARGONAUT verwendet sie automatisch für alle erzeugten Dokumente.
          </p>
        </div>
        <EinstellungenClient profil={profil} />
        <AnfahrtEinstellungen />
        <ApiSchluesselKarte />
        <ModulFreischaltung />
        <PasswortAendern />
      </main>
    </div>
  )
}

type MitarbeiterZeile = { id: string; vorname: string | null; nachname: string | null }

/**
 * Was ein Angestellter in den Einstellungen sieht: sein Konto.
 * Kein Firmenprofil, keine Bankverbindung, kein Schluessel-Tresor,
 * kein Starter-Modus.
 */
function MitarbeiterKonto({ email, mitarbeiter }: { email: string; mitarbeiter: MitarbeiterZeile }) {
  const name = [mitarbeiter.vorname, mitarbeiter.nachname].filter(Boolean).join(' ') || '—'

  const karte: React.CSSProperties = {
    background: '#0F2036',
    border: '1px solid rgba(143,163,190,0.18)',
    borderRadius: '14px',
    padding: '22px 24px',
    marginBottom: '18px',
  }
  const label: React.CSSProperties = {
    fontSize: 'clamp(12px, 1.06vw, 17px)',
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '6px',
  }
  const wert: React.CSSProperties = { fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 600 }

  return (
    <div style={{ background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: '2px', textTransform: 'uppercase', color: '#C9A84C', fontWeight: 600, marginBottom: '6px' }}>
            ARGONAUT OS
          </div>
          <h1 style={{ fontSize: 'clamp(26px, 2.25vw, 36px)', fontWeight: 900, margin: '0 0 8px' }}>Mein Konto</h1>
          <p style={{ fontSize: 'clamp(14px, 1.25vw, 20px)', color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6, maxWidth: '640px' }}>
            Ihre persönlichen Zugangsdaten. Firmendaten, Bankverbindung und Systemeinstellungen pflegt der Betriebsinhaber.
          </p>
        </div>

        <div style={karte}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div>
              <div style={label}>Name</div>
              <div style={wert}>{name}</div>
            </div>
            <div>
              <div style={label}>Anmeldung</div>
              <div style={{ ...wert, fontFamily: 'monospace', fontSize: 'clamp(14px, 1.25vw, 20px)' }}>{email}</div>
            </div>
          </div>
        </div>

        <div style={karte}>
          <div style={{ ...label, marginBottom: '10px' }}>Passwort</div>
          <p style={{ fontSize: 'clamp(13.5px, 1.19vw, 19px)', color: 'rgba(255,255,255,0.6)', margin: '0 0 14px', lineHeight: 1.6 }}>
            Zum Ändern melden Sie sich ab und wählen auf der Anmeldeseite „Passwort vergessen". Sie erhalten eine E-Mail an {email}.
          </p>
          <a
            href="/auth/login"
            style={{
              display: 'inline-block',
              background: 'transparent',
              color: '#C9A84C',
              border: '1px solid rgba(201,168,76,0.4)',
              borderRadius: '10px',
              padding: '9px 16px',
              fontSize: 'clamp(14px, 1.25vw, 20px)',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Zur Anmeldeseite
          </a>
        </div>

        <div style={{ ...karte, background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.22)' }}>
          <p style={{ fontSize: 'clamp(13.5px, 1.19vw, 19px)', color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.6 }}>
            Ihre Arbeitszeiten, Urlaubsanträge und Dokumente finden Sie unter{' '}
            <a href="/dashboard/mein-bereich" style={{ color: '#00e5ff', fontWeight: 600 }}>Mein Bereich</a>.
          </p>
        </div>
      </main>
    </div>
  )
}
