// ============================================================================
// ARGONAUT OS · app/api/text-motor/route.ts — EIN Text-Motor (Paket PC)
//
//   POST { schritt: 'gliederung', art: 'ebook', eingabe }
//     -> { ok, gliederung }
//   POST { schritt: 'kapitel', art: 'ebook', eingabe, gliederung, index }
//     -> { ok, text, hinweise }
//   POST { schritt: 'einzel', art: 'ratgeber' | 'presse' | 'strategie', eingabe }
//     -> { ok, ergebnis, hinweise, seo? }
//
// Die Route schreibt nur Entwürfe — sie speichert nichts und veröffentlicht
// nichts. Regeln, Prompts, Prüfungen: lib/textMotor.ts (getestet).
// Jeder Aufruf läuft durch kiFetch (Firmen-Topf, Minuten-Bremse, Demo-Deckel,
// Kosten-Protokoll). Nur eingeloggt.
//
// Ein E-Book wird KAPITEL FÜR KAPITEL geschrieben, nicht in einem Aufruf:
// sonst läuft ein 8-Kapitel-Buch in die Zeitgrenze, und bei einem Fehler wäre
// alles weg statt nur ein Kapitel.
// ============================================================================
import { NextResponse } from 'next/server';
import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import {
  istTextArt, pruefeEingabe, promptGliederung, promptKapitel, promptEinzel,
  leseGliederung, leseEinzeltext, saubererMarkdown, pruefeText, seoPruefung,
  modellFuer, maxTokensFuer, type Firma, type Gliederung,
} from '@/lib/textMotor';

export const runtime = 'nodejs';
export const maxDuration = 120;

function fehler(meldung: string, status = 400) {
  return NextResponse.json({ ok: false, error: meldung }, { status });
}

async function frage(route: string, modell: string, maxTokens: number, system: string, nutzer: string): Promise<{ ok: true; text: string } | { ok: false; status: number }> {
  const res = await kiFetch(route, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: modell, max_tokens: maxTokens, system, messages: [{ role: 'user', content: nutzer }] }),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  const bloecke: Array<{ type?: string; text?: string }> = Array.isArray(data?.content) ? data.content : [];
  return { ok: true, text: bloecke.filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim() };
}

function kiFehler(status: number) {
  return fehler(status === 429 ? 'Zu viele KI-Anfragen oder das Tages-Kontingent ist erreicht — bitte kurz warten.' : 'Der Text konnte nicht erstellt werden. Bitte erneut versuchen.', 502);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fehler('Ungültige Anfrage.'); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fehler('Nicht eingeloggt.', 401);
  if (!process.env.ANTHROPIC_API_KEY) return fehler('Die KI ist derzeit nicht eingerichtet.', 500);

  const art = body.art;
  if (!istTextArt(art)) return fehler('Unbekannte Textart.');
  const geprueft = pruefeEingabe((body.eingabe ?? {}) as Record<string, unknown>);
  if (!geprueft.ok) return fehler(geprueft.fehler);
  const eingabe = geprueft.eingabe;

  // Firmendaten — best effort, select('*') damit eine fehlende Spalte nichts bricht.
  const firma: Firma = { name: '', branche: '', ort: '' };
  try {
    const { data: ci } = await supabase.from('web_ci').select('*').eq('owner_user_id', user.id).maybeSingle();
    const c = (ci ?? {}) as Record<string, unknown>;
    firma.name = String(c.firma ?? '').trim();
    firma.ort = String(c.ort ?? '').trim();
  } catch { /* egal */ }
  try {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    const pr = (p ?? {}) as Record<string, unknown>;
    if (!firma.name) firma.name = String(pr.firma_name ?? '').trim();
    if (!firma.ort) firma.ort = String(pr.firma_ort ?? '').trim();
    firma.branche = String(pr.branche ?? '').trim();
  } catch { /* egal */ }

  const schritt = String(body.schritt ?? '');

  try {
    if (schritt === 'gliederung') {
      if (art !== 'ebook') return fehler('Eine Gliederung gibt es nur für das E-Book.');
      const p = promptGliederung(eingabe, firma);
      const r = await frage('text-motor-gliederung', modellFuer('gliederung'), maxTokensFuer('gliederung'), p.system, p.nutzer);
      if (!r.ok) return kiFehler(r.status);
      const gliederung = leseGliederung(r.text, eingabe.kapitelZahl);
      if (!gliederung) return fehler('Die Gliederung war nicht lesbar. Bitte noch einmal erzeugen.', 502);
      return NextResponse.json({ ok: true, gliederung });
    }

    if (schritt === 'kapitel') {
      if (art !== 'ebook') return fehler('Kapitel gibt es nur für das E-Book.');
      const g = body.gliederung as Gliederung | undefined;
      const index = Math.round(Number(body.index));
      if (!g || !Array.isArray(g.kapitel) || !Number.isInteger(index) || index < 0 || index >= g.kapitel.length) {
        return fehler('Gliederung oder Kapitelnummer fehlt.');
      }
      // Die Gliederung kommt vom Browser — Längen hart begrenzen, bevor sie in den Prompt geht.
      const sicher: Gliederung = {
        titel: String(g.titel ?? '').slice(0, 140),
        untertitel: String(g.untertitel ?? '').slice(0, 200),
        kapitel: g.kapitel.slice(0, 10).map((k) => ({
          titel: String(k?.titel ?? '').slice(0, 120),
          punkte: Array.isArray(k?.punkte) ? k.punkte.slice(0, 5).map((x) => String(x).slice(0, 200)) : [],
        })),
      };
      const p = promptKapitel(eingabe, firma, sicher, index);
      const r = await frage('text-motor-kapitel', modellFuer('kapitel'), maxTokensFuer('kapitel'), p.system, p.nutzer);
      if (!r.ok) return kiFehler(r.status);
      const text = saubererMarkdown(r.text);
      if (!text) return fehler('Das Kapitel kam leer zurück. Bitte erneut versuchen.', 502);
      return NextResponse.json({ ok: true, text, hinweise: pruefeText(text) });
    }

    if (schritt === 'einzel') {
      if (art === 'ebook') return fehler('Das E-Book entsteht über Gliederung und Kapitel.');
      const heute = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
      const p = promptEinzel(art, eingabe, firma, heute);
      const r = await frage(`text-motor-${art}`, modellFuer('einzel'), maxTokensFuer('einzel', art), p.system, p.nutzer);
      if (!r.ok) return kiFehler(r.status);
      const ergebnis = leseEinzeltext(r.text);
      if (!ergebnis) return fehler('Der Text war nicht lesbar. Bitte noch einmal erzeugen.', 502);
      return NextResponse.json({
        ok: true,
        ergebnis,
        hinweise: pruefeText([ergebnis.titel, ergebnis.beschreibung, ergebnis.text, ...ergebnis.faq.map((f) => f.frage + ' ' + f.antwort)].join('\n')),
        ...(art === 'ratgeber' ? { seo: seoPruefung(ergebnis, eingabe.keyword) } : {}),
      });
    }

    return fehler('Unbekannter Schritt.');
  } catch (e) {
    console.error('[text-motor]', e instanceof Error ? e.message : e);
    return fehler('Interner Fehler.', 500);
  }
}
