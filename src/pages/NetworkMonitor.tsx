import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Wifi, WifiOff, AlertTriangle, CheckCircle2, Search, ChevronDown, Monitor, Server, Printer, HardDrive, RefreshCw, Cable } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MonitoredAsset {
  id: string;
  nome: string;
  tipo: string;
  datto_status: string | null;
  datto_last_sync: string | null;
  datto_device_id: string | null;
  company_id: string;
  companies: { id: string; nome_fantasia: string } | null;
}

interface CompanyGroup {
  companyId: string;
  companyName: string;
  devices: MonitoredAsset[];
  online: number;
  alert: number;
  offline: number;
  lastSync: string | null;
}

const deviceIcon = (tipo: string) => {
  switch (tipo) {
    case 'servidor': return Server;
    case 'roteador': return Cable;
    case 'impressora': return Printer;
    case 'switch': return HardDrive;
    default: return Monitor;
  }
};

const statusConfig = (status: string | null) => {
  switch (status) {
    case 'alert': return { color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Alerta', icon: AlertTriangle };
    case 'offline': return { color: 'text-destructive', bg: 'bg-destructive/10', label: 'Offline', icon: WifiOff };
    default: return { color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Online', icon: CheckCircle2 };
  }
};

const companyStatus = (group: CompanyGroup): 'online' | 'alert' | 'offline' => {
  if (group.offline > 0) return 'offline';
  if (group.alert > 0) return 'alert';
  return 'online';
};

const companyBorderColor = (status: 'online' | 'alert' | 'offline') => {
  switch (status) {
    case 'offline': return 'border-destructive/50';
    case 'alert': return 'border-amber-500/50';
    default: return 'border-emerald-500/30';
  }
};

export default function NetworkMonitor() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const { data: assets = [], isLoading, error: queryError, refetch } = useQuery({
    queryKey: ['network-monitor-assets'],
    queryFn: async () => {
      console.log('[NetworkMonitor] Fetching assets...');
      const { data, error } = await supabase
        .from('assets')
        .select('id, nome, tipo, datto_status, datto_last_sync, datto_device_id, company_id, companies(id, nome_fantasia)')
        .not('datto_device_id', 'is', null);
      if (error) {
        console.error('[NetworkMonitor] Query error:', error);
        throw error;
      }
      console.log('[NetworkMonitor] Fetched', data?.length, 'assets');
      return (data || []) as unknown as MonitoredAsset[];
    },
    refetchInterval: 60000,
  });

  const groups = useMemo(() => {
    const map = new Map<string, CompanyGroup>();
    assets.forEach((asset) => {
      const cid = asset.company_id;
      if (!map.has(cid)) {
        map.set(cid, {
          companyId: cid,
          companyName: asset.companies?.nome_fantasia || 'Sem empresa',
          devices: [],
          online: 0,
          alert: 0,
          offline: 0,
          lastSync: null,
        });
      }
      const g = map.get(cid)!;
      g.devices.push(asset);
      const s = asset.datto_status || 'online';
      if (s === 'offline') g.offline++;
      else if (s === 'alert') g.alert++;
      else g.online++;
      if (asset.datto_last_sync && (!g.lastSync || asset.datto_last_sync > g.lastSync)) {
        g.lastSync = asset.datto_last_sync;
      }
    });
    return Array.from(map.values());
  }, [assets]);

  const totals = useMemo(() => {
    return groups.reduce((acc, g) => ({
      online: acc.online + g.online,
      alert: acc.alert + g.alert,
      offline: acc.offline + g.offline,
    }), { online: 0, alert: 0, offline: 0 });
  }, [groups]);

  const filtered = useMemo(() => {
    let result = groups;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((g) => g.companyName.toLowerCase().includes(q));
    }
    if (filter === 'offline') result = result.filter((g) => g.offline > 0);
    else if (filter === 'alert') result = result.filter((g) => g.alert > 0);
    else if (filter === 'issues') result = result.filter((g) => g.offline > 0 || g.alert > 0);

    return result.sort((a, b) => {
      const sa = companyStatus(a);
      const sb = companyStatus(b);
      const order = { offline: 0, alert: 1, online: 2 };
      return order[sa] - order[sb];
    });
  }, [groups, search, filter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitor de Conectividade"
        icon={Wifi}
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 cursor-pointer" onClick={() => refetch()} />
            Atualização a cada 60s
          </div>
        }
        metrics={[
          { icon: CheckCircle2, label: 'Online', value: totals.online, color: 'bg-emerald-600' },
          { icon: AlertTriangle, label: 'Alertas', value: totals.alert, color: 'bg-amber-500' },
          { icon: WifiOff, label: 'Offline', value: totals.offline, color: 'bg-red-600' },
        ]}
      />

      <div className="flex flex-col sm:flex-row gap-3 px-1">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filtrar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            <SelectItem value="issues">Com problemas</SelectItem>
            <SelectItem value="offline">Apenas offline</SelectItem>
            <SelectItem value="alert">Apenas alertas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {queryError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-destructive">
            <AlertTriangle className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-lg font-medium">Erro ao carregar dispositivos</p>
            <p className="text-sm text-muted-foreground">{(queryError as Error).message}</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Wifi className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">Nenhum dispositivo monitorado encontrado</p>
            <p className="text-sm">Dispositivos com agente NexoRMM aparecerão aqui automaticamente.</p>
            <p className="text-xs mt-2">Total de assets no filtro: {assets.length}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((group) => {
            const status = companyStatus(group);
            const total = group.devices.length;
            return (
              <Collapsible key={group.companyId}>
                <Card className={`transition-colors ${companyBorderColor(status)}`}>
                  <CollapsibleTrigger className="w-full text-left">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold truncate pr-2">
                          {group.companyName}
                        </CardTitle>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {status === 'online' && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {total}/{total} Online
                          </Badge>
                        )}
                        {status === 'alert' && (
                          <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {group.alert} alerta(s)
                          </Badge>
                        )}
                        {status === 'offline' && (
                          <Badge variant="destructive" className="text-xs">
                            <WifiOff className="h-3 w-3 mr-1" />
                            {group.offline}/{total} Offline
                          </Badge>
                        )}
                        {status !== 'online' && group.online > 0 && (
                          <Badge variant="outline" className="text-xs text-emerald-600">
                            {group.online} online
                          </Badge>
                        )}
                      </div>
                      {group.lastSync && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Último sync: {formatDistanceToNow(new Date(group.lastSync), { addSuffix: true, locale: ptBR })}
                        </p>
                      )}
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-3">
                      <div className="space-y-1.5 mt-2 border-t pt-2">
                        {group.devices.map((device) => {
                          const cfg = statusConfig(device.datto_status);
                          const DeviceIcon = deviceIcon(device.tipo);
                          const StatusIcon = cfg.icon;
                          return (
                            <div key={device.id} className={`flex items-center gap-2 px-2 py-1.5 rounded ${cfg.bg}`}>
                              <DeviceIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm truncate flex-1">{device.nome}</span>
                              <StatusIcon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                              <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
