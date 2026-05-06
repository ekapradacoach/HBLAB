// ─── HB Lab — Supabase Client Config ──────────────────────────────────────
// CDN-based setup: no npm/node needed.
// Requiere que el HTML cargue primero el script de Supabase CDN:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// y luego este archivo:
//   <script src="supabase.js"></script>

const SUPABASE_URL     = 'https://bqkajhxfdybmuilvzchm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxa2FqaHhmZHlibXVpbHZ6Y2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTI3MTcsImV4cCI6MjA5MjEyODcxN30.d0HL1AyK_6LOYDKk6hNtChFtik6gVc-3p77ODrz32Gk';

// Expone el cliente globalmente como `sb` para usarlo en cualquier página
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
