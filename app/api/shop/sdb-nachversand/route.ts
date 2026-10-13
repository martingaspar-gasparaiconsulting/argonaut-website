// ============================================================================
// ARGONAUT OS · /api/shop/sdb-nachversand  (Paket 328 · S5)
//
//   GET  ?artikelId=…  -> { empfaenger: [{ email, name, sprache, fassung }], frei }
//   POST { artikelId } -> { gesendet, fehler }
//
// REACH Art. 31 Abs. 9: Eine neue Fassung des Sicherheitsdatenblatts geht an
// alle, die den Stoff in den letzten 12 Monaten bekommen haben. Die Empfänger
// kommen aus dem Versand-Nachweis (sdb_versand); wer die aktuelle Fassung in
// seiner Sprache schon hat, bekommt nichts.
//
// Wer darf: nur die Geschäftsleitung (Mails an Kunden im Namen des Betriebs).
// Senden erst nach der Freigabe durch den Anwalt (startSperre „sdbVersand", R49);
// die Vorschau (GET) geht immer. Jede Sendung landet im Nachweis.
// ============================================================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendeMail, kundenMailLayout } from '@/lib/mail';
import { escapeHtml } from '@/lib/newsletter';
import { startFrei, startSperrGrund } from '@/lib/startSperre';
import { ladeFreigabeStand } from '@/lib/freigabeServer';
import { pfadPasst } from '@/lib/produktDokumente';
import { anhangName, nachversandPlan, type SdbDok, type VersandZeile } from '@/lib/sdbVersand';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function KEIN(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function vorbereiten(artikelId: string | null) {
  if (!artikelId || !UUID.test(artikelId)) return { fehler: KEIN(400, 'Artikel fehlt.') };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { fehler: KEIN(401, 'Nicht angemeldet.') };
  const { data: chef } = await supabase.rpc('mein_chef_id');
  if (chef) return { fehler: KEIN(403, 'Den Nachversand startet nur die Geschäftsleitung.') };
  const betrieb = user.id;
  const db = createAdminClient();
  const { data: art } = await db.from('artikel').select('id, bezeichnung').eq('id', artikelId).eq('owner_user_id', betrieb).maybeSingle();
  if (!art) return { fehler: KEIN(404, 'Artikel nicht gefunden.') };
  const [{ data: doks }, { data: versand, error: vErr }] = await Promise.all([
    db.from('produkt_dokument').select('id, artikel_id, sprache, version, datei_bytes, datei_pfad')
      .eq('owner_user_id', betrieb).eq('artikel_id', artikelId).eq('art', 'sdb').eq('aktuell', true).limit(50),
    db.from('sdb_versand').select('artikel_id, dokument_id, empfaenger_email, empfaenger_name, status, versendet_am, sprache')
      .eq('owner_user_id', betrieb).eq('artikel_id', artikelId).order('versendet_am', { ascending: false }).limit(5000),
  ]);
  if (vErr) return { fehler: KEIN(500, 'Der Versand-Nachweis fehlt noch. Läuft das SQL zu Paket 328 schon?') };
  const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  const plan = nachversandPlan((versand as VersandZeile[]) ?? [], artikelId, (doks as SdbDok[]) ?? [], heute);
  return { db, betrieb, art: art as { id: string; bezeichnung: string | null }, plan };
}

export async function GET(req: Request) {
  try {
    const v = await vorbereiten(new URL(req.url).searchParams.get('artikelId'));
    if ('fehler' in v) return v.fehler;
    return NextResponse.json({
      empfaenger: v.plan.map((e) => ({ email: e.email, name: e.name, sprache: e.sprache, fassung: e.dok.version ?? null })),
      frei: startFrei('sdbVersand', (await ladeFreigabeStand()).start),
      grund: startSperrGrund('sdbVersand', (await ladeFreigabeStand()).start),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('shop/sdb-nachversand GET:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Interner Fehler.');
  }
}

export async function POST(req: Request) {
  try {
    const freigabe = (await ladeFreigabeStand()).start; // Paket 346: Code ODER Freigabe-Zentrale
    if (!startFrei('sdbVersand', freigabe)) return KEIN(403, startSperrGrund('sdbVersand', freigabe) || 'Noch nicht freigeschaltet.');
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const v = await vorbereiten(typeof b?.artikelId === 'string' ? b.artikelId : null);
    if ('fehler' in v) return v.fehler;
    const { db, betrieb, art, plan } = v;
    if (!plan.length) return NextResponse.json({ gesendet: 0, fehler: 0 });

    const { data: ci } = await db.from('web_ci').select('firma').eq('owner_user_id', betrieb).maybeSingle();
    const firma = String((ci as { firma?: string } | null)?.firma ?? '').trim();
    const pdf = new Map<string, Buffer | null>();
    let gesendet = 0;
    let fehler = 0;
    for (const e of plan) {
      if (!pdf.has(e.dok.id)) {
        const pfad = String(e.dok.datei_pfad ?? '');
        const dl = pfadPasst(pfad, betrieb, art.id) ? await db.storage.from('produkt-dokumente').download(pfad) : { data: null };
        const buf = dl.data ? Buffer.from(await (dl.data as Blob).arrayBuffer()) : null;
        pdf.set(e.dok.id, buf && buf.subarray(0, 5).toString('latin1') === '%PDF-' ? buf : null);
      }
      const inhalt = pdf.get(e.dok.id);
      if (!inhalt) { fehler++; continue; }
      const html = kundenMailLayout(
        firma, null,
        'Aktualisiertes Sicherheitsdatenblatt',
        `<p style="margin:0 0 12px;">Guten Tag${e.name ? ' ' + escapeHtml(e.name.split(' ')[0]) : ''},</p>
         <p style="margin:0 0 12px;">zu <b>${escapeHtml(art.bezeichnung || 'Ihrem Produkt')}</b>, das Sie in den letzten zwölf Monaten bei uns bezogen haben, gibt es eine neue Fassung des Sicherheitsdatenblatts. Sie finden sie im Anhang.</p>
         <p style="margin:0;">Beste Grüße${firma ? '<br>' + escapeHtml(firma) : ''}</p>`,
      );
      let ok = false;
      try {
        const r = await sendeMail({ an: e.email, betreff: `Neues Sicherheitsdatenblatt: ${String(art.bezeichnung || 'Produkt').slice(0, 80)}`, html, betriebId: betrieb, kundenPost: true,
          anhaenge: [{ dateiname: anhangName(art.bezeichnung, e.dok), inhalt, typ: 'application/pdf' }] });
        ok = r.ok;
      } catch { ok = false; }
      ok ? gesendet++ : fehler++;
      const { error } = await db.from('sdb_versand').insert({
        owner_user_id: betrieb, artikel_id: art.id, dokument_id: e.dok.id, dokument_version: e.dok.version ?? null,
        sprache: e.sprache, empfaenger_email: e.email, empfaenger_name: e.name, anlass: 'nachversand', status: ok ? 'versendet' : 'fehler',
      });
      if (error) console.error('shop/sdb-nachversand Nachweis:', error.message);
    }
    return NextResponse.json({ gesendet, fehler }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('shop/sdb-nachversand POST:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Interner Fehler.');
  }
}
