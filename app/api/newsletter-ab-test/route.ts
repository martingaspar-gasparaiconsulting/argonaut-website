import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { sendeMail } from '@/lib/mail';
import { abmeldeUrl, newsletterMailHtml } from '@/lib/newsletter';
import { messeMit } from '@/lib/mailMessung';
import { pruefeMenge, teileAuf, phase, ergebnis, fehltZumStart } from '@/lib/abTest';

// ============================================================================
// ARGONAUT OS · app/api/newsletter-ab-test/route.ts   (3.15 Teil 2)
//
// Zwei Betreffzeilen an je einen Teil der Liste, warten, dann den Rest mit dem
// besseren Betreff. Jede Variante ist eine eigene Zeile in newsletter_versand
// — dort werden Öffnungen und Klicks ohnehin je Versand gezählt.
//
// POST { aktion: 'starten', betreff_a, betreff_b, inhalt, anteil? }
// POST { aktion: 'rest', test_id }
//
// ▄▄▄ DIE FALLE, DIE HIER ENTSCHÄRFT WIRD ▄▄▄
// Die Gruppen entstehen rechnerisch aus der Empfängerliste (lib/abTest.ts,
// deterministisch). Kommen zwischen Start und Rest-Versand NEUE Abonnenten
// dazu, wird die Liste länger — und dieselbe Rechnung teilt anders auf. Wer
// beim Start in Gruppe A war, könnte dann im Rest landen und die Mail ein
// zweites Mal bekommen.
// Deshalb wird beim Rest-Versand nur berücksichtigt, wer BEI START schon
// angemeldet war (angemeldet_am <= gestartet_am). Neue Abonnenten bekommen
// diesen Newsletter gar nicht — das ist richtig so, sie haben ihn nie
// erwartet.
//
// Demo-Konten verschicken nicht. Gemessen werden nur Summen, nie Personen.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Gleiche Obergrenze wie beim normalen Newsletter-Versand. */
const MAX_EMPFAENGER = 500;

