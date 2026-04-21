import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export type PlanStatus = {
  isPro: boolean
  plan: 'free' | 'pro' | 'business'
  loading: boolean
}

export const FREE_LIMITS = {
  properties: 3,
  listings:   2,
  units:      10,
}

export async function getProStatus(userId: string): Promise<PlanStatus> {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('profile_id', userId)
      .eq('status', 'active')
      .maybeSingle()

    if (data && (data.plan === 'pro' || data.plan === 'business')) {
      return { isPro: true, plan: data.plan as 'pro' | 'business', loading: false }
    }
  } catch {}
  return { isPro: false, plan: 'free', loading: false }
}

export function useProStatus(): PlanStatus {
  const [status, setStatus] = useState<PlanStatus>({ isPro: false, plan: 'free', loading: true })

  useEffect(() => {
    const check = async () => {
      try {
        // Use the API route — works consistently across all pages
        const res = await fetch('/api/plan-status')
        const data = await res.json()
        setStatus({
          isPro: data.isPro,
          plan: data.plan,
          loading: false
        })
      } catch {
        // Fallback to direct Supabase query
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setStatus({ isPro: false, plan: 'free', loading: false }); return }
        const result = await getProStatus(user.id)
        setStatus(result)
      }
    }
    check()
  }, [])

  return status
}
