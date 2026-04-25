import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function isAuthenticated(request: Request) {
  const cookieHeader = request.headers.get('cookie') || ''
  const adminCookie = cookieHeader.split(';').find(c => c.trim().startsWith('admin_auth='))?.split('=').slice(1).join('=').trim()
  return adminCookie === (process.env.ADMIN_SECRET || 'rentura-admin-2024')
}

export async function GET(request: Request) {
  if (!isAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const resource = searchParams.get('resource')
  const supabase = getAdmin()

  try {
    switch (resource) {

      case 'stats': {
        const [users, props, subs, listings, maint] = await Promise.all([
          supabase.from('profiles').select('id, active_role, created_at', { count: 'exact' }),
          supabase.from('properties').select('id', { count: 'exact' }),
          supabase.from('subscriptions').select('plan, status'),
          supabase.from('listings').select('id', { count: 'exact' }),
          supabase.from('maintenance_requests').select('status'),
        ])
        const proCount = (subs.data||[]).filter((s:any) => s.status==='active' && s.plan !== 'free').length
        const mrr = proCount * 9.99
        return NextResponse.json({
          totalUsers: users.count || 0,
          totalProperties: props.count || 0,
          proUsers: proCount,
          totalListings: listings.count || 0,
          openMaintenance: (maint.data||[]).filter((m:any) => m.status !== 'resolved').length,
          mrr: mrr.toFixed(2),
        })
      }

      case 'users': {
        const { data } = await supabase.from('profiles')
          .select('id, full_name, email, active_role, roles, phone, created_at')
          .order('created_at', { ascending: false })
        // Get subscriptions for each user
        const { data: subs } = await supabase.from('subscriptions').select('profile_id, plan, status')
        const subMap: Record<string, any> = {}
        ;(subs||[]).forEach((s:any) => { subMap[s.profile_id] = s })
        const users = (data||[]).map((u:any) => ({ ...u, subscription: subMap[u.id] || null }))
        return NextResponse.json({ data: users })
      }

      case 'properties': {
        const { data } = await supabase.from('properties')
          .select('id, name, city, country, type, status, total_units, created_at, landlord_id, profiles!landlord_id(full_name, email)')
          .order('created_at', { ascending: false })
        return NextResponse.json({ data: data || [] })
      }

      case 'subscriptions': {
        const { data } = await supabase.from('subscriptions')
          .select('*, profiles!profile_id(full_name, email)')
          .order('created_at', { ascending: false })
        return NextResponse.json({ data: data || [] })
      }

      case 'listings': {
        const { data } = await supabase.from('listings')
          .select('id, title, status, rent_amount, created_at, landlord_id, property_id, profiles!landlord_id(full_name, email), properties!property_id(name, city)')
          .order('created_at', { ascending: false })
        return NextResponse.json({ data: data || [] })
      }

      case 'maintenance': {
        const { data } = await supabase.from('maintenance_requests')
          .select('id, title, status, priority, created_at, property_id, properties!property_id(name, landlord_id)')
          .order('created_at', { ascending: false })
          .limit(200)
        return NextResponse.json({ data: data || [] })
      }

      default:
        return NextResponse.json({ error: 'Invalid resource' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  if (!isAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { resource, id, data } = await request.json()
  const supabase = getAdmin()

  try {
    switch (resource) {
      case 'user': {
        const { error } = await supabase.from('profiles').update(data).eq('id', id)
        if (error) throw error
        return NextResponse.json({ success: true })
      }
      case 'subscription': {
        const { error } = await supabase.from('subscriptions').update(data).eq('profile_id', id)
        if (error) {
          // Try upsert if not found
          await supabase.from('subscriptions').upsert({ profile_id: id, ...data }, { onConflict: 'profile_id' })
        }
        return NextResponse.json({ success: true })
      }
      case 'property': {
        const { error } = await supabase.from('properties').update(data).eq('id', id)
        if (error) throw error
        return NextResponse.json({ success: true })
      }
      case 'listing': {
        const { error } = await supabase.from('listings').update(data).eq('id', id)
        if (error) throw error
        return NextResponse.json({ success: true })
      }
      case 'maintenance': {
        const { error } = await supabase.from('maintenance_requests').update(data).eq('id', id)
        if (error) throw error
        return NextResponse.json({ success: true })
      }
      default:
        return NextResponse.json({ error: 'Invalid resource' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!isAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { resource, id } = await request.json()
  const supabase = getAdmin()

  try {
    switch (resource) {
      case 'user': {
        await supabase.from('profiles').delete().eq('id', id)
        await supabase.auth.admin.deleteUser(id)
        return NextResponse.json({ success: true })
      }
      case 'property': {
        await supabase.from('units').delete().eq('property_id', id)
        await supabase.from('properties').delete().eq('id', id)
        return NextResponse.json({ success: true })
      }
      case 'listing': {
        await supabase.from('listings').delete().eq('id', id)
        return NextResponse.json({ success: true })
      }
      case 'maintenance': {
        await supabase.from('maintenance_requests').delete().eq('id', id)
        return NextResponse.json({ success: true })
      }
      default:
        return NextResponse.json({ error: 'Invalid resource' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
