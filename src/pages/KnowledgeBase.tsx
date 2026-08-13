import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, BookOpen, ThumbsUp, Eye, Upload, ExternalLink, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { useToast } from '@/hooks/use-toast';

interface KnowledgeArticle {
  id: string; ticket_id: string | null; titulo: string; problema: string; solucao: string;
  tags: string[]; categoria: string | null; visualizacoes: number; util_count: number; created_at: string;
  bookstack_page_id: number | null; bookstack_synced_at: string | null;
}

const URL_WIKI = 'https://docs.conexaovirtual.cloud';

// A IA grava a solução como array JSON de passos (["passo 1","passo 2"]).
// Sem isto, a tela mostra o JSON cru.
function passosDaSolucao(solucao: string): string[] | null {
  const t = solucao?.trim() ?? '';
  if (!t.startsWith('[')) return null;
  try {
    const v = JSON.parse(t);
    if (Array.isArray(v) && v.length && v.every(x => typeof x === 'string')) return v;
  } catch { /* não era JSON: mostra como texto */ }
  return null;
}

export default function KnowledgeBase() {
  const { profile, loading: authLoading } = useAuth();
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [publicando, setPublicando] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && profile) loadArticles();
  }, [authLoading, profile]);

  const loadArticles = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('knowledge_articles').select('*').order('created_at', { ascending: false });
    // Cast duplo porque os tipos gerados do Supabase (types.ts) ainda não
    // conhecem bookstack_page_id/bookstack_synced_at — regerar quando a árvore
    // estiver limpa resolve.
    if (!error && data) setArticles(data as unknown as KnowledgeArticle[]);
    setLoading(false);
  };

  const filteredArticles = articles.filter(a => {
    const matchesSearch = !search || a.titulo.toLowerCase().includes(search.toLowerCase()) ||
      a.problema.toLowerCase().includes(search.toLowerCase()) || a.solucao.toLowerCase().includes(search.toLowerCase()) ||
      a.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = !selectedCategory || a.categoria === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(articles.map(a => a.categoria).filter(Boolean))];

  // Publica (ou republica) o artigo como página na wiki interna.
  const handlePublicarNaWiki = async (articleId: string) => {
    setPublicando(articleId);
    try {
      const { data, error } = await supabase.functions.invoke('bookstack-sync', {
        body: { article_id: articleId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.resultados?.[0]?.erro ?? data?.erro ?? 'falha ao publicar');

      const pageId = data.resultados?.[0]?.page_id ?? null;
      setArticles(prev => prev.map(a => a.id === articleId
        ? { ...a, bookstack_page_id: pageId, bookstack_synced_at: new Date().toISOString() }
        : a));
      toast({ title: 'Publicado na wiki', description: 'O artigo já está em docs.conexaovirtual.cloud.' });
    } catch (e: any) {
      toast({ title: 'Não deu para publicar', description: String(e.message ?? e), variant: 'destructive' });
    } finally {
      setPublicando(null);
    }
  };

  const handleUseful = async (articleId: string) => {
    await supabase.from('knowledge_articles').update({ util_count: articles.find(a => a.id === articleId)!.util_count + 1 }).eq('id', articleId);
    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, util_count: a.util_count + 1 } : a));
  };

  if (authLoading) return <div className="bg-background"><Skeleton className="h-96 m-4" /></div>;

  return (
    <div className="bg-background min-h-screen">
      <PageHeader
        icon={BookOpen}
        title="Base de Conhecimento"
        subtitle="Artigos gerados automaticamente por IA a partir de chamados resolvidos"
      />

      <main className="container mx-auto px-4 py-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar artigos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant={!selectedCategory ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setSelectedCategory(null)}>Todos</Badge>
            {categories.map(cat => (
              <Badge key={cat} variant={selectedCategory === cat ? 'default' : 'outline'} className="cursor-pointer"
                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}>{cat}</Badge>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}</div>
        ) : filteredArticles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{search ? 'Nenhum artigo encontrado para esta busca.' : 'Nenhum artigo na base de conhecimento ainda.'}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredArticles.map(article => (
              <Card key={article.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{article.titulo}</CardTitle>
                      <CardDescription className="flex items-center gap-3 mt-1">
                        {article.categoria && <Badge variant="secondary">{article.categoria}</Badge>}
                        <span className="flex items-center gap-1 text-xs"><Eye className="h-3 w-3" /> {article.visualizacoes}</span>
                        <span className="flex items-center gap-1 text-xs"><ThumbsUp className="h-3 w-3" /> {article.util_count}</span>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Problema</p>
                    <p className="text-sm">{article.problema}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Solução</p>
                    {(() => {
                      const passos = passosDaSolucao(article.solucao);
                      return passos
                        ? <ol className="text-sm list-decimal pl-5 space-y-1">{passos.map((p, i) => <li key={i}>{p}</li>)}</ol>
                        : <p className="text-sm whitespace-pre-wrap">{article.solucao}</p>;
                    })()}
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex gap-1 flex-wrap">
                      {article.tags?.map(tag => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}
                    </div>
                    <div className="flex items-center gap-1">
                      {article.bookstack_page_id && (
                        <Button variant="ghost" size="sm" asChild className="gap-1">
                          <a href={`${URL_WIKI}/link/${article.bookstack_page_id}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3" /> Ver na wiki
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="gap-1"
                        disabled={publicando === article.id}
                        onClick={() => handlePublicarNaWiki(article.id)}>
                        {publicando === article.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Upload className="h-3 w-3" />}
                        {article.bookstack_page_id ? 'Republicar' : 'Publicar na wiki'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleUseful(article.id)} className="gap-1">
                        <ThumbsUp className="h-3 w-3" /> Útil
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
