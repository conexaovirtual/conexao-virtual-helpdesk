import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWabaText } from "../_shared/waba-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TicketNotificationRequest {
  ticketId: string;
  ticketNumero: number;
  assetNome: string;
  assetTipo: string;
  assetTag?: string;
  companyNome: string;
  solicitanteNome: string;
  solicitanteContato: string;
  descricao: string;
}

// Dedup: a notificação de criação de um chamado deve sair só uma vez.
async function alreadyNotified(supabase: any, ticketId: string): Promise<boolean> {
  const { data } = await supabase
    .from("whatsapp_notification_log")
    .select("id")
    .eq("entity_type", "ticket")
    .eq("entity_id", ticketId)
    .eq("status", "created")
    .limit(1);
  return !!(data && data.length);
}

async function logNotification(supabase: any, ticketId: string, phone: string | null): Promise<void> {
  await supabase.from("whatsapp_notification_log").insert({
    entity_type: "ticket",
    entity_id: ticketId,
    status: "created",
    phone,
  });
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      ticketId,
      ticketNumero,
      assetNome,
      assetTipo,
      assetTag,
      companyNome,
      solicitanteNome,
      solicitanteContato,
      descricao,
    }: TicketNotificationRequest = await req.json();

    console.log("Notificando novo ticket:", { ticketId, ticketNumero });

    // DEDUP: se este chamado já gerou notificação de criação, não reenvia (evita duplicados).
    const supabaseDedup = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    if (await alreadyNotified(supabaseDedup, ticketId)) {
      console.log(`Skip duplicate ticket-created notification for ${ticketId}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "duplicate ticket notification" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Buscar email do administrador
    const adminEmail = Deno.env.get("ADMIN_EMAIL") || "admin@example.com";
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY não configurada");
    }

    // Enviar email via Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Sistema de Chamados <onboarding@resend.dev>",
        to: [adminEmail],
        subject: `🔔 Novo Chamado #${ticketNumero} via QR Code`,
        html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                border-radius: 8px 8px 0 0;
              }
              .content {
                background: #f9f9f9;
                padding: 20px;
                border: 1px solid #ddd;
                border-top: none;
              }
              .info-box {
                background: white;
                padding: 15px;
                margin: 15px 0;
                border-radius: 6px;
                border-left: 4px solid #667eea;
              }
              .label {
                font-weight: bold;
                color: #666;
                display: inline-block;
                min-width: 120px;
              }
              .value {
                color: #333;
              }
              .description {
                background: white;
                padding: 15px;
                margin: 15px 0;
                border-radius: 6px;
                border: 1px solid #ddd;
                white-space: pre-wrap;
              }
              .button {
                display: inline-block;
                padding: 12px 24px;
                background: #667eea;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                margin-top: 20px;
              }
              .footer {
                text-align: center;
                margin-top: 20px;
                color: #666;
                font-size: 12px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">📬 Novo Chamado Recebido via QR Code</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Chamado #${ticketNumero}</p>
              </div>
              
              <div class="content">
                <div class="info-box">
                  <h2 style="margin-top: 0; color: #667eea;">🖥️ Equipamento</h2>
                  <p><span class="label">Ativo:</span> <span class="value">${assetNome}</span></p>
                  <p><span class="label">Tipo:</span> <span class="value">${assetTipo}</span></p>
                  ${assetTag ? `<p><span class="label">Tag:</span> <span class="value">${assetTag}</span></p>` : ''}
                </div>

                <div class="info-box">
                  <h2 style="margin-top: 0; color: #667eea;">🏢 Empresa</h2>
                  <p><span class="value">${companyNome}</span></p>
                </div>

                <div class="info-box">
                  <h2 style="margin-top: 0; color: #667eea;">👤 Solicitante</h2>
                  <p><span class="label">Nome:</span> <span class="value">${solicitanteNome}</span></p>
                  <p><span class="label">Contato:</span> <span class="value">${solicitanteContato}</span></p>
                </div>

                <div class="info-box">
                  <h2 style="margin-top: 0; color: #667eea;">📝 Descrição do Problema</h2>
                  <div class="description">${descricao}</div>
                </div>

                <div style="text-align: center;">
                  <a href="${Deno.env.get("SUPABASE_URL")}" class="button">
                    Ver Chamado no Sistema
                  </a>
                </div>
              </div>

              <div class="footer">
                <p>Este é um email automático do sistema de chamados.</p>
                <p>Por favor, não responda este email.</p>
              </div>
            </div>
          </body>
        </html>
      `,
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.json();
      throw new Error(`Resend API error: ${JSON.stringify(error)}`);
    }

    const data = await emailResponse.json();
    console.log("Email enviado com sucesso:", data);

    // Enviar push notification para admins e técnicos
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
        },
        body: JSON.stringify({
          role: 'admin_provedor',
          title: `🔔 Novo Chamado #${ticketNumero}`,
          body: `${companyNome} - ${assetNome}`,
          data: {
            type: 'new_ticket',
            ticketId: ticketId,
            ticketNumero: ticketNumero
          },
          tag: `ticket-${ticketId}`
        })
      });
      
      console.log("Push notification sent for new ticket");
    } catch (pushError) {
      console.error("Error sending push notification:", pushError);
      // Não falhar se o push falhar
    }

    // Auto-registrar contato WhatsApp se o contato for um telefone
    try {
      const digits = solicitanteContato.replace(/\D/g, "");
      if (digits.length >= 10) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // Get company_id from the ticket
        const { data: ticket } = await supabase
          .from("tickets")
          .select("company_id")
          .eq("id", ticketId)
          .single();

        if (ticket?.company_id) {
          const phone = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
          
          // Upsert: create or update contact
          await supabase.from("whatsapp_contacts").upsert(
            {
              phone_number: phone,
              contact_name: solicitanteNome,
              company_id: ticket.company_id,
              last_message_at: new Date().toISOString(),
            },
            { onConflict: "phone_number" }
          );
          console.log(`WhatsApp contact registered: ${phone} -> ${solicitanteNome}`);
        }
      }
    } catch (contactError) {
      console.error("Error registering WhatsApp contact:", contactError);
      // Don't fail the main flow
    }

    // Enviar WhatsApp de confirmação para o solicitante
    try {
      const digits = solicitanteContato.replace(/\D/g, "");

      if (digits.length >= 10) {
        const phone = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;

        const mensagem =
          `✅ *Chamado Recebido — #${ticketNumero}*\n\n` +
          `Olá, *${solicitanteNome}*! Seu chamado foi registrado com sucesso.\n\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `🏢 *Empresa:* ${companyNome}\n` +
          `🖥️ *Equipamento:* ${assetNome}\n` +
          `📋 *Problema:* ${descricao.substring(0, 120)}${descricao.length > 120 ? "..." : ""}\n` +
          `━━━━━━━━━━━━━━━━━━━\n\n` +
          `Nossa equipe técnica já foi notificada e entrará em contato em breve.\n\n` +
          `_Conexão Virtual Soluções Tecnológicas_`;

        await sendWabaText(phone, mensagem, { openTicket: false }).catch(e => console.error("WhatsApp confirmation error:", e));

        console.log(`WhatsApp confirmation sent to ${phone} for ticket #${ticketNumero}`);
      }
    } catch (waErr) {
      console.error("Error sending WhatsApp confirmation:", waErr);
    }

    // Registra a notificação deste chamado para deduplicar reenvios futuros.
    await logNotification(supabaseDedup, ticketId, null);

    return new Response(JSON.stringify({ success: true, emailResponse: data }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in notify-ticket-created function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
