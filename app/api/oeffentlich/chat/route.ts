// ============================================================================
// ARGONAUT OS · /api/oeffentlich/chat  (Webshop · KI-Verkaufs-Chatbot)
// ÖFFENTLICH (login-frei). Beantwortet Besucherfragen im Shop — kennt die
// freigeschalteten Produkte (Name/Preis/Kurztext/Bestand) und den Betrieb.
// Inhaber sicher über oeffentlich_id aus web_seiten (status=live). Läuft über
// kiFetch (Kosten protokolliert, haiku). Erfindet keine Produkte/Preise.
// Missbrauchs-Schutz: Frage ≤500 Zeichen, Verlauf ≤8, max_tokens klein.
// AI-Act: der Bot ist im Widget klar als KI gekennzeichnet.
// Body: { seite, frage, verlauf?: [{role:'user'|'assistant', text}] }
// Antwort: { antwort } | { error }
//
// G1 (09.09.2026): laeuft jetzt AUCH auf fremden Kundenwebsites. Dafuer eine
// Herkunftspruefung gegen `web_seiten.chat_domains` — ohne sie koennte jede
// beliebige Seite den Bot auf unsere Rechnung laufen lassen. Der Browser-CORS
// ist dabei nur die sichtbare Folge; die Kostenbremse ist die Pruefung selbst,
// die auch greift, wenn jemand die Anfrage ohne Browser stellt.
// Aufrufe OHNE Origin (gleiche Herkunft, also unsere eigenen /p/-Seiten)
// bleiben unveraendert erlaubt.
//
// G3 (09.09.2026): der Betrieb waehlt in `dialog_einstellung` je Kanal, ob der
// Bot AUSKUNFT gibt (alles wie bisher, Zeile fuer Zeile unveraendert) oder als
// SETTER ein Ziel verfolgt. Ohne Zeile, bei Unsinn in der Zeile oder bei
// rolle='auskunft' laeuft exakt der alte Weg — der Setter ist ein Zusatz,
// nie ein Umbau.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { kiFetch } from '@/lib/ki';
import { originErlaubt } from '@/lib/chatEinbetten';
import {
  leseEinstellung,
  gespraechsStand,
  baueSetterSystemtext,
  bereinigeAntwort,
  leseErfasst,
  baueMarke,
  istVollstaendig,
  baueAusbeute,
  lohntLead,
} from '@/lib/setter';
import { baueLead, buchungsLink, abschlussText } from '@/lib/setterHandeln';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** CORS-Kopfzeilen fuer genau EINEN erlaubten Ursprung. Nie '*'. */
function corsKopf(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

/**
 * Der Vorab-Aufruf des Browsers (Preflight). Er kommt vor dem eigentlichen
 * POST und ohne Body — die Seiten-Kennung steckt hier nur im Query-Teil.
 * Ohne bekannte Kennung antworten wir freundlich mit 204 ohne CORS-Kopf:
 * der Browser bricht dann ab, und wir haben keine Datenbank angefasst.
 */
export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin') || '';
  const seite = new URL(req.url).searchParams.get('seite') || '';
  if (!origin || !seite) return new Response(null, { status: 204 });

  try {
    const db = admin();
    const { data } = await db.from('web_seiten').select('chat_domains, status').eq('oeffentlich_id', seite).maybeSingle();
    const row = data as { chat_domains?: string[] | null; status?: string } | null;
    if (!row || row.status !== 'live' || !originErlaubt(origin, row.chat_domains)) {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 204, headers: corsKopf(origin) });
  } catch {
    return new Response(null, { status: 204 });
  }
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}
function eur(n: number): string {
  return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

type ArtikelRow = { bezeichnung: string | null; verkaufspreis: number | null; shop_beschreibung: string | null; aktueller_bestand: number | null };
type VerlaufItem = { role?: string; text?: string };

export async function POST(req: Request) {
  const origin = req.headers.get('origin') || '';
  // Wird gesetzt, sobald die Herkunft geprueft ist. Ab da traegt JEDE Antwort
  // die Kopfzeilen — auch die Fehler, sonst sieht der Besucher auf der fremden
  // Seite statt der echten Meldung nur „Verbindung fehlgeschlagen“.
  let kopf: Record<string, string> = {};
  try {
    const body = await req.json().catch(() => ({}));
    const seite = (typeof body?.seite === 'string' ? body.seite : '').trim();
    const frage = (typeof body?.frage === 'string' ? body.frage : '').trim().slice(0, 500);
    const verlaufRoh: VerlaufItem[] = Array.isArray(body?.verlauf) ? body.verlauf : [];
    if (!seite || !frage) return NextResponse.json({ error: 'Bitte eine Frage stellen.' }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Der Berater ist gerade nicht verfügbar.' }, { status: 500 });

    const db = admin();
    const { data: s } = await db.from('web_seiten').select('owner_user_id, status, chat_domains').eq('oeffentlich_id', seite).maybeSingle();
    const inh = s as { owner_user_id?: string; status?: string; chat_domains?: string[] | null } | null;
    if (!inh || inh.status !== 'live' || !inh.owner_user_id) {
      return NextResponse.json({ error: 'Der Berater ist auf dieser Seite nicht aktiv.' }, { status: 404 });
    }
    const ownerId = inh.owner_user_id;

    // Fremde Herkunft? Dann muss sie eingetragen sein — sonst kostet uns eine
    // beliebige Seite bares Geld. Ohne Origin ist es unsere eigene Seite.
    if (origin) {
      if (!originErlaubt(origin, inh.chat_domains)) {
        return NextResponse.json(
          { error: 'Diese Website ist für den Berater nicht freigeschaltet.' },
          { status: 403 },
        );
      }
      kopf = corsKopf(origin);
    }

    const { data: ciRow } = await db.from('web_ci').select('firma, slogan, ueber_uns').eq('owner_user_id', ownerId).maybeSingle();
    const ci = ciRow as { firma?: string; slogan?: string; ueber_uns?: string } | null;
    const firma = (ci?.firma || 'unser Betrieb').toString().trim();

    const { data: artD } = await db
      .from('artikel')
      .select('bezeichnung, verkaufspreis, shop_beschreibung, aktueller_bestand')
      .eq('owner_user_id', ownerId).eq('im_shop', true)
      .order('bezeichnung', { ascending: true }).limit(40);
    const artikel = (artD as ArtikelRow[]) ?? [];

    const produktText = artikel.length
      ? artikel.map((a) => {
          const b = (a.bezeichnung || 'Produkt').toString();
          const p = Number(a.verkaufspreis) > 0 ? eur(Number(a.verkaufspreis)) : 'Preis auf Anfrage';
          const kurz = (a.shop_beschreibung || '').toString().replace(/\s+/g, ' ').slice(0, 140);
          const best = a.aktueller_bestand == null ? '' : `, Bestand ${a.aktueller_bestand}`;
          return `- ${b} — ${p}${best}${kurz ? ' — ' + kurz : ''}`;
        }).join('\n')
      : '(zurzeit keine Produkte im Shop hinterlegt)';

    const kontext = [ci?.slogan, ci?.ueber_uns].filter(Boolean).map((x) => String(x).slice(0, 300)).join(' ');

    // --- Auskunft oder Setter? --------------------------------------------
    // Eine fehlende Zeile ist der Normalfall, kein Fehler: dann bleibt es beim
    // Auskunftsgeber. Genauso bei jedem Datenbank-Zucken — der oeffentliche
    // Berater darf daran nicht sterben.
    let einstZeile: unknown = null;
    try {
      const { data } = await db
        .from('dialog_einstellung')
        .select('rolle, ziel, fragen, uebergabe_bei, buchung_slug')
        .eq('owner_user_id', ownerId)
        .eq('kanal', 'website')
        .eq('aktiv', true)
        .maybeSingle();
      einstZeile = data ?? null;
    } catch (e) {
      console.error('oeffentlich/chat dialog_einstellung nicht lesbar:', e);
    }
    const einst = leseEinstellung(einstZeile);
    const istSetter = einst.rolle === 'setter';
    const stand = istSetter ? gespraechsStand(verlaufRoh, einst, frage) : null;

    const system = istSetter && stand
      // Ohne Artikel KEINE Produktliste an den Setter: „(zurzeit keine Produkte
      // hinterlegt)" ist fuer einen Dachdecker keine Information, sondern Rauschen.
      ? baueSetterSystemtext({ firma, einst, stand, produktText: artikel.length ? produktText : undefined, kontext })
      : `Du bist ein freundlicher, ehrlicher Verkaufsberater im Onlineshop von ${firma}.${kontext ? ' Über den Betrieb: ' + kontext : ''}

Diese Produkte sind im Shop (Name — Preis — Bestand — Kurzinfo):
${produktText}

Regeln:
- Antworte KURZ und hilfreich, auf Deutsch, Sie-Ansprache.
- Empfiehl passende Produkte AUS DER LISTE mit Preis. ERFINDE KEINE Produkte, Preise oder Eigenschaften.
- Weißt du etwas nicht oder ist es nicht im Shop, sag es ehrlich und verweise freundlich auf das Kontaktformular der Seite.
- Du bist eine KI-Assistenz.`;

    // Verlauf (max. letzte 8) + aktuelle Frage in Anthropic-Nachrichten wandeln.
    const messages = verlaufRoh
      .slice(-8)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
      // Beim Setter fliegen die unsichtbaren Markierungen hier raus: Was er
      // schon weiss, steht ohnehin im Systemtext unter „Schon bekannt". Zweimal
      // dasselbe kostet nur Zeichen — und wuerde bei 800 die echte Antwort
      // abschneiden statt die Notiz.
      .map((m) => ({ role: m.role as 'user' | 'assistant', text: (istSetter ? bereinigeAntwort(m.text) : String(m.text)).slice(0, 800) }))
      .filter((m) => m.text.trim() !== '')
      .map((m) => ({ role: m.role, content: [{ type: 'text', text: m.text }] }));
    messages.push({ role: 'user', content: [{ type: 'text', text: frage }] });

    const kiRes = await kiFetch('oeffentlich-chat', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 500, system, messages }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error('oeffentlich/chat Fehler:', kiRes.status, t.slice(0, 200));
      return NextResponse.json({ error: 'Der Berater ist gerade überlastet. Bitte kurz später erneut.' }, { status: 502, headers: kopf });
    }

    const kiData = await kiRes.json();
    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(kiData.content) ? kiData.content : [];
    const antwort = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
    if (!antwort) return NextResponse.json({ error: 'Keine Antwort erhalten. Bitte erneut versuchen.' }, { status: 502, headers: kopf });

    if (!istSetter || !stand) return NextResponse.json({ antwort }, { headers: kopf });

    // ------------------------------------------------------------------
    // Setter-Nachlauf: merken, abschliessen, Lead anlegen
    // ------------------------------------------------------------------
    // Was die KI unsichtbar angehaengt hat, plus alles aus dem bisherigen
    // Verlauf. Der Besucher bekommt die Markierung nie zu sehen — sie geht als
    // eigenes Feld `merk` zurueck und haengt im Widget nur am GEMERKTEN Text.
    const gesamt = leseErfasst([...verlaufRoh, { role: 'assistant', text: antwort }]);

    // Interne Notiz, dass der Lead schon steht — sie darf nicht in der
    // Nachricht des Leads landen, deshalb raus, bevor sortiert wird.
    const schonNotiert = gesamt._lead === 'ja';
    delete gesamt._lead;

    const ausbeute = baueAusbeute(gesamt);
    const vollstaendig = istVollstaendig(einst.fragen, gesamt);
    // Nur beim UEBERGANG auf vollstaendig — sonst haenge der Abschlusssatz ab
    // jetzt an jeder weiteren Antwort.
    const geradeFertig = vollstaendig && !stand.vollstaendig;

    let sichtbar = bereinigeAntwort(antwort);

    // Der Weg in die echte Online-Buchung. Der Setter bucht NICHT selbst —
    // siehe die Begruendung in lib/setterHandeln.ts.
    if (geradeFertig && einst.ziel === 'termin') {
      const link = buchungsLink({ basis: new URL(req.url).origin, slug: einst.buchungSlug, ausbeute });
      // Nur wenn es den Link wirklich gibt. Ohne ihn hat die KI ihr Gespraech
      // schon selbst abgeschlossen — ein zweiter Schlusssatz waere Gestammel.
      if (link) {
        const satz = abschlussText({ ziel: 'termin', link, hatKontakt: lohntLead(ausbeute) });
        if (!sichtbar.includes(link)) sichtbar = `${sichtbar}\n\n${satz}`.trim();
      }
    }

    // Der Lead — einmal je Gespraech, und nur wenn ein Weg zurueck bekannt ist.
    // Auch bei der Uebergabe an einen Menschen: gerade dann darf die Anfrage
    // nicht im Chatfenster liegen bleiben.
    let notiert = schonNotiert;
    if (!schonNotiert && lohntLead(ausbeute) && (geradeFertig || stand.phase === 'uebergabe')) {
      const lead = baueLead({ ownerId, ausbeute, kanal: 'website' });
      lead.nachricht = lead.nachricht.slice(0, 5000);
      const { error: leadErr } = await db.from('leads').insert(lead);
      if (leadErr) {
        // Der Besucher hat trotzdem eine gute Antwort bekommen — der Chat darf
        // daran nicht scheitern. Aber es muss im Protokoll stehen.
        console.error('oeffentlich/chat Setter-Lead konnte nicht angelegt werden:', leadErr);
      } else {
        notiert = true;
      }
    }
    if (notiert) gesamt._lead = 'ja';

    return NextResponse.json({ antwort: sichtbar, merk: baueMarke(gesamt) }, { headers: kopf });
  } catch (e: unknown) {
    console.error('oeffentlich/chat interner Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500, headers: kopf });
  }
}
