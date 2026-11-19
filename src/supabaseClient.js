import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config'

// One shared connection to Supabase for the whole app. It also remembers
// the signed-in member between visits (stored in the browser).
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
