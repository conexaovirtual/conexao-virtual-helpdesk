import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWabaText } from "../_shared/waba-provider.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DattoPayload {
  alertlevel?: string;
  device_id?: string;
  device_uid?: string;
  device_hostname?: string;
  device_ip?: string;
  device_os?: string;
  device_description?: string;
  site_id?: string;
  site_uid?: string;
  site_name?: string;
  alert_uid?: string;
  alert_type?: string;
  alert_category?: string;
  alert_message?: string;
  alert_priority?: string;
  platform?: string;
  last_user?: string;
  // Extended hardware fields
  device_type?: string;
  device_serial_number?: string;
  intIpAddress?: string;
  extIpAddress?: string;
  domain?: string;
  patchStatus?: string;
  cpus?: string;
  memory?: string;
  disks?: string;
  antivirus_product?: string;
  reboot_required?: boolean;
  last_reboot?: string;
}

// Build hardware configuracoes object from payload
function buildConfiguracoes(payload: DattoPayload): Record<string, any> {
  const config: Record<string, any> = {};
  if (payload.cpus) config.processador = payload.cpus;
  if (payload.memory) config.memoria_ram = payload.memory;
  if (payload.disks) config.armazenamento = payload.disks;
  if (payload.intIpAddress) config.ip_interno = payload.intIpAddress;
  if (payload.extIpAddress) config.ip_externo = payload.extIpAddress;
  if (payload.domain) config.dominio = payload.domain;
  if (payload.platform) config.plataforma = payload.platform;
  if (payload.last_user) config.ultimo_usuario = payload.last_user;
  if (payload.antivirus_product) config.antivirus = payload.antivirus_product;
  if (payload.patchStatus) config.patch_status = payload.patchStatus;
  if (payload.last_reboot) config.ultimo_reboot = payload.last_reboot;
  if (payload.reboot_required !== undefined) config.reboot_pendente = payload.reboot_required;
  if (payload.device_description) config.descricao_dispositivo = payload.device_description;
  return Object.keys(config).length > 0 ? config : null as any;
}

// Build rich observacoes string
function buildObservacoes(payload: DattoPayload, siteName: string, autoCreated: boolean): string {
  const parts = [`Ativo criado automaticamente via Datto RMM.`];
  if (siteName) parts.push(`Site: ${siteName}.`);
  if (payload.device_os) parts.push(`SO: ${payload.device_os}.`);
  if (payload.platform) parts.push(`Plataforma: ${payload.platform}.`);
  if (payload.last_user) parts.push(`Último usuário: ${payload.last_user}.`);
  if (payload.intIpAddress) parts.push(`IP interno: ${payload.intIpAddress}.`);
  if (payload.extIpAddress) parts.push(`IP externo: ${payload.extIpAddress}.`);
  if (payload.domain) parts.push(`Domínio: ${payload.domain}.`);
  if (autoCreated) parts.push('(Empresa também criada automaticamente)');
  return parts.join(' ');
}

function mapPriority(dattoP: string | undefined): string {
  switch (dattoP?.toLowerCase()) {
    case 'critical': return 'critica';
    case 'high':
    case 'warning': return 'alta';
    case 'moderate':
    case 'medium': return 'media';
    default: return 'baixa';
  }
}

function mapImpact(dattoP: string | undefined): string {
  switch (dattoP?.toLowerCase()) {
    case 'critical': return 'alto';
    case 'high':
    case 'warning': return 'alto';
    case 'moderate':
    case 'medium': return 'medio';
    default: return 'baixo';
  }
}

