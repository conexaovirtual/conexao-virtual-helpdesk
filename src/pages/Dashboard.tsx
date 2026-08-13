import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardData } from "@/hooks/useDashboardData";
import { supabase } from "@/integrations/supabase/client";
import { QuickFieldDialog } from "@/components/daily-records/QuickFieldDialog";
import { NewTicketsPanel } from "@/components/dashboard/NewTicketsPanel";
import { useTicketAutomation } from "@/hooks/useTicketAutomation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ServiceOrderCreateDialog } from "@/components/service-orders/ServiceOrderCreateDialog";
import { ServiceOrderDetailDialog } from "@/components/service-orders/ServiceOrderDetailDialog";
import { NotificationPermissionPrompt } from "@/components/notifications/NotificationPermissionPrompt";
import { QuickRemoteServiceCard } from "@/components/dashboard/QuickRemoteServiceCard";
import { RemoteServiceQuickDialog } from "@/components/dashboard/RemoteServiceQuickDialog";
import { SmartAlertsPanel } from "@/components/ai/SmartAlertsPanel";
import { formatDateBR } from "@/lib/formatters";
import {
  Clock,
  CheckCircle2,
  Package,
  Building2,
  FileText,
  Calendar as CalendarIcon,
  ClipboardList,
  Monitor,
  AlertCircle,
  Bot,
  MessageSquare,
  TrendingUp,
  Ticket,
  ArrowRight,
  Plus,
  RefreshCw,
  Activity,
  Zap,
  Users,
  BarChart3,
  Radio,
  AlertTriangle,
  CircleDot,
  Wifi,
  ChevronRight,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const CHART_COLORS = {
  novo: "#3b82f6",
  em_atendimento: "#f59e0b",
  resolvido: "#16a34a",
  fechado: "#6b7280",
};

const EMPTY_STATS = {
  ativos: 0, empresas: 0, os_agendadas_hoje: 0, os_pendentes: 0, os_finalizadas: 0,
  atendimentos_mes: 0, chamados_qrcode: 0, atendimentos_remotos_hoje: 0,
  tickets_novo: 0, tickets_em_atendimento: 0, tickets_resolvido: 0, tickets_fechado: 0,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, loading: authLoading } = useAuth();

  // Técnico de campo (sem admin_provedor) não tem visão geral da empresa —
  // José pediu (05/08/2026) que ele veja só o que é dele. O Dashboard geral
  // mostra estatística company-wide, então manda ele direto pro Meu Dia,
  // que já é escopado ao próprio técnico.
  useEffect(() => {
    if (!authLoading && profile) {
      const isFieldTechOnly = profile.roles?.includes("tecnico") && !profile.roles?.includes("admin_provedor");
      if (isFieldTechOnly) navigate("/meu-dia", { replace: true });
    }
  }, [authLoading, profile, navigate]);
  const [isCreateOSDialogOpen, setIsCreateOSDialogOpen] = useState(false);
  const [selectedServiceOrder, setSelectedServiceOrder] = useState<any>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isRemoteServiceDialogOpen, setIsRemoteServiceDialogOpen] = useState(false);
  const [isQuickFieldOpen, setIsQuickFieldOpen] = useState(false);
  const [todayRecords, setTodayRecords] = useState<any[]>([]);

  useEffect(() => {
    if (profile?.id) loadTodayRecords();
  }, [profile?.id]);

  const loadTodayRecords = async () => {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("daily_service_records")
      .select("id, titulo, status, hora_inicio, hora_fim, companies(nome_fantasia)")
      .eq("data_atendimento", today)
      .eq("tecnico_id", profile!.id)
      .order("hora_inicio", { ascending: false })
      .limit(5);
    if (data) setTodayRecords(data);
  };

  // Hooks de automação e tempo real
  useTicketAutomation();

  const {
    data,
    isLoading: loading,
    isError: loadError,
    dataUpdatedAt,
    refetch,
  } = useDashboardData(profile?.id, profile?.roles);

  const stats = data?.stats ?? EMPTY_STATS;
  const upcomingServiceOrders = data?.upcomingServiceOrders ?? [];
  const recentServices = data?.recentServices ?? [];
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : new Date();

  const loadDashboardData = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard", profile?.id] });
    refetch();
  };

  const handleViewServiceOrder = async (osId: string) => {
    const { data, error } = await supabase
      .from("service_orders")
      .select(`*, tickets(numero, titulo), companies:company_id(nome_fantasia, cnpj, endereco), profiles:tecnico_id(nome)`)
      .eq("id", osId)
      .single();
    if (!error && data) {
      setSelectedServiceOrder(data);
      setIsDetailDialogOpen(true);
    }
  };

  if (authLoading || !profile) {
    return (
      <div className="container mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 lg:col-span-2 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const totalTickets = stats.tickets_novo + stats.tickets_em_atendimento + stats.tickets_resolvido + stats.tickets_fechado;
  const ticketChartData = useMemo(() => [
    { name: "Novos", value: stats.tickets_novo, color: CHART_COLORS.novo },
    { name: "Em Atendimento", value: stats.tickets_em_atendimento, color: CHART_COLORS.em_atendimento },
    { name: "Resolvidos", value: stats.tickets_resolvido, color: CHART_COLORS.resolvido },
    { name: "Fechados", value: stats.tickets_fechado, color: CHART_COLORS.fechado },
  ].filter((d) => d.value > 0), [stats.tickets_novo, stats.tickets_em_atendimento, stats.tickets_resolvido, stats.tickets_fechado]);

  const isAdminOrTech = profile?.roles?.includes("admin_provedor") || profile?.roles?.includes("tecnico");
  const isAdmin = profile?.roles?.includes("admin_provedor");
  const ticketsAbertos = stats.tickets_novo + stats.tickets_em_atendimento;
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto px-4 py-6 space-y-5">

        {/* ── HEADER COMMAND CENTER ── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-6 text-white shadow-2xl">
          {/* background grid */}
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)", backgroundSize: "32px 32px" }} />

          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Sistema Online</span>
              </div>
              <h1 className="text-2xl font-bold">
                {saudacao}, {profile.nome.split(" ")[0]}!
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">
                {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                {" · "}
                <span className="text-slate-500 text-xs">Atualizado {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              </p>
            </div>

            {/* Indicadores de status crítico no header */}
            <div className="flex flex-wrap gap-2">
              {stats.chamados_qrcode > 0 && (
                <button
                  onClick={() => navigate("/tickets?filter=qrcode")}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                >
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <span className="text-sm font-semibold text-red-300">{stats.chamados_qrcode} QR Code</span>
                </button>
              )}
              {ticketsAbertos > 0 && (
                <button
                  onClick={() => navigate("/tickets")}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/20 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                >
                  <Ticket className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-semibold text-blue-300">{ticketsAbertos} abertos</span>
                </button>
              )}
              {stats.os_agendadas_hoje > 0 && (
                <button
                  onClick={() => navigate("/reports?tab=calendar")}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                >
                  <CalendarIcon className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-300">{stats.os_agendadas_hoje} OS hoje</span>
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="bg-yellow-400 hover:bg-yellow-300 text-yellow-900 font-bold border-0 shadow-lg"
                  onClick={() => setIsQuickFieldOpen(true)}
                >
                  <Zap className="h-4 w-4 mr-1" /> Modo Campo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-300 hover:text-white hover:bg-white/10 border border-white/10"
                  onClick={() => setIsCreateOSDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" /> Nova OS
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-400 hover:text-white hover:bg-white/10 border border-white/10 h-9 w-9"
                  onClick={loadDashboardData}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <NotificationPermissionPrompt />

        {loadError ? (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="text-sm">Não foi possível carregar os dados do dashboard.</p>
              </div>
              <Button size="sm" variant="outline" onClick={loadDashboardData}>
                <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
              </Button>
            </CardContent>
          </Card>
        ) : !data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Skeleton className="h-48 lg:col-span-2 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          </div>
        ) : (
          <>
            {/* ── KPIs PRINCIPAIS ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                icon={Ticket}
                label="Tickets Abertos"
                value={ticketsAbertos}
                sub={`${stats.tickets_novo} novos · ${stats.tickets_em_atendimento} em andamento`}
                accent="blue"
                onClick={() => navigate("/tickets")}
                urgent={ticketsAbertos > 5}
              />
              <KpiCard
                icon={CalendarIcon}
                label="OS Agendadas Hoje"
                value={stats.os_agendadas_hoje}
                sub={`${stats.os_pendentes} pendentes no total`}
                accent="emerald"
                onClick={() => navigate("/reports?tab=calendar")}
              />
              <KpiCard
                icon={Radio}
                label="Remotos Hoje"
                value={stats.atendimentos_remotos_hoje}
                sub={`${stats.atendimentos_mes} atendimentos no mês`}
                accent="violet"
                onClick={() => setIsRemoteServiceDialogOpen(true)}
              />
              <KpiCard
                icon={CheckCircle2}
                label="OS Finalizadas"
                value={stats.os_finalizadas}
                sub="Total concluídas"
                accent="slate"
                onClick={() => navigate("/reports?tab=service-orders&status=finalizada")}
              />
            </div>

            {/* ── MEU DIA ── */}
            <Card className="border-yellow-500/30 bg-gradient-to-r from-yellow-50/50 to-transparent dark:from-yellow-950/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    Meu Dia
                    <Badge variant="outline" className="text-xs font-normal">
                      {new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
                    </Badge>
                    {todayRecords.length > 0 && (
                      <Badge className="bg-yellow-500 text-yellow-900 text-xs">{todayRecords.length} atend.</Badge>
                    )}
                  </CardTitle>
                  <Button
                    size="sm"
                    className="bg-yellow-400 hover:bg-yellow-300 text-yellow-900 font-bold h-8"
                    onClick={() => setIsQuickFieldOpen(true)}
                  >
                    <Zap className="h-3.5 w-3.5 mr-1" /> Registrar Atendimento
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {todayRecords.length === 0 ? (
                  <div className="flex items-center justify-center py-4 text-center">
                    <div>
                      <p className="text-sm text-muted-foreground">Nenhum atendimento hoje ainda</p>
                      <Button variant="link" size="sm" onClick={() => setIsQuickFieldOpen(true)} className="text-yellow-600">
                        Registrar agora
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {todayRecords.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => navigate("/daily-services")}>
                        <div className={`h-2 w-2 rounded-full shrink-0 ${
                          r.status === "concluido" ? "bg-emerald-500" :
                          r.status === "em_andamento" ? "bg-amber-500" : "bg-slate-400"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.titulo}</p>
                          <p className="text-xs text-muted-foreground">{r.companies?.nome_fantasia}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono text-muted-foreground">{r.hora_inicio?.slice(0,5)}{r.hora_fim ? ` - ${r.hora_fim.slice(0,5)}` : ""}</p>
                          <Badge variant="secondary" className={`text-[10px] mt-0.5 ${r.status === "concluido" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : ""}`}>
                            {r.status === "concluido" ? "Concluído" : r.status === "em_andamento" ? "Em andamento" : "Pendente"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    <div className="pt-1">
                      <Button variant="link" size="sm" className="text-xs h-auto p-0 text-muted-foreground" onClick={() => navigate("/daily-services")}>
                        Ver todos os atendimentos →
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── ALERTAS IA ── */}
            {isAdmin && <SmartAlertsPanel />}

            {/* ── NOVOS CHAMADOS COM TRIAGEM IA ── */}
            {isAdminOrTech && <NewTicketsPanel />}

            {/* ── TICKETS + GRÁFICO ── */}
            {isAdminOrTech && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Status dos Tickets */}
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        Status dos Chamados
                      </CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => navigate("/tickets")}>
                        Ver todos <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: "Novos", value: stats.tickets_novo, color: "bg-blue-500", textColor: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
                      { label: "Em Atendimento", value: stats.tickets_em_atendimento, color: "bg-amber-500", textColor: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
                      { label: "Resolvidos", value: stats.tickets_resolvido, color: "bg-emerald-500", textColor: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
                      { label: "Fechados", value: stats.tickets_fechado, color: "bg-slate-400", textColor: "text-slate-500", dot: "bg-slate-400" },
                    ].map(({ label, value, color, textColor, dot }) => (
                      <div key={label} className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate("/tickets")}>
                        <div className={`h-2 w-2 rounded-full ${dot} shrink-0`} />
                        <span className="text-sm text-muted-foreground w-32 shrink-0">{label}</span>
                        <div className="flex-1">
                          <Progress
                            value={totalTickets > 0 ? (value / totalTickets) * 100 : 0}
                            className="h-2"
                          />
                        </div>
                        <span className={`text-sm font-bold w-8 text-right ${textColor}`}>{value}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                    <div className="pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
                      <span>{totalTickets} chamados no total</span>
                      <span className="font-medium">
                        {totalTickets > 0 ? Math.round(((stats.tickets_resolvido + stats.tickets_fechado) / totalTickets) * 100) : 0}% resolvidos
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Donut Chart */}
                {totalTickets > 0 ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        Distribuição
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center pt-0">
                      <div className="relative h-[140px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={ticketChartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={42}
                              outerRadius={62}
                              dataKey="value"
                              strokeWidth={3}
                              stroke="hsl(var(--card))"
                              isAnimationActive={false}
                            >
                              {ticketChartData.map((entry, index) => (
                                <Cell key={index} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: number, name: string) => [`${value}`, name]}
                              contentStyle={{
                                background: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                                fontSize: "12px",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="text-center">
                            <p className="text-2xl font-bold">{totalTickets}</p>
                            <p className="text-[10px] text-muted-foreground">total</p>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full mt-2">
                        {ticketChartData.map((item) => (
                          <div key={item.name} className="flex items-center gap-1.5 text-xs">
                            <div className="h-2 w-2 rounded-full shrink-0" style={{ background: item.color }} />
                            <span className="text-muted-foreground truncate">{item.name}</span>
                            <span className="font-semibold ml-auto">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="flex items-center justify-center">
                    <CardContent className="text-center py-8">
                      <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                      <p className="text-sm font-medium">Sem chamados abertos</p>
                      <p className="text-xs text-muted-foreground mt-1">Tudo em dia!</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ── AGENDAMENTOS + ATENDIMENTOS RECENTES ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-primary" />
                      Próximos Agendamentos
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/agenda")}>
                      Agenda <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {upcomingServiceOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <CalendarIcon className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">Nenhuma OS agendada nos próximos dias</p>
                    </div>
                  ) : (
                    upcomingServiceOrders.map((os) => (
                      <div
                        key={os.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/60 cursor-pointer transition-colors group"
                        onClick={() => handleViewServiceOrder(os.id)}
                      >
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm">OS #{os.numero_os}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {os.data_agendada && formatDateBR(os.data_agendada)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{os.companies?.nome_fantasia}</p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-xs font-mono">
                          {os.hora_agendada?.slice(0, 5) || "—"}
                        </Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      Atendimentos Recentes
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/daily-services")}>
                      Ver todos <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {recentServices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <ClipboardList className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">Nenhum atendimento no mês</p>
                    </div>
                  ) : (
                    recentServices.map((service) => (
                      <div
                        key={service.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/60 cursor-pointer transition-colors"
                        onClick={() => navigate("/daily-services")}
                      >
                        <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                          <ClipboardList className="h-3.5 w-3.5 text-violet-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{service.titulo}</p>
                          <p className="text-xs text-muted-foreground truncate">{service.companies?.nome_fantasia}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">
                            {service.data_atendimento && formatDateBR(service.data_atendimento)}
                          </p>
                          <Badge variant="secondary" className="text-[10px] mt-0.5">
                            {service.status?.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── LINHA INFERIOR: stats secundários + ações rápidas ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Stats secundários */}
              <div className="grid grid-cols-2 gap-3">
                <MiniStatCard
                  icon={Package}
                  label="Ativos"
                  value={stats.ativos}
                  onClick={() => navigate("/inventory")}
                  color="purple"
                />
                {isAdmin && (
                  <MiniStatCard
                    icon={Building2}
                    label="Empresas"
                    value={stats.empresas}
                    onClick={() => navigate("/companies")}
                    color="emerald"
                  />
                )}
                <MiniStatCard
                  icon={CheckCircle2}
                  label="OS Finalizadas"
                  value={stats.os_finalizadas}
                  onClick={() => navigate("/reports?tab=service-orders&status=finalizada")}
                  color="slate"
                />
                <MiniStatCard
                  icon={ClipboardList}
                  label="Atend./Mês"
                  value={stats.atendimentos_mes}
                  onClick={() => navigate("/daily-services")}
                  color="blue"
                />
              </div>

              {/* Acesso Remoto */}
              {isAdminOrTech && (
                <QuickRemoteServiceCard
                  atendimentosHoje={stats.atendimentos_remotos_hoje}
                  onOpenDialog={() => setIsRemoteServiceDialogOpen(true)}
                />
              )}

              {/* Ações Rápidas */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    Ações Rápidas
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-2">
                  {[
                    { icon: FileText, label: "Nova OS", onClick: () => setIsCreateOSDialogOpen(true), color: "text-primary" },
                    { icon: Monitor, label: "Remoto", onClick: () => setIsRemoteServiceDialogOpen(true), color: "text-violet-500" },
                    { icon: ClipboardList, label: "Atend.", onClick: () => navigate("/daily-services"), color: "text-blue-500" },
                    { icon: Package, label: "Ativos", onClick: () => navigate("/assets"), color: "text-purple-500" },
                    { icon: Bot, label: "IA", onClick: () => navigate("/ai-support"), color: "text-emerald-500" },
                    { icon: MessageSquare, label: "WhatsApp", onClick: () => navigate("/whatsapp-platform"), color: "text-green-500" },
                    { icon: BarChart3, label: "Analytics", onClick: () => navigate("/analytics"), color: "text-amber-500" },
                    { icon: Users, label: "Técnicos", onClick: () => navigate("/technicians"), color: "text-rose-500" },
                    { icon: TrendingUp, label: "Relatórios", onClick: () => navigate("/reports"), color: "text-sky-500" },
                  ].map(({ icon: Icon, label, onClick, color }) => (
                    <button
                      key={label}
                      onClick={onClick}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-accent transition-colors group"
                    >
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Icon className={`h-4 w-4 ${color}`} />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      <QuickFieldDialog
        open={isQuickFieldOpen}
        onOpenChange={setIsQuickFieldOpen}
        onSuccess={() => { loadTodayRecords(); loadDashboardData(); }}
      />
      <ServiceOrderCreateDialog
        open={isCreateOSDialogOpen}
        onOpenChange={setIsCreateOSDialogOpen}
        onSuccess={loadDashboardData}
      />
      <ServiceOrderDetailDialog
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        serviceOrder={selectedServiceOrder}
        onUpdate={loadDashboardData}
      />
      <RemoteServiceQuickDialog
        open={isRemoteServiceDialogOpen}
        onOpenChange={setIsRemoteServiceDialogOpen}
        onSuccess={loadDashboardData}
      />
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

type Accent = "blue" | "emerald" | "violet" | "amber" | "slate" | "purple" | "rose";

const accentMap: Record<Accent, { bg: string; text: string; border: string; badge: string }> = {
  blue:    { bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400",    border: "border-blue-500/20",    badge: "bg-blue-500" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20", badge: "bg-emerald-500" },
  violet:  { bg: "bg-violet-500/10",  text: "text-violet-600 dark:text-violet-400",  border: "border-violet-500/20",  badge: "bg-violet-500" },
  amber:   { bg: "bg-amber-500/10",   text: "text-amber-600 dark:text-amber-400",   border: "border-amber-500/20",   badge: "bg-amber-500" },
  slate:   { bg: "bg-slate-500/10",   text: "text-slate-600 dark:text-slate-400",   border: "border-slate-500/20",   badge: "bg-slate-500" },
  purple:  { bg: "bg-purple-500/10",  text: "text-purple-600 dark:text-purple-400",  border: "border-purple-500/20",  badge: "bg-purple-500" },
  rose:    { bg: "bg-rose-500/10",    text: "text-rose-600 dark:text-rose-400",    border: "border-rose-500/20",    badge: "bg-rose-500" },
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  onClick,
  urgent,
}: {
  icon: any;
  label: string;
  value: number;
  sub: string;
  accent: Accent;
  onClick: () => void;
  urgent?: boolean;
}) {
  const c = accentMap[accent];
  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all border ${c.border} ${urgent ? "ring-2 ring-red-500/30" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`h-9 w-9 rounded-lg ${c.bg} flex items-center justify-center`}>
            <Icon className={`h-5 w-5 ${c.text}`} />
          </div>
          {urgent && <div className="h-2 w-2 rounded-full bg-red-500" />}
        </div>
        <p className={`text-3xl font-bold ${c.text}`}>{value}</p>
        <p className="text-xs font-semibold text-foreground mt-0.5">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>
      </CardContent>
    </Card>
  );
}

function MiniStatCard({
  icon: Icon,
  label,
  value,
  onClick,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  onClick: () => void;
  color: Accent;
}) {
  const c = accentMap[color];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 p-3 rounded-xl border ${c.border} ${c.bg} hover:opacity-80 transition-all text-left`}
    >
      <Icon className={`h-4 w-4 ${c.text} shrink-0`} />
      <div className="min-w-0">
        <p className={`text-lg font-bold leading-none ${c.text}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{label}</p>
      </div>
    </button>
  );
}
