import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CompanyRow } from './CompanyRow';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

interface CompanyListProps {
  onEdit: (company: any) => void;
  refreshTrigger?: number;
  canDelete?: boolean;
}

const ITEMS_PER_PAGE = 30;

export function CompanyList({ onEdit, refreshTrigger, canDelete }: CompanyListProps) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { toast } = useToast();

  // Espera parar de digitar antes de consultar o banco
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Busca nova sempre volta pra página 1
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const loadCompanies = async () => {
    setLoading(true);
    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    let query = supabase.from('companies').select('*', { count: 'exact' });

    if (debouncedSearch) {
      const term = debouncedSearch.replace(/[%,]/g, '');
      query = query.or(
        `nome_fantasia.ilike.%${term}%,razao_social.ilike.%${term}%,cnpj.ilike.%${term}%`
      );
    }

    const { data, error, count } = await query.range(from, to).order('nome_fantasia');

    if (error) {
      toast({
        title: 'Erro ao carregar empresas',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setCompanies(data || []);
      if (count !== null) setTotalCount(count);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCompanies();
  }, [refreshTrigger, page, debouncedSearch]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar empresa por nome ou CNPJ..."
          className="pl-8 pr-8 h-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{debouncedSearch ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa cadastrada'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {debouncedSearch
                ? 'Tente buscar por outro nome ou CNPJ.'
                : 'Clique em "Nova Empresa" para começar.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card">
          {companies.map((company) => (
            <CompanyRow
              key={company.id}
              company={company}
              onEdit={onEdit}
              onUpdate={loadCompanies}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} ({totalCount} empresas)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p - 1)}
              disabled={!hasPrevPage}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={!hasNextPage}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
