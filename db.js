// db.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

console.log(
  '[supabase] using key:', 
  process.env.SUPABASE_SERVICE_ROLE_KEY
    ? 'SERVICE_ROLE_KEY'
    : '<<no service key found>>'
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
export default supabase;
