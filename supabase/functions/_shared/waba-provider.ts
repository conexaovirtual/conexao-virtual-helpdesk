// =====================================================================
// Modulo compartilhado de envio de WhatsApp (WABA = WhatsApp Business API).
// Abstrai o provedor por tras do envio: Mabbix (atual) ou Evolution API
// (self-hosted, sem dependencia de terceiro). Controlado pela env var
// WABA_PROVIDER ("mabbix" | "evolution", default "mabbix").
//
// O branch "mabbix" replica exatamente o comportamento ja existente nos
// arquivos que estao sendo migrados para usar este modulo — nao muda
// comportamento nenhum ate WABA_PROVIDER ser trocado para "evolution".
// =====================================================================

export type WabaProvider = "mabbix" | "evolution";

export function getWabaProvider(): WabaProvider {
  const v = (Deno.env.get("WABA_PROVIDER") || "mabbix").toLowerCase();
  return v === "evolution" ? "evolution" : "mabbix";
}

export interface SendResult {
  ok: boolean;
  providerMessageId: string | null;
  raw: any;
}

// ---- Config Mabbix (identica ao padrao usado em todo o codebase hoje) ----
function mabbixConfig() {
  const url = Deno.env.get("MABBIX_BACKEND_URL")?.replace("//chat.mabbix.com.br", "//apichat.mabbix.com.br");
  const token = Deno.env.get("MABBIX_CONNECTION_TOKEN");
  if (!url || !token) throw new Error("Mabbix API not configured");
  return { url, token };
}

// ---- Config Evolution ----
function evolutionConfig() {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const key = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE");
  if (!url || !key || !instance) throw new Error("Evolution API not configured");
  return { url, key, instance };
}

// =====================================================================
// sendWabaText
// =====================================================================
export async function sendWabaText(
  phone: string,
  text: string,
  opts?: { openTicket?: boolean }
): Promise<SendResult> {
  if (getWabaProvider() === "evolution") {
    const { url, key, instance } = evolutionConfig();
    const resp = await fetch(`${url}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ number: phone, text }),
    });
    const raw = await resp.json();
    return { ok: resp.ok, providerMessageId: raw?.key?.id ?? null, raw };
  }

  // ---- Mabbix (comportamento atual, inalterado) ----
  const { url, token } = mabbixConfig();
  const resp = await fetch(`${url}/api/messages/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      number: phone,
      openTicket: opts?.openTicket ? "1" : "0",
      queueId: "0",
      body: text,
    }),
  });
  const raw = await resp.json();
  const providerMessageId = raw?.id || raw?.message?.id || null;
  return { ok: resp.ok, providerMessageId: providerMessageId ? String(providerMessageId) : null, raw };
}

