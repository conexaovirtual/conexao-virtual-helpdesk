import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, Bot, UserRound, Clock, TrendingUp, Users, CheckCircle2
} from "lucide-react";

interface Stats {
  totalConversations: number;
  activeConversations: number;
  waitingQueue: number;
  assignedCount: number;
  resolvedCount: number;
  aiEnabledCount: number;
  totalMessages: number;
  aiMessages: number;
  agentMessages: number;
  avgResponseMinutes: number | null;
}

export function MetricsDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalConversations: 0, activeConversations: 0, waitingQueue: 0,
    assignedCount: 0, resolvedCount: 0, aiEnabledCount: 0,
    totalMessages: 0, aiMessages: 0, agentMessages: 0, avgResponseMinutes: null,
  });

  useEffect(() => {
    // PostgREST caps selects at 1000 rows; page through everything.
    const fetchAll = async (table: "waba_conversations" | "waba_messages", columns: string) => {
      const all: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from(table).select(columns).range(from, from + 999);
        if (data) all.push(...data);
        if (!data || data.length < 1000) break;
      }
      return all;
    };

    const load = async () => {
      const [convs, msgs] = await Promise.all([
        fetchAll("waba_conversations", "status, ai_enabled, queue_status, first_response_at, created_at"),
        fetchAll("waba_messages", "sender_type, direction"),
      ]);

      // Calculate avg first response time
      const responseTimes = convs
        .filter((c: any) => c.first_response_at)
        .map((c: any) => (new Date(c.first_response_at).getTime() - new Date(c.created_at).getTime()) / 60000);
      const avgResponse = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
        : null;

      setStats({
        totalConversations: convs.length,
        activeConversations: convs.filter((c: any) => c.status === "active").length,
        waitingQueue: convs.filter((c: any) => c.queue_status === "waiting").length,
        assignedCount: convs.filter((c: any) => c.queue_status === "assigned").length,
        resolvedCount: convs.filter((c: any) => c.queue_status === "resolved").length,
        aiEnabledCount: convs.filter((c: any) => c.ai_enabled).length,
        totalMessages: msgs.length,
        aiMessages: msgs.filter((m: any) => m.sender_type === "ai").length,
        agentMessages: msgs.filter((m: any) => m.sender_type === "agent").length,
        avgResponseMinutes: avgResponse,
      });
    };
    load();
  }, []);

  const aiResolutionRate = stats.totalConversations > 0
    ? Math.round((stats.resolvedCount / stats.totalConversations) * 100)
    : 0;

  const cards = [
    { icon: MessageSquare, label: "Conversas", value: stats.totalConversations, sub: `${stats.activeConversations} ativas`, color: "text-primary" },
    { icon: Clock, label: "Na Fila", value: stats.waitingQueue, sub: "aguardando", color: "text-warning" },
    { icon: Users, label: "Em Atendimento", value: stats.assignedCount, sub: "atribuídas", color: "text-info" },
    { icon: CheckCircle2, label: "Resolvidas", value: stats.resolvedCount, sub: "concluídas", color: "text-success" },
    { icon: Bot, label: "IA Ativa", value: stats.aiEnabledCount, sub: `${aiResolutionRate}% resolução`, color: "text-primary" },
    { icon: TrendingUp, label: "Tempo Médio", value: stats.avgResponseMinutes != null ? `${stats.avgResponseMinutes}m` : "—", sub: "1ª resposta", color: "text-accent-foreground" },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base">Métricas de Atendimento</h2>
        <Badge variant="outline" className="text-xs">Tempo real</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((card) => (
          <Card key={card.label} className="shadow-none">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <card.icon className={`h-4 w-4 ${card.color}`} />
                <span className="text-xs text-muted-foreground">{card.label}</span>
              </div>
              <p className="text-xl font-bold">{card.value}</p>
              <p className="text-[10px] text-muted-foreground">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Message breakdown */}
      <Card className="shadow-none">
        <CardHeader className="py-3 px-3">
          <CardTitle className="text-sm font-medium">Volume de Mensagens</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-1"><UserRound className="h-3 w-3" /> Clientes</span>
                <span className="font-medium">{stats.totalMessages - stats.aiMessages - stats.agentMessages}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-1"><Bot className="h-3 w-3 text-primary" /> IA</span>
                <span className="font-medium text-primary">{stats.aiMessages}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-1"><UserRound className="h-3 w-3" /> Técnicos</span>
                <span className="font-medium">{stats.agentMessages}</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{stats.totalMessages}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
