import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Star, Smile, MessageSquare, TrendingUp, RefreshCw, Send } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Periodo = 30 | 90 | 0; // 0 = tudo

const fmtPct = (n: number) => `${Math.round(n)}%`;

const notaColor = (n: number) =>
  n >= 4 ? "text-emerald-600" : n === 3 ? "text-amber-500" : "text-red-500";
const notaBg = (n: number) =>
  n >= 4 ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : n === 3 ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-red-100 text-red-700 border-red-200";

export default function CsatDashboard() {
  const navigate = useNavigate();
  const { profile, loading: authLoading, isAdmin } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo>(90);

  useEffect(() => {
    if (!authLoading && !profile) navigate("/auth");
    else if (!authLoading && profile && !isAdmin()) navigate("/dashboard");
  }, [profile, authLoading, navigate, isAdmin]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["csat", periodo],
    queryFn: async () => {
      let q = supabase
        .from("csat_responses")
        .select("id, rating, status, comment, created_at, responded_at, phone, ticket_id, service_order_id, companies:company_id(nome_fantasia)")
        .order("created_at", { ascending: false });
      if (periodo > 0) {
        const since = new Date(Date.now() - periodo * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte("created_at", since);
      }
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile && isAdmin(),
  });

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="h-96 w-full max-w-md" />
      </div>
    );
  }

  const rows = data || [];
  const enviados = rows.length;
  const respondidos = rows.filter((r: any) => r.rating != null);
  const totalResp = respondidos.length;
  const media = totalResp > 0
    ? respondidos.reduce((acc: number, r: any) => acc + r.rating, 0) / totalResp
    : 0;
  const taxaResposta = enviados > 0 ? (totalResp / enviados) * 100 : 0;
  const promotores = totalResp > 0
    ? (respondidos.filter((r: any) => r.rating >= 4).length / totalResp) * 100
    : 0;

  // Distribuição 5★ → 1★
  const dist = [5, 4, 3, 2, 1].map((n) => ({
    nota: n,
    qtd: respondidos.filter((r: any) => r.rating === n).length,
  }));
  const maxQtd = Math.max(1, ...dist.map((d) => d.qtd));

  const periodoBtn = (p: Periodo, label: string) => (
    <Button
      key={p}
      size="sm"
      variant={periodo === p ? "default" : "outline"}
      onClick={() => setPeriodo(p)}
      className="h-7 text-xs"
    >
      {label}
    </Button>
  );

  return (
    <div className="bg-background min-h-screen">
      <PageHeader
        icon={Smile}
        title="Satisfação (CSAT)"
        subtitle="Avaliações dos clientes ao fechar chamados e OS"
        metrics={[
          { icon: Star, label: "Nota média", value: totalResp > 0 ? media.toFixed(1) : "—", color: "bg-emerald-600/90" },
          { icon: MessageSquare, label: "Respostas", value: totalResp, color: "bg-blue-600/90" },
          { icon: Send, label: "Taxa resposta", value: enviados > 0 ? fmtPct(taxaResposta) : "—", color: "bg-violet-600/90" },
          { icon: TrendingUp, label: "Promotores", value: totalResp > 0 ? fmtPct(promotores) : "—", color: "bg-teal-600/90" },
        ]}
        actions={
          <Button onClick={() => refetch()} variant="ghost" size="icon" disabled={isFetching}
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        }
      />

      <main className="container mx-auto px-4 py-4 space-y-4">
        <div className="flex gap-2">
          {periodoBtn(30, "30 dias")}
          {periodoBtn(90, "90 dias")}
          {periodoBtn(0, "Tudo")}
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : enviados === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Smile className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhuma pesquisa ainda neste período.</p>
              <p className="text-sm mt-1">
                As avaliações aparecem aqui automaticamente conforme você fecha chamados e finaliza OS.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Distribuição de notas */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Distribuição de notas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dist.map((d) => (
                  <div key={d.nota} className="flex items-center gap-3">
                    <div className="flex items-center gap-1 w-12 shrink-0">
                      <span className="text-sm font-medium">{d.nota}</span>
                      <Star className={`h-3.5 w-3.5 ${notaColor(d.nota)}`} fill="currentColor" />
                    </div>
                    <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                      <div
                        className={`h-full ${d.nota >= 4 ? "bg-emerald-500" : d.nota === 3 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${(d.qtd / maxQtd) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-8 text-right shrink-0">{d.qtd}</span>
                  </div>
                ))}
                {totalResp === 0 && (
                  <p className="text-sm text-muted-foreground pt-1">
                    {enviados} pesquisa(s) enviada(s), aguardando resposta dos clientes.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Respostas recentes */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Respostas recentes</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Data</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead className="w-24 text-center">Nota</TableHead>
                        <TableHead>Referência</TableHead>
                        <TableHead>Comentário</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell className="pl-4 text-sm whitespace-nowrap">
                            {format(new Date(r.responded_at || r.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.companies?.nome_fantasia || <span className="text-muted-foreground">{r.phone || "—"}</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.rating != null ? (
                              <Badge variant="outline" className={`gap-1 ${notaBg(r.rating)}`}>
                                {r.rating} <Star className="h-3 w-3" fill="currentColor" />
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">aguardando</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.ticket_id ? "Chamado" : r.service_order_id ? "OS" : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                            {r.comment || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
