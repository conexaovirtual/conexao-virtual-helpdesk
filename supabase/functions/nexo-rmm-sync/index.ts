import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NEXO_SECRET = Deno.env.get("NEXO_SECRET") ?? "";
const FALLBACK_COMPANY = "00000000-0000-0000-0000-000000000001";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-nexo-secret, content-type" };
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const tipoOf = (h: string) => /svr|server|srv|servidor/i.test(h || "") ? "servidor" : "desktop";
const jerr = (o: any, status = 500) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const jok = (o: any) => new Response(JSON.stringify(o), { headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (!NEXO_SECRET) return jerr({ error: "server misconfigured: NEXO_SECRET unset" }, 500);
    if (req.headers.get("x-nexo-secret") !== NEXO_SECRET) return jerr({ error: "unauthorized" }, 401);
    const body = await req.json();
    const devices: any[] = Array.isArray(body.devices) ? body.devices : [];
    if (!devices.length) return jok({ ok: true, count: 0 });

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: comps } = await db.from("companies").select("id, nome_fantasia");
    const coMap = new Map<string, string>();
    (comps || []).forEach((c: any) => coMap.set(norm(c.nome_fantasia), c.id));

    const { data: assets } = await db.from("assets").select("id, nome, company_id, tipo, nexo_device_id, datto_device_id");
    const byNexo = new Map<string, any>(), byNameCo = new Map<string, any>();
    (assets || []).forEach((a: any) => { if (a.nexo_device_id) byNexo.set(a.nexo_device_id, a); byNameCo.set(norm(a.nome) + "|" + a.company_id, a); });

    const now = new Date().toISOString();
    const toInsert: any[] = [], toUpdate: any[] = [];
    const claimed = new Set<string>();
    const pending: { d: any; devId: string; companyId: string; status: string }[] = [];

    // passo 1: nexo_device_id é vínculo definitivo (único por ativo) — sempre prevalece
    for (const d of devices) {
      const devId = d.device_id; if (!devId) continue;
      const companyId = coMap.get(norm(d.company || "")) || FALLBACK_COMPANY;
      const status = d.online ? "online" : "offline";
      const exact = byNexo.get(devId);
      if (exact) {
        toUpdate.push({ id: exact.id, tipo: exact.tipo, nexo_device_id: devId, nome: d.hostname || exact.nome, company_id: companyId, sistema_operacional: d.os || null, datto_status: status, datto_last_sync: now, datto_device_id: exact.datto_device_id || ("nexo:" + devId), updated_at: now });
        claimed.add(exact.id);
      } else {
        pending.push({ d, devId, companyId, status });
      }
    }

    // passo 2: fallback por nome+empresa — só se o ativo ainda não foi reivindicado
    // nesta sincronização (duas máquinas reais podem ter nomes que só diferem por
    // pontuação, ex.: "FINANCEIRO-3" x "Financeiro3", e não podem colidir no mesmo ativo)
    for (const { d, devId, companyId, status } of pending) {
      const ex = byNameCo.get(norm(d.hostname) + "|" + companyId);
      if (ex && !claimed.has(ex.id)) {
        toUpdate.push({ id: ex.id, tipo: ex.tipo, nexo_device_id: devId, nome: d.hostname || ex.nome, company_id: companyId, sistema_operacional: d.os || null, datto_status: status, datto_last_sync: now, datto_device_id: ex.datto_device_id || ("nexo:" + devId), updated_at: now });
        claimed.add(ex.id);
      } else {
        toInsert.push({ nexo_device_id: devId, nome: d.hostname || "(sem nome)", company_id: companyId, tipo: tipoOf(d.hostname), estado: "em_uso", sistema_operacional: d.os || null, datto_status: status, datto_last_sync: now, datto_device_id: "nexo:" + devId });
      }
    }

    let inserted = 0, updated = 0;
    if (toUpdate.length) { const { error } = await db.from("assets").upsert(toUpdate, { onConflict: "id" }); if (error) return jerr({ stage: "update", message: error.message, details: error.details, code: error.code }); updated = toUpdate.length; }
    if (toInsert.length) { const { error } = await db.from("assets").insert(toInsert); if (error) return jerr({ stage: "insert", message: error.message, details: error.details, code: error.code }); inserted = toInsert.length; }
    return jok({ ok: true, inserted, updated });
  } catch (e) {
    return jerr({ error: (e as any)?.message || String(e) });
  }
});
