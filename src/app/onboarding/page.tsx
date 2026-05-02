'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import { CURRENCY_OPTIONS, detectCurrency, type CurrencyCode } from '@/lib/currency'

// ── Field defined OUTSIDE component to prevent remount on every keystroke ──
function Field({
  label, id, value, onChange, type = 'text', placeholder, optional, errors,
}: {
  label: string; id: string; value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string; placeholder?: string; optional?: boolean
  errors: Record<string, string>
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
        {label}
        {optional && <span style={{ color: '#9CA3AF', fontWeight: 400, marginLeft: 4 }}>(optional)</span>}
      </label>
      <input
        className={`ob-inp${errors[id] ? ' ob-inp-err' : ''}`}
        type={type} value={value} onChange={onChange} placeholder={placeholder}
      />
      {errors[id] && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <span style={{ fontSize: 12 }}>⚠️</span>
          <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 500 }}>{errors[id]}</span>
        </div>
      )}
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [role, setRole] = useState('')
  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [firstName, setFirstName] = useState('')

  // ── OTP state ──
  // 'checking' = checking session, 'verify' = needs OTP, 'done' = verified
  const [emailVerified, setEmailVerified] = useState<'checking' | 'verify' | 'done'>('checking')
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [skippedProperty, setSkippedProperty] = useState(false)

  // Landlord
  const [phone, setPhone] = useState('')
  const [propertyName, setPropertyName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [propType, setPropType] = useState('apartment')
  const [units, setUnits] = useState('1')
  const [rent, setRent] = useState('0')
  const [currency, setCurrency] = useState<CurrencyCode>('USD')

  // Tenant
  const [tenantPhone, setTenantPhone] = useState('')
  const [tenantCode, setTenantCode] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [inviteChecking, setInviteChecking] = useState(false)

  // Seeker
  const [seekerPhone, setSeekerPhone] = useState('')
  const [budget, setBudget] = useState('')
  const [seekerCity, setSeekerCity] = useState('')
  const [seekerType, setSeekerType] = useState('apartment')

  // ── Resend cooldown timer ──
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  // ── Auth + email-verified check on mount ──
  useEffect(() => {
    ;(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { router.push('/login'); return }

      setUserId(user.id)
      setUserEmail(user.email ?? '')

      const { data: prof } = await sb
        .from('profiles')
        .select('active_role, full_name')
        .eq('id', user.id)
        .single()

      const resolvedRole = prof?.active_role || user.user_metadata?.role || 'landlord'
      setRole(resolvedRole)
      setFirstName((prof?.full_name || user.user_metadata?.full_name || '').split(' ')[0] || 'there')

      // Auto-detect currency from browser locale
      setCurrency(detectCurrency())

      // Check if email is already confirmed
      if (user.email_confirmed_at) {
        setEmailVerified('done')
      } else {
        // Send OTP automatically on first load
        await sb.auth.resend({ type: 'signup', email: user.email! })
        setEmailVerified('verify')
        setResendCooldown(60)
      }
    })()
  }, [router])

  // ── Verify OTP ──
  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.length < 6) {
      setOtpError('Please enter the 6-digit code from your email.')
      return
    }
    setOtpLoading(true)
    setOtpError('')
    const sb = createClient()

    const { error } = await sb.auth.verifyOtp({
      email: userEmail,
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

    setEmailVerified('done')
    setOtpLoading(false)
  }

  // ── Resend OTP ──
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return
    const sb = createClient()
    await sb.auth.resend({ type: 'signup', email: userEmail })
    setResendCooldown(60)
    setOtpError('')
    setOtp('')
  }

  const isValidPhone = (v: string) => /^\+?[\d\s\-().]{7,15}$/.test(v)

  const validateLandlordStep1 = () => {
    const e: Record<string, string> = {}
    if (!phone.trim()) e.phone = 'Phone number is required'
    else if (!isValidPhone(phone)) e.phone = 'Enter a valid phone number (e.g. +94 77 123 4567)'
    setErrors(e); return Object.keys(e).length === 0
  }

  const validateLandlordStep2 = () => {
    const e: Record<string, string> = {}
    if (!propertyName.trim()) e.propertyName = 'Property name is required'
    if (!address.trim()) e.address = 'Address is required'
    if (!city.trim()) e.city = 'City is required'
    if (!country.trim()) e.country = 'Country is required'
    setErrors(e); return Object.keys(e).length === 0
  }

  const validateTenant = () => {
    const e: Record<string, string> = {}
    if (!tenantPhone) e.tenantPhone = 'Phone number is required'
    else if (!isValidPhone(tenantPhone)) e.tenantPhone = 'Enter a valid phone number'
    if (!tenantCode.trim()) e.tenantCode = 'Invite code is required'
    setErrors(e); return Object.keys(e).length === 0
  }

  const validateSeeker = () => {
    const e: Record<string, string> = {}
    if (seekerPhone && !isValidPhone(seekerPhone)) e.seekerPhone = 'Enter a valid phone number'
    if (budget && parseFloat(budget) <= 0) e.budget = 'Budget must be greater than 0'
    setErrors(e); return Object.keys(e).length === 0
  }

  const handleLandlordProfile = async () => {
    if (!validateLandlordStep1()) return
    setLoading(true)
    const sb = createClient()
    await sb.from('profiles').update({
      phone: phone.trim(),
      currency: currency,          // ← save selected currency to profile
      active_role: 'landlord',
      roles: ['landlord'],
    }).eq('id', userId).select()
    setLoading(false)
    setStep(2)
  }

  const handleLandlordProperty = async () => {
    if (!validateLandlordStep2()) return
    setLoading(true)
    const sb = createClient()
    const { data: property, error: propErr } = await sb
      .from('properties')
      .insert({
        landlord_id: userId,
        name: propertyName.trim(),
        address: address.trim(),
        city: city.trim(),
        country: country.trim(),
        type: propType,
        total_units: parseInt(units) || 1,
        status: 'active',
      })
      .select().single()

    if (propErr || !property) {
      setErrors({ propertyName: 'Failed to save property. Please try again.' })
      setLoading(false)
      return
    }

    const unitCount = Math.min(parseInt(units) || 1, 20)
    const unitRows = Array.from({ length: unitCount }, (_, i) => ({
      property_id: property.id,
      unit_number: unitCount === 1 ? 'Unit 1' : `Unit ${i + 1}`,
      monthly_rent: parseFloat(rent),
      currency: currency,
      rent_due_day: 1,
      status: 'vacant',
    }))
    await sb.from('units').insert(unitRows)
    setLoading(false)
    setSkippedProperty(false)
    setStep(3)
  }

  const handleTenantDone = async () => {
    if (!validateTenant()) return
    setInviteError('')
    setInviteChecking(true)
    setLoading(true)
    const sb = createClient()

    const { data: tenantRow, error: invErr } = await sb
      .from('tenants')
      .select('id, unit_id, property_id, invite_accepted')
      .eq('invite_token', tenantCode.trim().toUpperCase())
      .single()

    if (invErr || !tenantRow) {
      setInviteError('Invalid invite code. Please check with your landlord.')
      setInviteChecking(false); setLoading(false); return
    }
    if (tenantRow.invite_accepted) {
      setInviteError('This invite code has already been used.')
      setInviteChecking(false); setLoading(false); return
    }

    const { error: updateErr } = await sb.from('tenants').update({
      profile_id: userId,
      invite_accepted: true,
      status: 'active',
    }).eq('id', tenantRow.id).select()

    if (updateErr) {
      setInviteError('Something went wrong linking your account. Try again.')
      setInviteChecking(false); setLoading(false); return
    }

    await sb.from('units').update({ status: 'occupied' }).eq('id', tenantRow.unit_id).select()
    await sb.from('profiles').update({
      phone: tenantPhone.trim(),
      currency: currency,          // ← save selected currency to profile
      active_role: 'tenant',
      roles: ['tenant'],
    }).eq('id', userId).select()

    setInviteChecking(false); setLoading(false); setStep(2)
  }

  const handleSeekerDone = async () => {
    if (!validateSeeker()) return
    setLoading(true)
    const sb = createClient()
    await sb.from('profiles').update({
      phone: seekerPhone || null,
      currency: currency,          // ← save selected currency to profile
      active_role: 'seeker',
      roles: ['seeker'],
    }).eq('id', userId).select()
    setLoading(false)
    setStep(2)
  }

  const steps = role === 'landlord'
    ? ['Your Profile', 'First Property', 'All Done!']
    : ['Your Profile', 'All Done!']

  // ── Loading / initial session check ──
  if (emailVerified === 'checking') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Plus Jakarta Sans',sans-serif", color: '#64748B', fontSize: 14 }}>
      Loading...
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Fraunces:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%}

        .ob-page{min-height:100vh;font-family:'Plus Jakarta Sans',sans-serif;background:linear-gradient(135deg,#E8F4FD 0%,#EEF2FF 40%,#F0F9FF 70%,#E8F4FD 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 16px;position:relative;overflow:hidden}
        .ob-page::after{content:'';position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(99,102,241,.1) 1px,transparent 1px);background-size:32px 32px}
        .sb-logo-icon{width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center}
        .blob1{position:absolute;width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,.15) 0%,transparent 65%);top:-200px;right:-150px;pointer-events:none;animation:floatAnim 9s ease-in-out infinite}
        .blob2{position:absolute;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,.12) 0%,transparent 65%);bottom:-120px;left:-100px;pointer-events:none;animation:floatAnim 12s ease-in-out infinite reverse}
        .blob3{position:absolute;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,rgba(14,165,233,.1) 0%,transparent 65%);top:50%;left:-80px;pointer-events:none;animation:floatAnim 7s ease-in-out infinite 2s}
        @keyframes floatAnim{0%,100%{transform:translateY(0)}50%{transform:translateY(-24px)}}

        .ob-wrap{width:100%;max-width:540px;position:relative;z-index:1}

        .ob-card{background:#fff;border:1px solid #E2E8F0;border-radius:28px;padding:40px;box-shadow:0 20px 60px rgba(15,23,42,.1),0 4px 16px rgba(99,102,241,.06)}

        .ob-inp{width:100%;padding:13px 16px;border-radius:12px;border:1.5px solid #E2E8F0;font-size:14.5px;color:#0F172A;background:#F8FAFC;outline:none;font-family:'Plus Jakarta Sans',sans-serif;transition:all .2s}
        .ob-inp:focus{border-color:#2563EB;box-shadow:0 0 0 3px rgba(37,99,235,.1);background:#fff}
        .ob-inp::placeholder{color:#9CA3AF}
        .ob-inp-err{border-color:#EF4444!important;box-shadow:0 0 0 3px rgba(239,68,68,.08)!important}
        select.ob-inp{cursor:pointer}
        select.ob-inp option{background:#fff;color:#0F172A}

        /* OTP input — large, centered, spaced */
        .otp-inp{width:100%;padding:18px 16px;border-radius:14px;border:2px solid #E2E8F0;font-size:28px;font-weight:700;color:#0F172A;background:#F8FAFC;outline:none;font-family:'Plus Jakarta Sans',sans-serif;transition:all .2s;text-align:center;letter-spacing:10px}
        .otp-inp:focus{border-color:#2563EB;box-shadow:0 0 0 4px rgba(37,99,235,.12);background:#fff}
        .otp-inp-err{border-color:#EF4444!important;box-shadow:0 0 0 3px rgba(239,68,68,.08)!important}

        .ob-btn{width:100%;padding:15px;border-radius:13px;border:none;background:linear-gradient(135deg,#0EA5E9,#6366F1);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 6px 24px rgba(14,165,233,.35);transition:all .25s;position:relative;overflow:hidden;letter-spacing:.2px}
        .ob-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.12),transparent)}
        .ob-btn:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(14,165,233,.45)}
        .ob-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}

        .ob-skip{background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:13px;color:#64748B;font-size:14px;font-weight:500;padding:13px;width:100%;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .2s;margin-top:10px}
        .ob-skip:hover{border-color:#CBD5E1;color:#475569;background:#F1F5F9}

        .step-circle{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;transition:all .35s;flex-shrink:0}
        .step-label{font-size:11px;font-weight:600;margin-top:6px;white-space:nowrap;transition:color .3s}
        .step-line{flex:1;height:2px;margin:16px 10px 0;transition:background .35s;border-radius:99px}

        .info-box{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:14px;padding:15px 16px;display:flex;gap:10px;align-items:flex-start;margin-bottom:28px}
        .error-box{background:#FEF2F2;border:1px solid #FECACA;border-radius:14px;padding:13px 16px;display:flex;gap:10px;align-items:flex-start;margin-bottom:20px}

        .check-item{display:flex;align-items:center;gap:12px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:13px;padding:14px 16px;margin-bottom:10px}

        .divider{height:1px;background:#F1F5F9;margin-bottom:22px}

        .resend-btn{background:none;border:none;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;padding:0;transition:color .2s}
        .resend-btn:disabled{cursor:not-allowed}

        @media(max-width:600px){
          .ob-card{padding:28px 20px;border-radius:22px}
        }
      `}</style>

      <div className="ob-page">
        <div className="blob1" /><div className="blob2" /><div className="blob3" />

        <div className="ob-wrap">

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36, justifyContent: 'center' }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(255,255,255,0.05)', border: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="sb-logo-icon">
              <Image src="/icon.png" alt="Rentura Logo" width={36} height={36} />
            </div>
            <span style={{ fontFamily: 'Fraunces,serif', fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-.3px' }}>Rentura</span>
          </div>

          {/* ══ EMAIL OTP VERIFICATION GATE ══ */}
          {emailVerified === 'verify' ? (
            <div className="ob-card">
              {/* Icon */}
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,#EFF6FF,#EEF2FF)', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 20 }}>
                📧
              </div>

              <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 28, fontWeight: 400, color: '#0F172A', letterSpacing: '-.6px', marginBottom: 8 }}>
                Verify your email
              </h2>
              <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.7, marginBottom: 6 }}>
                We sent a 6-digit code to
              </p>
              <p style={{ color: '#0F172A', fontSize: 14, fontWeight: 700, marginBottom: 28 }}>
                {userEmail}
              </p>

              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
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
                <div className="error-box" style={{ marginTop: 12 }}>
                  <span style={{ fontSize: 18 }}>❌</span>
                  <p style={{ fontSize: 13, color: '#DC2626', lineHeight: 1.65 }}>{otpError}</p>
                </div>
              )}

              <button
                className="ob-btn"
                onClick={handleVerifyOtp}
                disabled={otpLoading || otp.length < 6}
                style={{ marginTop: 20 }}
              >
                {otpLoading ? 'Verifying...' : 'Verify & Continue →'}
              </button>

              {/* Resend */}
              <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#64748B' }}>
                Didn't get the code?{' '}
                <button
                  className="resend-btn"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0}
                  style={{ color: resendCooldown > 0 ? '#94A3B8' : '#2563EB' }}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </button>
              </div>

              <div className="info-box" style={{ marginTop: 24, marginBottom: 0 }}>
                <span style={{ fontSize: 18 }}>💡</span>
                <p style={{ fontSize: 13, color: '#1D4ED8', lineHeight: 1.65 }}>
                  Check your spam folder if you don't see it. The code expires in 10 minutes.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Step tracker — only shown after verification */}
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 32 }}>
                {steps.map((s, i) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'flex-start', flex: i < steps.length - 1 ? 1 : 'none' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div className="step-circle" style={{
                        background: step > i + 1 ? 'linear-gradient(135deg,#38BDF8,#6366F1)' : step === i + 1 ? 'linear-gradient(135deg,#0EA5E9,#6366F1)' : '#F1F5F9',
                        border: step >= i + 1 ? 'none' : '1.5px solid #E2E8F0',
                        color: step >= i + 1 ? '#fff' : '#94A3B8',
                        boxShadow: step === i + 1 ? '0 0 20px rgba(14,165,233,.35)' : 'none',
                      }}>
                        {step > i + 1 ? '✓' : i + 1}
                      </div>
                      <span className="step-label" style={{ color: step === i + 1 ? '#0F172A' : step > i + 1 ? '#94A3B8' : '#CBD5E1' }}>{s}</span>
                    </div>
                    {i < steps.length - 1 && (
                      <div className="step-line" style={{ background: step > i + 1 ? 'linear-gradient(90deg,#38BDF8,#6366F1)' : '#E2E8F0' }} />
                    )}
                  </div>
                ))}
              </div>

              {/* ══ LANDLORD STEP 1 ══ */}
              {role === 'landlord' && step === 1 && (
                <div className="ob-card">
                  <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 30, fontWeight: 400, color: '#0F172A', letterSpacing: '-.6px', marginBottom: 8 }}>
                    Welcome, {firstName}! 👋
                  </h2>
                  <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.7, marginBottom: 28 }}>
                    You're setting up as a <span style={{ color: '#2563EB', fontWeight: 600 }}>Landlord</span>. Let's get your portfolio ready in under 2 minutes.
                  </p>

                  <Field label="Phone Number" id="phone" value={phone}
                    onChange={e => setPhone(e.target.value)} type="tel"
                    placeholder="+94 77 123 4567" errors={errors} />

                  {/* ── Currency picker ── */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                      Preferred Currency
                    </label>
                    <select
                      className="ob-inp"
                      value={currency}
                      onChange={e => setCurrency(e.target.value as CurrencyCode)}
                    >
                      {CURRENCY_OPTIONS.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.symbol} — {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="info-box">
                    <span style={{ fontSize: 18 }}>🏠</span>
                    <p style={{ fontSize: 13, color: '#1D4ED8', lineHeight: 1.65 }}>
                      As a landlord, you'll manage properties, track rent, invite tenants, and handle maintenance - all from one dashboard.
                    </p>
                  </div>

                  <button className="ob-btn" onClick={handleLandlordProfile} disabled={loading}>
                    {loading ? 'Saving...' : 'Continue, Add Your Property →'}
                  </button>
                </div>
              )}

              {/* ══ LANDLORD STEP 2 ══ */}
              {role === 'landlord' && step === 2 && (
                <div className="ob-card">
                  <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 28, fontWeight: 400, color: '#0F172A', letterSpacing: '-.6px', marginBottom: 6 }}>
                    Add your first property 🏠
                  </h2>
                  <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24 }}>
                    You can add more properties and units from your dashboard anytime.
                  </p>
                  <div className="divider" />

                  <Field label="Property Name" id="propertyName" value={propertyName}
                    onChange={e => setPropertyName(e.target.value)} placeholder='e.g. "Sunset Apartments"' errors={errors} />
                  <Field label="Street Address" id="address" value={address}
                    onChange={e => setAddress(e.target.value)} placeholder="123 Main Street" errors={errors} />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="City" id="city" value={city}
                      onChange={e => setCity(e.target.value)} placeholder="London" errors={errors} />
                    <Field label="Country" id="country" value={country}
                      onChange={e => setCountry(e.target.value)} placeholder="United Kingdom" errors={errors} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>Property Type</label>
                      <select className="ob-inp" value={propType} onChange={e => setPropType(e.target.value)}>
                        <option value="apartment">Apartment Building</option>
                        <option value="house">House</option>
                        <option value="villa">Villa</option>
                        <option value="studio">Studio Apartment</option>
                        <option value="townhouse">Townhouse</option>
                        <option value="office">Offices</option>
                        <option value="shop">Shop / Retail</option>
                        <option value="warehouse">Warehouse</option>
                        <option value="annex">Annex</option>
                        <option value="commercial">Commercial Spaces</option>
                        <option value="land">Land / Plot</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>No. of Units</label>
                      <input className="ob-inp" type="number" min="1" max="999"
                        value={units} onChange={e => setUnits(String(Math.max(1, parseInt(e.target.value))))} />
                    </div>
                  </div>

                  <button className="ob-btn" onClick={handleLandlordProperty} disabled={loading} style={{ marginTop: 8 }}>
                    {loading ? 'Saving...' : 'Save & Continue →'}
                  </button>
                  <button className="ob-skip" onClick={() => { setSkippedProperty(true); setStep(3); }}>Skip for now</button>
                </div>
              )}

              {/* ══ LANDLORD STEP 3 ══ */}
              {role === 'landlord' && step === 3 && (
                <div className="ob-card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 60, marginBottom: 16 }}>🎉</div>
                  <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 32, fontWeight: 400, color: '#0F172A', letterSpacing: '-.8px', marginBottom: 10 }}>
                    You're all set!
                  </h2>
                  <p style={{ color: '#64748B', fontSize: 15, lineHeight: 1.7, maxWidth: 320, margin: '0 auto 32px' }}>
                    Your account is ready. Your dashboard is ready to go.
                  </p>
                  <div style={{ marginBottom: 32, textAlign: 'left' }}>
                    {[
                      ['✅', 'Account created & verified'],
                      skippedProperty ? ['⏳', 'Property setup skipped'] : ['✅', 'First property added'],
                      ['⏳', 'Invite your first tenant']
                    ].map(([icon, text]) => (
                      <div className="check-item" key={text}>
                        <span style={{ fontSize: 16 }}>{icon}</span>
                        <span style={{ fontSize: 14, color: icon === '✅' ? '#475569' : '#94A3B8' }}>{text}</span>
                      </div>
                    ))}
                  </div>
                  <button className="ob-btn" onClick={() => router.push('/landlord')}>
                    Go to Dashboard →
                  </button>
                </div>
              )}

              {/* ══ TENANT STEP 1 ══ */}
              {role === 'tenant' && step === 1 && (
                <div className="ob-card">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 20, padding: '5px 12px', marginBottom: 20 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                    <span style={{ color: '#16A34A', fontSize: 12, fontWeight: 600 }}>Tenant Account</span>
                  </div>
                  <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 30, fontWeight: 400, color: '#0F172A', letterSpacing: '-.6px', marginBottom: 8 }}>
                    Welcome, {firstName}! 👋
                  </h2>
                  <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
                    Enter your phone number and the invite code your landlord sent you to link your account.
                  </p>
                  <div className="divider" />

                  <Field label="Phone Number" id="tenantPhone" value={tenantPhone}
                    onChange={e => setTenantPhone(e.target.value)} type="tel"
                    placeholder="+94 77 123 4567" errors={errors} />

                  {/* ── Currency picker ── */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                      Preferred Currency
                    </label>
                    <select
                      className="ob-inp"
                      value={currency}
                      onChange={e => setCurrency(e.target.value as CurrencyCode)}
                    >
                      {CURRENCY_OPTIONS.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.symbol} — {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                      Invite Code
                    </label>
                    <input
                      className={`ob-inp${errors.tenantCode || inviteError ? ' ob-inp-err' : ''}`}
                      type="text"
                      value={tenantCode}
                      onChange={e => { setTenantCode(e.target.value.toUpperCase()); setInviteError('') }}
                      placeholder="e.g. RENT-4829"
                      style={{ textTransform: 'uppercase', letterSpacing: 2, fontWeight: 600 }}
                    />
                    {errors.tenantCode && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <span style={{ fontSize: 12 }}>⚠️</span>
                        <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 500 }}>{errors.tenantCode}</span>
                      </div>
                    )}
                  </div>

                  {inviteError && (
                    <div className="error-box">
                      <span style={{ fontSize: 18 }}>❌</span>
                      <p style={{ fontSize: 13, color: '#DC2626', lineHeight: 1.65 }}>{inviteError}</p>
                    </div>
                  )}

                  <div className="info-box">
                    <span style={{ fontSize: 18 }}>💡</span>
                    <p style={{ fontSize: 13, color: '#1D4ED8', lineHeight: 1.65 }}>
                      Your invite code links you to your unit. Ask your landlord to generate one from their tenant management page.
                    </p>
                  </div>

                  <button className="ob-btn" onClick={handleTenantDone} disabled={loading || inviteChecking}>
                    {inviteChecking ? 'Verifying code...' : loading ? 'Saving...' : 'Go to My Dashboard →'}
                  </button>
                </div>
              )}

              {/* ══ TENANT STEP 2 ══ */}
              {role === 'tenant' && step === 2 && (
                <div className="ob-card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 60, marginBottom: 16 }}>🏡</div>
                  <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 32, fontWeight: 400, color: '#0F172A', letterSpacing: '-.8px', marginBottom: 10 }}>
                    Welcome aboard!
                  </h2>
                  <p style={{ color: '#64748B', fontSize: 15, lineHeight: 1.7, maxWidth: 320, margin: '0 auto 32px' }}>
                    Your account is linked to your unit. Everything is ready for you.
                  </p>
                  <div style={{ marginBottom: 32, textAlign: 'left' }}>
                    {[['✅', 'Tenant account created'], ['✅', 'Linked to your unit'], ['✅', 'Profile saved']].map(([icon, text]) => (
                      <div className="check-item" key={text}>
                        <span style={{ fontSize: 16 }}>{icon}</span>
                        <span style={{ fontSize: 14, color: '#475569' }}>{text}</span>
                      </div>
                    ))}
                  </div>
                  <button className="ob-btn" onClick={() => router.push('/tenant')}>
                    Go to My Dashboard →
                  </button>
                </div>
              )}

              {/* ══ SEEKER STEP 1 ══ */}
              {role === 'seeker' && step === 1 && (
                <div className="ob-card">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 20, padding: '5px 12px', marginBottom: 20 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
                    <span style={{ color: '#D97706', fontSize: 12, fontWeight: 600 }}>Property Seeker</span>
                  </div>
                  <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 30, fontWeight: 400, color: '#0F172A', letterSpacing: '-.6px', marginBottom: 8 }}>
                    Welcome, {firstName}! 👋
                  </h2>
                  <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
                    Tell us what you're looking for and we'll find the best matches.
                  </p>
                  <div className="divider" />

                  <Field label="Phone Number" id="seekerPhone" value={seekerPhone}
                    onChange={e => setSeekerPhone(e.target.value)} type="tel"
                    placeholder="+94 77 123 4567" optional errors={errors} />

                  {/* ── Currency picker ── */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                      Preferred Currency
                    </label>
                    <select
                      className="ob-inp"
                      value={currency}
                      onChange={e => setCurrency(e.target.value as CurrencyCode)}
                    >
                      {CURRENCY_OPTIONS.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.symbol} — {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>Preferred City</label>
                      <input className="ob-inp" value={seekerCity}
                        onChange={e => setSeekerCity(e.target.value)} placeholder="Colombo" />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>Property Type</label>
                      <select className="ob-inp" value={seekerType} onChange={e => setSeekerType(e.target.value)}>
                        <option value="apartment">Apartment Building</option>
                        <option value="house">House</option>
                        <option value="villa">Villa</option>
                        <option value="studio">Studio Apartment</option>
                        <option value="townhouse">Townhouse</option>
                        <option value="office">Offices</option>
                        <option value="shop">Shop / Retail</option>
                        <option value="warehouse">Warehouse</option>
                        <option value="annex">Annex</option>
                        <option value="commercial">Commercial Spaces</option>
                        <option value="land">Land / Plot</option>
                      </select>
                    </div>
                  </div>

                  <Field label="Monthly Budget (USD)" id="budget" value={budget}
                    onChange={e => setBudget(e.target.value)} type="number"
                    placeholder="e.g. 800" optional errors={errors} />

                  <div className="info-box">
                    <span style={{ fontSize: 18 }}>🔍</span>
                    <p style={{ fontSize: 13, color: '#1D4ED8', lineHeight: 1.65 }}>
                      Browse verified listings, contact landlords directly, and schedule viewings — all in one place.
                    </p>
                  </div>

                  <button className="ob-btn" onClick={handleSeekerDone} disabled={loading}>
                    {loading ? 'Saving...' : 'Browse Listings →'}
                  </button>
                </div>
              )}

              {/* ══ SEEKER STEP 2 ══ */}
              {role === 'seeker' && step === 2 && (
                <div className="ob-card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 60, marginBottom: 16 }}>🔍</div>
                  <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 32, fontWeight: 400, color: '#0F172A', letterSpacing: '-.8px', marginBottom: 10 }}>
                    Ready to explore!
                  </h2>
                  <p style={{ color: '#64748B', fontSize: 15, lineHeight: 1.7, maxWidth: 320, margin: '0 auto 32px' }}>
                    Your preferences have been saved. Start browsing properties that match what you're looking for.
                  </p>
                  <div style={{ marginBottom: 32, textAlign: 'left' }}>
                    {[['✅', 'Seeker account created'], ['✅', 'Preferences saved'], ['⏳', 'Find your first property']].map(([icon, text]) => (
                      <div className="check-item" key={text}>
                        <span style={{ fontSize: 16 }}>{icon}</span>
                        <span style={{ fontSize: 14, color: icon === '✅' ? '#475569' : '#94A3B8' }}>{text}</span>
                      </div>
                    ))}
                  </div>
                  <button className="ob-btn" onClick={() => router.push('/seeker')}>
                    Browse Listings →
                  </button>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </>
  )
}
