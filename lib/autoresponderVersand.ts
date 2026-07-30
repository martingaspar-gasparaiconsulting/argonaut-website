// ============================================================================
// ARGONAUT OS · lib/autoresponderVersand.ts  (Autoresponder Paket 2a)
//
// GEMEINSAMER Versand-Baustein fuer den Autoresponder — genutzt von:
//   - dem taeglichen Cron (/api/cron/autoresponder)  -> faellige Schritte
//   - der Eintritt-Route (/api/autoresponder/eintragen) -> Tag-0 SOFORT
//
// SERVER-ONLY: importiert lib/mail (Resend-Key). Niemals in eine Client-
// Komponente importieren. Erwartet einen Supabase-Client mit Service-Role
// (umgeht RLS; setzt owner_user_id bei Inserts daher explizit).
// ============================================================================

import { sendeMail } from './mail';
import { autoresponderMailHtml, autoresponderAbmeldeUrl } from './newsletter';
import { faelligerSchritt, naechsterAktiverSchrittNachPosition, tageAddieren } from './autoresponder';

export type LaufRow = {
  id: string;
  owner_user_id: string;
  sequenz_id: string;
  email: string;
  name: string | null;
  abmelde_token: string;
  naechste_position: number;
  gestartet_am: string;
};

type Schritt = {
  id: string;
  position: number;
  verzoegerung_tage: number;
  betreff: string;
  inhalt: string;
  aktiv: boolean;
};

type Branding = { firma: string; email: string | undefined; akzent: string | null; demo: boolean };

/**
 * Verschickt fuer eine Liste von Laeufen jeweils den faelligen Schritt und
 * stellt den Lauf danach weiter (naechster Schritt oder 'fertig').
 * Sendet NICHT, wenn: Sequenz nicht 'aktiv', Konto = Demo, kein faelliger
 * Schritt mehr. Gibt Zaehler zurueck. Wirft nie (fehler werden protokolliert).
 */
export async function verschickeFaellige(
  admin: any,
  laeufe: LaufRow[],
  basisUrl: string,
): Promise<{ gesendet: number; fertig: number; uebersprungen: number }> {
  const seqCache = new Map<string, { status: string } | null>();
  const schritteCache = new Map<string, Schritt[]>();
  const brandingCache = new Map<string, Branding>();

  async function seqLaden(id: string) {
    if (!seqCache.has(id)) {
      const { data } = await admin.from('autoresponder_sequenz').select('status').eq('id', id).maybeSingle();
      seqCache.set(id, (data as { status: string } | null) ?? null);
    }
    return seqCache.get(id) ?? null;
  }
  async function schritteLaden(seqId: string): Promise<Schritt[]> {
    if (!schritteCache.has(seqId)) {
      const { data } = await admin
        .from('autoresponder_schritt')
        .select('id, position, verzoegerung_tage, betreff, inhalt, aktiv')
        .eq('sequenz_id', seqId);
      schritteCache.set(seqId, (data ?? []) as Schritt[]);
    }
    return schritteCache.get(seqId) ?? [];
  }
  async function brandingLaden(ownerId: string): Promise<Branding> {
    if (!brandingCache.has(ownerId)) {
      const { data } = await admin
        .from('profiles')
        .select('firma_name, firma_email, firma_akzentfarbe, full_name, demo')
        .eq('id', ownerId)
        .maybeSingle();
      const p = (data ?? {}) as {
        firma_name?: string | null;
        firma_email?: string | null;
        firma_akzentfarbe?: string | null;
        full_name?: string | null;
        demo?: boolean | null;
      };
      brandingCache.set(ownerId, {
        firma: (p.firma_name || '').trim() || (p.full_name || '').trim() || 'Info-Serie',
        email: (p.firma_email || '').trim() || undefined,
        akzent: p.firma_akzentfarbe ?? null,
        demo: !!p.demo,
      });
    }
    return brandingCache.get(ownerId)!;
  }

  let gesendet = 0;
  let fertig = 0;
  let uebersprungen = 0;

  for (const l of laeufe) {
    try {
      const seq = await seqLaden(l.sequenz_id);
      if (!seq || seq.status !== 'aktiv') {
        uebersprungen++;
        continue;
      }

      const branding = await brandingLaden(l.owner_user_id);
      if (branding.demo) {
        uebersprungen++;
        continue;
      }

      const schritte = await schritteLaden(l.sequenz_id);
      const schritt = faelligerSchritt(schritte, l.naechste_position);
      if (!schritt) {
        await admin.from('autoresponder_lauf').update({ status: 'fertig' }).eq('id', l.id);
        fertig++;
        continue;
      }

      const abmelde = autoresponderAbmeldeUrl(basisUrl, l.abmelde_token);
      const html = autoresponderMailHtml(branding.firma, schritt.betreff, schritt.inhalt, abmelde, branding.akzent);
      const jetzt = new Date().toISOString();
      const r = await sendeMail({
        an: l.email,
        betreff: schritt.betreff,
        html,
        absenderName: branding.firma,
        antwortAn: branding.email,
      });

      await admin.from('autoresponder_versand').insert({
        owner_user_id: l.owner_user_id,
        lauf_id: l.id,
        schritt_id: schritt.id,
        sequenz_id: l.sequenz_id,
        email: l.email,
        betreff: schritt.betreff,
        erfolg: r.ok,
        fehler: r.ok ? null : r.fehler,
      });
      if (r.ok) gesendet++;

      const naechster = naechsterAktiverSchrittNachPosition(schritte, schritt.position);
      if (naechster) {
        await admin
          .from('autoresponder_lauf')
          .update({
            naechste_position: naechster.position,
            naechster_versand_am: tageAddieren(l.gestartet_am, naechster.verzoegerung_tage),
            letzter_versand_am: jetzt,
          })
          .eq('id', l.id);
      } else {
        await admin.from('autoresponder_lauf').update({ status: 'fertig', letzter_versand_am: jetzt }).eq('id', l.id);
        fertig++;
      }
    } catch (e) {
      console.error('Autoresponder-Versand fehlgeschlagen', l.id, e instanceof Error ? e.message : e);
      uebersprungen++;
    }
  }

  return { gesendet, fertig, uebersprungen };
}
