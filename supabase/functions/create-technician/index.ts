// Admin cria conta de técnico com e-mail JÁ confirmado (email_confirm: true).
// O TechnicianDialog.tsx antigo usava supabase.auth.signUp() direto do
// browser — essa é a API de AUTOCADASTRO público, que sempre exige
// confirmação de e-mail por padrão, mesmo quando quem está criando a conta
// é o admin logado. Resultado real: o técnico "Mayks" ficou com a conta
// criada mas sem conseguir logar até alguém confirmar manualmente (achado
// 05/08/2026). admin.createUser (só disponível com service_role, por isso
// precisa ser uma edge function) resolve isso pra sempre.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Token de autorização não fornecido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: adminCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id)
      .eq("role", "admin_provedor")
      .maybeSingle();

    if (!adminCheck) {
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas administradores podem cadastrar técnicos." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { nome, email, telefone, password, company_id } = await req.json();

    if (!nome?.trim() || !email?.trim() || !password) {
      return new Response(JSON.stringify({ error: "Nome, e-mail e senha são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true, // <- o pulo do gato: sem isso o técnico não loga sem confirmar e-mail manualmente
      user_metadata: {
        nome: nome.trim(),
        telefone: telefone?.trim() || null,
        company_id: company_id || null, // null = acesso a todas as empresas (mesmo padrão do TechnicianDialog)
        role: "tecnico",
      },
    });

    if (createError) {
      const msg = createError.message?.includes("already been registered") || createError.message?.includes("already registered")
        ? "Este e-mail já está cadastrado no sistema."
        : createError.message || "Erro ao criar técnico";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // handle_new_user() (trigger em auth.users) já cria profiles+user_roles
    // sozinho a partir do user_metadata acima — nada mais a fazer aqui.

    return new Response(JSON.stringify({ success: true, user_id: created.user?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("create-technician error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
