'use client'

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Plan = 'starter' | 'professional' | 'business' | 'enterprise'
export type Status = 'active' | 'inactive' | 'trial'

export interface Customer {
  id: string
  full_name: string | null
  email: string | null
  company: string | null
  plan: Plan | null
  status: Status | null
  role: string | null
  created_at: string | null
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PLAN_CFG: Record<Plan, { label: string; color: string }> = {
  starter:      { label: 'Starter',      color: '#6b7280' },
  professional: { label: 'Professional', color: '#C9A84C' },
  business:     { label: 'Business',     color: '#4f94e8' },
  enterprise:   { label: 'Enterprise',   color: '#a855f7' },
}

const STATUS_CFG: Record<Status, { label: string; color: string }> = {
  active:   { label: 'Aktiv',     color: '#22c55e' },
  inactive: { label: 'Inaktiv',   color: '#ef4444' },
  trial:    { label: 'Testphase', color: '#f59e0b' },
}

const PLAN_OPTIONS: Array<{ value: Plan | 'all'; label: string }> = [
  { value: 'all',          label: 'Alle Pläne'    },
  { value: 'starter',      label: 'Starter'       },
  { value: 'professional', label: 'Professional'  },
  { value: 'business',     label: 'Business'      },
  { value: 'enterprise',   label: 'Enterprise'    },
]

const STATUS_OPTIONS: Array<{ value: Status | 'all'; label: string }> = [
  { value: 'all',      label: 'Alle Status'  },
  { value: 'active',   label: 'Aktiv'        },
  { value: 'inactive', label: 'Inaktiv'      },
  { value: 'trial',    label: 'Testphase'    },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

function PlanBadge({ plan }: { plan: Plan | null }) {
  if (!plan) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
  const cfg = PLAN_CFG[plan]
  return (
    <span style={{
      padding: '3px 10px',
      borderRadius: '999px',
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: cfg.color,
      background: `${cfg.color}22`,
      border: `1px solid ${cfg.color}44`,
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  )
}

function StatusBadge({ status }: { status: Status | null }) {
  if (!status) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
  const cfg = STATUS_CFG[status]
  return (
    <span style={{
      padding: '3px 10px',
      borderRadius: '999px',
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: cfg.color,
      background: `${cfg.color}22`,
      border: `1px solid ${cfg.color}44`,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: cfg.color, display: 'inline-block', flexShrink: 0 }} />
      {cfg.label}
    </span>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '9px 14px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(201,168,76,0.2)',
  borderRadius: '8px',
  color: '#FFFFFF',
  fontSize: '13px',
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 7L11 1' stroke='%23C9A84C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: '36px',
  minWidth: '140px',
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.35)',
  borderBottom: '1px solid rgba(201,168,76,0.12)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '14px',
  color: 'rgba(255,255,255,0.85)',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  verticalAlign: 'middle',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomersTable({ customers }: { customers: Customer[] }) {
  const [planFilter, setPlanFilter] = useState<Plan | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [search, setSearch] = useState('')

  const filtered = customers.filter((c) => {
    if (planFilter !== 'all' && c.plan !== planFilter) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        c.full_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div>
      {/* Filter bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        marginBottom: '20px',
        alignItems: 'center',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <svg
            width="14" height="14"
            viewBox="0 0 24 24" fill="none"
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="7" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>
            <path d="M16.5 16.5L21 21" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Name, E-Mail oder Firma suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 14px 9px 34px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.2)' }}
          />
        </div>

        {/* Plan filter */}
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as Plan | 'all')}
          style={selectStyle}
        >
          {PLAN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} style={{ background: '#0A1628', color: '#fff' }}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | 'all')}
          style={selectStyle}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} style={{ background: '#0A1628', color: '#fff' }}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Result count */}
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
          {filtered.length} von {customers.length} Kunden
        </span>
      </div>

      {/* Table wrapper — scrollable on small screens */}
      <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid rgba(201,168,76,0.15)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>E-Mail</th>
              <th style={thStyle}>Firma</th>
              <th style={thStyle}>Plan</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Erstellt am</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: '48px 16px', color: 'rgba(255,255,255,0.25)' }}>
                  Keine Kunden gefunden.
                </td>
              </tr>
            ) : (
              filtered.map((customer, i) => (
                <tr
                  key={customer.id}
                  style={{ background: i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(201,168,76,0.05)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}
                >
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {/* Avatar */}
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'rgba(201,168,76,0.15)',
                        border: '1px solid rgba(201,168,76,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#C9A84C',
                        flexShrink: 0,
                      }}>
                        {(customer.full_name || customer.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {customer.full_name || <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.55)', fontSize: '13px' }}>
                    {customer.email || '—'}
                  </td>
                  <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.55)', fontSize: '13px' }}>
                    {customer.company || <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                  </td>
                  <td style={tdStyle}>
                    <PlanBadge plan={customer.plan} />
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge status={customer.status} />
                  </td>
                  <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.4)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    {formatDate(customer.created_at)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button
                      style={{
                        padding: '6px 14px',
                        background: 'transparent',
                        border: '1px solid rgba(201,168,76,0.3)',
                        borderRadius: '6px',
                        color: '#C9A84C',
                        fontSize: '12px',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(201,168,76,0.12)'
                        e.currentTarget.style.borderColor = '#C9A84C'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.borderColor = 'rgba(201,168,76,0.3)'
                      }}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
