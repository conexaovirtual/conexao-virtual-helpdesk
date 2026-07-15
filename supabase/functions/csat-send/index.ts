import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWabaText } from "../_shared/waba-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string): string {
  let n = (raw || "").replace(/\D/g, "");
  if (n.startsWith("0")) n = n.slice(1);
  if (n && !n.startsWith("55")) n = "55" + n;
  return n;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { ticket_id, service_order_id } = await req.json();
    if (!ticket_id && !service_order_id) throw new Error("Informe ticket_id ou service_order_id.");

    // Evita reenvio: já existe CSAT para esta entidade?
    const dupCol = ticket_id ? "ticket_id" : "service_order_id";
    const dupVal = ticket_id || service_order_id;
    const { data: existing } = await supabase
      .from("csat_responses")
      .select("id")
      .eq(dupCol, dupVal)
      .limit(1);
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "ja_enviado" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Resolve empresa, telefone e referência
    let companyId: string | null = null;
    let phoneRaw = "";
    let refLabel = "";
    let nomeFantasia = "";

    if (ticket_id) {
      const { data: tk } = await supabase
        .from("tickets")
        .select("numero, solicitante_contato, company_id, companies:company_id(nome_fantasia, whatsapp, telefone)")
        .eq("id", ticket_id).single();
      if (!tk) throw new Error("Chamado não encontrado.");
      companyId = tk.company_id;
      nomeFantasia = (tk.companies as any)?.nome_fantasia || "";
      phoneRaw = tk.solicitante_contato || (tk.companies as any)?.whatsapp || (tk.companies as any)?.telefone || "";
      refLabel = `chamado #${tk.numero}`;
    } else {
      const { data: os } = await supabase
        .from("service_orders")
        .select("numero_os, ticket_id, company_id, companies:company_id(nome_fantasia, whatsapp, telefone)")
        .eq("id", service_order_id).single();
      if (!os) throw new Error("OS não encontrada.");
      companyId = os.company_id;
      nomeFantasia = (os.companies as any)?.nome_fantasia || "";
      let contato = "";
      if (os.ticket_id) {
        const { data: tk } = await supabase
          .from("tickets").select("solicitante_contato").eq("id", os.ticket_id).maybeSingle();
        contato = tk?.solicitante_contato || "";
      }
      phoneRaw = contato || (os.companies as any)?.whatsapp || (os.companies as any)?.telefone || "";
      refLabel = `atendimento (OS #${os.numero_os})`;
    }

    const phone = normalizePhone(phoneRaw);
    if (phone.length < 12) {
      // Sem telefone válido: registra como ignorado para não tentar de novo
      await supabase.from("csat_responses").insert({
        ticket_id: ticket_id || null,
        service_order_id: service_order_id || null,
        company_id: companyId,
        phone: phone || null,
        status: "sem_telefone",
      });
      return new Response(JSON.stringify({ ok: true, skipped: "sem_telefone" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Envia a pesquisa
    const msg =
      `Olá! Seu ${refLabel} foi concluído ✅\n\n` +
      `De *1 a 5*, como você avalia nosso atendimento?\n` +
      `Responda só com o número (5 = ótimo, 1 = ruim). 🙏`;
    await sendWabaText(phone, msg, { openTicket: false });

    await supabase.from("csat_responses").insert({
      ticket_id: ticket_id || null,
      service_order_id: service_order_id || null,
      company_id: companyId,
      phone,
      status: "enviado",
    });

    console.log(`CSAT enviado para ${phone} (${refLabel}, ${nomeFantasia})`);
    return new Response(JSON.stringify({ ok: true, phone, ref: refLabel }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("csat-send error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
