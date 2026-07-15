import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Monitor } from 'lucide-react';
import { useGeolocation, GeoPosition } from '@/hooks/useGeolocation';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { GeolocationCapture } from '@/components/ui/GeolocationCapture';
const formSchema = z.object({
  company_id: z.string().min(1, 'Selecione uma empresa'),
  asset_id: z.string().optional(),
  titulo: z.string().min(3, 'Título deve ter pelo menos 3 caracteres'),
  descricao: z.string().min(5, 'Descrição deve ter pelo menos 5 caracteres'),
  hora_inicio: z.string().min(1, 'Informe o horário de início'),
});

type FormData = z.infer<typeof formSchema>;

interface RemoteServiceQuickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RemoteServiceQuickDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: RemoteServiceQuickDialogProps) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gpsInicio, setGpsInicio] = useState<GeoPosition | null>(null);
  const geoInicio = useGeolocation();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      company_id: '',
      asset_id: '',
      titulo: '',
      descricao: '',
      hora_inicio: new Date().toTimeString().slice(0, 5),
    },
  });

  const selectedCompanyId = form.watch('company_id');

  useEffect(() => {
    if (open) {
      loadCompanies();
      setGpsInicio(null);
      form.reset({
        company_id: '',
        asset_id: '',
        titulo: '',
        descricao: '',
        hora_inicio: new Date().toTimeString().slice(0, 5),
      });
    }
  }, [open]);

  useEffect(() => {
    if (selectedCompanyId) {
      loadAssets(selectedCompanyId);
    } else {
      setAssets([]);
    }
  }, [selectedCompanyId]);

  const loadCompanies = async () => {
    const { data } = await supabase
      .from('companies')
      .select('id, nome_fantasia')
      .eq('status', true)
      .order('nome_fantasia');
    if (data) setCompanies(data);
  };

  const loadAssets = async (companyId: string) => {
    const { data } = await supabase
      .from('assets')
      .select('id, nome, tipo')
      .eq('company_id', companyId)
      .order('nome');
    if (data) setAssets(data);
  };

  const onSubmit = async (data: FormData) => {
    if (!user?.id) {
      toast.error('Usuário não autenticado');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        company_id: data.company_id,
        asset_id: data.asset_id || null,
        tecnico_id: user.id,
        titulo: data.titulo,
        descricao: data.descricao,
        canal: 'acesso_remoto' as const,
        status: 'em_andamento',
        data_atendimento: new Date().toLocaleDateString('en-CA'), // data local (BRT), não UTC
        hora_inicio: data.hora_inicio,
        latitude_inicio: gpsInicio?.latitude || null,
        longitude_inicio: gpsInicio?.longitude || null,
      };

      const { error } = await supabase
        .from('daily_service_records')
        .insert(payload);

      if (error) throw error;

      toast.success('Atendimento remoto iniciado!');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Erro ao criar atendimento:', error);
      toast.error('Erro ao iniciar atendimento: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-full bg-purple-100 dark:bg-purple-900/50">
              <Monitor className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            Novo Atendimento Remoto
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="company_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a empresa" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.nome_fantasia}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="asset_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ativo (opcional)</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                    disabled={!selectedCompanyId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={selectedCompanyId ? "Selecione o ativo" : "Selecione uma empresa primeiro"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {assets.map((asset) => (
                        <SelectItem key={asset.id} value={asset.id}>
                          {asset.nome} ({asset.tipo})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ex: Suporte remoto - Problema com email" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição do Problema *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o problema relatado pelo usuário..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hora_inicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Horário de Início *</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <GeolocationCapture
              label="Localização (Início)"
              position={gpsInicio}
              loading={geoInicio.loading}
              error={geoInicio.error}
              onCapture={async () => {
                const pos = await geoInicio.captureLocation();
                if (pos) setGpsInicio(pos);
              }}
              disabled={isSubmitting}
            />

            <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
              <Monitor className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm text-purple-700 dark:text-purple-300">
                Canal: Acesso Remoto (NexoRMM)
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isSubmitting ? 'Iniciando...' : 'Iniciar Atendimento'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
