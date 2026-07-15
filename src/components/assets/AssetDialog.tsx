import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Cpu, MemoryStick, HardDrive, Monitor, Link2, Network, History } from 'lucide-react';
import { AssetRelationships } from './AssetRelationships';
import { AssetRelationshipMap } from './AssetRelationshipMap';
import { AssetChangelog } from './AssetChangelog';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Tipos de ativos que requerem configurações de hardware
const TIPOS_COM_HARDWARE = ['desktop', 'notebook', 'servidor'];

interface AssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: any;
  preSelectedCompanyId?: string;
  onSuccess?: (assetId?: string) => void;
}

export function AssetDialog({ open, onOpenChange, asset, preSelectedCompanyId, onSuccess }: AssetDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    company_id: '',
    nome: '',
    tipo: '',
    categoria_id: '',
    fabricante: '',
    modelo: '',
    numero_serie: '',
    local: '',
    sistema_operacional: '',
    observacoes: '',
    datto_device_id: '',
    datto_site_id: '',
  });

  const [configs, setConfigs] = useState<any>({
    processador: '',
    processador_cores: undefined,
    processador_ghz: undefined,
    memoria_ram_gb: undefined,
    memoria_ram_tipo: '',
    memoria_ram_slots: undefined,
    armazenamento_principal_gb: undefined,
    armazenamento_principal_tipo: '',
    armazenamento_secundario_gb: undefined,
    armazenamento_secundario_tipo: '',
    placa_video: '',
    placa_video_memoria_gb: undefined,
    placa_video_integrada: false,
    tela_polegadas: undefined,
    tela_resolucao: '',
    rede_ethernet: false,
    rede_wifi: false,
    rede_wifi_standard: '',
  });

  // Verifica se o tipo de ativo selecionado requer configurações de hardware
  const requiredHardwareTab = TIPOS_COM_HARDWARE.includes(formData.tipo);

  useEffect(() => {
    const fetchCompanies = async () => {
      const { data } = await supabase
        .from('companies')
        .select('id, nome_fantasia')
        .eq('status', true)
        .order('nome_fantasia');
      
      if (data) setCompanies(data);
    };

    const fetchCategories = async () => {
      const { data } = await supabase
        .from('asset_categories')
        .select('id, nome, descricao, cor')
        .order('nome');
      
      if (data) setCategories(data);
    };

    if (open) {
      fetchCompanies();
      fetchCategories();
    }

    if (asset) {
      setFormData({
        company_id: asset.company_id || '',
        nome: asset.nome || '',
        tipo: asset.tipo || '',
        categoria_id: asset.categoria_id || '',
        fabricante: asset.fabricante || '',
        modelo: asset.modelo || '',
        numero_serie: asset.numero_serie || '',
        local: asset.local || '',
        sistema_operacional: asset.sistema_operacional || '',
        observacoes: asset.observacoes || '',
        datto_device_id: asset.datto_device_id || '',
        datto_site_id: asset.datto_site_id || '',
      });
      setConfigs(asset.configuracoes || {});
    } else {
      setFormData({
        company_id: preSelectedCompanyId || profile?.company_id || '',
        nome: '',
        tipo: '',
        categoria_id: '',
        fabricante: '',
        modelo: '',
        numero_serie: '',
        local: '',
        sistema_operacional: '',
        observacoes: '',
        datto_device_id: '',
        datto_site_id: '',
      });
      setConfigs({});
    }
  }, [asset, open, profile, preSelectedCompanyId]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.company_id) {
      toast({
        title: 'Erro',
        description: 'Selecione uma empresa',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.nome || formData.nome.trim() === '') {
      toast({
        title: 'Erro',
        description: 'O nome do ativo é obrigatório',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    const payload: any = {
      ...formData,
      categoria_id: formData.categoria_id || null,
      datto_device_id: formData.datto_device_id || null,
      datto_site_id: formData.datto_site_id || null,
      configuracoes: TIPOS_COM_HARDWARE.includes(formData.tipo) 
        ? configs 
        : (configs.ip_interno || configs.ip_externo || configs.mac_address) 
          ? { ip_interno: configs.ip_interno, ip_externo: configs.ip_externo, mac_address: configs.mac_address }
          : null,
    };

    let newAssetId: string | undefined;

    if (asset) {
      // Detectar campos alterados para o changelog
      const fieldsToTrack: Record<string, string> = {
        nome: 'Nome',
        tipo: 'Tipo',
        company_id: 'Empresa',
        categoria_id: 'Categoria',
        fabricante: 'Fabricante',
        modelo: 'Modelo',
        numero_serie: 'Número de Série',
        local: 'Local',
        sistema_operacional: 'Sistema Operacional',
        observacoes: 'Observações',
        datto_device_id: 'Datto Device ID',
        datto_site_id: 'Datto Site ID',
      };

      const changes: { campo: string; valor_anterior: string | null; valor_novo: string | null }[] = [];
      
      for (const [key, label] of Object.entries(fieldsToTrack)) {
        const oldVal = asset[key] || '';
        const newVal = (payload as any)[key] || '';
        if (String(oldVal) !== String(newVal)) {
          changes.push({
            campo: label,
            valor_anterior: oldVal ? String(oldVal) : null,
            valor_novo: newVal ? String(newVal) : null,
          });
        }
      }

      // Comparar configurações de hardware
      const oldConfigs = asset.configuracoes || {};
      const newConfigs = payload.configuracoes || {};
      const configKeys = new Set([...Object.keys(oldConfigs), ...Object.keys(newConfigs)]);
      for (const key of configKeys) {
        const oldVal = oldConfigs[key];
        const newVal = newConfigs[key];
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          changes.push({
            campo: `Config: ${key}`,
            valor_anterior: oldVal != null ? String(oldVal) : null,
            valor_novo: newVal != null ? String(newVal) : null,
          });
        }
      }

      const { error } = await supabase.from('assets').update(payload).eq('id', asset.id);
      
      if (error) {
        toast({
          title: 'Erro ao atualizar ativo',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        // Registrar alterações no changelog
        if (changes.length > 0 && profile?.id) {
          const changelogEntries = changes.map((c) => ({
            asset_id: asset.id,
            changed_by: profile.id,
            campo: c.campo,
            valor_anterior: c.valor_anterior,
            valor_novo: c.valor_novo,
          }));
          await supabase.from('asset_changelog').insert(changelogEntries);
        }

        toast({
          title: 'Ativo atualizado',
          description: changes.length > 0 ? `${changes.length} campo(s) alterado(s)` : undefined,
        });
        onOpenChange(false);
        onSuccess?.();
      }
    } else {
      const { data, error } = await supabase
        .from('assets')
        .insert(payload)
        .select()
        .single();

      if (error) {
        toast({
          title: 'Erro ao cadastrar ativo',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        newAssetId = data.id;
        toast({
          title: 'Ativo cadastrado',
        });
        onOpenChange(false);
        onSuccess?.(newAssetId);
      }
    }
    
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{asset ? 'Editar Ativo' : 'Novo Ativo'}</DialogTitle>
          <DialogDescription>
            Preencha as informações do equipamento/patrimônio
          </DialogDescription>
        </DialogHeader>
        {!asset?.datto_device_uid && !asset?.datto_device_id && asset && (
          <div className="bg-muted/50 border rounded-md p-3 text-sm text-muted-foreground flex items-center gap-2">
            ✋ <span>Este é um <strong>ativo manual</strong> — não será afetado pela sincronização com o NexoRMM.</span>
          </div>
        )}
        {!asset && (
          <div className="bg-info/10 border border-info/20 rounded-md p-3 text-sm text-muted-foreground flex items-center gap-2">
            ℹ️ <span>Ativos criados manualmente <strong>não serão deletados</strong> durante a sincronização com o NexoRMM.</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className={cn(
              "grid w-full",
              asset ? (requiredHardwareTab ? "grid-cols-5" : "grid-cols-4") : (requiredHardwareTab ? "grid-cols-3" : "grid-cols-2")
            )}>
              <TabsTrigger value="basic">Dados Básicos</TabsTrigger>
              {requiredHardwareTab && <TabsTrigger value="hardware">Hardware</TabsTrigger>}
              
              <TabsTrigger value="datto">
                <Link2 className="h-3 w-3 mr-1" />
                NexoRMM
              </TabsTrigger>
              {asset && <TabsTrigger value="cmdb"><Network className="h-3 w-3 mr-1" />CMDB</TabsTrigger>}
              {asset && <TabsTrigger value="changelog"><History className="h-3 w-3 mr-1" />Histórico</TabsTrigger>}
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="company_id">Empresa *</Label>
                  <Select
                    required
                    value={formData.company_id}
                    onValueChange={(value) => setFormData({ ...formData, company_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.nome_fantasia}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="nome">Nome do Ativo *</Label>
                  <Input
                    required
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Ex: Notebook João - TI, Desktop Recepção, Impressora 2º Andar"
                  />
                  <p className="text-xs text-muted-foreground">
                    Identificação única e descritiva do ativo (será exibida ao selecionar o ativo)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo *</Label>
                  <Select
                    required
                    value={formData.tipo}
                    onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desktop">Desktop 💻</SelectItem>
                      <SelectItem value="notebook">Notebook 💼</SelectItem>
                      <SelectItem value="impressora">Impressora 🖨️</SelectItem>
                      <SelectItem value="monitor">Monitor 🖥️</SelectItem>
                      <SelectItem value="roteador">Roteador 📡</SelectItem>
                      <SelectItem value="switch">Switch 🔌</SelectItem>
                      <SelectItem value="servidor">Servidor 🗄️</SelectItem>
                      <SelectItem value="periferico">Periférico 🎥</SelectItem>
                      <SelectItem value="camera">Câmera/DVR 📹</SelectItem>
                      <SelectItem value="outro">Outro 📦</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {TIPOS_COM_HARDWARE.includes(formData.tipo) 
                      ? '⚙️ Este tipo requer configurações de hardware'
                      : formData.tipo 
                      ? '✓ Este tipo não requer configurações de hardware' 
                      : 'Selecione o tipo de equipamento'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="categoria">Categoria</Label>
                  <Select
                    value={formData.categoria_id}
                    onValueChange={(value) => setFormData({ ...formData, categoria_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Fabricante</Label>
                  <Input
                    value={formData.fabricante}
                    onChange={(e) => setFormData({ ...formData, fabricante: e.target.value })}
                    placeholder="Ex: Dell, HP, Lenovo"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Input
                    value={formData.modelo}
                    onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Número de Série</Label>
                  <Input
                    value={formData.numero_serie}
                    onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Sistema Operacional</Label>
                  <Input
                    value={formData.sistema_operacional}
                    onChange={(e) => setFormData({ ...formData, sistema_operacional: e.target.value })}
                    placeholder="Ex: Windows 11 Pro"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Local</Label>
                  <Input
                    value={formData.local}
                    onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                    placeholder="Ex: Sala 101"
                  />
                </div>
              </div>

              {/* Rede / Identificação de IP */}
              <div className="p-4 border rounded-lg space-y-3 mt-4">
                <h3 className="font-semibold flex items-center gap-2 text-sm">
                  <Network className="h-4 w-4" />
                  Rede
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>IP Interno</Label>
                    <Input
                      value={configs.ip_interno || ''}
                      onChange={(e) => setConfigs({...configs, ip_interno: e.target.value})}
                      placeholder="Ex: 192.168.1.100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>IP Externo</Label>
                    <Input
                      value={configs.ip_externo || ''}
                      onChange={(e) => setConfigs({...configs, ip_externo: e.target.value})}
                      placeholder="Ex: 177.200.35.87"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>MAC Address</Label>
                    <Input
                      value={configs.mac_address || ''}
                      onChange={(e) => setConfigs({...configs, mac_address: e.target.value})}
                      placeholder="Ex: 00:E0:4C:2E:00:63"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <Label>Observações</Label>
                <Textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={3}
                />
              </div>
            </TabsContent>

            {requiredHardwareTab && (
              <TabsContent value="hardware" className="space-y-4">
                {/* Processador */}
                <div className="p-4 border rounded-lg space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    Processador
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Label>Modelo</Label>
                      <Input
                        value={configs.processador}
                        onChange={(e) => setConfigs({...configs, processador: e.target.value})}
                        placeholder="Ex: Intel Core i7-12700K"
                      />
                    </div>
                    <div>
                      <Label>Cores</Label>
                      <Input
                        type="number"
                        value={configs.processador_cores || ''}
                        onChange={(e) => setConfigs({...configs, processador_cores: e.target.value ? parseInt(e.target.value) : undefined})}
                      />
                    </div>
                  </div>
                </div>

                {/* Memória RAM */}
                <div className="p-4 border rounded-lg space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <MemoryStick className="h-4 w-4" />
                    Memória RAM
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Capacidade (GB)</Label>
                      <Input
                        type="number"
                        value={configs.memoria_ram_gb || ''}
                        onChange={(e) => setConfigs({...configs, memoria_ram_gb: e.target.value ? parseInt(e.target.value) : undefined})}
                      />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select
                        value={configs.memoria_ram_tipo}
                        onValueChange={(value) => setConfigs({...configs, memoria_ram_tipo: value})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DDR3">DDR3</SelectItem>
                          <SelectItem value="DDR4">DDR4</SelectItem>
                          <SelectItem value="DDR5">DDR5</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Slots</Label>
                      <Input
                        type="number"
                        value={configs.memoria_ram_slots || ''}
                        onChange={(e) => setConfigs({...configs, memoria_ram_slots: e.target.value ? parseInt(e.target.value) : undefined})}
                      />
                    </div>
                  </div>
                </div>

                {/* Armazenamento */}
                <div className="p-4 border rounded-lg space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    Armazenamento
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Capacidade (GB)</Label>
                      <Input
                        type="number"
                        value={configs.armazenamento_principal_gb || ''}
                        onChange={(e) => setConfigs({...configs, armazenamento_principal_gb: e.target.value ? parseInt(e.target.value) : undefined})}
                      />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select
                        value={configs.armazenamento_principal_tipo}
                        onValueChange={(value) => setConfigs({...configs, armazenamento_principal_tipo: value})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HDD">HDD</SelectItem>
                          <SelectItem value="SSD">SSD</SelectItem>
                          <SelectItem value="NVMe">NVMe</SelectItem>
                          <SelectItem value="M.2">M.2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Placa de Vídeo */}
                <div className="p-4 border rounded-lg space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    Placa de Vídeo
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Modelo</Label>
                      <Input
                        value={configs.placa_video}
                        onChange={(e) => setConfigs({...configs, placa_video: e.target.value})}
                        placeholder="Ex: NVIDIA RTX 4070"
                      />
                    </div>
                    <div>
                      <Label>VRAM (GB)</Label>
                      <Input
                        type="number"
                        value={configs.placa_video_memoria_gb || ''}
                        onChange={(e) => setConfigs({...configs, placa_video_memoria_gb: e.target.value ? parseInt(e.target.value) : undefined})}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={configs.placa_video_integrada}
                      onCheckedChange={(checked) => setConfigs({...configs, placa_video_integrada: checked as boolean})}
                    />
                    <Label>Placa integrada</Label>
                  </div>
                </div>
              </TabsContent>
            )}


            <TabsContent value="datto" className="space-y-4">
              <div className="p-4 border rounded-lg space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Integração NexoRMM
                </h3>
                <p className="text-sm text-muted-foreground">
                  Vincule este ativo a um dispositivo monitorado pelo NexoRMM para receber alertas automáticos.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Device ID</Label>
                    <Input
                      value={formData.datto_device_id}
                      onChange={(e) => setFormData({ ...formData, datto_device_id: e.target.value })}
                      placeholder="ID do dispositivo no NexoRMM"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Site ID</Label>
                    <Input
                      value={formData.datto_site_id}
                      onChange={(e) => setFormData({ ...formData, datto_site_id: e.target.value })}
                      placeholder="ID do site/cliente no NexoRMM"
                    />
                  </div>
                </div>
                {asset?.datto_status && (
                  <div className="flex items-center gap-3 pt-2">
                    <Badge variant={
                      asset.datto_status === 'online' ? 'default' :
                      asset.datto_status === 'alert' ? 'destructive' : 'secondary'
                    }>
                      {asset.datto_status === 'online' ? '🟢 Online' :
                       asset.datto_status === 'alert' ? '🔴 Alerta' : '⚫ Offline'}
                    </Badge>
                    {asset.datto_last_sync && (
                      <span className="text-xs text-muted-foreground">
                        Última sync: {formatDistanceToNow(new Date(asset.datto_last_sync), { addSuffix: true, locale: ptBR })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {asset && (
              <TabsContent value="cmdb" className="space-y-4">
                <AssetRelationshipMap assetId={asset.id} assetName={asset.nome} assetType={asset.tipo} />
                <AssetRelationships assetId={asset.id} companyId={asset.company_id} />
              </TabsContent>
            )}

            {asset && (
              <TabsContent value="changelog">
                <AssetChangelog assetId={asset.id} />
              </TabsContent>
            )}
          </Tabs>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
