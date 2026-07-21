import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, User, Building2, GripVertical, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatSlaRemaining(ms: number): string {
  if (ms <= 0) {
    const abs = Math.abs(ms);
    const h = Math.floor(abs / 3600000);
    const m = Math.floor((abs % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m atrasado` : `${m}m atrasado`;
  }
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h restantes`;
  if (h > 0) return `${h}h ${m}m restantes`;
  return `${m}m restantes`;
}

const KANBAN_COLUMNS = [
  { id: "novo", label: "Novo", color: "bg-blue-500" },
  { id: "em_atendimento", label: "Em Atendimento", color: "bg-amber-500" },
  { id: "aguardando_usuario", label: "Aguardando", color: "bg-orange-500" },
  { id: "resolvido", label: "Resolvido", color: "bg-emerald-500" },
  { id: "fechado", label: "Fechado", color: "bg-slate-500" },
] as const;

interface KanbanTicket {
  id: string;
  numero: number;
  titulo: string;
  status: string;
  prioridade: string;
  created_at: string;
  sla_solucao_limite?: string | null;
  companies?: { nome_fantasia: string } | null;
  profiles?: { nome: string } | null;
  solicitante_nome?: string | null;
  tecnico_id?: string | null;
}

export function TicketKanban() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<KanbanTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedTicket, setDraggedTicket] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadTickets = useCallback(async () => {
    if (!profile) return;
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("tickets")
      .select(
        `
        id, numero, titulo, status, prioridade, created_at, tecnico_id,
        sla_solucao_limite, solicitante_nome,
        profiles!tickets_solicitante_id_fkey(nome),
        companies(nome_fantasia)
      `,
      )
      .in(
        "status",
        KANBAN_COLUMNS.map((c) => c.id),
      )
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError("Não foi possível carregar os chamados.");
      console.error(fetchError);
    } else {
      setTickets(data || []);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!profile) return;
    loadTickets();

    const channel = supabase
      .channel("kanban-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, (payload) => {
        if (payload.eventType === "INSERT") {
          loadTickets();
        } else if (payload.eventType === "UPDATE") {
          const updated = payload.new as KanbanTicket;
          setTickets((prev) => {
            if (!KANBAN_COLUMNS.some((c) => c.id === updated.status)) {
              return prev.filter((t) => t.id !== updated.id);
            }
            return prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t));
          });
        } else if (payload.eventType === "DELETE") {
          setTickets((prev) => prev.filter((t) => t.id !== (payload.old as KanbanTicket).id));
        }
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      channel.unsubscribe();
    };
  }, [profile, loadTickets]);

  const handleDragStart = (e: React.DragEvent, ticketId: string) => {
    e.dataTransfer.setData("text/plain", ticketId);
    setDraggedTicket(ticketId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const ticketId = e.dataTransfer.getData("text/plain");
    setDraggedTicket(null);
    setDragOverColumn(null);

    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === newStatus) return;

    setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t)));

    const { error: updateError } = await supabase
      .from("tickets")
      .update({ status: newStatus as any, updated_at: new Date().toISOString() })
      .eq("id", ticketId);

    if (updateError) {
      toast.error("Erro ao atualizar status");
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: ticket.status } : t)));
    } else {
      toast.success(`Chamado #${ticket.numero} → "${KANBAN_COLUMNS.find((c) => c.id === newStatus)?.label}"`);
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "critica":
        return "bg-red-500 text-white";
      case "alta":
        return "bg-amber-500 text-white";
      case "media":
        return "bg-sky-500 text-white";
      case "baixa":
        return "bg-emerald-500 text-white";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getSLAIndicator = (ticket: KanbanTicket) => {
    if (!ticket.sla_solucao_limite || ticket.status === "fechado") return null;
    const limite = new Date(ticket.sla_solucao_limite);
    const diff = limite.getTime() - now.getTime();
    const hoursLeft = diff / 3600000;
    if (diff < 0) return { level: "violated" as const, label: formatSlaRemaining(diff) };
    if (hoursLeft < 1) return { level: "critical" as const, label: formatSlaRemaining(diff) };
    if (hoursLeft < 4) return { level: "warning" as const, label: formatSlaRemaining(diff) };
    return { level: "ok" as const, label: formatSlaRemaining(diff) };
  };

  const getColumnTickets = (columnId: string) => tickets.filter((t) => t.status === columnId);

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((col) => (
          <div key={col.id} className="min-w-[280px] flex-1">
            <Skeleton className="h-8 w-full mb-3" />
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button size="sm" variant="outline" onClick={loadTickets}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-4 pb-4 min-w-max">
        {KANBAN_COLUMNS.map((column) => {
          const columnTickets = getColumnTickets(column.id);
          const isDragOver = dragOverColumn === column.id;

          return (
            <div
              key={column.id}
              className={cn(
                "min-w-[290px] w-[290px] flex-shrink-0 rounded-lg bg-muted/50 transition-colors",
                isDragOver && "bg-accent ring-2 ring-primary/30",
              )}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              <div className="flex items-center gap-2 p-3 pb-2">
                <div className={cn("h-3 w-3 rounded-full", column.color)} />
                <h3 className="font-semibold text-sm">{column.label}</h3>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {columnTickets.length}
                </Badge>
              </div>

              <div className="p-2 space-y-2 min-h-[200px]">
                {columnTickets.map((ticket) => {
                  const sla = getSLAIndicator(ticket);
                  return (
                    <Card
                      key={ticket.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, ticket.id)}
                      onClick={() => navigate(`/tickets/${ticket.id}`)}
                      className={cn(
                        "p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all border select-none overflow-hidden relative",
                        draggedTicket === ticket.id && "opacity-50 scale-95",
                        sla?.level === "violated" && "border-red-300 dark:border-red-800",
                        sla?.level === "critical" && "border-orange-300 dark:border-orange-800",
                      )}
                    >
                      {sla && (
                        <div className={cn(
                          "absolute left-0 top-0 bottom-0 w-1",
                          sla.level === "violated" && "bg-red-500",
                          sla.level === "critical" && "bg-orange-500",
                          sla.level === "warning" && "bg-amber-400",
                          sla.level === "ok" && "bg-emerald-400",
                        )} />
                      )}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-xs font-mono text-muted-foreground">#{ticket.numero}</span>
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      </div>

                      <p className="text-sm font-medium line-clamp-2 mb-2 leading-snug">{ticket.titulo}</p>

                      <div className="flex flex-wrap gap-1 mb-2.5">
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            getPriorityColor(ticket.prioridade),
                          )}
                        >
                          {ticket.prioridade}
                        </span>
                        {sla && sla.level !== "ok" && (
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1",
                              sla.level === "violated" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
                              sla.level === "critical" && "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
                              sla.level === "warning" && "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                            )}
                          >
                            <AlertCircle className="h-3 w-3" />
                            {sla.label}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {ticket.companies && (
                          <div className="flex items-center gap-1 truncate">
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">{ticket.companies.nome_fantasia}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {ticket.profiles?.nome || ticket.solicitante_nome || "Sem solicitante"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span title={format(new Date(ticket.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}>
                            {formatDistanceToNow(new Date(ticket.created_at), { locale: ptBR, addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </Card>
                  );
                })}

                {columnTickets.length === 0 && (
                  <div className="flex items-center justify-center h-20 text-xs text-muted-foreground border-2 border-dashed rounded-md">
                    Arraste chamados aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
