'use client';

// Paket 292: Druck-Knopf für den Mietvertrag (die Seite selbst rendert auf dem Server).
export default function DruckKnopf() {
  return (
    <button type="button" className="nicht-drucken" onClick={() => window.print()}
      style={{ background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 }}>
      🖨 Drucken / als PDF speichern
    </button>
  );
}
