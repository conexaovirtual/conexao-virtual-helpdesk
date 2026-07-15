import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Download, MoreVertical, Info, Edit, Trash, FileText, FileSpreadsheet, Package } from 'lucide-react';
import { AssetOriginBadge } from '@/components/assets/AssetOriginBadge';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { AssetConfigDialog } from '@/components/assets/AssetConfigDialog';

import { exportInventoryToCSV, exportInventoryToPDF } from '@/lib/exportInventory';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';

export default function Inventory() {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [filters, setFilters] = useState({ company_id: '', tipo: '', search: '', origin: '' });
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [editingAsset, setEditingAsset] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !profile) navigate('/auth');
    if (profile) { loadCompanies(); loadAssets(); }
  }, [profile, loading, navigate, filters]);

  const loadCompanies = async () => {
    const { data } = await supabase.from('companies').select('id, nome_fantasia').eq('status', true).order('nome_fantasia');
    if (data) setCompanies(data);
  };

  const loadAssets = async () => {
    try {
      setLoadingData(true);
      let query = supabase.from('assets').select('*, company:companies(nome_fantasia)').order('created_at', { ascending: false });
      if (filters.company_id) query = query.eq('company_id', filters.company_id);
      if (filters.tipo) query = query.eq('tipo', filters.tipo as any);
      if (filters.search) query = query.or(`modelo.ilike.%${filters.search}%,numero_serie.ilike.%${filters.search}%,tag_patrimonial.ilike.%${filters.search}%`);
      const { data, error } = await query;
      if (error) throw error;
      if (data) setAssets(data);
    } catch { toast.error('Erro ao carregar ativos'); } finally { setLoadingData(false); }
  };

  const filteredByOrigin = assets.filter((asset) => {
    if (!filters.origin || filters.origin === 'all') return true;
    const hasDatto = !!(asset.datto_device_uid || asset.datto_device_id);
    return filters.origin === 'datto' ? hasDatto : !hasDatto;
  });

  const handleDelete = async (assetId: string) => {
    if (!confirm('Deseja realmente excluir este ativo?')) return;
    const { error } = await supabase.from('assets').delete().eq('id', assetId);
    if (error) toast.error('Erro ao excluir ativo'); else { toast.success('Ativo excluído'); loadAssets(); }
  };

  if (loading || !profile) return null;

  return (
    <div className="bg-background min-h-screen">
      <PageHeader
        icon={Package}
        title="Inventário de Ativos"
        subtitle="Visualização completa de todos os ativos"
        actions={
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-white/70 hover:text-white hover:bg-white/10">
                  <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Exportar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { exportInventoryToPDF(assets); toast.success('PDF exportado!'); }}><FileText className="h-4 w-4 mr-2" />PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { exportInventoryToCSV(assets); toast.success('CSV exportado!'); }}><FileSpreadsheet className="h-4 w-4 mr-2" />CSV</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setDialogOpen(true)} size="sm" className="h-8 text-xs gap-1 bg-white/10 hover:bg-white/20 text-white border-0">
              <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Novo Ativo</span>
            </Button>
          </div>
        }
      />

      <main className="container mx-auto px-4 py-4 space-y-4">
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select value={filters.company_id} onValueChange={(v) => setFilters({...filters, company_id: v})}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todas empresas" /></SelectTrigger>
                <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filters.tipo} onValueChange={(v) => setFilters({...filters, tipo: v})}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desktop">Desktop</SelectItem><SelectItem value="notebook">Notebook</SelectItem>
                  <SelectItem value="impressora">Impressora</SelectItem><SelectItem value="servidor">Servidor</SelectItem>
                  <SelectItem value="monitor">Monitor</SelectItem><SelectItem value="roteador">Roteador</SelectItem>
                  <SelectItem value="switch">Switch</SelectItem><SelectItem value="periferico">Periférico</SelectItem>
                  <SelectItem value="camera">Câmera/DVR</SelectItem><SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Buscar modelo, serial..." value={filters.search} onChange={(e) => setFilters({...filters, search: e.target.value})} className="h-9" />
            </div>
            <div className="mt-2">
              <Select value={filters.origin} onValueChange={(v) => setFilters({...filters, origin: v})}>
                <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder="Todas origens" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas origens</SelectItem>
                  <SelectItem value="datto">☁️ NexoRMM</SelectItem>
                  <SelectItem value="manual">✋ Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead><TableHead>Tipo</TableHead><TableHead>Origem</TableHead><TableHead>Fabricante/Modelo</TableHead>
                <TableHead>Serial</TableHead><TableHead>Config</TableHead><TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingData ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filteredByOrigin.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum ativo encontrado</TableCell></TableRow>
              ) : filteredByOrigin.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.company?.nome_fantasia}</TableCell>
                  <TableCell><Badge variant="outline">{asset.tipo}</Badge></TableCell>
                  <TableCell><AssetOriginBadge asset={asset} size="sm" /></TableCell>
                  <TableCell><p className="font-medium">{asset.fabricante}</p><p className="text-sm text-muted-foreground">{asset.modelo}</p></TableCell>
                  <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{asset.numero_serie || '-'}</code></TableCell>
                  <TableCell>{asset.configuracoes && <Button size="sm" variant="ghost" onClick={() => setSelectedAsset(asset)}><Info className="h-4 w-4" /></Button>}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditingAsset(asset); setDialogOpen(true); }}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(asset.id)} className="text-destructive"><Trash className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </main>

      <AssetDialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingAsset(null); }}
        asset={editingAsset} onSuccess={() => { loadAssets(); setDialogOpen(false); setEditingAsset(null); }} />
      <AssetConfigDialog asset={selectedAsset} open={!!selectedAsset} onOpenChange={(open) => !open && setSelectedAsset(null)} />
    </div>
  );
}
