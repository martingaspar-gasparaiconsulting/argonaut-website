'use client';

// ============================================================
// ARGONAUT OS · Webshop · Online-Zahlung (dunkel vorbereitet)
// Zeigt den Status der Kartenzahlung im Kunden-Shop und den Verbinden-Weg.
// „Dunkel": bis ein Stripe-/Mollie-Konto verbunden ist, bestellen Kunden
// normal (Rechnung/Überweisung/Abholung). Scharfstellen = Konto verbinden +
// lib/flags ZAHLUNG_LIVE=true. Pfad: app/dashboard/shop/zahlung/page.tsx
// ============================================================

import { CSSProperties } from 'react';
import { ZAHLUNG_LIVE } from '@/lib/flags';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

const SCHRITTE: { titel: string; text: string }[] = [
  { titel: '1 · Zahlungs-Konto anlegen', text: 'Legen Sie ein kostenloses Konto bei Stripe oder Mollie an (Ihr Konto bleibt bei Ihnen — die Auszahlungen gehen direkt auf Ihr Bankkonto).' },
  { titel: '2 · Konto verbinden', text: 'Verbinden Sie Ihr Konto hier mit einem Klick. Wir speichern nur einen widerrufbaren Zugang, nie Ihre Bankdaten.' },
  { titel: '3 · Kartenzahlung freischalten', text: 'Danach zahlen Ihre Kunden im Shop direkt per Karte, Apple/Google Pay & Co. — Sie sehen die Zahlung sofort zur Bestellung.' },
];

export default function ShopZahlungPage() {
  const aktiv = ZAHLUNG_LIVE;
  return (
    <div style={styles.page}>
      <div style={styles.head}>
        <div>
          <h1 style={styles.h1}>💳 Online-Zahlung</h1>
          <p style={styles.sub}>
            Kartenzahlung direkt im Shop — über Stripe oder Mollie. 0 € Grundgebühr, nur eine kleine Gebühr je Verkauf.
            Ihr Zahlungs-Konto bleibt Ihres; ARGONAUT verbindet es nur.
          </p>
        </div>
        <span style={{ ...styles.badge, color: aktiv ? C.green : C.warn, borderColor: aktiv ? C.green : C.warn }}>
          {aktiv ? '● Aktiv' : '○ Noch nicht aktiv'}
        </span>
      </div>

      {!aktiv && (
        <div style={styles.hinweisBox}>
          <b>Ihre Kunden können schon bestellen.</b> Solange die Kartenzahlung nicht verbunden ist, läuft die Bestellung
          ganz normal — Sie kassieren per Rechnung, Überweisung oder bei Abholung. Die Karten­zahlung schalten wir frei,
          sobald Sie ein Zahlungs-Konto verbunden haben.
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.cardTitel}>So aktivieren Sie die Kartenzahlung</div>
        <div style={styles.schritte}>
          {SCHRITTE.map((s) => (
            <div key={s.titel} style={styles.schritt}>
              <div style={styles.schrittTitel}>{s.titel}</div>
              <div style={styles.schrittText}>{s.text}</div>
            </div>
          ))}
        </div>
        <div style={styles.knopfRow}>
          <button style={styles.btnDisabled} disabled title="Kommt in Kürze — zuerst brauchen Sie ein Stripe-/Mollie-Konto">
            🔒 Zahlungs-Konto verbinden (bald verfügbar)
          </button>
          <span style={styles.knopfHint}>Wir richten die Verbindung gemeinsam ein, sobald Ihr Konto bereitsteht.</span>
        </div>
      </div>

      <div style={styles.info}>
        ℹ️ Warum so? Stripe/Mollie sind Pflicht-Partner nur fürs Bezahlen — sie kosten keine Grundgebühr und verdienen je
        Transaktion mit. Ihr Geld fließt direkt an Sie, nicht über ARGONAUT. Bis zur Freischaltung bleibt Ihr Shop voll
        nutzbar (Bestellung → Rechnung/CRM/Lager wie gewohnt).
      </div>

      <a href="/dashboard/shop" style={styles.zurueck}>← Zurück zu Shop / Marktplatz</a>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  head: { display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(24px,2.2vw,34px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 700 },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },

  hinweisBox: { marginTop: 16, background: 'rgba(76,175,125,0.08)', border: `1px solid ${C.green}55`, borderRadius: 12, padding: '14px 16px', fontSize: 14.5, lineHeight: 1.6, color: C.text },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 },
  cardTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 'clamp(16px,1.4vw,22px)' },
  schritte: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 },
  schritt: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 },
  schrittTitel: { fontWeight: 800, color: C.gold, fontSize: 14.5 },
  schrittText: { color: C.textDim, fontSize: 13.5, lineHeight: 1.55 },
  knopfRow: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  btnDisabled: { background: C.navy, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 800, cursor: 'not-allowed', fontFamily: 'inherit' },
  knopfHint: { color: C.textDim, fontSize: 13 },

  info: { marginTop: 16, fontSize: 13.5, color: C.textDim, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 },
  zurueck: { display: 'inline-block', marginTop: 18, color: C.cyan, textDecoration: 'none', fontWeight: 700, fontSize: 14 },
};
