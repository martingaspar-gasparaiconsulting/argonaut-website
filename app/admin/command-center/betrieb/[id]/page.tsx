'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { STATUS_TEXT, type Status, type Zeile } from '@/lib/einrichtung';
import type { Frage, Rolle, SetterEinstellung, Ziel } from '@/lib/setter';
import { VORLAGEN, MAX_FRAGEN } from '@/lib/setterVorlagen';

// ============================================================
// ARGONAUT OS · Command Center · Betriebs-Akte (G3 Push 4)
//
// Einen Kunden anklicken und alles sehen, was zu tun ist. Die Zugänge —
// WhatsApp, Meta, Mail, später Bank — macht der Betreiber, nicht der Kunde.
// Der Handwerker versteht das nicht, und genau dafür wird ARGONAUT bezahlt.
//
// Drei Reiter:
//   · Checkliste — der Ist-Zustand aus der Datenbank, nicht aus Häkchen
//   · KI-Berater — Rolle, Ziel, Fragen, Übergabe, Buchungsseite
//   · Menge & Domains (11.09.2026) — welche Stufe der Betrieb gebucht hat, wie
//     viele Gespräche sein öffentlicher Berater diesen Monat geführt hat, und
//     auf welchen fremden Websites er überhaupt antworten darf. Beides ging
//     vorher nur mit SQL bzw. nur im Kunden-Dashboard — also an einer Stelle,
//     an die der Betreiber gar nicht kommt.
//
// DIE ZWEI GRENZEN werden hier nur ANGEZEIGT, nicht eingestellt: kein Preis,
// der nicht in den Stammdaten steht, und der Berater behauptet nie, ein Mensch
// zu sein. Beides ist in baueSetterSystemtext() fest verdrahtet. Ein Schalter
// dafür wäre ein Schalter zum Rechtsbruch (AI Act Art. 50, seit 02.08.2026).
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

const STATUS_FARBE: Record<Status, string> = {
  erledigt: C.green,
  offen: C.gold,
  wartet: C.textDim,
  nicht_gebucht: C.textDim,
  geplant: C.textDim,
  unbekannt: C.warn,
};

const ZUSTAENDIG_TEXT: Record<string, string> = {
  betreiber: 'du',
  kunde: 'der Kunde',
  automatisch: 'läuft automatisch',
};

const ZIELE: Array<{ wert: Ziel; text: string }> = [
  { wert: 'termin', text: 'Termin vereinbaren' },
  { wert: 'rueckruf', text: 'Rückruf vereinbaren' },
  { wert: 'anfrage', text: 'Anfrage vollständig aufnehmen' },
];

type Kopf = {
  id: string;
  name: string;
  email: string;
  buchungSlugProfil: string;
  buchungAktivProfil: boolean;
};

type Fortschritt = { erledigt: number; offen: number; gesamt: number; prozent: number };

type Reiter = 'checkliste' | 'setter' | 'menge';

