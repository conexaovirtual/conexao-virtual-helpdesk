import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Business hours slots (2h each)
const PRESENCIAL_SLOTS = [
  { inicio: '08:00', fim: '10:00' },
  { inicio: '10:00', fim: '12:00' },
  { inicio: '14:00', fim: '16:00' },
  { inicio: '16:00', fim: '18:00' },
];

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6; // 0=Sun, 6=Sat
}

function nextBusinessDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (!isWeekday(next)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function todayOrNextBusinessDay(desiredDate?: string): Date {
  const now = new Date();
  let target: Date;

  if (desiredDate) {
    target = new Date(desiredDate + 'T00:00:00');
  } else {
    target = now;
  }

  // If target is in the past (before today), use today
  const todayStr = formatDate(now);
  const targetStr = formatDate(target);
  if (targetStr < todayStr) {
    target = now;
  }

  // If not a weekday, advance
  while (!isWeekday(target)) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

// Classify modality based on alert type/category
function classifyModality(alertType?: string, alertCategory?: string, description?: string): 'remoto' | 'presencial' {
  const text = `${alertType || ''} ${alertCategory || ''} ${description || ''}`.toLowerCase();

  const remoteKeywords = [
    'software', 'service', 'patch', 'update', 'config', 'backup', 'policy',
    'antivirus', 'windows update', 'dns', 'dhcp', 'gpo', 'script',
    'certificate', 'license', 'password', 'permission', 'access',
    'disk space', 'memory usage', 'cpu usage', 'event log',
    'reboot', 'restart', 'login', 'remote', 'vpn', 'firewall rule',
    'email', 'outlook', 'office', 'teams', 'onedrive', 'sharepoint',
  ];

  const onsiteKeywords = [
    'hardware', 'physical', 'cable', 'printer jam', 'replacement',
    'toner', 'paper', 'monitor', 'keyboard', 'mouse', 'ups',
    'power supply', 'motherboard', 'ram stick', 'hard drive',
    'network port', 'switch port', 'rack', 'cabling', 'installation',
  ];

  // Check onsite first (more specific)
  for (const kw of onsiteKeywords) {
    if (text.includes(kw)) return 'presencial';
  }

  // Then check remote
  for (const kw of remoteKeywords) {
    if (text.includes(kw)) return 'remoto';
  }

  // Default: presencial (safer)
  return 'presencial';
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

    const body = await req.json();
    const {
      tecnico_id,
      data_desejada,
      modalidade,
      prioridade,
      alert_type,
      alert_category,
      description,
    } = body;

    // Auto-classify if modalidade not provided
    const effectiveModalidade = modalidade || classifyModality(alert_type, alert_category, description);

    // Remote: no slot blocking
    if (effectiveModalidade === 'remoto') {
      const targetDate = todayOrNextBusinessDay(data_desejada);
      return new Response(JSON.stringify({
        success: true,
        data: formatDate(targetDate),
        hora_inicio: '08:00',
        hora_fim: '18:00',
        modalidade: 'remoto',
        message: 'Atendimento remoto agendado. Sem bloqueio de horário.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Presencial: find next available 2h slot
    let targetDate = todayOrNextBusinessDay(data_desejada);
    const maxDaysSearch = 30; // Don't search more than 30 business days ahead
    let daysSearched = 0;

    while (daysSearched < maxDaysSearch) {
      const dateStr = formatDate(targetDate);

      // Query existing presencial OS for this technician on this date
      const query = supabase
        .from('service_orders')
        .select('hora_agendada, data_agendada')
        .eq('modalidade', 'presencial')
        .in('status', ['agendada', 'em_execucao'])
        .gte('data_agendada', `${dateStr}T00:00:00`)
        .lte('data_agendada', `${dateStr}T23:59:59`);

      // Filter by technician if provided
      if (tecnico_id) {
        query.eq('tecnico_id', tecnico_id);
      }

      const { data: existingOS } = await query;

      // Build set of occupied slots
      const occupiedSlots = new Set<string>();
      for (const os of (existingOS || [])) {
        if (os.hora_agendada) {
          // hora_agendada is stored as time (HH:MM or HH:MM:SS)
          const hora = String(os.hora_agendada).substring(0, 5);
          occupiedSlots.add(hora);
        }
      }

      // Find first available slot
      // If priority is critical, try to fit today even if not ideal
      const slotsToCheck = prioridade === 'critica' || prioridade === 'alta'
        ? PRESENCIAL_SLOTS // Check all slots for high priority
        : PRESENCIAL_SLOTS;

      for (const slot of slotsToCheck) {
        if (!occupiedSlots.has(slot.inicio)) {
          // Check if this slot is still in the future (for today)
          const now = new Date();
          const todayStr = formatDate(now);
          if (dateStr === todayStr) {
            const currentHour = now.getHours();
            const currentMin = now.getMinutes();
            const [slotH, slotM] = slot.inicio.split(':').map(Number);
            if (slotH < currentHour || (slotH === currentHour && slotM <= currentMin)) {
              continue; // Skip past slots for today
            }
          }

          return new Response(JSON.stringify({
            success: true,
            data: dateStr,
            hora_inicio: slot.inicio,
            hora_fim: slot.fim,
            modalidade: 'presencial',
            message: `Slot presencial disponível: ${dateStr} ${slot.inicio}-${slot.fim}`,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // All slots occupied, try next business day
      targetDate = nextBusinessDay(targetDate);
      daysSearched++;
    }

    // Fallback: couldn't find slot in 30 days
    return new Response(JSON.stringify({
      success: false,
      error: 'Não foi possível encontrar um slot disponível nos próximos 30 dias úteis.',
      modalidade: 'presencial',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Smart scheduler error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
