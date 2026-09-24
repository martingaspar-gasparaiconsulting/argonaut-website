'use client';

// ============================================================
// ARGONAUT OS · SachbearbeiterErgebnis — Anzeige eines ausgewerteten
// Schreibens (Paket PA). Genutzt im Posteingang (E-Mail) und auf der Seite
// /dashboard/sachbearbeiter (Behördenbrief).
//
// Zeigt: Art, Klartext, was zu tun ist, Frist, Betrag, Aktenzeichen, Hinweise.
// Knöpfe — jeder tut GENAU EINE Sache und erst auf Klick:
//   · „Aufgabe anlegen"   -> /api/cockpit-action (aufgabe_anlegen, bestehend)
//   · „Als Vorgang merken"-> Tabelle post_vorgang (RLS: nur der eigene Nutzer)
//   · „Antwort übernehmen"-> reicht den Entwurf an den Aufrufer zurück
//                            (verschickt wird dort, von Hand)
// ============================================================

import { useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Ergebnis, AufgabeVorschlag } from '@/lib/sachbearbeiter';
import { datumDeutsch } from '@/lib/sachbearbeiter';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

const FARBE: Record<string, string> = { hoch: C.danger, mittel: C.warn, normal: C.green };
const WORT: Record<string, string> = { hoch: 'dringend', mittel: 'bald erledigen', normal: 'ohne Eile' };

export type SachbearbeiterAntwort = {
  ergebnis: Ergebnis;
  aufgabe: AufgabeVorschlag;
  vorgang: Record<string, unknown>;
};

