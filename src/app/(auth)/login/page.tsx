'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'

const features = [
  { icon: '💰', title: 'Automated rent reminders', desc: 'Never chase a payment again' },
  { icon: '🔧', title: 'Maintenance tracking', desc: 'Resolve issues faster' },
  { icon: '📁', title: 'Document vault', desc: 'Leases & files in one place' },
  { icon: '💬', title: 'Tenant messaging', desc: 'In-app chat with all tenants' },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleLogin = async () => {
    setError('')
    if (!email || !password) { setError('Please fill in all fields.'); return }
    setLoading(true)

    const sb = createClient()
    const { data, error: signInError } = await sb.auth.signInWithPassword({
      email: email.trim(), password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    // Read role from profiles table
    const { data: prof } = await sb
      .from('profiles')
      .select('active_role')
      .eq('id', data.user.id)
      .single()

    const role = prof?.active_role || data.user.user_metadata?.role || null

    if (!role) { window.location.href = '/onboarding'; return }

    if (role === 'tenant') window.location.href = '/tenant'
    else if (role === 'seeker') window.location.href = '/seeker'
    else window.location.href = '/landlord'
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    const sb = createClient()
    // For login, no role param — callback will use existing profile role
    await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Fraunces:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%}
        .page{display:flex;min-height:100vh;font-family:'Plus Jakarta Sans',sans-serif}
        .left{flex:0 0 55%;background:#050A14;padding:48px 56px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
        .left::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 80% 60% at 20% 20%,rgba(56,189,248,.08) 0%,transparent 60%),radial-gradient(ellipse 60% 80% at 80% 80%,rgba(99,102,241,.1) 0%,transparent 60%)}
        .left::after{content:'';position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(148,163,184,.12) 1px,transparent 1px);background-size:28px 28px}
        .orb{position:absolute;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,.15) 0%,rgba(99,102,241,.08) 40%,transparent 70%);top:-80px;right:-80px;pointer-events:none;animation:float 8s ease-in-out infinite}
        .orb2{position:absolute;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,.1) 0%,transparent 70%);bottom:-60px;left:-60px;pointer-events:none;animation:float 10s ease-in-out infinite reverse}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-20px)}}
        .right{flex:0 0 45%;background:#FAFAF9;display:flex;align-items:center;justify-content:center;padding:48px 40px;overflow-y:auto;position:relative}
        .right::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 60% 50% at 50% 0%,rgba(56,189,248,.06) 0%,transparent 60%),radial-gradient(ellipse 40% 40% at 80% 100%,rgba(99,102,241,.04) 0%,transparent 60%)}
        .inp{width:100%;padding:13px 16px;border-radius:12px;border:1.5px solid #E8E6E0;font-size:14.5px;color:#0A0A0A;background:#FAFAF9;outline:none;font-family:'Plus Jakarta Sans',sans-serif;transition:all .2s}
        .inp:focus{border-color:#38BDF8;box-shadow:0 0 0 3px rgba(56,189,248,.1);background:#fff}
        .inp::placeholder{color:#C4C4BC}
        .pw-wrap{position:relative}
        .pw-wrap .inp{padding-right:44px}
        .pw-eye{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:17px;color:#94A3B8;padding:2px;line-height:1}
        .submit{width:100%;padding:15px;border-radius:13px;border:none;background:linear-gradient(135deg,#0EA5E9,#6366F1);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 6px 24px rgba(14,165,233,.35);transition:all .25s;letter-spacing:.2px}
        .submit:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(14,165,233,.45)}
        .submit:disabled{opacity:.6;cursor:not-allowed;transform:none}
        .sb-logo-icon {
            width: 38px;
            height: 38px;
            border-radius: 11px;
            background: rgba(255, 255, 255, 0.05); /* Very subtle white */
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .google-btn{width:100%;padding:13px;border-radius:13px;border:1.5px solid #E8E6E0;background:#fff;color:#374151;font-size:14.5px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:10px;transition:all .2s;box-shadow:0 2px 8px rgba(0,0,0,.06)}
        .google-btn:hover{border-color:#CBD5E1;box-shadow:0 4px 16px rgba(0,0,0,.1);transform:translateY(-1px)}
        .google-btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
        .or-divider{display:flex;align-items:center;gap:12px;margin:16px 0}
        .or-divider::before,.or-divider::after{content:'';flex:1;height:1px;background:#E8E6E0}
        .or-divider span{font-size:12px;color:#C4C4BC;font-weight:600}
        .feat{display:flex;align-items:center;gap:14px;padding:15px 17px;margin-bottom:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;transition:all .25s}
        .feat:hover{background:rgba(255,255,255,.06);border-color:rgba(56,189,248,.2);transform:translateX(4px)}
        @media(max-width:900px){
          .page{flex-direction:column}.left{flex:none;padding:36px 28px 40px}.right{flex:none;padding:36px 20px 48px}
          .orb{width:200px;height:200px;top:-30px;right:-30px}.orb2{display:none}.headline{font-size:34px!important}
          .feat{display:none}.countries{display:none!important}
        }
        @media(max-width:480px){.left{padding:28px 20px 32px}.right{padding:28px 16px 40px}.headline{font-size:28px!important}.form-card{padding:22px 18px!important}}
      `}</style>

      <div className="page">
        <div className="left">
          <div className="orb" /><div className="orb2" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 60 }}>
              <div className="sb-logo-icon" >
                <Image
                  src="/icon.png"
                  alt="Rentura Logo"
                  width={24}
                  height={24}
                />
              </div>
              <span style={{ fontFamily: 'Fraunces,serif', fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-.3px' }}>Rentura</span>
            </div>
            <h1 className="headline" style={{ fontFamily: 'Fraunces,serif', fontSize: 52, fontWeight: 300, color: '#fff', lineHeight: 1.08, letterSpacing: '-1.5px', marginBottom: 18 }}>
              Welcome<br />back to your<br />
              <span style={{ fontStyle: 'italic', background: 'linear-gradient(90deg,#38BDF8,#818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>portfolio</span>
            </h1>
            <p style={{ fontSize: 16, color: '#64748B', lineHeight: 1.75, maxWidth: 360, marginBottom: 40 }}>
              Everything you left is exactly where you left it. Your properties, tenants, and finances — all waiting.
            </p>
            <div>
              {features.map(f => (
                <div className="feat" key={f.title}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{f.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0', marginBottom: 2 }}>{f.title}</div>
                    <div style={{ fontSize: 12, color: '#475569' }}>{f.desc}</div>
                  </div>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#10B981', flexShrink: 0 }}>✓</div>
                </div>
              ))}
            </div>
          </div>
          <div className="countries" style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#1E3A5F', marginBottom: 12 }}>Used by landlords in</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['🇱🇰 Sri Lanka', '🇬🇧 UK', '🇦🇺 Australia', '🇺🇸 USA', '🇦🇪 UAE'].map(c => (
                <span key={c} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 20, padding: '5px 12px', color: '#475569', fontSize: 12 }}>{c}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="right">
          <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
            <div style={{ marginBottom: 28 }}>
              <div className="sb-logo-icon" >
                <Image
                  src="/icon.png"
                  alt="Rentura Logo"
                  width={28}
                  height={28}
                />
              </div>
              <h1 style={{ fontFamily: 'Fraunces,serif', fontSize: 32, fontWeight: 400, color: '#0A0A0A', letterSpacing: '-.8px', marginBottom: 6 }}>Welcome back</h1>
              <p style={{ fontSize: 15, color: '#94A3B8' }}>Sign in to your Rentura account</p>
            </div>

            <div className="form-card" style={{ background: '#fff', border: '1px solid #E8E6E0', borderRadius: 24, padding: 32, boxShadow: '0 4px 32px rgba(0,0,0,.06)' }}>
              <button className="google-btn" onClick={handleGoogle} disabled={googleLoading}>
                {googleLoading ? <span style={{ fontSize: 13 }}>Redirecting...</span> : (
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

              <div className="or-divider"><span>or sign in with email</span></div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>Email Address</label>
                <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKey} placeholder="you@example.com" />
              </div>

              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Password</label>
                  <a href="/forgot-password" style={{ fontSize: 12, color: '#0EA5E9', textDecoration: 'none', fontWeight: 500 }}>Forgot password?</a>
                </div>
                <div className="pw-wrap">
                  <input className="inp" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKey} placeholder="Your password" />
                  <button className="pw-eye" onClick={() => setShowPwd(v => !v)} tabIndex={-1}>{showPwd ? '🙈' : '👁️'}</button>
                </div>
              </div>

              {error && (
                <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 10, padding: '11px 14px', color: '#E11D48', fontSize: 13, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                  ⚠️ {error}
                </div>
              )}

              <button className="submit" onClick={handleLogin} disabled={loading}>
                {loading ? 'Signing in...' : 'Log In →'}
              </button>

              <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: 14, marginTop: 20 }}>
                Don't have an account?{' '}
                <a href="/signup" style={{ color: '#0EA5E9', fontWeight: 700, textDecoration: 'none' }}>Sign up free</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
