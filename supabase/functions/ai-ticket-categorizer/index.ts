import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TicketCategorization {
  titulo: string;
  categoria: string;
  subcategoria: string;
  impacto: 'baixo' | 'medio' | 'alto';
  urgencia: 'baixa' | 'media' | 'alta';
  descricao_formatada: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcription } = await req.json();

    if (!transcription || typeof transcription !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Transcrição não fornecida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processando transcrição:', transcription);

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    // Usar OpenAI (gpt-4o-mini) para categorização
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Você é um assistente especializado em categorizar chamados de suporte técnico de TI.
            
Analise a descrição falada pelo técnico e extraia as informações para categorizar o chamado.

CATEGORIAS DISPONÍVEIS:
- Acesso (Email, VPN, Senhas, Permissões)
- Hardware (Desktop, Notebook, Impressora, Monitor, Servidor, Switch, Roteador, Periféricos)
- Rede (Cabeada, Wi-Fi, Internet, VPN)
- Software (Antivírus, Office, Sistema Operacional, ERP, Aplicativos)

REGRAS:
1. Crie um título curto e objetivo (máximo 60 caracteres)
2. Identifique a categoria e subcategoria mais adequadas
3. Avalie o impacto baseado em quantas pessoas são afetadas:
   - alto: departamento inteiro ou empresa
   - medio: equipe ou grupo de pessoas
   - baixo: apenas uma pessoa
4. Avalie a urgência baseado na criticidade:
   - alta: impede trabalho completamente
   - media: trabalho prejudicado mas possível continuar
   - baixa: inconveniente mas não impede trabalho
5. Formate a descrição de forma profissional e estruturada

Responda APENAS com um objeto JSON válido no seguinte formato:
{
  "titulo": "string",
  "categoria": "Acesso" | "Hardware" | "Rede" | "Software",
  "subcategoria": "string",
  "impacto": "baixo" | "medio" | "alto",
  "urgencia": "baixa" | "media" | "alta",
  "descricao_formatada": "string"
}`
          },
          {
            role: 'user',
            content: `Categorize este chamado baseado na fala do técnico:\n\n"${transcription}"`
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro na API OpenAI:', errorText);
      throw new Error('Falha na chamada à IA');
    }

    const aiResponse = await response.json();
    console.log('Resposta da IA:', JSON.stringify(aiResponse));

    const content = aiResponse.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('Resposta vazia da IA');
    }

    // Extrair JSON da resposta (pode vir com markdown)
    let jsonContent = content;
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    } else {
      // Tentar extrair objeto JSON diretamente
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonContent = objectMatch[0];
      }
    }

    const categorization: TicketCategorization = JSON.parse(jsonContent);

    // Validar campos obrigatórios
    if (!categorization.titulo || !categorization.categoria) {
      throw new Error('Categorização incompleta');
    }

    console.log('Categorização extraída:', categorization);

    return new Response(
      JSON.stringify({ 
        success: true, 
        categorization 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Erro ao processar categorização:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao categorizar chamado',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
