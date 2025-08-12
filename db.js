import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

console.log('Using SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('Using SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0,12) + '...');


console.log(
  '[supabase] using key:',
  process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE_KEY' : '<<no key>>'
);

console.log('[supabase] using URL:', process.env.SUPABASE_URL);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,  // ✅ must be exactly correct
  {
    auth: {
      persistSession: false
    }
  }
);

export default supabase;
