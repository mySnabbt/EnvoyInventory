import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

console.log('Using SUPABASE_URL:', process.env.REACT_APP_SUPABASE_URL);
console.log('Using SUPABASE_SERVICE_ROLE_KEY:', process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY?.slice(0,12) + '...');


console.log(
  '[supabase] using key:',
  process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE_KEY' : '<<no key>>'
);

console.log('[supabase] using URL:', process.env.REACT_APP_SUPABASE_URL);

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY,  // ✅ must be exactly correct
  {
    auth: {
      persistSession: false
    }
  }
);

export default supabase;
