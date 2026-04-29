'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { type SupabaseClient } from '@supabase/supabase-js'
import { getCurrency, fmtAmount, type CurrencyCode } from '@/lib/currency'

interface UseCurrencyReturn {
  code: CurrencyCode
  symbol: string
  name: string
  fmtMoney: (amount: number) => string
  isLoading: boolean
}

// Module-level cache so we only fetch once per session
let cachedCurrency: CurrencyCode | null = null
let cachePromise: Promise<CurrencyCode> | null = null

async function fetchUserCurrency(supabase: SupabaseClient): Promise<CurrencyCode> {
  if (cachedCurrency) return cachedCurrency
  if (cachePromise) return cachePromise

  cachePromise = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return 'USD' as CurrencyCode

      const { data: profile } = await supabase
        .from('profiles')
        .select('currency')
        .eq('id', user.id)
        .single()

      const currency = (profile?.currency as CurrencyCode) || 'USD'
      cachedCurrency = currency
      return currency
    } catch (error) {
      console.error('Error fetching currency:', error)
      return 'USD' as CurrencyCode
    }
  })()

  return cachePromise
}

/** Call this inside a component to reset the cache after currency changes */
export function invalidateCurrencyCache() {
  cachedCurrency = null
  cachePromise = null
}

export function useCurrency(): UseCurrencyReturn {
  const [code, setCode] = useState<CurrencyCode>('USD')
  const [isLoading, setIsLoading] = useState(true)

  // Initialize the Supabase Browser Client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    let cancelled = false

    fetchUserCurrency(supabase).then((currency) => {
      if (!cancelled) {
        setCode(currency)
        setIsLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [supabase])

  const currency = getCurrency(code)

  const fmtMoney = useCallback(
    (amount: number) => fmtAmount(amount, code),
    [code]
  )

  return {
    code,
    symbol: currency.symbol,
    name: currency.name,
    fmtMoney,
    isLoading,
  }
}