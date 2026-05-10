'use client'
import { useState } from 'react'

export type Plan = string
export type Status = string

export interface Customer {
  id: number
  name: string | null
  email: string | null
  paket: string | null
  status: string | null
  created_at: string | null
}

const PLAN_CFG: Record<string,{label:string;color:string}> = {
  SOLO:  {label:'SOLO Beta',  color:'#C9A84C'},
  START: {label:'START',      color:'#C9A84C'},
  PRO:   {label:'PRO',        color:'#4f94e8'},
  BUS:   {label:'BUSINESS',   color:'#4f94e8'},
  ENT:   {label:'ENTERPRISE', color:'#a855f7'},
  BASIS: {label:'BASIS',      color:'#6b7280'},
}

function formatDate(iso:string|null):string {
  if(!iso) return '-'
  return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(iso))
}

function PlanBadge({paket}:{paket:string|null}) {
  if(!paket) return <span style={{color:'rgba(255,255,255,0.25)'}}>-</span>
  const cfg = PLAN_CFG[paket] ?? {label:paket,color:'#6b7280'}
  return <span style={{padding:'3px 10px',borderRadius:'999px',fontSize:'11px',fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase' as const,color:cfg.color,background:cfg.color+'22',border:'1px solid '+cfg.color+'44',whiteSpace:'nowrap' as const}}>{cfg.label}</span>
}

function StatusBadge({status}:{status:string|null}) {
  const color = status==='aktiv'||status==='active' ? '#22c55e' : '#ef4444'
  const label = status==='aktiv'||status==='active' ? 'Aktiv' : (status||'-')
  return <span style={{padding:'3px 10px',borderRadius:'999px',fontSize:'11px',fontWeight:700,color,background:color+'22',border:'1px solid '+color+'44',display:'inline-flex',alignItems:'center',gap:'5px',whiteSpace:'nowrap' as const}}><span style={{width:'5px',height:'5px',borderRadius:'50%',background:color,display:'inline-block'}}/>{label}</span>
}

const thStyle:React.CSSProperties={padding:'12px 16px',textAlign:'left',fontSize:'11px',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(255,255,255,0.35)',borderBottom:'1px solid rgba(201,168,76,0.12)',whiteSpace:'nowrap'}
const tdStyle:React.CSSProperties={padding:'14px 16px',fontSize:'14px',color:'rgba(255,255,255,0.85)',borderBottom:'1px solid rgba(255,255,255,0.05)',verticalAlign:'middle'}

export default function CustomersTable({customers}:{customers:Customer[]}) {
  const [search,setSearch]=useState('')
  const filtered=customers.filter(c=>{
    if(!search.trim()) return true
    const q=search.toLowerCase()
    return c.name?.toLowerCase().includes(q)||c.email?.toLowerCase().includes(q)||c.paket?.toLowerCase().includes(q)
  })
  return (
    <div>
      <div style={{display:'flex',gap:'10px',marginBottom:'20px',alignItems:'center',flexWrap:'wrap' as const}}>
        <input type="text" placeholder="Name, E-Mail oder Paket suchen..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:'1 1 200px',padding:'9px 14px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(201,168,76,0.2)',borderRadius:'8px',color:'#FFFFFF',fontSize:'13px',outline:'none'}}/>
        <span style={{fontSize:'12px',color:'rgba(255,255,255,0.35)',whiteSpace:'nowrap' as const}}>{filtered.length} von {customers.length} Kunden</span>
      </div>
      <div style={{overflowX:'auto',borderRadius:'12px',border:'1px solid rgba(201,168,76,0.15)'}}>
        <table style={{width:'100%',borderCollapse:'collapse' as const,minWidth:'600px'}}>
          <thead>
            <tr style={{background:'rgba(255,255,255,0.03)'}}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>E-Mail</th>
              <th style={thStyle}>Paket</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Erstellt am</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length===0?(
              <tr><td colSpan={5} style={{...tdStyle,textAlign:'center' as const,padding:'48px 16px',color:'rgba(255,255,255,0.25)'}}>Keine Kunden gefunden.</td></tr>
            ):(
              filtered.map((c,i)=>(
                <tr key={c.id} style={{background:i%2===1?'rgba(255,255,255,0.015)':'transparent'}}>
                  <td style={tdStyle}>
                    <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                      <div style={{width:'32px',height:'32px',borderRadius:'50%',background:'rgba(201,168,76,0.15)',border:'1px solid rgba(201,168,76,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:700,color:'#C9A84C',flexShrink:0}}>{(c.name||c.email||'?').charAt(0).toUpperCase()}</div>
                      <span>{c.name||<span style={{color:'rgba(255,255,255,0.3)'}}>-</span>}</span>
                    </div>
                  </td>
                  <td style={{...tdStyle,color:'rgba(255,255,255,0.55)',fontSize:'13px'}}>{c.email||'-'}</td>
                  <td style={tdStyle}><PlanBadge paket={c.paket}/></td>
                  <td style={tdStyle}><StatusBadge status={c.status}/></td>
                  <td style={{...tdStyle,color:'rgba(255,255,255,0.4)',fontSize:'13px'}}>{formatDate(c.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
