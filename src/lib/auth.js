import { supabase } from './supabase.js'

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getProfile(userId) {
  const { data } = await supabase
    .from('user_profiles')
    .select('role, name')
    .eq('id', userId)
    .single()
  return data
}
