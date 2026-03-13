'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function VerifyEmailPage() {
  const params = useSearchParams()
  const email  = params.get('email') || ''
  const [resent, setResent]       = useState(false)
  const [resending, setResending] = useState(false)

  async function handleResend() {
    if (!email || resending) return
    setResending(true)
    const sb = createClient()
    await sb.auth.resend({ type: 'signup', email })
    setResending(false)
    setResent(true)
    setTimeout(() => setResent(false), 4000)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@300;400;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%}
        .page{min-height:100vh;background:linear-gradient(135deg,#E8F4FD 0%,#EEF2FF 50%,#F0F9FF 100%);display:flex;align-items:center;justify-content:center;padding:24px;font-family:'Plus Jakarta Sans',sans-serif;position:relative;overflow:hidden}
        .page::after{content:'';position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(99,102,241,.1) 1px,transparent 1px);background-size:32px 32px}
        .blob{position:absolute;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,.13) 0%,transparent 65%);top:-150px;right:-100px;pointer-events:none;animation:float 9s ease-in-out infinite}
        .blob2{position:absolute;width:350px;height:350px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,.1) 0%,transparent 65%);bottom:-100px;left:-80px;pointer-events:none;animation:float 12s ease-in-out infinite reverse}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-20px)}}
        .card{background:#fff;border:1px solid #E2E8F0;border-radius:28px;padding:44px 40px;width:100%;max-width:460px;text-align:center;position:relative;z-index:1;box-shadow:0 20px 60px rgba(15,23,42,.1),0 4px 16px rgba(99,102,241,.06)}
        .email-icon{width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,#EFF6FF,#EEF2FF);border:1px solid #BFDBFE;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 24px}
        .resend-btn{padding:11px 24px;border-radius:12px;border:1.5px solid #E2E8F0;background:#F8FAFC;color:#475569;font-size:14px;font-weight:600;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .2s;margin-top:8px}
        .resend-btn:hover{border-color:#BFDBFE;color:#2563EB;background:#EFF6FF}
        .resend-btn:disabled{opacity:.5;cursor:not-allowed}
        .login-link{display:inline-block;margin-top:28px;font-size:14px;color:#64748B}
        .login-link a{color:#2563EB;font-weight:700;text-decoration:none}
        .login-link a:hover{text-decoration:underline}
        .success-banner{background:#DCFCE7;border:1px solid #BBF7D0;border-radius:12px;padding:12px 16px;color:#16A34A;font-size:13px;font-weight:600;margin-top:16px;display:flex;align-items:center;justify-content:center;gap:8px}
        .steps{margin-top:28px;text-align:left;display:flex;flex-direction:column;gap:10px}
        .step-row{display:flex;align-items:center;gap:12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:12px 14px}
        .step-num{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#0EA5E9,#6366F1);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
        .step-text{font-size:13px;color:#475569;font-weight:500;line-height:1.5}
      `}</style>

      <div className="page">
        <div className="blob"/><div className="blob2"/>
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center', marginBottom:32 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:'linear-gradient(135deg,#38BDF8,#6366F1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🏘️</div>
            <span style={{ fontFamily:'Fraunces,serif', fontSize:20, fontWeight:700, color:'#0F172A' }}>Rentura</span>
          </div>

          <div className="email-icon">📧</div>

          <h1 style={{ fontFamily:'Fraunces,serif', fontSize:28, fontWeight:400, color:'#0F172A', letterSpacing:'-.6px', marginBottom:10 }}>
            Check your inbox
          </h1>
          <p style={{ fontSize:14, color:'#64748B', lineHeight:1.75, marginBottom:4 }}>
            We sent a confirmation link to
          </p>
          {email && (
            <p style={{ fontSize:15, fontWeight:700, color:'#2563EB', marginBottom:16, wordBreak:'break-all' }}>
              {email}
            </p>
          )}
          <p style={{ fontSize:13, color:'#64748B', lineHeight:1.7 }}>
            Click the link in the email to verify your account and continue to onboarding.
          </p>

          <div className="steps">
            {[
              ['Open the email from Rentura', '1'],
              ['Click the confirmation link', '2'],
              ["You'll be taken to your onboarding", '3'],
            ].map(([text, num]) => (
              <div key={num} className="step-row">
                <div className="step-num">{num}</div>
                <div className="step-text">{text}</div>
              </div>
            ))}
          </div>

          {resent && (
            <div className="success-banner">✅ Email resent! Check your inbox.</div>
          )}
          <div style={{ marginTop:24, fontSize:13, color:'#64748B' }}>
            Didn't get it?
            <button className="resend-btn" onClick={handleResend} disabled={resending || resent} style={{ marginLeft:10 }}>
              {resending ? 'Sending...' : resent ? 'Sent!' : 'Resend email'}
            </button>
          </div>

          <div className="login-link">
            Wrong email? <a href="/signup">Start over</a> · <a href="/login">Log in</a>
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
