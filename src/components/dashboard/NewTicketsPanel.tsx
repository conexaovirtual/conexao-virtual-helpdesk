/**
 * NewTicketsPanel — Painel de Novos Chamados com Triagem IA
 * Mostra tickets recentes em "novo" ou "triagem" com sugestões da IA
 * e ações rápidas para iniciar o atendimento.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Ticket, AlertTriangle, Clock, Building2,
  ChevronRight, Play, Brain, RefreshCw, Inbox,
} from "lucide-react";

interface TicketItem {
  id: string;
  numero: number;
  titulo: string;
  impacto: string;
  urgencia: string;
  canal: string;
  created_at: string;
  companies: { nome_fantasia: string } | null;
  triage?: {
    prioridade_sugerida?: string;
    categoria_sugerida?: string;
    resumo_problema?: string;
  };
}

const impactoColor: Record<string, string> = {
  alto: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  medio: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  baixo: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const canalIcon: Record<string, string> = {
  web: "🔗",
  whatsapp: "💬",
  interno: "🖥️",
  monitoramento: "📡",
  ligacao: "📞",
};

// Cache entre remontagens para evitar skeleton repetido
let _cachedTickets: TicketItem[] = [];

export function NewTicketsPanel() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<TicketItem[]>(_cachedTickets);
  const [loading, setLoading] = useState(_cachedTickets.length === 0);
  const [starting, setStarting] = useState<string | null>(null);

  const loadNewTickets = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) setLoading(true);
    try {
      const { data } = await supabase
        .from("tickets")
        .select(`
          id, numero, titulo, impacto, urgencia, canal, created_at,
          companies:company_id(nome_fantasia)
        `)
        .in("status", ["novo", "triagem"])
        .order("created_at", { ascending: false })
        .limit(8);

      if (!data) return;

      // Busca triagem IA para cada ticket (sem bloquear)
      const enriched = await Promise.all(
        data.map(async (t) => {
          const { data: triageData } = await supabase
            .from("ticket_comments")
            .select("comentario")
            .eq("ticket_id", t.id)
            .eq("is_internal", true)
            .ilike("comentario", "%Triagem%")
            .limit(1)
            .maybeSingle();

          return { ...t, triage: triageData ? { resumo_problema: triageData.comentario } : undefined };
        })
      );

      _cachedTickets = enriched as TicketItem[];
      setTickets(_cachedTickets);
    } catch (err) {
      console.error("Erro ao carregar novos chamados:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNewTickets(_cachedTickets.length === 0); // skeleton só se cache vazio

    // Realtime: atualiza silenciosamente (sem skeleton)
    const channel = supabase
      .channel("new-tickets-realtime")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "tickets",
      }, (payload) => {
        toast.info(`🎫 Novo chamado recebido!`, {
          description: (payload.new as any)?.titulo,
          action: { label: "Ver", onClick: () => navigate("/tickets") },
        });
        loadNewTickets(false);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "tickets",
        filter: "status=eq.novo",
      }, () => loadNewTickets(false))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadNewTickets]);

  const handleStartAttending = async (ticketId: string, numero: number) => {
    setStarting(ticketId);
    try {
      await supabase
        .from("tickets")
        .update({
          status: "em_atendimento",
          tecnico_id: profile?.id,
          data_primeiro_atendimento: new Date().toISOString(),
        } as any)
        .eq("id", ticketId);

      toast.success(`Chamado #${numero} em atendimento!`);
      loadNewTickets();
    } catch (err) {
      toast.error("Erro ao iniciar atendimento");
    } finally {
      setStarting(null);
    }
  };

  const getTimeAgo = (date: string) => {
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (diff < 1) return "agora";
    if (diff < 60) return `${diff}min atrás`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h atrás`;
    return `${Math.floor(diff / 1440)}d atrás`;
  };

  if (loading) return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </CardContent>
    </Card>
  );

  return (
    <Card className="border-blue-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Inbox className="h-4 w-4 text-blue-500" />
            Novos Chamados
            {tickets.length > 0 && (
              <Badge className="bg-blue-500 text-white text-xs h-5 min-w-5 px-1.5">
                {tickets.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => loadNewTickets()}>
              <RefreshCw className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/tickets")}>
              Ver todos <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center mb-2">
              <Ticket className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-emerald-600">Nenhum chamado pendente</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tudo em dia! ✓</p>
          </div>
        ) : (
          tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="flex items-start gap-3 p-3 rounded-xl border hover:bg-accent/40 transition-colors group"
            >
              {/* Ícone canal */}
              <div className="text-base shrink-0 mt-0.5">
                {canalIcon[ticket.canal] || "🎫"}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">#{ticket.numero}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${impactoColor[ticket.impacto] || ""}`}>
                    {ticket.impacto}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {getTimeAgo(ticket.created_at)}
                  </span>
                </div>
                <p className="text-sm font-medium truncate mt-0.5">{ticket.titulo}</p>
                {ticket.companies && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Building2 className="h-2.5 w-2.5" />
                    {ticket.companies.nome_fantasia}
                  </p>
                )}
                {/* Resumo IA se disponível */}
                {ticket.triage?.resumo_problema && (
                  <div className="flex items-start gap-1 mt-1.5 p-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900">
                    <Brain className="h-3 w-3 text-violet-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-violet-700 dark:text-violet-300 line-clamp-2 leading-relaxed">
                      {ticket.triage.resumo_problema.replace(/🤖.*?\n\n/, "").substring(0, 100)}...
                    </p>
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="flex flex-col gap-1 shrink-0">
                <Button
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => handleStartAttending(ticket.id, ticket.numero)}
                  disabled={starting === ticket.id}
                >
                  {starting === ticket.id ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <><Play className="h-3 w-3 mr-1" /> Atender</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2"
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                >
                  Ver <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