function mapUrgency(dattoP: string | undefined): string {
  switch (dattoP?.toLowerCase()) {
    case 'critical': return 'alta';
    case 'high':
    case 'warning': return 'alta';
    case 'moderate':
    case 'medium': return 'media';
    default: return 'baixa';
  }
}
// ─── Auto-link or create asset + company via AI ─────────────────────
async function autoLinkOrCreateAsset(supabase: any, payload: DattoPayload) {
  try {
    const siteName = payload.site_name || '';
    const hostname = payload.device_hostname || payload.device_id || 'Desconhecido';

    // Fetch all companies for AI matching
    const { data: companies } = await supabase
      .from('companies')
      .select('id, nome_fantasia, razao_social, cnpj')
      .eq('status', true);

    let companyId: string | null = null;
    let companyName = siteName || hostname;
    let autoCreated = false;

    if (companies && companies.length > 0 && siteName) {
      // Use AI to find best match
      const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
      if (openaiApiKey) {
        const companyList = companies.map((c: any) =>
          `ID: ${c.id} | Nome: ${c.nome_fantasia} | Razão: ${c.razao_social || 'N/A'}`
        ).join('\n');

        const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Você é um sistema de matching de empresas. Dado o nome de um site/cliente do Datto RMM, encontre a empresa correspondente na lista. 
Considere abreviações, variações e nomes parciais. Exemplo: "ACME Corp" pode ser "ACME Corporação Ltda".
Responda APENAS com o ID da empresa encontrada, ou "NONE" se nenhuma for compatível. Não adicione explicações.`
              },
              {
                role: "user",
                content: `Site Datto: "${siteName}"\nHostname: "${hostname}"\n\nEmpresas cadastradas:\n${companyList}`
              }
            ],
            temperature: 0.1,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const aiResult = aiData.choices?.[0]?.message?.content?.trim();
          
          if (aiResult && aiResult !== 'NONE') {
            const match = companies.find((c: any) => c.id === aiResult);
            if (match) {
              companyId = match.id;
              companyName = match.nome_fantasia;
              console.log(`AI matched site "${siteName}" to company "${companyName}" (${companyId})`);
            }
          }
        }
      }

      // Fallback: text match
      if (!companyId) {
        const siteNorm = siteName.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const c of companies) {
          const nameNorm = c.nome_fantasia.toLowerCase().replace(/[^a-z0-9]/g, '');
          const razaoNorm = (c.razao_social || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (siteNorm.includes(nameNorm) || nameNorm.includes(siteNorm) ||
              siteNorm.includes(razaoNorm) || razaoNorm.includes(siteNorm)) {
            companyId = c.id;
            companyName = c.nome_fantasia;
            console.log(`Fallback matched site "${siteName}" to company "${companyName}"`);
            break;
          }
        }
      }
    }

    // Auto-create company if no match
    if (!companyId) {
      const newCompanyName = siteName || `Datto - ${hostname}`;
      const { data: newCompany, error: companyError } = await supabase
        .from('companies')
        .insert({
          nome_fantasia: newCompanyName,
          tipo_contrato: 'eventual',
          status: true,
        })
        .select('id')
        .single();

      if (companyError) {
        console.error('Error auto-creating company:', companyError);
        return null;
      }

      companyId = newCompany.id;
      autoCreated = true;
      console.log(`Auto-created company "${newCompanyName}" (${companyId})`);

      await supabase.from('ai_alerts').insert({
        tipo: 'datto_auto_company_created',
        severidade: 'info',
        titulo: `Empresa criada automaticamente: ${newCompanyName}`,
        descricao: `A IA criou automaticamente a empresa "${newCompanyName}" a partir do site Datto "${siteName}". Verifique os dados e complete o cadastro (CNPJ, endereço, contrato, etc).`,
        acao_sugerida: `Acesse Empresas e complete o cadastro de "${newCompanyName}".`,
        dados: { site_name: siteName, device_hostname: hostname, auto_created: true } as any,
      });
    }

    // Determine asset type from hostname/OS
    let tipo = 'desktop';
    const osLower = (payload.device_os || '').toLowerCase();
    const hostLower = hostname.toLowerCase();
    if (hostLower.includes('srv') || hostLower.includes('server') || osLower.includes('server')) {
      tipo = 'servidor';
    } else if (hostLower.includes('nb') || hostLower.includes('laptop') || hostLower.includes('note')) {
      tipo = 'notebook';
    } else if (hostLower.includes('sw') || hostLower.includes('switch')) {
      tipo = 'switch';
    } else if (hostLower.includes('rt') || hostLower.includes('router')) {
      tipo = 'roteador';
    }

    // Create asset with enriched data
    const configuracoes = buildConfiguracoes(payload);
    const { data: newAsset, error: assetError } = await supabase
      .from('assets')
      .insert({
        nome: hostname,
        company_id: companyId,
        tipo,
        estado: 'em_uso',
        datto_device_id: payload.device_id || null,
        datto_device_uid: payload.device_uid || null,
        datto_site_id: payload.site_id || null,
        datto_status: 'online',
        datto_last_sync: new Date().toISOString(),
        sistema_operacional: payload.device_os || null,
        numero_serie: payload.device_serial_number || null,
        configuracoes: configuracoes,
        observacoes: buildObservacoes(payload, siteName, autoCreated),
      })
      .select('id, company_id, nome, estado')
      .single();

    if (assetError) {
      console.error('Error auto-creating asset:', assetError);
      return null;
    }

    console.log(`Auto-created asset "${hostname}" linked to company ${companyId}`);

    await supabase.from('ai_alerts').insert({
      tipo: 'datto_auto_asset_created',
      severidade: 'info',
      titulo: `Ativo criado automaticamente: ${hostname}`,
      descricao: `O ativo "${hostname}" foi criado e vinculado à empresa "${companyName}". Verifique as informações e complete o cadastro.`,
      acao_sugerida: `Acesse Ativos e complete o cadastro de "${hostname}" (fabricante, modelo, nº série, etc).`,
      dados: { device_hostname: hostname, device_id: payload.device_id, site_name: siteName, company_id: companyId, company_auto_created: autoCreated } as any,
    });

    return newAsset;
  } catch (err) {
    console.error('autoLinkOrCreateAsset error:', err);
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret (supports Authorization header or x-datto-secret header)
    const authHeader = req.headers.get('authorization');
    const dattoSecretHeader = req.headers.get('x-datto-secret');
    const webhookSecret = Deno.env.get('DATTO_WEBHOOK_SECRET');

    if (!webhookSecret) {
      console.error('DATTO_WEBHOOK_SECRET not configured');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = dattoSecretHeader || authHeader?.replace('Bearer ', '');
    if (token !== webhookSecret) {
      console.warn('Invalid webhook token received');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: DattoPayload = await req.json();
    console.log('Datto webhook received:', {
      alert_uid: payload.alert_uid,
      device_hostname: payload.device_hostname,
      alert_type: payload.alert_type,
      alert_priority: payload.alert_priority,
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ─── Deduplication: skip if same alert_uid was processed in last 5 minutes ───
    if (payload.alert_uid) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentDup } = await supabase
        .from('datto_alerts_log')
        .select('id')
        .eq('alert_uid', payload.alert_uid)
        .gte('created_at', fiveMinAgo)
        .maybeSingle();

      if (recentDup) {
        console.log(`Duplicate webhook detected (alert_uid: ${payload.alert_uid}), skipping`);
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'duplicate' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── Log the alert immediately to prevent race conditions ───────────
    const { data: alertLog } = await supabase
      .from('datto_alerts_log')
      .insert({
        alert_uid: payload.alert_uid || null,
        device_id: payload.device_id || null,
        device_hostname: payload.device_hostname || null,
        device_ip: payload.device_ip || null,
        site_name: payload.site_name || null,
        alert_type: payload.alert_type || null,
        alert_category: payload.alert_category || null,
        alert_message: payload.alert_message || null,
        alert_priority: payload.alert_priority || null,
        raw_payload: payload as any,
        processed: false,
      })
      .select('id')
      .single();

    if (!alertLog) {
      console.error('Failed to insert alert log (possible duplicate)');
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'insert_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const alertLogId = alertLog.id;

    // ─── Find or auto-create asset + company ───────────────────────────
    let asset = null;

    // 1. Try by datto_device_id
    if (payload.device_id) {
      const { data } = await supabase
        .from('assets')
        .select('id, company_id, nome, estado')
        .eq('datto_device_id', payload.device_id)
        .maybeSingle();
      asset = data;
    }

    // 2. Try by hostname
    if (!asset && payload.device_hostname) {
      const { data } = await supabase
        .from('assets')
        .select('id, company_id, nome, estado')
        .ilike('nome', `%${payload.device_hostname}%`)
        .maybeSingle();
      asset = data;
    }

    // 3. If no asset found, use AI to match/create company + asset
    if (!asset && (payload.device_hostname || payload.device_id)) {
      console.log('Asset not found, attempting AI auto-link...');
      asset = await autoLinkOrCreateAsset(supabase, payload);
    }

    // Update asset datto status + enrich missing fields
    if (asset) {
      const dattoStatus = payload.alertlevel === 'triggered' ? 'alert' : 'online';
      const updateData: Record<string, any> = {
        datto_status: dattoStatus,
        datto_last_sync: new Date().toISOString(),
        datto_device_id: payload.device_id || undefined,
        datto_device_uid: payload.device_uid || undefined,
        datto_site_id: payload.site_id || undefined,
      };

      // Enrich existing asset with missing data
      const { data: currentAsset } = await supabase
        .from('assets')
        .select('sistema_operacional, numero_serie, configuracoes')
        .eq('id', asset.id)
        .single();

      if (currentAsset) {
        if (!currentAsset.sistema_operacional && payload.device_os) {
          updateData.sistema_operacional = payload.device_os;
        }
        if (!currentAsset.numero_serie && payload.device_serial_number) {
          updateData.numero_serie = payload.device_serial_number;
        }
        // Merge configuracoes: keep existing, add new fields
        const newConfig = buildConfiguracoes(payload);
        if (newConfig) {
          const merged = { ...(currentAsset.configuracoes || {}), ...newConfig };
          updateData.configuracoes = merged;
        }
      }

      await supabase
        .from('assets')
        .update(updateData)
        .eq('id', asset.id);
    }

    // Create ticket for critical/warning alerts
    let ticketId = null;
    const priority = payload.alert_priority?.toLowerCase();

    // ─── Filter out power-off / power-loss alerts (no ticket needed) ───
    // Decode HTML entities before matching (Datto sends &agrave; &atilde; &lrm; etc.)
    const decodeHtml = (s: string) => s
      .replace(/&agrave;/g, 'à').replace(/&atilde;/g, 'ã').replace(/&aacute;/g, 'á')
      .replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó')
      .replace(/&uacute;/g, 'ú').replace(/&ccedil;/g, 'ç').replace(/&ntilde;/g, 'ñ')
      .replace(/&lrm;/g, '').replace(/&rlm;/g, '').replace(/&amp;/g, '&')
      .replace(/&#\d+;/g, '').replace(/&[a-z]+;/g, '');

    const alertMsgLower = decodeHtml((payload.alert_message || '').toLowerCase());
    const alertTypeLower = (payload.alert_type || '').toLowerCase();
    const alertCatLower = (payload.alert_category || '').toLowerCase();
    const combinedAlert = `${alertMsgLower} ${alertTypeLower} ${alertCatLower}`;

    const powerOffPatterns = [
      'unexpected shutdown', 'improper shutdown', 'unclean shutdown',
      'power loss', 'power failure', 'power off', 'poweroff',
      'desligamento indevido', 'desligamento inesperado',
      'desligamento do sistema', 'não era esperado', 'nao era esperado',
      'queda de energia', 'falta de energia', 'energy loss',
      'ups battery', 'power supply failure',
      'the system has rebooted without cleanly shutting down',
      'kernel-power', 'event 41',
      'last shutdown was unexpected',
    ];

    const isPowerOffAlert = powerOffPatterns.some(pattern => combinedAlert.includes(pattern));

    if (isPowerOffAlert) {
      console.log(`Power-off/energy alert detected, skipping ticket creation: "${payload.alert_message}"`);
      // Still log it but mark as processed without ticket
      await supabase
        .from('datto_alerts_log')
        .update({ processed: true })
        .eq('id', alertLogId);

      return new Response(JSON.stringify({ 
        ok: true, 
        skipped: true, 
        reason: 'power_off_alert_filtered',
        alert_message: payload.alert_message,
        asset_id: asset?.id || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shouldCreateTicket = priority === 'critical' || priority === 'high' || priority === 'warning';

    if (shouldCreateTicket && asset) {
          // Enrich alert with AI
          let descricao = '';
          try {
            const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
            if (openaiApiKey) {
              const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${openaiApiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                    {
                      role: "system",
                      content: `Você é um especialista em TI. Recebeu um alerta de monitoramento Datto RMM. Traduza a mensagem técnica em uma descrição clara e útil em português brasileiro. Inclua:
1. O que o alerta significa
2. Possível impacto no usuário
3. 2-3 ações imediatas recomendadas
Seja conciso (máx 150 palavras). Responda apenas o texto.`
                    },
                    {
                      role: "user",
                      content: `Alerta: ${payload.alert_type || 'N/A'}
Categoria: ${payload.alert_category || 'N/A'}
Mensagem: ${payload.alert_message || 'N/A'}
Dispositivo: ${payload.device_hostname || 'N/A'} (${payload.device_os || 'N/A'})
Plataforma: ${payload.platform || 'N/A'}
IP Interno: ${payload.intIpAddress || 'N/A'}
IP Externo: ${payload.extIpAddress || 'N/A'}
Último Usuário: ${payload.last_user || 'N/A'}
Domínio: ${payload.domain || 'N/A'}
Prioridade: ${payload.alert_priority || 'N/A'}
Reboot Pendente: ${payload.reboot_required ? 'Sim' : 'Não'}`
                    }
                  ],
                  temperature: 0.3,
                }),
              });

              if (aiResponse.ok) {
                const aiData = await aiResponse.json();
                const aiText = aiData.choices?.[0]?.message?.content?.trim();
                if (aiText) {
                  descricao = [
                    `🔔 Alerta automático do Datto RMM`,
                    ``,
                    `**Dispositivo:** ${payload.device_hostname || 'N/A'}`,
                    `**IP Interno:** ${payload.intIpAddress || payload.device_ip || 'N/A'}`,
                    `**IP Externo:** ${payload.extIpAddress || 'N/A'}`,
                    `**SO:** ${payload.device_os || 'N/A'}`,
                    `**Plataforma:** ${payload.platform || 'N/A'}`,
                    `**Site:** ${payload.site_name || 'N/A'}`,
                    `**Domínio:** ${payload.domain || 'N/A'}`,
                    `**Tipo de Alerta:** ${payload.alert_type || 'N/A'}`,
                    `**Categoria:** ${payload.alert_category || 'N/A'}`,
                    payload.reboot_required ? `⚠️ **Reboot pendente!**` : '',
                    ``,
                    `**Mensagem Original:** ${payload.alert_message || 'Sem detalhes'}`,
                    ``,
                    `---`,
                    `🤖 **Análise da IA:**`,
                    aiText,
                    ``,
                    `_Último usuário logado: ${payload.last_user || 'N/A'}_`,
                  ].filter(Boolean).join('\n');
                }
              }
            }
          } catch (aiErr) {
            console.error('AI enrichment error (non-fatal):', aiErr);
          }

          // Fallback description without AI
          if (!descricao) {
            descricao = [
              `🔔 Alerta automático do Datto RMM`,
              ``,
              `**Dispositivo:** ${payload.device_hostname || 'N/A'}`,
              `**IP Interno:** ${payload.intIpAddress || payload.device_ip || 'N/A'}`,
              `**IP Externo:** ${payload.extIpAddress || 'N/A'}`,
              `**SO:** ${payload.device_os || 'N/A'}`,
              `**Plataforma:** ${payload.platform || 'N/A'}`,
              `**Site:** ${payload.site_name || 'N/A'}`,
              `**Domínio:** ${payload.domain || 'N/A'}`,
              `**Tipo de Alerta:** ${payload.alert_type || 'N/A'}`,
              `**Categoria:** ${payload.alert_category || 'N/A'}`,
              payload.reboot_required ? `⚠️ **Reboot pendente!**` : '',
              ``,
              `**Mensagem:** ${payload.alert_message || 'Sem detalhes'}`,
              ``,
              `_Último usuário logado: ${payload.last_user || 'N/A'}_`,
            ].filter(Boolean).join('\n');
          }

          const TECNICO_ID = 'e336e78e-c11a-48b5-8d69-2bb48cf6bb3b';
          const TECNICO_PHONE = '5562984515801';

          const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .insert({
              company_id: asset.company_id,
              titulo: `[DATTO] ${payload.alert_type || 'Alerta'}: ${payload.device_hostname || 'Dispositivo'}`,
              descricao,
              canal: 'monitoramento',
              status: 'em_atendimento',
              impacto: mapImpact(payload.alert_priority),
              urgencia: mapUrgency(payload.alert_priority),
              asset_id: asset.id,
              tecnico_id: TECNICO_ID,
              solicitante_id: TECNICO_ID,
            })
            .select('id, numero')
            .single();

          if (ticketError) {
            console.error('Error creating ticket:', ticketError);
          } else {
            ticketId = ticket.id;
            console.log(`Ticket #${ticket.numero} created for alert`);

            // Update asset to maintenance if critical
            if (priority === 'critical') {
              await supabase
                .from('assets')
                .update({ estado: 'manutencao' })
                .eq('id', asset.id);
            }

            // ─── Smart Scheduler: classify modality & create OS ───────
            try {
              const schedulerResponse = await fetch(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/smart-scheduler`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                  },
                  body: JSON.stringify({
                    tecnico_id: TECNICO_ID,
                    alert_type: payload.alert_type,
                    alert_category: payload.alert_category,
                    description: payload.alert_message,
                    prioridade: mapPriority(payload.alert_priority),
                  }),
                }
              );

              if (schedulerResponse.ok) {
                const slot = await schedulerResponse.json();
                if (slot.success) {
                  // Get next OS number
                  const { data: lastOs } = await supabase
                    .from('service_orders')
                    .select('numero_os')
                    .order('numero_os', { ascending: false })
                    .limit(1);
                  const nextNumber = (lastOs?.[0]?.numero_os || 0) + 1;

                  // Get company details
                  const { data: company } = await supabase
                    .from('companies')
                    .select('endereco, telefone')
                    .eq('id', asset.company_id)
                    .single();

                  const { data: os, error: osError } = await supabase
                    .from('service_orders')
                    .insert({
                      company_id: asset.company_id,
                      ticket_id: ticket.id,
                      asset_id: asset.id,
                      tecnico_id: TECNICO_ID,
                      tipo_servico: slot.modalidade === 'remoto' ? 'remoto' : 'corretivo',
                      prioridade: mapPriority(payload.alert_priority),
                      modalidade: slot.modalidade,
                      descricao_servicos: `[DATTO] ${payload.alert_type || 'Alerta'}: ${payload.device_hostname || 'Dispositivo'}\n\n${payload.alert_message || 'Sem detalhes'}`,
                      data_agendada: `${slot.data}T${slot.hora_inicio}:00`,
                      hora_agendada: slot.hora_inicio,
                      status: 'agendada',
                      numero_os: nextNumber,
                      endereco_atendimento: slot.modalidade === 'presencial' ? (company?.endereco || null) : null,
                      telefone_contato: company?.telefone || null,
                      observacoes: `OS criada automaticamente pelo Datto RMM.\nModalidade: ${slot.modalidade}\nSlot: ${slot.data} ${slot.hora_inicio}-${slot.hora_fim}`,
                    })
                    .select('id, numero_os')
                    .single();

                  if (osError) {
                    console.error('Error creating OS from Datto:', osError);
                  } else {
                    console.log(`OS #${os.numero_os} created (${slot.modalidade}) for ticket #${ticket.numero} at ${slot.data} ${slot.hora_inicio}`);
                  }
                }
              }
            } catch (schedErr) {
              console.error('Smart scheduler error (non-fatal):', schedErr);
            }

            // Send push notification to technicians
            try {
              await fetch(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                  },
                  body: JSON.stringify({
                    role: 'tecnico',
                    title: `🔔 [DATTO] ${payload.alert_type || 'Alerta'}`,
                    body: `${payload.device_hostname}: ${payload.alert_message || 'Alerta de monitoramento'}`,
                    tag: `datto-${payload.alert_uid}`,
                    data: { ticketId: ticket.id, url: `/tickets/${ticket.id}` },
                  }),
                }
              );
            } catch (pushErr) {
              console.error('Push notification error (non-fatal):', pushErr);
            }

            // Send WhatsApp notification to technician
            try {
              const whatsappMsg = [
                `🔔 *Alerta Datto RMM - Chamado #${ticket.numero}*`,
                ``,
                `📌 *Dispositivo:* ${payload.device_hostname || 'N/A'}`,
                `🏢 *Site:* ${payload.site_name || 'N/A'}`,
                `⚠️ *Tipo:* ${payload.alert_type || 'N/A'}`,
                `🔴 *Prioridade:* ${payload.alert_priority || 'N/A'}`,
                ``,
                `💬 *Mensagem:* ${payload.alert_message || 'Sem detalhes'}`,
                ``,
                `O chamado já foi aberto e atribuído a você. Acesse o sistema para mais detalhes.`,
              ].join('\n');

              await sendWabaText(TECNICO_PHONE, whatsappMsg, { openTicket: false });
              console.log(`WhatsApp notification sent to technician for ticket #${ticket.numero}`);
            } catch (waErr) {
              console.error('WhatsApp notification error (non-fatal):', waErr);
            }
          }
    } else if (shouldCreateTicket && !asset) {
      // Asset auto-creation failed - log warning
      console.warn('Could not auto-create asset for device:', payload.device_hostname);
    }

    // Update the alert log with asset/ticket references
    await supabase.from('datto_alerts_log').update({
      asset_id: asset?.id || null,
      ticket_id: ticketId,
      processed: true,
    }).eq('id', alertLogId);

    return new Response(
      JSON.stringify({
        success: true,
        asset_found: !!asset,
        ticket_created: !!ticketId,
        ticket_id: ticketId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Datto webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
