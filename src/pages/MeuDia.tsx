import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useGeolocation } from "@/hooks/useGeolocation";
import { GeolocationCapture } from "@/components/ui/GeolocationCapture";
import { DailyServiceRecordDialog } from "@/components/daily-records/DailyServiceRecordDialog";
import { useDisplacementReport } from "@/hooks/useDisplacementReport";
import {
  CalendarCheck,
  MapPin,
  Navigation,
  Fuel,
  Route as RouteIcon,
  FileText,
  ClipboardList,
  CalendarClock,
  CheckCircle2,
  Wrench,
} from "lucide-react";

// Haversine (km)
function haversine(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371;
  const dLat = ((la2 - la1) * Math.PI) / 180;
  const dLon = ((lo2 - lo1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const ROAD_FACTOR = 1.3;

type StopType = "os" | "visita" | "compromisso" | "realizado";

interface Stop {
  key: string;
  type: StopType;
  sourceId: string; // id da OS / visita / compromisso / atendimento
  time: string | null; // HH:MM
  title: string;
  company: string;
  companyId: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  done: boolean;
}

const typeMeta: Record<StopType, { label: string; icon: any; cls: string }> = {
  os: { label: "OS", icon: FileText, cls: "bg-blue-500/10 text-blue-600" },
  visita: { label: "Visita", icon: ClipboardList, cls: "bg-purple-500/10 text-purple-600" },
  compromisso: { label: "Compromisso", icon: CalendarClock, cls: "bg-teal-500/10 text-teal-600" },
  realizado: { label: "Realizado", icon: Wrench, cls: "bg-green-500/10 text-green-600" },
};

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtKm = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
const fmtMin = (min: number) => {
  const t = Math.round(min);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
};

export default function MeuDia() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { position, loading: geoLoading, error: geoError, captureLocation } = useGeolocation();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [optimized, setOptimized] = useState<Stop[] | null>(null);
  const [registerCompanyId, setRegisterCompanyId] = useState<string | null>(null);
  const [registerStop, setRegisterStop] = useState<Stop | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const openRegister = (stop: Stop | null) => {
    setRegisterStop(stop);
    setRegisterCompanyId(stop?.companyId ?? null);
    setRegisterOpen(true);
  };

  // Após registrar o atendimento, oferece concluir a OS/visita agendada vinculada.
  const handleRegistered = async () => {
    const stop = registerStop;
    setRegisterOpen(false);
    setRegisterCompanyId(null);
    setRegisterStop(null);

    if (stop && stop.sourceId && (stop.type === "os" || stop.type === "visita")) {
      const isOs = stop.type === "os";
      const ref = isOs ? stop.title.split("—")[0].trim() : `a visita em ${stop.company}`;
      const aviso = isOs ? "\nIsso encerra a OS e envia a pesquisa de satisfação ao cliente." : "";
      if (window.confirm(`Marcar ${ref} como concluída?${aviso}`)) {
        try {
          const { error } = isOs
            ? await supabase
                .from("service_orders")
                .update({ status: "finalizada", data_execucao: new Date().toISOString() })
                .eq("id", stop.sourceId)
            : await supabase.from("visit_schedules").update({ status: "concluida" }).eq("id", stop.sourceId);
          if (error) throw error;
          toast({ title: isOs ? "OS concluída" : "Visita concluída" });
        } catch (e: any) {
          toast({
            title: "Atendimento salvo, mas não consegui concluir",
            description: e?.message || "Tente dar baixa manualmente.",
            variant: "destructive",
          });
        }
      }
    }
    queryClient.invalidateQueries({ queryKey: ["meu-dia"] });
  };

  const { data: vehicle } = useQuery({
    queryKey: ["my-vehicle", profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("technician_vehicles")
        .select("consumo_km_litro, preco_litro")
        .eq("tecnico_id", profile!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!profile,
  });

  const { data: stops = [], isLoading } = useQuery<Stop[]>({
    queryKey: ["meu-dia", date, profile?.id],
    queryFn: async () => {
      const [osRes, visitRes, apptRes, doneRes] = await Promise.all([
        supabase
          .from("service_orders")
          .select(
            "id, numero_os, descricao_servicos, status, hora_agendada, companies:company_id(id, nome_fantasia, endereco, latitude, longitude)"
          )
          .gte("data_agendada", `${date}T00:00:00`)
          .lte("data_agendada", `${date}T23:59:59`)
          .in("status", ["agendada", "confirmada", "em_execucao", "finalizada"]),
        supabase
          .from("visit_schedules")
          .select(
            "id, motivo, status, companies:company_id(id, nome_fantasia, endereco, latitude, longitude)"
          )
          .eq("proxima_visita", date),
        supabase
          .from("appointments")
          .select(
            "id, title, appointment_time, status, companies:company_id(id, nome_fantasia, endereco, latitude, longitude)"
          )
          .eq("user_id", profile!.id)
          .eq("appointment_date", date)
          .neq("status", "cancelado"),
        supabase
          .from("daily_service_records")
          .select(
            "id, titulo, hora_inicio, canal, companies:company_id(id, nome_fantasia, endereco, latitude, longitude)"
          )
          .eq("data_atendimento", date)
          .eq("tecnico_id", profile!.id),
      ]);

      const items: Stop[] = [];
      (osRes.data || []).forEach((o: any) => {
        items.push({
          key: `os-${o.id}`,
          type: "os",
          sourceId: o.id,
          time: o.hora_agendada ? o.hora_agendada.substring(0, 5) : null,
          title: `OS #${o.numero_os} — ${(o.descricao_servicos || "").substring(0, 50)}`,
          company: o.companies?.nome_fantasia || "—",
          companyId: o.companies?.id ?? null,
          address: o.companies?.endereco || null,
          lat: o.companies?.latitude ?? null,
          lon: o.companies?.longitude ?? null,
          done: o.status === "finalizada",
        });
      });
      (visitRes.data || []).forEach((v: any) => {
        items.push({
          key: `visit-${v.id}`,
          type: "visita",
          sourceId: v.id,
          time: null,
          title: `Visita — ${v.motivo || ""}`,
          company: v.companies?.nome_fantasia || "—",
          companyId: v.companies?.id ?? null,
          address: v.companies?.endereco || null,
          lat: v.companies?.latitude ?? null,
          lon: v.companies?.longitude ?? null,
          done: v.status === "concluida",
        });
      });
      (apptRes.data || []).forEach((a: any) => {
        items.push({
          key: `appt-${a.id}`,
          type: "compromisso",
          sourceId: a.id,
          time: a.appointment_time ? a.appointment_time.substring(0, 5) : null,
          title: a.title || "Compromisso",
          company: a.companies?.nome_fantasia || "",
          companyId: a.companies?.id ?? null,
          address: a.companies?.endereco || null,
          lat: a.companies?.latitude ?? null,
          lon: a.companies?.longitude ?? null,
          done: a.status === "concluido",
        });
      });
      (doneRes.data || []).forEach((d: any) => {
        const remoto = d.canal && d.canal !== "visita_tecnica";
        items.push({
          key: `done-${d.id}`,
          type: "realizado",
          sourceId: d.id,
          time: d.hora_inicio ? d.hora_inicio.substring(0, 5) : null,
          title: `${remoto ? "🖥️ " : ""}${d.titulo || "Atendimento"}`,
          company: d.companies?.nome_fantasia || "—",
          companyId: d.companies?.id ?? null,
          address: remoto ? null : d.companies?.endereco || null,
          lat: remoto ? null : d.companies?.latitude ?? null,
          lon: remoto ? null : d.companies?.longitude ?? null,
          done: true,
        });
      });

      items.sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time);
        if (a.time) return -1;
        if (b.time) return 1;
        return 0;
      });
      return items;
    },
    enabled: !!profile,
  });

  // Resumo do dia (visitas realizadas): reaproveita o motor do Deslocamento
  const { data: dayReport } = useDisplacementReport({
    from: date,
    to: date,
    tecnicoId: profile?.id ?? "all",
  });
  const resumo = dayReport?.totals;

  const list = optimized ?? stops;

  const navUrl = (s: Stop) =>
    s.lat != null && s.lon != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`
      : s.address
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}`
      : null;

  const optimize = () => {
    // Roteia só o que ainda falta fazer (paradas pendentes com GPS)
    const geo = stops.filter((s) => !s.done && s.lat != null && s.lon != null);
    if (geo.length < 2) {
      toast({ title: "Poucas paradas pendentes com GPS para otimizar", variant: "destructive" });
      return;
    }
    const remaining = [...geo];
    const ordered: Stop[] = [];
    let cur = position
      ? { lat: position.latitude, lon: position.longitude }
      : { lat: remaining[0].lat!, lon: remaining[0].lon! };
    if (!position) ordered.push(remaining.shift()!);
    while (remaining.length) {
      let bi = 0;
      let bd = Infinity;
      remaining.forEach((s, i) => {
        const d = haversine(cur.lat, cur.lon, s.lat!, s.lon!);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      const next = remaining.splice(bi, 1)[0];
      ordered.push(next);
      cur = { lat: next.lat!, lon: next.lon! };
    }
    // pendentes sem GPS e realizadas vão para o fim (não entram na rota)
    const pendentesSemGps = stops.filter((s) => !s.done && (s.lat == null || s.lon == null));
    const realizadas = stops.filter((s) => s.done);
    setOptimized([...ordered, ...pendentesSemGps, ...realizadas]);
    toast({ title: "Rota do dia otimizada", description: `${ordered.length} parada(s) pendentes ordenadas.` });
  };

  const totalKm = useMemo(() => {
    if (!optimized) return 0;
    const geo = optimized.filter((s) => !s.done && s.lat != null && s.lon != null);
    let total = 0;
    let pl = position?.latitude ?? geo[0]?.lat ?? null;
    let po = position?.longitude ?? geo[0]?.lon ?? null;
    const start = position ? 0 : 1;
    for (let i = start; i < geo.length; i++) {
      if (pl != null && po != null) total += haversine(pl, po, geo[i].lat!, geo[i].lon!) * ROAD_FACTOR;
      pl = geo[i].lat!;
      po = geo[i].lon!;
    }
    return total;
  }, [optimized, position]);

  const fuelCost = useMemo(() => {
    if (!vehicle || totalKm <= 0) return null;
    return (totalKm / (Number(vehicle.consumo_km_litro) || 10)) * (Number(vehicle.preco_litro) || 0);
  }, [vehicle, totalKm]);

  const openAllInMaps = () => {
    if (!optimized) return;
    const geo = optimized.filter((s) => !s.done && s.lat != null && s.lon != null);
    if (!geo.length) return;
    const origin = position ? `${position.latitude},${position.longitude}` : `${geo[0].lat},${geo[0].lon}`;
    const dest = geo[geo.length - 1];
    const mids = geo.slice(position ? 0 : 1, -1).map((s) => `${s.lat},${s.lon}`).join("|");
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest.lat},${dest.lon}${
      mids ? `&waypoints=${mids}` : ""
    }`;
    window.open(url, "_blank");
  };

  const doneCount = stops.filter((s) => s.done).length;
  const semGpsCount = stops.filter((s) => s.lat == null || s.lon == null).length;

  return (
    <div className="bg-background min-h-screen">
      <PageHeader icon={CalendarCheck} title="Meu Dia" subtitle="Seu roteiro de atendimentos do dia" />

      <main className="container mx-auto px-4 py-4 space-y-4">
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setOptimized(null);
                }}
                className="sm:w-44"
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{stops.length} parada(s)</Badge>
                {doneCount > 0 && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {doneCount} concluída(s)
                  </span>
                )}
              </div>
              <div className="flex-1" />
              <Button onClick={optimize} disabled={stops.length < 2} variant="secondary" className="gap-2">
                <RouteIcon className="h-4 w-4" /> Otimizar rota
              </Button>
              <Button onClick={() => openRegister(null)} className="gap-2">
                <Wrench className="h-4 w-4" /> Registrar atendimento
              </Button>
            </div>

            <GeolocationCapture
              label="Sua localização (ponto de partida da rota)"
              position={position}
              loading={geoLoading}
              error={geoError}
              onCapture={captureLocation}
            />

            {optimized && (
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium">Rota: {totalKm.toFixed(1)} km</p>
                  {fuelCost !== null ? (
                    <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <Fuel className="h-3 w-3" /> {fmtBRL(fuelCost)} de combustível
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Configure seu veículo em Deslocamento p/ ver o custo.</p>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={openAllInMaps} className="gap-1.5">
                  <Navigation className="h-3 w-3" /> Abrir no Maps
                </Button>
              </div>
            )}
            {semGpsCount > 0 && (
              <p className="text-xs text-amber-600">
                {semGpsCount} parada(s) sem GPS não entram na rota — capture a localização na empresa.
              </p>
            )}
          </CardContent>
        </Card>

        {resumo && resumo.atendimentos > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Resumo do dia (visitas realizadas)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Distância</p>
                  <p className="text-lg font-semibold">{fmtKm(resumo.km)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Combustível</p>
                  <p className="text-lg font-semibold text-green-600">{fmtBRL(resumo.custoCombustivel)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Em atendimento</p>
                  <p className="text-lg font-semibold">{fmtMin(resumo.tempoAtendimentoMin)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Visitas</p>
                  <p className="text-lg font-semibold">{resumo.atendimentos}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Inclui ida/volta de casa e tempo em trânsito estimado de {fmtMin(resumo.tempoTransitoMin)}.
              </p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-8">Carregando seu dia...</p>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <CalendarCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nada agendado para esse dia.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {list.map((s, idx) => {
              const meta = typeMeta[s.type];
              const Icon = meta.icon;
              const url = navUrl(s);
              return (
                <Card key={s.key} className={s.done ? "opacity-60" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {optimized && !s.done && s.lat != null && (
                        <div className="flex items-center justify-center h-7 w-7 shrink-0 rounded-full bg-primary/15 text-primary text-xs font-bold mt-0.5">
                          {idx + 1}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`${meta.cls} gap-1`}>
                            <Icon className="h-3 w-3" /> {meta.label}
                          </Badge>
                          {s.time && <span className="text-xs font-medium">{s.time}</span>}
                          {s.done && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                        </div>
                        <p className="text-sm font-medium mt-1 break-words">{s.title}</p>
                        {s.company && (
                          <p className="text-xs text-muted-foreground break-words">{s.company}</p>
                        )}
                        {s.address && (
                          <p className="text-xs text-muted-foreground break-words flex items-start gap-1">
                            <MapPin className="h-3 w-3 mt-0.5 shrink-0" /> {s.address}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 p-1"
                            title="Navegar"
                          >
                            <Navigation className="h-4 w-4" />
                          </a>
                        )}
                        {!s.done && s.companyId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => openRegister(s)}
                          >
                            <Wrench className="h-3 w-3" /> Registrar
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground px-1">
          Mostra o que está <strong>agendado</strong> (OS e visitas da equipe + seus compromissos) e o que
          você <strong>já realizou</strong> no dia (marcado como "Realizado"). A rota otimiza só as paradas
          pendentes, usando o GPS das empresas; o custo usa o veículo configurado em Deslocamento.
        </p>
      </main>

      <DailyServiceRecordDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        defaultCompanyId={registerCompanyId || undefined}
        onSuccess={handleRegistered}
      />
    </div>
  );
}
