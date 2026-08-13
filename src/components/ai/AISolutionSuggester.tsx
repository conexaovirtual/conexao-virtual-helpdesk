import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Loader2, Check, Copy, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AISolutionSuggesterProps {
  ticketId?: string;
  dailyRecordId?: string;
  onApply: (text: string) => void;
}

export function AISolutionSuggester({ ticketId, dailyRecordId, onApply }: AISolutionSuggesterProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  // Páginas da wiki interna que embasaram a sugestão — mostrar de onde veio
  // deixa o técnico conferir o procedimento completo em vez de confiar cego.
  const [paginasWiki, setPaginasWiki] = useState<Array<{ titulo: string; url: string }>>([]);
  const [applied, setApplied] = useState(false);
  const { toast } = useToast();

  const handleSuggest = async () => {
    setLoading(true);
    setSuggestion(null);
    setPaginasWiki([]);
    setApplied(false);

    try {
      const { data, error } = await supabase.functions.invoke('ai-solution-suggester', {
        body: { ticket_id: ticketId, daily_record_id: dailyRecordId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSuggestion(data.suggestion);
      // Deduplica por URL: a busca semântica pode trazer a mesma página em mais
      // de um resultado, e repetir a fonte na lista só confunde.
      const vistos = new Set<string>();
      setPaginasWiki(
        (data.wiki ?? []).filter((p: { url: string }) => !vistos.has(p.url) && vistos.add(p.url)),
      );
    } catch (err: any) {
      toast({
        title: 'Erro ao gerar sugestão',
        description: err.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (suggestion) {
      onApply(suggestion);
      setApplied(true);
      toast({ title: 'Sugestão aplicada ao campo de solução' });
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleSuggest}
        disabled={loading}
        className="gap-2"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 text-amber-500" />
        )}
        {loading ? 'Gerando sugestão...' : 'Sugerir Solução com IA'}
      </Button>

      {suggestion && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="p-3 space-y-2">
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" />
              Sugestão da IA
            </p>
            <p className="text-sm whitespace-pre-wrap">{suggestion}</p>

            {paginasWiki.length > 0 && (
              <div className="pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 mt-2 mb-1">
                  <BookOpen className="h-3 w-3" />
                  Documentação da wiki usada
                </p>
                <ul className="space-y-0.5">
                  {paginasWiki.map(p => (
                    <li key={p.url}>
                      <a href={p.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline">
                        {p.titulo}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={applied ? 'secondary' : 'default'}
                onClick={handleApply}
                disabled={applied}
                className="gap-1"
              >
                {applied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {applied ? 'Aplicado' : 'Usar esta sugestão'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
