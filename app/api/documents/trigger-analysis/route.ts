import { NextRequest, NextResponse } from 'next/server'

// Production-Webhook des n8n-Workflows. Diese URL ist nicht geheim.
const N8N_WEBHOOK_URL = 'https://n8n.srv1133627.hstgr.cloud/webhook/argonaut-doc-analyze'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const document_id = body.document_id
    const user_id = body.user_id
    const storage_path = body.storage_path
    const file_type = body.file_type

    if (!document_id || !user_id || !storage_path) {
      return NextResponse.json(
        { ok: false, error: 'document_id, user_id und storage_path sind erforderlich.' },
        { status: 400 }
      )
    }

    const res = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id, user_id, storage_path, file_type }),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { ok: false, error: 'n8n-Status ' + res.status + ': ' + text },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
