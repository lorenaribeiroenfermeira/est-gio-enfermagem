// Configuração de conexão com o Supabase
// Projeto: Estagio-enfermagem

const SUPABASE_URL = "https://vjpxctxyqxxazmiipxlz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_poC5JaFqS0iwObszTyALCw_0rZkUQRM";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
