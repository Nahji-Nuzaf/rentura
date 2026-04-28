'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function VerifyEmailPage() {
  const params = useSearchParams()
  const router = useRouter()
  const email = params.get('email') || ''

  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(60)

  // Countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  // Send OTP on mount (email was just registered, Supabase already sent it,
  // but we kick off a resend just in case the user lands here directly)
  useEffect(() => {
    if (!email) return
    const sb = createClient()
    sb.auth.resend({ type: 'signup', email })
  }, [email])

  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.length < 6) {
      setOtpError('Please enter the 6-digit code from your email.')
      return
    }
    setOtpLoading(true)
    setOtpError('')
    const sb = createClient()

    const { error } = await sb.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: 'signup',
    })

    if (error) {
      setOtpError(
        error.message.includes('expired')
          ? 'Code expired — please request a new one.'
          : error.message.includes('invalid')
          ? 'Invalid code. Check your email and try again.'
          : error.message
      )
      setOtpLoading(false)
      return
    }

    // Verified — go straight to onboarding (which will skip its own OTP gate)
    router.push('/onboarding')
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return
    const sb = createClient()
    await sb.auth.resend({ type: 'signup', email })
    setResendCooldown(60)
    setOtpError('')
    setOtp('')
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%}
        .page{min-height:100vh;background:linear-gradient(135deg,#E8F4FD 0%,#EEF2FF 50%,#F0F9FF 100%);display:flex;align-items:center;justify-content:center;padding:24px;font-family:'Plus Jakarta Sans',sans-serif;position:relative;overflow:hidden}
        .page::after{content:'';position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(99,102,241,.1) 1px,transparent 1px);background-size:32px 32px}
        .blob{position:absolute;width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,.15) 0%,transparent 65%);top:-200px;right:-150px;pointer-events:none;animation:float 9s ease-in-out infinite}
        .blob2{position:absolute;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,.12) 0%,transparent 65%);bottom:-120px;left:-100px;pointer-events:none;animation:float 12s ease-in-out infinite reverse}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-24px)}}
        .card{background:#fff;border:1px solid #E2E8F0;border-radius:28px;padding:40px;width:100%;max-width:480px;position:relative;z-index:1;box-shadow:0 20px 60px rgba(15,23,42,.1),0 4px 16px rgba(99,102,241,.06)}
        .otp-inp{width:100%;padding:18px 16px;border-radius:14px;border:2px solid #E2E8F0;font-size:28px;font-weight:700;color:#0F172A;background:#F8FAFC;outline:none;font-family:'Plus Jakarta Sans',sans-serif;transition:all .2s;text-align:center;letter-spacing:10px}
        .otp-inp:focus{border-color:#2563EB;box-shadow:0 0 0 4px rgba(37,99,235,.12);background:#fff}
        .otp-inp-err{border-color:#EF4444!important;box-shadow:0 0 0 3px rgba(239,68,68,.08)!important}
        .ob-btn{width:100%;padding:15px;border-radius:13px;border:none;background:linear-gradient(135deg,#0EA5E9,#6366F1);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 6px 24px rgba(14,165,233,.35);transition:all .25s;position:relative;overflow:hidden;letter-spacing:.2px}
        .ob-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.12),transparent)}
        .ob-btn:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(14,165,233,.45)}
        .ob-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
        .error-box{background:#FEF2F2;border:1px solid #FECACA;border-radius:14px;padding:13px 16px;display:flex;gap:10px;align-items:flex-start}
        .info-box{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:14px;padding:15px 16px;display:flex;gap:10px;align-items:flex-start}
        .resend-btn{background:none;border:none;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;padding:0;transition:color .2s}
        .resend-btn:disabled{cursor:not-allowed}
      `}</style>

      <div className="page">
        <div className="blob" /><div className="blob2" />
        <div className="card">

          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center', marginBottom:32 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:'linear-gradient(135deg,#38BDF8,#6366F1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🏘️</div>
            <span style={{ fontFamily:'Fraunces,serif', fontSize:20, fontWeight:700, color:'#0F172A' }}>Rentura</span>
          </div>

          {/* Icon */}
          <div style={{ width:56, height:56, borderRadius:16, background:'linear-gradient(135deg,#EFF6FF,#EEF2FF)', border:'1px solid #BFDBFE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, marginBottom:20 }}>
            📧
          </div>

          <h1 style={{ fontFamily:'Fraunces,serif', fontSize:28, fontWeight:400, color:'#0F172A', letterSpacing:'-.6px', marginBottom:8 }}>
            Verify your email
          </h1>
          <p style={{ color:'#64748B', fontSize:14, lineHeight:1.7, marginBottom:6 }}>
            We sent a 6-digit code to
          </p>
          <p style={{ color:'#0F172A', fontSize:14, fontWeight:700, marginBottom:28, wordBreak:'break-all' }}>
            {email || 'your email address'}
          </p>

          {/* OTP input */}
          <div style={{ marginBottom:8 }}>
            <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:10 }}>
              Verification Code
            </label>
            <input
              className={`otp-inp${otpError ? ' otp-inp-err' : ''}`}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setOtpError('') }}
              placeholder="000000"
              autoFocus
            />
          </div>

          {otpError && (
            <div className="error-box" style={{ marginTop:12, marginBottom:4 }}>
              <span style={{ fontSize:18 }}>❌</span>
              <p style={{ fontSize:13, color:'#DC2626', lineHeight:1.65 }}>{otpError}</p>
            </div>
          )}

          <button
            className="ob-btn"
            onClick={handleVerifyOtp}
            disabled={otpLoading || otp.length < 6}
            style={{ marginTop:20 }}
          >
            {otpLoading ? 'Verifying...' : 'Verify & Continue →'}
          </button>

          {/* Resend */}
          <div style={{ textAlign:'center', marginTop:20, fontSize:13, color:'#64748B' }}>
            Didn't get the code?{' '}
            <button
              className="resend-btn"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              style={{ color: resendCooldown > 0 ? '#94A3B8' : '#2563EB' }}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>

          <div className="info-box" style={{ marginTop:24 }}>
            <span style={{ fontSize:18 }}>💡</span>
            <p style={{ fontSize:13, color:'#1D4ED8', lineHeight:1.65 }}>
              Check your spam folder if you don't see it. The code expires in 10 minutes.
            </p>
          </div>

          <div style={{ textAlign:'center', marginTop:24, fontSize:13, color:'#64748B' }}>
            Wrong email? <a href="/signup" style={{ color:'#2563EB', fontWeight:700, textDecoration:'none' }}>Start over</a>
            {' · '}
            <a href="/login" style={{ color:'#2563EB', fontWeight:700, textDecoration:'none' }}>Log in</a>
          </div>

        </div>
      </div>
    </>
  )
}

export default function Page() {
  return (
    <Suspense>
      <VerifyEmailPage />
    </Suspense>
  )
}