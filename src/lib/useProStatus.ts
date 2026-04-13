import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export type PlanStatus = {
  isPro: boolean
  plan: 'free' | 'pro' | 'business'
  loading: boolean
}

// FREE TIER LIMITS
export const FREE_LIMITS = {
  properties: 3,
  listings:   2,
  units:      10,
}

// PRO LIMITS
export const PRO_LIMITS = {
  properties: Infinity,
  listings:   Infinity,
  units:      Infinity,
}

export function usePlanLimits(count: number, resource: keyof typeof FREE_LIMITS) {
  const limit = FREE_LIMITS[resource]
  const isAtLimit = count >= limit
  const remaining = Math.max(0, limit - count)
  return { isAtLimit, remaining, limit }
}

export async function getProStatus(userId: string): Promise<PlanStatus> {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('profile_id', userId)
      .eq('status', 'active')
      .single()

    if (data && (data.plan === 'pro' || data.plan === 'business')) {
      return { isPro: true, plan: data.plan, loading: false }
    }
  } catch {
    // No subscription found = free plan
  }
  return { isPro: false, plan: 'free', loading: false }
}

export function useProStatus(): PlanStatus {
  const [status, setStatus] = useState<PlanStatus>({ isPro: false, plan: 'free', loading: true })

  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setStatus({ isPro: false, plan: 'free', loading: false }); return }
      const result = await getProStatus(user.id)
      setStatus(result)
    }
    check()
  }, [])

  return status
}
