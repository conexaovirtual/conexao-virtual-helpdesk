/**
 * useDisplacementReport
 * Deriva o deslocamento (km, custo de combustível, tempo) dos atendimentos já
 * registrados — usando o GPS capturado em cada atendimento. Sem digitação extra.
 *
 * Método: por técnico/dia, ordena os atendimentos por horário e mede o trecho
 * entre o local de um e o do próximo (haversine em linha reta × fator de estrada).
 * O custo vem da config de veículo do técnico (km/L e R$/L). O tempo de trânsito
 * é estimado pela distância e velocidade média; o tempo de atendimento é real
 * (hora_fim − hora_inicio).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const ROAD_FACTOR = 1.3; // linha reta → estrada (aproximação)

// Distância em km entre duas coordenadas (Haversine)
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// "HH:MM[:SS]" → minutos desde meia-noite
function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export interface VehicleConfig {
  consumo_km_litro: number;
  preco_litro: number;
  velocidade_media_kmh: number;
  base_latitude: number | null;
  base_longitude: number | null;
}

const DEFAULT_VEHICLE: VehicleConfig = {
  consumo_km_litro: 10,
  preco_litro: 6,
  velocidade_media_kmh: 30,
  base_latitude: null,
  base_longitude: null,
};

export interface DisplacementLeg {
  fromName: string;
  toName: string;
  km: number;
}

export interface DayDisplacement {
  date: string; // yyyy-mm-dd
  tecnicoId: string;
  tecnicoNome: string;
  atendimentos: number;
  km: number;
  custoCombustivel: number;
  tempoAtendimentoMin: number;
  tempoTransitoMin: number;
  legs: DisplacementLeg[];
  semGps: number; // atendimentos do dia sem GPS (não entram no cálculo de trecho)
}

export interface TecnicoTotals {
  tecnicoId: string;
  nome: string;
  km: number;
  custoCombustivel: number;
  tempoAtendimentoMin: number;
  tempoTransitoMin: number;
  atendimentos: number;
  dias: number;
}

export interface DisplacementReport {
  days: DayDisplacement[];
  byTecnico: TecnicoTotals[];
  totals: {
    km: number;
    custoCombustivel: number;
    tempoAtendimentoMin: number;
    tempoTransitoMin: number;
    atendimentos: number;
    dias: number;
    atendimentosSemGps: number;
  };
}

interface RawRecord {
  id: string;
  data_atendimento: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  latitude_inicio: number | null;
  longitude_inicio: number | null;
  tecnico_id: string | null;
  company_id: string | null;
  canal: string | null;
  companies: { nome_fantasia: string | null; latitude: number | null; longitude: number | null } | null;
}

// Localização da visita: prioriza o GPS da empresa (confiável) e cai no GPS
// capturado no atendimento só como reserva.
function recordLoc(r: RawRecord): { lat: number; lon: number } | null {
  if (r.companies?.latitude != null && r.companies?.longitude != null) {
    return { lat: r.companies.latitude, lon: r.companies.longitude };
  }
  if (r.latitude_inicio != null && r.longitude_inicio != null) {
    return { lat: r.latitude_inicio, lon: r.longitude_inicio };
  }
  return null;
}

export function useDisplacementReport(params: {
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
  tecnicoId: string | "all";
}) {
  const { from, to, tecnicoId } = params;

  return useQuery<DisplacementReport>({
    queryKey: ["displacement-report", from, to, tecnicoId],
    queryFn: async () => {
      // 1) Config de veículo por técnico
      const { data: vehicles } = await supabase
        .from("technician_vehicles")
        .select(
          "tecnico_id, consumo_km_litro, preco_litro, velocidade_media_kmh, base_latitude, base_longitude"
        );
      const vehicleByTec = new Map<string, VehicleConfig>();
      (vehicles || []).forEach((v: any) => {
        vehicleByTec.set(v.tecnico_id, {
          consumo_km_litro: Number(v.consumo_km_litro) || DEFAULT_VEHICLE.consumo_km_litro,
          preco_litro: Number(v.preco_litro) ?? DEFAULT_VEHICLE.preco_litro,
          velocidade_media_kmh: Number(v.velocidade_media_kmh) || DEFAULT_VEHICLE.velocidade_media_kmh,
          base_latitude: v.base_latitude != null ? Number(v.base_latitude) : null,
          base_longitude: v.base_longitude != null ? Number(v.base_longitude) : null,
        });
      });

      // 2) Atendimentos do período
      let q = supabase
        .from("daily_service_records")
        .select(
          "id, data_atendimento, hora_inicio, hora_fim, latitude_inicio, longitude_inicio, tecnico_id, company_id, canal, companies(nome_fantasia, latitude, longitude)"
        )
        .gte("data_atendimento", from)
        .lte("data_atendimento", to)
        .not("tecnico_id", "is", null);
      if (tecnicoId !== "all") q = q.eq("tecnico_id", tecnicoId);

      const { data: records, error } = await q;
      if (error) throw error;

      // 3) Nomes dos técnicos
      const tecIds = Array.from(new Set((records || []).map((r: any) => r.tecnico_id).filter(Boolean)));
      const nomeByTec = new Map<string, string>();
      if (tecIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", tecIds);
        (profs || []).forEach((p: any) => nomeByTec.set(p.id, p.nome || "Técnico"));
      }

      // 4) Agrupa por técnico + dia
      const groups = new Map<string, RawRecord[]>();
      (records as RawRecord[] || []).forEach((r) => {
        const key = `${r.tecnico_id}__${r.data_atendimento}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      });

      const days: DayDisplacement[] = [];

      for (const [key, recs] of groups.entries()) {
        const [tecId, date] = key.split("__");
        const vehicle = vehicleByTec.get(tecId) || DEFAULT_VEHICLE;

        // Só visitas presenciais geram deslocamento (remoto/ligação/whatsapp não).
        const visitas = recs
          .filter((r) => r.canal === "visita_tecnica")
          .sort((a, b) => {
            const ma = timeToMinutes(a.hora_inicio);
            const mb = timeToMinutes(b.hora_inicio);
            if (ma === null) return 1;
            if (mb === null) return -1;
            return ma - mb;
          });

        if (visitas.length === 0) continue; // dia só com atendimento remoto — sem deslocamento

        // tempo em atendimento (real) das visitas presenciais
        let tempoAtendimentoMin = 0;
        let semGps = 0;
        visitas.forEach((r) => {
          const ini = timeToMinutes(r.hora_inicio);
          const fim = timeToMinutes(r.hora_fim);
          if (ini !== null && fim !== null && fim >= ini) tempoAtendimentoMin += fim - ini;
          if (recordLoc(r) === null) semGps += 1;
        });

        // trechos entre visitas consecutivas, usando o GPS da empresa
        const legs: DisplacementLeg[] = [];
        let km = 0;
        const located = visitas
          .map((r) => ({ rec: r, loc: recordLoc(r) }))
          .filter((x) => x.loc !== null) as { rec: RawRecord; loc: { lat: number; lon: number } }[];
        for (let i = 1; i < located.length; i++) {
          const prev = located[i - 1];
          const cur = located[i];
          const legKm = haversine(prev.loc.lat, prev.loc.lon, cur.loc.lat, cur.loc.lon) * ROAD_FACTOR;
          if (legKm < 0.05) continue; // mesma empresa / mesmo local
          km += legKm;
          legs.push({
            fromName: prev.rec.companies?.nome_fantasia || "Local",
            toName: cur.rec.companies?.nome_fantasia || "Local",
            km: legKm,
          });
        }

        // Casa → 1ª visita e última visita → Casa (se o técnico tem local de partida)
        if (vehicle.base_latitude != null && vehicle.base_longitude != null && located.length > 0) {
          const first = located[0];
          const last = located[located.length - 1];
          const goKm =
            haversine(vehicle.base_latitude, vehicle.base_longitude, first.loc.lat, first.loc.lon) * ROAD_FACTOR;
          if (goKm >= 0.05) {
            km += goKm;
            legs.unshift({ fromName: "🏠 Casa", toName: first.rec.companies?.nome_fantasia || "Local", km: goKm });
          }
          const backKm =
            haversine(last.loc.lat, last.loc.lon, vehicle.base_latitude, vehicle.base_longitude) * ROAD_FACTOR;
          if (backKm >= 0.05) {
            km += backKm;
            legs.push({ fromName: last.rec.companies?.nome_fantasia || "Local", toName: "🏠 Casa", km: backKm });
          }
        }

        const custoCombustivel = (km / vehicle.consumo_km_litro) * vehicle.preco_litro;
        const tempoTransitoMin = (km / vehicle.velocidade_media_kmh) * 60;

        days.push({
          date,
          tecnicoId: tecId,
          tecnicoNome: nomeByTec.get(tecId) || "Técnico",
          atendimentos: visitas.length,
          km,
          custoCombustivel,
          tempoAtendimentoMin,
          tempoTransitoMin,
          legs,
          semGps,
        });
      }

      days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

      // Totais por técnico
      const byTecMap = new Map<string, TecnicoTotals>();
      days.forEach((d) => {
        const t =
          byTecMap.get(d.tecnicoId) ||
          ({
            tecnicoId: d.tecnicoId,
            nome: d.tecnicoNome,
            km: 0,
            custoCombustivel: 0,
            tempoAtendimentoMin: 0,
            tempoTransitoMin: 0,
            atendimentos: 0,
            dias: 0,
          } as TecnicoTotals);
        t.km += d.km;
        t.custoCombustivel += d.custoCombustivel;
        t.tempoAtendimentoMin += d.tempoAtendimentoMin;
        t.tempoTransitoMin += d.tempoTransitoMin;
        t.atendimentos += d.atendimentos;
        t.dias += 1;
        byTecMap.set(d.tecnicoId, t);
      });

      const totals = days.reduce(
        (acc, d) => {
          acc.km += d.km;
          acc.custoCombustivel += d.custoCombustivel;
          acc.tempoAtendimentoMin += d.tempoAtendimentoMin;
          acc.tempoTransitoMin += d.tempoTransitoMin;
          acc.atendimentos += d.atendimentos;
          acc.atendimentosSemGps += d.semGps;
          return acc;
        },
        {
          km: 0,
          custoCombustivel: 0,
          tempoAtendimentoMin: 0,
          tempoTransitoMin: 0,
          atendimentos: 0,
          dias: days.length,
          atendimentosSemGps: 0,
        }
      );

      return {
        days,
        byTecnico: Array.from(byTecMap.values()).sort((a, b) => b.km - a.km),
        totals,
      };
    },
    staleTime: 2 * 60 * 1000,
  });
}
