import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useGeolocation } from '@/hooks/useGeolocation';
import { GeolocationCapture } from '@/components/ui/GeolocationCapture';
import {
  Route,
  MapPin,
  Building2,
  Navigation,
  ArrowDown,
  GripVertical,
  Loader2,
  ExternalLink,
  CalendarDays,
  Fuel,
} from 'lucide-react';

interface CompanyWithLocation {
  id: string;
  nome_fantasia: string;
  endereco: string | null;
  latitude: number;
  longitude: number;
}

// Haversine distance in km
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Nearest-neighbor greedy route optimization
function optimizeRoute(
  start: { latitude: number; longitude: number } | null,
  companies: CompanyWithLocation[]
): CompanyWithLocation[] {
  if (companies.length <= 1) return [...companies];

  const remaining = [...companies];
  const ordered: CompanyWithLocation[] = [];
  let current = start
    ? { lat: start.latitude, lon: start.longitude }
    : { lat: remaining[0].latitude, lon: remaining[0].longitude };

  if (!start) {
    ordered.push(remaining.shift()!);
    current = { lat: ordered[0].latitude, lon: ordered[0].longitude };
  }

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(current.lat, current.lon, remaining[i].latitude, remaining[i].longitude);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    const next = remaining.splice(nearestIdx, 1)[0];
    ordered.push(next);
    current = { lat: next.latitude, lon: next.longitude };
  }

  return ordered;
}

