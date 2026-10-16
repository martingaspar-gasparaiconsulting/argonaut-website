'use client'
// Paket VK2: Spickzettel drucken (eigene Komponente, weil die Seite auf dem Server läuft).
export default function DruckKnopf() {
  return (
    <button onClick={() => window.print()} style={{ background: '#0a1628', color: '#fff', border: 'none', borderRadius: '10px', padding: '9px 16px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
      🖨 Drucken
    </button>
  )
}
