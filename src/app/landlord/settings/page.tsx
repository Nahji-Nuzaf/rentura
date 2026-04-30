'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import { usePro } from '@/components/ProProvider'

// ── REMOVED: import { profile } from 'console' — this was breaking the page ──

type NotifSettings = { rent_due: boolean; maintenance: boolean; messages: boolean; lease_expiry: boolean }

export default function SettingsPage() {
  const router = useRouter()

  // ── usePro INSIDE the component ──
  const { isPro, plan, refresh: refreshPro } = usePro()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'billing' | 'security'>('profile')
  const [userId, setUserId] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [notifSaved, setNotifSaved] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [openMaint, setOpenMaint] = useState(0)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [activeRole, setActiveRole] = useState('landlord')
  const [userRoles, setUserRoles] = useState<string[]>(['landlord'])

  const [profileData, setProfileData] = useState({
    full_name: '', email: '', phone: '', company: '', bio: ''
  })
  const [notifs, setNotifs] = useState<NotifSettings>({
    rent_due: true, maintenance: true, messages: true, lease_expiry: true
  })
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })

  const initials = profileData.full_name
    ? profileData.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'NN'

  // Dynamic plan badge colours
  const planLabel = isPro ? plan.toUpperCase() : 'FREE'
  const planColor = isPro
    ? { color: '#FCD34D', bg: 'rgba(251,191,36,.14)', border: 'rgba(251,191,36,.3)' }
    : { color: '#60A5FA', bg: 'rgba(59,130,246,.14)', border: 'rgba(59,130,246,.25)' }

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: prof } = await supabase
        .from('profiles').select('full_name,email,phone,active_role,roles').eq('id', user.id).single()

      setProfileData({
        full_name: prof?.full_name || user.user_metadata?.full_name || '',
        email: prof?.email || user.email || '',
        phone: prof?.phone || '',
        company: user.user_metadata?.company || '',
        bio: user.user_metadata?.bio || '',
      })
      setActiveRole(prof?.active_role || 'landlord')
      setUserRoles(prof?.roles || ['landlord'])

      if (user.user_metadata?.notif_settings) setNotifs(user.user_metadata.notif_settings)

      const { data: props } = await supabase.from('properties').select('id').eq('landlord_id', user.id)
      const propIds = (props || []).map((p: any) => p.id)
      if (propIds.length > 0) {
        const { count } = await supabase
          .from('maintenance_requests').select('id', { count: 'exact', head: true })
          .in('property_id', propIds).neq('status', 'resolved')
        setOpenMaint(count || 0)
      }
    }
    load()
  }, [router])

  async function saveProfile() {
    if (!userId) return
    const supabase = createClient()
    await supabase.from('profiles').update({
      full_name: profileData.full_name,
      phone: profileData.phone,
    }).eq('id', userId)
    await supabase.auth.updateUser({
      data: { full_name: profileData.full_name, phone: profileData.phone, company: profileData.company, bio: profileData.bio }
    })
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2500)
  }

  async function saveNotifs() {
    if (!userId) return
    const supabase = createClient()
    await supabase.auth.updateUser({ data: { notif_settings: notifs } })
    setNotifSaved(true)
    setTimeout(() => setNotifSaved(false), 2500)
  }

  async function changePassword() {
    if (pwForm.next !== pwForm.confirm) { setPwMsg('err:Passwords do not match.'); return }
    if (pwForm.next.length < 8) { setPwMsg('err:Password must be at least 8 characters.'); return }
    setPwLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: pwForm.next })
    setPwLoading(false)
    if (error) setPwMsg(`err:${error.message}`)
    else { setPwMsg('ok:Password updated successfully!'); setPwForm({ current: '', next: '', confirm: '' }) }
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleRoleSwitch(role: string) {
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({ active_role: role }).eq('id', userId)
    if (error) { console.error('Role sync failed:', error.message); return }
    window.location.href = `/onboarding`
  }

  async function handleDeleteAccount() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const tabs = [
    { id: 'profile', label: 'Profile', ico: '👤' },
    { id: 'notifications', label: 'Notifications', ico: '🔔' },
    { id: 'billing', label: 'Billing', ico: '💳' },
    { id: 'security', label: 'Security', ico: '🔒' },
  ] as const

  const pwStatus = pwMsg.startsWith('ok:') ? 'ok' : pwMsg.startsWith('err:') ? 'err' : ''
  const pwText = pwMsg.replace(/^(ok|err):/, '')

  const PRO_FEATURES = [
    'Unlimited properties', 'Advanced analytics & reports',
    'CSV & PDF exports', 'Priority support',
    'Property comparison', 'Year-over-year trends',
  ]

  const ROLE_INFO: Record<string, { icon: string; label: string }> = {
    landlord: { icon: '🏠', label: 'Landlord' },
    tenant: { icon: '🔑', label: 'Tenant' },
    seeker: { icon: '🔍', label: 'Seeker' },
  }

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
        html{overflow-x:hidden;width:100%}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#F4F6FA;width:100%;max-width:100vw}
        .shell{display:flex;min-height:100vh;overflow-x:clip;width:100%}
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;box-shadow:4px 0 24px rgba(15,23,42,.1);transition:transform .25s ease}
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
        .sb-badge{margin-left:auto;background:#EF4444;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:1px 7px}
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
        .tb-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1}
        .hamburger{display:none;background:none;border:none;font-size:22px;cursor:pointer;color:#475569;padding:4px;flex-shrink:0}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}.breadcrumb b{color:#0F172A;font-weight:700}
        .content{padding:22px 20px;flex:1;width:100%;min-width:0;overflow-x:hidden}
        .settings-wrap{display:grid;grid-template-columns:200px 1fr;gap:20px;align-items:start;width:100%}
        .tabs-col{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:10px;box-shadow:0 1px 4px rgba(15,23,42,.04);position:sticky;top:76px}
        .stab{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;color:#64748B;transition:all .15s;border:none;background:none;font-family:'Plus Jakarta Sans',sans-serif;text-align:left;width:100%;margin-bottom:2px}
        .stab:hover{background:#F8FAFC;color:#0F172A}
        .stab.active{background:#EFF6FF;color:#2563EB}
        .stab-ico{font-size:15px;width:20px;text-align:center;flex-shrink:0}
        .stab-divider{height:1px;background:#F1F5F9;margin:8px 0}
        .settings-card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:24px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .sc-head{margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #F1F5F9}
        .sc-title{font-size:17px;font-weight:700;color:#0F172A;margin-bottom:4px}
        .sc-sub{font-size:13px;color:#94A3B8;line-height:1.5}
        .sc-divider{height:1px;background:#F1F5F9;margin:20px 0}
        .avatar-row{display:flex;align-items:center;gap:16px;padding:16px;background:#F8FAFC;border-radius:14px;border:1px solid #E2E8F0;margin-bottom:20px;flex-wrap:wrap}
        .big-av{width:60px;height:60px;border-radius:15px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:700;flex-shrink:0;box-shadow:0 4px 14px rgba(37,99,235,.28)}
        .av-info{flex:1;min-width:0}
        .av-name{font-size:15px;font-weight:700;color:#0F172A;margin-bottom:2px}
        .av-email{font-size:12px;color:#94A3B8}
        .av-plan{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;border-radius:99px;padding:3px 10px;margin-top:6px}
        .field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
        .field label{font-size:12.5px;font-weight:700;color:#374151;letter-spacing:.2px}
        .field input,.field textarea{padding:10px 14px;border-radius:10px;border:1.5px solid #E2E8F0;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;background:#fff;outline:none;transition:border-color .15s,box-shadow .15s;width:100%}
        .field input:focus,.field textarea:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
        .field input:disabled{background:#F8FAFC;color:#94A3B8;cursor:not-allowed}
        .field textarea{resize:vertical;min-height:80px;line-height:1.5}
        .field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .field-hint{font-size:11.5px;color:#94A3B8;margin-top:3px}
        .save-btn{padding:10px 24px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,.28);transition:all .18s;display:inline-flex;align-items:center;gap:8px}
        .save-btn:hover{transform:translateY(-1px)}
        .save-btn.saved{background:linear-gradient(135deg,#16A34A,#15803D)}
        .outline-btn{padding:9px 18px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .outline-btn:hover{border-color:#CBD5E1;background:#F8FAFC}
        .notif-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid #F8FAFC}
        .notif-row:last-child{border-bottom:none}
        .notif-name{font-size:13.5px;font-weight:600;color:#0F172A;margin-bottom:3px}
        .notif-desc{font-size:12px;color:#94A3B8;line-height:1.4}
        .toggle{width:44px;height:24px;border-radius:99px;border:none;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0;padding:0}
        .toggle.on{background:#2563EB}.toggle.off{background:#E2E8F0}
        .toggle-knob{width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:3px;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.18)}
        .toggle.on .toggle-knob{left:23px}.toggle.off .toggle-knob{left:3px}
        .plan-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px}
        .plan-card{border:2px solid #E2E8F0;border-radius:14px;padding:18px;transition:all .15s;position:relative}
        .plan-card.current-free{border-color:#E2E8F0;background:#FAFBFF}
        .plan-card.current-pro{border-color:#2563EB;background:linear-gradient(135deg,#1E3A5F,#1E1E4E)}
        .plan-pill{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;border-radius:99px;padding:3px 10px;margin-bottom:10px}
        .plan-name{font-size:16px;font-weight:700;color:#0F172A;margin-bottom:2px}
        .plan-price{font-size:12.5px;color:#64748B;margin-bottom:12px}
        .plan-feature{display:flex;align-items:center;gap:7px;font-size:12px;color:#475569;margin-bottom:5px}
        .plan-upgrade-btn{width:100%;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-top:14px;box-shadow:0 2px 8px rgba(37,99,235,.25)}
        /* PRO ACTIVE card */
        .pro-active-banner{background:linear-gradient(135deg,#0F172A,#1a3354);border:1px solid rgba(59,130,246,.3);border-radius:16px;padding:20px 24px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px}
        .pab-icon{width:46px;height:46px;border-radius:13px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;box-shadow:0 4px 12px rgba(37,99,235,.4)}
        .pab-title{font-family:'Fraunces',serif;font-size:18px;font-weight:700;color:#F1F5F9;margin-bottom:3px}
        .pab-sub{font-size:12.5px;color:#64748B}
        .pab-badge{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:12px;font-weight:700;padding:6px 16px;border-radius:99px;box-shadow:0 4px 12px rgba(37,99,235,.3);white-space:nowrap}
        .pro-features-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px}
        .pro-feat-item{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;font-size:12.5px;color:#15803D;font-weight:600}
        .pw-strength{display:flex;gap:4px;margin-top:6px}
        .pw-seg{height:3px;flex:1;border-radius:99px;background:#E2E8F0;transition:background .3s}
        .pw-msg-box{font-size:13px;margin-top:10px;padding:10px 14px;border-radius:9px;display:flex;align-items:center;gap:8px}
        .pw-msg-box.ok{background:#DCFCE7;color:#16A34A}
        .pw-msg-box.err{background:#FEE2E2;color:#DC2626}
        .danger-zone{border:1.5px solid #FCA5A5;border-radius:14px;padding:18px;margin-top:22px;background:#FFF8F8}
        .dz-title{font-size:14px;font-weight:700;color:#DC2626;margin-bottom:6px}
        .dz-sub{font-size:13px;color:#64748B;margin-bottom:14px;line-height:1.5}
        .dz-confirm{background:#FEE2E2;border:1.5px solid #FCA5A5;border-radius:12px;padding:14px;margin-bottom:14px}
        .dz-confirm-text{font-size:13px;color:#DC2626;font-weight:600;margin-bottom:10px}
        .dz-actions{display:flex;gap:8px}
        .dz-btn-cancel{padding:8px 16px;border-radius:9px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .dz-btn-confirm{padding:8px 16px;border-radius:9px;border:none;background:#DC2626;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .dz-btn{padding:9px 18px;border-radius:9px;border:1.5px solid #FCA5A5;background:#FEF2F2;color:#DC2626;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .dz-btn:hover{background:#FEE2E2}
        @media(max-width:900px){
          .settings-wrap{grid-template-columns:1fr}
          .tabs-col{position:static;display:flex;flex-wrap:wrap;gap:4px;padding:8px}
          .stab{flex:1;min-width:100px;justify-content:center}
          .stab-divider{display:none}
          .plan-grid{grid-template-columns:1fr}
          .pro-features-grid{grid-template-columns:1fr}
        }
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}.main{margin-left:0!important;width:100%!important}.hamburger{display:block}
          .topbar{padding:0 14px}.content{padding:14px 14px}
          .field-row{grid-template-columns:1fr}
          .avatar-row{flex-direction:row;align-items:flex-start}
        }
        @media(max-width:480px){.content{padding:12px 12px}.settings-card{padding:16px}}
      `}</style>

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
            <a href="/landlord/reports" className="sb-item"><span className="sb-ico">📊</span>Reports</a>
            <span className="sb-section">Management</span>
            <a href="/landlord/maintenance" className="sb-item">
              <span className="sb-ico">🔧</span>Maintenance
              {openMaint > 0 && <span className="sb-badge">{openMaint}</span>}
            </a>
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
            <a href="/landlord/settings" className="sb-item active"><span className="sb-ico">⚙️</span>Settings</a>
            <a href="/landlord/upgrade" className="sb-item"><span className="sb-ico">⭐</span>Upgrade</a>
          </nav>
          <div className="sb-footer">
            {!isPro && (
              <div className="sb-upgrade">
                <div className="sb-up-title">⭐ Upgrade to Pro</div>
                <div className="sb-up-sub">Unlimited properties & priority support.</div>
                <button className="sb-up-btn" onClick={() => window.location.href = '/landlord/upgrade'}>See Plans →</button>
              </div>
            )}
            <div className="sb-user">
              <div className="sb-av">{initials}</div>
              <div>
                <div className="sb-uname">{profileData.full_name || 'User'}</div>
                {/* ── Dynamic plan badge ── */}
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
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Settings</b></div>
            </div>
          </div>

          <div className="content">
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 400, color: '#0F172A', letterSpacing: -.5, marginBottom: 3 }}>Settings</div>
              <div style={{ fontSize: 13, color: '#94A3B8' }}>Manage your account, preferences and subscription</div>
            </div>

            <div className="settings-wrap">
              {/* Tab nav */}
              <div className="tabs-col">
                {tabs.map(t => (
                  <button key={t.id} className={`stab${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>
                    <span className="stab-ico">{t.ico}</span>{t.label}
                  </button>
                ))}
                <div className="stab-divider" />
                <button className="stab" style={{ color: '#DC2626' }} onClick={handleLogout}>
                  <span className="stab-ico">🚪</span>Sign Out
                </button>
              </div>

              <div>

                {/* ── PROFILE TAB ── */}
                {activeTab === 'profile' && (
                  <div className="settings-card">
                    <div className="sc-head">
                      <div className="sc-title">Profile Information</div>
                      <div className="sc-sub">Your name and contact details are shown to tenants.</div>
                    </div>

                    <div className="avatar-row">
                      <div className="big-av">{initials}</div>
                      <div className="av-info">
                        <div className="av-name">{profileData.full_name || 'Your Name'}</div>
                        <div className="av-email">{profileData.email}</div>
                        <div className="av-plan" style={{
                          background: isPro ? 'rgba(251,191,36,.12)' : '#F1F5F9',
                          color: isPro ? '#D97706' : '#64748B'
                        }}>
                          {isPro ? '⭐' : '🆓'} {planLabel} Plan · {userRoles.length} role{userRoles.length > 1 ? 's' : ''}
                        </div>
                      </div>
                      {!isPro && (
                        <a href="/landlord/upgrade" style={{ padding: '8px 14px', borderRadius: 9, background: 'linear-gradient(135deg,#2563EB,#6366F1)', color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(37,99,235,.25)', flexShrink: 0 }}>⭐ Upgrade</a>
                      )}
                    </div>

                    {/* Role switching */}
                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Switch Role</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {Object.entries(ROLE_INFO).map(([role, info]) => (
                          <button key={role} onClick={() => handleRoleSwitch(role)} style={{
                            padding: '8px 16px', borderRadius: 10,
                            border: `1.5px solid ${activeRole === role ? '#3B82F6' : '#E2E8F0'}`,
                            background: activeRole === role ? '#EFF6FF' : '#fff',
                            color: activeRole === role ? '#2563EB' : '#475569',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            fontFamily: "'Plus Jakarta Sans',sans-serif",
                            display: 'flex', alignItems: 'center', gap: 6,
                            opacity: userRoles.includes(role) ? 1 : 0.4,
                          }}>
                            {info.icon} {info.label}
                            {activeRole === role && <span style={{ fontSize: 10, background: '#2563EB', color: '#fff', borderRadius: 99, padding: '1px 6px', fontWeight: 700 }}>Active</span>}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 8 }}>
                        You have access to {userRoles.length} role{userRoles.length > 1 ? 's' : ''}. Click to switch dashboards.
                      </div>
                    </div>

                    <div className="field-row">
                      <div className="field">
                        <label>Full Name</label>
                        <input value={profileData.full_name} onChange={e => setProfileData(p => ({ ...p, full_name: e.target.value }))} placeholder="Your full name" />
                      </div>
                      <div className="field">
                        <label>Email Address</label>
                        <input value={profileData.email} disabled />
                        <div className="field-hint">Email cannot be changed here</div>
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>Phone Number</label>
                        <input value={profileData.phone} onChange={e => setProfileData(p => ({ ...p, phone: e.target.value }))} placeholder="+94 77 000 0000" />
                      </div>
                      <div className="field">
                        <label>Company / Agency <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span></label>
                        <input value={profileData.company} onChange={e => setProfileData(p => ({ ...p, company: e.target.value }))} placeholder="Your company name" />
                      </div>
                    </div>
                    <div className="field">
                      <label>Bio <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span></label>
                      <textarea value={profileData.bio} onChange={e => setProfileData(p => ({ ...p, bio: e.target.value }))} placeholder="A brief intro about you as a landlord..." />
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button className={`save-btn${profileSaved ? ' saved' : ''}`} onClick={saveProfile}>
                        {profileSaved ? '✓ Saved!' : 'Save Changes'}
                      </button>
                      {profileSaved && <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 600 }}>Profile updated successfully</span>}
                    </div>
                  </div>
                )}

                {/* ── NOTIFICATIONS TAB ── */}
                {activeTab === 'notifications' && (
                  <div className="settings-card">
                    <div className="sc-head">
                      <div className="sc-title">Notification Preferences</div>
                      <div className="sc-sub">Control which email alerts Rentura sends you.</div>
                    </div>
                    {([
                      { key: 'rent_due', name: 'Rent Due Reminders', desc: 'Get notified 3 days before rent is due for each unit.', ico: '💰' },
                      { key: 'maintenance', name: 'Maintenance Requests', desc: 'Instant alert when a tenant submits a new request.', ico: '🔧' },
                      { key: 'messages', name: 'New Messages', desc: 'Email notification when a tenant sends you a message.', ico: '💬' },
                      { key: 'lease_expiry', name: 'Lease Expiry Warnings', desc: 'Reminders 60 and 30 days before any lease expires.', ico: '⏳' },
                    ] as const).map(n => (
                      <div key={n.key} className="notif-row">
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{n.ico}</div>
                          <div><div className="notif-name">{n.name}</div><div className="notif-desc">{n.desc}</div></div>
                        </div>
                        <button className={`toggle${notifs[n.key] ? ' on' : ' off'}`} onClick={() => setNotifs(p => ({ ...p, [n.key]: !p[n.key] }))}>
                          <div className="toggle-knob" />
                        </button>
                      </div>
                    ))}

                    {/* Pro-only notification (locked for free) */}
                    <div style={{ padding: '14px 0', borderTop: '1px solid #F8FAFC', marginTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📊</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <div className="notif-name">Monthly Financial Summary</div>
                            <span style={{ fontSize: 10, fontWeight: 700, background: 'linear-gradient(135deg,#2563EB,#6366F1)', color: '#fff', padding: '1px 7px', borderRadius: 99 }}>PRO</span>
                          </div>
                          <div className="notif-desc">Auto-generated monthly PDF report sent to your email.</div>
                        </div>
                        {isPro
                          ? <button className="toggle on"><div className="toggle-knob" /></button>
                          : <button onClick={() => window.location.href = '/landlord/upgrade'} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#2563EB,#6366F1)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", whiteSpace: 'nowrap' }}>Unlock</button>
                        }
                      </div>
                    </div>

                    <div className="sc-divider" />
                    <button className={`save-btn${notifSaved ? ' saved' : ''}`} onClick={saveNotifs}>
                      {notifSaved ? '✓ Saved!' : 'Save Preferences'}
                    </button>
                  </div>
                )}

                {/* ── BILLING TAB ── */}
                {activeTab === 'billing' && (
                  <div className="settings-card">
                    <div className="sc-head">
                      <div className="sc-title">Billing & Plan</div>
                      <div className="sc-sub">
                        {isPro
                          ? `You are on the ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan. All Pro features are active.`
                          : 'You are currently on the Free plan. Upgrade anytime.'}
                      </div>
                    </div>

                    {/* ── PRO ACTIVE STATE ── */}
                    {isPro ? (
                      <>
                        <div className="pro-active-banner">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div className="pab-icon">⭐</div>
                            <div>
                              <div className="pab-title">You're on {plan.charAt(0).toUpperCase() + plan.slice(1)}!</div>
                              <div className="pab-sub">All Pro features are active on your account.</div>
                            </div>
                          </div>
                          <div className="pab-badge">✓ {planLabel} Active</div>
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Your Pro features</div>
                          <div className="pro-features-grid">
                            {['✓ Unlimited properties', '✓ Unlimited listings', '✓ Advanced analytics', '✓ CSV & PDF exports', '✓ Annual revenue trend', '✓ Property comparison', '✓ Priority support', '✓ Year-over-year trends'].map(f => (
                              <div key={f} className="pro-feat-item">{f}</div>
                            ))}
                          </div>
                        </div>
                        <div style={{ padding: '14px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>Manage your subscription</div>
                            <div style={{ fontSize: 12.5, color: '#64748B' }}>Cancel or change your plan anytime</div>
                          </div>
                          <a href="/landlord/upgrade" style={{ padding: '8px 16px', borderRadius: 9, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>Manage Plan →</a>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* ── FREE STATE ── */}
                        <div className="plan-grid">
                          <div className="plan-card current-free">
                            <div className="plan-pill" style={{ background: '#DCFCE7', color: '#16A34A' }}>✓ Current Plan</div>
                            <div className="plan-name">Free</div>
                            <div className="plan-price">$0 / month · forever</div>
                            {['3 properties', 'Rent tracker', 'Maintenance requests', 'Basic documents', '2 listings'].map(f => (
                              <div key={f} className="plan-feature"><span style={{ color: '#16A34A', fontSize: 12 }}>✓</span>{f}</div>
                            ))}
                          </div>
                          <div className="plan-card" style={{ background: 'linear-gradient(135deg,#1E3A5F,#1E1E4E)', border: '2px solid #3B82F6' }}>
                            <div className="plan-pill" style={{ background: 'linear-gradient(135deg,#2563EB,#6366F1)', color: '#fff' }}>⭐ Most Popular</div>
                            <div className="plan-name" style={{ color: '#F1F5F9' }}>Pro</div>
                            <div className="plan-price" style={{ color: '#93C5FD' }}>$9.99 / month</div>
                            {PRO_FEATURES.map(f => (
                              <div key={f} className="plan-feature" style={{ color: '#CBD5E1' }}><span style={{ color: '#60A5FA', fontSize: 12 }}>✓</span>{f}</div>
                            ))}
                            <button className="plan-upgrade-btn" onClick={() => window.location.href = '/landlord/upgrade'}>Upgrade to Pro →</button>
                          </div>
                        </div>
                        <div style={{ padding: 16, border: '1.5px dashed #E2E8F0', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 3 }}>Business — $24/month</div>
                            <div style={{ fontSize: 12.5, color: '#64748B' }}>Everything in Pro + team access, API & white-label branding</div>
                          </div>
                          <button className="outline-btn" style={{ whiteSpace: 'nowrap' }}>Contact Sales</button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ── SECURITY TAB ── */}
                {activeTab === 'security' && (
                  <div className="settings-card">
                    <div className="sc-head">
                      <div className="sc-title">Security</div>
                      <div className="sc-sub">Keep your account safe with a strong password.</div>
                    </div>
                    <div className="field">
                      <label>Current Password</label>
                      <input type="password" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} placeholder="Enter your current password" />
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>New Password</label>
                        <input type="password" value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} placeholder="Min. 8 characters" />
                        {pwForm.next.length > 0 && (
                          <div className="pw-strength">
                            {[1, 2, 3, 4].map(i => {
                              const len = pwForm.next.length
                              const active = (i === 1 && len >= 1) || (i === 2 && len >= 6) || (i === 3 && len >= 8 && /[A-Z]/.test(pwForm.next)) || (i === 4 && len >= 10 && /[!@#$%^&*]/.test(pwForm.next))
                              const color = i <= 2 ? '#F59E0B' : i === 3 ? '#3B82F6' : '#16A34A'
                              return <div key={i} className="pw-seg" style={{ background: active ? color : '#E2E8F0' }} />
                            })}
                          </div>
                        )}
                      </div>
                      <div className="field">
                        <label>Confirm New Password</label>
                        <input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} placeholder="Repeat new password" />
                      </div>
                    </div>
                    {pwText && (
                      <div className={`pw-msg-box ${pwStatus}`}>
                        <span>{pwStatus === 'ok' ? '✓' : '⚠'}</span>{pwText}
                      </div>
                    )}
                    <div style={{ marginTop: 16 }}>
                      <button className="save-btn" onClick={changePassword} style={{ opacity: pwLoading ? .8 : 1 }}>
                        {pwLoading ? '⏳ Updating...' : '🔒 Update Password'}
                      </button>
                    </div>
                    <div className="sc-divider" />

                    {/* 2FA — Pro feature */}
                    <div style={{ padding: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                            🔑 Two-Factor Authentication
                            <span style={{ fontSize: 10, fontWeight: 700, background: 'linear-gradient(135deg,#2563EB,#6366F1)', color: '#fff', padding: '2px 8px', borderRadius: 99 }}>PRO</span>
                          </div>
                          <div style={{ fontSize: 12.5, color: '#64748B' }}>Add an extra layer of security to your account.</div>
                        </div>
                        {isPro
                          ? <button style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#2563EB,#6366F1)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>Enable 2FA →</button>
                          : <button onClick={() => window.location.href = '/landlord/upgrade'} style={{ padding: '8px 14px', borderRadius: 9, border: '1.5px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", whiteSpace: 'nowrap' }}>⭐ Upgrade to unlock</button>
                        }
                      </div>
                    </div>

                    {/* Session info */}
                    <div style={{ padding: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, marginBottom: 16 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>🌐 Active Sessions</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Current device</div>
                          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Logged in · Active now</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, background: '#DCFCE7', color: '#16A34A', padding: '3px 10px', borderRadius: 99 }}>● Active</span>
                      </div>
                    </div>

                    <div className="danger-zone">
                      <div className="dz-title">⚠️ Danger Zone</div>
                      <div className="dz-sub">Permanently delete your account and all associated data. This action cannot be undone.</div>
                      {!deleteConfirm ? (
                        <button className="dz-btn" onClick={() => setDeleteConfirm(true)}>🗑 Delete My Account</button>
                      ) : (
                        <div className="dz-confirm">
                          <div className="dz-confirm-text">Are you sure? This will permanently delete your account and all data.</div>
                          <div className="dz-actions">
                            <button className="dz-btn-cancel" onClick={() => setDeleteConfirm(false)}>Cancel</button>
                            <button className="dz-btn-confirm" onClick={handleDeleteAccount}>Yes, Delete Everything</button>
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 8 }}>To fully remove your data, please contact support after signing out.</div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
