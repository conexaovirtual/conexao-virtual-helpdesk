import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useDisplacementReport, STOP_TYPES } from "@/hooks/useDisplacementReport";
import { StopDialog, StopRecord } from "@/components/displacement/StopDialog";
import { format, startOfMonth } from "date-fns";
import {
  Gauge,
  Fuel,
  Clock,
  Wrench,
  MapPin,
  Settings,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Car,
  Home,
  Package,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtKm = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
const fmtMin = (min: number) => {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
};
const fmtDateBR = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

interface Tecnico {
  id: string;
  nome: string;
}

function useTecnicos() {
  return useQuery<Tecnico[]>({
    queryKey: ["tecnicos-deslocamento"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["tecnico", "admin_provedor"]);
      const ids = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids)
        .order("nome");
      return (profs as Tecnico[]) || [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="text-xs uppercase tracking-wide truncate">{label}</span>
        </div>
        <p className="text-2xl font-semibold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function VehicleConfigDialog({
  open,
  onOpenChange,
  tecnicos,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tecnicos: Tecnico[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const geo = useGeolocation();
  const [tecId, setTecId] = useState<string>("");
  const [veiculo, setVeiculo] = useState("");
  const [consumo, setConsumo] = useState("10");
  const [preco, setPreco] = useState("6.00");
  const [velocidade, setVelocidade] = useState("30");
  const [baseLat, setBaseLat] = useState<number | null>(null);
  const [baseLon, setBaseLon] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const loadFor = async (id: string) => {
    setTecId(id);
    const { data } = await supabase
      .from("technician_vehicles")
      .select("*")
      .eq("tecnico_id", id)
      .maybeSingle();
    if (data) {
      setVeiculo(data.veiculo || "");
      setConsumo(String(data.consumo_km_litro ?? "10"));
      setPreco(String(data.preco_litro ?? "6.00"));
      setVelocidade(String(data.velocidade_media_kmh ?? "30"));
      setBaseLat(data.base_latitude != null ? Number(data.base_latitude) : null);
      setBaseLon(data.base_longitude != null ? Number(data.base_longitude) : null);
    } else {
      setVeiculo("");
      setConsumo("10");
      setPreco("6.00");
      setVelocidade("30");
      setBaseLat(null);
      setBaseLon(null);
    }
  };

  const captureHome = async () => {
    const pos = await geo.captureLocation();
    if (pos) {
      setBaseLat(pos.latitude);
      setBaseLon(pos.longitude);
      toast({ title: "Local de casa capturado" });
    }
  };

  const handleSave = async () => {
    if (!tecId) {
      toast({ title: "Selecione um técnico", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("technician_vehicles").upsert(
      {
        tecnico_id: tecId,
        veiculo: veiculo || null,
        consumo_km_litro: Number(consumo) || 10,
        preco_litro: Number(preco) || 0,
        velocidade_media_kmh: Number(velocidade) || 30,
        base_latitude: baseLat,
        base_longitude: baseLon,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tecnico_id" }
    );
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Configuração salva" });
    queryClient.invalidateQueries({ queryKey: ["displacement-report"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" /> Veículo / Combustível
          </DialogTitle>
          <DialogDescription>
            Consumo e preço do combustível por técnico. Usado para calcular o custo do deslocamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Técnico</Label>
            <Select value={tecId} onValueChange={loadFor}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o técnico" />
              </SelectTrigger>
              <SelectContent>
                {tecnicos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Veículo (opcional)</Label>
            <Input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} placeholder="Ex.: Onix 1.0" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Consumo (km/L)</Label>
              <Input type="number" inputMode="decimal" step="0.1" value={consumo} onChange={(e) => setConsumo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Preço (R$/L)</Label>
              <Input type="number" inputMode="decimal" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Vel. média (km/h)</Label>
              <Input type="number" inputMode="decimal" step="1" value={velocidade} onChange={(e) => setVelocidade(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A velocidade média serve só para estimar o tempo em trânsito.
          </p>

          <div className="rounded-lg border p-3 space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5" /> Local de partida (casa)
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Conta o trajeto casa → 1º cliente e último cliente → casa todo dia. Capture estando em casa.
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={captureHome} disabled={geo.loading}>
                <MapPin className="h-3.5 w-3.5" />
                {geo.loading ? "Capturando..." : "Usar minha localização atual"}
              </Button>
              {baseLat != null && baseLon != null && (
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => { setBaseLat(null); setBaseLon(null); }}>
                  Remover
                </Button>
              )}
            </div>
            <p className="text-[11px]">
              {baseLat != null && baseLon != null ? (
                <span className="text-green-600">📍 Casa definida ({baseLat.toFixed(5)}, {baseLon.toFixed(5)})</span>
              ) : (
                <span className="text-amber-600">Casa não definida — o trajeto de ida/volta não é contado.</span>
              )}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !tecId}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Deslocamento() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isAdmin = profile?.roles?.includes("admin_provedor");
  const canAccess = isAdmin || profile?.roles?.includes("tecnico");

  useEffect(() => {
    if (!authLoading) {
      if (!profile) navigate("/auth");
      else if (!canAccess) navigate("/dashboard");
    }
  }, [authLoading, profile, canAccess, navigate]);

  const { data: tecnicos = [] } = useTecnicos();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date();
  const [from, setFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(today, "yyyy-MM-dd"));
  const [tecnicoId, setTecnicoId] = useState<string>("all");
  const [configOpen, setConfigOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [stopOpen, setStopOpen] = useState(false);
  const [editingStop, setEditingStop] = useState<StopRecord | null>(null);

  const { data: report, isLoading } = useDisplacementReport({ from, to, tecnicoId });

  // Paradas avulsas do período (para gerenciar: adicionar/editar/excluir)
  const { data: stops = [] } = useQuery<StopRecord[]>({
    queryKey: ["displacement-stops-manage", from, to, tecnicoId],
    queryFn: async () => {
      let q = supabase
        .from("displacement_stops")
        .select("id, tecnico_id, data, hora, tipo, nome, endereco, latitude, longitude, observacao")
        .gte("data", from)
        .lte("data", to)
        .order("data", { ascending: false })
        .order("hora", { ascending: true });
      if (tecnicoId !== "all") q = q.eq("tecnico_id", tecnicoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as StopRecord[]) || [];
    },
  });

  const nomeByTec = useMemo(() => {
    const m = new Map<string, string>();
    tecnicos.forEach((tc) => m.set(tc.id, tc.nome));
    return m;
  }, [tecnicos]);

  const refreshStops = () => {
    queryClient.invalidateQueries({ queryKey: ["displacement-report"] });
    queryClient.invalidateQueries({ queryKey: ["displacement-stops-manage"] });
  };

  const openNewStop = () => {
    setEditingStop(null);
    setStopOpen(true);
  };
  const openEditStop = (s: StopRecord) => {
    setEditingStop(s);
    setStopOpen(true);
  };
  const deleteStop = async (s: StopRecord) => {
    if (!window.confirm("Excluir esta parada?")) return;
    const { error } = await supabase.from("displacement_stops").delete().eq("id", s.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Parada excluída" });
    refreshStops();
  };

  // Técnico-alvo ao adicionar parada: o filtrado, ou o próprio usuário se "todos"
  const addTecnicoId = tecnicoId !== "all" ? tecnicoId : profile?.id ?? "";

  const toggle = (key: string) => {
    const next = new Set(expanded);
    next.has(key) ? next.delete(key) : next.add(key);
    setExpanded(next);
  };

  const t = report?.totals;
  const mediaKmDia = useMemo(() => {
    if (!t || t.dias === 0) return 0;
    return t.km / t.dias;
  }, [t]);

  if (authLoading || !profile || !canAccess) return null;

  return (
    <div className="bg-background min-h-screen">
      <PageHeader
        icon={Gauge}
        title="Deslocamento"
        subtitle="Km, tempo e custo de combustível dos atendimentos"
        actions={
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5"
            onClick={() => setConfigOpen(true)}
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Veículo</span>
          </Button>
        }
      />

      <main className="container mx-auto px-4 py-4 space-y-4">
        {/* Filtros */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">De</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Técnico</Label>
                <Select value={tecnicoId} onValueChange={setTecnicoId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os técnicos</SelectItem>
                    {tecnicos.map((tc) => (
                      <SelectItem key={tc.id} value={tc.id}>
                        {tc.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={MapPin} label="Distância" value={fmtKm(t?.km ?? 0)} hint={`Média ${fmtKm(mediaKmDia)}/dia`} />
          <KpiCard icon={Fuel} label="Combustível" value={fmtBRL(t?.custoCombustivel ?? 0)} hint="Estimado" />
          <KpiCard icon={Clock} label="Em trânsito" value={fmtMin(t?.tempoTransitoMin ?? 0)} hint="Estimado" />
          <KpiCard icon={Wrench} label="Em atendimento" value={fmtMin(t?.tempoAtendimentoMin ?? 0)} hint="Real" />
        </div>

        {/* Resumo por técnico (quando vê todos) */}
        {tecnicoId === "all" && (report?.byTecnico.length ?? 0) > 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Por técnico</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {report!.byTecnico.map((tec) => (
                <div
                  key={tec.tecnicoId}
                  className="flex items-center justify-between gap-2 p-3 rounded-lg border min-w-0"
                >
                  <span className="font-medium text-sm truncate">{tec.nome}</span>
                  <div className="flex items-center gap-3 shrink-0 text-sm">
                    <span>{fmtKm(tec.km)}</span>
                    <span className="text-green-600 font-medium">{fmtBRL(tec.custoCombustivel)}</span>
                    <Badge variant="secondary">{tec.atendimentos} atend.</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Paradas avulsas */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" /> Paradas avulsas
            </CardTitle>
            <Button size="sm" variant="secondary" className="h-8 gap-1.5" onClick={openNewStop} disabled={!addTecnicoId}>
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </Button>
          </CardHeader>
          <CardContent>
            {stops.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Nenhuma parada no período. Use “Adicionar” para registrar locais que não são clientes mas geraram
                deslocamento (deixar/buscar equipamento, compra de peça…).
              </p>
            ) : (
              <div className="space-y-2">
                {stops.map((s) => {
                  const meta = STOP_TYPES[s.tipo] || STOP_TYPES.outro;
                  return (
                    <div key={s.id} className="flex items-center gap-2 p-2.5 rounded-lg border min-w-0">
                      <span className="text-lg shrink-0" aria-hidden>
                        {meta.emoji}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.nome || meta.label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {fmtDateBR(s.data)}
                          {s.hora ? ` · ${s.hora.substring(0, 5)}` : ""} · {meta.label}
                          {tecnicoId === "all" && nomeByTec.get(s.tecnico_id) ? ` · ${nomeByTec.get(s.tecnico_id)}` : ""}
                          {s.latitude == null || s.longitude == null ? " · ⚠️ sem GPS" : ""}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => openEditStop(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-destructive"
                        onClick={() => deleteStop(s)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detalhamento por dia */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Por dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center text-sm text-muted-foreground py-8">Calculando...</p>
            ) : (report?.days.length ?? 0) === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum atendimento com deslocamento no período.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {report!.days.map((d) => {
                  const key = `${d.tecnicoId}-${d.date}`;
                  const isOpen = expanded.has(key);
                  return (
                    <div key={key} className="rounded-lg border">
                      <button
                        className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/40 transition-colors"
                        onClick={() => toggle(key)}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{fmtDateBR(d.date)}</p>
                          {tecnicoId === "all" && (
                            <p className="text-xs text-muted-foreground truncate">{d.tecnicoNome}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-sm">
                          <span className="hidden sm:inline">{fmtKm(d.km)}</span>
                          <span className="text-green-600 font-medium">{fmtBRL(d.custoCombustivel)}</span>
                          <Badge variant="secondary">{d.atendimentos}</Badge>
                          {d.paradas > 0 && (
                            <Badge variant="outline" className="gap-1">
                              <Package className="h-3 w-3" /> {d.paradas}
                            </Badge>
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-3 pb-3 pt-0 space-y-2 border-t">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 text-xs">
                            <div>
                              <p className="text-muted-foreground">Distância</p>
                              <p className="font-medium">{fmtKm(d.km)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Combustível</p>
                              <p className="font-medium">{fmtBRL(d.custoCombustivel)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Trânsito (est.)</p>
                              <p className="font-medium">{fmtMin(d.tempoTransitoMin)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Atendimento</p>
                              <p className="font-medium">{fmtMin(d.tempoAtendimentoMin)}</p>
                            </div>
                          </div>

                          {d.legs.length > 0 ? (
                            <div className="space-y-1 pt-1">
                              {d.legs.map((leg, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span className="truncate flex-1 min-w-0">
                                    {leg.fromName} → {leg.toName}
                                  </span>
                                  <span className="shrink-0">{fmtKm(leg.km)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground pt-1">
                              Sem trechos medíveis (atendimentos no mesmo local ou sem GPS).
                            </p>
                          )}

                          {d.semGps > 0 && (
                            <p className="text-xs text-amber-600 pt-1">
                              {d.semGps} atendimento(s) sem GPS não entraram no cálculo de distância.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nota de método */}
        <p className="text-xs text-muted-foreground px-1">
          Considera apenas <strong>visitas técnicas</strong> (atendimento remoto não gera deslocamento).
          A distância usa a <strong>localização cadastrada de cada empresa</strong> (linha reta × 1,3 para
          aproximar a estrada) e inclui o trajeto <strong>casa → 1º cliente → … → casa</strong> quando o
          local de partida está definido no veículo. Empresas sem GPS não entram no cálculo.
          O combustível usa o consumo e o preço por litro de cada técnico.
        </p>
      </main>

      <VehicleConfigDialog open={configOpen} onOpenChange={setConfigOpen} tecnicos={tecnicos} />

      {addTecnicoId && (
        <StopDialog
          open={stopOpen}
          onOpenChange={setStopOpen}
          tecnicoId={editingStop?.tecnico_id || addTecnicoId}
          date={editingStop?.data || to}
          stop={editingStop}
          allowDateEdit
          onSuccess={refreshStops}
        />
      )}
    </div>
  );
}
