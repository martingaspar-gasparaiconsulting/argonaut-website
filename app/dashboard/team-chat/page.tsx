'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ---------------------------------------------------------------------------
// ARGONAUT OS · BLOCK 13 · TC2 — Team-Chat Cockpit
// Kanalliste + Nachrichten + Senden + Supabase Realtime (Live-Empfang)
// Kanal anlegen + Mitglied per E-Mail einladen (RPC chat_mitglied_per_email)
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
  created_at: string;
};

const NAVY = '#0A1628';
const PANEL = '#0F2038';
const PANEL2 = '#132844';
const BORDER = '#1E3A5F';
const GOLD = '#C9A84C';
const CYAN = '#00e5ff';
const GREEN = '#4CAF7D';
const DANGER = '#E06666';
const TEXT = '#E8EEF6';
const DIM = '#8FA3BE';

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

  const [zeigeNeuerKanal, setZeigeNeuerKanal] = useState(false);
  const [neuerKanalName, setNeuerKanalName] = useState('');

  const [zeigeEinladen, setZeigeEinladen] = useState(false);
  const [einladenEmail, setEinladenEmail] = useState('');
  const [einladenStatus, setEinladenStatus] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

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

  // --- Initial: User + Kanaele ----------------------------------------------
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      const mail: string | undefined = user?.email;
      setAnzeigename(mail ? mail.split('@')[0] : 'Ich');
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
          const neu = payload.new;
          setNachrichten((prev) =>
            prev.some((m) => m.id === neu.id) ? prev : [...prev, neu]
          );
        }
      )
      .subscribe();

    return () => {
      aktiv = false;
      supabase.removeChannel(ch);
    };
  }, [aktiverKanal, supabase]);

  // --- Auto-Scroll nach unten bei neuer Nachricht ----------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [nachrichten]);

  // --- Nachricht senden ------------------------------------------------------
  async function senden() {
    const text = entwurf.trim();
    if (!text || !aktiverKanal || !userId) return;
    setEntwurf('');
    const { error } = await supabase.from('chat_nachrichten').insert({
      kanal_id: aktiverKanal,
      absender_id: userId,
      absender_name: anzeigename,
      ist_ki: false,
      text,
    });
    if (error) {
      // bei Fehler Entwurf zuruecklegen, damit nichts verloren geht
      setEntwurf(text);
    }
    // Anzeige erfolgt ueber Realtime-Event (kein doppeltes Einfuegen)
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

  // --- Mitglied per E-Mail einladen ------------------------------------------
  async function einladen() {
    const mail = einladenEmail.trim();
    if (!mail || !aktiverKanal) return;
    setEinladenStatus('Wird geprüft …');
    const { data, error } = await supabase.rpc('chat_mitglied_per_email', {
      p_kanal: aktiverKanal,
      p_email: mail,
    });
    if (error) {
      setEinladenStatus('Fehler: ' + error.message);
      return;
    }
    if (data === 'ok') {
      setEinladenStatus('✓ Kollege wurde hinzugefügt.');
      setEinladenEmail('');
    } else {
      setEinladenStatus(String(data));
    }
  }

  const aktKanalObj = kanaele.find((k) => k.id === aktiverKanal) || null;

  function zeitFormat(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 4px' }}>
      {/* MODUL-KOPF */}
      <h1
        style={{
          color: GOLD,
          fontSize: 34,
          fontWeight: 700,
          margin: '0 0 6px 0',
          letterSpacing: 0.3,
        }}
      >
        👥 Team-Chat
      </h1>
      <p style={{ color: DIM, fontSize: 15, margin: '0 0 22px 0', maxWidth: 720 }}>
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
              height: 620,
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
              <span style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>
                Kanäle
              </span>
              <button
                onClick={() => setZeigeNeuerKanal((v) => !v)}
                style={{
                  background: 'transparent',
                  border: '1px solid ' + BORDER,
                  color: GOLD,
                  borderRadius: 8,
                  padding: '2px 10px',
                  cursor: 'pointer',
                  fontSize: 18,
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
                    fontSize: 13,
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
                    fontSize: 13,
                  }}
                >
                  OK
                </button>
              </div>
            )}

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {kanaele.length === 0 && (
                <span style={{ color: DIM, fontSize: 13, padding: '6px 4px' }}>
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
                      setEinladenStatus(null);
                    }}
                    style={{
                      textAlign: 'left',
                      background: aktiv ? PANEL2 : 'transparent',
                      border: '1px solid ' + (aktiv ? CYAN : 'transparent'),
                      color: aktiv ? TEXT : DIM,
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      fontSize: 14,
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
              height: 620,
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
                {/* Kanal-Kopf */}
                <div
                  style={{
                    padding: '14px 18px',
                    borderBottom: '1px solid ' + BORDER,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ color: TEXT, fontWeight: 600, fontSize: 16 }}>
                    # {aktKanalObj?.name}
                  </div>
                  <button
                    onClick={() => {
                      setZeigeEinladen((v) => !v);
                      setEinladenStatus(null);
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid ' + BORDER,
                      color: CYAN,
                      borderRadius: 8,
                      padding: '5px 12px',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    ＋ Kollege einladen
                  </button>
                </div>

                {/* Einladen-Panel */}
                {zeigeEinladen && (
                  <div
                    style={{
                      padding: '12px 18px',
                      borderBottom: '1px solid ' + BORDER,
                      background: PANEL2,
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <input
                      value={einladenEmail}
                      onChange={(e) => setEinladenEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && einladen()}
                      placeholder="E-Mail des Kollegen"
                      style={{
                        flex: 1,
                        minWidth: 200,
                        background: NAVY,
                        border: '1px solid ' + BORDER,
                        color: TEXT,
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 13,
                      }}
                    />
                    <button
                      onClick={einladen}
                      style={{
                        background: CYAN,
                        border: 'none',
                        color: NAVY,
                        borderRadius: 8,
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      Hinzufügen
                    </button>
                    {einladenStatus && (
                      <span
                        style={{
                          color: einladenStatus.startsWith('✓') ? GREEN : DIM,
                          fontSize: 13,
                          width: '100%',
                        }}
                      >
                        {einladenStatus}
                      </span>
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
                  {nachrichten.length === 0 && (
                    <div style={{ color: DIM, fontSize: 14, textAlign: 'center', marginTop: 20 }}>
                      Noch keine Nachrichten. Schreiben Sie die erste.
                    </div>
                  )}
                  {nachrichten.map((m) => {
                    const eigen = m.absender_id === userId && !m.ist_ki;
                    const farbe = m.ist_ki ? GOLD : eigen ? CYAN : DIM;
                    return (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: eigen ? 'flex-end' : 'flex-start',
                          maxWidth: '72%',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            color: farbe,
                            marginBottom: 3,
                            fontWeight: 600,
                          }}
                        >
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
                            fontSize: 14,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {m.text}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Eingabe */}
                <div
                  style={{
                    padding: 14,
                    borderTop: '1px solid ' + BORDER,
                    display: 'flex',
                    gap: 10,
                  }}
                >
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
                      fontSize: 14,
                      fontFamily: 'inherit',
                      lineHeight: 1.4,
                      maxHeight: 120,
                    }}
                  />
                  <button
                    onClick={senden}
                    disabled={!entwurf.trim()}
                    style={{
                      background: entwurf.trim() ? GOLD : BORDER,
                      border: 'none',
                      color: entwurf.trim() ? NAVY : DIM,
                      borderRadius: 10,
                      padding: '0 22px',
                      cursor: entwurf.trim() ? 'pointer' : 'default',
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    Senden
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
