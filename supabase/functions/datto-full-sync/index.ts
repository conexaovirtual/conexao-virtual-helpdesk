import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

const VALID_ASSET_TYPES = new Set(["desktop","notebook","impressora","monitor","roteador","switch","servidor","periferico","camera","outro"]);

function inferAssetType(hostname: string): string {
  const h = hostname.toLowerCase();
  if (/srv|server|serv|dc\d|ad\d|hyperv|cluster/i.test(h)) return "servidor";
  if (/nb|note|lap|laptop/i.test(h)) return "notebook";
  if (/\bcam\d|cameras?[-_]|dvr|nvr|cftv/i.test(h)) return "camera";
  if (/print|imp|mfp/i.test(h)) return "impressora";
  if (/sw|switch/i.test(h)) return "switch";
  if (/ap|wifi|roteador|router|mikrotik/i.test(h)) return "roteador";
  if (/mon|display/i.test(h)) return "monitor";
  return "desktop";
}

// ── Token management (reused from datto-check-offline) ──

interface StoredToken {
  id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

async function getStoredToken(supabase: any): Promise<StoredToken | null> {
  const { data, error } = await supabase
    .from("datto_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) return null;
  return data as StoredToken;
}

function isTokenExpired(token: StoredToken): boolean {
  if (!token.expires_at) return false;
  return new Date(token.expires_at).getTime() - 5 * 60 * 1000 < Date.now();
}

async function refreshAccessToken(supabase: any, storedToken: StoredToken, dattoApiUrl: string): Promise<string> {
  if (!storedToken.refresh_token) throw new Error("Token expirado e sem refresh_token. Reautorize o Datto.");
  const tokenUrl = `${dattoApiUrl}/auth/oauth/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa("public-client:public")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: storedToken.refresh_token }).toString(),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Falha ao renovar token Datto (${response.status}). Reautorize.`);
  const tokenData = JSON.parse(body);
  const newAccessToken = tokenData.access_token as string;
  if (!newAccessToken) throw new Error("access_token não encontrado na renovação.");
  const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null;
  await supabase.from("datto_oauth_tokens").update({
    access_token: newAccessToken,
    refresh_token: tokenData.refresh_token || storedToken.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq("id", storedToken.id);
  return newAccessToken;
}

// Autentica via API Key + Secret do Datto (password grant) — sem login manual, renovável sempre.
async function mintTokenWithApiKey(supabase: any, dattoApiUrl: string, storedToken: StoredToken | null): Promise<string> {
  const apiKey = Deno.env.get("DATTO_API_KEY");
  const apiSecret = Deno.env.get("DATTO_API_SECRET_KEY");
  if (!apiKey || !apiSecret) {
    throw new Error("Token Datto expirado e sem refresh_token. Configure DATTO_API_KEY/DATTO_API_SECRET_KEY ou reautorize o Datto.");
  }
  const tokenUrl = `${dattoApiUrl}/auth/oauth/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa("public-client:public")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "password", username: apiKey, password: apiSecret }).toString(),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Falha ao autenticar no Datto via API Key (${response.status}).`);
  const tokenData = JSON.parse(body);
  const accessToken = tokenData.access_token as string;
  if (!accessToken) throw new Error("access_token não retornado na autenticação via API Key.");
  const refreshToken = (tokenData.refresh_token as string | undefined) || null;
  const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null;
  if (storedToken) {
    await supabase.from("datto_oauth_tokens").update({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, updated_at: new Date().toISOString() }).eq("id", storedToken.id);
  } else {
    await supabase.from("datto_oauth_tokens").insert({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt });
  }
  return accessToken;
}

async function getDattoAccessToken(supabase: any, dattoApiUrl: string): Promise<string> {
  const storedToken = await getStoredToken(supabase);
  if (storedToken && !isTokenExpired(storedToken)) return storedToken.access_token;
  if (storedToken?.refresh_token) {
    try {
      return await refreshAccessToken(supabase, storedToken, dattoApiUrl);
    } catch (e) {
      console.warn("[Datto] Refresh falhou, tentando API Key:", (e as Error).message);
    }
  }
  return await mintTokenWithApiKey(supabase, dattoApiUrl, storedToken);
}

// ── Datto API calls ──

async function fetchDattoJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Datto HTTP ${response.status}: ${body.substring(0, 200)}`);
  return JSON.parse(body);
}

async function fetchAllDevices(apiUrl: string, token: string): Promise<any[]> {
  const endpointCandidates = ["/api/v2/account/devices", "/api/v2/device", "/api/v2/devices"];
  const perPage = 250;
  const maxPages = 20;

  for (const endpoint of endpointCandidates) {
    const allDevices: any[] = [];
    try {
      for (let page = 0; page < maxPages; page++) {
        const query = endpoint === "/api/v2/account/devices"
          ? `max=${perPage}&page=${page}`
          : `page=${page + 1}&perPage=${perPage}`;
        const data = await fetchDattoJson(`${apiUrl}${endpoint}?${query}`, token) as any;
        const list =
          (Array.isArray(data?.devices) && data.devices) ||
          (Array.isArray(data?.items) && data.items) ||
          (Array.isArray(data?.results) && data.results) ||
          (Array.isArray(data) ? data : []);
        if (!Array.isArray(list) || list.length === 0) break;
        allDevices.push(...list);
        if (list.length < perPage) break;
      }
      if (allDevices.length > 0) {
        console.log(`[FullSync] Endpoint OK: ${endpoint}, ${allDevices.length} devices`);
        return allDevices;
      }
    } catch (err: any) {
      if (err.message?.includes("HTTP 404")) continue;
      throw err;
    }
  }
  return [];
}

async function fetchDeviceDetails(apiUrl: string, token: string, uid: string, fetchAudit = false): Promise<any> {
  try {
    const device = await fetchDattoJson(`${apiUrl}/api/v2/device/${uid}`, token) as any;
    if (fetchAudit) {
    try {
      const audit = await fetchDattoJson(`${apiUrl}/api/v2/audit/device/${uid}`, token) as any;
      if (audit) device._audit = audit;
    } catch { /* audit endpoint may not exist for all devices */ }
    }
    return device;
  } catch {
    return null;
  }
}

// Batch fetch with concurrency limit
async function fetchDetailsBatch(apiUrl: string, token: string, uids: string[], concurrency = 5, auditUids: Set<string> = new Set()): Promise<Map<string, any>> {
  const results = new Map<string, any>();
  for (let i = 0; i < uids.length; i += concurrency) {
    const batch = uids.slice(i, i + concurrency);
    const details = await Promise.all(batch.map(uid => fetchDeviceDetails(apiUrl, token, uid, auditUids.has(uid))));
    batch.forEach((uid, idx) => {
      if (details[idx]) results.set(uid, details[idx]);
    });
  }
  return results;
}

// ── Build configuracoes JSON from Datto audit data ──

function buildConfiguracoes(detail: any): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const audit = detail?._audit;
  const sysInfo = audit?.systemInfo;

  // Processador — from audit.processors array
  const processors = audit?.processors;
  if (Array.isArray(processors) && processors.length > 0) {
    const p = processors[0];
    config.processador = p.name ?? p.manufacturer ?? "Desconhecido";
    if (p.cores) config.processador_cores = Number(p.cores);
    if (p.logicalCores) config.processador_threads = Number(p.logicalCores);
    if (p.clockSpeed) config.processador_ghz = (Number(p.clockSpeed) / 1000).toFixed(1);
  }
  // Fallback: systemInfo.totalCpuCores
  if (!config.processador_cores && sysInfo?.totalCpuCores) {
    config.processador_cores = Number(sysInfo.totalCpuCores);
  }

  // Memória RAM — from systemInfo.totalPhysicalMemory (in bytes)
  if (sysInfo?.totalPhysicalMemory && Number(sysInfo.totalPhysicalMemory) > 0) {
    config.memoria_ram_gb = Math.round(Number(sysInfo.totalPhysicalMemory) / (1024 * 1024 * 1024));
  }
  // Physical memory modules detail
  const memModules = audit?.physicalMemory;
  if (Array.isArray(memModules) && memModules.length > 0) {
    config.memoria_ram_slots = memModules.length;
    const types = memModules.map((m: any) => m.memoryType).filter(Boolean);
    if (types.length > 0) config.memoria_ram_tipo = types[0];
  }

  // Discos — from audit.logicalDisks
  const disks = audit?.logicalDisks;
  if (Array.isArray(disks) && disks.length > 0) {
    config.armazenamento = disks.map((d: any) => ({
      disco: d.name ?? d.caption ?? "?",
      total_gb: d.size ? Math.round(Number(d.size) / (1024 * 1024 * 1024)) : null,
      livre_gb: d.freeSpace ? Math.round(Number(d.freeSpace) / (1024 * 1024 * 1024)) : null,
      tipo: d.description ?? d.fileSystem ?? null,
    }));
  }

  // Placa de vídeo — from audit.videoBoards
  const videoBoards = audit?.videoBoards;
  if (Array.isArray(videoBoards) && videoBoards.length > 0) {
    config.placa_video = videoBoards[0].name ?? videoBoards[0].description ?? null;
    if (videoBoards[0].adapterRam) {
      config.placa_video_memoria_gb = Math.round(Number(videoBoards[0].adapterRam) / (1024 * 1024 * 1024));
    }
  }

  // NICs / IPs — from audit.nics + device top-level
  const intIp = detail?.intIpAddress;
  if (intIp) config.ip_interno = String(intIp);
  const extIp = detail?.extIpAddress;
  if (extIp) config.ip_externo = String(extIp);

  // Fabricante e modelo do sistema
  if (sysInfo?.manufacturer) config.fabricante_sistema = String(sysInfo.manufacturer);
  if (sysInfo?.model) config.modelo_sistema = String(sysInfo.model);

  // Domínio
  const domain = detail?.domain;
  if (domain) config.dominio = String(domain);

  // Último usuário
  const lastUser = detail?.lastLoggedInUser ?? sysInfo?.username;
  if (lastUser) config.ultimo_usuario = String(lastUser);

  // MAC address from NICs
  const nics = audit?.nics;
  if (Array.isArray(nics) && nics.length > 0) {
    const mainNic = nics.find((n: any) => n.type === "Ethernet") ?? nics[0];
    if (mainNic?.macAddress) config.mac_address = String(mainNic.macAddress);
  }

  return config;
}

// ── Changelog helpers ──

const TRACKED_DIRECT_FIELDS = ["nome", "fabricante", "modelo", "numero_serie", "sistema_operacional", "tipo"];
const TRACKED_CONFIG_KEYS = [
  "processador", "processador_cores", "processador_threads", "processador_ghz",
  "memoria_ram_gb", "memoria_ram_slots", "memoria_ram_tipo",
  "placa_video", "placa_video_memoria_gb",
  "ip_interno", "ip_externo", "mac_address", "ultimo_usuario", "dominio",
  "fabricante_sistema", "modelo_sistema",
];

function sortedStringify(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val === "object") return JSON.stringify(val, Object.keys(val as any).sort());
  return String(val);
}

function normalizedStringify(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (Array.isArray(val)) {
    return JSON.stringify(val.map((item: any) => {
      if (typeof item === "object" && item !== null) {
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(item).sort()) sorted[k] = item[k];
        return sorted;
      }
      return item;
    }));
  }
  if (typeof val === "object") return JSON.stringify(val, Object.keys(val as any).sort());
  return String(val);
}

async function logAssetChanges(
  supabase: any,
  assetId: string,
  oldAsset: any,
  newDirectFields: Record<string, unknown>,
  newConfiguracoes: Record<string, unknown>,
): Promise<number> {
  const rows: any[] = [];

  // Compare direct fields
  for (const field of TRACKED_DIRECT_FIELDS) {
    if (!(field in newDirectFields) || newDirectFields[field] === undefined || newDirectFields[field] === null) continue;
    const oldVal = sortedStringify(oldAsset[field]);
    const newVal = sortedStringify(newDirectFields[field]);
    if (oldVal !== newVal && newVal) {
      rows.push({ asset_id: assetId, campo: field, valor_anterior: oldVal, valor_novo: newVal, observacao: "Sincronização Datto RMM" });
    }
  }

  // Compare configuracoes keys (scalar values)
  const oldConfig = (oldAsset.configuracoes && typeof oldAsset.configuracoes === "object") ? oldAsset.configuracoes as Record<string, unknown> : {};
  for (const key of TRACKED_CONFIG_KEYS) {
    if (!(key in newConfiguracoes) || newConfiguracoes[key] === undefined || newConfiguracoes[key] === null) continue;
    const oldVal = sortedStringify(oldConfig[key]);
    const newVal = sortedStringify(newConfiguracoes[key]);
    if (oldVal !== newVal && newVal) {
      rows.push({ asset_id: assetId, campo: `configuracoes.${key}`, valor_anterior: oldVal, valor_novo: newVal, observacao: "Sincronização Datto RMM" });
    }
  }

  // Compare armazenamento (array) with normalized key order
  if (newConfiguracoes.armazenamento) {
    const oldStorage = normalizedStringify(oldConfig.armazenamento);
    const newStorage = normalizedStringify(newConfiguracoes.armazenamento);
    if (oldStorage !== newStorage) {
      rows.push({ asset_id: assetId, campo: "configuracoes.armazenamento", valor_anterior: oldStorage, valor_novo: newStorage, observacao: "Sincronização Datto RMM" });
    }
  }

  if (rows.length > 0) {
    await supabase.from("asset_changelog").insert(rows);
  }
  return rows.length;
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dattoApiUrl = Deno.env.get("DATTO_API_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Get token
    console.log("[FullSync] Obtendo access token...");
    const accessToken = await getDattoAccessToken(supabase, dattoApiUrl);

    // 2. Fetch all devices
    console.log("[FullSync] Buscando todos os dispositivos...");
    const devices = await fetchAllDevices(dattoApiUrl, accessToken);
    console.log(`[FullSync] ${devices.length} dispositivos encontrados.`);

    if (devices.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Nenhum dispositivo encontrado no Datto.", report: { total: 0 } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Fetch hardware details + audit for all devices
    const uids = devices.map((d: any) => String(d.uid ?? d.deviceUid ?? d.device_uid ?? d.id ?? "")).filter(Boolean);
    const auditUids = new Set(uids); // Fetch audit for ALL devices
    console.log(`[FullSync] Buscando detalhes + audit para ${uids.length} dispositivos...`);
    const detailsMap = await fetchDetailsBatch(dattoApiUrl, accessToken, uids, 10, auditUids);
    console.log(`[FullSync] Detalhes obtidos para ${detailsMap.size} dispositivos.`);

    const { data: existingAssets } = await supabase
      .from("assets")
      .select("id, nome, datto_device_uid, datto_device_id, company_id, fabricante, modelo, numero_serie, sistema_operacional, tipo, configuracoes")
      .or("datto_device_id.not.is.null,datto_device_uid.not.is.null");

    const assetByUid = new Map<string, any>();
    const assetById = new Map<string, any>();
    for (const a of existingAssets || []) {
      if (a.datto_device_uid) assetByUid.set(String(a.datto_device_uid), a);
      if (a.datto_device_id) assetById.set(String(a.datto_device_id), a);
    }

    const { data: companies } = await supabase.from("companies").select("id, nome_fantasia, datto_site_id");
    const companyList = companies || [];

    // Build maps for quick lookup
    const companyBySiteId = new Map<string, any>();
    for (const c of companyList) {
      if (c.datto_site_id) companyBySiteId.set(String(c.datto_site_id), c);
    }

    function findCompanyId(siteName: string, siteId?: string): string | null {
      // 1. Try exact match by Datto Site ID first
      if (siteId) {
        const byId = companyBySiteId.get(String(siteId));
        if (byId) return byId.id;
      }
      // 2. Fallback to fuzzy match by name
      if (!siteName) return null;
      for (const c of companyList) {
        if (fuzzyMatch(siteName, c.nome_fantasia)) return c.id;
      }
      return null;
    }

    // 5. Process each device
    const now = new Date().toISOString();
    let updated = 0;
    let created = 0;
    let companiesCreated = 0;
    const createdDevices: { id: string; nome: string; companyId: string; companyName: string; tipo: string }[] = [];
    const createdCompanies: { id: string; nome: string }[] = [];
    const syncedAssetIds = new Set<string>();

    // Helper: find or create company
    async function findOrCreateCompanyId(siteName: string, siteId?: string): Promise<string | null> {
      if (!siteName && !siteId) return null;
      // Try exact/fuzzy match first
      const existingId = findCompanyId(siteName, siteId);
      if (existingId) {
        // Auto-save datto_site_id on the company if not set yet
        if (siteId) {
          const company = companyList.find(c => c.id === existingId);
          if (company && !company.datto_site_id) {
            await supabase.from("companies").update({ datto_site_id: String(siteId) }).eq("id", existingId);
            company.datto_site_id = String(siteId);
            companyBySiteId.set(String(siteId), company);
          }
        }
        return existingId;
      }
      // Auto-create company from Datto site name
      const nomeFantasia = siteName.trim();
      if (!nomeFantasia) return null;
      console.log(`[FullSync] Criando empresa automaticamente: "${nomeFantasia}" (siteId: ${siteId})`);
      const insertData: Record<string, unknown> = {
        nome_fantasia: nomeFantasia,
        tipo_contrato: "eventual",
        status: true,
      };
      if (siteId) insertData.datto_site_id = String(siteId);
      const { data: newCompany, error } = await supabase.from("companies").insert(insertData).select("id, nome_fantasia, datto_site_id").single();
      if (error || !newCompany) {
        console.error(`[FullSync] Erro ao criar empresa "${nomeFantasia}":`, error?.message);
        return null;
      }
      // Add to local list so subsequent devices in same site reuse it
      companyList.push(newCompany);
      if (newCompany.datto_site_id) companyBySiteId.set(String(newCompany.datto_site_id), newCompany);
      createdCompanies.push({ id: newCompany.id, nome: newCompany.nome_fantasia });
      companiesCreated++;
      return newCompany.id;
    }

    for (const device of devices) {
      const uid = String(device.uid ?? device.deviceUid ?? device.device_uid ?? "");
      const deviceId = String(device.id ?? device.deviceId ?? device.device_id ?? "");
      const hostname = String(device.hostname ?? device.deviceName ?? device.name ?? "Sem nome");
      const siteName = String(device.siteName ?? device.site_name ?? device.siteDescription ?? "");
      const siteId = String(device.siteId ?? device.site_id ?? device.siteUid ?? "");
      const isOnline = device.online === true || String(device.online).toLowerCase() === "true" || String(device.status).toLowerCase() === "online";

      const detail = detailsMap.get(uid) || detailsMap.get(deviceId);
      const configuracoes = detail ? buildConfiguracoes(detail) : {};
      const os = detail?.operatingSystem ?? detail?.os ?? detail?.osName ?? null;
      const serial = detail?.serialNumber ?? detail?.serial ?? null;
      const dattoStatus = isOnline ? "online" : "offline";
      const sysInfo = detail?._audit?.systemInfo;
      const fabricante = sysInfo?.manufacturer ?? null;
      const modelo = sysInfo?.model ?? null;

      // Check if asset exists
      const existingAsset = assetByUid.get(uid) || assetById.get(deviceId);

      if (existingAsset) {
        syncedAssetIds.add(existingAsset.id);
        // Update existing
        const updateData: Record<string, unknown> = {
          datto_status: dattoStatus,
          datto_last_sync: now,
          updated_at: now,
          ...(siteId ? { datto_site_id: siteId } : {}),
        };
        // Update hostname if changed in Datto
        if (hostname && hostname !== "Sem nome" && hostname !== existingAsset.nome) {
          updateData.nome = hostname;
          console.log(`[FullSync] Renomeando "${existingAsset.nome}" → "${hostname}"`);
        }
        if (Object.keys(configuracoes).length > 0) updateData.configuracoes = configuracoes;
        if (os) updateData.sistema_operacional = String(os);
        if (serial) updateData.numero_serie = String(serial);
        if (fabricante) updateData.fabricante = String(fabricante);
        if (modelo) updateData.modelo = String(modelo);

        // Auto-correct asset type based on hostname
        const inferredType = inferAssetType(hostname);
        const SYNC_TYPES = new Set(["desktop", "notebook", "servidor"]);
        if (SYNC_TYPES.has(inferredType)) {
          updateData.tipo = inferredType;
        }

        // Reassign company if Datto site maps to a different company
        if (siteId) {
          const correctCompanyId = await findOrCreateCompanyId(siteName, siteId);
          if (correctCompanyId && correctCompanyId !== existingAsset.company_id) {
            updateData.company_id = correctCompanyId;
            console.log(`[FullSync] Reatribuindo "${hostname}" de empresa ${existingAsset.company_id} para ${correctCompanyId} (site ${siteId})`);
          }
        }

        // Log hardware changes to asset_changelog before updating
        const directFieldsForLog: Record<string, unknown> = {};
        if (updateData.nome) directFieldsForLog.nome = updateData.nome;
        if (os) directFieldsForLog.sistema_operacional = String(os);
        if (serial) directFieldsForLog.numero_serie = String(serial);
        if (fabricante) directFieldsForLog.fabricante = String(fabricante);
        if (modelo) directFieldsForLog.modelo = String(modelo);
        if (updateData.tipo) directFieldsForLog.tipo = updateData.tipo;

        await logAssetChanges(supabase, existingAsset.id, existingAsset, directFieldsForLog, configuracoes);

        await supabase.from("assets").update(updateData).eq("id", existingAsset.id);
        updated++;
      } else {
        // Create new — find or auto-create company
        const companyId = await findOrCreateCompanyId(siteName, siteId);
        if (!companyId) {
          continue;
        }

        const tipo = inferAssetType(hostname);
        const companyName = companyList.find(c => c.id === companyId)?.nome_fantasia || "";
        const { data: insertedAsset } = await supabase.from("assets").insert({
          nome: hostname,
          tipo,
          company_id: companyId,
          datto_device_uid: uid || null,
          datto_device_id: deviceId || null,
          datto_site_id: siteId || null,
          datto_status: dattoStatus,
          datto_last_sync: now,
          configuracoes: Object.keys(configuracoes).length > 0 ? configuracoes : null,
          sistema_operacional: os ? String(os) : null,
          numero_serie: serial ? String(serial) : null,
          fabricante: fabricante ? String(fabricante) : null,
          modelo: modelo ? String(modelo) : null,
          estado: "em_uso",
        }).select("id").single();
        if (insertedAsset?.id) syncedAssetIds.add(insertedAsset.id);
        createdDevices.push({ id: insertedAsset?.id || "", nome: hostname, companyId, companyName, tipo });
        created++;
      }
    }

    // 6. Orphan cleanup — remove desktops/notebooks/servidores that exist in platform but NOT in Datto
    //    Only for companies with tipo_contrato = 'contrato_manutencao' (skip eventual companies)
    const SYNC_TYPES_CLEANUP = ["desktop", "notebook", "servidor"];
    const { data: contractCompanyIds } = await supabase
      .from("companies")
      .select("id")
      .eq("tipo_contrato", "contrato_manutencao");
    const contractIds = new Set((contractCompanyIds || []).map((c: any) => c.id));

    const { data: allSyncableAssets } = await supabase
      .from("assets")
      .select("id, nome, tipo, company_id, datto_device_uid, datto_device_id")
      .in("tipo", SYNC_TYPES_CLEANUP);

    const orphans: { id: string; nome: string; tipo: string }[] = [];
    for (const asset of allSyncableAssets || []) {
      // Only consider assets from contract companies that HAVE a Datto link as potential orphans
      // Assets without datto_device_uid/datto_device_id are manually created (e.g. Linux machines) and must be preserved
      const hasDattoLink = asset.datto_device_uid || asset.datto_device_id;
      if (!syncedAssetIds.has(asset.id) && contractIds.has(asset.company_id) && hasDattoLink) {
        orphans.push({ id: asset.id, nome: asset.nome, tipo: asset.tipo });
      }
    }

    let deleted = 0;
    for (const orphan of orphans) {
      // Clean dependent records first
      await Promise.all([
        supabase.from("asset_changelog").delete().eq("asset_id", orphan.id),
        supabase.from("asset_relationships").delete().or(`parent_asset_id.eq.${orphan.id},child_asset_id.eq.${orphan.id}`),
        supabase.from("ai_predictions").delete().eq("asset_id", orphan.id),
        supabase.from("datto_alerts_log").delete().eq("asset_id", orphan.id),
      ]);
      const { error } = await supabase.from("assets").delete().eq("id", orphan.id);
      if (!error) deleted++;
    }
    console.log(`[FullSync] Órfãos removidos: ${deleted} de ${orphans.length} encontrados.`);

    // Count manual assets preserved
    const manualAssetsPreserved = (allSyncableAssets || []).filter(
      (a: any) => contractIds.has(a.company_id) && !a.datto_device_uid && !a.datto_device_id
    ).length;
    console.log(`[FullSync] Preservando ${manualAssetsPreserved} ativos manuais em empresas de contrato.`);

    const report = {
      total: devices.length,
      detailsFetched: detailsMap.size,
      updated,
      created,
      deleted,
      companiesCreated,
      manualAssetsPreserved,
      createdDevices: createdDevices.slice(0, 50),
      createdCompanies: createdCompanies.slice(0, 50),
      deletedOrphans: orphans.slice(0, 50).map(o => ({ nome: o.nome, tipo: o.tipo })),
    };

    console.log("[FullSync] Relatório:", JSON.stringify(report));

    return new Response(JSON.stringify({ success: true, report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[FullSync] Erro:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
