// ============================================================================
// ARGONAUT OS · lib/dossierFunnel.ts
// Wiederverwendbare Logik für den Dossier-Double-Opt-in. Ein Andockpunkt für:
//  • die öffentliche Route /api/oeffentlich/dossier-optin (direkte Anforderung)
//  • /api/website-anfrage (automatisch nach Termin-Anfrage UND 7-Tage-Test)
// Legt/aktualisiert dossier_leads und verschickt Bestätigungs- bzw.
// (falls schon bestätigt) direkt die Auslieferungsmail. Idempotent per E-Mail.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { sendeMail } from './mail';
import { emailNormalisieren, istEmailGueltig } from './newsletter';
import { dossierBestaetigenHtml, dossierAusliefernHtml } from './dossierMail';

const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

export type DossierOptinResult = 'ungueltig' | 'bereits' | 'bestaetigung_gesendet' | 'fehler';

/**
 * Startet (oder wiederholt) den Dossier-Double-Opt-in für eine E-Mail.
 * quelle: woher der Lead kommt ('dossier' | 'termin' | 'test' | …) — nur zur Auswertung.
 * Wirft nie; gibt ein Ergebnis-Kürzel zurück (Aufrufer kann es ignorieren).
 */
export async function starteDossierOptin(
  emailRoh: unknown,
  name: string | null = null,
  branche: string | null = null,
  quelle: string = 'dossier',
): Promise<DossierOptinResult> {
  const email = emailNormalisieren(typeof emailRoh === 'string' ? emailRoh : undefined);
  if (!istEmailGueltig(email)) return 'ungueltig';

  try {
    const db = admin();
    const { data: vorhanden } = await db.from('dossier_leads').select('id, status').eq('email', email).maybeSingle();
    const v = vorhanden as { id: string; status: string } | null;

    // Schon bestätigt -> Dossier direkt (nochmal) senden, keine neue DOI-Mail.
    if (v && v.status === 'aktiv') {
      await sendeMail({ an: email, betreff: 'Ihr ARGONAUT-Dossier', html: dossierAusliefernHtml(name, branche) });
      return 'bereits';
    }

    const token = randomUUID();
    if (v) {
      await db.from('dossier_leads').update({ status: 'unbestaetigt', token, name, branche, bestaetigt_am: null }).eq('id', v.id);
    } else {
      await db.from('dossier_leads').insert({ email, name, branche, status: 'unbestaetigt', token, quelle });
    }

    const url = `${BASIS_URL}/api/oeffentlich/dossier-bestaetigen?token=${token}`;
    await sendeMail({ an: email, betreff: 'Bitte bestätige deine Anfrage — ARGONAUT OS', html: dossierBestaetigenHtml(name, url) });
    return 'bestaetigung_gesendet';
  } catch {
    return 'fehler';
  }
}
