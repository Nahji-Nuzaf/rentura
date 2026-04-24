'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!password) { setError('Enter the admin password.'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) router.push('/admin')
    else setError('Incorrect password.')
  }

  return (
    <>
      <style>{`
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;font-family:'Plus Jakarta Sans',sans-serif;background:#0F172A}
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:wght@400;700&display=swap');
        .page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%)}
        .card{background:#1E293B;border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:40px;width:100%;max-width:400px;box-shadow:0 24px 60px rgba(0,0,0,.4)}
        .logo{display:flex;align-items:center;gap:10px;margin-bottom:32px;justify-content:center}
        .logo-icon{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#DC2626,#991B1B);display:flex;align-items:center;justify-content:center;font-size:20px}
        .logo-text{font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:#F8FAFC}
        .title{font-family:'Fraunces',serif;font-size:26px;font-weight:400;color:#F1F5F9;text-align:center;margin-bottom:6px}
        .sub{font-size:13px;color:#64748B;text-align:center;margin-bottom:28px}
        label{display:block;font-size:12.5px;font-weight:700;color:#94A3B8;margin-bottom:6px;letter-spacing:.3px}
        input{width:100%;padding:12px 16px;border-radius:10px;border:1.5px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#F1F5F9;font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:border .15s;margin-bottom:16px}
        input:focus{border-color:#DC2626;box-shadow:0 0 0 3px rgba(220,38,38,.15)}
        .btn{width:100%;padding:13px;border-radius:11px;border:none;background:linear-gradient(135deg,#DC2626,#991B1B);color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 4px 14px rgba(220,38,38,.3);transition:opacity .15s}
        .btn:hover{opacity:.9}.btn:disabled{opacity:.6;cursor:not-allowed}
        .err{background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.3);border-radius:9px;padding:10px 14px;font-size:13px;color:#FCA5A5;margin-bottom:14px}
        .warn{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);border-radius:9px;padding:10px 14px;font-size:12px;color:#FCD34D;margin-top:16px;text-align:center}
      `}</style>
      <div className="page">
        <div className="card">
          <div className="logo">
            <div className="logo-icon">🛡️</div>
            <span className="logo-text">Rentura Admin</span>
          </div>
          <div className="title">Admin Access</div>
          <div className="sub">This area is restricted to administrators only.</div>
          {error && <div className="err">⚠️ {error}</div>}
          <label>Admin Password</label>
          <input
            type="password"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&handleLogin()}
            placeholder="Enter admin password"
          />
          <button className="btn" onClick={handleLogin} disabled={loading}>
            {loading ? 'Verifying...' : '🔐 Access Dashboard'}
          </button>
          <div className="warn">⚠️ All actions in this panel are logged and irreversible.</div>
        </div>
      </div>
    </>
  )
}
