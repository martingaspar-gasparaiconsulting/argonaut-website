// ============================================================================
// ARGONAUT OS · lib/textPdf.ts — Text-Werkstatt-Dokument zu PDF (Paket PC)
//
// Wie lib/dossierPdf.ts über Gotenberg, aber für WEISSE, druckbare Dokumente:
// Ränder statt Vollfläche, keine Hintergründe (spart Toner, sieht auf jedem
// Drucker gleich aus). Das HTML kommt aus lib/textMotor.dokumentHtml und ist
// dort bereits maskiert.
// SERVER-ONLY (Gotenberg-Zugang). Gibt den PDF-Buffer zurück oder null.
// ============================================================================

export async function textPdf(html: string): Promise<Buffer | null> {
  const gotenbergUrl = process.env.GOTENBERG_URL;
  if (!gotenbergUrl) {
    console.error('GOTENBERG_URL fehlt — kein Text-PDF.');
    return null;
  }
  const gUser = process.env.GOTENBERG_USER;
  const gPass = process.env.GOTENBERG_PASSWORD;
  try {
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('printBackground', 'false');
    // Ränder in Zoll (20 mm oben/unten ≈ 0,79 in, 18 mm seitlich ≈ 0,71 in) —
    // passend zu @page in dokumentHtml, damit beide Wege dasselbe ergeben.
    form.append('marginTop', '0.79');
    form.append('marginBottom', '0.87');
    form.append('marginLeft', '0.71');
    form.append('marginRight', '0.71');
    form.append('paperWidth', '8.27');
    form.append('paperHeight', '11.69');

    const authHeader = gUser && gPass ? 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64') : '';
    const resp = await fetch(`${gotenbergUrl.replace(/\/$/, '')}/forms/chromium/convert/html`, {
      method: 'POST',
      headers: authHeader ? { Authorization: authHeader } : undefined,
      body: form,
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      console.error('Text-PDF Gotenberg Fehler:', resp.status, t.slice(0, 200));
      return null;
    }
    return Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    console.error('Text-PDF Gotenberg nicht erreichbar:', e);
    return null;
  }
}
