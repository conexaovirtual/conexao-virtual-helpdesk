import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWabaText } from "../_shared/waba-provider.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ServiceOrderRow {
  id: string;
  numero_os: number;
  data_agendada: string;
  hora_agendada: string | null;
  tecnico_id: string | null;
  notified_at: string | null;
  descricao_servicos: string;
  endereco_atendimento: string | null;
  prioridade: string | null;
  tipo_servico: string | null;
  status: string;
  companies: { nome_fantasia: string } | null;
  assets: { nome: string; tipo: string } | null;
}

// ─── Send WhatsApp via WABA (Mabbix ou Evolution) ──────────────────
async function sendWhatsApp(phone: string, text: string) {
  try {
    const result = await sendWabaText(phone, text, { openTicket: false });
    if (!result.ok) {
      console.error('WhatsApp send failed:', JSON.stringify(result.raw));
      return false;
    }
    return true;
  } catch (err) {
    console.error('WhatsApp send error:', err);
    return false;
  }
}

// ─── Get technician phone ──────────────────────────────────────────
async function getTechnicianPhone(supabase: any, tecnicoId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('telefone')
    .eq('id', tecnicoId)
    .single();
  return data?.telefone || null;
}

// ─── Format priority emoji ─────────────────────────────────────────
function priorityEmoji(p: string | null): string {
  switch (p) {
    case 'urgente': return '🔴';
    case 'alta': return '🟠';
    case 'media': return '🟡';
    case 'baixa': return '🟢';
    default: return '⚪';
  }
}

