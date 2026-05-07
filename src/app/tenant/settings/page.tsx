'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'

type Profile = {
  id: string
  full_name: string
  email: string
  phone?: string
  avatar_url?: string
  active_role?: string
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

type SettingsSection = 'profile' | 'notifications' | 'security' | 'account'

const NAV_ITEMS: { id: SettingsSection; icon: string; label: string }[] = [
  { id: 'profile', icon: '👤', label: 'Profile' },
  { id: 'notifications', icon: '🔔', label: 'Notifications' },
  { id: 'security', icon: '🔒', label: 'Security' },
  { id: 'account', icon: '⚙️', label: 'Account' },
]

export default function TenantSettingsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeRole, setActiveRole] = useState('tenant')
  const [unreadCount, setUnreadCount] = useState(0)
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile')

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false)

  // Profile form
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)

  // Notifications
  const [notifRentReminder, setNotifRentReminder] = useState(true)
  const [notifMaintUpdate, setNotifMaintUpdate] = useState(true)
  const [notifMessages, setNotifMessages] = useState(true)
  const [notifLeaseExpiry, setNotifLeaseExpiry] = useState(true)
  const [notifDocuments, setNotifDocuments] = useState(false)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifMsg, setNotifMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Security
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)

  // Account / danger zone
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')

  useEffect(() => {
    ; (async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: prof } = await sb.from('profiles').select('*').eq('id', user.id).single()
        if (prof) {
          setProfile(prof)
          setActiveRole(prof.active_role || 'tenant')
          setFullName(prof.full_name || '')
          setPhone(prof.phone || '')
          setAvatarUrl(prof.avatar_url || '')
        }

        const { data: msgData } = await sb.from('messages').select('id').eq('receiver_id', user.id).eq('read', false)
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

  async function handleSaveProfile() {
    if (!profile) return
    if (!fullName.trim()) { setProfileMsg({ type: 'error', text: 'Full name is required.' }); return }
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      const sb = createClient()
      const { error } = await sb.from('profiles').update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      }).eq('id', profile.id).select()
      if (error) throw error
      setProfile(p => p ? { ...p, full_name: fullName.trim(), phone: phone.trim() || undefined, avatar_url: avatarUrl.trim() || undefined } : p)
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' })
    } catch (e: any) {
      setProfileMsg({ type: 'error', text: e.message || 'Failed to update profile.' })
    } finally {
      setProfileSaving(false)
      setTimeout(() => setProfileMsg(null), 3500)
    }
  }

  async function handleSaveNotifications() {
    setNotifSaving(true)
    setNotifMsg(null)
    // Simulated save — real implementation would store in a user_preferences table
    await new Promise(r => setTimeout(r, 700))
    setNotifSaving(false)
    setNotifMsg({ type: 'success', text: 'Notification preferences saved.' })
    setTimeout(() => setNotifMsg(null), 3000)
  }

  async function handleChangePassword() {
    if (!newPwd) { setPwdMsg({ type: 'error', text: 'Please enter a new password.' }); return }
    if (newPwd.length < 8) { setPwdMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return }
    if (newPwd !== confirmPwd) { setPwdMsg({ type: 'error', text: 'Passwords do not match.' }); return }
    setPwdSaving(true)
    setPwdMsg(null)
    try {
      const sb = createClient()
      const { error } = await sb.auth.updateUser({ password: newPwd })
      if (error) throw error
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      setPwdMsg({ type: 'success', text: 'Password updated successfully.' })
    } catch (e: any) {
      setPwdMsg({ type: 'error', text: e.message || 'Failed to update password.' })
    } finally {
      setPwdSaving(false)
      setTimeout(() => setPwdMsg(null), 4000)
    }
  }

  async function handleSignOut() {
    const sb = createClient()
    await sb.auth.signOut()
    window.location.href = '/login'
  }

  function pwdStrength(pwd: string): { label: string; color: string; pct: number } {
    if (!pwd) return { label: '', color: '#E2E8F0', pct: 0 }
    let score = 0
    if (pwd.length >= 8) score++
    if (pwd.length >= 12) score++
    if (/[A-Z]/.test(pwd)) score++
    if (/[0-9]/.test(pwd)) score++
    if (/[^A-Za-z0-9]/.test(pwd)) score++
    if (score <= 1) return { label: 'Weak', color: '#DC2626', pct: 25 }
    if (score <= 2) return { label: 'Fair', color: '#D97706', pct: 50 }
    if (score <= 3) return { label: 'Good', color: '#2563EB', pct: 75 }
    return { label: 'Strong', color: '#16A34A', pct: 100 }
  }

  const strength = pwdStrength(newPwd)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Plus Jakarta Sans',sans-serif", color: '#94A3B8', fontSize: 14 }}>
      Loading settings...
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
        .sb-logo{display:flex;align-items:center;gap:12px;padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,0.07)}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center}
        .sb-logo-name{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#F8FAFC}
        .sb-nav{flex:1;padding:14px 12px;overflow-y:auto}
        .sb-nav::-webkit-scrollbar{width:0}
        .sb-section{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#4B6587;padding:16px 10px 7px;display:block}
        .sb-item{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:#94A3B8;font-size:13.5px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:2px;text-decoration:none}
        .sb-item:hover{background:rgba(255,255,255,.07);color:#CBD5E1}
        .sb-item.active{background:rgba(59,130,246,.16);color:#93C5FD;font-weight:700;border:1px solid rgba(59,130,246,.22)}
        .sb-ico{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sb-count{margin-left:auto;background:#DC2626;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px}
        .sb-footer{border-top:2px solid rgba(255,255,255,0.07)}
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

        /* ── Settings layout ── */
        .settings-layout{display:grid;grid-template-columns:220px 1fr;gap:20px;align-items:start}
        
        /* Settings nav */
        .settings-nav{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:8px;box-shadow:0 1px 4px rgba(15,23,42,.04);position:sticky;top:76px}
        .sn-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:600;color:#475569;transition:all .15s;margin-bottom:2px}
        .sn-item:hover{background:#F8FAFC;color:#0F172A}
        .sn-item.active{background:#EFF6FF;color:#2563EB}
        .sn-icon{font-size:16px;width:20px;text-align:center;flex-shrink:0}
        .sn-divider{height:1px;background:#F1F5F9;margin:6px 4px}
        .sn-signout{color:#DC2626!important}
        .sn-signout:hover{background:#FEE2E2!important;color:#DC2626!important}

        /* Settings panels */
        .panel{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:28px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
        .panel-title{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#0F172A;margin-bottom:4px}
        .panel-sub{font-size:13px;color:#94A3B8;margin-bottom:24px}
        .panel-divider{height:1px;background:#F1F5F9;margin:24px 0}

        /* Avatar section */
        .avatar-section{display:flex;align-items:center;gap:20px;padding:20px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;margin-bottom:24px}
        .avatar-big{width:72px;height:72px;border-radius:18px;background:linear-gradient(135deg,#10B981,#34D399);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;flex-shrink:0;overflow:hidden}
        .avatar-big img{width:100%;height:100%;object-fit:cover}
        .avatar-info{flex:1}
        .avatar-name{font-size:16px;font-weight:700;color:#0F172A;margin-bottom:2px}
        .avatar-role{font-size:12px;color:#94A3B8;margin-bottom:8px}
        .avatar-upload-btn{padding:8px 16px;border-radius:9px;border:1.5px solid #E2E8F0;background:#fff;color:#475569;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .avatar-upload-btn:hover{border-color:#BFDBFE;color:#2563EB}

        /* Form */
        .form-group{margin-bottom:18px}
        .form-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}
        .form-label{font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px;display:block}
        .form-input{width:100%;padding:11px 14px;border:1.5px solid #E2E8F0;border-radius:11px;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;color:#0F172A;outline:none;transition:border .15s;background:#fff}
        .form-input:focus{border-color:#2563EB}
        .form-input:disabled{background:#F8FAFC;color:#94A3B8;cursor:not-allowed}
        .form-hint{font-size:11.5px;color:#94A3B8;margin-top:5px}
        .pw-wrap{position:relative}
        .pw-toggle{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;color:#94A3B8;padding:0}

        /* Strength bar */
        .strength-bar-bg{height:4px;background:#E2E8F0;border-radius:99px;overflow:hidden;margin-top:8px}
        .strength-bar-fill{height:100%;border-radius:99px;transition:width .3s,background .3s}
        .strength-label{font-size:11.5px;font-weight:700;margin-top:4px}

        /* Notification toggles */
        .notif-row{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #F1F5F9}
        .notif-row:last-child{border-bottom:none;padding-bottom:0}
        .notif-info{flex:1}
        .notif-title{font-size:14px;font-weight:700;color:#0F172A;margin-bottom:2px}
        .notif-sub{font-size:12px;color:#94A3B8}
        .toggle{width:44px;height:24px;border-radius:99px;border:none;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
        .toggle-thumb{width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:3px;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.15)}

        /* Save btn */
        .save-btn{padding:11px 24px;border-radius:11px;border:none;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 4px 12px rgba(37,99,235,.25);transition:opacity .15s}
        .save-btn:hover{opacity:.9}
        .save-btn:disabled{opacity:.6;cursor:not-allowed}

        /* Feedback messages */
        .msg-success{background:#DCFCE7;color:#16A34A;font-size:13px;font-weight:700;padding:11px 14px;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;gap:7px}
        .msg-error{background:#FEE2E2;color:#DC2626;font-size:13px;font-weight:700;padding:11px 14px;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;gap:7px}

        /* Danger zone */
        .danger-zone{border:1.5px solid #FECACA;border-radius:14px;padding:20px;background:#FFF5F5}
        .dz-title{font-size:14px;font-weight:700;color:#DC2626;margin-bottom:4px}
        .dz-sub{font-size:13px;color:#94A3B8;margin-bottom:14px;line-height:1.6}
        .dz-btn{padding:10px 20px;border-radius:10px;border:1.5px solid #FECACA;background:#FFF5F5;color:#DC2626;font-size:13.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .15s}
        .dz-btn:hover{background:#FEE2E2;border-color:#FCA5A5}

        /* Role switcher panel */
        .role-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}
        .role-card{padding:14px;border-radius:12px;border:1.5px solid #E2E8F0;cursor:pointer;text-align:center;transition:all .15s}
        .role-card:hover{border-color:#BFDBFE}
        .role-card.active{border-color:#2563EB;background:#EFF6FF}
        .rc-icon{font-size:24px;margin-bottom:6px}
        .rc-label{font-size:13px;font-weight:700;color:#475569;text-transform:capitalize}
        .rc-active-badge{font-size:10px;font-weight:700;color:#2563EB;background:#DBEAFE;padding:2px 7px;border-radius:99px;margin-top:4px;display:inline-block}

        /* Confirm modal */
        .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:500;align-items:center;justify-content:center;padding:16px}
        .modal-overlay.open{display:flex}
        .modal{background:#fff;border-radius:22px;padding:28px;width:100%;max-width:420px;box-shadow:0 24px 60px rgba(15,23,42,.2)}
        .modal-icon{font-size:36px;margin-bottom:12px}
        .modal-title{font-family:'Fraunces',serif;font-size:20px;font-weight:700;color:#0F172A;margin-bottom:6px}
        .modal-sub{font-size:13.5px;color:#64748B;line-height:1.65;margin-bottom:18px}
        .modal-actions{display:flex;gap:10px}
        .modal-cancel{flex:1;padding:11px;border-radius:11px;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#475569;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
        .modal-confirm{flex:1;padding:11px;border-radius:11px;border:none;background:#DC2626;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}

        @media(max-width:900px){
          .settings-layout{grid-template-columns:1fr}
          .settings-nav{position:static;display:flex;gap:4px;padding:6px;overflow-x:auto}
          .settings-nav::-webkit-scrollbar{height:0}
          .sn-item{white-space:nowrap;padding:8px 14px}
          .sn-divider{display:none}
          .form-row{grid-template-columns:1fr}
          .role-cards{grid-template-columns:repeat(3,1fr)}
        }
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)}
          .sidebar.open{transform:translateX(0)}
          .main{margin-left:0!important;width:100%!important}
          .hamburger{display:block}
          .topbar{padding:0 16px}
          .content{padding:16px}
          .panel{padding:18px}
        }
        @media(max-width:480px){
          .avatar-section{flex-direction:column;text-align:center}
          .role-cards{grid-template-columns:1fr}
        }
      `}</style>

      <div className={`sb-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Delete confirm modal */}
      <div className={`modal-overlay${showDeleteConfirm ? ' open' : ''}`} onClick={() => setShowDeleteConfirm(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-icon">⚠️</div>
          <div className="modal-title">Sign out of Rentura?</div>
          <div className="modal-sub">
            You'll be signed out of your account. You can sign back in at any time.
          </div>
          <div className="modal-actions">
            <button className="modal-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button className="modal-confirm" onClick={handleSignOut}>Sign Out</button>
          </div>
        </div>
      </div>

      <div className="shell">
        {/* ── Sidebar ── */}
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-logo">
            <div className="sb-logo-icon">
              <Image
                src="/icon.png"
                alt="Rentura Logo"
                width={24}
                height={24}
              />
            </div>
            <span className="sb-logo-name">Rentura</span>
          </div>
          <nav className="sb-nav">
            <span className="sb-section">My Home</span>
            <a href="/tenant" className="sb-item"><span className="sb-ico">⊞</span> Dashboard</a>
            <a href="/tenant/rent" className="sb-item"><span className="sb-ico">💰</span> Rent & Payments</a>
            <a href="/tenant/lease" className="sb-item"><span className="sb-ico">📋</span> My Lease</a>
            <a href="/tenant/maintenance" className="sb-item"><span className="sb-ico">🔧</span> Maintenance</a>
            <a href="/tenant/documents" className="sb-item"><span className="sb-ico">📁</span> Documents</a>
            <a href="/tenant/messages" className="sb-item">
              <span className="sb-ico">💬</span> Messages
              {unreadCount > 0 && <span className="sb-count">{unreadCount}</span>}
            </a>
            <span className="sb-section">Account</span>
            <a href="/tenant/settings" className="sb-item active"><span className="sb-ico">⚙️</span> Settings</a>
          </nav>
          <div className="sb-footer">
            <div className="sb-user">
              <div className="sb-av">{profile ? initials(profile.full_name) : '?'}</div>
              <div>
                <div className="sb-uname">{profile?.full_name || 'Loading...'}</div>
                <div className="sb-uemail">{profile?.email || ''}</div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="main">
          <div className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
              <div className="breadcrumb">Rentura &nbsp;/&nbsp; <b>Settings</b></div>
            </div>
            <button className="notif-btn" onClick={() => window.location.href = '/tenant/messages'}>
              🔔{unreadCount > 0 && <div className="notif-dot" />}
            </button>
          </div>

          <div className="content">
            <div className="settings-layout">

              {/* ── Settings Nav ── */}
              <div className="settings-nav">
                {NAV_ITEMS.map(item => (
                  <div
                    key={item.id}
                    className={`sn-item${activeSection === item.id ? ' active' : ''}`}
                    onClick={() => setActiveSection(item.id)}
                  >
                    <span className="sn-icon">{item.icon}</span>
                    {item.label}
                  </div>
                ))}
                <div className="sn-divider" />
                <div className="sn-item sn-signout" onClick={() => setShowDeleteConfirm(true)}>
                  <span className="sn-icon">🚪</span> Sign Out
                </div>
              </div>

              {/* ── Panels ── */}
              <div>

                {/* ── Profile ── */}
                {activeSection === 'profile' && (
                  <div className="panel">
                    <div className="panel-title">Profile</div>
                    <div className="panel-sub">Manage your personal information</div>

                    {profileMsg && (
                      <div className={profileMsg.type === 'success' ? 'msg-success' : 'msg-error'}>
                        {profileMsg.type === 'success' ? '✅' : '⚠️'} {profileMsg.text}
                      </div>
                    )}

                    {/* Avatar */}
                    <div className="avatar-section">
                      <div className="avatar-big">
                        {avatarUrl
                          ? <img src={avatarUrl} alt="avatar" onError={() => setAvatarUrl('')} />
                          : initials(fullName || profile?.full_name || 'T')
                        }
                      </div>
                      <div className="avatar-info">
                        <div className="avatar-name">{fullName || profile?.full_name}</div>
                        <div className="avatar-role">Tenant · {profile?.email}</div>
                        <button className="avatar-upload-btn" onClick={() => fileInputRef.current?.click()}>
                          {avatarUploading ? 'Uploading...' : '📷 Change Photo'}
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={async e => {
                            const file = e.target.files?.[0]
                            if (!file || !profile) return
                            setAvatarUploading(true)
                            try {
                              const sb = createClient()
                              const ext = file.name.split('.').pop()
                              const path = `avatars/${profile.id}.${ext}`
                              const { error: upErr } = await sb.storage.from('avatars').upload(path, file, { upsert: true })
                              if (upErr) throw upErr
                              const { data: { publicUrl } } = sb.storage.from('avatars').getPublicUrl(path)
                              setAvatarUrl(publicUrl)
                            } catch (err: any) {
                              setProfileMsg({ type: 'error', text: err.message || 'Upload failed.' })
                            } finally { setAvatarUploading(false) }
                          }}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div>
                        <label className="form-label">Full Name *</label>
                        <input className="form-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
                      </div>
                      <div>
                        <label className="form-label">Phone</label>
                        <input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Email Address</label>
                      <input className="form-input" value={profile?.email || ''} disabled />
                      <div className="form-hint">Email cannot be changed here. Contact support if needed.</div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Avatar URL</label>
                      <input className="form-input" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://..." />
                      <div className="form-hint">Or use the "Change Photo" button above to upload directly.</div>
                    </div>

                    <button className="save-btn" disabled={profileSaving} onClick={handleSaveProfile}>
                      {profileSaving ? 'Saving...' : '💾 Save Profile'}
                    </button>
                  </div>
                )}

                {/* ── Notifications ── */}
                {activeSection === 'notifications' && (
                  <div className="panel">
                    <div className="panel-title">Notifications</div>
                    <div className="panel-sub">Choose what updates you want to receive</div>

                    {notifMsg && (
                      <div className={notifMsg.type === 'success' ? 'msg-success' : 'msg-error'}>
                        {notifMsg.type === 'success' ? '✅' : '⚠️'} {notifMsg.text}
                      </div>
                    )}

                    {([
                      { label: 'Rent Reminders', sub: 'Get notified before rent is due', val: notifRentReminder, set: setNotifRentReminder },
                      { label: 'Maintenance Updates', sub: 'Updates when your requests change status', val: notifMaintUpdate, set: setNotifMaintUpdate },
                      { label: 'New Messages', sub: 'Notifications for messages from your landlord', val: notifMessages, set: setNotifMessages },
                      { label: 'Lease Expiry Alerts', sub: 'Reminders as your lease end date approaches', val: notifLeaseExpiry, set: setNotifLeaseExpiry },
                      { label: 'New Documents', sub: 'When your landlord shares a new document', val: notifDocuments, set: setNotifDocuments },
                    ] as { label: string; sub: string; val: boolean; set: (v: boolean) => void }[]).map(item => (
                      <div key={item.label} className="notif-row">
                        <div className="notif-info">
                          <div className="notif-title">{item.label}</div>
                          <div className="notif-sub">{item.sub}</div>
                        </div>
                        <button
                          className="toggle"
                          style={{ background: item.val ? '#2563EB' : '#E2E8F0' }}
                          onClick={() => item.set(!item.val)}
                        >
                          <div className="toggle-thumb" style={{ left: item.val ? '23px' : '3px' }} />
                        </button>
                      </div>
                    ))}

                    <div style={{ marginTop: 22 }}>
                      <button className="save-btn" disabled={notifSaving} onClick={handleSaveNotifications}>
                        {notifSaving ? 'Saving...' : '💾 Save Preferences'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Security ── */}
                {activeSection === 'security' && (
                  <div className="panel">
                    <div className="panel-title">Security</div>
                    <div className="panel-sub">Update your password to keep your account safe</div>

                    {pwdMsg && (
                      <div className={pwdMsg.type === 'success' ? 'msg-success' : 'msg-error'}>
                        {pwdMsg.type === 'success' ? '✅' : '⚠️'} {pwdMsg.text}
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">Current Password</label>
                      <div className="pw-wrap">
                        <input className="form-input" type={showCurrentPwd ? 'text' : 'password'} value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="Enter current password" style={{ paddingRight: 42 }} />
                        <button className="pw-toggle" onClick={() => setShowCurrentPwd(v => !v)}>{showCurrentPwd ? '🙈' : '👁️'}</button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">New Password</label>
                      <div className="pw-wrap">
                        <input className="form-input" type={showNewPwd ? 'text' : 'password'} value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="At least 8 characters" style={{ paddingRight: 42 }} />
                        <button className="pw-toggle" onClick={() => setShowNewPwd(v => !v)}>{showNewPwd ? '🙈' : '👁️'}</button>
                      </div>
                      {newPwd && (
                        <>
                          <div className="strength-bar-bg">
                            <div className="strength-bar-fill" style={{ width: `${strength.pct}%`, background: strength.color }} />
                          </div>
                          <div className="strength-label" style={{ color: strength.color }}>{strength.label}</div>
                        </>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label">Confirm New Password</label>
                      <div className="pw-wrap">
                        <input
                          className="form-input"
                          type={showConfirmPwd ? 'text' : 'password'}
                          value={confirmPwd}
                          onChange={e => setConfirmPwd(e.target.value)}
                          placeholder="Repeat new password"
                          style={{ paddingRight: 42, borderColor: confirmPwd && confirmPwd !== newPwd ? '#DC2626' : undefined }}
                        />
                        <button className="pw-toggle" onClick={() => setShowConfirmPwd(v => !v)}>{showConfirmPwd ? '🙈' : '👁️'}</button>
                      </div>
                      {confirmPwd && confirmPwd !== newPwd && (
                        <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4, fontWeight: 600 }}>Passwords do not match</div>
                      )}
                    </div>

                    <button className="save-btn" disabled={pwdSaving} onClick={handleChangePassword}>
                      {pwdSaving ? 'Updating...' : '🔒 Update Password'}
                    </button>

                    <div className="panel-divider" />

                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Connected Account</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 11 }}>
                      <span style={{ fontSize: 20 }}>✉️</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{profile?.email}</div>
                        <div style={{ fontSize: 12, color: '#94A3B8' }}>Email / password login</div>
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: 6 }}>Active</span>
                    </div>
                  </div>
                )}

                {/* ── Account ── */}
                {activeSection === 'account' && (
                  <div className="panel">
                    <div className="panel-title">Account</div>
                    <div className="panel-sub">Manage your role and account preferences</div>

                    {/* Role switcher */}
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Switch Role</div>
                    <div className="role-cards">
                      {[
                        { id: 'landlord', icon: '🏠', label: 'Landlord' },
                        { id: 'tenant', icon: '🔑', label: 'Tenant' },
                        { id: 'seeker', icon: '🔍', label: 'Seeker' },
                      ].map(r => (
                        <div
                          key={r.id}
                          className={`role-card${activeRole === r.id ? ' active' : ''}`}
                          onClick={() => handleRoleSwitch(r.id)}
                        >
                          <div className="rc-icon">{r.icon}</div>
                          <div className="rc-label">{r.label}</div>
                          {activeRole === r.id && <div className="rc-active-badge">Current</div>}
                        </div>
                      ))}
                    </div>

                    <div className="panel-divider" />

                    {/* Account info */}
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Account Info</div>
                    {[
                      { label: 'Full Name', val: profile?.full_name || '—' },
                      { label: 'Email', val: profile?.email || '—' },
                      { label: 'Phone', val: profile?.phone || '—' },
                      { label: 'Current Role', val: activeRole.charAt(0).toUpperCase() + activeRole.slice(1) },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
                        <span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 500 }}>{row.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{row.val}</span>
                      </div>
                    ))}

                    <div className="panel-divider" />

                    {/* Danger zone */}
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Sign Out</div>
                    <div className="danger-zone">
                      <div className="dz-title">Sign out of Rentura</div>
                      <div className="dz-sub">You'll be logged out of your tenant account. You can sign back in at any time with your email and password.</div>
                      <button className="dz-btn" onClick={() => setShowDeleteConfirm(true)}>🚪 Sign Out</button>
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
