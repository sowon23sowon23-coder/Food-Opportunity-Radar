import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Bypasses Row Level Security — server-side use only (Server Components,
// Route Handlers, scripts). Never import this from client components.
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
