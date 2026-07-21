import { Monitor } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface QuickRemoteServiceCardProps {
  atendimentosHoje: number;
  onOpenDialog: () => void;
}

export function QuickRemoteServiceCard({ atendimentosHoje, onOpenDialog }: QuickRemoteServiceCardProps) {
  return (
    <Card className="mb-6 border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/50">
            <Monitor className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-base text-purple-900 dark:text-purple-100">
              Atendimento Remoto NexoRMM
            </CardTitle>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              Suporte via conexão remota
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div className="text-sm text-purple-700 dark:text-purple-300">
          <span className="font-bold text-lg">{atendimentosHoje}</span>{' '}
          {atendimentosHoje === 1 ? 'atendimento remoto' : 'atendimentos remotos'} hoje
        </div>
        <Button 
          onClick={onOpenDialog}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          <Monitor className="h-4 w-4 mr-2" />
          Iniciar Atendimento
        </Button>
      </CardContent>
    </Card>
  );
}
