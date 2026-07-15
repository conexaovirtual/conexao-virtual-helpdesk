import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AssetCard } from './AssetCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AssetListProps {
  onEdit: (asset: any) => void;
  refreshTrigger?: number;
}

interface CompanyGroup {
  id: string;
  name: string;
  assets: any[];
}

export function AssetList({ onEdit, refreshTrigger }: AssetListProps) {
  const { profile } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [originFilter, setOriginFilter] = useState('all');
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAssets();
  }, [profile, refreshTrigger]);

  const loadAssets = async () => {
    if (!profile) return;

    setLoading(true);
    const { data } = await supabase
      .from('assets')
      .select(`
        *,
        company:companies(nome_fantasia)
      `)
      .order('created_at', { ascending: false });

    if (data) setAssets(data);
    setLoading(false);
  };

  const filteredAssets = assets.filter((asset) => {
    const searchLower = search.toLowerCase();
    const matchesSearch = (
      asset.nome?.toLowerCase().includes(searchLower) ||
      asset.tag_patrimonial?.toLowerCase().includes(searchLower) ||
      asset.numero_serie?.toLowerCase().includes(searchLower) ||
      asset.tipo?.toLowerCase().includes(searchLower) ||
      asset.modelo?.toLowerCase().includes(searchLower) ||
      asset.company?.nome_fantasia?.toLowerCase().includes(searchLower)
    );
    const hasDatto = !!(asset.datto_device_uid || asset.datto_device_id);
    const matchesOrigin = originFilter === 'all' || (originFilter === 'datto' && hasDatto) || (originFilter === 'manual' && !hasDatto);
    return matchesSearch && matchesOrigin;
  });

  // Agrupar ativos por empresa
  const assetsByCompany = filteredAssets.reduce((acc, asset) => {
    const companyId = asset.company_id;
    const companyName = asset.company?.nome_fantasia || 'Sem Empresa';
    
    if (!acc[companyId]) {
      acc[companyId] = {
        id: companyId,
        name: companyName,
        assets: [],
      };
    }
    
    acc[companyId].assets.push(asset);
    return acc;
  }, {} as Record<string, CompanyGroup>);

  const companies = (Object.values(assetsByCompany) as CompanyGroup[]).sort((a, b) => 
    a.name.localeCompare(b.name)
  );

  const toggleCompany = (companyId: string) => {
    setExpandedCompanies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(companyId)) {
        newSet.delete(companyId);
      } else {
        newSet.add(companyId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, tag, série, tipo, modelo ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={originFilter} onValueChange={setOriginFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            <SelectItem value="datto">☁️ NexoRMM</SelectItem>
            <SelectItem value="manual">✋ Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {companies.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {search ? 'Nenhum ativo encontrado' : 'Nenhum ativo cadastrado'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {companies.map((company: CompanyGroup) => {
            const isExpanded = expandedCompanies.has(company.id);
            
            return (
              <div key={company.id} className="border rounded-lg overflow-hidden">
                <Button
                  variant="ghost"
                  className="w-full justify-between p-4 h-auto hover:bg-muted"
                  onClick={() => toggleCompany(company.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🏢</span>
                    <div className="text-left">
                      <h3 className="font-semibold">{company.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {company.assets.length} {company.assets.length === 1 ? 'ativo' : 'ativos'}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </Button>

                {isExpanded && (
                  <div className="p-4 bg-muted/30">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {company.assets.map((asset: any) => (
                        <AssetCard key={asset.id} asset={asset} onEdit={onEdit} onDelete={loadAssets} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