function tipoLabel(t: string | null): string {
  switch (t) {
    case 'corretivo': return 'Corretivo';
    case 'preventivo': return 'Preventivo';
    case 'instalacao': return 'Instalação';
    case 'consultoria': return 'Consultoria';
    default: return t || 'N/A';
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ─── Determine current time in Brazil (UTC-3) ───────────────────
    const now = new Date();
    const brNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const today = brNow.toISOString().split('T')[0];
    const currentHour = brNow.getHours();
    const currentMinute = brNow.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    console.log(`[Reminder] BR time: ${brNow.toISOString()}, date: ${today}, ${currentHour}:${currentMinute}`);

    // ─── Fetch all today's scheduled service orders ─────────────────
    const { data: allOrders, error } = await supabase
      .from('service_orders')
      .select(`
        id, numero_os, data_agendada, hora_agendada, tecnico_id, notified_at,
        descricao_servicos, endereco_atendimento, prioridade, tipo_servico, status,
        companies:company_id (nome_fantasia),
        assets:asset_id (nome, tipo)
      `)
      .gte('data_agendada', `${today}T00:00:00`)
      .lte('data_agendada', `${today}T23:59:59`)
      .in('status', ['agendada', 'em_andamento']);

    if (error) {
      console.error('Error fetching service orders:', error);
      throw error;
    }

    const orders = (allOrders || []) as unknown as ServiceOrderRow[];
    console.log(`[Reminder] Found ${orders.length} orders for today`);

    if (orders.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, morning: 0, reminders: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let morningSent = 0;
    let remindersSent = 0;

    // ═════════════════════════════════════════════════════════════════
    // 1. MORNING SUMMARY (7:30–8:30 window)
    // ═════════════════════════════════════════════════════════════════
    const isMorningWindow = currentHour >= 7 && currentHour <= 8;

    if (isMorningWindow) {
      // Group orders by technician
      const byTechnician = new Map<string, ServiceOrderRow[]>();
      for (const os of orders) {
        if (!os.tecnico_id) continue;
        const existing = byTechnician.get(os.tecnico_id) || [];
        existing.push(os);
        byTechnician.set(os.tecnico_id, existing);
      }

      for (const [tecnicoId, tecOrders] of byTechnician) {
        // Check if morning summary was already sent (use notified_at on first order)
        const alreadySent = tecOrders.some(o => o.notified_at && o.notified_at.includes(today));
        if (alreadySent) {
          console.log(`[Morning] Already sent summary to technician ${tecnicoId}`);
          continue;
        }

        const phone = await getTechnicianPhone(supabase, tecnicoId);
        if (!phone) {
          console.warn(`[Morning] No phone for technician ${tecnicoId}`);
          continue;
        }

        // Sort by time
        const sorted = tecOrders.sort((a, b) => (a.hora_agendada || '').localeCompare(b.hora_agendada || ''));

        const lines = [
          `☀️ *Bom dia! Agenda de hoje - ${today.split('-').reverse().join('/')}*`,
          ``,
          `Você tem *${sorted.length}* atendimento${sorted.length > 1 ? 's' : ''} agendado${sorted.length > 1 ? 's' : ''}:`,
          ``,
        ];

        for (let i = 0; i < sorted.length; i++) {
          const os = sorted[i];
          lines.push(
            `${priorityEmoji(os.prioridade)} *${i + 1}. OS #${os.numero_os}* — ${os.hora_agendada || 'Sem horário'}`,
            `   🏢 ${os.companies?.nome_fantasia || 'N/A'}`,
            `   💻 ${os.assets?.nome || 'N/A'} (${tipoLabel(os.tipo_servico)})`,
            os.endereco_atendimento ? `   📍 ${os.endereco_atendimento}` : '',
            ``
          );
        }

        lines.push(`Você receberá um lembrete *30 minutos antes* de cada atendimento. Bom trabalho! 💪`);

        const msg = lines.filter(l => l !== undefined).join('\n');
        const sent = await sendWhatsApp(phone, msg);
        if (sent) {
          morningSent++;
          // Mark all orders as notified for morning
          for (const os of tecOrders) {
            await supabase
              .from('service_orders')
              .update({ notified_at: new Date().toISOString() })
              .eq('id', os.id);
          }
        }
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // 2. 30-MINUTE REMINDER
    // ═════════════════════════════════════════════════════════════════
    for (const os of orders) {
      if (!os.tecnico_id || !os.hora_agendada) continue;

      const [h, m] = os.hora_agendada.split(':').map(Number);
      const orderMinutes = h * 60 + m;
      const diff = orderMinutes - currentTotalMinutes;

      // Send if between 25–35 minutes before (to handle cron timing)
      if (diff < 25 || diff > 35) continue;

      const phone = await getTechnicianPhone(supabase, os.tecnico_id);
      if (!phone) continue;

      const msg = [
        `⏰ *Lembrete: Atendimento em 30 minutos!*`,
        ``,
        `📋 *OS #${os.numero_os}*`,
        `🏢 *Empresa:* ${os.companies?.nome_fantasia || 'N/A'}`,
        `💻 *Ativo:* ${os.assets?.nome || 'N/A'}`,
        `🔧 *Tipo:* ${tipoLabel(os.tipo_servico)}`,
        `${priorityEmoji(os.prioridade)} *Prioridade:* ${os.prioridade || 'N/A'}`,
        `⏰ *Horário:* ${os.hora_agendada}`,
        os.endereco_atendimento ? `📍 *Endereço:* ${os.endereco_atendimento}` : '',
        ``,
        `📝 *Serviço:* ${os.descricao_servicos?.substring(0, 200) || 'N/A'}`,
        ``,
        `Acesse o sistema para mais detalhes. Boa sorte! 🚀`,
      ].filter(Boolean).join('\n');

      const sent = await sendWhatsApp(phone, msg);
      if (sent) {
        remindersSent++;
        console.log(`[30min] Reminder sent for OS #${os.numero_os}`);
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // 3. PUSH NOTIFICATIONS (keep existing behavior for unnotified)
    // ═════════════════════════════════════════════════════════════════
    const unnotified = orders.filter(o => !o.notified_at);
    for (const os of unnotified) {
      const recipients: string[] = [];
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin_provedor');
      if (admins) recipients.push(...admins.map((a: any) => a.user_id));
      if (os.tecnico_id) recipients.push(os.tecnico_id);

      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({
            user_ids: recipients,
            title: `⏰ OS #${os.numero_os} agendada hoje`,
            body: `${os.hora_agendada || 'Sem hora'} - ${os.companies?.nome_fantasia || 'Cliente'} - ${os.assets?.nome || 'Ativo'}`,
            data: { type: 'service_order_reminder', serviceOrderId: os.id },
            tag: `os-${os.id}`,
          }),
        });
      } catch (pushErr) {
        console.error(`Push error for OS #${os.numero_os}:`, pushErr);
      }

      await supabase
        .from('service_orders')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', os.id);
    }

    return new Response(JSON.stringify({
      success: true,
      processed: orders.length,
      morning: morningSent,
      reminders: remindersSent,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in check-service-orders-reminder:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
