'use client';

// ============================================================================
// ARGONAUT OS · Ablauf-Baukasten — Karten-Kette mit „+" (Paket 158, 28.09.2026)
// Pfad: app/dashboard/ablaeufe/_teile/AblaufEditor.tsx
//
// Nur Bedienoberfläche: alle Baum-Operationen stehen in lib/ablaufEditor.ts,
// die Prüfung in lib/ablauf.ts (pruefeAblauf). Gespeichert wird von der Seite.
// ============================================================================

import { useState, useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  TRIGGER, OPERATOR_LABEL, triggerDef,
  type Bedingung, type Operator, type FeldDef,
} from '@/lib/automation';
import {
  pruefeAblauf, ausloeserText, istGruppe, AUSLOESER_ARTEN, ablaufAktion, ausloeserHatVorgang, EREIGNISSE, aktionFelder,
  type Ablauf, type Ausloeser, type Schritt, type BedingungsGruppe, type SchrittAktion,
} from '@/lib/ablauf';
import {
  einfuegen, ersetzen, entfernen, verschieben, neuerSchritt, plusErlaubt, aktionenFuer, neuerAusloeser,
  bedingungDazu, bedingungAendern, bedingungWeg, verknuepfungSetzen, listeAn, AUSWAHL_TEXT, type NeuArt,
} from '@/lib/ablaufEditor';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const feld: CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(10,22,40,0.7)', color: C.text, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
const beschriftung: CSSProperties = { display: 'block', fontSize: 12.5, color: C.textDim, fontWeight: 700, marginBottom: 5 };
const knopf = (art: 'gold' | 'rand' | 'rot' = 'gold'): CSSProperties => ({
  padding: '8px 13px', borderRadius: 9, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
  border: art === 'gold' ? 'none' : `1px solid ${art === 'rot' ? 'rgba(224,102,102,0.5)' : C.border}`,
  background: art === 'gold' ? C.gold : 'transparent',
  color: art === 'gold' ? C.navy : art === 'rot' ? C.danger : C.text,
});
const klein: CSSProperties = { color: C.textDim, fontSize: 12.5, lineHeight: 1.5 };
const OPERATOREN: Operator[] = ['gleich', 'ungleich', 'groesser', 'groesser_gleich', 'kleiner', 'kleiner_gleich', 'enthaelt', 'leer', 'nicht_leer'];

export type Entwurf = Pick<Ablauf, 'name' | 'beschreibung' | 'ausloeser' | 'schritte'> & {
  id?: string; version?: number; aktiv?: boolean; vorlage_key?: string | null;
};

