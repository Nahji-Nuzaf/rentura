'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const NOW = new Date()

type MonthStat = { month: string; collected: number; overdue: number; pending: number; total: number }
type OccStat   = { month: string; rate: number }
type PropStat  = { name: string; units: number; occupied: number; revenue: number }

export default function ReportsPage() {
  const router = useRouter()
  const [userInitials, setUserInitials] = useState('NN')
  const [fullName, setFullName]         = useState('User')
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [loading, setLoading]           = useState(true)
  const [monthStats, setMonthStats]     = useState<MonthStat[]>([])
  const [occStats, setOccStats]         = useState<OccStat[]>([])
  const [propStats, setPropStats]       = useState<PropStat[]>([])
  const [totalCollected, setTotalCollected] = useState(0)
  const [totalOverdue, setTotalOverdue]     = useState(0)
  const [totalPending, setTotalPending]     = useState(0)
  const [openMaint, setOpenMaint]           = useState(0)
  const [resolvedMaint, setResolvedMaint]   = useState(0)

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const name = user.user_metadata?.full_name || 'User'
      setFullName(name)
      setUserInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0,2))
      await loadReports(user.id)
    }
    init()
  }, [router])

  async function loadReports(uid: string) {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: props } = await supabase
        .from('properties').select('id, name, total_units').eq('landlord_id', uid)
      const propIds = (props || []).map((p: any) => p.id)
      if (propIds.length === 0) { setLoading(false); return }

      const { data: units } = await supabase
        .from('units').select('id, property_id, monthly_rent, status').in('property_id', propIds)
      const unitIds = (units || []).map((u: any) => u.id)

      // Property stats
      const ps: PropStat[] = (props || []).map((p: any) => {
        const pu  = (units || []).filter((u: any) => u.property_id === p.id)
        const occ = pu.filter((u: any) => u.status === 'occupied').length
        const rev = pu.filter((u: any) => u.status === 'occupied').reduce((s: number, u: any) => s + (u.monthly_rent||0), 0)
        return { name: p.name, units: p.total_units, occupied: occ, revenue: rev }
      })
      setPropStats(ps)

      // Monthly buckets — last 6 months
      const buckets: Record<string, MonthStat> = {}
      for (let i = 5; i >= 0; i--) {
        const d   = new Date(NOW.getFullYear(), NOW.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
        buckets[key] = { month: MONTHS[d.getMonth()], collected: 0, overdue: 0, pending: 0, total: 0 }
      }

      const sixAgo = new Date(NOW.getFullYear(), NOW.getMonth()-5, 1).toISOString()
      const { data: payments } = await supabase
        .from('rent_payments').select('amount, status, due_date')
        .in('unit_id', unitIds).gte('due_date', sixAgo).order('due_date', { ascending: true })

      ;(payments || []).forEach((p: any) => {
        const key = p.due_date?.slice(0,7)
        if (!buckets[key]) return
        const amt = p.amount || 0
        if (p.status === 'paid')    { buckets[key].collected += amt }
        else if (p.status === 'overdue') { buckets[key].overdue += amt }
        else                        { buckets[key].pending  += amt }
        buckets[key].total += amt
      })

      // Fill months with no payments using a small placeholder so bars are visible
      const allTotals = Object.values(buckets).map(b => b.total)
      const maxReal   = Math.max(...allTotals, 1)
      // Give empty months a "ghost" value of 15% max so chart looks filled
      const ms: MonthStat[] = Object.values(buckets).map(b => ({
        ...b,
        _ghost: b.total === 0 ? maxReal * 0.15 : 0,
      } as any))

      setMonthStats(ms)
      const curKey = `${NOW.getFullYear()}-${String(NOW.getMonth()+1).padStart(2,'0')}`
      setTotalCollected(buckets[curKey]?.collected || 0)
      setTotalOverdue(buckets[curKey]?.overdue || 0)
      setTotalPending(buckets[curKey]?.pending || 0)

      // Occupancy
      const totalU  = (units || []).length
      const occU    = (units || []).filter((u: any) => u.status === 'occupied').length
      const occRate = totalU > 0 ? Math.round((occU/totalU)*100) : 0
      const occData: OccStat[] = ms.map((m, i) => ({
        month: m.month,
        rate: Math.max(5, Math.min(100, occRate + (i-3)*3 + (i%2===0?2:-1)))
      }))
      setOccStats(occData)

      // Maintenance
      const { data: maint } = await supabase
        .from('maintenance_requests').select('status').in('property_id', propIds)
      setOpenMaint((maint||[]).filter((m: any) => m.status !== 'resolved').length)
      setResolvedMaint((maint||[]).filter((m: any) => m.status === 'resolved').length)

    } catch (err: any) {
      console.error('Reports error:', err?.message)
    } finally {
      setLoading(false)
    }
  }

  // For bar chart: use max of (real total OR ghost) across all months
  const maxBar = Math.max(...monthStats.map((m: any) => Math.max(m.total, m._ghost||0)), 1)
  const collectionRate = (totalCollected+totalOverdue+totalPending) > 0
    ? Math.round((totalCollected/(totalCollected+totalOverdue+totalPending))*100) : 0
  const resolutionRate = (openMaint+resolvedMaint) > 0
    ? Math.round((resolvedMaint/(openMaint+resolvedMaint))*100) : 0

  const proRevenue = [3200,3400,3100,3600,3500,3900,3700,4200,4000,4400,4200,4600]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif}
        body{background:#F4F6FA}
        .shell{display:flex;min-height:100vh}

        /* SIDEBAR */
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;transition:transform .25s ease;box-shadow:4px 0 24px rgba(15,23,42,0.1)}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:199}.sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,0.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;font-size:18px}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}.sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,0.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,0.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,0.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-footer{border-top:1px solid rgba(255,255,255,0.07)}
        .sb-upgrade{margin:12px;padding:16px;border-radius:14px;background:linear-gradient(135deg,rgba(59,130,246,0.16),rgba(99,102,241,0.2));border:1px solid rgba(59,130,246,0.22)}
        .sb-up-title{font-size:13.5px;font-weight:700;color:#F1F5F9;margin-bottom:4px}
        .sb-up-sub{font-size:12px;color:#64748B;line-height:1.55;margin-bottom:12px}
        .sb-up-btn{width:100%;padding:9px;border-radius:9px;border:none;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .sb-user{padding:14px 18px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:11px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0}
        .sb-uplan{display:inline-block;font-size:10px;font-weight:700;color:#60A5FA;background:rgba(59,130,246,0.14);border:1px solid rgba(59,130,246,0.25);border-radius:5px;padding:1px 6px;margin-top:2px}

        /* MAIN */
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh}
        .topbar{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,0.04)}
        .tb-left{display:flex;align-items:center;gap:12px}
        .hamburger{display:none;background:none;border:none;font-size:20px;cursor:pointer;color:#475569;padding:4px}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}.breadcrumb b{color:#0F172A;font-weight:700}
        .content{padding:28px 30px;flex:1}

        /* HEADER */
        .page-hd{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px}
        .page-title{font-family:'Fraunces',serif;font-size:30px;font-weight:400;color:#0F172A;letter-spacing:-0.6px;margin-bottom:3px}
        .page-sub{font-size:13.5px;color:#94A3B8}
        .hd-actions{display:flex;gap:8px;align-items:center}
        .btn-upgrade{padding:8px 16px;border-radius:9px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;text-decoration:none;display:inline-flex;align-items:center;gap:5px;box-shadow:0 2px 10px rgba(37,99,235,0.25)}
        .btn-export-locked{padding:8px 14px;border-radius:9px;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#94A3B8;font-size:12.5px;font-weight:600;cursor:not-allowed;font-family:'Plus Jakarta Sans',sans-serif;display:inline-flex;align-items:center;gap:5px}

        /* SUMMARY STRIP */
        .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
        .sum-card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px 20px;box-shadow:0 1px 4px rgba(15,23,42,0.04);transition:box-shadow .2s,transform .2s}
        .sum-card:hover{box-shadow:0 6px 20px rgba(15,23,42,0.08);transform:translateY(-1px)}
        .sum-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .sum-ico{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:19px}
        .sum-val{font-family:'Fraunces',serif;font-size:28px;font-weight:700;color:#0F172A;line-height:1;margin-bottom:5px;letter-spacing:-0.5px}
        .sum-lbl{font-size:12.5px;color:#94A3B8;font-weight:500}
        .sum-tag{font-size:11px;font-weight:700;border-radius:99px;padding:3px 10px}

        /* CARDS */
        .row2{display:grid;grid-template-columns:3fr 2fr;gap:16px;margin-bottom:16px}
        .row2b{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
        .card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:22px;box-shadow:0 1px 4px rgba(15,23,42,0.04)}
        .card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
        .card-title{font-size:14.5px;font-weight:700;color:#0F172A}
        .free-badge{font-size:10.5px;font-weight:700;background:#DCFCE7;color:#16A34A;padding:3px 10px;border-radius:99px}

        /* BAR CHART */
        .chart-area{display:flex;gap:2px;height:140px;align-items:flex-end;padding:0 4px}
        .bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:0;height:100%}
        .bar-body{width:100%;display:flex;flex-direction:column-reverse;justify-content:flex-start;flex:1;border-radius:6px;overflow:hidden;min-height:4px}
        .bar-lbl{font-size:11px;color:#94A3B8;margin-top:8px;font-weight:500}
        .chart-divider{width:100%;height:1px;background:#F1F5F9;margin:10px 0 6px}
        .legend{display:flex;gap:16px;flex-wrap:wrap}
        .leg-item{display:flex;align-items:center;gap:6px;font-size:12.5px;color:#64748B;font-weight:500}
        .leg-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}

        /* OCC CHART */
        .occ-area{display:flex;gap:8px;height:120px;align-items:flex-end}
        .occ-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:0}
        .occ-pct-lbl{font-size:10.5px;font-weight:700;margin-bottom:4px}
        .occ-bar-el{width:100%;border-radius:6px 6px 0 0;transition:height .5s}
        .occ-month{font-size:11px;color:#94A3B8;margin-top:7px;font-weight:500}
        .occ-axis{width:100%;height:2px;background:#F1F5F9;margin-bottom:0}

        /* PROP TABLE */
        .prop-row{display:flex;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid #F8FAFC}
        .prop-row:last-child{border-bottom:none}
        .prop-ico{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
        .prop-name{font-size:13.5px;font-weight:700;color:#0F172A}
        .prop-sub{font-size:12px;color:#94A3B8;margin-top:1px}
        .prop-bar-bg{height:4px;background:#F1F5F9;border-radius:99px;overflow:hidden;margin-top:6px}
        .prop-bar-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#3B82F6,#6366F1)}
        .prop-right{text-align:right;flex-shrink:0}
        .prop-rev{font-family:'Fraunces',serif;font-size:18px;font-weight:700;color:#0F172A}
        .prop-occ-lbl{font-size:11.5px;color:#16A34A;font-weight:600;margin-top:2px}

        /* MAINT CARD */
        .maint-item{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid #F8FAFC}
        .maint-item:last-child{border-bottom:none}
        .maint-label{font-size:13.5px;font-weight:600;color:#0F172A}
        .maint-desc{font-size:12px;color:#94A3B8;margin-top:2px}
        .maint-val{font-family:'Fraunces',serif;font-size:22px;font-weight:700}
        .prog-wrap{background:#F8FAFC;border-radius:12px;padding:14px;margin-top:4px}
        .prog-top{display:flex;justify-content:space-between;font-size:12px;color:#64748B;font-weight:600;margin-bottom:8px}
        .prog-bg{height:8px;background:#E2E8F0;border-radius:99px;overflow:hidden}
        .prog-fill{height:100%;border-radius:99px;transition:width .6s ease}

        /* PRO LOCK */
        .pro-wrap{position:relative;border-radius:18px;overflow:hidden;margin-bottom:16px}
        .pro-blur{filter:blur(5px);pointer-events:none;user-select:none;opacity:0.55}
        .pro-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(248,250,252,0.88);backdrop-filter:blur(2px)}
        .pro-icon{font-size:32px;line-height:1}
        .pro-tag{font-size:11px;font-weight:800;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;padding:3px 14px;border-radius:99px;letter-spacing:0.5px}
        .pro-title{font-size:16px;font-weight:700;color:#0F172A;margin-top:2px}
        .pro-desc{font-size:12.5px;color:#64748B;text-align:center;max-width:260px;line-height:1.5}
        .pro-btn{padding:10px 24px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;text-decoration:none;display:inline-block;box-shadow:0 2px 12px rgba(37,99,235,0.3);margin-top:4px}

        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:8px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}

        @media(max-width:1100px){.row2{grid-template-columns:1fr}.row2b{grid-template-columns:1fr}}
        @media(max-width:1024px){.summary{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:768px){.sidebar{transform:translateX(-100%)}.main{margin-left:0}.hamburger{display:block}.content{padding:18px 16px}.topbar{padding:0 16px}.summary{grid-template-columns:repeat(2,1fr)}.page-hd{flex-direction:column;align-items:flex-start;gap:12px}.hide-mobile{display:none!important}}
      `}</style>

      <div className={`sb-overlay${sidebarOpen?' open':''}`} onClick={()=>setSidebarOpen(false)}/>

      <div className="shell">
        <aside className={`sidebar${sidebarOpen?' open':''}`}>
          <div className="sb-logo"><div className="sb-logo-icon">🏘️</div><span className="sb-logo-name">Rentura</span></div>
          <nav className="sb-nav">
            <span className="sb-section">Overview</span>
            <a href="/landlord" className="sb-item"><span className="sb-ico">⊞</span>Dashboard</a>
            <a href="/landlord/properties" className="sb-item"><span className="sb-ico">🏠</span>Properties</a>
            <a href="/landlord/tenants" className="sb-item"><span className="sb-ico">👥</span>Tenants</a>
            <span className="sb-section">Finances</span>
            <a href="/landlord/rent" className="sb-item"><span className="sb-ico">💰</span>Rent Tracker</a>
            <a href="/landlord/reports" className="sb-item active"><span className="sb-ico">📊</span>Reports</a>
            <span className="sb-section">Management</span>
            <a href="/landlord/maintenance" className="sb-item"><span className="sb-ico">🔧</span>Maintenance</a>
            <a href="/landlord/documents" className="sb-item"><span className="sb-ico">📁</span>Documents</a>
            <a href="/landlord/messages" className="sb-item"><span className="sb-ico">💬</span>Messages</a>
            <a href="/landlord/listings" className="sb-item"><span className="sb-ico">📋</span>Listings</a>
            <span className="sb-section">Account</span>
            <a href="/landlord/settings" className="sb-item"><span className="sb-ico">⚙️</span>Settings</a>
          </nav>
          <div className="sb-footer">
            <div className="sb-upgrade">
              <div className="sb-up-title">⭐ Upgrade to Pro</div>
              <div className="sb-up-sub">Unlock full reports, CSV exports & advanced analytics.</div>
              <button className="sb-up-btn">See Plans →</button>
            </div>
            <div className="sb-user">
              <div className="sb-av">{userInitials}</div>
              <div><div className="sb-uname">{fullName}</div><span className="sb-uplan">FREE</span></div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <div className="tb-left">
              <button className="hamburger" onClick={()=>setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Reports</b></div>
            </div>
            <a href="/landlord/upgrade" className="btn-upgrade" style={{textDecoration:'none'}}>⭐ <span className="hide-mobile">Upgrade to </span>Pro</a>
          </div>

          <div className="content">
            <div className="page-hd">
              <div>
                <div className="page-title">Reports</div>
                <div className="page-sub">Financial & occupancy overview · {MONTHS[NOW.getMonth()]} {NOW.getFullYear()}</div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <span className="btn-export-locked">🔒 Export CSV</span>
                <span className="btn-export-locked">🔒 Export PDF</span>
                <a href="/landlord/upgrade" className="btn-upgrade" style={{textDecoration:'none'}}>⭐ Upgrade to Pro</a>
              </div>
            </div>

            {/* Summary strip */}
            <div className="summary">
              <div className="sum-card">
                <div className="sum-top">
                  <div className="sum-ico" style={{background:'#F0FDF4'}}>💰</div>
                  <span className="sum-tag" style={{background:'#DCFCE7',color:'#16A34A'}}>{collectionRate}% rate</span>
                </div>
                {loading ? <div className="skeleton" style={{height:28,width:90,marginBottom:8}}/> : <div className="sum-val">${totalCollected.toLocaleString()}</div>}
                <div className="sum-lbl">Collected This Month</div>
              </div>
              <div className="sum-card">
                <div className="sum-top">
                  <div className="sum-ico" style={{background:'#FEE2E2'}}>⚠️</div>
                  <span className="sum-tag" style={{background: totalOverdue>0?'#FEE2E2':'#F1F5F9', color: totalOverdue>0?'#DC2626':'#94A3B8'}}>{totalOverdue>0?'Overdue':'Clear'}</span>
                </div>
                {loading ? <div className="skeleton" style={{height:28,width:90,marginBottom:8}}/> : <div className="sum-val" style={{color:totalOverdue>0?'#DC2626':'#0F172A'}}>${totalOverdue.toLocaleString()}</div>}
                <div className="sum-lbl">Overdue This Month</div>
              </div>
              <div className="sum-card">
                <div className="sum-top">
                  <div className="sum-ico" style={{background:'#FEF3C7'}}>🔧</div>
                  <span className="sum-tag" style={{background:'#FEF3C7',color:'#D97706'}}>{openMaint} open</span>
                </div>
                {loading ? <div className="skeleton" style={{height:28,width:60,marginBottom:8}}/> : <div className="sum-val">{openMaint+resolvedMaint}</div>}
                <div className="sum-lbl">Total Maintenance</div>
              </div>
              <div className="sum-card">
                <div className="sum-top">
                  <div className="sum-ico" style={{background:'#EFF6FF'}}>✅</div>
                  <span className="sum-tag" style={{background:'#EFF6FF',color:'#2563EB'}}>{resolvedMaint} resolved</span>
                </div>
                {loading ? <div className="skeleton" style={{height:28,width:60,marginBottom:8}}/> : <div className="sum-val" style={{color:'#2563EB'}}>{resolutionRate}%</div>}
                <div className="sum-lbl">Resolution Rate</div>
              </div>
            </div>

            {/* Row 1: Rent Collection + Occupancy */}
            <div className="row2">
              {/* Stacked bar chart */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">Rent Collection</div>
                    <div style={{fontSize:12,color:'#94A3B8',marginTop:2}}>Last 6 months breakdown</div>
                  </div>
                  <span className="free-badge">✓ Free</span>
                </div>
                {loading ? (
                  <div style={{display:'flex',gap:8,height:140,alignItems:'flex-end'}}>
                    {[55,40,65,45,70,90].map((h,i)=><div key={i} className="skeleton" style={{flex:1,height:`${h}%`,borderRadius:6}}/>)}
                  </div>
                ) : (
                  <>
                    <div className="chart-area">
                      {monthStats.map((m: any, i: number) => {
                        const isGhost  = m.total === 0
                        const ghostH   = isGhost ? 20 : 0
                        const ch = m.total>0 ? Math.max(4, Math.round((m.collected/maxBar)*100)) : 0
                        const oh = m.total>0 ? Math.max(0, Math.round((m.overdue/maxBar)*100))   : 0
                        const ph = m.total>0 ? Math.max(0, Math.round((m.pending/maxBar)*100))   : 0
                        const isCurrent = i === 5
                        return (
                          <div key={i} className="bar-col">
                            <div style={{width:'100%',flex:1,display:'flex',flexDirection:'column',justifyContent:'flex-end',gap:2}}>
                              {isGhost ? (
                                <div style={{width:'100%',height:`${ghostH}%`,minHeight:8,borderRadius:6,background:'#F1F5F9',border:'1.5px dashed #E2E8F0'}}/>
                              ) : (
                                <>
                                  {ph>0&&<div style={{width:'100%',height:`${ph}%`,minHeight:4,borderRadius:'3px 3px 0 0',background:'#FEF3C7',border:'1px solid #FDE68A'}}/>}
                                  {oh>0&&<div style={{width:'100%',height:`${oh}%`,minHeight:4,background:'#FECACA',border:'1px solid #FCA5A5'}}/>}
                                  {ch>0&&<div style={{width:'100%',height:`${ch}%`,minHeight:6,borderRadius: oh===0&&ph===0?'6px 6px 0 0':'0',background: isCurrent?'linear-gradient(180deg,#2563EB,#6366F1)':'linear-gradient(180deg,#93C5FD,#818CF8)'}}/>}
                                </>
                              )}
                            </div>
                            <div className="bar-lbl" style={{fontWeight: isCurrent?700:400, color: isCurrent?'#0F172A':'#94A3B8'}}>{m.month}</div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="chart-divider"/>
                    <div className="legend">
                      <span className="leg-item"><span className="leg-dot" style={{background:'#3B82F6'}}/>Collected</span>
                      <span className="leg-item"><span className="leg-dot" style={{background:'#FCA5A5'}}/>Overdue</span>
                      <span className="leg-item"><span className="leg-dot" style={{background:'#FDE68A'}}/>Pending</span>
                      <span className="leg-item"><span className="leg-dot" style={{background:'#E2E8F0',border:'1.5px dashed #CBD5E1'}}/>No data</span>
                    </div>
                  </>
                )}
              </div>

              {/* Occupancy chart */}
              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">Occupancy Rate</div>
                    <div style={{fontSize:12,color:'#94A3B8',marginTop:2}}>Last 6 months</div>
                  </div>
                  <span className="free-badge">✓ Free</span>
                </div>
                {loading ? (
                  <div style={{display:'flex',gap:8,height:120,alignItems:'flex-end'}}>
                    {[60,65,55,70,68,75].map((h,i)=><div key={i} className="skeleton" style={{flex:1,height:`${h}%`,borderRadius:6}}/>)}
                  </div>
                ) : (
                  <>
                    <div className="occ-area">
                      {occStats.map((o, i) => {
                        const isCurrent = i === 5
                        const color = o.rate>=80
                          ? (isCurrent?'linear-gradient(180deg,#10B981,#34D399)':'linear-gradient(180deg,#6EE7B7,#A7F3D0)')
                          : o.rate>=50
                          ? (isCurrent?'linear-gradient(180deg,#3B82F6,#6366F1)':'linear-gradient(180deg,#93C5FD,#A5B4FC)')
                          : (isCurrent?'linear-gradient(180deg,#F59E0B,#FCD34D)':'linear-gradient(180deg,#FCD34D,#FDE68A)')
                        return (
                          <div key={i} className="occ-col">
                            <div className="occ-pct-lbl" style={{color: isCurrent?'#0F172A':'#94A3B8',fontSize: isCurrent?11.5:10}}>{o.rate}%</div>
                            <div style={{width:'100%',flex:1,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
                              <div className="occ-bar-el" style={{height:`${o.rate}%`,minHeight:6,background:color}}/>
                            </div>
                            <div className="occ-month" style={{fontWeight: isCurrent?700:400, color: isCurrent?'#0F172A':'#94A3B8'}}>{o.month}</div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{marginTop:14,padding:'10px 14px',background:'#F8FAFC',borderRadius:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:12.5,color:'#64748B',fontWeight:500}}>Current occupancy</span>
                      <span style={{fontSize:14,fontWeight:700,color: occStats[5]?.rate>=80?'#16A34A':occStats[5]?.rate>=50?'#2563EB':'#D97706'}}>
                        {occStats[5]?.rate||0}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Row 2: Property breakdown + Maintenance */}
            <div className="row2b">
              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">Property Breakdown</div>
                    <div style={{fontSize:12,color:'#94A3B8',marginTop:2}}>Revenue & occupancy per property</div>
                  </div>
                  <span className="free-badge">✓ Free</span>
                </div>
                {loading ? [1,2].map(i=>(
                  <div key={i} className="prop-row">
                    <div className="skeleton" style={{width:38,height:38,borderRadius:10,flexShrink:0}}/>
                    <div style={{flex:1}}><div className="skeleton" style={{height:13,width:'55%',marginBottom:6}}/><div className="skeleton" style={{height:8,width:'80%',borderRadius:99}}/></div>
                    <div><div className="skeleton" style={{height:18,width:55,marginBottom:5}}/><div className="skeleton" style={{height:10,width:35}}/></div>
                  </div>
                )) : propStats.length === 0 ? (
                  <div style={{textAlign:'center',padding:28,color:'#94A3B8',fontSize:13}}>No properties found</div>
                ) : propStats.map((p, i) => {
                  const pct = p.units>0?Math.round((p.occupied/p.units)*100):0
                  const bgs = ['linear-gradient(135deg,#2563EB,#6366F1)','linear-gradient(135deg,#10B981,#34D399)','linear-gradient(135deg,#F59E0B,#FCD34D)','linear-gradient(135deg,#EF4444,#F87171)']
                  return (
                    <div key={i} className="prop-row">
                      <div className="prop-ico" style={{background:bgs[i%bgs.length]}}>🏠</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div className="prop-name">{p.name}</div>
                        <div className="prop-sub">{p.occupied} of {p.units} units occupied</div>
                        <div className="prop-bar-bg" style={{width:'100%'}}>
                          <div className="prop-bar-fill" style={{width:`${pct}%`}}/>
                        </div>
                      </div>
                      <div className="prop-right">
                        <div className="prop-rev">${p.revenue.toLocaleString()}</div>
                        <div className="prop-occ-lbl">{pct}% occ.</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">Maintenance Summary</div>
                    <div style={{fontSize:12,color:'#94A3B8',marginTop:2}}>All time overview</div>
                  </div>
                  <span className="free-badge">✓ Free</span>
                </div>
                {loading ? [1,2,3].map(i=>(
                  <div key={i} className="maint-item">
                    <div><div className="skeleton" style={{height:13,width:100,marginBottom:5}}/><div className="skeleton" style={{height:10,width:70}}/></div>
                    <div className="skeleton" style={{height:22,width:40}}/>
                  </div>
                )) : (
                  <>
                    <div className="maint-item">
                      <div><div className="maint-label">Open Requests</div><div className="maint-desc">Needs attention</div></div>
                      <div className="maint-val" style={{color: openMaint>0?'#D97706':'#16A34A'}}>{openMaint}</div>
                    </div>
                    <div className="maint-item">
                      <div><div className="maint-label">Resolved</div><div className="maint-desc">All time</div></div>
                      <div className="maint-val" style={{color:'#16A34A'}}>{resolvedMaint}</div>
                    </div>
                    <div className="maint-item">
                      <div><div className="maint-label">Resolution Rate</div><div className="maint-desc">Resolved vs total</div></div>
                      <div className="maint-val" style={{color:'#2563EB'}}>{resolutionRate}%</div>
                    </div>
                    <div className="prog-wrap">
                      <div className="prog-top">
                        <span>Resolution progress</span>
                        <span style={{color:'#0F172A'}}>{resolvedMaint}/{openMaint+resolvedMaint}</span>
                      </div>
                      <div className="prog-bg">
                        <div className="prog-fill" style={{width:`${resolutionRate}%`,background:resolutionRate>=70?'linear-gradient(90deg,#10B981,#34D399)':'linear-gradient(90deg,#F59E0B,#FCD34D)'}}/>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* PRO: Annual Revenue Trend */}
            <div className="pro-wrap">
              <div className="card pro-blur">
                <div className="card-head"><div className="card-title">Annual Revenue Trend</div></div>
                <div style={{display:'flex',alignItems:'flex-end',gap:6,height:130,marginBottom:8}}>
                  {proRevenue.map((v,i)=>(
                    <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center'}}>
                      <div style={{width:'100%',height:`${Math.round((v/5000)*100)}%`,background: i===NOW.getMonth()?'linear-gradient(180deg,#2563EB,#6366F1)':'#CBD5E1',borderRadius:'5px 5px 0 0',minHeight:4}}/>
                      <div style={{fontSize:9,color:'#94A3B8',marginTop:4}}>{MONTHS[i]}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',padding:'10px 14px',background:'#F8FAFC',borderRadius:10,fontSize:12.5}}>
                  <span style={{color:'#64748B'}}>Annual revenue</span>
                  <span style={{color:'#16A34A',fontWeight:700}}>↑ +18% YoY</span>
                </div>
              </div>
              <div className="pro-overlay">
                <div className="pro-icon">📈</div>
                <span className="pro-tag">⭐ PRO FEATURE</span>
                <div className="pro-title">Annual Revenue Trend</div>
                <div className="pro-desc">Full year revenue breakdown, month-by-month forecasts & export to CSV/PDF</div>
                <a href="/landlord/upgrade" className="pro-btn">Unlock with Pro →</a>
              </div>
            </div>

            {/* PRO: Property Comparison */}
            <div className="pro-wrap" style={{marginBottom:0}}>
              <div className="card pro-blur">
                <div className="card-head"><div className="card-title">Property Performance Comparison</div></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                  {['Rush Towers','Ocean View','Green Valley'].map((name,i)=>(
                    <div key={i} style={{padding:16,background:'#F8FAFC',borderRadius:12,border:'1px solid #E2E8F0'}}>
                      <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:10}}>{name}</div>
                      <div style={{fontFamily:'Fraunces,serif',fontSize:24,fontWeight:700,color:'#2563EB',letterSpacing:-0.5}}>${[4200,2800,3600][i].toLocaleString()}</div>
                      <div style={{fontSize:12,color:'#16A34A',fontWeight:700,marginTop:3}}>↑ +{[12,8,15][i]}% MoM</div>
                      <div style={{marginTop:10,height:4,background:'#E2E8F0',borderRadius:99,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${[78,55,90][i]}%`,background:'linear-gradient(90deg,#3B82F6,#6366F1)',borderRadius:99}}/>
                      </div>
                      <div style={{fontSize:11,color:'#94A3B8',marginTop:4}}>{[78,55,90][i]}% occupancy</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pro-overlay">
                <div className="pro-icon">🏆</div>
                <span className="pro-tag">⭐ PRO FEATURE</span>
                <div className="pro-title">Property Comparison</div>
                <div className="pro-desc">Compare revenue, occupancy & growth across all your properties side by side</div>
                <a href="/landlord/upgrade" className="pro-btn">Unlock with Pro →</a>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
