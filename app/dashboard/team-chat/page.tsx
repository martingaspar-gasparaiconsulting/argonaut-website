'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ---------------------------------------------------------------------------
// ARGONAUT OS · BLOCK 13 · Team-Chat Cockpit (TC2 + TC3 + Namens-Einladen + Datei-Upload)
// ---------------------------------------------------------------------------

type Kanal = {
  id: string;
  name: string;
  beschreibung: string | null;
  typ: string;
  erstellt_von: string;
  created_at: string;
};

type Nachricht = {
  id: string;
  kanal_id: string;
  absender_id: string | null;
  absender_name: string;
  ist_ki: boolean;
  text: string;
  datei_pfad: string | null;
  datei_name: string | null;
  created_at: string;
};

type Kollege = {
  k_auth_user_id: string;
  k_anzeige: string;
  k_email: string;
  k_ist_mitglied: boolean;
};

type Mitglied = {
  m_user_id: string;
  m_anzeige: string;
  m_ist_moderator: boolean;
};

const NAVY = '#0A1628';
const PANEL = '#0F2038';
const PANEL2 = '#132844';
const BORDER = '#1E3A5F';
const GOLD = '#C9A84C';
const CYAN = '#00e5ff';
const GREEN = '#4CAF7D';
const TEXT = '#E8EEF6';
const DIM = '#8FA3BE';

const BUCKET = 'teamchat-dateien';
const MAX_MB = 25;