// ---------------------------------------------------------------------------
// Bedingungen (UND/ODER, eine Ebene verschachtelbar)
// ---------------------------------------------------------------------------
function GruppeEditor({ gruppe, felder, onChange, pfad = '', tiefe = 0 }: {
  gruppe: BedingungsGruppe; felder: FeldDef[]; onChange: (g: BedingungsGruppe) => void; pfad?: string; tiefe?: number;
}) {
  const hier = (pfad ? pfad.split('.').reduce<BedingungsGruppe>((g, i) => g.regeln[Number(i)] as BedingungsGruppe, gruppe) : gruppe);
  const erstes = felder[0]?.key ?? 'titel';
  return (
    <div style={{ borderLeft: tiefe ? `2px solid ${C.border}` : 'none', paddingLeft: tiefe ? 10 : 0, display: 'grid', gap: 7 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={klein}>Es muss</span>
        {(['und', 'oder'] as const).map((v) => (
          <button key={v} type="button" onClick={() => onChange(verknuepfungSetzen(gruppe, pfad, v))}
            style={{ ...knopf(hier.verknuepfung === v ? 'gold' : 'rand'), padding: '4px 10px', fontSize: 12.5 }}>
            {v === 'und' ? 'alles zutreffen (UND)' : 'eines zutreffen (ODER)'}
          </button>
        ))}
      </div>
      {hier.regeln.map((r, i) => {
        if (istGruppe(r)) {
          return (
            <div key={i}>
              <GruppeEditor gruppe={gruppe} felder={felder} onChange={onChange} pfad={pfad ? `${pfad}.${i}` : String(i)} tiefe={tiefe + 1} />
              <button type="button" onClick={() => onChange(bedingungWeg(gruppe, pfad, i))} style={{ ...knopf('rot'), padding: '4px 10px', fontSize: 12, marginTop: 4 }}>Gruppe entfernen</button>
            </div>
          );
        }
        const b = r as Bedingung;
        const fd = felder.find((x) => x.key === b.feld);
        const ohneWert = b.operator === 'leer' || b.operator === 'nicht_leer';
        const setze = (teil: Partial<Bedingung>) => onChange(bedingungAendern(gruppe, pfad, i, { ...b, ...teil }));
        return (
          <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={b.feld} onChange={(e) => setze({ feld: e.target.value, wert: '' })} style={{ ...feld, width: 'auto', flex: '1 1 160px' }}>
              {felder.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              {!fd && <option value={b.feld}>{b.feld}</option>}
            </select>
            <select value={b.operator} onChange={(e) => setze({ operator: e.target.value as Operator })} style={{ ...feld, width: 'auto', flex: '1 1 140px' }}>
              {OPERATOREN.map((o) => <option key={o} value={o}>{OPERATOR_LABEL[o]}</option>)}
            </select>
            {!ohneWert && (fd?.typ === 'auswahl' && fd.optionen ? (
              <select value={String(b.wert ?? '')} onChange={(e) => setze({ wert: e.target.value })} style={{ ...feld, width: 'auto', flex: '1 1 140px' }}>
                <option value="">— wählen —</option>
                {fd.optionen.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input value={String(b.wert ?? '')} onChange={(e) => setze({ wert: e.target.value })} placeholder={fd?.typ === 'zahl' ? 'z. B. 500' : 'Wert'} style={{ ...feld, width: 'auto', flex: '1 1 140px' }} />
            ))}
            <button type="button" onClick={() => onChange(bedingungWeg(gruppe, pfad, i))} style={{ ...knopf('rot'), padding: '6px 10px' }}>✕</button>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onChange(bedingungDazu(gruppe, pfad, { feld: erstes, operator: 'nicht_leer' }))} style={{ ...knopf('rand'), padding: '5px 10px', fontSize: 12.5 }}>＋ Bedingung</button>
        {tiefe < 2 && (
          <button type="button" onClick={() => onChange(bedingungDazu(gruppe, pfad, { verknuepfung: tiefe % 2 === 0 ? 'oder' : 'und', regeln: [{ feld: erstes, operator: 'nicht_leer' }] }))}
            style={{ ...knopf('rand'), padding: '5px 10px', fontSize: 12.5 }}>＋ Gruppe</button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Das „+" zwischen zwei Karten
// ---------------------------------------------------------------------------
function Plus({ schritte, listePfad, ausloeser, onWahl }: {
  schritte: Schritt[]; listePfad: string; ausloeser: Ausloeser; onWahl: (art: NeuArt, aktion?: string) => void;
}) {
  const [offen, setOffen] = useState(false);
  const aktionen = aktionenFuer(ausloeser);
  const mitVorgang = ausloeserHatVorgang(ausloeser);
  const eintrag = (label: string, erlaubt: boolean, tu: () => void, hinweis?: string) => (
    <button key={label} type="button" disabled={!erlaubt} onClick={() => { tu(); setOffen(false); }}
      style={{ ...knopf('rand'), padding: '5px 10px', fontSize: 12.5, opacity: erlaubt ? 1 : 0.45, cursor: erlaubt ? 'pointer' : 'not-allowed' }}
      title={hinweis}>{label}{hinweis ? ` · ${hinweis}` : ''}</button>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '4px 0' }}>
      <div style={{ width: 2, height: 10, background: C.border }} />
      <button type="button" aria-label="Schritt einfügen" onClick={() => setOffen((x) => !x)}
        style={{ width: 30, height: 30, borderRadius: 15, border: `1px solid ${C.gold}`, background: offen ? C.gold : 'transparent', color: offen ? C.navy : C.gold, fontWeight: 900, fontSize: 17, cursor: 'pointer', fontFamily: 'inherit' }}>＋</button>
      {offen && (
        <div style={{ marginTop: 6, padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: C.navy, display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 640, justifyContent: 'center' }}>
          {aktionen.map((a) => eintrag(a.label, a.imMotor && plusErlaubt(schritte, listePfad, 'aktion'), () => onWahl('aktion', a.key), a.imMotor ? undefined : 'folgt'))}
          {eintrag('Warten', plusErlaubt(schritte, listePfad, 'warten'), () => onWahl('warten'))}
          {eintrag('Wenn / Sonst', mitVorgang && plusErlaubt(schritte, listePfad, 'wenn'), () => onWahl('wenn'), mitVorgang ? undefined : 'nur mit Vorgang')}
          {eintrag('Stopp', plusErlaubt(schritte, listePfad, 'stopp'), () => onWahl('stopp'))}
        </div>
      )}
      <div style={{ width: 2, height: 10, background: C.border }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Einstellungen einer Aktion
// ---------------------------------------------------------------------------
function AktionFelder({ s, onChange }: { s: SchrittAktion; onChange: (s: SchrittAktion) => void }) {
  const felder = aktionFelder(s.aktion);
  const setze = (k: string, w: string) => onChange({ ...s, config: { ...s.config, [k]: w } });
  if (s.aktion === 'freigabe_chef') return <div style={klein}>Der Lauf hält hier an. Unter „Freigaben für Sie" entscheiden Sie: „✓ Freigeben" oder „✕ Ablehnen".</div>;
  if (felder.length === 0) return <div style={klein}>{ablaufAktion(s.aktion)?.hinweis ?? ''} Diesen Baustein führt der Motor noch nicht aus.</div>;
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {s.aktion === 'ki_schritt' && <div style={klein}>Der Baustein schreibt nur einen Entwurf — er erscheint unter „Ergebnisse aus Abläufen“ und wird nie verschickt. An den KI-Dienst geht nur dieser Auftrag mit den eingesetzten Platzhaltern.</div>}
      {s.aktion === 'webhook_senden' && <div style={klein}>Nur https, nur fremde Programme (z. B. n8n). Gesendet werden Ablauf, Vorgangs-Kennung, Nummer, Name und Betrag — weitere Felder nur, wenn Sie sie unten nennen. Bank-, Steuer-, Gesundheits- und Zugangsdaten gehen nie raus. Nur an Empfänger mit AVV.</div>}
      {felder.map((fd) => {
        if (fd.key === 'adresse' && s.config.an !== 'feste_adresse') return null;
        const wert = String(s.config[fd.key] ?? '');
        return (
          <div key={fd.key}>
            <label style={beschriftung}>{fd.label}{fd.pflicht || (fd.key === 'adresse') ? ' *' : ''}</label>
            {fd.typ === 'mehrzeilig' ? (
              <textarea value={wert} onChange={(e) => setze(fd.key, e.target.value)} rows={fd.key === 'text' ? 6 : 3} style={{ ...feld, resize: 'vertical' }} />
            ) : fd.typ === 'auswahl' && fd.optionen ? (
              <select value={wert} onChange={(e) => setze(fd.key, e.target.value)} style={feld}>
                {fd.optionen.map((o) => <option key={o} value={o}>{AUSWAHL_TEXT[o] ?? o}</option>)}
              </select>
            ) : (
              <input type={fd.typ === 'zahl' ? 'number' : 'text'} value={wert} onChange={(e) => setze(fd.key, e.target.value)} style={feld} />
            )}
          </div>
        );
      })}
      <div style={klein}>Platzhalter: {'{{name}}'}, {'{{nummer}}'}, {'{{betrag}}'}, {'{{datum}}'}, {'{{tage}}'}, {'{{heute}}'}, {'{{kunde.email}}'}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Die Kette (rekursiv für Dann/Sonst)
// ---------------------------------------------------------------------------
function Kette({ e, setSchritte, listePfad, felder }: {
  e: Entwurf; setSchritte: (s: Schritt[]) => void; listePfad: string; felder: FeldDef[];
}) {
  const liste = listeAn(e.schritte, listePfad) ?? [];
  const dazu = (index: number) => (art: NeuArt, aktion?: string) =>
    setSchritte(einfuegen(e.schritte, listePfad, index, neuerSchritt(e.schritte, art, aktion, felder[0]?.key)));
  const karten: ReactNode[] = [<Plus key="plus-0" schritte={e.schritte} listePfad={listePfad} ausloeser={e.ausloeser} onWahl={dazu(0)} />];
  liste.forEach((s, i) => {
    const pfad = listePfad ? `${listePfad}.${i}` : String(i);
    const farbe = s.typ === 'aktion' && s.aktion === 'freigabe_chef' ? C.gold : s.typ === 'wenn' ? C.cyan : s.typ === 'stopp' ? C.danger : C.border;
    const titel = s.typ === 'aktion' ? (ablaufAktion(s.aktion)?.label ?? s.aktion) : s.typ === 'warten' ? 'Warten' : s.typ === 'wenn' ? 'Wenn / Sonst' : 'Stopp — der Ablauf endet hier';
    karten.push(
      <div key={s.id} style={{ border: `1px solid ${farbe}`, borderRadius: 12, padding: 12, background: 'rgba(10,22,40,0.55)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: s.typ === 'stopp' ? 0 : 9 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{titel}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" aria-label="nach oben" disabled={i === 0} onClick={() => setSchritte(verschieben(e.schritte, pfad, -1))} style={{ ...knopf('rand'), padding: '3px 8px' }}>↑</button>
            <button type="button" aria-label="nach unten" disabled={i === liste.length - 1} onClick={() => setSchritte(verschieben(e.schritte, pfad, 1))} style={{ ...knopf('rand'), padding: '3px 8px' }}>↓</button>
            <button type="button" aria-label="entfernen" onClick={() => setSchritte(entfernen(e.schritte, pfad))} style={{ ...knopf('rot'), padding: '3px 8px' }}>✕</button>
          </div>
        </div>
        {s.typ === 'aktion' && <AktionFelder s={s} onChange={(neu) => setSchritte(ersetzen(e.schritte, pfad, neu))} />}
        {s.typ === 'warten' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="number" min={0} max={365} value={s.tage ?? 0} onChange={(ev) => setSchritte(ersetzen(e.schritte, pfad, { ...s, tage: Math.max(0, Math.min(365, Math.trunc(Number(ev.target.value) || 0))) }))} style={{ ...feld, width: 90 }} />
            <span style={klein}>Tage und</span>
            <input type="number" min={0} max={23} value={s.stunden ?? 0} onChange={(ev) => setSchritte(ersetzen(e.schritte, pfad, { ...s, stunden: Math.max(0, Math.min(23, Math.trunc(Number(ev.target.value) || 0))) }))} style={{ ...feld, width: 80 }} />
            <span style={klein}>Stunden. Danach prüft der Motor, ob der Auslöser noch gilt (z. B. Rechnung noch offen).</span>
          </div>
        )}
        {s.typ === 'wenn' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <GruppeEditor gruppe={s.bedingung} felder={felder} onChange={(g) => setSchritte(ersetzen(e.schritte, pfad, { ...s, bedingung: g }))} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 10 }}>
              {(['dann', 'sonst'] as const).map((z) => (
                <div key={z} style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: 8 }}>
                  <div style={{ ...klein, fontWeight: 800, color: z === 'dann' ? C.green : C.warn }}>{z === 'dann' ? 'Dann (trifft zu)' : 'Sonst'}</div>
                  <Kette e={e} setSchritte={setSchritte} listePfad={`${pfad}.${z}`} felder={felder} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>,
    );
    karten.push(<Plus key={`plus-${i + 1}`} schritte={e.schritte} listePfad={listePfad} ausloeser={e.ausloeser} onWahl={dazu(i + 1)} />);
  });
  return <div>{karten}</div>;
}

// ---------------------------------------------------------------------------
// Der Editor
// ---------------------------------------------------------------------------
export default function AblaufEditor({ start, busy, onSpeichern, onAbbrechen }: {
  start: Entwurf; busy: boolean; onSpeichern: (e: Entwurf) => void; onAbbrechen: () => void;
}) {
  const [e, setE] = useState<Entwurf>(start);
  const trigger = e.ausloeser.art === 'datum' ? e.ausloeser.trigger : TRIGGER[0].key;
  const felder = useMemo(() => triggerDef(trigger)?.felder ?? [], [trigger]);
  const pruefung = useMemo(() => pruefeAblauf({ ...e, name: e.name }), [e]);
  const setSchritte = (s: Schritt[]) => setE((x) => ({ ...x, schritte: s }));
  const filter: BedingungsGruppe = (e.ausloeser.art === 'datum' && e.ausloeser.filter) || { verknuepfung: 'und', regeln: [] };

  function triggerWechseln(neu: string) {
    // Bedingungen passen nach dem Wechsel nicht mehr (andere Felder) — Aktionen prüft pruefeAblauf
    setE((x) => ({ ...x, ausloeser: { art: 'datum', trigger: neu, tage: x.ausloeser.art === 'datum' ? x.ausloeser.tage : 0, filter: null } }));
  }

  return (
    <div style={{ background: C.navy2, border: '1px solid rgba(201,168,76,0.45)', borderRadius: 14, padding: 18, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{e.id ? `Ablauf bearbeiten (Fassung ${e.version ?? 1})` : 'Neuer Ablauf'}</h2>
        <button type="button" onClick={onAbbrechen} style={knopf('rand')}>Abbrechen</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={beschriftung}>Name des Ablaufs *</label>
          <input value={e.name} onChange={(ev) => setE((x) => ({ ...x, name: ev.target.value }))} placeholder="z. B. Mahnlauf in Stufen" style={feld} />
        </div>
        <div>
          <label style={beschriftung}>Beschreibung</label>
          <input value={e.beschreibung ?? ''} onChange={(ev) => setE((x) => ({ ...x, beschreibung: ev.target.value }))} style={feld} />
        </div>
      </div>

      {/* Auslöser */}
      <div style={{ border: `1px solid ${C.cyan}`, borderRadius: 12, padding: 12, background: 'rgba(0,229,255,0.04)' }}>
        <div style={{ fontSize: 11.5, letterSpacing: 1.2, textTransform: 'uppercase', color: C.cyan, fontWeight: 800, marginBottom: 8 }}>Auslöser</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {AUSLOESER_ARTEN.map((a) => {
            const waehlbar = a.imMotor && (a.art === 'datum' || a.art === 'zeitplan' || a.art === 'knopf' || a.art === 'ereignis');
            return (
              <button key={a.art} type="button" title={a.hinweis} disabled={!waehlbar}
                onClick={() => waehlbar && e.ausloeser.art !== a.art && setE((x) => ({ ...x, ausloeser: neuerAusloeser(a.art as 'datum' | 'zeitplan' | 'knopf' | 'ereignis') }))}
                style={{ ...knopf(e.ausloeser.art === a.art ? 'gold' : 'rand'), padding: '4px 10px', fontSize: 12.5, opacity: waehlbar ? 1 : 0.45, cursor: waehlbar ? 'pointer' : 'not-allowed' }}>
                {a.label}{waehlbar ? '' : ' · folgt'}
              </button>
            );
          })}
        </div>
        {e.ausloeser.art === 'zeitplan' && (() => {
          const z = e.ausloeser;
          const setZ = (teil: Partial<typeof z>) => setE((x) => ({ ...x, ausloeser: { ...z, ...teil } }));
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginBottom: 6 }}>
              <div>
                <label style={beschriftung}>Rhythmus</label>
                <select value={z.rhythmus} onChange={(ev) => setZ({ rhythmus: ev.target.value as typeof z.rhythmus })} style={feld}>
                  <option value="taeglich">Täglich</option><option value="woechentlich">Wöchentlich</option><option value="monatlich">Monatlich</option>
                </select>
              </div>
              {z.rhythmus === 'woechentlich' && (
                <div>
                  <label style={beschriftung}>Wochentag</label>
                  <select value={z.wochentag ?? 1} onChange={(ev) => setZ({ wochentag: Number(ev.target.value) })} style={feld}>
                    {['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'].map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
                  </select>
                </div>
              )}
              {z.rhythmus === 'monatlich' && (
                <div>
                  <label style={beschriftung}>Tag im Monat</label>
                  <input type="number" min={1} max={31} value={z.tag ?? 1} onChange={(ev) => setZ({ tag: Math.max(1, Math.min(31, Math.trunc(Number(ev.target.value) || 1))) })} style={feld} />
                </div>
              )}
              <div>
                <label style={beschriftung}>Uhrzeit (Berliner Zeit)</label>
                <input type="time" value={z.uhrzeit ?? '07:00'} onChange={(ev) => setZ({ uhrzeit: ev.target.value })} style={feld} />
              </div>
            </div>
          );
        })()}
        {e.ausloeser.art === 'ereignis' && (() => {
          const ev = e.ausloeser;
          return (
            <div style={{ marginBottom: 6 }}>
              <label style={beschriftung}>Wenn das passiert</label>
              <select value={ev.ereignis} onChange={(x) => setE((y) => ({ ...y, ausloeser: { ...ev, ereignis: x.target.value } }))} style={feld}>
                {EREIGNISSE.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              <div style={{ ...klein, marginTop: 6 }}>
                Startet beim nächsten Durchgang des Motors (spätestens nach einer Stunde). Werden viele Vorgänge auf einmal angelegt (z. B. beim Umzug/Import), startet bewusst kein Ablauf. So liest sich das: {ausloeserText(ev)}.
              </div>
            </div>
          );
        })()}
        {e.ausloeser.art === 'knopf' && (
          <div style={{ ...klein, marginBottom: 6 }}>Startet mit „▶ Jetzt starten" auf der Seite Abläufe — ohne Vorgang. Knöpfe direkt in den Modulen folgen.</div>
        )}
        {e.ausloeser.art !== 'datum' && e.ausloeser.art !== 'ereignis' && (
          <div style={{ ...klein, marginBottom: 6 }}>Ohne Vorgang gehen nur Aktionen, die nichts Bestehendes ändern: Aufgabe anlegen, Mail an eine feste Adresse, Warten, Freigabe, Stopp. So liest sich das: {ausloeserText(e.ausloeser)}.</div>
        )}
        {e.ausloeser.art === 'datum' && (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          <div>
            <label style={beschriftung}>Wenn das passiert</label>
            <select value={trigger} onChange={(ev) => triggerWechseln(ev.target.value)} style={feld}>
              {TRIGGER.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={beschriftung}>… und so viele Tage danach</label>
            <input type="number" min={0} max={365} value={e.ausloeser.art === 'datum' ? e.ausloeser.tage : 0}
              onChange={(ev) => setE((x) => (x.ausloeser.art === 'datum' ? { ...x, ausloeser: { ...x.ausloeser, tage: Math.max(0, Math.min(365, Math.trunc(Number(ev.target.value) || 0))) } } : x))}
              style={feld} />
          </div>
        </div>
        <div style={{ ...klein, margin: '6px 0 10px' }}>{triggerDef(trigger)?.hinweis} So liest sich das: {ausloeserText(e.ausloeser)}.</div>
        <div style={{ ...beschriftung, marginBottom: 6 }}>Nur starten, wenn … (leer = immer)</div>
        <GruppeEditor gruppe={filter} felder={felder}
          onChange={(g) => setE((x) => (x.ausloeser.art === 'datum' ? { ...x, ausloeser: { ...x.ausloeser, filter: g.regeln.length ? g : null } } : x))} />
        </>)}
      </div>

      {/* Kette */}
      <div style={{ marginTop: 6 }}>
        <Kette e={e} setSchritte={setSchritte} listePfad="" felder={felder} />
      </div>

      {/* Prüfung */}
      <div style={{ marginTop: 10 }}>
        {pruefung.fehler.map((f) => <div key={f} style={{ fontSize: 13, color: C.danger, marginTop: 3 }}>⚠️ {f}</div>)}
        {pruefung.hinweise.map((h) => <div key={h} style={{ fontSize: 13, color: C.warn, marginTop: 3 }}>ℹ️ {h}</div>)}
        {pruefung.fehler.length === 0 && pruefung.aktivierbar && <div style={{ fontSize: 13, color: C.green, marginTop: 3 }}>✓ Geprüft — nach dem Speichern einschaltbar.</div>}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <button type="button" disabled={busy || pruefung.fehler.length > 0} onClick={() => onSpeichern(e)} style={{ ...knopf('gold'), opacity: pruefung.fehler.length > 0 ? 0.5 : 1 }}>
          {busy ? 'Speichert …' : e.id ? 'Als neue Fassung speichern' : 'Ablauf anlegen (ausgeschaltet)'}
        </button>
        <span style={{ ...klein, alignSelf: 'center' }}>
          {e.id ? 'Laufende Läufe arbeiten mit ihrer alten Fassung zu Ende.' : 'Neue Abläufe starten ausgeschaltet — erst „🔍 Probelauf", dann „Einschalten".'}
        </span>
      </div>
    </div>
  );
}
