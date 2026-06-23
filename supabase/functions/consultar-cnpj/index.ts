import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Resultado {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  endereco_completo: string;
  telefone: string;
  email: string;
  situacao_cadastral: string;
  ativa: boolean;
}

// fetch com timeout para não deixar um provedor lento consumir todo o orçamento
async function fetchJson(url: string, timeoutMs = 6000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const fmtTelefone = (ddd?: string, numero?: string): string => {
  const d = (ddd || '').replace(/\D/g, '');
  const n = (numero || '').replace(/\D/g, '');
  if (!n) return '';
  return d ? `(${d}) ${n}` : n;
};

const fmtTelCompleto = (full?: string): string => {
  const tel = (full || '').replace(/\D/g, '');
  if (tel.length >= 10) return `(${tel.substring(0, 2)}) ${tel.substring(2)}`;
  return full || '';
};

const montarEndereco = (partes: (string | undefined | null)[], cep?: string): string => {
  const base = partes.filter(Boolean).join(', ');
  const cepLimpo = (cep || '').replace(/\D/g, '');
  return cepLimpo ? `${base}, CEP: ${cepLimpo}` : base;
};

const eAtiva = (situacao?: string) => (situacao || '').trim().toUpperCase() === 'ATIVA';

// Cada provedor retorna o resultado normalizado, ou null se respondeu "não encontrado" (404),
// ou lança erro (rate limit / indisponível) para que o próximo provedor seja tentado.

async function viaBrasilApi(cnpj: string): Promise<Resultado | null> {
  const r = await fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`BrasilAPI status ${r.status}`);
  const d = await r.json();
  return {
    cnpj,
    razao_social: d.razao_social || '',
    nome_fantasia: d.nome_fantasia || d.razao_social || '',
    endereco_completo: montarEndereco(
      [d.logradouro, d.numero, d.complemento, d.bairro, d.municipio && d.uf ? `${d.municipio}/${d.uf}` : ''],
      d.cep,
    ),
    telefone: fmtTelCompleto(d.ddd_telefone_1),
    email: d.email || '',
    situacao_cadastral: d.descricao_situacao_cadastral || '',
    ativa: eAtiva(d.descricao_situacao_cadastral),
  };
}

async function viaCnpja(cnpj: string): Promise<Resultado | null> {
  const r = await fetchJson(`https://open.cnpja.com/office/${cnpj}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`CNPJa status ${r.status}`);
  const d = await r.json();
  const a = d.address || {};
  const ph = Array.isArray(d.phones) && d.phones[0] ? d.phones[0] : null;
  const em = Array.isArray(d.emails) && d.emails[0] ? d.emails[0] : null;
  const situacao = d.status?.text || '';
  return {
    cnpj,
    razao_social: d.company?.name || '',
    nome_fantasia: d.alias || d.company?.name || '',
    endereco_completo: montarEndereco(
      [a.street, a.number, a.details, a.district, a.city && a.state ? `${a.city}/${a.state}` : ''],
      a.zip,
    ),
    telefone: ph ? fmtTelefone(ph.area, ph.number) : '',
    email: em?.address || '',
    situacao_cadastral: situacao,
    ativa: eAtiva(situacao),
  };
}

async function viaCnpjWs(cnpj: string): Promise<Resultado | null> {
  const r = await fetchJson(`https://publica.cnpj.ws/cnpj/${cnpj}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`cnpj.ws status ${r.status}`);
  const d = await r.json();
  const e = d.estabelecimento || {};
  const situacao = e.situacao_cadastral || '';
  const logradouro = [e.tipo_logradouro, e.logradouro].filter(Boolean).join(' ');
  const cidadeUf = e.cidade?.nome && e.estado?.sigla ? `${e.cidade.nome}/${e.estado.sigla}` : '';
  return {
    cnpj,
    razao_social: d.razao_social || '',
    nome_fantasia: e.nome_fantasia || d.razao_social || '',
    endereco_completo: montarEndereco([logradouro, e.numero, e.complemento, e.bairro, cidadeUf], e.cep),
    telefone: fmtTelefone(e.ddd1, e.telefone1),
    email: e.email || '',
    situacao_cadastral: situacao,
    ativa: eAtiva(situacao),
  };
}

const PROVEDORES: Array<{ nome: string; fn: (cnpj: string) => Promise<Resultado | null> }> = [
  { nome: 'BrasilAPI', fn: viaBrasilApi },
  { nome: 'CNPJa', fn: viaCnpja },
  { nome: 'cnpj.ws', fn: viaCnpjWs },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cnpj } = await req.json();

    if (!cnpj) {
      return new Response(
        JSON.stringify({ error: 'CNPJ é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const cnpjLimpo = cnpj.replace(/[^\d]/g, '');

    if (cnpjLimpo.length !== 14) {
      return new Response(
        JSON.stringify({ error: 'CNPJ deve ter 14 dígitos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 1. Cache (válido por 30 dias)
    const { data: cached } = await supabaseClient
      .from('cnpj_cache')
      .select('dados')
      .eq('cnpj', cnpjLimpo)
      .gt('valido_ate', new Date().toISOString())
      .maybeSingle();

    if (cached?.dados) {
      console.log(`✓ CNPJ ${cnpjLimpo} encontrado no cache`);
      return new Response(
        JSON.stringify(cached.dados),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Consulta com fallback entre provedores (limites de IP independentes)
    let resultado: Resultado | null = null;
    let viuNaoEncontrado = false;
    let ultimoErro: Error | null = null;

    for (const provedor of PROVEDORES) {
      try {
        console.log(`Consultando CNPJ ${cnpjLimpo} via ${provedor.nome}...`);
        const r = await provedor.fn(cnpjLimpo);
        if (r) {
          resultado = r;
          console.log(`✓ ${provedor.nome}: ${r.razao_social}`);
          break;
        }
        viuNaoEncontrado = true;
        console.log(`${provedor.nome}: CNPJ não encontrado`);
      } catch (err: any) {
        ultimoErro = err;
        console.warn(`⚠ ${provedor.nome} falhou: ${err.message}`);
      }
    }

    if (!resultado) {
      // Algum provedor confirmou "não encontrado" e nenhum trouxe dados
      if (viuNaoEncontrado) {
        return new Response(
          JSON.stringify({ error: 'CNPJ não encontrado na Receita Federal' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      // Todos os provedores indisponíveis
      throw new Error(ultimoErro?.message || 'Todos os provedores indisponíveis');
    }

    // 3. Cache (consultado_em = agora, valido_ate = +30 dias)
    try {
      const agora = new Date();
      const validoAte = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);
      await supabaseClient.from('cnpj_cache').upsert({
        cnpj: cnpjLimpo,
        dados: resultado,
        consultado_em: agora.toISOString(),
        valido_ate: validoAte.toISOString(),
      });
      console.log('✓ Cache atualizado');
    } catch (err: any) {
      console.warn('⚠ Não foi possível salvar no cache:', err.message);
    }

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('❌ Erro ao consultar CNPJ:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({
        error: 'Erro ao consultar CNPJ. Serviço temporariamente indisponível.',
        details: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
