import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BC_BASE = "https://apinewintegracao.bomcontrole.com.br/integracao";
const BC_EMPRESA_ID = 2;

async function bcFetch(path: string, method = "GET", body?: unknown) {
  const key = Deno.env.get("BOMCONTROLE_API_KEY")!;
  const resp = await fetch(`${BC_BASE}${path}`, {
    method,
    headers: { "Authorization": `ApiKey ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  try { return { ok: resp.ok, status: resp.status, data: JSON.parse(text) }; }
  catch { return { ok: resp.ok, status: resp.status, data: text }; }
}

function tableForParams(params: any): string {
  if (params.daily_service_record_id) return "daily_service_records";
  if (params.service_order_id) return "service_orders";
  return "tickets";
}

function entityIdFromParams(params: any): string {
  return params.daily_service_record_id || params.service_order_id || params.ticket_id;
}

async function resolveEntity(supabase: any, params: any) {
  if (params.service_order_id) {
    const { data: os, error } = await supabase
      .from("service_orders")
      .select("id, numero_os, descricao_servicos, companies(id, nome_fantasia, cnpj, whatsapp, telefone, bomcontrole_cliente_id)")
      .eq("id", params.service_order_id).single();
    if (error || !os) throw new Error("OS não encontrada.");
    return { entity: os, table: "service_orders", refLabel: `OS ${os.numero_os}`, descricao: os.descricao_servicos };
  }
  if (params.ticket_id) {
    const { data: tk, error } = await supabase
      .from("tickets")
      .select("id, numero, titulo, descricao, companies(id, nome_fantasia, cnpj, whatsapp, telefone, bomcontrole_cliente_id)")
      .eq("id", params.ticket_id).single();
    if (error || !tk) throw new Error("Chamado não encontrado.");
    return { entity: tk, table: "tickets", refLabel: `Chamado #${tk.numero}`, descricao: tk.descricao };
  }
  if (params.daily_service_record_id) {
    const { data: dsr, error } = await supabase
      .from("daily_service_records")
      .select("id, titulo, descricao, companies:company_id(id, nome_fantasia, cnpj, whatsapp, telefone, bomcontrole_cliente_id)")
      .eq("id", params.daily_service_record_id).single();
    if (error || !dsr) throw new Error("Atendimento não encontrado.");
    return { entity: dsr, table: "daily_service_records", refLabel: `Atendimento: ${dsr.titulo || dsr.id}`, descricao: dsr.descricao };
  }
  throw new Error("Informe service_order_id, ticket_id ou daily_service_record_id.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const MABBIX_BACKEND_URL = Deno.env.get("MABBIX_BACKEND_URL")
      ?.replace("//chat.mabbix.com.br", "//apichat.mabbix.com.br");
    const MABBIX_TOKEN = Deno.env.get("MABBIX_CONNECTION_TOKEN");

    const { action, ...params } = await req.json();

    // ── LIST ──
    if (action === "list") {
      const table = tableForParams(params);
      const entityId = entityIdFromParams(params);
      const { data } = await supabase
        .from(table)
        .select("bomcontrole_orcamento_id, bomcontrole_orcamento_url, bomcontrole_orcamento_status")
        .eq("id", entityId).single();
      return new Response(JSON.stringify({ ok: true, orcamento: data }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── GET — busca detalhes do orçamento no BomControle ──
    if (action === "get") {
      const { bcId } = params;
      if (!bcId) throw new Error("Informe bcId.");
      const { ok, data } = await bcFetch(`/Orcamento/Obter/${bcId}`);
      if (!ok) throw new Error(`BomControle: ${JSON.stringify(data)}`);
      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── CREATE ──
    if (action === "create") {
      const { itens, observacao, enviar_whatsapp } = params;
      if (!itens?.length) throw new Error("Informe ao menos 1 item no orçamento.");

      const { entity, table, refLabel, descricao } = await resolveEntity(supabase, params);
      const entityId = entityIdFromParams(params);
      const company: any = entity.companies;

      // Resolve IdCliente
      let bcClienteId: number = company.bomcontrole_cliente_id;
      if (!bcClienteId) {
        const searchTerm = (company.nome_fantasia || "").split(" ")[0];
        const { data: clientes } = await bcFetch(`/Cliente/Pesquisar?nome=${encodeURIComponent(searchTerm)}`);
        const list: any[] = Array.isArray(clientes) ? clientes : [];
        const cnpjNorm = (company.cnpj || "").replace(/\D/g, "");
        const match = list.find((c: any) => {
          const docBC = (c.PessoaJuridica?.Documento || c.PessoaFisica?.Cpf || "").replace(/\D/g, "");
          return (cnpjNorm && docBC === cnpjNorm) ||
            c.PessoaJuridica?.NomeFantasia?.toLowerCase() === company.nome_fantasia?.toLowerCase();
        });
        if (match) {
          bcClienteId = match.Id;
          await supabase.from("companies").update({ bomcontrole_cliente_id: bcClienteId }).eq("id", company.id);
        } else {
          throw new Error(`Cliente "${company.nome_fantasia}" não encontrado no BomControle. Cadastre-o lá primeiro.`);
        }
      }

      // Itens: usa Descricao livre + IdServico quando selecionado do catálogo
      const itensResolvidos = itens.map((it: any) => {
        const item: any = {
          Descricao: it.descricao,
          Quantidade: Number(it.quantidade) || 1,
          ValorUnitario: Number(it.valor_unitario) || 0,
          ValorDesconto: Number(it.valor_desconto) || 0,
        };
        if (it.bc_id && it.bc_tipo === "servico") item.IdServico = it.bc_id;
        return item;
      });

      const itensTexto = itens
        .map((it: any, i: number) =>
          `${i + 1}. ${it.descricao} — Qtd: ${it.quantidade} × R$${Number(it.valor_unitario).toFixed(2)}`)
        .join("\n");

      const observacaoFinal = [observacao || descricao || "", "", "Itens:", itensTexto]
        .filter(Boolean).join("\n").trim();

      const validade = new Date();
      validade.setDate(validade.getDate() + 30);

      const { ok: criarOk, status: criarStatus, data: bcResp } = await bcFetch("/Orcamento/Criar", "POST", {
        IdCliente: bcClienteId,
        IdEmpresa: BC_EMPRESA_ID,
        Validade: validade.toISOString().slice(0, 19),
        Observacao: observacaoFinal,
        Itens: itensResolvidos,
      });

      if (!criarOk) {
        const msg = bcResp?.Mensagem || bcResp?.message || bcResp?.mensagem || JSON.stringify(bcResp);
        throw new Error(`BomControle (${criarStatus}): ${msg}`);
      }

      const bcId: number = typeof bcResp === "number" ? bcResp : bcResp?.IdVenda ?? bcResp?.Id;
      if (!bcId) throw new Error(`BomControle: resposta inesperada: ${JSON.stringify(bcResp)}`);

      await new Promise((r) => setTimeout(r, 800));
      const { data: bcOrcamento } = await bcFetch(`/Orcamento/Obter/${bcId}`);
      const pdfUrl: string | null = bcOrcamento?.UrlImpressaoVenda ?? null;

      await supabase.from(table).update({
        bomcontrole_orcamento_id: bcId,
        bomcontrole_orcamento_url: pdfUrl,
        bomcontrole_orcamento_status: "enviado",
      }).eq("id", entityId);

      if (enviar_whatsapp && MABBIX_BACKEND_URL && MABBIX_TOKEN) {
        const phone = (company.whatsapp || company.telefone || "").replace(/\D/g, "");
        if (phone.length >= 10) {
          const msg =
            `Olá! Segue o orçamento #${bcId} referente ao ${refLabel}.\n\n` +
            (pdfUrl ? `📄 Visualize aqui: ${pdfUrl}\n\n` : "") +
            `Responda 1️⃣ para APROVAR ou 2️⃣ para solicitar revisão.`;
          fetch(`${MABBIX_BACKEND_URL}/api/messages/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MABBIX_TOKEN}` },
            body: JSON.stringify({ number: phone, openTicket: "0", queueId: "0", body: msg }),
          }).catch(console.error);
        }
      }

      return new Response(JSON.stringify({
        ok: true, bcId, pdfUrl,
        message: `Orçamento #${bcId} criado${enviar_whatsapp ? " e enviado ao cliente" : ""}.`,
      }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response(JSON.stringify({ error: "Ação desconhecida" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("bomcontrole-orcamento error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
