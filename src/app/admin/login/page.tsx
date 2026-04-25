'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  async function handleLogin() {
    if (!password) { setError('Password is required.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (data.success) router.push('/admin')
      else { setError('Access denied. Invalid credentials.'); setLoading(false) }
    } catch { setError('Connection failed. Try again.'); setLoading(false) }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;overflow:hidden}

        .page {
          min-height: 100vh;
          background: #060912;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          font-family: 'DM Sans', sans-serif;
        }

        /* Animated grid background */
        .grid-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(220,38,38,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(220,38,38,0.06) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: gridDrift 20s linear infinite;
        }
        @keyframes gridDrift {
          0% { transform: translate(0,0) }
          100% { transform: translate(60px,60px) }
        }

        /* Glowing orbs */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
        }
        .orb-1 { width:500px;height:500px;background:rgba(220,38,38,0.12);top:-150px;right:-100px;animation:float1 8s ease-in-out infinite }
        .orb-2 { width:400px;height:400px;background:rgba(239,68,68,0.07);bottom:-100px;left:-80px;animation:float2 10s ease-in-out infinite }
        .orb-3 { width:200px;height:200px;background:rgba(248,113,113,0.1);top:40%;left:30%;animation:float3 6s ease-in-out infinite }
        @keyframes float1 { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-30px) scale(1.05)} }
        @keyframes float2 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-20px) rotate(5deg)} }
        @keyframes float3 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,-15px)} }

        /* Scanline effect */
        .scanlines {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,0,0,0.03) 2px,
            rgba(0,0,0,0.03) 4px
          );
          pointer-events: none;
          z-index: 1;
        }

        .card-wrap {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 440px;
          padding: 20px;
          opacity: 0;
          transform: translateY(20px);
          animation: cardIn 0.6s cubic-bezier(0.16,1,0.3,1) 0.2s forwards;
        }
        @keyframes cardIn {
          to { opacity:1; transform:translateY(0) }
        }

        .card {
          background: rgba(255,255,255,0.03);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          padding: 44px 40px;
          box-shadow: 0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06);
          position: relative;
          overflow: hidden;
        }
        .card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(220,38,38,0.6), transparent);
        }

        /* Corner accents */
        .corner { position:absolute; width:20px; height:20px; }
        .corner-tl { top:12px; left:12px; border-top:2px solid rgba(220,38,38,0.5); border-left:2px solid rgba(220,38,38,0.5); border-radius:3px 0 0 0 }
        .corner-tr { top:12px; right:12px; border-top:2px solid rgba(220,38,38,0.5); border-right:2px solid rgba(220,38,38,0.5); border-radius:0 3px 0 0 }
        .corner-bl { bottom:12px; left:12px; border-bottom:2px solid rgba(220,38,38,0.5); border-left:2px solid rgba(220,38,38,0.5); border-radius:0 0 0 3px }
        .corner-br { bottom:12px; right:12px; border-bottom:2px solid rgba(220,38,38,0.5); border-right:2px solid rgba(220,38,38,0.5); border-radius:0 0 3px 0 }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(220,38,38,0.1);
          border: 1px solid rgba(220,38,38,0.25);
          border-radius: 99px;
          padding: 4px 12px;
          margin-bottom: 28px;
        }
        .badge-dot { width:6px;height:6px;border-radius:50%;background:#DC2626;animation:pulse 2s ease-in-out infinite }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
        .badge-text { font-family:'DM Mono',monospace;font-size:11px;color:#FCA5A5;letter-spacing:1px;font-weight:500 }

        .headline {
          font-family: 'Syne', sans-serif;
          font-size: 36px;
          font-weight: 800;
          color: #F8FAFC;
          line-height: 1.1;
          margin-bottom: 8px;
          letter-spacing: -1px;
        }
        .headline span {
          background: linear-gradient(135deg, #DC2626, #F87171);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .subline {
          font-size: 13.5px;
          color: #475569;
          margin-bottom: 36px;
          line-height: 1.5;
        }

        .field-wrap { margin-bottom: 16px; position: relative; }
        .field-label {
          font-family: 'DM Mono', monospace;
          font-size: 10.5px;
          font-weight: 500;
          color: #64748B;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          margin-bottom: 8px;
          display: block;
        }
        .input-wrap { position: relative; }
        .input-wrap input {
          width: 100%;
          padding: 13px 44px 13px 16px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          color: #E2E8F0;
          font-size: 14px;
          font-family: 'DM Mono', monospace;
          letter-spacing: 2px;
          outline: none;
          transition: all 0.2s;
        }
        .input-wrap input:focus {
          border-color: rgba(220,38,38,0.5);
          background: rgba(220,38,38,0.04);
          box-shadow: 0 0 0 3px rgba(220,38,38,0.1);
        }
        .input-wrap input::placeholder { color: #334155; letter-spacing: 1px }
        .pw-toggle {
          position: absolute; right: 12px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #475569; font-size: 16px; padding: 4px;
          transition: color 0.15s;
        }
        .pw-toggle:hover { color: #94A3B8 }

        .error-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(220,38,38,0.08);
          border: 1px solid rgba(220,38,38,0.2);
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 16px;
          font-size: 13px;
          color: #FCA5A5;
          animation: shake 0.4s ease;
        }
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-6px)}
          40%{transform:translateX(6px)}
          60%{transform:translateX(-4px)}
          80%{transform:translateX(4px)}
        }

        .login-btn {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%);
          color: #fff;
          font-family: 'Syne', sans-serif;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.5px;
          position: relative;
          overflow: hidden;
          transition: all 0.2s;
          box-shadow: 0 4px 20px rgba(220,38,38,0.3);
        }
        .login-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent);
        }
        .login-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 28px rgba(220,38,38,0.4);
        }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none }

        .btn-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          position: relative;
          z-index: 1;
        }

        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg) } }

        .footer-note {
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .footer-text {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          color: #1E293B;
          letter-spacing: 0.5px;
        }
        .footer-version {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          color: #DC2626;
          opacity: 0.5;
        }

        /* Side decoration */
        .side-deco {
          position: absolute;
          left: -280px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(220,38,38,0.04);
          font-family: 'Syne', sans-serif;
          font-size: 200px;
          font-weight: 800;
          letter-spacing: -10px;
          line-height: 1;
          user-select: none;
          pointer-events: none;
          white-space: nowrap;
        }
      `}</style>

      <div className="page">
        <div className="grid-bg"/>
        <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
        <div className="scanlines"/>
        <div className="side-deco">ADMIN</div>

        <div className="card-wrap">
          <div className="card">
            <div className="corner corner-tl"/><div className="corner corner-tr"/>
            <div className="corner corner-bl"/><div className="corner corner-br"/>

            <div className="badge">
              <div className="badge-dot"/>
              <span className="badge-text">RESTRICTED ACCESS</span>
            </div>

            <div className="headline">Rentura<br/><span>Admin</span></div>
            <div className="subline">Authenticated access only. All sessions are monitored and logged.</div>

            {error && (
              <div className="error-box">
                <span>⚠</span> {error}
              </div>
            )}

            <div className="field-wrap">
              <label className="field-label">// Admin Passphrase</label>
              <div className="input-wrap">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="● ● ● ● ● ● ● ●"
                  autoFocus
                />
                <button className="pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button className="login-btn" onClick={handleLogin} disabled={loading}>
              <div className="btn-inner">
                {loading ? <><div className="spinner"/> Authenticating...</> : <><span>🔐</span> Authenticate & Enter</>}
              </div>
            </button>

            <div className="footer-note">
              <span className="footer-text">RENTURA ADMIN CONSOLE v2.0</span>
              <span className="footer-version">● SECURE</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