// =====================================================================
// sendWabaMedia — documento/imagem/video
// =====================================================================
export async function sendWabaMedia(
  phone: string,
  mediaUrl: string,
  opts: { filename?: string; caption?: string; mediaType?: string; mimeType?: string; openTicket?: boolean }
): Promise<SendResult> {
  if (getWabaProvider() === "evolution") {
    const { url, key, instance } = evolutionConfig();
    // Evolution aceita tanto URL quanto base64 no campo `media`; URL e mais
    // simples e evita um download+reupload aqui.
    // "audio" faltava aqui — caia em "document", e a Evolution/WhatsApp
    // rejeitava (mediatype documento não bate com um arquivo de áudio),
    // por isso não dava pra mandar áudio anexado pela plataforma.
    const mediatype = opts.mediaType?.startsWith("image")
      ? "image"
      : opts.mediaType?.startsWith("video")
      ? "video"
      : opts.mediaType?.startsWith("audio")
      ? "audio"
      : "document";
    const resp = await fetch(`${url}/message/sendMedia/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({
        number: phone,
        mediatype,
        // mimetype real (ex: "audio/mpeg") — antes mandava só a categoria
        // curta ("audio"/"image"), que não é um mimetype válido.
        mimetype: opts.mimeType || opts.mediaType || "application/octet-stream",
        media: mediaUrl,
        fileName: opts.filename || "arquivo",
        caption: opts.caption || "",
      }),
    });
    const raw = await resp.json();
    return { ok: resp.ok, providerMessageId: raw?.key?.id ?? null, raw };
  }

  // ---- Mabbix (comportamento atual, inalterado): multipart/form-data com o
  // binario do arquivo — a API da Mabbix so aceita midia real assim. ----
  const { url, token } = mabbixConfig();
  const fileResp = await fetch(mediaUrl);
  if (!fileResp.ok) throw new Error(`Failed to fetch media: ${fileResp.status}`);
  const contentType = fileResp.headers.get("content-type") || "application/octet-stream";
  const fileBlob = new Blob([await fileResp.arrayBuffer()], { type: contentType });

  const form = new FormData();
  form.append("number", phone);
  form.append("openTicket", opts.openTicket ? "1" : "0");
  form.append("queueId", "0");
  form.append("body", opts.caption || "");
  form.append("medias", fileBlob, opts.filename || "arquivo");

  const resp = await fetch(`${url}/api/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const raw = await resp.json();
  const providerMessageId = raw?.id || raw?.message?.id || raw?.retorno?.id || null;
  return { ok: resp.ok, providerMessageId: providerMessageId ? String(providerMessageId) : null, raw };
}

// =====================================================================
// sendWabaAudio — nota de voz (PTT)
// =====================================================================
export async function sendWabaAudio(phone: string, audioBase64: string): Promise<SendResult> {
  if (getWabaProvider() === "evolution") {
    const { url, key, instance } = evolutionConfig();
    // Evolution espera base64 puro; alguns chamadores (ex: TTS) passam um data
    // URI ("data:audio/mp3;base64,...") pensando no formato da Mabbix — remove
    // o prefixo se presente.
    const cleanBase64 = audioBase64.includes(",") && audioBase64.startsWith("data:")
      ? audioBase64.split(",", 2)[1]
      : audioBase64;
    const resp = await fetch(`${url}/message/sendWhatsAppAudio/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ number: phone, audio: cleanBase64 }),
    });
    const raw = await resp.json();
    return { ok: resp.ok, providerMessageId: raw?.key?.id ?? null, raw };
  }

  // ---- Mabbix (comportamento atual, inalterado) ----
  const { url, token } = mabbixConfig();
  const resp = await fetch(`${url}/api/messages/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ number: phone, openTicket: "0", queueId: "0", body: audioBase64, isAudio: true }),
  });
  const raw = await resp.json();
  const providerMessageId = raw?.id || raw?.message?.id || null;
  return { ok: resp.ok, providerMessageId: providerMessageId ? String(providerMessageId) : null, raw };
}

// =====================================================================
// getWabaMediaBase64 — so faz sentido para midia recebida via Evolution API
// (audio, imagem, documento, video), dado o id da mensagem no provedor. No
// Mabbix, midia recebida ja vem com uma media_url diretamente baixavel, entao
// esta funcao nunca e chamada nesse caso.
//
// IMPORTANTE: nao ramifica por getWabaProvider() (que controla o *envio* de
// saida) — quem chama esta funcao (o parsing do webhook da Evolution) ja sabe,
// pelo formato do payload recebido, que a mensagem veio da Evolution,
// independente de qual provedor esta ativo para envio no momento.
// =====================================================================
export async function getWabaMediaBase64(providerMessageId: string): Promise<{ base64: string; mimetype: string } | null> {
  const { url, key, instance } = evolutionConfig();
  const resp = await fetch(`${url}/chat/getBase64FromMediaMessage/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ message: { key: { id: providerMessageId } } }),
  });
  if (!resp.ok) throw new Error(`Evolution media fetch failed: ${resp.status}`);
  const data = await resp.json();
  if (!data?.base64) return null;
  return { base64: data.base64, mimetype: data.mimetype || "application/octet-stream" };
}

// =====================================================================
// getGroupInfo — nome real do grupo + telefones dos participantes.
// Mensagens de grupo chegam no webhook com o pushName de quem enviou, nunca
// o nome do grupo; sem isso, cada grupo aparece na lista de conversas como
// se fosse uma pessoa aleatória qualquer, impossível de reconhecer ou
// vincular à empresa certa. Só faz sentido para Evolution (grupos só existem
// nesse fluxo), assim como getWabaMediaBase64.
// =====================================================================
export async function getGroupInfo(groupJid: string): Promise<{ subject: string; participants: string[] } | null> {
  const { url, key, instance } = evolutionConfig();
  const resp = await fetch(`${url}/group/findGroupInfos/${instance}?groupJid=${encodeURIComponent(groupJid)}`, {
    headers: { apikey: key },
  });
  if (!resp.ok) throw new Error(`Evolution group info fetch failed: ${resp.status}`);
  const data = await resp.json();
  const participants: string[] = (data?.participants || [])
    .map((p: any) => String(p.phoneNumber || p.id || "").split("@")[0])
    .filter(Boolean);
  return { subject: data?.subject || "", participants };
}