type Abo = { email: string | null; abmelde_token: string | null; angemeldet_am: string | null };
type Profil = { demo?: boolean; firma_name?: string | null; firma_email?: string | null; firma_akzentfarbe?: string | null };

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'nicht angemeldet' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const aktion = String(body?.aktion ?? '').trim();

    const { data: profilRoh } = await supabase
      .from('profiles')
      .select('demo, firma_name, firma_email, firma_akzentfarbe')
      .eq('id', user.id)
      .maybeSingle();
    const p = (profilRoh ?? {}) as Profil;

    if (p.demo) {
      return NextResponse.json(
        { ok: false, error: 'Im Demo-Modus wird nichts verschickt.' },
        { status: 403 },
      );
    }

    const firmaName = (p.firma_name || '').trim() || 'Newsletter';
    const antwortAn = (p.firma_email || '').trim() || user.email || undefined;
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/+$/, '');

    /**
     * Legt die Protokollzeile an und verschickt daran entlang. Die Zeile
     * entsteht VOR dem Versand — sie liefert Kennung und Mess-Schlüssel, und
     * ein abgebrochener Lauf steht trotzdem im Protokoll (Muster aus
     * app/api/newsletter-versand/route.ts).
     */
    async function verschicke(betreff: string, inhalt: string, gruppe: Abo[]) {
      const { data: zeileRoh, error: zeileFehler } = await supabase
        .from('newsletter_versand')
        .insert({
          betreff,
          inhalt,
          empfaenger_anzahl: gruppe.length,
          erfolg_anzahl: 0,
          fehler_anzahl: 0,
        })
        .select('id, mess_schluessel')
        .maybeSingle();
      if (zeileFehler || !zeileRoh) return { id: null as string | null, erfolg: 0, fehler: gruppe.length };

      const zeile = zeileRoh as { id: string; mess_schluessel: string | null };
      const schluessel = zeile.mess_schluessel || '';
      let erfolg = 0;
      let fehler = 0;

      for (const a of gruppe) {
        if (!a.email) { fehler++; continue; }
        const roh = newsletterMailHtml(
          firmaName, betreff, inhalt,
          abmeldeUrl(origin, a.abmelde_token || ''),
          p.firma_akzentfarbe,
        );
        const html = schluessel ? messeMit(roh, origin, zeile.id, schluessel) : roh;
        const r = await sendeMail({ an: a.email, betreff, html, absenderName: firmaName, antwortAn });
        if (r.ok) erfolg++; else fehler++;
      }

      await supabase.from('newsletter_versand')
        .update({ erfolg_anzahl: erfolg, fehler_anzahl: fehler })
        .eq('id', zeile.id);

      return { id: zeile.id, erfolg, fehler };
    }

    // ------------------------------------------------------------ STARTEN
    if (aktion === 'starten') {
      const betreffA = String(body?.betreff_a ?? '').trim();
      const betreffB = String(body?.betreff_b ?? '').trim();
      const inhalt = String(body?.inhalt ?? '').trim();
      if (!inhalt) return NextResponse.json({ ok: false, error: 'Der Inhalt fehlt.' }, { status: 400 });

      const { data: abosRoh, error: ladeFehler } = await supabase
        .from('newsletter_abonnenten')
        .select('email, abmelde_token, angemeldet_am')
        .eq('status', 'aktiv');
      if (ladeFehler) return NextResponse.json({ ok: false, error: ladeFehler.message }, { status: 500 });

      const abos = ((abosRoh ?? []) as Abo[]).filter((a) => !!a.email);
      const fehlt = fehltZumStart(betreffA, betreffB, abos.length);
      if (fehlt.length > 0) {
        return NextResponse.json(
          { ok: false, error: 'Zum Start fehlt: ' + fehlt.join(' · '), befund: pruefeMenge(abos.length) },
          { status: 400 },
        );
      }
      if (abos.length > MAX_EMPFAENGER) {
        return NextResponse.json(
          { ok: false, error: `Zu viele Empfänger auf einmal (max. ${MAX_EMPFAENGER}).` },
          { status: 400 },
        );
      }

      const befund = pruefeMenge(abos.length);
      const anteil = Math.min(50, Math.max(1, Number(body?.anteil) || befund.empfohlenerAnteil));
      const streuwort = new Date().toISOString();          // macht jeden Lauf zu eigenen Gruppen
      const { a, b } = teileAuf(abos, anteil, streuwort);

      if (a.length === 0 || b.length === 0) {
        return NextResponse.json({ ok: false, error: 'Die Gruppen wären leer.' }, { status: 400 });
      }

      const gestartetAm = new Date().toISOString();
      const rA = await verschicke(betreffA, inhalt, a);
      const rB = await verschicke(betreffB, inhalt, b);

      const { data: test, error: testFehler } = await supabase
        .from('newsletter_ab_test')
        .insert({
          owner_user_id: user.id,
          betreff_a: betreffA, betreff_b: betreffB, inhalt,
          anteil, streuwort,
          versand_a_id: rA.id, versand_b_id: rB.id,
          gestartet_am: gestartetAm,
        })
        .select('id')
        .maybeSingle();
      if (testFehler) return NextResponse.json({ ok: false, error: testFehler.message }, { status: 500 });

      return NextResponse.json({
        ok: true,
        test_id: (test as { id: string } | null)?.id ?? null,
        gruppeA: rA.erfolg, gruppeB: rB.erfolg,
        fehler: rA.fehler + rB.fehler,
        wartet_auf: 'Ergebnis in einigen Stunden ansehen, dann den Rest senden.',
      });
    }

    // --------------------------------------------------------------- REST
    if (aktion === 'rest') {
      const testId = String(body?.test_id ?? '').trim();
      if (!testId) return NextResponse.json({ ok: false, error: 'Welcher Test?' }, { status: 400 });

      const { data: testRoh, error: testFehler } = await supabase
        .from('newsletter_ab_test').select('*').eq('id', testId).maybeSingle();
      if (testFehler || !testRoh) return NextResponse.json({ ok: false, error: 'Test nicht gefunden.' }, { status: 404 });

      const t = testRoh as Record<string, unknown>;
      const jetzt = new Date().toISOString();
      const wo = phase({ gestartet_am: t.gestartet_am, rest_gesendet_am: t.rest_gesendet_am }, jetzt);
      if (wo === 'abgeschlossen') return NextResponse.json({ ok: false, error: 'Der Rest ist längst raus.' }, { status: 400 });
      if (wo !== 'auswertbar') {
        return NextResponse.json({ ok: false, error: 'Noch zu früh — das Ergebnis wäre nicht belastbar.' }, { status: 400 });
      }

      const { data: va } = await supabase.from('newsletter_versand').select('*').eq('id', String(t.versand_a_id ?? '')).maybeSingle();
      const { data: vb } = await supabase.from('newsletter_versand').select('*').eq('id', String(t.versand_b_id ?? '')).maybeSingle();
      const e = ergebnis(va, vb);

      // NUR wer bei Start schon angemeldet war — sonst teilt dieselbe Rechnung
      // anders auf und jemand bekäme die Mail zweimal. Siehe Dateikopf.
      const { data: abosRoh, error: ladeFehler } = await supabase
        .from('newsletter_abonnenten')
        .select('email, abmelde_token, angemeldet_am')
        .eq('status', 'aktiv')
        .lte('angemeldet_am', String(t.gestartet_am ?? jetzt));
      if (ladeFehler) return NextResponse.json({ ok: false, error: ladeFehler.message }, { status: 500 });

      const abos = ((abosRoh ?? []) as Abo[]).filter((a) => !!a.email);
      const { rest } = teileAuf(abos, Number(t.anteil) || 20, String(t.streuwort ?? ''));
      if (rest.length === 0) {
        return NextResponse.json({ ok: false, error: 'Es bleibt niemand übrig.' }, { status: 400 });
      }

      const betreff = e.empfehlung === 'a' ? String(t.betreff_a ?? '') : String(t.betreff_b ?? '');
      const r = await verschicke(betreff, String(t.inhalt ?? ''), rest);

      await supabase.from('newsletter_ab_test').update({
        versand_rest_id: r.id,
        rest_gesendet_am: new Date().toISOString(),
        genommen: e.empfehlung,
        war_belastbar: e.sicher,
      }).eq('id', testId);

      return NextResponse.json({
        ok: true,
        gesendet: r.erfolg, fehler: r.fehler,
        genommen: e.empfehlung, betreff,
        war_belastbar: e.sicher,
        satz: e.satz,
      });
    }

    return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Fehlgeschlagen.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
