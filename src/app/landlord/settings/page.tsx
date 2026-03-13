'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type NotifSettings = { rent_due: boolean; maintenance: boolean; messages: boolean; lease_expiry: boolean }

export default function SettingsPage() {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [activeTab, setActiveTab]       = useState<'profile'|'notifications'|'billing'|'security'>('profile')
  const [userId, setUserId]             = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [notifSaved, setNotifSaved]     = useState(false)
  const [pwMsg, setPwMsg]               = useState('')
  const [pwLoading, setPwLoading]       = useState(false)
  const [openMaint, setOpenMaint]       = useState(0)

  const [profile, setProfile] = useState({
    full_name: '', email: '', phone: '', company: '', bio: ''
  })
  const [notifs, setNotifs] = useState<NotifSettings>({
    rent_due: true, maintenance: true, messages: true, lease_expiry: true
  })
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })

  const initials = profile.full_name
    ? profile.full_name.split(' ').map((n:string)=>n[0]).join('').toUpperCase().slice(0,2)
    : 'NN'

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      // Load from profiles table (source of truth)
      const { data: prof } = await supabase
        .from('profiles').select('full_name, email, phone').eq('id', user.id).single()

      setProfile({
        full_name: prof?.full_name || user.user_metadata?.full_name || '',
        email:     prof?.email     || user.email || '',
        phone:     prof?.phone     || user.user_metadata?.phone || '',
        company:   user.user_metadata?.company || '',
        bio:       user.user_metadata?.bio || '',
      })

      // Load saved notification preferences from auth metadata
      if (user.user_metadata?.notif_settings) {
        setNotifs(user.user_metadata.notif_settings)
      }

      // Open maintenance count
      const { data: props } = await supabase
        .from('properties').select('id').eq('landlord_id', user.id)
      const propIds = (props||[]).map((p:any)=>p.id)
      if (propIds.length > 0) {
        const { count } = await supabase
          .from('maintenance_requests')
          .select('id', { count: 'exact', head: true })
          .in('property_id', propIds).neq('status','resolved')
        setOpenMaint(count||0)
      }
    }
    load()
  }, [router])

  async function saveProfile() {
    if (!userId) return
    const supabase = createClient()
    // Save to profiles table (full_name, phone — confirmed columns)
    await supabase.from('profiles').update({
      full_name: profile.full_name,
      phone:     profile.phone,
    }).eq('id', userId)
    // Also update auth metadata
    await supabase.auth.updateUser({
      data: { full_name: profile.full_name, phone: profile.phone, company: profile.company, bio: profile.bio }
    })
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2500)
  }

  async function saveNotifs() {
    // Persist to auth metadata until user_settings table is added
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

  const tabs = [
    { id: 'profile',       label: 'Profile',        ico: '👤' },
    { id: 'notifications', label: 'Notifications',  ico: '🔔' },
    { id: 'billing',       label: 'Billing & Plan', ico: '💳' },
    { id: 'security',      label: 'Security',       ico: '🔒' },
  ] as const

  const pwStatus = pwMsg.startsWith('ok:') ? 'ok' : pwMsg.startsWith('err:') ? 'err' : ''
  const pwText   = pwMsg.replace(/^(ok|err):/, '')

  const PRO_FEATURES = [
    'Unlimited properties', 'Advanced analytics & reports',
    'CSV & PDF exports', 'Priority support',
    'Property comparison', 'Year-over-year trends',
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif}
        body{background:#F4F6FA}
        .shell{display:flex;min-height:100vh}

        /* SIDEBAR */
        .sidebar{width:260px;flex-shrink:0;background:#0F172A;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:200;box-shadow:4px 0 24px rgba(15,23,42,0.1);transition:transform .25s ease}
        .sb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:199}.sb-overlay.open{display:block}
        .sidebar.open{transform:translateX(0)!important}
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,0.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}.sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,0.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,0.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,0.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-badge{margin-left:auto;background:#EF4444;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:1px 7px}
        .sb-footer{border-top:1px solid rgba(255,255,255,0.07)}
        .sb-upgrade{margin:12px;padding:16px;border-radius:14px;background:linear-gradient(135deg,rgba(59,130,246,0.16),rgba(99,102,241,0.2));border:1px solid rgba(59,130,246,0.22)}
        .sb-up-title{font-size:13.5px;font-weight:700;color:#F1F5F9;margin-bottom:4px}
        .sb-up-sub{font-size:12px;color:#64748B;line-height:1.55;margin-bottom:12px}
        .sb-up-btn{width:100%;padding:9px;border-radius:9px;border:none;background:linear-gradient(135deg,#3B82F6,#6366F1);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .sb-user{padding:14px 18px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:11px}
        .sb-av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3B82F6,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
        .sb-uname{font-size:13px;font-weight:700;color:#E2E8F0}
        .sb-uplan{display:inline-block;font-size:10px;font-weight:700;color:#60A5FA;background:rgba(59,130,246,0.14);border:1px solid rgba(59,130,246,0.25);border-radius:5px;padding:1px 6px;margin-top:2px}

        /* MAIN */
        .main{margin-left:260px;flex:1;display:flex;flex-direction:column;min-height:100vh}
        .topbar{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;background:#fff;border-bottom:1px solid #E2E8F0;position:sticky;top:0;z-index:50;box-shadow:0 1px 4px rgba(15,23,42,0.04)}
        .tb-left{display:flex;align-items:center;gap:12px}
        .hamburger{display:none;background:none;border:none;font-size:20px;cursor:pointer;color:#475569;padding:4px}
        .breadcrumb{font-size:13px;color:#94A3B8;font-weight:500}.breadcrumb b{color:#0F172A;font-weight:700}
        .content{padding:28px 30px;flex:1;max-width:960px}

        /* LAYOUT */
        .settings-wrap{display:grid;grid-template-columns:210px 1fr;gap:22px;align-items:start}
        .tabs-col{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:10px;box-shadow:0 1px 4px rgba(15,23,42,0.04);position:sticky;top:78px}
        .stab{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;color:#64748B;transition:all .15s;border:none;background:none;font-family:'Plus Jakarta Sans',sans-serif;text-align:left;width:100%;margin-bottom:2px}
        .stab:hover{background:#F8FAFC;color:#0F172A}
        .stab.active{background:#EFF6FF;color:#2563EB}
        .stab-ico{font-size:16px;width:22px;text-align:center;flex-shrink:0}
        .stab-divider{height:1px;background:#F1F5F9;margin:8px 0}

        /* CARDS */
        .settings-card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:28px;box-shadow:0 1px 4px rgba(15,23,42,0.04)}
        .sc-head{margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid #F1F5F9}
        .sc-title{font-size:18px;font-weight:700;color:#0F172A;margin-bottom:4px}
        .sc-sub{font-size:13px;color:#94A3B8;line-height:1.5}
        .sc-divider{height:1px;background:#F1F5F9;margin:22px 0}

        /* AVATAR SECTION */
        .avatar-row{display:flex;align-items:center;gap:18px;padding:18px;background:#F8FAFC;border-radius:14px;border:1px solid #E2E8F0;margin-bottom:22px}
        .big-av{width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#2563EB,#6366F1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;flex-shrink:0;box-shadow:0 4px 14px rgba(37,99,235,0.28)}
        .av-info{flex:1}
        .av-name{font-size:16px;font-weight:700;color:#0F172A;margin-bottom:2px}
        .av-email{font-size:12.5px;color:#94A3B8}
        .av-plan{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;background:#F1F5F9;color:#64748B;border-radius:99px;padding:3px 10px;margin-top:6px}

        /* FORM FIELDS */
        .field{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
        .field label{font-size:12.5px;font-weight:700;color:#374151;letter-spacing:0.2px}
        .field input,.field textarea{padding:11px 14px;border-radius:10px;border:1.5px solid #E2E8F0;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;background:#fff;outline:none;transition:border-color .15s,box-shadow .15s}
        .field input:focus,.field textarea:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,0.1)}
        .field input:disabled{background:#F8FAFC;color:#94A3B8;cursor:not-allowed}
        .field textarea{resize:vertical;min-height:84px;line-height:1.5}
        .field-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .field-hint{font-size:11.5px;color:#94A3B8;margin-top:4px}

        /* BUTTONS */
        .save-btn{padding:11px 26px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 2px 10px rgba(37,99,235,0.28);transition:all .18s;display:inline-flex;align-items:center;gap:8px}
        .save-btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(37,99,235,0.35)}
        .save-btn.saved{background:linear-gradient(135deg,#16A34A,#15803D)}
        .outline-btn{padding:10px 20px;border-radius:10px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .outline-btn:hover{border-color:#CBD5E1;background:#F8FAFC}

        /* NOTIFICATION TOGGLES */
        .notif-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 0;border-bottom:1px solid #F8FAFC}
        .notif-row:last-child{border-bottom:none}
        .notif-name{font-size:14px;font-weight:600;color:#0F172A;margin-bottom:3px}
        .notif-desc{font-size:12.5px;color:#94A3B8;line-height:1.4}
        .toggle{width:46px;height:26px;border-radius:99px;border:none;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0;padding:0}
        .toggle.on{background:#2563EB}
        .toggle.off{background:#E2E8F0}
        .toggle-knob{width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:3px;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,0.18)}
        .toggle.on .toggle-knob{left:23px}
        .toggle.off .toggle-knob{left:3px}

        /* BILLING */
        .plan-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px}
        .plan-card{border:2px solid #E2E8F0;border-radius:14px;padding:20px;cursor:pointer;transition:all .15s;position:relative}
        .plan-card.current{border-color:#3B82F6;background:#EFF6FF}
        .plan-card:not(.current):hover{border-color:#CBD5E1;box-shadow:0 4px 16px rgba(15,23,42,0.07)}
        .plan-pill{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;border-radius:99px;padding:3px 10px;margin-bottom:10px}
        .plan-name{font-size:17px;font-weight:700;color:#0F172A;margin-bottom:2px}
        .plan-price{font-size:13px;color:#64748B;margin-bottom:14px}
        .plan-feature{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#475569;margin-bottom:5px}
        .plan-upgrade-btn{width:100%;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-top:14px;box-shadow:0 2px 8px rgba(37,99,235,0.25)}

        /* SECURITY */
        .pw-strength{display:flex;gap:4px;margin-top:6px}
        .pw-seg{height:3px;flex:1;border-radius:99px;background:#E2E8F0;transition:background .3s}
        .pw-msg-box{font-size:13px;margin-top:10px;padding:10px 14px;border-radius:9px;display:flex;align-items:center;gap:8px}
        .pw-msg-box.ok{background:#DCFCE7;color:#16A34A}
        .pw-msg-box.err{background:#FEE2E2;color:#DC2626}
        .danger-zone{border:1.5px solid #FCA5A5;border-radius:14px;padding:20px;margin-top:24px;background:#FFF8F8}
        .dz-title{font-size:14px;font-weight:700;color:#DC2626;margin-bottom:6px;display:flex;align-items:center;gap:7px}
        .dz-sub{font-size:13px;color:#64748B;margin-bottom:14px;line-height:1.5}
        .dz-btn{padding:9px 20px;border-radius:9px;border:1.5px solid #FCA5A5;background:#FEF2F2;color:#DC2626;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .dz-btn:hover{background:#FEE2E2;border-color:#F87171}

        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .skeleton{border-radius:8px;background:linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}

        @media(max-width:900px){.settings-wrap{grid-template-columns:1fr}.tabs-col{position:static;display:flex;flex-wrap:wrap;gap:4px;padding:8px}.stab{flex:1;min-width:110px;justify-content:center}.stab-divider{display:none}.plan-grid{grid-template-columns:1fr}}
        @media(max-width:768px){.sidebar{transform:translateX(-100%)}.main{margin-left:0}.hamburger{display:block}.content{padding:18px 16px}.topbar{padding:0 16px}.field-row{grid-template-columns:1fr}}
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
            <a href="/landlord/reports" className="sb-item"><span className="sb-ico">📊</span>Reports</a>
            <span className="sb-section">Management</span>
            <a href="/landlord/maintenance" className="sb-item">
              <span className="sb-ico">🔧</span>Maintenance
              {openMaint > 0 && <span className="sb-badge">{openMaint}</span>}
            </a>
            <a href="/landlord/documents" className="sb-item"><span className="sb-ico">📁</span>Documents</a>
            <a href="/landlord/messages" className="sb-item"><span className="sb-ico">💬</span>Messages</a>
            <a href="/landlord/listings" className="sb-item"><span className="sb-ico">📋</span>Listings</a>
            <span className="sb-section">Account</span>
            <a href="/landlord/settings" className="sb-item active"><span className="sb-ico">⚙️</span>Settings</a>
          </nav>
          <div className="sb-footer">
            <div className="sb-upgrade">
              <div className="sb-up-title">⭐ Upgrade to Pro</div>
              <div className="sb-up-sub">Unlimited properties & priority support.</div>
              <button className="sb-up-btn">See Plans →</button>
            </div>
            <div className="sb-user">
              <div className="sb-av">{initials}</div>
              <div><div className="sb-uname">{profile.full_name||'User'}</div><span className="sb-uplan">FREE</span></div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <div className="tb-left">
              <button className="hamburger" onClick={()=>setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Settings</b></div>
            </div>
            <button className="outline-btn" onClick={handleLogout}>🚪 Sign Out</button>
          </div>

          <div className="content">
            <div style={{marginBottom:24}}>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:30,fontWeight:400,color:'#0F172A',letterSpacing:-0.6,marginBottom:3}}>Settings</div>
              <div style={{fontSize:13.5,color:'#94A3B8'}}>Manage your account, preferences and subscription</div>
            </div>

            <div className="settings-wrap">
              {/* Tab nav */}
              <div className="tabs-col">
                {tabs.map(t => (
                  <button key={t.id} className={`stab${activeTab===t.id?' active':''}`} onClick={()=>setActiveTab(t.id)}>
                    <span className="stab-ico">{t.ico}</span>{t.label}
                  </button>
                ))}
                <div className="stab-divider"/>
                <button className="stab" style={{color:'#DC2626'}} onClick={handleLogout}>
                  <span className="stab-ico">🚪</span>Sign Out
                </button>
              </div>

              {/* Panel */}
              <div>

                {/* ── PROFILE ── */}
                {activeTab==='profile' && (
                  <div className="settings-card">
                    <div className="sc-head">
                      <div className="sc-title">Profile Information</div>
                      <div className="sc-sub">Your name and contact details are shown to tenants.</div>
                    </div>
                    {/* Avatar row */}
                    <div className="avatar-row">
                      <div className="big-av">{initials}</div>
                      <div className="av-info">
                        <div className="av-name">{profile.full_name||'Your Name'}</div>
                        <div className="av-email">{profile.email}</div>
                        <div className="av-plan">🆓 Free Plan</div>
                      </div>
                      <a href="/landlord/upgrade" style={{padding:'8px 16px',borderRadius:9,background:'linear-gradient(135deg,#2563EB,#6366F1)',color:'#fff',fontSize:12.5,fontWeight:700,textDecoration:'none',whiteSpace:'nowrap',boxShadow:'0 2px 8px rgba(37,99,235,0.25)'}}>⭐ Upgrade</a>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>Full Name</label>
                        <input value={profile.full_name} onChange={e=>setProfile(p=>({...p,full_name:e.target.value}))} placeholder="Your full name"/>
                      </div>
                      <div className="field">
                        <label>Email Address</label>
                        <input value={profile.email} disabled/>
                        <div className="field-hint">Email cannot be changed here</div>
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>Phone Number</label>
                        <input value={profile.phone} onChange={e=>setProfile(p=>({...p,phone:e.target.value}))} placeholder="+94 77 000 0000"/>
                      </div>
                      <div className="field">
                        <label>Company / Agency</label>
                        <input value={profile.company} onChange={e=>setProfile(p=>({...p,company:e.target.value}))} placeholder="Optional"/>
                      </div>
                    </div>
                    <div className="field">
                      <label>Bio</label>
                      <textarea value={profile.bio} onChange={e=>setProfile(p=>({...p,bio:e.target.value}))} placeholder="A brief intro about you as a landlord..."/>
                    </div>
                    <div style={{display:'flex',gap:10,alignItems:'center'}}>
                      <button className={`save-btn${profileSaved?' saved':''}`} onClick={saveProfile}>
                        {profileSaved ? '✓ Saved!' : 'Save Changes'}
                      </button>
                      {profileSaved && <span style={{fontSize:13,color:'#16A34A',fontWeight:600}}>Profile updated successfully</span>}
                    </div>
                  </div>
                )}

                {/* ── NOTIFICATIONS ── */}
                {activeTab==='notifications' && (
                  <div className="settings-card">
                    <div className="sc-head">
                      <div className="sc-title">Notification Preferences</div>
                      <div className="sc-sub">Control which email alerts Rentura sends you.</div>
                    </div>
                    {([
                      { key:'rent_due',     name:'Rent Due Reminders',    desc:'Get notified 3 days before rent is due for each unit.',    ico:'💰' },
                      { key:'maintenance',  name:'Maintenance Requests',  desc:'Instant alert when a tenant submits a new request.',        ico:'🔧' },
                      { key:'messages',     name:'New Messages',          desc:'Email notification when a tenant sends you a message.',     ico:'💬' },
                      { key:'lease_expiry', name:'Lease Expiry Warnings', desc:'Reminders 60 days and 30 days before any lease expires.',  ico:'⏳' },
                    ] as const).map(n => (
                      <div key={n.key} className="notif-row">
                        <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                          <div style={{width:36,height:36,borderRadius:10,background:'#F8FAFC',border:'1px solid #E2E8F0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,flexShrink:0}}>{n.ico}</div>
                          <div>
                            <div className="notif-name">{n.name}</div>
                            <div className="notif-desc">{n.desc}</div>
                          </div>
                        </div>
                        <button className={`toggle${notifs[n.key]?' on':' off'}`} onClick={()=>setNotifs(p=>({...p,[n.key]:!p[n.key]}))}>
                          <div className="toggle-knob"/>
                        </button>
                      </div>
                    ))}
                    <div className="sc-divider"/>
                    <button className={`save-btn${notifSaved?' saved':''}`} onClick={saveNotifs}>
                      {notifSaved ? '✓ Saved!' : 'Save Preferences'}
                    </button>
                  </div>
                )}

                {/* ── BILLING ── */}
                {activeTab==='billing' && (
                  <div className="settings-card">
                    <div className="sc-head">
                      <div className="sc-title">Billing & Plan</div>
                      <div className="sc-sub">You are currently on the Free plan. Upgrade anytime.</div>
                    </div>
                    <div className="plan-grid">
                      {/* Free */}
                      <div className="plan-card current">
                        <div className="plan-pill" style={{background:'#DCFCE7',color:'#16A34A'}}>✓ Current Plan</div>
                        <div className="plan-name">Free</div>
                        <div className="plan-price">$0 / month · forever</div>
                        {['1 property','Up to 10 units','Rent tracker','Maintenance requests','Basic documents','2 listings'].map(f=>(
                          <div key={f} className="plan-feature"><span style={{color:'#16A34A',fontSize:13}}>✓</span>{f}</div>
                        ))}
                      </div>
                      {/* Pro */}
                      <div className="plan-card" style={{background:'linear-gradient(135deg,#1E3A5F,#1E1E4E)',border:'2px solid #3B82F6'}}>
                        <div className="plan-pill" style={{background:'linear-gradient(135deg,#2563EB,#6366F1)',color:'#fff'}}>⭐ Most Popular</div>
                        <div className="plan-name" style={{color:'#F1F5F9'}}>Pro</div>
                        <div className="plan-price" style={{color:'#93C5FD'}}>$12 / month · billed monthly</div>
                        {PRO_FEATURES.map(f=>(
                          <div key={f} className="plan-feature" style={{color:'#CBD5E1'}}><span style={{color:'#60A5FA',fontSize:13}}>✓</span>{f}</div>
                        ))}
                        <button className="plan-upgrade-btn" onClick={()=>router.push('/landlord/upgrade')}>Upgrade to Pro →</button>
                      </div>
                    </div>
                    {/* Business teaser */}
                    <div style={{padding:18,border:'1.5px dashed #E2E8F0',borderRadius:14,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
                      <div>
                        <div style={{fontSize:15,fontWeight:700,color:'#0F172A',marginBottom:3}}>Business — $29/month</div>
                        <div style={{fontSize:12.5,color:'#64748B'}}>Everything in Pro + team access, API & white-label branding</div>
                      </div>
                      <button className="outline-btn" style={{whiteSpace:'nowrap'}}>Contact Sales</button>
                    </div>
                  </div>
                )}

                {/* ── SECURITY ── */}
                {activeTab==='security' && (
                  <div className="settings-card">
                    <div className="sc-head">
                      <div className="sc-title">Security</div>
                      <div className="sc-sub">Keep your account safe with a strong password.</div>
                    </div>
                    <div className="field">
                      <label>Current Password</label>
                      <input type="password" value={pwForm.current} onChange={e=>setPwForm(p=>({...p,current:e.target.value}))} placeholder="Enter your current password"/>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>New Password</label>
                        <input type="password" value={pwForm.next} onChange={e=>setPwForm(p=>({...p,next:e.target.value}))} placeholder="Min. 8 characters"/>
                        {pwForm.next.length > 0 && (
                          <div className="pw-strength">
                            {[1,2,3,4].map(i => {
                              const len = pwForm.next.length
                              const active = (i===1&&len>=1)||(i===2&&len>=6)||(i===3&&len>=8&&/[A-Z]/.test(pwForm.next))||(i===4&&len>=10&&/[!@#$%^&*]/.test(pwForm.next))
                              const color = i<=2?'#F59E0B':i===3?'#3B82F6':'#16A34A'
                              return <div key={i} className="pw-seg" style={{background:active?color:'#E2E8F0'}}/>
                            })}
                          </div>
                        )}
                      </div>
                      <div className="field">
                        <label>Confirm New Password</label>
                        <input type="password" value={pwForm.confirm} onChange={e=>setPwForm(p=>({...p,confirm:e.target.value}))} placeholder="Repeat new password"/>
                      </div>
                    </div>
                    {pwText && (
                      <div className={`pw-msg-box ${pwStatus}`}>
                        <span>{pwStatus==='ok'?'✓':'⚠'}</span>{pwText}
                      </div>
                    )}
                    <div style={{marginTop:18}}>
                      <button className="save-btn" onClick={changePassword} style={{opacity:pwLoading?0.8:1}}>
                        {pwLoading ? '⏳ Updating...' : '🔒 Update Password'}
                      </button>
                    </div>
                    <div className="sc-divider"/>
                    <div style={{padding:14,background:'#F8FAFC',borderRadius:12,border:'1px solid #E2E8F0',marginBottom:16}}>
                      <div style={{fontSize:13.5,fontWeight:700,color:'#0F172A',marginBottom:4}}>🔑 Two-Factor Authentication</div>
                      <div style={{fontSize:12.5,color:'#64748B',marginBottom:12}}>Add an extra layer of security to your account.</div>
                      <div style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11.5,fontWeight:700,background:'linear-gradient(135deg,#2563EB,#6366F1)',color:'#fff',padding:'3px 12px',borderRadius:99}}>⭐ Pro Feature</div>
                    </div>
                    <div className="danger-zone">
                      <div className="dz-title">⚠️ Danger Zone</div>
                      <div className="dz-sub">Permanently delete your account and all associated data including properties, tenants, and documents. This action cannot be undone.</div>
                      <button className="dz-btn" onClick={async () => {
                        const confirmed = window.confirm(
                          'Are you sure? This will permanently delete your account and all data. This cannot be undone.'
                        )
                        if (!confirmed) return
                        const supabase = createClient()
                        await supabase.auth.signOut()
                        router.push('/login')
                      }}>🗑 Delete My Account</button>
                      <div style={{fontSize:11.5,color:'#94A3B8',marginTop:8}}>
                        To fully remove your data, please contact support after signing out.
                      </div>
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