export default function RoutePlanner() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { position, loading: geoLoading, error: geoError, captureLocation } = useGeolocation();

  const canAccess = profile?.roles?.includes('admin_provedor') || profile?.roles?.includes('tecnico');

  const [companies, setCompanies] = useState<CompanyWithLocation[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [optimizedRoute, setOptimizedRoute] = useState<CompanyWithLocation[] | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!profile) navigate('/auth');
      else if (!canAccess) navigate('/dashboard');
    }
  }, [profile, navigate, authLoading, canAccess]);

  useEffect(() => {
    if (profile && canAccess) loadCompanies();
  }, [profile, canAccess]);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    const { data, error } = await supabase
      .from('companies')
      .select('id, nome_fantasia, endereco, latitude, longitude')
      .eq('status', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('nome_fantasia');

    if (error) {
      toast({ title: 'Erro ao carregar empresas', description: error.message, variant: 'destructive' });
    } else {
      setCompanies((data as CompanyWithLocation[]) || []);
    }
    setLoadingCompanies(false);
  };

  const toggleCompany = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    setOptimizedRoute(null);
  };

  const selectedCompanies = useMemo(
    () => companies.filter((c) => selectedIds.has(c.id)),
    [companies, selectedIds]
  );

  const handleOptimize = () => {
    if (selectedCompanies.length < 2) {
      toast({ title: 'Selecione pelo menos 2 empresas', variant: 'destructive' });
      return;
    }
    const route = optimizeRoute(position, selectedCompanies);
    setOptimizedRoute(route);
    toast({ title: 'Rota otimizada!', description: `${route.length} paradas organizadas pelo menor deslocamento.` });
  };

  const totalDistance = useMemo(() => {
    if (!optimizedRoute || optimizedRoute.length < 2) return 0;
    let total = 0;
    let prevLat = position?.latitude ?? optimizedRoute[0].latitude;
    let prevLon = position?.longitude ?? optimizedRoute[0].longitude;
    const startIdx = position ? 0 : 1;
    if (!position) {
      prevLat = optimizedRoute[0].latitude;
      prevLon = optimizedRoute[0].longitude;
    }
    for (let i = startIdx; i < optimizedRoute.length; i++) {
      total += haversine(prevLat, prevLon, optimizedRoute[i].latitude, optimizedRoute[i].longitude);
      prevLat = optimizedRoute[i].latitude;
      prevLon = optimizedRoute[i].longitude;
    }
    return total;
  }, [optimizedRoute, position]);

  // Veículo do técnico logado → custo estimado da rota
  const { data: vehicle } = useQuery({
    queryKey: ['my-vehicle', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('technician_vehicles')
        .select('consumo_km_litro, preco_litro')
        .eq('tecnico_id', profile!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!profile,
  });

  const fuelCost = useMemo(() => {
    if (!vehicle || totalDistance <= 0) return null;
    const consumo = Number(vehicle.consumo_km_litro) || 10;
    const preco = Number(vehicle.preco_litro) || 0;
    return (totalDistance / consumo) * preco;
  }, [vehicle, totalDistance]);

  // Carrega as empresas com OS/visita agendada na data e já seleciona na rota
  const [dayDate, setDayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loadingDay, setLoadingDay] = useState(false);

  const loadDayStops = async () => {
    setLoadingDay(true);
    const [osRes, visitRes] = await Promise.all([
      supabase
        .from('service_orders')
        .select('company_id')
        .gte('data_agendada', `${dayDate}T00:00:00`)
        .lte('data_agendada', `${dayDate}T23:59:59`)
        .in('status', ['agendada', 'confirmada', 'em_execucao']),
      supabase
        .from('visit_schedules')
        .select('company_id')
        .eq('proxima_visita', dayDate)
        .neq('status', 'concluida'),
    ]);
    const ids = new Set<string>();
    (osRes.data || []).forEach((o: any) => o.company_id && ids.add(o.company_id));
    (visitRes.data || []).forEach((v: any) => v.company_id && ids.add(v.company_id));

    const selectable = companies.filter((c) => ids.has(c.id)).map((c) => c.id);
    const semGps = ids.size - selectable.length;
    setSelectedIds(new Set(selectable));
    setOptimizedRoute(null);
    setLoadingDay(false);

    if (ids.size === 0) {
      toast({ title: 'Nada agendado nesse dia', description: 'Sem OS ou visitas para a data.' });
    } else {
      toast({
        title: `${selectable.length} parada(s) do dia carregada(s)`,
        description: semGps > 0 ? `${semGps} sem GPS não incluída(s).` : 'Clique em Otimizar Rota.',
      });
    }
  };

  const openInGoogleMaps = () => {
    if (!optimizedRoute || optimizedRoute.length === 0) return;
    const origin = position
      ? `${position.latitude},${position.longitude}`
      : `${optimizedRoute[0].latitude},${optimizedRoute[0].longitude}`;
    const destination = optimizedRoute[optimizedRoute.length - 1];
    const waypoints = optimizedRoute.slice(position ? 0 : 1, -1);
    const waypointStr = waypoints.map((c) => `${c.latitude},${c.longitude}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination.latitude},${destination.longitude}${waypointStr ? `&waypoints=${waypointStr}` : ''}`;
    window.open(url, '_blank');
  };

  const openInWaze = () => {
    if (!optimizedRoute || optimizedRoute.length === 0) return;
    // Waze only supports single destination, use first stop
    const first = optimizedRoute[0];
    window.open(`https://waze.com/ul?ll=${first.latitude},${first.longitude}&navigate=yes`, '_blank');
  };

  if (authLoading || !profile || !canAccess) return null;

  return (
    <div className="bg-background min-h-screen">
      <PageHeader
        icon={Route}
        title="Planejador de Rotas"
        subtitle="Otimize seus deslocamentos entre clientes"
      />

      <main className="container mx-auto px-4 py-4 space-y-4">
        {/* Localização atual */}
        <GeolocationCapture
          label="Sua localização atual (ponto de partida)"
          position={position}
          loading={geoLoading}
          error={geoError}
          onCapture={captureLocation}
        />

        {/* Carregar a agenda do dia automaticamente */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium flex items-center gap-2 mb-1">
                  <CalendarDays className="h-4 w-4" /> Paradas do dia
                </p>
                <p className="text-xs text-muted-foreground">
                  Carrega as empresas com OS ou visita agendada na data e seleciona na rota.
                </p>
              </div>
              <Input
                type="date"
                value={dayDate}
                onChange={(e) => setDayDate(e.target.value)}
                className="sm:w-44"
              />
              <Button onClick={loadDayStops} disabled={loadingDay} variant="secondary" className="gap-2">
                {loadingDay ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                Carregar
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Lista de empresas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Empresas com localização
                </span>
                <Badge variant="secondary">{selectedIds.size} selecionadas</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCompanies ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : companies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma empresa com localização GPS cadastrada.</p>
                  <p className="text-xs mt-1">Edite as empresas e capture a localização GPS.</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {companies.map((c) => (
                      <div
                        key={c.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedIds.has(c.id)
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/50'
                        }`}
                        onClick={() => toggleCompany(c.id)}
                      >
                        <Checkbox checked={selectedIds.has(c.id)} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{c.nome_fantasia}</p>
                          {c.endereco && (
                            <p className="text-xs text-muted-foreground truncate">{c.endereco}</p>
                          )}
                        </div>
                        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              <div className="mt-4">
                <Button
                  onClick={handleOptimize}
                  disabled={selectedIds.size < 2}
                  className="w-full gap-2"
                >
                  <Navigation className="h-4 w-4" />
                  Otimizar Rota ({selectedIds.size} paradas)
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Rota otimizada */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Navigation className="h-4 w-4" />
                Rota Otimizada
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!optimizedRoute ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Route className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Selecione empresas e clique em "Otimizar Rota"</p>
                  <p className="text-xs mt-1">
                    O sistema calculará o melhor caminho para economizar tempo e combustível
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{optimizedRoute.length} paradas</p>
                      <p className="text-xs text-muted-foreground">
                        Distância total estimada: {totalDistance.toFixed(1)} km
                      </p>
                      {fuelCost !== null ? (
                        <p className="text-xs text-green-600 font-medium flex items-center gap-1 mt-0.5">
                          <Fuel className="h-3 w-3" />
                          Combustível estimado: {fuelCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Configure seu veículo em Deslocamento para ver o custo.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={openInGoogleMaps} className="gap-1.5">
                        <ExternalLink className="h-3 w-3" />
                        Google Maps
                      </Button>
                      <Button size="sm" variant="outline" onClick={openInWaze} className="gap-1.5">
                        <ExternalLink className="h-3 w-3" />
                        Waze
                      </Button>
                    </div>
                  </div>

                  {/* Stops */}
                  <div className="space-y-1">
                    {position && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                          📍
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Sua localização</p>
                          <p className="text-xs text-muted-foreground">Ponto de partida</p>
                        </div>
                      </div>
                    )}

                    {optimizedRoute.map((company, idx) => (
                      <div key={company.id}>
                        {(idx > 0 || position) && (
                          <div className="flex justify-center py-0.5">
                            <ArrowDown className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                          <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/20 text-primary text-xs font-bold">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{company.nome_fantasia}</p>
                            {company.endereco && (
                              <p className="text-xs text-muted-foreground truncate">{company.endereco}</p>
                            )}
                          </div>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${company.latitude},${company.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Navigation className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
