'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type PlanStatus = {
  isPro: boolean
  plan: 'free' | 'pro' | 'business'
  loading: boolean
  refresh: () => void
}

const ProContext = createContext<PlanStatus>({
  isPro: false, plan: 'free', loading: true, refresh: () => {}
})

export function ProProvider({ children }: { children: React.ReactNode }) {
  const [isPro, setIsPro]   = useState(false)
  const [plan, setPlan]     = useState<'free'|'pro'|'business'>('free')
  const [loading, setLoading] = useState(true)

  async function check() {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('subscriptions')
        .select('plan, status')
        .eq('profile_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (data && (data.plan === 'pro' || data.plan === 'business')) {
        setIsPro(true)
        setPlan(data.plan as 'pro' | 'business')
      } else {
        setIsPro(false)
        setPlan('free')
      }
    } catch {
      setIsPro(false)
      setPlan('free')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { check() }, [])

  return (
    <ProContext.Provider value={{ isPro, plan, loading, refresh: check }}>
      {children}
    </ProContext.Provider>
  )
}

export function usePro() {
  return useContext(ProContext)
}