function euro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function SachbearbeiterErgebnis({
  daten,
  onAntwort,
}: {
  daten: SachbearbeiterAntwort;
  /** Wird gesetzt, wenn ein Antwortentwurf übernommen werden kann. */
  onAntwort?: (text: string) => void;
}) {
  const { ergebnis: e, aufgabe, vorgang } = daten;
  const [aufgabeStatus, setAufgabeStatus] = useState<'' | 'laeuft' | 'ok' | 'fehler'>('');
  const [vorgangStatus, setVorgangStatus] = useState<'' | 'laeuft' | 'ok' | 'fehler'>('');
  const [meldung, setMeldung] = useState<string | null>(null);
  const [vorgangId, setVorgangId] = useState<string | null>(null);

  async function aufgabeAnlegen() {
    setAufgabeStatus('laeuft'); setMeldung(null);
    try {
      const r = await fetch('/api/cockpit-action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ aktion: { typ: 'aufgabe_anlegen', aufgaben: [{
          titel: aufgabe.titel,
          beschreibung: aufgabe.beschreibung,
          prioritaet: aufgabe.prioritaet,
          ...(aufgabe.faellig_am ? { faellig_am: aufgabe.faellig_am } : {}),
        }] } }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) { setAufgabeStatus('fehler'); setMeldung(j?.meldung || 'Die Aufgabe konnte nicht angelegt werden.'); return; }
      setAufgabeStatus('ok'); setMeldung(j.meldung || 'Aufgabe angelegt.');
      // War der Vorgang schon gemerkt, dort vermerken — best effort.
      if (vorgangId) void supabase.from('post_vorgang').update({ aufgabe_angelegt: true }).eq('id', vorgangId);
    } catch { setAufgabeStatus('fehler'); setMeldung('Verbindung fehlgeschlagen.'); }
  }

  async function vorgangMerken() {
    setVorgangStatus('laeuft'); setMeldung(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) { setVorgangStatus('fehler'); setMeldung('Nicht angemeldet.'); return; }
      const { data, error } = await supabase
        .from('post_vorgang')
        .insert({ ...vorgang, owner_user_id: uid, aufgabe_angelegt: aufgabeStatus === 'ok' })
        .select('id')
        .single();
      if (error) {
        setVorgangStatus('fehler');
        setMeldung(/post_vorgang/.test(error.message)
          ? 'Die Vorgangs-Liste ist noch nicht eingerichtet (SQL von Paket PA fehlt).'
          : 'Der Vorgang konnte nicht gespeichert werden.');
        return;
      }
      setVorgangId((data as { id: string }).id);
      setVorgangStatus('ok'); setMeldung('Vorgang gemerkt — zu finden unter „Sachbearbeiter".');
    } catch { setVorgangStatus('fehler'); setMeldung('Verbindung fehlgeschlagen.'); }
  }

  const farbe = FARBE[e.dringlichkeit] || C.textDim;

  return (
    <div style={s.karte}>
      <div style={s.kopf}>
        <span style={s.art}>{e.art.icon} {e.art.label}</span>
        <span style={{ ...s.ampel, color: farbe, borderColor: farbe }}>● {WORT[e.dringlichkeit]}</span>
        {e.absender && <span style={s.absender}>{e.absender}</span>}
      </div>

      <div style={s.klartext}>{e.zusammenfassung}</div>
      {e.wasTun && <div style={s.tun}><b>Zu tun:</b> {e.wasTun}</div>}

      <div style={s.fakten}>
        <div style={s.fakt}>
          <div style={s.faktLabel}>Frist</div>
          <div style={{ ...s.faktWert, color: e.frist || e.fristText ? farbe : C.textDim }}>
            {e.frist ? datumDeutsch(e.frist) : e.fristText ? `„${e.fristText}"` : 'keine genannt'}
          </div>
        </div>
        <div style={s.fakt}>
          <div style={s.faktLabel}>Betrag</div>
          <div style={s.faktWert}>{e.betrag !== null ? euro(e.betrag) : '—'}</div>
        </div>
        <div style={s.fakt}>
          <div style={s.faktLabel}>Aktenzeichen</div>
          <div style={s.faktWert}>{e.aktenzeichen || '—'}</div>
        </div>
      </div>

      {e.hinweise.length > 0 && (
        <ul style={s.hinweise}>
          {e.hinweise.map((h, i) => <li key={i}>{h}</li>)}
        </ul>
      )}

      <div style={s.tipp}>💡 {e.art.tipp}</div>

      <div style={s.knoepfe}>
        {onAntwort && e.antwortEntwurf && (
          <button style={s.primaer} onClick={() => onAntwort(e.antwortEntwurf)}>↩ Antwort übernehmen</button>
        )}
        {e.art.vorgang !== 'keiner' && (
          <button style={s.mini} onClick={() => void aufgabeAnlegen()} disabled={aufgabeStatus === 'laeuft' || aufgabeStatus === 'ok'}>
            {aufgabeStatus === 'ok' ? '✓ Aufgabe angelegt' : aufgabeStatus === 'laeuft' ? 'Lege an …' : `✚ Aufgabe anlegen${aufgabe.faellig_am ? ` (fällig ${datumDeutsch(aufgabe.faellig_am)})` : ''}`}
          </button>
        )}
        <button style={s.mini} onClick={() => void vorgangMerken()} disabled={vorgangStatus === 'laeuft' || vorgangStatus === 'ok'}>
          {vorgangStatus === 'ok' ? '✓ Gemerkt' : vorgangStatus === 'laeuft' ? 'Speichere …' : '📌 Als Vorgang merken'}
        </button>
        {e.art.vorgang === 'anfrage' && <a href="/dashboard/leads" style={s.mini}>🎯 Zu den Leads</a>}
        {e.art.vorgang === 'beleg' && <a href="/dashboard/eingangsbelege" style={s.mini}>🧾 Zur Beleg-Inbox</a>}
        {e.art.vorgang === 'reklamation' && <a href="/dashboard/service" style={s.mini}>🛠 Zum Service</a>}
        {e.art.vorgang === 'termin' && <a href="/dashboard/termine" style={s.mini}>🗓 Zu den Terminen</a>}
      </div>

      {meldung && (
        <div style={{ ...s.meldung, color: aufgabeStatus === 'fehler' || vorgangStatus === 'fehler' ? C.danger : C.green }}>{meldung}</div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  karte: { background: 'rgba(0,229,255,0.04)', border: `1px solid rgba(0,229,255,0.28)`, borderRadius: 14, padding: '16px 20px', margin: '0 0 18px' },
  kopf: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  art: { fontWeight: 800, color: '#fff', fontSize: 15.5 },
  ampel: { border: '1px solid', borderRadius: 999, padding: '2px 10px', fontSize: 12.5, fontWeight: 700 },
  absender: { color: C.textDim, fontSize: 13.5 },
  klartext: { color: C.text, fontSize: 15, lineHeight: 1.6 },
  tun: { color: C.text, fontSize: 14.5, lineHeight: 1.55, marginTop: 8 },
  fakten: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '14px 0 4px' },
  fakt: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px' },
  faktLabel: { color: C.textDim, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 },
  faktWert: { color: C.text, fontSize: 15, fontWeight: 700, marginTop: 3, wordBreak: 'break-word' },
  hinweise: { color: C.warn, fontSize: 13.5, lineHeight: 1.55, margin: '12px 0 0', paddingLeft: 18 },
  tipp: { color: C.textDim, fontSize: 13.5, marginTop: 10 },
  knoepfe: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' },
  meldung: { fontSize: 13.5, marginTop: 10 },
};
