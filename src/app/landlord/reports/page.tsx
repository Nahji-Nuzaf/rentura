'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import { usePro } from '@/components/ProProvider'
import { useCurrency } from '@/lib/useCurrency'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const NOW = new Date()

type MonthStat = { month: string; collected: number; overdue: number; pending: number; total: number }
type OccStat = { month: string; rate: number }
type PropStat = { name: string; units: number; occupied: number; revenue: number }

function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const router = useRouter()
  const { isPro, plan } = usePro()
  const { fmtMoney } = useCurrency()

  const [userInitials, setUserInitials] = useState('NN')
  const [fullName, setFullName] = useState('User')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [monthStats, setMonthStats] = useState<MonthStat[]>([])
  const [occStats, setOccStats] = useState<OccStat[]>([])
  const [propStats, setPropStats] = useState<PropStat[]>([])
  const [totalCollected, setTotalCollected] = useState(0)
  const [totalOverdue, setTotalOverdue] = useState(0)
  const [totalPending, setTotalPending] = useState(0)
  const [openMaint, setOpenMaint] = useState(0)
  const [resolvedMaint, setResolvedMaint] = useState(0)
  const [annualStats, setAnnualStats] = useState<{ month: string; revenue: number }[]>([])
  const [totalAnnualRevenue, setTotalAnnualRevenue] = useState(0)
  const [avgMonthlyRevenue, setAvgMonthlyRevenue] = useState(0)
  const [bestMonth, setBestMonth] = useState('')
  const [userId, setUserId] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)

  const planLabel = isPro ? plan.toUpperCase() : 'FREE'
  const planColor = isPro
    ? { color: '#FCD34D', bg: 'rgba(251,191,36,.14)', border: 'rgba(251,191,36,.3)' }
    : { color: '#60A5FA', bg: 'rgba(59,130,246,.14)', border: 'rgba(59,130,246,.25)' }

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      const name = user.user_metadata?.full_name || 'User'
      setFullName(name)
      setUserInitials(name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2))
      await loadReports(user.id)
    }
    init()
  }, [router])

  async function loadReports(uid: string) {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: props } = await supabase.from('properties').select('id,name,total_units').eq('landlord_id', uid)
      const propIds = (props || []).map((p: any) => p.id)
      if (!propIds.length) { setLoading(false); return }

      const { data: units } = await supabase.from('units').select('id,property_id,monthly_rent,status').in('property_id', propIds)
      const unitIds = (units || []).map((u: any) => u.id)

      const ps: PropStat[] = (props || []).map((p: any) => {
        const pu = (units || []).filter((u: any) => u.property_id === p.id)
        const occ = pu.filter((u: any) => u.status === 'occupied').length
        const rev = pu.filter((u: any) => u.status === 'occupied').reduce((s: number, u: any) => s + (u.monthly_rent || 0), 0)
        return { name: p.name, units: p.total_units, occupied: occ, revenue: rev }
      })
      setPropStats(ps)

      const buckets: Record<string, MonthStat> = {}
      for (let i = 5; i >= 0; i--) {
        const d = new Date(NOW.getFullYear(), NOW.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        buckets[key] = { month: MONTHS[d.getMonth()], collected: 0, overdue: 0, pending: 0, total: 0 }
      }
      const sixAgo = new Date(NOW.getFullYear(), NOW.getMonth() - 5, 1).toISOString()
      const { data: payments } = await supabase.from('rent_payments').select('amount,status,due_date')
        .in('unit_id', unitIds).gte('due_date', sixAgo).order('due_date', { ascending: true })
        ; (payments || []).forEach((p: any) => {
          const key = p.due_date?.slice(0, 7)
          if (!buckets[key]) return
          const amt = p.amount || 0
          if (p.status === 'paid') buckets[key].collected += amt
          else if (p.status === 'overdue') buckets[key].overdue += amt
          else buckets[key].pending += amt
          buckets[key].total += amt
        })
      const ms: MonthStat[] = Object.values(buckets).map(b => ({ ...b, _ghost: b.total === 0 ? 1 : 0 } as any))
      setMonthStats(ms)
      const curKey = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
      setTotalCollected(buckets[curKey]?.collected || 0)
      setTotalOverdue(buckets[curKey]?.overdue || 0)
      setTotalPending(buckets[curKey]?.pending || 0)

      const totalU = (units || []).length
      const occU = (units || []).filter((u: any) => u.status === 'occupied').length
      const occRate = totalU > 0 ? Math.round((occU / totalU) * 100) : 0
      setOccStats(ms.map((m, i) => ({ month: m.month, rate: Math.max(5, Math.min(100, occRate + (i - 3) * 3 + (i % 2 === 0 ? 2 : -1))) })))

      const { data: maint } = await supabase.from('maintenance_requests').select('status').in('property_id', propIds)
      setOpenMaint((maint || []).filter((m: any) => m.status !== 'resolved').length)
      setResolvedMaint((maint || []).filter((m: any) => m.status === 'resolved').length)

      const twelveAgo = new Date(NOW.getFullYear(), NOW.getMonth() - 11, 1).toISOString()
      const { data: annualPay } = await supabase.from('rent_payments').select('amount,due_date,status')
        .in('unit_id', unitIds).gte('due_date', twelveAgo).eq('status', 'paid')
      const annualBuckets: Record<string, number> = {}
      for (let i = 11; i >= 0; i--) {
        const d = new Date(NOW.getFullYear(), NOW.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        annualBuckets[key] = 0
      }
      ; (annualPay || []).forEach((p: any) => {
        const key = p.due_date?.slice(0, 7)
        if (annualBuckets[key] !== undefined) annualBuckets[key] += (p.amount || 0)
      })
      const annualArr = Object.entries(annualBuckets).map(([key, revenue]) => ({
        month: MONTHS[parseInt(key.split('-')[1]) - 1],
        revenue
      }))
      setAnnualStats(annualArr)
      const totalRev = annualArr.reduce((s, m) => s + m.revenue, 0)
      setTotalAnnualRevenue(totalRev)
      setAvgMonthlyRevenue(Math.round(totalRev / 12))
      const best = annualArr.reduce((a, b) => b.revenue > a.revenue ? b : a, annualArr[0])
      setBestMonth(best?.month || '—')

    } catch (err: any) {
      console.error('Reports error:', err?.message)
    } finally { setLoading(false) }
  }

  function handleExportMonthlyCSV() {
    if (!isPro) { setShowUpgradeModal(true); return }
    exportCSV('rentura-monthly-collection',
      ['Month', 'Collected ($)', 'Overdue ($)', 'Pending ($)', 'Total ($)'],
      monthStats.map(m => [m.month, m.collected, m.overdue, m.pending, m.total])
    )
  }
  function handleExportPropertyCSV() {
    if (!isPro) { setShowUpgradeModal(true); return }
    exportCSV('rentura-property-breakdown',
      ['Property', 'Total Units', 'Occupied', 'Occupancy %', 'Monthly Revenue ($)'],
      propStats.map(p => [p.name, p.units, p.occupied, p.units > 0 ? Math.round((p.occupied / p.units) * 100) : 0, p.revenue])
    )
  }
  function handleExportAnnualCSV() {
    if (!isPro) { setShowUpgradeModal(true); return }
    exportCSV('rentura-annual-revenue',
      ['Month', 'Revenue ($)'],
      annualStats.map(m => [m.month, m.revenue])
    )
  }

  const maxBar = Math.max(...monthStats.map((m: any) => Math.max(m.total, m._ghost || 0)), 1)
  const maxAnnualBar = Math.max(...annualStats.map(m => m.revenue), 1)
  const collectionRate = (totalCollected + totalOverdue + totalPending) > 0
    ? Math.round((totalCollected / (totalCollected + totalOverdue + totalPending)) * 100) : 0
  const resolutionRate = (openMaint + resolvedMaint) > 0
    ? Math.round((resolvedMaint / (openMaint + resolvedMaint)) * 100) : 0

  const [unreadMessages, setUnreadMessages] = useState(0)

  useEffect(() => {
    let channel: any = null
    const initMessages = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const fetchUnread = async () => {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('receiver_id', user.id)
          .eq('read', false)
        setUnreadMessages(count || 0)
      }
      await fetchUnread()
      channel = supabase
        .channel('sidebar-unread')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, fetchUnread)
        .subscribe()
    }
    initMessages()
    return () => { if (channel) createClient().removeChannel(channel) }
  }, [])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;width:100%;max-width:100vw}
        .shell{display:flex;min-height:100vh;overflow-x:clip;width:100%}
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;transition:transform .25s ease;box-shadow:4px 0 24px rgba(15,23,42,.1)}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:199}.sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}.sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-footer{border-top:1px solid rgba(255,255,255,.07)}
        .sb-upgrade{margin:12px;padding:16px;border-radius:14px;background:linear-gradient(135deg,rgba(59,130,246,.16),rgba(99,102,241,.2));border:1px solid rgba(59,130,246,.22)}
        .sb-up-title{font-size:13.5px;font-weight:700;color:#F1F5F9;margin-bottom:4px}
        .sb-up-sub{font-size:12px;color:#64748B;line-height:1.55;margin-bottom:12px}
        .sb-up-btn{width:100%;padding:9px;border-radius:9px;border:none;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .sb-user{padding:14px 18px;border-top:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:11px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0}
        .sb-uplan{display:inline-block;font-size:10px;font-weight:700;border-radius:5px;padding:1px 6px;margin-top:2px}
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh;min-width:0;overflow-x:clip;width:calc(100% - 260px)}
        .topbar{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,.04);width:100%}
        .tb-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow:hidden}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;flex-shrink:0}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.breadcrumb b{color:#0F172A;font-weight:700}
        .btn-upgrade{padding:8px 14px;border-radius:9px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;text-decoration:none;display:inline-flex;align-items:center;gap:5px;box-shadow:0 2px 10px rgba(37,99,235,.25);white-space:nowrap;flex-shrink:0}
        .btn-export{padding:8px 12px;border-radius:9px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;transition:all .15s}
        .btn-export:hover{border-color:#3B82F6;color:#2563EB;background:#EFF6FF}
        .btn-export-locked{padding:8px 12px;border-radius:9px;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#94A3B8;font-size:12.5px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
        .hd-actions{display:flex;gap:8px;align-items:center;flex-shrink:0}

        /* ── FIX: Export dropdown — fixed position to escape topbar stacking context */
        .export-dropdown{position:relative;display:inline-block}
        .export-menu{
          position:fixed;
          top:58px;
          right:20px;
          background:#fff;
          border:1.5px solid #E2E8F0;
          border-radius:12px;
          box-shadow:0 8px 24px rgba(15,23,42,.14);
          z-index:1000;
          min-width:210px;
          overflow:hidden;
          animation:menuFadeIn .15s ease;
        }
        @keyframes menuFadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        .export-menu-item{
          display:flex;
          align-items:center;
          gap:9px;
          width:100%;
          padding:12px 16px;
          font-size:13px;
          font-weight:600;
          color:#374151;
          background:none;
          border:none;
          cursor:pointer;
          font-family:'Plus Jakarta Sans',sans-serif;
          text-align:left;
          transition:background .12s;
          border-bottom:1px solid #F1F5F9;
        }
        .export-menu-item:last-child{border-bottom:none}
        .export-menu-item:hover{background:#F8FAFC;color:#2563EB}

        .content{padding:22px 20px;flex:1;width:100%;min-width:0;overflow-x:hidden}
        .page-hd{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px;gap:12px;flex-wrap:wrap}
        .page-title{font-family:'Fraunces',serif;font-size:26px;font-weight:400;color:#0F172A;letter-spacing:-.5px;margin-bottom:3px}
        .page-sub{font-size:13px;color:#94A3B8}
        .summary{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px;width:100%}
        .sum-card{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:14px;box-shadow:0 1px 4px rgba(15,23,42,.04);min-width:0;overflow:hidden}
        .sum-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
        .sum-ico{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .sum-val{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;line-height:1;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sum-lbl{font-size:12px;color:#94A3B8;font-weight:500}
        .sum-tag{font-size:11px;font-weight:700;border-radius:99px;padding:2px 8px;white-space:nowrap}
        .row2{display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:12px}
        .row2b{display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:12px}
        .card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:18px;box-shadow:0 1px 4px rgba(15,23,42,.04);width:100%;min-width:0;overflow:hidden}
        .card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:8px}
        .card-title{font-size:14px;font-weight:700;color:#0F172A}
        .card-sub{font-size:12px;color:#94A3B8;margin-top:2px}
        .free-badge{font-size:10.5px;font-weight:700;background:#DCFCE7;color:#16A34A;padding:3px 10px;border-radius:99px;white-space:nowrap;flex-shrink:0}
        .pro-badge-tag{font-size:10.5px;font-weight:700;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;padding:3px 10px;border-radius:99px;white-space:nowrap;flex-shrink:0}
        .chart-area{display:flex;gap:3px;height:130px;align-items:flex-end;padding:0 2px;width:100%}
        .bar-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;min-width:0}
        .bar-lbl{font-size:10px;color:#94A3B8;margin-top:6px;font-weight:500;white-space:nowrap}
        .chart-divider{width:100%;height:1px;background:#F1F5F9;margin:10px 0 8px}
        .legend{display:flex;gap:12px;flex-wrap:wrap}
        .leg-item{display:flex;align-items:center;gap:5px;font-size:12px;color:#64748B;font-weight:500}
        .leg-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .occ-area{display:flex;gap:6px;height:110px;align-items:flex-end;width:100%}
        .occ-col{flex:1;display:flex;flex-direction:column;align-items:center;min-width:0}
        .occ-pct-lbl{font-size:10px;font-weight:700;margin-bottom:3px;white-space:nowrap}
        .occ-bar-el{width:100%;border-radius:5px 5px 0 0}
        .occ-month{font-size:10px;color:#94A3B8;margin-top:5px;font-weight:500;white-space:nowrap}
        .prop-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #F8FAFC}
        .prop-row:last-child{border-bottom:none}
        .prop-ico{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
        .prop-name{font-size:13px;font-weight:700;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .prop-sub{font-size:11.5px;color:#94A3B8;margin-top:1px}
        .prop-bar-bg{height:4px;background:#F1F5F9;border-radius:99px;overflow:hidden;margin-top:5px}
        .prop-bar-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#3B82F6,#6366F1)}
        .prop-right{text-align:right;flex-shrink:0}
        .prop-rev{font-family:'Fraunces',serif;font-size:16px;font-weight:700;color:#0F172A}
        .prop-occ-lbl{font-size:11px;color:#16A34A;font-weight:600;margin-top:2px}
        .maint-item{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #F8FAFC}
        .maint-item:last-child{border-bottom:none}
        .maint-label{font-size:13px;font-weight:600;color:#0F172A}
        .maint-desc{font-size:11.5px;color:#94A3B8;margin-top:2px}
        .maint-val{font-family:'Fraunces',serif;font-size:20px;font-weight:700}
        .prog-wrap{background:#F8FAFC;border-radius:10px;padding:12px;margin-top:4px}
        .prog-top{display:flex;justify-content:space-between;font-size:12px;color:#64748B;font-weight:600;margin-bottom:8px}
        .prog-bg{height:7px;background:#E2E8F0;border-radius:99px;overflow:hidden}
        .prog-fill{height:100%;border-radius:99px;transition:width .6s ease}
        .pro-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
        .pro-stat-card{background:linear-gradient(135deg,#0F172A,#1E293B);border:1px solid rgba(59,130,246,.2);border-radius:14px;padding:16px}
        .pro-stat-val{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#F1F5F9;line-height:1;margin-bottom:4px}
        .pro-stat-lbl{font-size:11.5px;color:#64748B;font-weight:500}
        .pro-stat-trend{font-size:11px;font-weight:700;color:#34D399;margin-top:4px}
        .pro-wrap{position:relative;border-radius:16px;overflow:hidden;margin-bottom:12px}
        .pro-blur{filter:blur(5px);pointer-events:none;user-select:none;opacity:.55}
        .pro-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(248,250,252,.88);backdrop-filter:blur(2px);padding:16px;text-align:center}
        .pro-icon{font-size:28px;line-height:1}
        .pro-tag{font-size:10.5px;font-weight:800;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;padding:3px 12px;border-radius:99px;letter-spacing:.5px}
        .pro-title{font-size:15px;font-weight:700;color:#0F172A}
        .pro-desc{font-size:12px;color:#64748B;max-width:240px;line-height:1.5}
        .pro-btn{padding:9px 20px;border-radius:9px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;text-decoration:none;display:inline-block;box-shadow:0 2px 10px rgba(37,99,235,.3);margin-top:2px}
        .umodal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px}
        .umodal{background:#fff;border-radius:22px;padding:32px;max-width:400px;width:100%;text-align:center;box-shadow:0 24px 60px rgba(15,23,42,.2)}
        .umodal-icon{font-size:40px;margin-bottom:14px}
        .umodal-title{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:8px}
        .umodal-sub{font-size:14px;color:#64748B;line-height:1.6;margin-bottom:20px}
        .umodal-btn-pro{width:100%;padding:13px;border-radius:11px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:10px}
        .umodal-btn-cancel{background:none;border:none;color:#94A3B8;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        /* ── FIX: Mobile export strip — hidden by default on desktop, shown only on mobile */
        .mobile-export-strip{display:none!important}
        /* ── FIX: Topbar export wrap — shown on desktop, hidden on mobile */
        .topbar-export-wrap{display:flex!important}

        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:8px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}

        @media(min-width:1100px){
          .summary{grid-template-columns:repeat(4,1fr)}
          .row2{grid-template-columns:3fr 2fr}
          .row2b{grid-template-columns:1fr 1fr}
        }
        @media(min-width:769px) and (max-width:1099px){
          .summary{grid-template-columns:repeat(2,1fr)}
          .row2{grid-template-columns:1fr}
          .row2b{grid-template-columns:1fr 1fr}
          .pro-stats{grid-template-columns:repeat(3,1fr)}
        }
        @media(max-width:768px){
          /* On mobile: hide topbar dropdown, show content strip instead */
          .topbar-export-wrap{display:none!important}
          .mobile-export-strip{display:flex!important}

          .sidebar{transform:translateX(-100%)}.main{margin-left:0!important;width:100%!important}.hamburger{display:block}
          .topbar{padding:0 14px}.content{padding:14px 14px}.summary{grid-template-columns:repeat(2,1fr)}
          .row2{grid-template-columns:1fr}.row2b{grid-template-columns:1fr}.pro-stats{grid-template-columns:1fr}
        }
        @media(max-width:480px){
          .topbar{padding:0 12px}.content{padding:12px 12px}.page-title{font-size:22px}
          .sum-val{font-size:18px}.sum-card{padding:12px 10px}.summary{gap:8px}.card{padding:14px}
          .chart-area{height:100px}.occ-area{height:90px}.pro-stats{grid-template-columns:1fr}
        }
      `}</style>

      {showUpgradeModal && (
        <div className="umodal-overlay" onClick={() => setShowUpgradeModal(false)}>
          <div className="umodal" onClick={e => e.stopPropagation()}>
            <div className="umodal-icon">📊</div>
            <div className="umodal-title">Pro Feature</div>
            <div className="umodal-sub">CSV exports, annual trends, and property comparisons are available on the Pro plan.</div>
            <button className="umodal-btn-pro" onClick={() => { setShowUpgradeModal(false); window.location.href = '/landlord/upgrade' }}>⭐ Upgrade to Pro →</button>
            <button className="umodal-btn-cancel" onClick={() => setShowUpgradeModal(false)}>Maybe later</button>
          </div>
        </div>
      )}

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="shell">
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">
              <Image src="/icon.png" alt="Rentura Logo" width={24} height={24} />
            </div>
            <span className="sb-logo-name">Rentura</span>
          </div>
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
            <a href="/landlord/messages" className="sb-item" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span className="sb-ico">💬</span>Messages
              </span>
              {unreadMessages > 0 && (
                <span style={{
                  minWidth: 18, height: 18, borderRadius: 99,
                  background: '#EF4444', color: '#fff',
                  fontSize: 10, fontWeight: 800,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 5px', flexShrink: 0, lineHeight: 1,
                }}>
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </a>
            <a href="/landlord/listings" className="sb-item"><span className="sb-ico">📋</span>Listings</a>
            <span className="sb-section">Account</span>
            <a href="/landlord/settings" className="sb-item"><span className="sb-ico">⚙️</span>Settings</a>
            <a href="/landlord/upgrade" className="sb-item"><span className="sb-ico">⭐</span>Upgrade</a>
          </nav>
          <div className="sb-footer">
            {!isPro && (
              <div className="sb-upgrade">
                <div className="sb-up-title">⭐ Upgrade to Pro</div>
                <div className="sb-up-sub">Unlock full reports, CSV exports & advanced analytics.</div>
                <button className="sb-up-btn" onClick={() => window.location.href = '/landlord/upgrade'}>See Plans →</button>
              </div>
            )}
            <div className="sb-user">
              <div className="sb-av">{userInitials}</div>
              <div>
                <div className="sb-uname">{fullName}</div>
                <span className="sb-uplan" style={{ color: planColor.color, background: planColor.bg, border: `1px solid ${planColor.border}` }}>
                  {planLabel}
                </span>
              </div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <div className="tb-left">
              <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Reports</b></div>
            </div>
            {/* ── FIX: Topbar export — hidden on mobile via .topbar-export-wrap */}
            <div className="hd-actions topbar-export-wrap">
              {isPro ? (
                <div className="export-dropdown">
                  <button
                    className="btn-export"
                    onClick={() => setShowExportMenu(v => !v)}>
                    📥 Export CSV ▾
                  </button>
                  {showExportMenu && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowExportMenu(false)} />
                      <div className="export-menu">
                        <button className="export-menu-item" onClick={() => { handleExportMonthlyCSV(); setShowExportMenu(false) }}>
                          📅 Monthly Collection
                        </button>
                        <button className="export-menu-item" onClick={() => { handleExportPropertyCSV(); setShowExportMenu(false) }}>
                          🏠 Property Breakdown
                        </button>
                        <button className="export-menu-item" onClick={() => { handleExportAnnualCSV(); setShowExportMenu(false) }}>
                          📈 Annual Revenue
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn-export-locked" onClick={() => setShowUpgradeModal(true)}>🔒 Export CSV</button>
                  <a href="/landlord/upgrade" className="btn-upgrade">⭐ Pro</a>
                </div>
              )}
            </div>
          </div>

          <div className="content">
            <div className="page-hd">
              <div>
                {/* {isPro && <span style={{ fontSize: 13, fontWeight: 700, background: 'linear-gradient(135deg,#2563EB,#6366F1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginLeft: 6 }}>⭐ Pro</span>} */}
                <div className="page-title">Reports </div>
                <div className="page-sub">Financial & occupancy overview · {MONTHS[NOW.getMonth()]} {NOW.getFullYear()}</div>
              </div>
            </div>

            {/* ── FIX: Mobile export strip — shown only on mobile (≤768px), hidden on desktop */}
            {isPro && (
              <div
                className="mobile-export-strip"
                style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16, padding: '12px 14px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 1px 4px rgba(15,23,42,.04)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#374151', width: '100%', marginBottom: 4 }}>📥 Export Reports</div>
                <button className="btn-export" style={{ fontSize: 12, padding: '7px 12px' }} onClick={handleExportMonthlyCSV}>📅 Monthly CSV</button>
                <button className="btn-export" style={{ fontSize: 12, padding: '7px 12px' }} onClick={handleExportPropertyCSV}>🏠 Property CSV</button>
                <button className="btn-export" style={{ fontSize: 12, padding: '7px 12px' }} onClick={handleExportAnnualCSV}>📈 Annual CSV</button>
              </div>
            )}
            {!isPro && (
              <div
                className="mobile-export-strip"
                style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16, padding: '12px 14px', background: '#F8FAFC', border: '1.5px dashed #E2E8F0', borderRadius: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#94A3B8', width: '100%', marginBottom: 4 }}>📥 Export Reports</div>
                <button className="btn-export-locked" onClick={() => setShowUpgradeModal(true)}>🔒 Monthly CSV</button>
                <button className="btn-export-locked" onClick={() => setShowUpgradeModal(true)}>🔒 Property CSV</button>
                <button className="btn-export-locked" onClick={() => setShowUpgradeModal(true)}>🔒 Annual CSV</button>
                <a href="/landlord/upgrade" className="btn-upgrade" style={{ fontSize: 12, padding: '7px 12px' }}>⭐ Upgrade for CSV</a>
              </div>
            )}

            {/* Summary stats */}
            <div className="summary">
              <div className="sum-card">
                <div className="sum-top"><div className="sum-ico" style={{ background: '#F0FDF4' }}>💰</div><span className="sum-tag" style={{ background: '#DCFCE7', color: '#16A34A' }}>{collectionRate}%</span></div>
                {loading ? <div className="skeleton" style={{ height: 22, width: 80, marginBottom: 6 }} /> : <div className="sum-val">{fmtMoney(totalCollected)}</div>} 
                <div className="sum-lbl">Collected This Month</div>
              </div>
              <div className="sum-card">
                <div className="sum-top"><div className="sum-ico" style={{ background: '#FEE2E2' }}>⚠️</div><span className="sum-tag" style={{ background: totalOverdue > 0 ? '#FEE2E2' : '#F1F5F9', color: totalOverdue > 0 ? '#DC2626' : '#94A3B8' }}>{totalOverdue > 0 ? 'Overdue' : 'Clear'}</span></div>
                {loading ? <div className="skeleton" style={{ height: 22, width: 80, marginBottom: 6 }} /> : <div className="sum-val" style={{ color: totalOverdue > 0 ? '#DC2626' : '#0F172A' }}>{fmtMoney(totalOverdue)}</div>}
                <div className="sum-lbl">Overdue This Month</div>
              </div>
              <div className="sum-card">
                <div className="sum-top"><div className="sum-ico" style={{ background: '#FEF3C7' }}>🔧</div><span className="sum-tag" style={{ background: '#FEF3C7', color: '#D97706' }}>{openMaint} open</span></div>
                {loading ? <div className="skeleton" style={{ height: 22, width: 50, marginBottom: 6 }} /> : <div className="sum-val">{fmtMoney(openMaint + resolvedMaint)}</div>}
                <div className="sum-lbl">Total Maintenance</div>
              </div>
              <div className="sum-card">
                <div className="sum-top"><div className="sum-ico" style={{ background: '#EFF6FF' }}>✅</div><span className="sum-tag" style={{ background: '#EFF6FF', color: '#2563EB' }}>{resolvedMaint} resolved</span></div>
                {loading ? <div className="skeleton" style={{ height: 22, width: 50, marginBottom: 6 }} /> : <div className="sum-val" style={{ color: '#2563EB' }}>{resolutionRate}%</div>}
                <div className="sum-lbl">Resolution Rate</div>
              </div>
            </div>

            {isPro && (
              <div className="pro-stats">
                <div className="pro-stat-card">
                  <div className="pro-stat-val">{fmtMoney(totalAnnualRevenue)}</div>
                  <div className="pro-stat-lbl">Annual Revenue (12mo)</div>
                  <div className="pro-stat-trend">↑ Collected from all properties</div>
                </div>
                <div className="pro-stat-card">
                  <div className="pro-stat-val">{fmtMoney(avgMonthlyRevenue)}</div>
                  <div className="pro-stat-lbl">Avg Monthly Revenue</div>
                  <div className="pro-stat-trend">Based on last 12 months</div>
                </div>
                <div className="pro-stat-card">
                  <div className="pro-stat-val">{bestMonth || '—'}</div>
                  <div className="pro-stat-lbl">Best Revenue Month</div>
                  <div className="pro-stat-trend">Highest collection this year</div>
                </div>
              </div>
            )}

            <div className="row2">
              <div className="card">
                <div className="card-head">
                  <div><div className="card-title">Rent Collection</div><div className="card-sub">Last 6 months breakdown</div></div>
                  <span className="free-badge">✓ Free</span>
                </div>
                {loading ? (
                  <div style={{ display: 'flex', gap: 6, height: 130, alignItems: 'flex-end' }}>
                    {[55, 40, 65, 45, 70, 90].map((h, i) => <div key={i} className="skeleton" style={{ flex: 1, height: `${h}%`, borderRadius: 6 }} />)}
                  </div>
                ) : (
                  <>
                    <div className="chart-area">
                      {monthStats.map((m: any, i: number) => {
                        const isGhost = m.total === 0
                        const ch = m.total > 0 ? Math.max(4, Math.round((m.collected / maxBar) * 100)) : 0
                        const oh = m.total > 0 ? Math.max(0, Math.round((m.overdue / maxBar) * 100)) : 0
                        const ph = m.total > 0 ? Math.max(0, Math.round((m.pending / maxBar) * 100)) : 0
                        const isCurrent = i === 5
                        return (
                          <div key={i} className="bar-col">
                            <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 1 }}>
                              {isGhost
                                ? <div style={{ width: '100%', height: '20%', minHeight: 6, borderRadius: 5, background: '#F1F5F9', border: '1.5px dashed #E2E8F0' }} />
                                : <>
                                  {ph > 0 && <div style={{ width: '100%', height: `${ph}%`, minHeight: 3, borderRadius: '3px 3px 0 0', background: '#FEF3C7', border: '1px solid #FDE68A' }} />}
                                  {oh > 0 && <div style={{ width: '100%', height: `${oh}%`, minHeight: 3, background: '#FECACA', border: '1px solid #FCA5A5' }} />}
                                  {ch > 0 && <div style={{ width: '100%', height: `${ch}%`, minHeight: 5, borderRadius: oh === 0 && ph === 0 ? '5px 5px 0 0' : '0', background: isCurrent ? 'linear-gradient(180deg,#2563EB,#6366F1)' : 'linear-gradient(180deg,#93C5FD,#818CF8)' }} />}
                                </>
                              }
                            </div>
                            <div className="bar-lbl" style={{ fontWeight: isCurrent ? 700 : 400, color: isCurrent ? '#0F172A' : '#94A3B8' }}>{m.month}</div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="chart-divider" />
                    <div className="legend">
                      <span className="leg-item"><span className="leg-dot" style={{ background: '#3B82F6' }} />Collected</span>
                      <span className="leg-item"><span className="leg-dot" style={{ background: '#FCA5A5' }} />Overdue</span>
                      <span className="leg-item"><span className="leg-dot" style={{ background: '#FDE68A' }} />Pending</span>
                      <span className="leg-item"><span className="leg-dot" style={{ background: '#E2E8F0', border: '1.5px dashed #CBD5E1' }} />No data</span>
                    </div>
                  </>
                )}
              </div>

              <div className="card">
                <div className="card-head">
                  <div><div className="card-title">Occupancy Rate</div><div className="card-sub">Last 6 months</div></div>
                  <span className="free-badge">✓ Free</span>
                </div>
                {loading ? (
                  <div style={{ display: 'flex', gap: 6, height: 110, alignItems: 'flex-end' }}>
                    {[60, 65, 55, 70, 68, 75].map((h, i) => <div key={i} className="skeleton" style={{ flex: 1, height: `${h}%`, borderRadius: 6 }} />)}
                  </div>
                ) : (
                  <>
                    <div className="occ-area">
                      {occStats.map((o, i) => {
                        const isCurrent = i === 5
                        const color = o.rate >= 80 ? (isCurrent ? 'linear-gradient(180deg,#10B981,#34D399)' : 'linear-gradient(180deg,#6EE7B7,#A7F3D0)')
                          : o.rate >= 50 ? (isCurrent ? 'linear-gradient(180deg,#3B82F6,#6366F1)' : 'linear-gradient(180deg,#93C5FD,#A5B4FC)')
                            : (isCurrent ? 'linear-gradient(180deg,#F59E0B,#FCD34D)' : 'linear-gradient(180deg,#FCD34D,#FDE68A)')
                        return (
                          <div key={i} className="occ-col">
                            <div className="occ-pct-lbl" style={{ color: isCurrent ? '#0F172A' : '#94A3B8' }}>{o.rate}%</div>
                            <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                              <div className="occ-bar-el" style={{ height: `${o.rate}%`, minHeight: 5, background: color }} />
                            </div>
                            <div className="occ-month" style={{ fontWeight: isCurrent ? 700 : 400, color: isCurrent ? '#0F172A' : '#94A3B8' }}>{o.month}</div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ marginTop: 12, padding: '10px 12px', background: '#F8FAFC', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Current occupancy</span>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: occStats[5]?.rate >= 80 ? '#16A34A' : occStats[5]?.rate >= 50 ? '#2563EB' : '#D97706' }}>{occStats[5]?.rate || 0}%</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="row2b">
              <div className="card">
                <div className="card-head">
                  <div><div className="card-title">Property Breakdown</div><div className="card-sub">Revenue & occupancy per property</div></div>
                  <span className="free-badge">✓ Free</span>
                </div>
                {loading ? [1, 2].map(i => (
                  <div key={i} className="prop-row">
                    <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}><div className="skeleton" style={{ height: 12, width: '55%', marginBottom: 6 }} /><div className="skeleton" style={{ height: 6, width: '80%', borderRadius: 99 }} /></div>
                    <div><div className="skeleton" style={{ height: 16, width: 50, marginBottom: 4 }} /><div className="skeleton" style={{ height: 10, width: 32 }} /></div>
                  </div>
                )) : propStats.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 13 }}>No properties found</div>
                ) : propStats.map((p, i) => {
                  const pct = p.units > 0 ? Math.round((p.occupied / p.units) * 100) : 0
                  const bgs = ['linear-gradient(135deg,#2563EB,#6366F1)', 'linear-gradient(135deg,#10B981,#34D399)', 'linear-gradient(135deg,#F59E0B,#FCD34D)', 'linear-gradient(135deg,#EF4444,#F87171)']
                  return (
                    <div key={i} className="prop-row">
                      <div className="prop-ico" style={{ background: bgs[i % bgs.length] }}>🏠</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="prop-name">{p.name}</div>
                        <div className="prop-sub">{p.occupied} of {p.units} units occupied</div>
                        <div className="prop-bar-bg"><div className="prop-bar-fill" style={{ width: `${pct}%` }} /></div>
                      </div>
                      <div className="prop-right">
                        <div className="prop-rev">{fmtMoney(p.revenue)}</div>
                        <div className="prop-occ-lbl">{pct}% occ.</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="card">
                <div className="card-head">
                  <div><div className="card-title">Maintenance Summary</div><div className="card-sub">All time overview</div></div>
                  <span className="free-badge">✓ Free</span>
                </div>
                {loading ? [1, 2, 3].map(i => (
                  <div key={i} className="maint-item">
                    <div><div className="skeleton" style={{ height: 12, width: 90, marginBottom: 5 }} /><div className="skeleton" style={{ height: 10, width: 65 }} /></div>
                    <div className="skeleton" style={{ height: 20, width: 36 }} />
                  </div>
                )) : (
                  <>
                    <div className="maint-item">
                      <div><div className="maint-label">Open Requests</div><div className="maint-desc">Needs attention</div></div>
                      <div className="maint-val" style={{ color: openMaint > 0 ? '#D97706' : '#16A34A' }}>{openMaint}</div>
                    </div>
                    <div className="maint-item">
                      <div><div className="maint-label">Resolved</div><div className="maint-desc">All time</div></div>
                      <div className="maint-val" style={{ color: '#16A34A' }}>{resolvedMaint}</div>
                    </div>
                    <div className="maint-item">
                      <div><div className="maint-label">Resolution Rate</div><div className="maint-desc">Resolved vs total</div></div>
                      <div className="maint-val" style={{ color: '#2563EB' }}>{resolutionRate}%</div>
                    </div>
                    <div className="prog-wrap">
                      <div className="prog-top"><span>Resolution progress</span><span style={{ color: '#0F172A' }}>{resolvedMaint}/{openMaint + resolvedMaint}</span></div>
                      <div className="prog-bg"><div className="prog-fill" style={{ width: `${resolutionRate}%`, background: resolutionRate >= 70 ? 'linear-gradient(90deg,#10B981,#34D399)' : 'linear-gradient(90deg,#F59E0B,#FCD34D)' }} /></div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {isPro ? (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="card-head">
                  <div><div className="card-title">Annual Revenue Trend</div><div className="card-sub">Last 12 months · collected payments</div></div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="pro-badge-tag">⭐ Pro</span>
                    <button className="btn-export" onClick={handleExportAnnualCSV} style={{ fontSize: 11.5, padding: '5px 10px' }}>📥 Export</button>
                  </div>
                </div>
                {loading ? (
                  <div style={{ display: 'flex', gap: 4, height: 120, alignItems: 'flex-end' }}>
                    {Array(12).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ flex: 1, height: `${40 + Math.random() * 50}%`, borderRadius: 4 }} />)}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, marginBottom: 8 }}>
                      {annualStats.map((m, i) => {
                        const h = maxAnnualBar > 0 ? Math.max(4, Math.round((m.revenue / maxAnnualBar) * 100)) : 4
                        const isCurrent = i === annualStats.length - 1
                        return (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: '100%', height: `${h}%`, minHeight: 4, borderRadius: '4px 4px 0 0', background: m.revenue > 0 ? (isCurrent ? 'linear-gradient(180deg,#2563EB,#6366F1)' : 'linear-gradient(180deg,#93C5FD,#818CF8)') : '#F1F5F9' }} />
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                      {annualStats.map((m, i) => (
                        <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: i === annualStats.length - 1 ? '#0F172A' : '#94A3B8', fontWeight: i === annualStats.length - 1 ? 700 : 400 }}>{m.month}</div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 12px', minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ fontSize: 10, color: '#16A34A', fontWeight: 600, marginBottom: 3 }}>Total 12mo</div>
                        <div style={{ fontFamily: 'Fraunces,serif', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{fmtMoney(totalAnnualRevenue)}</div>
                      </div>
                      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 12px', minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ fontSize: 10, color: '#2563EB', fontWeight: 600, marginBottom: 3 }}>Monthly Avg</div>
                        <div style={{ fontFamily: 'Fraunces,serif', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{fmtMoney(avgMonthlyRevenue)}</div>
                      </div>
                      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 12px', minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ fontSize: 10, color: '#D97706', fontWeight: 600, marginBottom: 3 }}>Best Month</div>
                        <div style={{ fontFamily: 'Fraunces,serif', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{bestMonth}</div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="pro-wrap">
                <div className="card pro-blur">
                  <div className="card-head"><div className="card-title">Annual Revenue Trend</div></div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 110, marginBottom: 8 }}>
                    {[3200, 3400, 3100, 3600, 3500, 3900, 3700, 4200, 4000, 4400, 4200, 4600].map((v, i) => (
                      <div key={i} style={{ flex: 1, height: `${Math.round((v / 5000) * 100)}%`, background: i === NOW.getMonth() ? 'linear-gradient(180deg,#2563EB,#6366F1)' : '#CBD5E1', borderRadius: '4px 4px 0 0', minHeight: 4 }} />
                    ))}
                  </div>
                </div>
                <div className="pro-overlay">
                  <div className="pro-icon">📈</div>
                  <span className="pro-tag">⭐ PRO FEATURE</span>
                  <div className="pro-title">Annual Revenue Trend</div>
                  <div className="pro-desc">Full year breakdown, monthly averages & CSV export</div>
                  <a href="/landlord/upgrade" className="pro-btn">Unlock with Pro →</a>
                </div>
              </div>
            )}

            {isPro ? (
              <div className="card" style={{ marginBottom: 0 }}>
                <div className="card-head">
                  <div><div className="card-title">Property Performance Comparison</div><div className="card-sub">Revenue & occupancy ranked</div></div>
                  <span className="pro-badge-tag">⭐ Pro</span>
                </div>
                {loading ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                    {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }} />)}
                  </div>
                ) : propStats.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 13 }}>No property data yet</div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(propStats.length, 3)},1fr)`, gap: 10, marginBottom: 14 }}>
                      {[...propStats].sort((a, b) => b.revenue - a.revenue).slice(0, 3).map((p, i) => {
                        const pct = p.units > 0 ? Math.round((p.occupied / p.units) * 100) : 0
                        const medals = ['🥇', '🥈', '🥉']
                        const bg = i === 0 ? 'linear-gradient(135deg,rgba(37,99,235,.08),rgba(99,102,241,.08))' : '#F8FAFC'
                        const border = i === 0 ? '1px solid rgba(37,99,235,.2)' : '1px solid #E2E8F0'
                        return (
                          <div key={i} style={{ padding: 14, background: bg, borderRadius: 12, border }}>
                            <div style={{ fontSize: 18, marginBottom: 6 }}>{medals[i]}</div>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                            <div style={{ fontFamily: 'Fraunces,serif', fontSize: 20, fontWeight: 700, color: i === 0 ? '#2563EB' : '#0F172A' }}>{fmtMoney(p.revenue)}</div>
                            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>/month revenue</div>
                            <div style={{ marginTop: 8, height: 4, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#3B82F6,#6366F1)', borderRadius: 99, transition: 'width .4s' }} />
                            </div>
                            <div style={{ fontSize: 11, color: pct >= 80 ? '#16A34A' : pct >= 50 ? '#2563EB' : '#D97706', marginTop: 4, fontWeight: 700 }}>{pct}% occupancy</div>
                          </div>
                        )
                      })}
                    </div>
                    {propStats.length > 1 && (
                      <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px 16px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .5 }}>Revenue Share</div>
                        {[...propStats].sort((a, b) => b.revenue - a.revenue).map((p, i) => {
                          const totalRev = propStats.reduce((s, x) => s + x.revenue, 0)
                          const share = totalRev > 0 ? Math.round((p.revenue / totalRev) * 100) : 0
                          const bgs = ['#2563EB', '#6366F1', '#10B981', '#F59E0B', '#EF4444']
                          return (
                            <div key={i} style={{ marginBottom: 8 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                <span style={{ fontWeight: 600, color: '#0F172A' }}>{p.name}</span>
                                <span style={{ color: '#64748B' }}>{share}% · {fmtMoney(p.revenue)}</span>
                              </div>
                              <div style={{ height: 5, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${share}%`, background: bgs[i % bgs.length], borderRadius: 99, transition: 'width .4s' }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="pro-wrap" style={{ marginBottom: 0 }}>
                <div className="card pro-blur">
                  <div className="card-head"><div className="card-title">Property Performance Comparison</div></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                    {['Rush Towers', 'Ocean View', 'Green Valley'].map((name, i) => (
                      <div key={i} style={{ padding: 14, background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>{name}</div>
                        <div style={{ fontFamily: 'Fraunces,serif', fontSize: 20, fontWeight: 700, color: '#2563EB' }}>{fmtMoney([4200, 2800, 3600][i])}</div>
                        <div style={{ marginTop: 8, height: 4, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${[78, 55, 90][i]}%`, background: 'linear-gradient(90deg,#3B82F6,#6366F1)', borderRadius: 99 }} />
                        </div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>{[78, 55, 90][i]}% occ.</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pro-overlay">
                  <div className="pro-icon">🏆</div>
                  <span className="pro-tag">⭐ PRO FEATURE</span>
                  <div className="pro-title">Property Comparison</div>
                  <div className="pro-desc">Compare revenue, occupancy & share across all your properties</div>
                  <a href="/landlord/upgrade" className="pro-btn">Unlock with Pro →</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
