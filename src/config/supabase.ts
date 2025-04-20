import { createClient } from "@supabase/supabase-js";
import env from "./env";

const supabase = createClient(env.supabase.url, env.supabase.key);

export default supabase;