export default function BetriebsAkte() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');

  const [reiter, setReiter] = useState<Reiter>('checkliste');
  const [kopf, setKopf] = useState<Kopf | null>(null);
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [stand, setStand] = useState<Fortschritt | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [warnungen, setWarnungen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // --- Setter-Einstellung ---------------------------------------------------
  const [rolle, setRolle] = useState<Rolle>('auskunft');
  const [ziel, setZiel] = useState<Ziel>('anfrage');
  const [fragen, setFragen] = useState<Frage[]>([]);
  const [uebergabe, setUebergabe] = useState('');
  const [slug, setSlug] = useState('');
  const [aktiv, setAktiv] = useState(true);

  const laden0 = useCallback(async () => {
    if (!id) return;
    setFehler(null);
    try {
      const r = await fetch(`/api/admin/betrieb-einrichtung?betrieb=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (d?.ok) {
        setKopf(d.betrieb ?? null);
        setZeilen(Array.isArray(d.zeilen) ? d.zeilen : []);
        setStand(d.fortschritt ?? null);
        const e = (d.einstellung ?? {}) as SetterEinstellung;
        setRolle(e.rolle === 'setter' ? 'setter' : 'auskunft');
        setZiel(e.ziel ?? 'anfrage');
        setFragen(Array.isArray(e.fragen) ? e.fragen : []);
        setUebergabe((Array.isArray(e.uebergabeBei) ? e.uebergabeBei : []).join(', '));
        setSlug(e.buchungSlug || d.betrieb?.buchungSlugProfil || '');
        setAktiv(d.einstellungVorhanden ? d.einstellungAktiv !== false : true);
      } else {
        setFehler(d?.error || 'Konnte den Betrieb nicht laden.');
      }
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    }
    setLaden(false);
  }, [id]);

  useEffect(() => { laden0(); }, [laden0]);

  function nimmVorlage(schluessel: string) {
    const v = VORLAGEN.find((x) => x.schluessel === schluessel);
    if (!v) return;
    setZiel(v.ziel);
    setFragen(v.fragen.map((f) => ({ ...f })));
    setUebergabe((v.uebergabeBei ?? []).join(', '));
    setRolle('setter');
    setMeldung(`Vorlage „${v.name}“ übernommen — jetzt anpassen und speichern.`);
    setWarnungen([]);
  }

  function aendereFrage(i: number, teil: Partial<Frage>) {
    setFragen((alt) => alt.map((f, k) => (k === i ? { ...f, ...teil } : f)));
  }
  function loescheFrage(i: number) {
    setFragen((alt) => alt.filter((_, k) => k !== i));
  }
  function neueFrage() {
    setFragen((alt) => (alt.length >= MAX_FRAGEN ? alt : [...alt, { schluessel: '', frage: '', pflicht: false }]));
  }
  function schiebe(i: number, richtung: -1 | 1) {
    setFragen((alt) => {
      const ziel2 = i + richtung;
      if (ziel2 < 0 || ziel2 >= alt.length) return alt;
      const neu = alt.slice();
      const [raus] = neu.splice(i, 1);
      neu.splice(ziel2, 0, raus);
      return neu;
    });
  }

  async function speichere() {
    if (!id) return;
    setBusy(true); setMeldung(null); setFehler(null); setWarnungen([]);
    try {
      const r = await fetch('/api/admin/betrieb-einrichtung', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          betrieb: id,
          kanal: 'website',
          rolle,
          ziel,
          fragen,
          uebergabe_bei: uebergabe.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean),
          buchung_slug: slug,
          aktiv,
        }),
      });
      const d = await r.json();
      if (d?.ok) {
        setMeldung('✓ Gespeichert.');
        setWarnungen(Array.isArray(d.warnungen) ? d.warnungen : []);
        laden0();
      } else {
        setFehler(d?.error || 'Speichern fehlgeschlagen.');
      }
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    }
    setBusy(false);
  }

  const tab = (key: Reiter, text: string) => (
    <button
      onClick={() => setReiter(key)}
      style={{
        ...s.tab,
        color: reiter === key ? C.navy : '#fff',
        background: reiter === key ? C.gold : 'transparent',
        borderColor: reiter === key ? C.gold : 'rgba(255,255,255,0.18)',
      }}
    >
      {text}
    </button>
  );

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>

        <div style={s.kopf}>
          <div>
            <h1 style={s.h1}>{kopf?.name || 'Betriebs-Akte'}</h1>
            <p style={s.sub}>
              {kopf?.email ? `${kopf.email} · ` : ''}
              Alles, was bei diesem Betrieb noch einzurichten ist — und die Einstellung
              seines KI-Beraters.
            </p>
          </div>
          <a href="/admin/command-center/betrieb" style={s.btnGhost}>‹ Alle Betriebe</a>
        </div>

        {fehler && <div style={s.fehlerBox}>{fehler}</div>}
        {meldung && <div style={s.okBox}>{meldung}</div>}

        {laden ? (
          <div style={s.hint}>Lädt …</div>
        ) : (
          <>
            {stand && (
              <div style={s.karte}>
                <div style={s.balkenAussen}>
                  <div
                    style={{
                      ...s.balkenInnen,
                      width: `${Math.max(2, stand.prozent)}%`,
                      background: stand.offen === 0 ? C.green : C.gold,
                    }}
                  />
                </div>
                <div style={s.balkenText}>
                  <b style={{ color: stand.offen === 0 ? C.green : C.gold, fontSize: 16 }}>
                    {stand.erledigt} von {stand.gesamt}
                  </b>
                  {' '}erledigt · {stand.prozent} %
                  {stand.offen > 0 && <> · noch <b style={{ color: '#fff' }}>{stand.offen}</b> offen</>}
                </div>
              </div>
            )}

            <div style={s.tabZeile}>
              {tab('checkliste', 'Checkliste')}
              {tab('setter', 'KI-Berater')}
              {tab('menge', 'Menge & Domains')}
            </div>

            {reiter === 'checkliste' ? (
              <Checkliste zeilen={zeilen} zumSetter={() => setReiter('setter')} />
            ) : reiter === 'menge' ? (
              <MengeUndDomains betrieb={id} />
            ) : (
              <>
                <div style={s.karte}>
                  <div style={s.karteTitel}>Was der Berater auf der Website tun soll</div>

                  <label style={s.label}>Rolle</label>
                  <div style={s.zeile}>
                    <button
                      onClick={() => setRolle('auskunft')}
                      style={{ ...s.wahl, ...(rolle === 'auskunft' ? s.wahlAn : {}) }}
                    >
                      Auskunft geben
                    </button>
                    <button
                      onClick={() => setRolle('setter')}
                      style={{ ...s.wahl, ...(rolle === 'setter' ? s.wahlAn : {}) }}
                    >
                      Gespräch führen und Anfrage aufnehmen
                    </button>
                  </div>
                  <p style={s.hinweis}>
                    <b>Auskunft</b> beantwortet Fragen zu den hinterlegten Produkten und verweist sonst
                    auf das Kontaktformular. <b>Gespräch führen</b> verfolgt ein Ziel, stellt der Reihe
                    nach die Fragen unten und legt am Ende eine Anfrage im CRM an.
                  </p>

                  <div style={{ marginTop: 18 }}>
                    <label style={s.label}>Aktiv</label>
                    <button
                      onClick={() => setAktiv((a) => !a)}
                      style={{ ...s.wahl, ...(aktiv ? s.wahlAn : {}) }}
                    >
                      {aktiv ? '✓ Einstellung ist scharf' : '○ Einstellung ruht'}
                    </button>
                    <p style={s.hinweis}>
                      Ruht die Einstellung, fällt der Berater auf reine Auskunft zurück — er verschwindet
                      nicht von der Website.
                    </p>
                  </div>
                </div>

                {rolle === 'setter' && (
                  <>
                    <div style={s.karte}>
                      <div style={s.karteTitel}>Fertige Gespräche als Startpunkt</div>
                      <p style={s.hinweis}>
                        Ein Dachdecker braucht andere Fragen als ein Steuerberater — aber alle Dachdecker
                        brauchen dieselben. Vorlage übernehmen, dann von Hand anpassen.
                      </p>
                      <div style={{ ...s.zeile, marginTop: 12 }}>
                        {VORLAGEN.map((v) => (
                          <button key={v.schluessel} onClick={() => nimmVorlage(v.schluessel)} style={s.vorlage} title={v.beschreibung}>
                            {v.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={s.karte}>
                      <div style={s.karteTitel}>Ziel des Gesprächs</div>
                      <div style={s.zeile}>
                        {ZIELE.map((z) => (
                          <button
                            key={z.wert}
                            onClick={() => setZiel(z.wert)}
                            style={{ ...s.wahl, ...(ziel === z.wert ? s.wahlAn : {}) }}
                          >
                            {z.text}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={s.karte}>
                      <div style={s.karteTitel}>Die Fragen, der Reihe nach</div>
                      <p style={s.hinweis}>
                        Der <b>Schlüssel</b> ist kein Anzeigetext, sondern der Name, unter dem die Antwort
                        gemerkt wird: nur Kleinbuchstaben, Ziffern und Unterstrich. Ohne mindestens eine
                        Pflichtfrage gilt jedes Gespräch sofort als fertig.
                      </p>

                      {fragen.length === 0 && (
                        <p style={{ ...s.hinweis, color: C.warn }}>
                          Noch keine Frage. Ohne eigene Fragen fragt der Berater nur das Nötigste:
                          Anliegen, Name, Erreichbarkeit.
                        </p>
                      )}

                      {fragen.map((f, i) => (
                        <div key={i} style={s.frageBox}>
                          <div style={s.frageKopf}>
                            <span style={s.frageNr}>{i + 1}</span>
                            <input
                              value={f.schluessel}
                              onChange={(e) => aendereFrage(i, { schluessel: e.target.value })}
                              placeholder="schluessel"
                              style={{ ...s.input, maxWidth: 180 }}
                            />
                            <label style={s.checkZeile}>
                              <input
                                type="checkbox"
                                checked={f.pflicht === true}
                                onChange={(e) => aendereFrage(i, { pflicht: e.target.checked })}
                              />
                              Pflicht
                            </label>
                            <span style={{ flex: 1 }} />
                            <button onClick={() => schiebe(i, -1)} disabled={i === 0} style={s.btnMini}>↑</button>
                            <button onClick={() => schiebe(i, 1)} disabled={i === fragen.length - 1} style={s.btnMini}>↓</button>
                            <button onClick={() => loescheFrage(i)} style={{ ...s.btnMini, color: C.danger, borderColor: `${C.danger}66` }}>Entfernen</button>
                          </div>
                          <input
                            value={f.frage}
                            onChange={(e) => aendereFrage(i, { frage: e.target.value })}
                            placeholder="Wie lautet die Frage, die der Besucher liest?"
                            style={{ ...s.input, maxWidth: '100%', marginTop: 8 }}
                          />
                        </div>
                      ))}

                      <button
                        onClick={neueFrage}
                        disabled={fragen.length >= MAX_FRAGEN}
                        style={{ ...s.btnCyan, marginTop: 12, opacity: fragen.length >= MAX_FRAGEN ? 0.5 : 1 }}
                      >
                        + Frage hinzufügen
                      </button>
                      {fragen.length >= MAX_FRAGEN && (
                        <p style={s.hinweis}>Höchstens {MAX_FRAGEN} Fragen — sonst wird es ein Verhör.</p>
                      )}
                    </div>

                    <div style={s.karte}>
                      <div style={s.karteTitel}>Wann ein Mensch übernimmt</div>
                      <input
                        value={uebergabe}
                        onChange={(e) => setUebergabe(e.target.value)}
                        placeholder="beschwerde, anwalt, notfall …"
                        style={{ ...s.input, maxWidth: '100%' }}
                      />
                      <p style={s.hinweis}>
                        Stichworte mit Komma trennen. Fällt eines davon, fragt der Berater nichts mehr ab
                        und sagt zu, dass sich jemand persönlich meldet. Leer lassen ist in Ordnung — dann
                        gilt die eingebaute Liste (Beschwerde, Anwalt, Kündigung, „einen Menschen sprechen“).
                      </p>
                    </div>

                    <div style={s.karte} id="buchung">
                      <div style={s.karteTitel}>Buchungsseite</div>
                      <input
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="kurzname-des-betriebs"
                        style={{ ...s.input, maxWidth: 380 }}
                      />
                      <p style={s.hinweis}>
                        Die Adresse der echten Online-Buchung: <code style={s.code}>/buchen/{slug || '…'}</code>.
                        Der Berater schickt den Besucher genau dorthin — mit allem schon ausgefüllt. Nur so
                        entstehen Termine, die auch im Schichtplan stehen.
                        {kopf?.buchungSlugProfil
                          ? <> Am Profil des Betriebs hinterlegt: <b>{kopf.buchungSlugProfil}</b>
                              {kopf.buchungAktivProfil ? ' (freigeschaltet)' : ' (noch nicht freigeschaltet)'}.</>
                          : ' Am Profil des Betriebs ist noch keine Buchungsseite hinterlegt.'}
                      </p>
                    </div>
                  </>
                )}

                <div style={s.grenzenBox}>
                  <div style={{ ...s.karteTitel, marginBottom: 8 }}>Zwei Grenzen — fest verdrahtet</div>
                  <p style={s.grenzeZeile}>
                    <b style={{ color: C.gold }}>1 · Kein erfundener Preis.</b> Der Berater nennt nur Preise, die
                    in den Stammdaten stehen. Gibt es keinen, sagt er das offen und stellt einen Rückruf in
                    Aussicht. Ein erfundener Preis wäre ein Angebot, das der Betrieb halten muss.
                  </p>
                  <p style={s.grenzeZeile}>
                    <b style={{ color: C.gold }}>2 · Er behauptet nie, ein Mensch zu sein.</b> Auch nicht auf
                    Nachfrage, auch nicht scherzhaft. Offenlegungspflicht nach AI Act Art. 50, in Kraft seit
                    dem 02.08.2026.
                  </p>
                  <p style={{ ...s.hinweis, marginTop: 10 }}>
                    Beides steht wortgleich im Systemtext und lässt sich hier nicht abschalten — diese Seite
                    zeigt es nur an.
                  </p>
                </div>

                {warnungen.length > 0 && (
                  <div style={s.warnBox}>
                    <b style={{ color: C.warn }}>⚠️ Bitte noch einmal ansehen</b>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                      {warnungen.map((w, i) => <li key={i} style={{ marginBottom: 4 }}>{w}</li>)}
                    </ul>
                    <p style={{ ...s.hinweis, marginTop: 8 }}>
                      Gespeichert ist es trotzdem — das ist ein Hinweis, kein Verbot.
                    </p>
                  </div>
                )}

                <button onClick={speichere} disabled={busy} style={{ ...s.btnGold, opacity: busy ? 0.5 : 1 }}>
                  {busy ? 'Speichere…' : 'Einstellung speichern'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MENGE & DOMAINS (11.09.2026)
//
// Der öffentliche Berater lief bis heute ohne Mengengrenze — die drei
// Kostenbremsen in lib/ki.ts greifen alle nur `if (userId)`, und ein Besucher
// auf einer fremden Website ist nicht eingeloggt. Seit lib/chatDeckel.ts gibt
// es die Grenze; hier ist die Stelle, an der man sie sieht und verstellt.
// ---------------------------------------------------------------------------

const AMPEL_FARBE: Record<string, string> = { gruen: C.green, gelb: C.warn, rot: C.danger };
const AMPEL_TEXT: Record<string, string> = {
  gruen: 'Läuft unauffällig',
  gelb: 'Über 80 % — jetzt ist der Moment für das Gespräch über die nächste Stufe',
  rot: 'Grenze erreicht — Besucher bekommen den Hinweis aufs Kontaktformular',
};

type StufenAngabeUi = { key: string; name: string; preis: number; grenze: number | null };
type SeiteUi = { slug: string; status: string; domain: string; oeffentlichId: string; chatDomains: string[] };

type ChatStand = {
  monat: string;
  stufe: string;
  stufeGesetzt: boolean;
  notiz: string;
  verbraucht: number;
  grenze: number | null;
  preis: number;
  rest: number | null;
  prozent: number | null;
  ampel: string;
  klartext: string;
  gewarntAm: string | null;
  gesperrtSeit: string | null;
  stufen: StufenAngabeUi[];
  verlauf: Array<{ monat: string; anzahl: number }>;
  seiten: SeiteUi[];
};

function monatName(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return String(iso ?? '');
  const namen = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${namen[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

function MengeUndDomains({ betrieb }: { betrieb: string }) {
  const [stand, setStand] = useState<ChatStand | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [wahl, setWahl] = useState('klein');
  const [notiz, setNotiz] = useState('');
  const [domainText, setDomainText] = useState<Record<string, string>>({});

  const hole = useCallback(async () => {
    if (!betrieb) return;
    setFehler(null);
    try {
      const r = await fetch(`/api/admin/chat-verwaltung?betrieb=${encodeURIComponent(betrieb)}`);
      const d = await r.json();
      if (d?.ok) {
        setStand(d as ChatStand);
        setWahl(String(d.stufe ?? 'klein'));
        setNotiz(String(d.notiz ?? ''));
        const texte: Record<string, string> = {};
        for (const s2 of (d.seiten ?? []) as SeiteUi[]) texte[s2.slug] = (s2.chatDomains ?? []).join('\n');
        setDomainText(texte);
      } else {
        setFehler(d?.error || 'Konnte den Stand nicht laden.');
      }
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    }
    setLaden(false);
  }, [betrieb]);

  useEffect(() => { hole(); }, [hole]);

  async function speichereStufe() {
    setBusy(true); setMeldung(null); setFehler(null); setHinweis(null);
    try {
      const r = await fetch('/api/admin/chat-verwaltung', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ betrieb, aktion: 'stufe', stufe: wahl, notiz }),
      });
      const d = await r.json();
      if (d?.ok) {
        setMeldung(`✓ Stufe gespeichert — ${d.klartext}`);
        if (d.hinweis) setHinweis(String(d.hinweis));
        hole();
      } else {
        setFehler(d?.error || 'Speichern fehlgeschlagen.');
      }
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    }
    setBusy(false);
  }

  async function speichereDomains(slug: string) {
    setBusy(true); setMeldung(null); setFehler(null); setHinweis(null);
    try {
      const r = await fetch('/api/admin/chat-verwaltung', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ betrieb, aktion: 'domains', seite: slug, chat_domains: domainText[slug] ?? '' }),
      });
      const d = await r.json();
      if (d?.ok) {
        const liste = (d.chatDomains ?? []) as string[];
        setMeldung(liste.length
          ? `✓ Freigegeben für ${liste.length === 1 ? 'eine Adresse' : `${liste.length} Adressen`}: ${liste.join(', ')}`
          : '✓ Gespeichert — keine fremde Adresse mehr freigegeben.');
        if (d.hinweis) setHinweis(String(d.hinweis));
        hole();
      } else {
        setFehler(d?.error || 'Speichern fehlgeschlagen.');
      }
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    }
    setBusy(false);
  }

  if (laden) return <div style={s.hint}>Lädt …</div>;
  if (!stand) return <div style={s.fehlerBox}>{fehler || 'Kein Stand gefunden.'}</div>;

  const farbe = AMPEL_FARBE[stand.ampel] ?? C.textDim;
  const breite = stand.prozent === null ? 100 : Math.max(2, Math.min(100, stand.prozent));
  const spitze = Math.max(1, ...stand.verlauf.map((v) => v.anzahl));

  return (
    <>
      {fehler && <div style={s.fehlerBox}>{fehler}</div>}
      {meldung && <div style={s.okBox}>{meldung}</div>}
      {hinweis && (
        <div style={s.warnBox}>
          <b style={{ color: C.warn }}>⚠️ Bitte lesen</b>
          <p style={{ margin: '8px 0 0', lineHeight: 1.6 }}>{hinweis}</p>
        </div>
      )}

      {/* --- Wie viel läuft --------------------------------------------- */}
      <div style={s.karte}>
        <div style={s.karteTitel}>Dieser Monat · {monatName(stand.monat)}</div>

        <div style={s.balkenAussen}>
          <div style={{ ...s.balkenInnen, width: `${breite}%`, background: farbe }} />
        </div>
        <div style={s.balkenText}>
          <b style={{ color: farbe, fontSize: 16 }}>{stand.klartext}</b>
          <br />
          <span style={{ color: farbe }}>{AMPEL_TEXT[stand.ampel] ?? ''}</span>
          {stand.rest !== null && stand.rest > 0 && <> · noch <b style={{ color: '#fff' }}>{stand.rest}</b> übrig</>}
        </div>

        <p style={s.hinweis}>
          Gezählt wird der <b>Betrieb</b>, nie ein Besucher — keine IP, kein Zeitstempel je Gespräch.
          Am Monatsersten beginnt die Zählung von selbst wieder bei null; einen Knopf zum Zurücksetzen
          gibt es bewusst nicht.
          {stand.gesperrtSeit && <> Gesperrt seit dem {new Date(stand.gesperrtSeit).toLocaleDateString('de-DE')}.</>}
          {!stand.gesperrtSeit && stand.gewarntAm && <> 80 % erreicht am {new Date(stand.gewarntAm).toLocaleDateString('de-DE')}.</>}
        </p>
      </div>

      {/* --- Verlauf ------------------------------------------------------ */}
      {stand.verlauf.length > 1 && (
        <div style={s.karte}>
          <div style={s.karteTitel}>Die letzten Monate</div>
          {stand.verlauf.map((v) => (
            <div key={v.monat} style={s.verlaufZeile}>
              <span style={s.verlaufMonat}>{monatName(v.monat)}</span>
              <span style={s.verlaufBalken}>
                <span style={{ ...s.verlaufFuellung, width: `${Math.max(2, (v.anzahl / spitze) * 100)}%` }} />
              </span>
              <b style={s.verlaufZahl}>{v.anzahl}</b>
            </div>
          ))}
          <p style={s.hinweis}>
            Der beste Verkaufsanlass, den es gibt: Wer drei Monate hintereinander nah an der Grenze war,
            braucht die nächste Stufe — und weiß es meistens selbst noch nicht.
          </p>
        </div>
      )}

      {/* --- Stufe -------------------------------------------------------- */}
      <div style={s.karte}>
        <div style={s.karteTitel}>Gebuchte Stufe</div>
        <div style={s.zeile}>
          {stand.stufen.map((st) => (
            <button
              key={st.key}
              onClick={() => setWahl(st.key)}
              style={{ ...s.wahl, ...(wahl === st.key ? s.wahlAn : {}) }}
            >
              {st.name}
              {st.grenze !== null
                ? ` · ${st.preis} € · ${st.grenze.toLocaleString('de-DE')}`
                : ' · nach Vereinbarung'}
            </button>
          ))}
        </div>
        <p style={s.hinweis}>
          {stand.stufeGesetzt
            ? 'Für diesen Betrieb ist eine Stufe hinterlegt.'
            : 'Für diesen Betrieb ist noch nichts hinterlegt — dann gilt automatisch die kleine Stufe. Das ist kein Versehen, sondern die sichere Vorgabe.'}
          {' '}Die Preise stehen in <code style={s.code}>lib/chatDeckel.ts</code> und sind dieselben, die in den AGB stehen.
        </p>

        <div style={{ marginTop: 14 }}>
          <label style={s.label}>Notiz (nur für dich)</label>
          <input
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            placeholder="z. B. „gebucht am 11.09.2026, Rechnung läuft über den Jahresvertrag“"
            style={{ ...s.input, maxWidth: '100%' }}
          />
        </div>

        <button onClick={speichereStufe} disabled={busy} style={{ ...s.btnGold, marginTop: 14, opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Speichere…' : 'Stufe speichern'}
        </button>
      </div>

      {/* --- Domains ------------------------------------------------------ */}
      <div style={s.karte}>
        <div style={s.karteTitel}>Wo der Berater antworten darf</div>
        <p style={s.hinweis}>
          Ohne Eintrag antwortet der Berater nur auf der ARGONAUT-Seite des Betriebs. Jede fremde
          Adresse — die alte WordPress-Seite, der Shop, eine Landingpage — muss hier stehen, sonst
          bleibt das Widget dort stumm. Das ist keine Schikane: ohne diese Liste könnte jede beliebige
          Website den Berater auf Rechnung dieses Betriebs laufen lassen.
        </p>

        {stand.seiten.length === 0 ? (
          <p style={{ ...s.hinweis, color: C.warn }}>
            Dieser Betrieb hat noch keine Webseite angelegt. Die entsteht in seinem Dashboard unter
            „Webseiten“ — hier lässt sich keine erzeugen, sonst hätte er plötzlich eine Seite, die er
            nie gebaut hat.
          </p>
        ) : (
          stand.seiten.map((seite) => (
            <div key={seite.slug} style={s.frageBox}>
              <div style={s.frageKopf}>
                <b style={{ color: '#fff', fontSize: 14.5 }}>{seite.slug}</b>
                <span style={{
                  ...s.pille,
                  color: seite.status === 'live' ? C.green : C.textDim,
                  borderColor: seite.status === 'live' ? C.green : 'rgba(255,255,255,0.2)',
                }}>
                  {seite.status === 'live' ? '● live' : `○ ${seite.status || 'Entwurf'}`}
                </span>
                {seite.domain && <span style={s.wer}>{seite.domain}</span>}
              </div>

              {seite.status !== 'live' && (
                <p style={{ ...s.hinweis, color: C.warn }}>
                  Diese Seite ist nicht live. Der Berater antwortet dort gar nicht — auch nicht auf
                  freigegebenen Adressen. Erst veröffentlichen, dann freigeben.
                </p>
              )}

              <textarea
                value={domainText[seite.slug] ?? ''}
                onChange={(e) => setDomainText((alt) => ({ ...alt, [seite.slug]: e.target.value }))}
                placeholder={'muster-bau.de\nshop.muster-bau.de'}
                rows={4}
                style={{ ...s.input, maxWidth: '100%', marginTop: 10, fontFamily: 'ui-monospace, monospace', fontSize: 13.5, resize: 'vertical' }}
              />
              <p style={s.hinweis}>
                Eine Adresse je Zeile, höchstens zehn. <code style={s.code}>www.</code> und die Adresse
                ohne <code style={s.code}>www.</code> gelten als dieselbe Seite. Eine Subdomain wie
                {' '}<code style={s.code}>shop.…</code> ist eine EIGENE Adresse und muss einzeln stehen —
                ein Suffix-Vergleich würde auch <code style={s.code}>boese-muster-bau.de</code> durchlassen.
              </p>

              <button
                onClick={() => speichereDomains(seite.slug)}
                disabled={busy}
                style={{ ...s.btnCyan, marginTop: 10, opacity: busy ? 0.5 : 1 }}
              >
                {busy ? 'Speichere…' : 'Freigabe speichern'}
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function Checkliste({ zeilen, zumSetter }: { zeilen: Zeile[]; zumSetter: () => void }) {
  if (!zeilen.length) {
    return (
      <div style={s.karte}>
        <div style={s.karteTitel}>Keine Punkte</div>
        <p style={s.hinweis}>Für diesen Betrieb ließ sich keine Checkliste bilden.</p>
      </div>
    );
  }

  const offene = zeilen.filter((z) => z.status === 'offen' || z.status === 'unbekannt');
  const meine = offene.filter((z) => z.zustaendig === 'betreiber');

  return (
    <>
      {meine.length > 0 && (
        <div style={s.karte}>
          <div style={s.karteTitel}>Das liegt jetzt bei dir</div>
          <ul style={{ margin: 0, paddingLeft: 20, color: '#fff', lineHeight: 1.8 }}>
            {meine.map((z) => <li key={z.id}>{z.name}</li>)}
          </ul>
        </div>
      )}

      <div style={s.karte}>
        <div style={s.karteTitel}>Alle Punkte</div>
        {zeilen.map((z) => (
          <div key={z.id} style={s.punkt}>
            <div style={s.punktKopf}>
              <span style={{ ...s.pille, color: STATUS_FARBE[z.status], borderColor: STATUS_FARBE[z.status] }}>
                {z.status === 'erledigt' ? '✓' : z.status === 'unbekannt' ? '?' : '○'} {STATUS_TEXT[z.status]}
              </span>
              <b style={{ color: '#fff', fontSize: 15 }}>{z.name}</b>
              <span style={{ flex: 1 }} />
              <span style={s.wer}>{ZUSTAENDIG_TEXT[z.zustaendig] ?? z.zustaendig}</span>
              {z.wo && z.status !== 'erledigt' && (
                z.wo.startsWith('#')
                  ? <button onClick={zumSetter} style={s.btnMini}>Einstellen</button>
                  : <a href={z.wo} style={s.btnMini}>Öffnen</a>
              )}
            </div>
            <p style={s.punktWarum}>{z.warum}</p>
          </div>
        ))}
        <p style={s.hinweis}>
          <b>„unbekannt“</b> heißt: Die Abfrage kam nicht durch — nicht, dass der Punkt offen ist.
          Erledigte Punkte bleiben erledigt, auch wenn ein Modul später abbestellt wird.
        </p>
      </div>
    </>
  );
}

const s: Record<string, CSSProperties> = {
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 16 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.4rem, 2.4vw, 2.1rem)', fontWeight: 700, color: C.gold, margin: 0 },
  sub: { fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '8px 0 0', maxWidth: '62ch', lineHeight: 1.6 },
  btnGhost: { background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' },

  tabZeile: { display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' },
  tab: { borderRadius: 999, border: '1px solid', padding: '9px 20px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 14.5, cursor: 'pointer' },

  karte: { background: C.navy2, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 22px', marginBottom: 18, fontFamily: 'DM Sans, sans-serif' },
  karteTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, color: '#fff', fontSize: '1.15rem', marginBottom: 12 },
  label: { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginBottom: 6 },
  input: { background: C.navy, color: '#fff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: 15, width: '100%', maxWidth: 460, boxSizing: 'border-box' },
  zeile: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  hinweis: { color: C.textDim, fontSize: 13, lineHeight: 1.55, margin: '8px 0 0', maxWidth: '72ch' },
  code: { background: C.navy, color: C.cyan, borderRadius: 6, padding: '2px 7px', fontFamily: 'ui-monospace, monospace', fontSize: 12.5 },

  balkenAussen: { background: 'rgba(255,255,255,0.08)', borderRadius: 999, height: 9, overflow: 'hidden' },
  balkenInnen: { height: '100%', borderRadius: 999 },
  balkenText: { color: C.textDim, fontSize: 13.5, marginTop: 10 },

  verlaufZeile: { display: 'flex', gap: 12, alignItems: 'center', padding: '5px 0' },
  verlaufMonat: { color: C.textDim, fontSize: 13, minWidth: 120, whiteSpace: 'nowrap' },
  verlaufBalken: { flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: 999, height: 8, overflow: 'hidden', minWidth: 60 },
  verlaufFuellung: { display: 'block', height: '100%', background: C.cyan, borderRadius: 999 },
  verlaufZahl: { color: '#fff', fontSize: 13.5, minWidth: 52, textAlign: 'right' },

  punkt: { padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  punktKopf: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  punktWarum: { color: C.textDim, fontSize: 13, lineHeight: 1.5, margin: '6px 0 0', maxWidth: '72ch' },
  pille: { border: '1px solid', borderRadius: 12, padding: '2px 11px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' },
  wer: { color: C.textDim, fontSize: 12.5, whiteSpace: 'nowrap' },

  wahl: { background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  wahlAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  vorlage: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}66`, borderRadius: 999, padding: '7px 15px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' },

  frageBox: { background: C.navy, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', marginTop: 10 },
  frageKopf: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  frageNr: { color: C.gold, fontWeight: 700, fontSize: 14, minWidth: 18 },
  checkZeile: { display: 'flex', gap: 6, alignItems: 'center', color: C.textDim, fontSize: 13, whiteSpace: 'nowrap' },
  btnMini: { background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '5px 11px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', textDecoration: 'none' },

  grenzenBox: { background: 'rgba(201,168,76,0.08)', border: `1px solid ${C.gold}55`, borderRadius: 14, padding: '18px 22px', marginBottom: 18, fontFamily: 'DM Sans, sans-serif' },
  grenzeZeile: { color: '#fff', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 10px', maxWidth: '72ch' },

  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 24px', fontFamily: 'inherit', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  btnCyan: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' },

  hint: { color: C.textDim, fontFamily: 'DM Sans, sans-serif', padding: 20 },
  warnBox: { background: 'rgba(224,162,76,0.12)', border: `1px solid ${C.warn}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 14 },
  fehlerBox: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: `1px solid ${C.danger}55`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: 'DM Sans, sans-serif' },
  okBox: { color: C.green, background: 'rgba(76,175,125,0.1)', border: `1px solid ${C.green}55`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: 'DM Sans, sans-serif' },
};
