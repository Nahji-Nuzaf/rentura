'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────
type Profile = {
  id: string
  full_name: string
  email: string
  avatar_url?: string
  active_role?: string
}

type TenantRow = {
  id: string
  profile_id: string
  unit_id: string
  property_id: string
  status: string
}

type Document = {
  id: string
  name: string
  type: string
  file_url: string
  file_size?: number
  created_at: string
  owner_id?: string
  property_id?: string
  unit_id?: string
  tenant_id?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtFileSize(bytes?: number) {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function getDocIcon(type: string, name: string): string {
  const t = (type || '').toLowerCase()
  const n = (name || '').toLowerCase()
  if (t.includes('lease') || n.includes('lease')) return '📋'
  if (t.includes('receipt') || n.includes('receipt')) return '🧾'
  if (t.includes('notice') || n.includes('notice')) return '📢'
  if (t.includes('invoice') || n.includes('invoice')) return '💰'
  if (t.includes('photo') || n.includes('photo') || t.includes('image')) return '📸'
  if (t.includes('id') || n.includes('identity')) return '🪪'
  if (n.endsWith('.pdf') || t.includes('pdf')) return '📄'
  return '📁'
}

function getDocCategory(type: string, name: string): string {
  const t = (type || '').toLowerCase()
  const n = (name || '').toLowerCase()
  if (t.includes('lease') || n.includes('lease') || t.includes('agreement')) return 'lease'
  if (t.includes('receipt') || n.includes('receipt') || t.includes('payment')) return 'receipts'
  if (t.includes('notice') || n.includes('notice')) return 'notices'
  return 'other'
}

type FilterTab = 'all' | 'lease' | 'receipts' | 'notices' | 'other'

const FILTER_LABELS: Record<FilterTab, string> = {
  all: 'All',
  lease: 'Lease',
  receipts: 'Receipts',
  notices: 'Notices',
  other: 'Other',
}

export default function TenantDocumentsPage() {
  const router = useRouter()

  const [profile, setProfile]       = useState<Profile | null>(null)
  const [tenantRow, setTenantRow]   = useState<TenantRow | null>(null)
  const [documents, setDocuments]   = useState<Document[]>([])
  const [loading, setLoading]       = useState(true)
  const [activeRole, setActiveRole] = useState('tenant')
  const [unreadCount, setUnreadCount] = useState(0)

  // UI
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false)
  const [filter, setFilter]                   = useState<FilterTab>('all')
  const [search, setSearch]                   = useState('')
  const [previewDoc, setPreviewDoc]           = useState<Document | null>(null)
  const [viewMode, setViewMode]               = useState<'grid' | 'list'>('list')

  useEffect(() => {
    ;(async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: prof } = await sb.from('profiles').select('*').eq('id', user.id).single()
        if (prof) { setProfile(prof); setActiveRole(prof.active_role || 'tenant') }

        const { data: tRow } = await sb.from('tenants').select('*').eq('profile_id', user.id).eq('status', 'active').single()
        if (!tRow) { setLoading(false); return }
        setTenantRow(tRow)

        // Fetch docs shared with this tenant (by tenant_id) OR shared with their unit
        const [{ data: tenantDocs }, { data: unitDocs }, { data: msgData }] = await Promise.all([
          sb.from('documents').select('*').eq('tenant_id', tRow.id).order('created_at', { ascending: false }),
          sb.from('documents').select('*').eq('unit_id', tRow.unit_id).order('created_at', { ascending: false }),
          sb.from('messages').select('id').eq('receiver_id', user.id).eq('read', false),
        ])

        // Merge and deduplicate by id
        const allDocs = [...(tenantDocs || []), ...(unitDocs || [])]
        const seen = new Set<string>()
        const dedupedDocs = allDocs.filter(d => {
          if (seen.has(d.id)) return false
          seen.add(d.id)
          return true
        })
        dedupedDocs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setDocuments(dedupedDocs)
        setUnreadCount((msgData || []).length)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [router])

  async function handleRoleSwitch(role: string) {
    if (!profile) return
    setActiveRole(role)
    setRolePopoverOpen(false)
    const sb = createClient()
    await sb.from('profiles').update({ active_role: role }).eq('id', profile.id).select()
    if (role === 'landlord') window.location.href = '/landlord'
    else if (role === 'seeker') window.location.href = '/seeker'
  }

  // Derived
  const leaseCount   = documents.filter(d => getDocCategory(d.type, d.name) === 'lease').length
  const receiptCount = documents.filter(d => getDocCategory(d.type, d.name) === 'receipts').length
  const noticeCount  = documents.filter(d => getDocCategory(d.type, d.name) === 'notices').length
  const otherCount   = documents.filter(d => getDocCategory(d.type, d.name) === 'other').length

  const filtered = documents.filter(d => {
    const matchesFilter = filter === 'all' || getDocCategory(d.type, d.name) === filter
    const matchesSearch = !search || d.name.toLowerCase().includes(search.toLowerCase()) || (d.type || '').toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Plus Jakarta Sans',sans-serif", color: '#94A3B8', fontSize: 14 }}>
      Loading documents...
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;overflow-x:hidden;max-width:100vw}
        .shell{display:flex;min-height:100vh;position:relative}

        .sidebar{width:260px;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;height:100vh;z-index:200;transition:transform .25s ease}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}
        .sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-count{margin-left:auto;background:#DC2626;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px}
        .sb-footer{border-top:1px solid rgba(255,255,255,.07)}
        .sb-role-wrap{position:relative;padding:12px}
        .sb-user{display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;cursor:pointer;transition:background .15s}
        .sb-user:hover{background:rgba(255,255,255,.06)}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#10B981,#34D399);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uinfo{flex:1;min-width:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sb-uemail{font-size:11px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sb-role-badge{display:inline-block;font-size:9.5px;font-weight:700;color:#34D399;background:rgba(16,185,129,.14);border:1px solid rgba(16,185,129,.25);border-radius:4px;padding:1px 6px;margin-top:2px}
        .sb-switch-ico{color:#64748B;flex-shrink:0}
        .role-popover{position:absolute;bottom:100%;left:12px;right:12px;background:#1E293B;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:8px;margin-bottom:6px;box-shadow:0 20px 40px rgba(0,0,0,.4);z-index:300}
        .rp-title{font-size:10px;color:#64748B;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:4px 8px 8px}
        .rp-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;color:#CBD5E1;font-size:13px;font-weight:500;transition:background .15s}
        .rp-item:hover{background:rgba(255,255,255,.06)}
        .rp-check{width:16px;height:16px;margin-left:auto;color:#2563EB}
        .rp-divider{height:1px;background:rgba(255,255,255,.06);margin:4px 0}

        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:hidden;width:calc(100% - 260px)}
        .topbar{height:56px;background:#fff;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;justify-content:space-between;padding:0 28px;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}
        .breadcrumb b{color:#0F172A}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px}
        .notif-btn{width:34px;height:34px;border-radius:9px;background:#F1F5F9;border:none;cursor:pointer;font-size:15px;position:relative;display:flex;align-items:center;justify-content:center}
        .notif-dot{width:8px;height:8px;background:#DC2626;border-radius:50%;position:absolute;top:5px;right:5px;border:1.5px solid #fff}
        .content{padding:28px;flex:1}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}
        .sb-overlay.open{display:block}

        /* ── Page header ── */
        .page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;flex-wrap:wrap;gap:12px}
        .page-title{font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#0F172A}
        .page-sub{font-size:13px;color:#94A3B8;margin-top:2px}

        /* ── Stats ── */
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
        .stat-card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px 18px;box-shadow:0 1px 4px rgba(15,23,42,.04);cursor:pointer;transition:all .15s}
        .stat-card:hover{border-color:#BFDBFE;box-shadow:0 4px 14px rgba(37,99,235,.1)}
        .stat-card.active-filter{border-color:#2563EB;background:#EFF6FF}
        .stat-icon{font-size:22px;margin-bottom:8px}
        .stat-val{font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#0F172A;line-height:1;margin-bottom:3px}
        .stat-label{font-size:11px;color:#94A3B8;font-weight:500}

        /* ── Toolbar ── */
        .toolbar{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
        .search-wrap{flex:1;min-width:160px;position:relative}
        .search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px;pointer-events:none}
        .search-input{width:100%;padding:9px 12px 9px 36px;border:1.5px solid #E2E8F0;border-radius:11px;font-size:13.5px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:border .15s;background:#fff}
        .search-input:focus{border-color:#2563EB}
        .filter-tabs{display:inline-flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:11px;padding:4px;overflow-x:auto;white-space:nowrap}
        .filter-tabs::-webkit-scrollbar{height:0}
        .ftab{padding:7px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;border:none;background:none;color:#64748B;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .ftab.active{background:#2563EB;color:#fff}
        .ftab:hover:not(.active){background:#F1F5F9;color:#0F172A}
        .view-toggle{display:flex;gap:4px;background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:4px;flex-shrink:0}
        .vt-btn{width:30px;height:30px;border-radius:7px;border:none;background:none;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:background .15s}
        .vt-btn.active{background:#F1F5F9}

        /* ── List view ── */
        .doc-list{display:flex;flex-direction:column;gap:8px}
        .doc-row{display:flex;align-items:center;gap:14px;padding:14px 18px;background:#fff;border:1.5px solid #E2E8F0;border-radius:14px;box-shadow:0 1px 4px rgba(15,23,42,.04);transition:all .18s}
        .doc-row:hover{border-color:#BFDBFE;box-shadow:0 4px 16px rgba(37,99,235,.09);transform:translateY(-1px)}
        .doc-icon-wrap{width:44px;height:44px;border-radius:12px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
        .doc-info{flex:1;min-width:0}
        .doc-name{font-size:14px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}
        .doc-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .doc-meta-item{font-size:12px;color:#94A3B8}
        .doc-type-badge{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:6px;background:#F1F5F9;color:#64748B;text-transform:capitalize}
        .doc-actions{display:flex;gap:7px;flex-shrink:0}
        .doc-btn{width:34px;height:34px;border-radius:9px;border:1.5px solid #E2E8F0;background:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;transition:all .15s;text-decoration:none;color:#475569}
        .doc-btn:hover{border-color:#BFDBFE;background:#EFF6FF;color:#2563EB}

        /* ── Grid view ── */
        .doc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
        .doc-card{background:#fff;border:1.5px solid #E2E8F0;border-radius:16px;padding:20px 16px;text-align:center;box-shadow:0 1px 4px rgba(15,23,42,.04);transition:all .18s;cursor:pointer}
        .doc-card:hover{border-color:#BFDBFE;box-shadow:0 6px 20px rgba(37,99,235,.1);transform:translateY(-2px)}
        .dc-icon{font-size:36px;margin-bottom:10px}
        .dc-name{font-size:13px;font-weight:700;color:#0F172A;margin-bottom:6px;word-break:break-word;line-height:1.4}
        .dc-meta{font-size:11px;color:#94A3B8;margin-bottom:10px}
        .dc-type{font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;background:#F1F5F9;color:#64748B;text-transform:capitalize;margin-bottom:12px;display:inline-block}
        .dc-actions{display:flex;gap:6px;justify-content:center}
        .dc-btn{flex:1;padding:7px 10px;border-radius:9px;border:1.5px solid #E2E8F0;background:#fff;font-size:12px;font-weight:700;cursor:pointer;color:#475569;font-family:'Plus Jakarta Sans',sans-serif;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:4px;transition:all .15s}
        .dc-btn:hover{border-color:#BFDBFE;background:#EFF6FF;color:#2563EB}

        /* ── Preview drawer ── */
        .drawer-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:400}
        .drawer-overlay.open{display:block}
        .drawer{position:fixed;top:0;right:0;width:480px;max-width:100vw;height:100vh;background:#fff;z-index:401;box-shadow:-8px 0 40px rgba(15,23,42,.15);transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column}
        .drawer.open{transform:translateX(0)}
        .drawer-header{padding:20px 22px 16px;border-bottom:1px solid #E2E8F0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
        .drawer-close{width:32px;height:32px;border-radius:8px;border:1.5px solid #E2E8F0;background:#F8FAFC;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#64748B}
        .drawer-body{flex:1;overflow-y:auto;padding:20px 22px}
        .drawer-body::-webkit-scrollbar{width:0}
        .d-section{margin-bottom:22px}
        .d-section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;margin-bottom:10px}
        .d-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #F8FAFC}
        .d-row:last-child{border-bottom:none}
        .d-key{font-size:12px;color:#94A3B8;font-weight:500}
        .d-val{font-size:13px;font-weight:700;color:#0F172A}
        .preview-icon-big{font-size:64px;text-align:center;padding:32px 0 16px;display:block}
        .preview-name{font-size:18px;font-weight:700;color:#0F172A;text-align:center;margin-bottom:6px;word-break:break-word}
        .preview-type{text-align:center;margin-bottom:20px}

        .empty-state{text-align:center;padding:60px 24px}
        .empty-icon{font-size:44px;margin-bottom:14px}
        .empty-title{font-size:16px;font-weight:700;color:#475569;margin-bottom:6px}
        .empty-sub{font-size:13px;color:#94A3B8;line-height:1.6}

        @media(max-width:900px){.stats{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}
          .sidebar.open{transform:translateX(0)}
          .main{margin-left:0!important;width:100%!important}
          .hamburger{display:block}
          .topbar{padding:0 16px}
          .content{padding:16px}
          .stats{grid-template-columns:repeat(2,1fr)}
          .toolbar{gap:8px}
          .search-wrap{min-width:100%;order:-1}
        }
        @media(max-width:480px){
          .stats{grid-template-columns:1fr 1fr}
          .doc-row{flex-wrap:wrap}
          .doc-actions{width:100%;justify-content:flex-end}
        }
      `}</style>

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Preview Drawer */}
      <div className={`drawer-overlay${previewDoc ? ' open' : ''}`} onClick={() => setPreviewDoc(null)} />
      <div className={`drawer${previewDoc ? ' open' : ''}`}>
        {previewDoc && (
          <>
            <div className="drawer-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#94A3B8', marginBottom: 4 }}>
                  Document Preview
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', wordBreak: 'break-word' }}>{previewDoc.name}</div>
              </div>
              <button className="drawer-close" onClick={() => setPreviewDoc(null)}>✕</button>
            </div>
            <div className="drawer-body">
              <span className="preview-icon-big">{getDocIcon(previewDoc.type, previewDoc.name)}</span>
              <div className="preview-name">{previewDoc.name}</div>
              <div className="preview-type">
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: '#F1F5F9', color: '#64748B', textTransform: 'capitalize' }}>
                  {previewDoc.type || 'Document'}
                </span>
              </div>

              <div className="d-section">
                <div className="d-section-title">Details</div>
                <div className="d-row">
                  <span className="d-key">File Name</span>
                  <span className="d-val" style={{ fontSize: 12, maxWidth: 220, wordBreak: 'break-word', textAlign: 'right' }}>{previewDoc.name}</span>
                </div>
                <div className="d-row">
                  <span className="d-key">Type</span>
                  <span className="d-val" style={{ textTransform: 'capitalize' }}>{previewDoc.type || '—'}</span>
                </div>
                <div className="d-row">
                  <span className="d-key">Uploaded</span>
                  <span className="d-val">{fmtDate(previewDoc.created_at)}</span>
                </div>
                {previewDoc.file_size && (
                  <div className="d-row">
                    <span className="d-key">File Size</span>
                    <span className="d-val">{fmtFileSize(previewDoc.file_size)}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <a
                  href={previewDoc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#2563EB,#6366F1)', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 12px rgba(37,99,235,.28)' }}
                >
                  👁️ View Document
                </a>
                <a
                  href={previewDoc.file_url}
                  download
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 12, border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}
                >
                  ⬇️ Download
                </a>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="shell">
        {/* ── Sidebar ── */}
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">🏘️</div>
            <span className="sb-logo-name">Rentura</span>
          </div>
          <nav className="sb-nav">
            <span className="sb-section">My Home</span>
            <a href="/tenant" className="sb-item"><span className="sb-ico">⊞</span> Dashboard</a>
            <a href="/tenant/rent" className="sb-item"><span className="sb-ico">💰</span> Rent & Payments</a>
            <a href="/tenant/lease" className="sb-item"><span className="sb-ico">📋</span> My Lease</a>
            <a href="/tenant/maintenance" className="sb-item"><span className="sb-ico">🔧</span> Maintenance</a>
            <a href="/tenant/documents" className="sb-item active"><span className="sb-ico">📁</span> Documents</a>
            <a href="/tenant/messages" className="sb-item">
              <span className="sb-ico">💬</span> Messages
              {unreadCount > 0 && <span className="sb-count">{unreadCount}</span>}
            </a>
            <span className="sb-section">Account</span>
            <a href="/tenant/settings" className="sb-item"><span className="sb-ico">⚙️</span> Settings</a>
          </nav>
          <div className="sb-footer">
            <div className="sb-role-wrap">
              {rolePopoverOpen && (
                <div className="role-popover">
                  <div className="rp-title">Switch Role</div>
                  {['landlord', 'tenant', 'seeker'].map(role => (
                    <div key={role} className="rp-item" onClick={() => handleRoleSwitch(role)}>
                      <span style={{ fontSize: 16 }}>{role === 'landlord' ? '🏠' : role === 'tenant' ? '🔑' : '🔍'}</span>
                      <span style={{ textTransform: 'capitalize' }}>{role}</span>
                      {activeRole === role && (
                        <svg className="rp-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </div>
                  ))}
                  <div className="rp-divider" />
                  <div className="rp-item" onClick={async () => { await createClient().auth.signOut(); window.location.href = '/login' }}>
                    <span style={{ fontSize: 16 }}>🚪</span> Sign out
                  </div>
                </div>
              )}
              <div className="sb-user" onClick={() => setRolePopoverOpen(v => !v)}>
                <div className="sb-av">{profile ? initials(profile.full_name) : '?'}</div>
                <div className="sb-uinfo">
                  <div className="sb-uname">{profile?.full_name || 'Loading...'}</div>
                  <div className="sb-uemail">{profile?.email || ''}</div>
                  <div className="sb-role-badge">tenant</div>
                </div>
                <svg className="sb-switch-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7 15 12 20 17 15" /><polyline points="7 9 12 4 17 9" /></svg>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="main">
          <div className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Documents</b></div>
            </div>
            <button className="notif-btn" onClick={() => window.location.href = '/tenant/messages'}>
              🔔{unreadCount > 0 && <div className="notif-dot" />}
            </button>
          </div>

          <div className="content">
            {/* Page header */}
            <div className="page-header">
              <div>
                <div className="page-title">Documents</div>
                <div className="page-sub">{documents.length} document{documents.length !== 1 ? 's' : ''} shared with you</div>
              </div>
            </div>

            {/* Stats — clickable to filter */}
            <div className="stats">
              <div className={`stat-card${filter === 'all' ? ' active-filter' : ''}`} onClick={() => setFilter('all')}>
                <div className="stat-icon">📁</div>
                <div className="stat-val">{documents.length}</div>
                <div className="stat-label">All Documents</div>
              </div>
              <div className={`stat-card${filter === 'lease' ? ' active-filter' : ''}`} onClick={() => setFilter('lease')}>
                <div className="stat-icon">📋</div>
                <div className="stat-val">{leaseCount}</div>
                <div className="stat-label">Lease Docs</div>
              </div>
              <div className={`stat-card${filter === 'receipts' ? ' active-filter' : ''}`} onClick={() => setFilter('receipts')}>
                <div className="stat-icon">🧾</div>
                <div className="stat-val">{receiptCount}</div>
                <div className="stat-label">Receipts</div>
              </div>
              <div className={`stat-card${filter === 'notices' ? ' active-filter' : ''}`} onClick={() => setFilter('notices')}>
                <div className="stat-icon">📢</div>
                <div className="stat-val">{noticeCount}</div>
                <div className="stat-label">Notices</div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="toolbar">
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input
                  className="search-input"
                  placeholder="Search documents..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="filter-tabs">
                {(Object.keys(FILTER_LABELS) as FilterTab[]).map(f => (
                  <button key={f} className={`ftab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                    {FILTER_LABELS[f]}
                  </button>
                ))}
              </div>
              <div className="view-toggle">
                <button className={`vt-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')} title="List view">☰</button>
                <button className={`vt-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')} title="Grid view">⊞</button>
              </div>
            </div>

            {/* Results count */}
            {search && (
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12, fontWeight: 600 }}>
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
              </div>
            )}

            {/* Empty states */}
            {!tenantRow ? (
              <div className="empty-state">
                <div className="empty-icon">📁</div>
                <div className="empty-title">No active tenancy</div>
                <div className="empty-sub">Link your account to a property to see your documents.</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">{search ? '🔍' : '📁'}</div>
                <div className="empty-title">{search ? 'No results found' : 'No documents yet'}</div>
                <div className="empty-sub">
                  {search
                    ? `No documents match "${search}". Try a different search.`
                    : 'Your landlord hasn\'t shared any documents yet. Check back later.'}
                </div>
              </div>
            ) : viewMode === 'list' ? (
              /* ── List view ── */
              <div className="doc-list">
                {filtered.map(doc => (
                  <div key={doc.id} className="doc-row">
                    <div className="doc-icon-wrap">{getDocIcon(doc.type, doc.name)}</div>
                    <div className="doc-info">
                      <div className="doc-name">{doc.name}</div>
                      <div className="doc-meta">
                        <span className="doc-type-badge">{doc.type || 'document'}</span>
                        <span className="doc-meta-item">{fmtDate(doc.created_at)}</span>
                        {doc.file_size && <span className="doc-meta-item">· {fmtFileSize(doc.file_size)}</span>}
                      </div>
                    </div>
                    <div className="doc-actions">
                      <button className="doc-btn" title="Preview" onClick={() => setPreviewDoc(doc)}>👁️</button>
                      <a className="doc-btn" href={doc.file_url} target="_blank" rel="noopener noreferrer" title="Open">↗️</a>
                      <a className="doc-btn" href={doc.file_url} download title="Download">⬇️</a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* ── Grid view ── */
              <div className="doc-grid">
                {filtered.map(doc => (
                  <div key={doc.id} className="doc-card" onClick={() => setPreviewDoc(doc)}>
                    <div className="dc-icon">{getDocIcon(doc.type, doc.name)}</div>
                    <div className="dc-name">{doc.name}</div>
                    <div className="dc-type">{doc.type || 'document'}</div>
                    <div className="dc-meta">{fmtDate(doc.created_at)}{doc.file_size ? ` · ${fmtFileSize(doc.file_size)}` : ''}</div>
                    <div className="dc-actions" onClick={e => e.stopPropagation()}>
                      <a className="dc-btn" href={doc.file_url} target="_blank" rel="noopener noreferrer">👁️ View</a>
                      <a className="dc-btn" href={doc.file_url} download>⬇️</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
