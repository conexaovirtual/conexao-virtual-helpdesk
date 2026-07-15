import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getWabaProvider } from "../_shared/waba-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const normalize = (raw: unknown): string => String(raw ?? "").replace(/\D/g, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const warnings: string[] = [];
    let contactsImported = 0;
    let conversationsCreated = 0;
    let namesUpdated = 0;
    let photosUpdated = 0;
    let companiesLinked = 0;

    // --- Companies indexed by normalized phone (used to seed conversations
    // and to auto-link imported contacts to a company) ---
    const { data: companies } = await supabase
      .from("companies")
      .select("id, nome_fantasia, whatsapp, telefone")
      .eq("status", true);

    const companyByPhone = new Map<string, { id: string; nome_fantasia: string }>();
    for (const c of companies ?? []) {
      for (const raw of [c.whatsapp, c.telefone]) {
        const phone = normalize(raw);
        if (phone.length >= 10) companyByPhone.set(phone, c);
      }
    }

    // --- Existing conversations indexed by normalized phone ---
    // PostgREST caps selects at 1000 rows, so page through the whole table.
    const convoByPhone = new Map<
      string,
      { id: string; phone_number: string; contact_name: string | null; profile_photo_url: string | null }
    >();
    for (let from = 0; ; from += 1000) {
      const { data: convos, error } = await supabase
        .from("waba_conversations")
        .select("id, phone_number, contact_name, profile_photo_url")
        .range(from, from + 999);
      if (error) throw new Error(`Leitura de waba_conversations falhou: ${error.message}`);
      for (const cv of convos ?? []) {
        convoByPhone.set(normalize(cv.phone_number), cv);
      }
      if (!convos || convos.length < 1000) break;
    }

    const newConversations: Record<string, unknown>[] = [];

    // --- 1) Import every contact from the active WABA provider. The switch
    // follows _shared/waba-provider.ts (WABA_PROVIDER env var); both branches
    // are normalized into the same shape before processing. ---
    type ProviderContact = {
      number: string;
      name: string | null;
      profilePicUrl: string | null;
      isGroup: boolean;
    };
    const providerContacts: ProviderContact[] = [];

    if (getWabaProvider() === "evolution") {
      // Evolution API: POST /chat/findContacts/{instance} returns every
      // contact of the instance in one response (no pagination).
      const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
      const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
      const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE");
      if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
        warnings.push(
          "Secrets EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE não configurados — importação da Evolution pulada."
        );
      } else {
        const resp = await fetch(
          `${EVOLUTION_API_URL}/chat/findContacts/${EVOLUTION_INSTANCE}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({ where: {} }),
          }
        );
        if (!resp.ok) {
          const errText = (await resp.text()).slice(0, 200);
          throw new Error(`Evolution findContacts falhou (${resp.status}): ${errText}`);
        }
        const data = await resp.json();
        const list: any[] = Array.isArray(data) ? data : data?.contacts ?? [];
        for (const ct of list) {
          // v2 exposes the WhatsApp JID as remoteJid; v1 used id.
          const jid = String(ct?.remoteJid ?? ct?.id ?? "");
          const isGroup = jid.endsWith("@g.us");
          // Anything else (@lid, @broadcast, status@broadcast) carries no
          // dialable phone number — skip.
          if (!isGroup && !jid.endsWith("@s.whatsapp.net")) continue;
          providerContacts.push({
            number: jid.split("@")[0],
            name: String(ct?.pushName ?? "").trim() || null,
            profilePicUrl: ct?.profilePicUrl || ct?.profilePictureUrl || null,
            isGroup,
          });
        }
        console.log(
          `Evolution retornou ${list.length} contatos (${providerContacts.length} utilizáveis)`
        );
      }
    } else {
      // ---- Mabbix (Whaticket): session login + paginated GET /contacts; the
      // connection token is not accepted there. Kept as-is until the Mabbix
      // contract is cancelled. ----
      // The secret may hold the frontend host (chat.mabbix.com.br); the API
      // lives at apichat.mabbix.com.br. Rewrite defensively (anchored to "//"
      // so an already-correct apichat URL is left untouched).
      const MABBIX_BACKEND_URL = Deno.env.get("MABBIX_BACKEND_URL")
        ?.replace("//chat.mabbix.com.br", "//apichat.mabbix.com.br");
      const MABBIX_ADMIN_EMAIL = Deno.env.get("MABBIX_ADMIN_EMAIL");
      const MABBIX_ADMIN_PASSWORD = Deno.env.get("MABBIX_ADMIN_PASSWORD");

      if (!MABBIX_BACKEND_URL) {
        warnings.push("Secret MABBIX_BACKEND_URL ausente — importação da Mabbix pulada.");
      } else if (!MABBIX_ADMIN_EMAIL || !MABBIX_ADMIN_PASSWORD) {
        warnings.push(
          "Secrets MABBIX_ADMIN_EMAIL / MABBIX_ADMIN_PASSWORD não configurados — importação da Mabbix pulada."
        );
      } else {
        const loginResp = await fetch(`${MABBIX_BACKEND_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: MABBIX_ADMIN_EMAIL, password: MABBIX_ADMIN_PASSWORD }),
        });
        if (!loginResp.ok) {
          const errText = (await loginResp.text()).slice(0, 200);
          throw new Error(`Login na Mabbix falhou (${loginResp.status}): ${errText}`);
        }
        const loginData = await loginResp.json();
        const jwt = loginData?.token;
        if (!jwt) throw new Error("Login na Mabbix não retornou token de sessão");

        const mabbixContacts: any[] = [];
        for (let page = 1; page <= 200; page++) {
          const resp = await fetch(
            `${MABBIX_BACKEND_URL}/contacts?searchParam=&pageNumber=${page}`,
            { headers: { Authorization: `Bearer ${jwt}` } }
          );
          if (!resp.ok) {
            warnings.push(`Falha ao listar contatos (página ${page}): HTTP ${resp.status}`);
            break;
          }
          const data = await resp.json();
          const batch: any[] = data?.contacts ?? [];
          mabbixContacts.push(...batch);
          if (!data?.hasMore || batch.length === 0) break;
        }
        console.log(`Mabbix retornou ${mabbixContacts.length} contatos`);

        for (const ct of mabbixContacts) {
          providerContacts.push({
            number: String(ct?.number ?? ""),
            name: String(ct?.name ?? "").trim() || null,
            profilePicUrl: ct?.profilePicUrl || null,
            isGroup: !!ct?.isGroup,
          });
        }
      }
    }

    const contactRows = new Map<string, Record<string, unknown>>();
    for (const ct of providerContacts) {
      if (ct.isGroup) {
        // Groups never become contact rows, but if the webhook already
        // created a conversation for the group, refresh its name/photo.
        const gphone = normalize(ct.number);
        const gconvo = convoByPhone.get(gphone);
        if (gconvo) {
          const gupdates: Record<string, unknown> = {};
          if (ct.name && (!gconvo.contact_name || gconvo.contact_name === gconvo.phone_number)) {
            gupdates.contact_name = ct.name;
            namesUpdated++;
          }
          if (ct.profilePicUrl && gconvo.profile_photo_url !== ct.profilePicUrl) {
            gupdates.profile_photo_url = ct.profilePicUrl;
            photosUpdated++;
          }
          if (Object.keys(gupdates).length > 0) {
            await supabase.from("waba_conversations").update(gupdates).eq("id", gconvo.id);
          }
        }
        continue;
      }

      const phone = normalize(ct.number);
      if (phone.length < 10) continue;
      const name = ct.name;
      const photo = ct.profilePicUrl;
      const company = companyByPhone.get(phone);
      if (company) companiesLinked++;

      contactRows.set(phone, {
        phone_number: phone,
        contact_name: name,
        company_id: company?.id ?? null,
      });

      const convo = convoByPhone.get(phone);
      if (!convo) {
        const row = {
          phone_number: phone,
          contact_name: name || company?.nome_fantasia || "Contato",
          profile_photo_url: photo,
          status: "active",
          queue_status: "resolved",
          ai_enabled: true,
        };
        newConversations.push(row);
        convoByPhone.set(phone, {
          id: "",
          phone_number: phone,
          contact_name: row.contact_name as string,
          profile_photo_url: photo,
        });
      } else {
        const updates: Record<string, unknown> = {};
        if (name && (!convo.contact_name || convo.contact_name === convo.phone_number)) {
          updates.contact_name = name;
          namesUpdated++;
        }
        if (photo && convo.profile_photo_url !== photo) {
          updates.profile_photo_url = photo;
          photosUpdated++;
        }
        if (Object.keys(updates).length > 0 && convo.id) {
          await supabase.from("waba_conversations").update(updates).eq("id", convo.id);
        }
      }
    }

    // Upsert the contact mirror in chunks (unique key: phone_number)
    const rows = [...contactRows.values()];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase
        .from("whatsapp_contacts")
        .upsert(chunk, { onConflict: "phone_number" });
      if (error) throw new Error(`Upsert whatsapp_contacts falhou: ${error.message}`);
    }
    contactsImported = rows.length;

    // --- 2) Seed conversations from companies that have a WhatsApp number
    // but no conversation yet (previous behavior, kept) ---
    for (const [phone, company] of companyByPhone) {
      if (convoByPhone.has(phone)) continue;
      newConversations.push({
        phone_number: phone,
        contact_name: company.nome_fantasia,
        status: "active",
        queue_status: "resolved",
        ai_enabled: true,
      });
      convoByPhone.set(phone, {
        id: "",
        phone_number: phone,
        contact_name: company.nome_fantasia,
        profile_photo_url: null,
      });
    }

    // Upsert ignoring duplicates: idempotent even if another sync ran in
    // parallel or the existing-conversations snapshot was stale.
    for (let i = 0; i < newConversations.length; i += 500) {
      const chunk = newConversations.slice(i, i + 500);
      const { error } = await supabase
        .from("waba_conversations")
        .upsert(chunk, { onConflict: "phone_number", ignoreDuplicates: true });
      if (error) throw new Error(`Insert waba_conversations falhou: ${error.message}`);
    }
    conversationsCreated = newConversations.length;

    const summary = {
      ok: true,
      provider: getWabaProvider(),
      contactsImported,
      conversationsCreated,
      namesUpdated,
      photosUpdated,
      companiesLinked,
      warnings,
      // legacy keys still read by the frontend toast
      synced: conversationsCreated,
    };
    console.log("Sync summary:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
