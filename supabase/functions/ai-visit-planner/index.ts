import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompanyData {
  id: string;
  nome_fantasia: string;
  dias_sem_visita: number;
  total_chamados: number;
  chamados_abertos: number;
  health_score: number;
  ultimo_atendimento: string | null;
}

interface VisitPlan {
  company_id: string;
  company_name: string;
  proxima_visita: string;
  frequencia: "semanal" | "quinzenal" | "mensal" | "trimestral";
  prioridade: "alta" | "media" | "baixa";
  motivo: "preventiva" | "corretiva" | "acompanhamento";
  justificativa_ia: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    // Get authorization header from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's token
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { companies } = await req.json() as { companies: CompanyData[] };

    if (!companies || companies.length === 0) {
      return new Response(
        JSON.stringify({ error: "No companies provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing visit plan for ${companies.length} companies`);

    // Prepare company data for AI
    const companiesContext = companies.map((c) => ({
      id: c.id,
      nome: c.nome_fantasia,
      dias_sem_visita: c.dias_sem_visita,
      chamados_total: c.total_chamados,
      chamados_abertos: c.chamados_abertos,
      health_score: c.health_score,
      ultimo_atendimento: c.ultimo_atendimento || "Nunca",
    }));

    // Get current date for context
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Call OpenAI with tool calling for structured output
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Você é um assistente especializado em gestão de TI e suporte técnico. 
Sua tarefa é analisar dados de empresas clientes COM CONTRATO DE MANUTENÇÃO e criar um plano de visitas preventivas inteligente.

IMPORTANTE: Estas são empresas com CONTRATO DE MANUTENÇÃO que exigem visitas preventivas mensais OBRIGATÓRIAS. 
O não cumprimento dessas visitas representa descumprimento contratual.

Regras para criação do plano:
1. Empresas que NUNCA receberam visita (dias_sem_visita = 999) devem ter prioridade ALTA e visita nos próximos 7 dias - URGENTE!
2. Empresas com dias_sem_visita > 60 devem ter prioridade ALTA - estamos em atraso contratual
3. Empresas com dias_sem_visita entre 30-60 devem ter prioridade MÉDIA - próximas do limite
4. Empresas com muitos chamados abertos precisam de frequência mais alta (semanal ou quinzenal)
5. Empresas com health_score baixo (<50) precisam de atenção especial
6. Distribua as visitas ao longo das próximas 4 semanas para evitar sobrecarga
7. Considere 1-2 visitas por dia como limite prático
8. TODAS as empresas devem ter pelo menos 1 visita mensal por contrato

Data de hoje: ${todayStr}

Ao definir a frequência:
- semanal: para empresas críticas com muitos problemas ou infraestrutura complexa
- quinzenal: para empresas com problemas moderados ou histórico de chamados frequentes
- mensal: frequência MÍNIMA obrigatória por contrato
- trimestral: NÃO USAR - todos os contratos exigem visita mensal mínima

Crie justificativas claras e específicas para cada visita, mencionando:
- Dias sem visita e impacto contratual
- Quantidade de chamados e tendência
- Health score e riscos identificados`,
          },
          {
            role: "user",
            content: `Analise estas empresas e crie um plano de visitas preventivas:\n\n${JSON.stringify(companiesContext, null, 2)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_visit_plan",
              description: "Cria um plano de visitas preventivas estruturado para as empresas analisadas",
              parameters: {
                type: "object",
                properties: {
                  visits: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        company_id: {
                          type: "string",
                          description: "UUID da empresa",
                        },
                        company_name: {
                          type: "string",
                          description: "Nome da empresa para referência",
                        },
                        proxima_visita: {
                          type: "string",
                          description: "Data da próxima visita no formato YYYY-MM-DD",
                        },
                        frequencia: {
                          type: "string",
                          enum: ["semanal", "quinzenal", "mensal", "trimestral"],
                          description: "Frequência sugerida de visitas",
                        },
                        prioridade: {
                          type: "string",
                          enum: ["alta", "media", "baixa"],
                          description: "Prioridade da visita",
                        },
                        motivo: {
                          type: "string",
                          enum: ["preventiva", "corretiva", "acompanhamento"],
                          description: "Tipo de visita",
                        },
                        justificativa_ia: {
                          type: "string",
                          description: "Justificativa detalhada da IA para esta visita",
                        },
                      },
                      required: [
                        "company_id",
                        "company_name",
                        "proxima_visita",
                        "frequencia",
                        "prioridade",
                        "motivo",
                        "justificativa_ia",
                      ],
                      additionalProperties: false,
                    },
                  },
                  resumo: {
                    type: "string",
                    description: "Resumo geral do plano de visitas gerado",
                  },
                },
                required: ["visits", "resumo"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_visit_plan" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log("AI Response received");

    // Extract the tool call result
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "create_visit_plan") {
      throw new Error("Invalid AI response format");
    }

    const planData = JSON.parse(toolCall.function.arguments) as {
      visits: VisitPlan[];
      resumo: string;
    };

    console.log(`Generated plan with ${planData.visits.length} visits`);

    return new Response(
      JSON.stringify({
        success: true,
        plan: planData.visits,
        resumo: planData.resumo,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in ai-visit-planner:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
