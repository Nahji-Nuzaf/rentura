'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const roles = [
  { id: 'landlord', label: 'Landlord', emoji: '🏠', desc: 'I own or manage properties' },
  { id: 'tenant', label: 'Tenant', emoji: '🔑', desc: 'I rent a property' },
  { id: 'seeker', label: 'Seeker', emoji: '🔍', desc: 'Looking for a rental' },
]

function pwdStrength(pwd: string): { label: string; color: string; pct: number; level: number } {
  if (!pwd) return { label: '', color: '#E2E8F0', pct: 0, level: 0 }
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  if (score <= 1) return { label: 'Weak', color: '#EF4444', pct: 20, level: 1 }
  if (score === 2) return { label: 'Fair', color: '#F97316', pct: 45, level: 2 }
  if (score === 3) return { label: 'Good', color: '#EAB308', pct: 70, level: 3 }
  if (score === 4) return { label: 'Strong', color: '#22C55E', pct: 90, level: 4 }
  return { label: 'Very Strong', color: '#10B981', pct: 100, level: 5 }
}

export default function SignupPage() {
  const router = useRouter()

  const [role, setRole] = useState('landlord')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Google role-selection modal state
  const [showGoogleModal, setShowGoogleModal] = useState(false)
  const [googleRole, setGoogleRole] = useState('')
  const [googleRoleError, setGoogleRoleError] = useState('')

  const strength = pwdStrength(password)

  const validate = () => {
    if (!fullName.trim()) { setError('Please enter your full name.'); return false }
    if (!email.trim()) { setError('Please enter your email address.'); return false }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return false }
    if (strength.level < 2) { setError('Please choose a stronger password.'); return false }
    if (password !== confirm) { setError('Passwords do not match.'); return false }
    return true
  }

  const handleSignup = async () => {
    setError('')
    if (!validate()) return
    setLoading(true)

    const sb = createClient()

    const { data, error: signUpError } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim(), role },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      await sb.from('profiles').upsert({
        id: data.user.id,
        email: email.trim(),
        full_name: fullName.trim(),
        active_role: role,
        roles: [role],
      }, { onConflict: 'id' }).select()
    }

    setLoading(false)

    if (data.session) {
      router.push('/onboarding')
    } else {
      router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`)
    }
  }

  // Step 1: open modal instead of immediately triggering OAuth
  const handleGoogleButtonClick = () => {
    setGoogleRole('')
    setGoogleRoleError('')
    setShowGoogleModal(true)
  }

  // Step 2: after role selected in modal, trigger OAuth
  const handleGoogleContinue = async () => {
  if (!googleRole) {
    setGoogleRoleError('Please select a role to continue.')
    return
  }

  setGoogleRoleError('')
  setShowGoogleModal(false)
  setGoogleLoading(true)

  const sb = createClient()

  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback?role=${googleRole}`,
      queryParams: {
        prompt: 'select_account', // ✅ keep only this
      },
    },
  })
}

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Fraunces:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%}

        .page{display:flex;min-height:100vh;font-family:'Plus Jakarta Sans',sans-serif}

        /* ── Left panel ── */
        .left{flex:0 0 55%;background:#050A14;padding:48px 56px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
        .left::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 80% 60% at 20% 20%,rgba(56,189,248,.08) 0%,transparent 60%),radial-gradient(ellipse 60% 80% at 80% 80%,rgba(99,102,241,.1) 0%,transparent 60%)}
        .left::after{content:'';position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(148,163,184,.12) 1px,transparent 1px);background-size:28px 28px}
        .orb{position:absolute;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,.15) 0%,rgba(99,102,241,.08) 40%,transparent 70%);top:-80px;right:-80px;pointer-events:none;animation:float 8s ease-in-out infinite}
        .orb2{position:absolute;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,.1) 0%,transparent 70%);bottom:-60px;left:-60px;pointer-events:none;animation:float 10s ease-in-out infinite reverse}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-20px)}}

        /* ── Right panel ── */
        .right{flex:0 0 45%;background:#FAFAF9;display:flex;align-items:center;justify-content:center;padding:40px 40px;overflow-y:auto;position:relative}
        .right::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 60% 50% at 50% 0%,rgba(56,189,248,.06) 0%,transparent 60%),radial-gradient(ellipse 40% 40% at 80% 100%,rgba(99,102,241,.04) 0%,transparent 60%)}

        /* ── Inputs ── */
        .inp{width:100%;padding:12px 16px;border-radius:12px;border:1.5px solid #E8E6E0;font-size:14.5px;color:#0A0A0A;background:#FAFAF9;outline:none;font-family:'Plus Jakarta Sans',sans-serif;transition:all .2s}
        .inp:focus{border-color:#38BDF8;box-shadow:0 0 0 3px rgba(56,189,248,.1);background:#fff}
        .inp::placeholder{color:#C4C4BC}
        .inp.err{border-color:#EF4444;box-shadow:0 0 0 3px rgba(239,68,68,.08)}
        .pw-wrap{position:relative}
        .pw-wrap .inp{padding-right:44px}
        .pw-eye{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:17px;color:#94A3B8;padding:2px;line-height:1}

        /* ── Strength bar ── */
        .str-bg{height:4px;background:#E8E6E0;border-radius:99px;overflow:hidden;margin-top:8px}
        .str-fill{height:100%;border-radius:99px;transition:width .3s,background .3s}
        .str-row{display:flex;justify-content:space-between;align-items:center;margin-top:4px}
        .str-hints{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
        .str-hint{font-size:10.5px;color:#94A3B8;background:#F1F5F9;padding:2px 7px;border-radius:99px}

        /* ── Role buttons ── */
        .role-btn{flex:1;padding:12px 4px;border-radius:14px;border:1.5px solid #EFEFEC;background:#FAFAF9;cursor:pointer;transition:all .2s;text-align:center;font-family:'Plus Jakarta Sans',sans-serif}
        .role-btn:hover{border-color:#CBD5E1;background:#F3F4F6}
        .role-btn.active{border-color:#38BDF8;background:#F0F9FF;box-shadow:0 0 0 3px rgba(56,189,248,.12)}

        /* ── Buttons ── */
        .submit{width:100%;padding:14px;border-radius:13px;border:none;background:linear-gradient(135deg,#0EA5E9,#6366F1);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 6px 24px rgba(14,165,233,.35);transition:all .25s;letter-spacing:.2px}
        .submit:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(14,165,233,.45)}
        .submit:disabled{opacity:.6;cursor:not-allowed;transform:none}

        .google-btn{width:100%;padding:13px;border-radius:13px;border:1.5px solid #E8E6E0;background:#fff;color:#374151;font-size:14.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:10px;transition:all .2s;box-shadow:0 2px 8px rgba(0,0,0,.06)}
        .google-btn:hover{border-color:#CBD5E1;box-shadow:0 4px 16px rgba(0,0,0,.1);transform:translateY(-1px)}
        .google-btn:disabled{opacity:.6;cursor:not-allowed;transform:none}

        /* ── Divider ── */
        .or-divider{display:flex;align-items:center;gap:12px;margin:16px 0}
        .or-divider::before,.or-divider::after{content:'';flex:1;height:1px;background:#E8E6E0}
        .or-divider span{font-size:12px;color:#C4C4BC;font-weight:600;white-space:nowrap}

        /* ── Misc ── */
        .stat{flex:1;text-align:center;padding:18px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:14px}
        .testi{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:24px;margin-top:40px}
        .match-ok{font-size:12px;color:#22C55E;margin-top:4px;font-weight:600}
        .match-err{font-size:12px;color:#EF4444;margin-top:4px;font-weight:600}

        /* ── Google Role Modal ── */
        .modal-backdrop{position:fixed;inset:0;background:rgba(5,10,20,.7);backdrop-filter:blur(6px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .18s ease}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .modal{background:#fff;border-radius:24px;padding:32px 28px;width:100%;max-width:400px;box-shadow:0 32px 80px rgba(0,0,0,.25);animation:slideUp .22s ease}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .modal-role-btn{width:100%;padding:14px 16px;border-radius:14px;border:1.5px solid #EFEFEC;background:#FAFAF9;cursor:pointer;transition:all .2s;text-align:left;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;gap:14px;margin-bottom:10px}
        .modal-role-btn:hover{border-color:#CBD5E1;background:#F3F4F6}
        .modal-role-btn.active{border-color:#38BDF8;background:#F0F9FF;box-shadow:0 0 0 3px rgba(56,189,248,.12)}
        .modal-role-btn:last-of-type{margin-bottom:0}

        @media(max-width:900px){
          .page{flex-direction:column}
          .left{flex:none;padding:36px 28px 40px;min-height:auto}
          .right{flex:none;padding:32px 20px 48px}
          .orb{width:250px;height:250px;top:-40px;right:-40px}
          .orb2{display:none}
          .headline{font-size:36px!important}
          .testi{display:none}
          .stats-row{display:none!important}
        }
        @media(max-width:480px){
          .left{padding:28px 20px 32px}
          .right{padding:24px 14px 40px}
          .headline{font-size:30px!important}
          .form-card{padding:20px 16px!important}
        }
      `}</style>

      {/* ══ Google Role Selection Modal ══ */}
      {showGoogleModal && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowGoogleModal(false) }}>
          <div className="modal">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 22, fontWeight: 400, color: '#0A0A0A', letterSpacing: '-.5px', marginBottom: 4 }}>
                  One quick step
                </h2>
                <p style={{ fontSize: 13, color: '#94A3B8' }}>Select your role to continue with Google</p>
              </div>
              <button
                onClick={() => setShowGoogleModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#CBD5E1', padding: '4px', lineHeight: 1, borderRadius: 8 }}
              >
                ✕
              </button>
            </div>

            {/* Role options */}
            {roles.map(r => (
              <button
                key={r.id}
                className={`modal-role-btn${googleRole === r.id ? ' active' : ''}`}
                onClick={() => { setGoogleRole(r.id); setGoogleRoleError('') }}
              >
                <span style={{ fontSize: 26, flexShrink: 0 }}>{r.emoji}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: googleRole === r.id ? '#0EA5E9' : '#1E293B' }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{r.desc}</div>
                </div>
                {googleRole === r.id && (
                  <div style={{ marginLeft: 'auto', width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,#38BDF8,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>
                  </div>
                )}
              </button>
            ))}

            {/* Error */}
            {googleRoleError && (
              <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 10, padding: '10px 14px', color: '#E11D48', fontSize: 13, marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                ⚠️ {googleRoleError}
              </div>
            )}

            {/* Continue button */}
            <button
              className="submit"
              style={{ marginTop: 20 }}
              onClick={handleGoogleContinue}
              disabled={googleLoading}
            >
              {googleLoading ? 'Redirecting to Google...' : 'Continue with Google →'}
            </button>

            <p style={{ textAlign: 'center', fontSize: 12, color: '#C4C4BC', marginTop: 14 }}>
              You can change your role later in settings
            </p>
          </div>
        </div>
      )}

      <div className="page">

        {/* ══ LEFT ══ */}
        <div className="left">
          <div className="orb" /><div className="orb2" />
          <div style={{ position: 'relative', zIndex: 1 }}>

            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 60 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#38BDF8,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 8px 24px rgba(56,189,248,.3)' }}>🏘️</div>
              <span style={{ fontFamily: 'Fraunces,serif', fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-.3px' }}>Rentura</span>
            </div>

            <h1 className="headline" style={{ fontFamily: 'Fraunces,serif', fontSize: 52, fontWeight: 300, color: '#fff', lineHeight: 1.08, letterSpacing: '-1.5px', marginBottom: 18 }}>
              Property<br />management,<br />
              <span style={{ fontStyle: 'italic', background: 'linear-gradient(90deg,#38BDF8,#818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>reimagined</span>
            </h1>
            <p style={{ fontSize: 16, color: '#64748B', lineHeight: 1.75, maxWidth: 360, marginBottom: 44 }}>
              Everything you need to manage your portfolio — rent, tenants, maintenance — beautifully unified.
            </p>

            {/* Stats */}
            <div className="stats-row" style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
              {[['2,400+', 'Landlords trust us'], ['$0', 'To get started'], ['10min', 'Setup time']].map(([v, l]) => (
                <div className="stat" key={v}>
                  <div style={{ fontFamily: 'Fraunces,serif', fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 4, letterSpacing: '-.5px' }}>{v}</div>
                  <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.4 }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Testimonial */}
            <div className="testi">
              <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
                {[1, 2, 3, 4, 5].map(i => <span key={i} style={{ color: '#F59E0B', fontSize: 14 }}>★</span>)}
              </div>
              <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.75, marginBottom: 16, fontStyle: 'italic' }}>
                "Rentura eliminated my rent collection headaches. My tenants get automated reminders and I get paid on time — every single month."
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#38BDF8,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>AK</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Amir Khalil</div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>Landlord · 12 units · Dubai</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ RIGHT ══ */}
        <div className="right">
          <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

            <div style={{ marginBottom: 24 }}>
              <div style={{ width: 52, height: 52, borderRadius: 15, background: 'linear-gradient(135deg,#38BDF8,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 18, boxShadow: '0 12px 32px rgba(56,189,248,.25)' }}>🏘️</div>
              <h1 style={{ fontFamily: 'Fraunces,serif', fontSize: 30, fontWeight: 400, color: '#0A0A0A', letterSpacing: '-.8px', marginBottom: 6 }}>Create your account</h1>
              <p style={{ fontSize: 14, color: '#94A3B8' }}>Get started free — no credit card required</p>
            </div>

            <div className="form-card" style={{ background: '#fff', border: '1px solid #E8E6E0', borderRadius: 24, padding: 28, boxShadow: '0 4px 32px rgba(0,0,0,.06)' }}>

              {/* Google OAuth — now opens modal */}
              <button className="google-btn" onClick={handleGoogleButtonClick} disabled={googleLoading}>
                {googleLoading ? (
                  <span style={{ fontSize: 13 }}>Redirecting to Google...</span>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>

              <div className="or-divider"><span>or sign up with email</span></div>

              {/* Role selector */}
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#C4C4BC', marginBottom: 10 }}>I am a...</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {roles.map(r => (
                  <button key={r.id} className={`role-btn${role === r.id ? ' active' : ''}`} onClick={() => setRole(r.id)}>
                    <span style={{ fontSize: 22, display: 'block', marginBottom: 5 }}>{r.emoji}</span>
                    <div style={{ fontSize: 12, fontWeight: 700, color: role === r.id ? '#0EA5E9' : '#1E293B' }}>{r.label}</div>
                    <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2, lineHeight: 1.3 }}>{r.desc}</div>
                  </button>
                ))}
              </div>

              <div style={{ height: 1, background: '#F0EEE8', marginBottom: 18 }} />

              {/* Full name */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Full Name</label>
                <input className="inp" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nahji Nuzaf" />
              </div>

              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Email Address</label>
                <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Password</label>
                <div className="pw-wrap">
                  <input
                    className="inp"
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                  />
                  <button className="pw-eye" onClick={() => setShowPwd(v => !v)} tabIndex={-1}>
                    {showPwd ? '🙈' : '👁️'}
                  </button>
                </div>
                {password && (
                  <>
                    <div className="str-bg">
                      <div className="str-fill" style={{ width: `${strength.pct}%`, background: strength.color }} />
                    </div>
                    <div className="str-row">
                      <div className="str-hints">
                        <span className="str-hint" style={{ color: password.length >= 8 ? '#22C55E' : '#94A3B8', background: password.length >= 8 ? '#F0FDF4' : '#F1F5F9' }}>8+ chars</span>
                        <span className="str-hint" style={{ color: /[A-Z]/.test(password) ? '#22C55E' : '#94A3B8', background: /[A-Z]/.test(password) ? '#F0FDF4' : '#F1F5F9' }}>Uppercase</span>
                        <span className="str-hint" style={{ color: /[0-9]/.test(password) ? '#22C55E' : '#94A3B8', background: /[0-9]/.test(password) ? '#F0FDF4' : '#F1F5F9' }}>Number</span>
                        <span className="str-hint" style={{ color: /[^A-Za-z0-9]/.test(password) ? '#22C55E' : '#94A3B8', background: /[^A-Za-z0-9]/.test(password) ? '#F0FDF4' : '#F1F5F9' }}>Symbol</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: strength.color, flexShrink: 0, marginLeft: 8 }}>{strength.label}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Confirm password */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Confirm Password</label>
                <div className="pw-wrap">
                  <input
                    className={`inp${confirm && confirm !== password ? ' err' : ''}`}
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                  />
                  <button className="pw-eye" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}>
                    {showConfirm ? '🙈' : '👁️'}
                  </button>
                </div>
                {confirm && confirm === password && <div className="match-ok">✓ Passwords match</div>}
                {confirm && confirm !== password && <div className="match-err">✗ Passwords do not match</div>}
              </div>

              {/* Error */}
              {error && (
                <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 10, padding: '10px 14px', color: '#E11D48', fontSize: 13, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                  ⚠️ {error}
                </div>
              )}

              <button className="submit" onClick={handleSignup} disabled={loading}>
                {loading ? 'Creating account...' : 'Create Account →'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14, fontSize: 11.5, color: '#C4C4BC' }}>
                <span>🔒 Secure & encrypted</span>
                <span>·</span>
                <span>✨ Free forever</span>
              </div>
            </div>

            <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: 14, marginTop: 20 }}>
              Already have an account?{' '}
              <a href="/login" style={{ color: '#0EA5E9', fontWeight: 700, textDecoration: 'none' }}>Log in</a>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
