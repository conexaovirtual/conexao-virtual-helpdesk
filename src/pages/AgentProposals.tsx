import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, Check, X, ClipboardCheck, RefreshCw, Clock, FileText,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Status = "pendente" | "aprovada" | "rejeitada" | "aplicada";

const STATUS_LABEL: Record<Status, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada — pronta pra aplicar",
  rejeitada: "Rejeitada",
  aplicada: "Aplicada",
};

const STATUS_BADGE: Record<Status, string> = {
  pendente: "bg-amber-100 text-amber-700 border-amber-200",
  aprovada: "bg-blue-100 text-blue-700 border-blue-200",
  rejeitada: "bg-red-100 text-red-700 border-red-200",
  aplicada: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const DEPARTAMENTO_LABEL: Record<string, string> = {
  financeiro: "Financeiro",
  operacional: "Operacional",
  comercial: "Comercial",
  qualidade: "Qualidade",
  diretoria: "Diretoria",
};

export default function AgentProposals() {
  const navigate = useNavigate();
  const { profile, loading: authLoading, isAdmin, hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<Status | "todas">("pendente");
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const canDecide = isAdmin() || hasRole("tecnico");

  useEffect(() => {
    if (!authLoading && !profile) navigate("/auth");
    else if (!authLoading && profile && !canDecide) navigate("/dashboard");
  }, [profile, authLoading, navigate, canDecide]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["agent-proposals", statusFilter],
    queryFn: async () => {
      let q = supabase.from("agent_proposals").select("*").order("created_at", { ascending: false });
      if (statusFilter !== "todas") q = q.eq("status", statusFilter);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile && canDecide,
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "aprovada" | "rejeitada" }) => {
      const { error } = await supabase
        .from("agent_proposals")
        .update({
          status,
          decided_by: profile!.id,
          decided_at: new Date().toISOString(),
          decision_notes: notesById[id] || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { status }) => {
      toast({ title: status === "aprovada" ? "Proposta aprovada" : "Proposta rejeitada" });
      queryClient.invalidateQueries({ queryKey: ["agent-proposals"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao decidir", description: error.message, variant: "destructive" });
    },
  });

  const aplicar = useMutation({
    mutationFn: async (proposal: any) => {
      if (proposal.tipo_proposta === "agendamento_visita") {
        // A criação da OS de verdade (revalidando o slot em tempo real) roda
        // server-side — precisa do service role pra escrever em service_orders
        // e é a mesma lógica já usada/testada em autoScheduleServiceOrder.
        const { data: applyResult, error: applyError } = await supabase.functions.invoke("apply-scheduling-proposal", {
          body: { proposal_id: proposal.id },
        });
        if (applyError) throw applyError;
        if (!applyResult?.success) throw new Error(applyResult?.error || "Falha ao aplicar o agendamento.");
        return;
      }

      if (proposal.tipo_proposta === "mensagem_comercial") {
        if (!proposal.destinatario_phone) throw new Error("Proposta sem telefone de destinatário.");

        // Trava de janela de 24h do WhatsApp Business API: fora dela, mensagem
        // de texto livre é rejeitada pela Meta (só template pré-aprovado
        // funcionaria, e não temos isso configurado) — bloqueia aqui em vez
        // de deixar a Miya prometer um envio que vai falhar.
        const { data: conv } = await supabase
          .from("waba_conversations")
          .select("last_message_at")
          .eq("phone_number", proposal.destinatario_phone)
          .maybeSingle();
        const lastMsgAt = conv?.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
        const hoursSince = (Date.now() - lastMsgAt) / (1000 * 60 * 60);
        if (hoursSince > 24) {
          throw new Error(
            "Fora da janela de 24h do WhatsApp — o cliente não manda mensagem há mais de 24h. " +
            "Mensagem de texto livre seria rejeitada pela Meta (precisaria de um Message Template aprovado, que não está configurado). " +
            "Fale com o cliente por outro canal ou espere ele escrever de novo."
          );
        }

        const { error: sendError } = await supabase.functions.invoke("waba-send", {
          body: { action: "send_text", phone: proposal.destinatario_phone, text: proposal.conteudo_proposto, open_ticket: false },
        });
        if (sendError) throw sendError;

        const { error: updateError } = await supabase
          .from("agent_proposals")
          .update({ status: "aplicada", applied_at: new Date().toISOString() })
          .eq("id", proposal.id);
        if (updateError) throw updateError;
        return;
      }

      const dados = proposal.dados_estruturados || {};
      if (dados.destino === "knowledge_articles") {
        const { data: artigo, error } = await supabase
          .from("knowledge_articles")
          .insert({
            ticket_id: dados.ticket_id || null,
            titulo: dados.titulo,
            problema: dados.problema,
            solucao: dados.solucao,
            tags: dados.tags || [],
            categoria: dados.categoria || "Outros",
          })
          .select("id")
          .single();
        if (error) throw error;

        // Publica na wiki interna (docs.conexaovirtual.cloud). De propósito NÃO
        // derruba a aprovação se falhar: o artigo já está salvo no helpdesk, e
        // wiki fora do ar não pode impedir o José de aprovar. Fica pendente e o
        // botão "Publicar na wiki" da Base de Conhecimento resolve depois.
        if (artigo?.id) {
          supabase.functions
            .invoke("bookstack-sync", { body: { article_id: artigo.id } })
            .catch((e) => console.error("[bookstack-sync] falhou ao publicar:", e));
        }
      } else {
        const { error } = await supabase.from("department_knowledge_base").upsert(
          {
            departamento: proposal.departamento,
            secao: proposal.titulo,
            conteudo: proposal.conteudo_proposto,
            updated_by: profile!.id,
            updated_at: new Date().toISOString(),
            origem_proposal_id: proposal.id,
          },
          { onConflict: "departamento,secao" }
        );
        if (error) throw error;
      }
      const { error: updateError } = await supabase
        .from("agent_proposals")
        .update({ status: "aplicada", applied_at: new Date().toISOString() })
        .eq("id", proposal.id);
      if (updateError) throw updateError;
    },
    onSuccess: (_data, proposal: any) => {
      const titles: Record<string, string> = {
        mensagem_comercial: "Mensagem enviada ao cliente!",
        agendamento_visita: "OS criada e cliente avisado!",
      };
      toast({ title: titles[proposal.tipo_proposta] || "Aplicado! A Miya já vai usar isso na próxima conversa." });
      queryClient.invalidateQueries({ queryKey: ["agent-proposals"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao aplicar", description: error.message, variant: "destructive" });
    },
  });

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-96 w-full max-w-md" />
      </div>
    );
  }

  const rows = data || [];
  const filtroBtn = (v: Status | "todas", label: string) => (
    <Button
      key={v}
      size="sm"
      variant={statusFilter === v ? "default" : "outline"}
      onClick={() => setStatusFilter(v)}
      className="h-7 text-xs"
    >
      {label}
    </Button>
  );

  return (
    <div className="bg-background min-h-screen">
      <PageHeader
        icon={Sparkles}
        title="Propostas dos Agentes"
        subtitle="Sugestões da Miya aguardando sua aprovação — nada vira regra sozinho"
        actions={
          <Button onClick={() => refetch()} variant="ghost" size="icon" disabled={isFetching}
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        }
      />

      <main className="container mx-auto px-4 py-4 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {filtroBtn("pendente", "Pendentes")}
          {filtroBtn("aprovada", "Aprovadas")}
          {filtroBtn("aplicada", "Aplicadas")}
          {filtroBtn("rejeitada", "Rejeitadas")}
          {filtroBtn("todas", "Todas")}
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhuma proposta {statusFilter !== "todas" ? STATUS_LABEL[statusFilter as Status].toLowerCase() : ""} por aqui.</p>
              <p className="text-sm mt-1">
                Quando a Miya perceber um padrão que merece virar regra, a sugestão aparece aqui.
              </p>
            </CardContent>
          </Card>
        ) : (
          rows.map((p: any) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline">{DEPARTAMENTO_LABEL[p.departamento] || p.departamento}</Badge>
                      <Badge variant="outline" className={STATUS_BADGE[p.status as Status]}>
                        {STATUS_LABEL[p.status as Status] || p.status}
                      </Badge>
                      {p.created_by_agent && (
                        <span className="text-xs text-muted-foreground">via {p.created_by_agent}</span>
                      )}
                    </div>
                    <CardTitle className="text-base">{p.titulo}</CardTitle>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1 shrink-0">
                    <Clock className="h-3 w-3" />
                    {format(new Date(p.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {p.tipo_proposta === "mensagem_comercial" && p.destinatario_phone && (
                  <p className="text-xs text-muted-foreground">
                    Destinatário: <span className="font-medium text-foreground">{p.destinatario_phone}</span>
                  </p>
                )}
                {p.tipo_proposta === "agendamento_visita" && (
                  <p className="text-xs text-muted-foreground">
                    Cliente: <span className="font-medium text-foreground">{p.destinatario_phone}</span>
                    {p.dados_estruturados?.data_desejada && (
                      <> · Horário candidato: <span className="font-medium text-foreground">
                        {p.dados_estruturados.data_desejada} {p.dados_estruturados.hora_inicio}-{p.dados_estruturados.hora_fim} ({p.dados_estruturados.modalidade})
                      </span></>
                    )}
                    {p.dados_estruturados?.tecnico_nome && (
                      <> · Técnico sugerido: <span className="font-medium text-foreground">{p.dados_estruturados.tecnico_nome}</span></>
                    )}
                  </p>
                )}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Justificativa</p>
                  <p className="text-sm">{p.justificativa}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Conteúdo proposto
                  </p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-md p-3">{p.conteudo_proposto}</p>
                </div>
                {p.decision_notes && (
                  <p className="text-xs text-muted-foreground">Observação da decisão: {p.decision_notes}</p>
                )}

                {p.status === "pendente" && (
                  <div className="space-y-2 pt-1">
                    <Textarea
                      placeholder="Observação sobre sua decisão (opcional)"
                      className="text-sm min-h-16"
                      value={notesById[p.id] || ""}
                      onChange={(e) => setNotesById((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => decide.mutate({ id: p.id, status: "aprovada" })}
                        disabled={decide.isPending}
                        className="gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5" /> Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide.mutate({ id: p.id, status: "rejeitada" })}
                        disabled={decide.isPending}
                        className="gap-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <X className="h-3.5 w-3.5" /> Rejeitar
                      </Button>
                    </div>
                  </div>
                )}

                {p.status === "aprovada" && (
                  <Button
                    size="sm"
                    onClick={() => aplicar.mutate(p)}
                    disabled={aplicar.isPending}
                    className="gap-1.5"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    {p.tipo_proposta === "mensagem_comercial"
                      ? "Enviar ao cliente"
                      : p.tipo_proposta === "agendamento_visita"
                      ? "Confirmar agendamento"
                      : "Aplicar ao conhecimento"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </div>
  );
}