export default function TeamChatPage() {
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
    )
  );

  const [userId, setUserId] = useState<string | null>(null);
  const [anzeigename, setAnzeigename] = useState<string>('Ich');

  const [kanaele, setKanaele] = useState<Kanal[]>([]);
  const [aktiverKanal, setAktiverKanal] = useState<string | null>(null);
  const [nachrichten, setNachrichten] = useState<Nachricht[]>([]);

  const [entwurf, setEntwurf] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [kiDenkt, setKiDenkt] = useState(false);

  const [zeigeNeuerKanal, setZeigeNeuerKanal] = useState(false);
  const [neuerKanalName, setNeuerKanalName] = useState('');

  const [zeigeEinladen, setZeigeEinladen] = useState(false);
  const [kollegen, setKollegen] = useState<Kollege[]>([]);
  const [kollegenSuche, setKollegenSuche] = useState('');
  const [einladenLaedt, setEinladenLaedt] = useState<string | null>(null);
  const [einladenFehler, setEinladenFehler] = useState<string | null>(null);

  const [mitglieder, setMitglieder] = useState<Mitglied[]>([]);

  const [uploadLaedt, setUploadLaedt] = useState(false);
  const [uploadFehler, setUploadFehler] = useState<string | null>(null);

  // Fehler beim Senden waren bisher unsichtbar: der Text sprang zurueck ins
  // Feld, sonst nichts. Genau deshalb war der Chat jahrelang „kaputt", ohne
  // dass jemand sagen konnte warum. Ab jetzt steht der Grund auf dem Schirm.
  const [sendeFehler, setSendeFehler] = useState<string | null>(null);
  // Live-Verbindung: solange sie nicht steht, wird im Hintergrund nachgeladen,
  // damit Nachrichten trotzdem ankommen.
  const [liveVerbunden, setLiveVerbunden] = useState(false);
  const dateiInputRef = useRef<HTMLInputElement | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  /**
   * Eine Nachricht in die Liste legen — ohne Dubletten, immer nach Zeit sortiert.
   *
   * Braucht es, weil dieselbe Zeile aus zwei Richtungen kommen kann: sofort beim
   * Absenden (damit man den eigenen Satz nicht erst nach der Serverantwort
   * sieht) und noch einmal ueber die Live-Verbindung.
   */
  const nachrichtAufnehmen = useCallback((neu: Nachricht) => {
    setNachrichten((prev) => {
      if (prev.some((m) => m.id === neu.id)) return prev;
      const liste = [...prev, neu];
      liste.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return liste;
    });
  }, []);

  /** Verstaendlicher Klartext statt Datenbank-Kauderwelsch. */
  function fehlerText(meldung: string): string {
    const m = (meldung || '').toLowerCase();
    if (m.includes('row-level security') || m.includes('42501')) {
      return 'Du bist kein Mitglied dieses Kanals — deshalb hat die Datenbank das Schreiben abgelehnt. Lass dich vom Ersteller des Kanals einladen.';
    }
    if (m.includes('failed to fetch') || m.includes('networkerror')) {
      return 'Keine Verbindung zum Server. Internet pruefen und noch einmal senden.';
    }
    return 'Konnte nicht gesendet werden: ' + meldung;
  }

  // --- Kanaele laden ---------------------------------------------------------
  const ladeKanaele = useCallback(async () => {
    const { data } = await supabase
      .from('chat_kanaele')
      .select('*')
      .order('created_at', { ascending: true });
    const liste: Kanal[] = data ?? [];
    setKanaele(liste);
    setAktiverKanal((prev) => prev ?? (liste.length > 0 ? liste[0].id : null));
  }, [supabase]);

  const ladeMitglieder = useCallback(
    async (kanalId: string) => {
      const { data } = await supabase.rpc('chat_kanal_mitglieder', { p_kanal: kanalId });
      setMitglieder((data as Mitglied[]) ?? []);
    },
    [supabase]
  );

  const ladeKollegen = useCallback(
    async (kanalId: string) => {
      const { data } = await supabase.rpc('chat_team_kollegen', { p_kanal: kanalId });
      setKollegen((data as Kollege[]) ?? []);
    },
    [supabase]
  );

  // --- Initial: User (echter Name) + Kanaele --------------------------------
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      const mail: string | undefined = user?.email;
      const { data: meinName } = await supabase.rpc('chat_mein_name');
      setAnzeigename(
        (typeof meinName === 'string' && meinName.trim()) ||
          (mail ? mail.split('@')[0] : 'Ich')
      );
      await ladeKanaele();
      setLaedt(false);
    })();
  }, [supabase, ladeKanaele]);

  // --- Nachrichten laden + Realtime abonnieren -------------------------------
  useEffect(() => {
    if (!aktiverKanal) {
      setNachrichten([]);
      return;
    }
    let aktiv = true;

    (async () => {
      const { data } = await supabase
        .from('chat_nachrichten')
        .select('*')
        .eq('kanal_id', aktiverKanal)
        .order('created_at', { ascending: true });
      if (aktiv) setNachrichten(data ?? []);
    })();

    const ch = supabase
      .channel('teamchat-' + aktiverKanal)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_nachrichten',
          filter: 'kanal_id=eq.' + aktiverKanal,
        },
        (payload: { new: Nachricht }) => {
          if (aktiv) nachrichtAufnehmen(payload.new);
        }
      )
      .subscribe((status) => {
        if (aktiv) setLiveVerbunden(status === 'SUBSCRIBED');
      });

    /**
     * Sicherheitsnetz. Steht die Live-Verbindung nicht (Firma hinter einer
     * strengen Firewall, Handy im Funkloch, Realtime-Kontingent erschoepft),
     * wuerde der Chat einfach stumm bleiben. Alle 8 Sekunden nachladen kostet
     * fast nichts und macht den Unterschied zwischen „geht nicht" und „geht".
     */
    const takt = setInterval(async () => {
      const { data } = await supabase
        .from('chat_nachrichten')
        .select('*')
        .eq('kanal_id', aktiverKanal)
        .order('created_at', { ascending: true });
      if (aktiv && data) for (const m of data as Nachricht[]) nachrichtAufnehmen(m);
    }, 8000);

    return () => {
      aktiv = false;
      clearInterval(takt);
      setLiveVerbunden(false);
      supabase.removeChannel(ch);
    };
  }, [aktiverKanal, supabase, nachrichtAufnehmen]);

  // --- Mitglieder des aktiven Kanals laden -----------------------------------
  useEffect(() => {
    if (aktiverKanal) ladeMitglieder(aktiverKanal);
    else setMitglieder([]);
  }, [aktiverKanal, ladeMitglieder]);

  // --- Kollegenliste laden, wenn Einladen-Panel geoeffnet wird ---------------
  useEffect(() => {
    if (zeigeEinladen && aktiverKanal) {
      setEinladenFehler(null);
      ladeKollegen(aktiverKanal);
    }
  }, [zeigeEinladen, aktiverKanal, ladeKollegen]);

  // --- Auto-Scroll nach unten ------------------------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [nachrichten, kiDenkt]);

  // --- ARGONAUT-Antwort in den Kanal holen -----------------------------------
  async function argonautAntworten(ausloeser: string) {
    if (!aktiverKanal) return;
    const frage = ausloeser.replace(/@argonaut/gi, '').trim();

    /** KI-Zeile schreiben, sofort anzeigen, Fehler sichtbar machen. */
    const kiSchreiben = async (text: string) => {
      const { data, error } = await supabase
        .from('chat_nachrichten')
        .insert({ kanal_id: aktiverKanal, absender_id: null, absender_name: 'ARGONAUT', ist_ki: true, text })
        .select()
        .single();
      if (error) { setSendeFehler(fehlerText(error.message)); return; }
      if (data) nachrichtAufnehmen(data as Nachricht);
    };

    // Kein Text hinter @ARGONAUT -> freundliche Rueckfrage statt Fehler
    if (!frage) {
      await kiSchreiben('Gern! Stellen Sie mir Ihre Frage einfach direkt hinter @ARGONAUT — z. B. „@ARGONAUT fasse die letzten Nachrichten zusammen".');
      return;
    }

    setKiDenkt(true);
    try {
      const verlauf = nachrichten.slice(-15).map((m) => ({
        ist_ki: m.ist_ki,
        absender_name: m.absender_name,
        text: m.text,
      }));
      verlauf.push({ ist_ki: false, absender_name: anzeigename, text: ausloeser });

      const res = await fetch('/api/team-chat-ki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frage, verlauf }),
      });
      const data = await res.json();
      const antwort: string =
        (data && typeof data.text === 'string' && data.text.trim()) ||
        'Entschuldigung, ich konnte gerade keine Antwort erzeugen.';

      await kiSchreiben(antwort);
    } catch {
      await kiSchreiben('Entschuldigung, die Verbindung zu ARGONAUT ist gerade gestört.');
    } finally {
      setKiDenkt(false);
    }
  }

  // --- Nachricht senden ------------------------------------------------------
  async function senden() {
    const text = entwurf.trim();
    if (!text || !aktiverKanal || !userId) return;
    setEntwurf('');
    setSendeFehler(null);

    // Die eingefuegte Zeile direkt zurueckgeben lassen und sofort anzeigen.
    // Vorher hing die eigene Nachricht komplett an der Live-Verbindung: stand
    // die nicht, sah man den eigenen Satz erst nach dem Neuladen der Seite.
    const { data, error } = await supabase
      .from('chat_nachrichten')
      .insert({
        kanal_id: aktiverKanal,
        absender_id: userId,
        absender_name: anzeigename,
        ist_ki: false,
        text,
      })
      .select()
      .single();

    if (error) {
      setEntwurf(text);
      setSendeFehler(fehlerText(error.message));
      return;
    }
    if (data) nachrichtAufnehmen(data as Nachricht);

    if (/@argonaut/i.test(text)) {
      argonautAntworten(text);
    }
  }

  // --- Datei hochladen (jedes Mitglied) --------------------------------------
  async function dateiGewaehlt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (e.target) e.target.value = '';
    if (!file || !aktiverKanal || !userId) return;

    setUploadFehler(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadFehler('Datei zu groß (max. ' + MAX_MB + ' MB).');
      return;
    }

    setUploadLaedt(true);
    try {
      const punkt = file.name.lastIndexOf('.');
      const ext = punkt >= 0 ? file.name.slice(punkt) : '';
      const pfad = aktiverKanal + '/' + crypto.randomUUID() + ext;

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(pfad, file);
      if (upErr) {
        setUploadFehler('Upload fehlgeschlagen: ' + upErr.message);
        return;
      }

      // Der Fehler beim Einfuegen wurde vorher gar nicht abgefragt: die Datei lag
      // dann im Speicher, die Nachricht dazu erschien nie. Jetzt wird die
      // verwaiste Datei wieder entfernt und der Grund angezeigt.
      const { data, error: insErr } = await supabase
        .from('chat_nachrichten')
        .insert({
          kanal_id: aktiverKanal,
          absender_id: userId,
          absender_name: anzeigename,
          ist_ki: false,
          text: '',
          datei_pfad: pfad,
          datei_name: file.name,
        })
        .select()
        .single();

      if (insErr) {
        await supabase.storage.from(BUCKET).remove([pfad]);
        setUploadFehler(fehlerText(insErr.message));
        return;
      }
      if (data) nachrichtAufnehmen(data as Nachricht);
    } finally {
      setUploadLaedt(false);
    }
  }

  // --- Datei herunterladen (Signed URL, 60s gueltig) -------------------------
  async function dateiOeffnen(pfad: string) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(pfad, 60);
    if (data && data.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  }

  // --- Kanal anlegen ---------------------------------------------------------
  async function kanalErstellen() {
    const name = neuerKanalName.trim();
    if (!name || !userId) return;
    const { data, error } = await supabase
      .from('chat_kanaele')
      .insert({ name, typ: 'kanal', erstellt_von: userId })
      .select()
      .single();
    if (!error && data) {
      setNeuerKanalName('');
      setZeigeNeuerKanal(false);
      await ladeKanaele();
      setAktiverKanal((data as Kanal).id);
    }
  }

  // --- Kollege einladen (per Klick aus der Liste) ----------------------------
  async function kollegeEinladen(k: Kollege) {
    if (!aktiverKanal) return;
    setEinladenLaedt(k.k_auth_user_id);
    setEinladenFehler(null);
    const { data, error } = await supabase.rpc('chat_mitglied_hinzufuegen', {
      p_kanal: aktiverKanal,
      p_user: k.k_auth_user_id,
    });
    setEinladenLaedt(null);
    if (!error && data === 'ok') {
      await ladeKollegen(aktiverKanal);
      await ladeMitglieder(aktiverKanal);
    } else {
      setEinladenFehler(error ? 'Fehler: ' + error.message : String(data));
    }
  }

  const aktKanalObj = kanaele.find((k) => k.id === aktiverKanal) || null;
  const moderator = mitglieder.find((m) => m.m_ist_moderator) || null;
  const andereMitglieder = mitglieder.filter((m) => !m.m_ist_moderator);

  const suche = kollegenSuche.trim().toLowerCase();
  const gefilterteKollegen = suche
    ? kollegen.filter(
        (k) =>
          k.k_anzeige.toLowerCase().includes(suche) ||
          k.k_email.toLowerCase().includes(suche)
      )
    : kollegen;

  function zeitFormat(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 4px 44px' }}>
      {/* MODUL-KOPF */}
      <h1
        style={{
          color: GOLD,
          fontSize: 'clamp(34px, 3vw, 48px)',
          fontWeight: 700,
          margin: '0 0 6px 0',
          letterSpacing: 0.3,
        }}
      >
        🗨️ Team-Chat
      </h1>
      <p style={{ color: DIM, fontSize: 'clamp(15px, 1.31vw, 21px)', margin: '0 0 22px 0', maxWidth: 720 }}>
        Kommunizieren Sie in Echtzeit mit Ihrem Team. Legen Sie Kanäle an, laden
        Sie Kollegen ein und schalten Sie bei Bedarf ARGONAUT direkt in das
        Gespräch dazu.
      </p>

      {laedt ? (
        <div style={{ color: DIM, padding: 40 }}>Lädt …</div>
      ) : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
          {/* LINKS: KANALLISTE */}
          <div
            style={{
              width: 260,
              flexShrink: 0,
              background: PANEL,
              border: '1px solid ' + BORDER,
              borderRadius: 12,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              height: 600,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <span style={{ color: TEXT, fontWeight: 600, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>Kanäle</span>
              <button
                onClick={() => setZeigeNeuerKanal((v) => !v)}
                style={{
                  background: 'transparent',
                  border: '1px solid ' + BORDER,
                  color: GOLD,
                  borderRadius: 8,
                  padding: '2px 10px',
                  cursor: 'pointer',
                  fontSize: 'clamp(18px, 1.56vw, 25px)',
                  lineHeight: 1,
                }}
                title="Neuer Kanal"
              >
                +
              </button>
            </div>

            {zeigeNeuerKanal && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input
                  value={neuerKanalName}
                  onChange={(e) => setNeuerKanalName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && kanalErstellen()}
                  placeholder="Kanalname"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: NAVY,
                    border: '1px solid ' + BORDER,
                    color: TEXT,
                    borderRadius: 8,
                    padding: '6px 8px',
                    fontSize: 'clamp(13px, 1.13vw, 18px)',
                  }}
                />
                <button
                  onClick={kanalErstellen}
                  style={{
                    background: GOLD,
                    border: 'none',
                    color: NAVY,
                    borderRadius: 8,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 'clamp(13px, 1.13vw, 18px)',
                  }}
                >
                  OK
                </button>
              </div>
            )}

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {kanaele.length === 0 && (
                <span style={{ color: DIM, fontSize: 'clamp(13px, 1.13vw, 18px)', padding: '6px 4px' }}>
                  Noch kein Kanal. Legen Sie oben mit „+" den ersten an.
                </span>
              )}
              {kanaele.map((k) => {
                const aktiv = k.id === aktiverKanal;
                return (
                  <button
                    key={k.id}
                    onClick={() => {
                      setAktiverKanal(k.id);
                      setZeigeEinladen(false);
                      setKollegenSuche('');
                    }}
                    style={{
                      textAlign: 'left',
                      background: aktiv ? PANEL2 : 'transparent',
                      border: '1px solid ' + (aktiv ? CYAN : 'transparent'),
                      color: aktiv ? TEXT : DIM,
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      fontSize: 'clamp(14px, 1.25vw, 20px)',
                      fontWeight: aktiv ? 600 : 400,
                    }}
                  >
                    # {k.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* RECHTS: CHAT-FENSTER */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              background: PANEL,
              border: '1px solid ' + BORDER,
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              height: 600,
            }}
          >
            {!aktiverKanal ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: DIM,
                }}
              >
                Wählen Sie links einen Kanal oder legen Sie einen an.
              </div>
            ) : (
              <>
                {/* Kanal-Kopf mit Moderator + Mitgliedern */}
                <div
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid ' + BORDER,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: TEXT, fontWeight: 600, fontSize: 'clamp(16px, 1.38vw, 22px)' }}>
                      # {aktKanalObj?.name}
                    </div>
                    <div style={{ color: DIM, fontSize: 'clamp(12.5px, 1.13vw, 18px)', marginTop: 4 }}>
                      <span style={{ color: GOLD }}>
                        👑 Moderator: {moderator ? moderator.m_anzeige : '—'}
                      </span>
                      {andereMitglieder.length > 0 ? (
                        <span>
                          {'  ·  '}
                          {andereMitglieder.map((m) => m.m_anzeige).join(', ')}
                        </span>
                      ) : (
                        <span>{'  ·  nur Sie'}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setZeigeEinladen((v) => !v)}
                    style={{
                      flexShrink: 0,
                      background: 'transparent',
                      border: '1px solid ' + BORDER,
                      color: CYAN,
                      borderRadius: 8,
                      padding: '5px 12px',
                      cursor: 'pointer',
                      fontSize: 'clamp(13px, 1.13vw, 18px)',
                    }}
                  >
                    ＋ Kollege einladen
                  </button>
                </div>

                {/* Einladen-Panel: Suche + Kollegenliste */}
                {zeigeEinladen && (
                  <div
                    style={{
                      padding: '12px 18px',
                      borderBottom: '1px solid ' + BORDER,
                      background: PANEL2,
                    }}
                  >
                    <input
                      value={kollegenSuche}
                      onChange={(e) => setKollegenSuche(e.target.value)}
                      placeholder="Kollegen nach Namen suchen …"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        background: NAVY,
                        border: '1px solid ' + BORDER,
                        color: TEXT,
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 'clamp(13px, 1.13vw, 18px)',
                        marginBottom: 8,
                      }}
                    />
                    <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {gefilterteKollegen.length === 0 && (
                        <span style={{ color: DIM, fontSize: 'clamp(13px, 1.13vw, 18px)', padding: '4px 2px' }}>
                          Keine Kollegen mit Login gefunden.
                        </span>
                      )}
                      {gefilterteKollegen.map((k) => (
                        <div
                          key={k.k_auth_user_id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 10,
                            padding: '7px 10px',
                            background: NAVY,
                            border: '1px solid ' + BORDER,
                            borderRadius: 8,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: TEXT, fontSize: 'clamp(13.5px, 1.19vw, 19px)', fontWeight: 600 }}>
                              {k.k_anzeige || k.k_email}
                            </div>
                            <div style={{ color: DIM, fontSize: 'clamp(11.5px, 1vw, 16px)' }}>{k.k_email}</div>
                          </div>
                          {k.k_ist_mitglied ? (
                            <span style={{ color: GREEN, fontSize: 'clamp(12.5px, 1.13vw, 18px)', fontWeight: 600, flexShrink: 0 }}>
                              ✓ im Kanal
                            </span>
                          ) : (
                            <button
                              onClick={() => kollegeEinladen(k)}
                              disabled={einladenLaedt === k.k_auth_user_id}
                              style={{
                                flexShrink: 0,
                                background: CYAN,
                                border: 'none',
                                color: NAVY,
                                borderRadius: 8,
                                padding: '5px 12px',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: 'clamp(12.5px, 1.13vw, 18px)',
                              }}
                            >
                              {einladenLaedt === k.k_auth_user_id ? '…' : 'Einladen'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {einladenFehler && (
                      <div style={{ color: DIM, fontSize: 'clamp(12.5px, 1.13vw, 18px)', marginTop: 8 }}>{einladenFehler}</div>
                    )}
                  </div>
                )}

                {/* Nachrichtenliste */}
                <div
                  ref={scrollRef}
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  {nachrichten.length === 0 && !kiDenkt && (
                    <div style={{ color: DIM, fontSize: 'clamp(14px, 1.25vw, 20px)', textAlign: 'center', marginTop: 20 }}>
                      Noch keine Nachrichten. Schreiben Sie die erste.
                    </div>
                  )}
                  {nachrichten.map((m) => {
                    const eigen = m.absender_id === userId && !m.ist_ki;
                    const farbe = m.ist_ki ? GOLD : eigen ? CYAN : DIM;
                    return (
                      <div
                        key={m.id}
                        style={{ alignSelf: eigen ? 'flex-end' : 'flex-start', maxWidth: '72%' }}
                      >
                        <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: farbe, marginBottom: 3, fontWeight: 600 }}>
                          {m.ist_ki ? '⚡ ARGONAUT' : m.absender_name}
                          <span style={{ color: DIM, fontWeight: 400, marginLeft: 8 }}>
                            {zeitFormat(m.created_at)}
                          </span>
                        </div>
                        <div
                          style={{
                            background: eigen ? '#0E3A46' : m.ist_ki ? '#2A2413' : PANEL2,
                            border: '1px solid ' + (m.ist_ki ? GOLD : eigen ? CYAN : BORDER),
                            color: TEXT,
                            borderRadius: 10,
                            padding: '9px 13px',
                            fontSize: 'clamp(14px, 1.25vw, 20px)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {m.text && <span>{m.text}</span>}
                          {m.datei_pfad && (
                            <button
                              onClick={() => dateiOeffnen(m.datei_pfad as string)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                marginTop: m.text ? 8 : 0,
                                background: NAVY,
                                border: '1px solid ' + CYAN,
                                color: CYAN,
                                borderRadius: 8,
                                padding: '8px 12px',
                                cursor: 'pointer',
                                fontSize: 'clamp(13px, 1.13vw, 18px)',
                                fontWeight: 600,
                                maxWidth: '100%',
                              }}
                              title="Herunterladen"
                            >
                              <span>📎</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.datei_name || 'Datei'}
                              </span>
                              <span style={{ color: DIM, fontWeight: 400 }}>· herunterladen</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {kiDenkt && (
                    <div style={{ alignSelf: 'flex-start', maxWidth: '72%' }}>
                      <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: GOLD, marginBottom: 3, fontWeight: 600 }}>
                        ⚡ ARGONAUT
                      </div>
                      <div
                        style={{
                          background: '#2A2413',
                          border: '1px solid ' + GOLD,
                          color: DIM,
                          borderRadius: 10,
                          padding: '9px 13px',
                          fontSize: 'clamp(14px, 1.25vw, 20px)',
                          fontStyle: 'italic',
                        }}
                      >
                        schreibt …
                      </div>
                    </div>
                  )}
                </div>

                {/* Eingabe */}
                <div
                  style={{
                    borderTop: '1px solid ' + BORDER,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: DIM, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>
                      Tipp: Schreiben Sie{' '}
                      <span style={{ color: GOLD, fontWeight: 600 }}>@ARGONAUT</span>{' '}
                      …, um die KI in den Kanal zu holen.
                    </span>
                    {uploadLaedt && <span style={{ color: CYAN }}>📎 Datei wird hochgeladen …</span>}
                    {!liveVerbunden && !uploadLaedt && (
                      <span style={{ color: GOLD }} title="Nachrichten werden alle 8 Sekunden nachgeladen.">
                        ● Live-Verbindung wird aufgebaut
                      </span>
                    )}
                  </div>

                  {(sendeFehler || uploadFehler) && (
                    <div
                      style={{
                        background: 'rgba(224,102,102,0.10)',
                        border: '1px solid rgba(224,102,102,0.35)',
                        color: '#E06666',
                        borderRadius: 10,
                        padding: '10px 13px',
                        fontSize: 'clamp(13px, 1.13vw, 18px)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                      }}
                    >
                      <span style={{ flex: 1 }}>{sendeFehler || uploadFehler}</span>
                      <button
                        onClick={() => { setSendeFehler(null); setUploadFehler(null); }}
                        style={{ background: 'transparent', border: 'none', color: '#E06666', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                        title="Meldung ausblenden"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                    <input
                      ref={dateiInputRef}
                      type="file"
                      onChange={dateiGewaehlt}
                      style={{ display: 'none' }}
                    />
                    <button
                      onClick={() => dateiInputRef.current && dateiInputRef.current.click()}
                      disabled={uploadLaedt}
                      title="Datei anhängen"
                      style={{
                        flexShrink: 0,
                        background: 'transparent',
                        border: '1px solid ' + BORDER,
                        color: uploadLaedt ? DIM : CYAN,
                        borderRadius: 10,
                        padding: '11px 14px',
                        cursor: uploadLaedt ? 'default' : 'pointer',
                        fontSize: 'clamp(16px, 1.38vw, 22px)',
                        lineHeight: 1,
                      }}
                    >
                      📎
                    </button>
                    <textarea
                      value={entwurf}
                      onChange={(e) => setEntwurf(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          senden();
                        }
                      }}
                      placeholder="Nachricht schreiben … (Enter = senden, Shift+Enter = neue Zeile)"
                      rows={1}
                      style={{
                        flex: 1,
                        resize: 'none',
                        background: NAVY,
                        border: '1px solid ' + BORDER,
                        color: TEXT,
                        borderRadius: 10,
                        padding: '11px 13px',
                        fontSize: 'clamp(14px, 1.25vw, 20px)',
                        fontFamily: 'inherit',
                        lineHeight: 1.4,
                        maxHeight: 120,
                      }}
                    />
                    <button
                      onClick={senden}
                      disabled={!entwurf.trim()}
                      style={{
                        flexShrink: 0,
                        background: entwurf.trim() ? GOLD : BORDER,
                        border: 'none',
                        color: entwurf.trim() ? NAVY : DIM,
                        borderRadius: 10,
                        padding: '0 22px',
                        height: 44,
                        cursor: entwurf.trim() ? 'pointer' : 'default',
                        fontWeight: 700,
                        fontSize: 'clamp(14px, 1.25vw, 20px)',
                      }}
                    >
                      Senden
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
