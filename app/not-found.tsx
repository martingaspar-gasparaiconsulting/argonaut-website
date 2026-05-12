export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', background: '#0D1B3E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '80px', fontWeight: 900, color: '#D4A843', lineHeight: 1 }}>404</div>
        <h1 style={{ fontSize: '24px', color: '#FFFFFF', fontWeight: 700, margin: '16px 0 8px' }}>Seite nicht gefunden</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '15px', marginBottom: '32px' }}>Diese Seite existiert nicht oder wurde verschoben.</p>
        <a href="/" style={{ padding: '12px 32px', background: '#D4A843', color: '#0D1B3E', borderRadius: '8px', fontWeight: 700, fontSize: '15px', textDecoration: 'none' }}>
          Zurück zur Startseite →
        </a>
      </div>
    </div>
  )
}