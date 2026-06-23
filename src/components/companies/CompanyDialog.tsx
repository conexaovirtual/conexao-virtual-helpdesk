import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { companySchema, type CompanyFormData } from '@/lib/validations';
import { formatCNPJ, formatPhone } from '@/lib/formatters';
import { useCNPJLookup } from '@/hooks/useCNPJLookup';
import { geocodeByAddress } from '@/lib/geocodeAddress';
import { GeolocationCapture } from '@/components/ui/GeolocationCapture';
import { Search, Loader2, CheckCircle2, AlertCircle, RotateCw, Upload, X, Edit } from 'lucide-react';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface CompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: any;
  onSuccess?: () => void;
}

export function CompanyDialog({ open, onOpenChange, company, onSuccess }: CompanyDialogProps) {
  const { toast } = useToast();
  const { lookupCNPJ, isLoading: isLoadingCNPJ, error, isRateLimitError } = useCNPJLookup();
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [cnpjValidated, setCnpjValidated] = useState(false);
  const [companySituation, setCompanySituation] = useState<'ativa' | 'baixada' | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cnpjEditConfirmed, setCnpjEditConfirmed] = useState(false);
  const [dattoSiteId, setDattoSiteId] = useState<string>('');
  const [companyLatitude, setCompanyLatitude] = useState<number | null>(null);
  const [companyLongitude, setCompanyLongitude] = useState<number | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  
  const form = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      nome_fantasia: '',
      razao_social: '',
      cnpj: '',
      email: '',
      telefone: '',
      whatsapp: '',
      endereco: '',
      status: true,
      sla_primeiro_atendimento_horas: 4,
      sla_solucao_horas: 16,
      tipo_contrato: 'eventual',
    },
  });

  useEffect(() => {
    if (company) {
      form.reset({
        nome_fantasia: company.nome_fantasia || '',
        razao_social: company.razao_social || '',
        cnpj: company.cnpj || '',
        email: company.email || '',
        telefone: company.telefone || '',
        whatsapp: company.whatsapp || '',
        endereco: company.endereco || '',
        status: company.status ?? true,
        sla_primeiro_atendimento_horas: company.sla_primeiro_atendimento_horas || 4,
        sla_solucao_horas: company.sla_solucao_horas || 16,
        tipo_contrato: company.tipo_contrato || 'eventual',
      });
      setLogoUrl(company.logo_url || null);
      setCnpjEditConfirmed(false);
      setDattoSiteId(company.datto_site_id || '');
      setCompanyLatitude(company.latitude ?? null);
      setCompanyLongitude(company.longitude ?? null);
    } else {
      form.reset({
        nome_fantasia: '',
        razao_social: '',
        cnpj: '',
        email: '',
        telefone: '',
        whatsapp: '',
        endereco: '',
        status: true,
        sla_primeiro_atendimento_horas: 4,
        sla_solucao_horas: 16,
        tipo_contrato: 'eventual',
      });
      setCnpjValidated(false);
      setCompanySituation(null);
      setLogoUrl(null);
      setCnpjEditConfirmed(false);
      setDattoSiteId('');
      setCompanyLatitude(null);
      setCompanyLongitude(null);
    }
  }, [company, form]);

  // Limpar timer ao desmontar componente
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleCNPJLookup = async () => {
    const cnpj = form.getValues('cnpj');
    
    if (!cnpj || cnpj.replace(/[^\d]/g, '').length !== 14) {
      toast({
        title: 'CNPJ inválido',
        description: 'Digite um CNPJ válido com 14 dígitos.',
        variant: 'destructive',
      });
      return;
    }

    const data = await lookupCNPJ(cnpj);
    
    if (data) {
      form.setValue('razao_social', data.razao_social);
      form.setValue('nome_fantasia', data.nome_fantasia);
      form.setValue('endereco', data.endereco_completo);
      if (data.telefone) form.setValue('telefone', data.telefone);
      if (data.email) form.setValue('email', data.email);
      
      setCnpjValidated(true);
      setCompanySituation(data.ativa ? 'ativa' : 'baixada');
      
      toast({
        title: '✓ Dados encontrados',
        description: 'Os campos foram preenchidos automaticamente.',
      });
      
      if (!data.ativa) {
        toast({
          title: '⚠ Atenção',
          description: 'Esta empresa está com situação cadastral BAIXADA na Receita Federal.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleCNPJBlur = () => {
    const cnpj = form.getValues('cnpj');
    const nome = form.getValues('nome_fantasia');
    const razao = form.getValues('razao_social');
    
    // Busca automática apenas se CNPJ válido e campos vazios
    if (cnpj && 
        cnpj.replace(/[^\d]/g, '').length === 14 && 
        !nome && 
        !razao && 
        !company) {
      handleCNPJLookup();
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Formato inválido',
        description: 'Por favor, selecione uma imagem.',
        variant: 'destructive',
      });
      return;
    }

    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `company-logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('service-order-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('service-order-photos')
        .getPublicUrl(filePath);

      setLogoUrl(publicUrl);
      
      toast({
        title: 'Logo enviado',
        description: 'O logo foi carregado com sucesso.',
      });
    } catch (error: any) {
      console.error('Erro ao fazer upload do logo:', error);
      toast({
        title: 'Erro ao enviar logo',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    toast({
      title: 'Logo removido',
      description: 'O logo foi removido. Salve para confirmar.',
    });
  };

  const onSubmit = async (data: CompanyFormData) => {
    console.log('[CompanyDialog] onSubmit called with data:', data);
    try {
      // Remover campos vazios opcionais antes de enviar
      const cleanedData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value === '' || value === null || value === undefined) {
          return acc;
        }
        return { ...acc, [key]: value };
      }, {} as any);

      // Adicionar logo_url e datto_site_id ao payload
      if (logoUrl) {
        cleanedData.logo_url = logoUrl;
      } else {
        cleanedData.logo_url = null;
      }
      cleanedData.datto_site_id = dattoSiteId.trim() || null;
      cleanedData.latitude = companyLatitude;
      cleanedData.longitude = companyLongitude;
      if (company) {
        // Se CNPJ foi alterado, verificar duplicidade
        const newCnpj = cleanedData.cnpj?.replace(/[^\d]/g, '');
        const oldCnpj = company.cnpj?.replace(/[^\d]/g, '');
        
        if (newCnpj && newCnpj !== oldCnpj) {
          const { data: existingByCnpj } = await supabase
            .from('companies')
            .select('id, nome_fantasia')
            .eq('cnpj', cleanedData.cnpj)
            .neq('id', company.id)
            .maybeSingle();

          if (existingByCnpj) {
            toast({
              title: 'CNPJ já cadastrado',
              description: `Já existe outra empresa com este CNPJ: ${existingByCnpj.nome_fantasia}`,
              variant: 'destructive',
            });
            return;
          }
        }
        
        const { error } = await supabase
          .from('companies')
          .update(cleanedData)
          .eq('id', company.id);

        if (error) throw error;

        toast({
          title: 'Empresa atualizada',
          description: 'Os dados foram salvos com sucesso.',
        });
      } else {
        // Validação client-side: verificar se empresa já existe
        const cnpjToCheck = data.cnpj?.replace(/[^\d]/g, '');
        
        // Verificar nome fantasia duplicado
        const { data: existingByName } = await supabase
          .from('companies')
          .select('id, cnpj')
          .eq('nome_fantasia', data.nome_fantasia)
          .maybeSingle();

        if (existingByName) {
          toast({
            title: 'Nome fantasia já cadastrado',
            description: `Já existe uma empresa com este nome: ${existingByName.cnpj || 'CNPJ não informado'}`,
            variant: 'destructive',
          });
          return;
        }

        // Verificar CNPJ duplicado apenas se foi preenchido
        if (cnpjToCheck && cnpjToCheck.length === 14) {
          const { data: existingByCnpj } = await supabase
            .from('companies')
            .select('id, nome_fantasia')
            .eq('cnpj', data.cnpj)
            .maybeSingle();

          if (existingByCnpj) {
            toast({
              title: 'CNPJ já cadastrado',
              description: `Já existe uma empresa com este CNPJ: ${existingByCnpj.nome_fantasia}`,
              variant: 'destructive',
            });
            return;
          }
        }

        const { error } = await supabase
          .from('companies')
          .insert([cleanedData]);

        if (error) throw error;

        toast({
          title: 'Empresa criada',
          description: 'A empresa foi cadastrada com sucesso.',
        });
      }

      onOpenChange(false);
      form.reset();
      onSuccess?.();
    } catch (error: any) {
      let errorMessage = error.message;
      
      // Detectar erro de constraint UNIQUE do banco
      if (error.code === '23505') {
        if (error.message.includes('companies_cnpj_unique_idx')) {
          errorMessage = 'Este CNPJ já está cadastrado.';
        } else if (error.message.includes('companies_nome_fantasia_unique')) {
          errorMessage = 'Já existe uma empresa com este nome.';
        }
      }
      
      toast({
        title: 'Erro ao salvar empresa',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {company ? 'Editar Empresa' : 'Nova Empresa'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
            console.log('[CompanyDialog] Form validation errors:', errors);
          })} className="space-y-4">
            {cnpjEditConfirmed && company?.cnpj && (
              <Alert className="bg-yellow-50 border-yellow-200">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  O CNPJ foi desbloqueado para edição. O sistema verificará duplicidades ao salvar.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nome_fantasia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Fantasia *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nome da empresa" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="razao_social"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Razão Social</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Razão social" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cnpj"
                render={({ field }) => {
                  const canEditCNPJ = !company || !company.cnpj || cnpjEditConfirmed;
                  
                  return (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        CNPJ
                        {cnpjValidated && companySituation === 'ativa' && (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        )}
                        {cnpjValidated && companySituation === 'baixada' && (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                      </FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="00.000.000/0000-00"
                            disabled={!!company && !!company.cnpj && !cnpjEditConfirmed}
                            onChange={(e) => {
                              const formatted = formatCNPJ(e.target.value);
                              field.onChange(formatted);
                              setCnpjValidated(false);
                              setCompanySituation(null);
                            }}
                            onBlur={handleCNPJBlur}
                          />
                        </FormControl>
                        {canEditCNPJ && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={handleCNPJLookup}
                              disabled={isLoadingCNPJ || !field.value || field.value.replace(/[^\d]/g, '').length !== 14}
                              title="Buscar dados da empresa"
                            >
                              {isLoadingCNPJ ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Search className="h-4 w-4" />
                              )}
                            </Button>
                            {error && isRateLimitError && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setTimeout(handleCNPJLookup, 2000);
                                }}
                                title="Tentar novamente"
                              >
                                <RotateCw className="h-4 w-4" />
                              </Button>
                            )}
                          </>
                        )}
                        {company && company.cnpj && !cnpjEditConfirmed && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (window.confirm(
                                'Atenção: Alterar o CNPJ pode causar inconsistências no sistema.\n\n' +
                                'Deseja realmente editar o CNPJ desta empresa?'
                              )) {
                                setCnpjEditConfirmed(true);
                              }
                            }}
                            className="text-xs whitespace-nowrap"
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Editar CNPJ
                          </Button>
                        )}
                      </div>
                      {error && (
                        <Alert variant={isRateLimitError ? "default" : "destructive"} className="mt-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>{isRateLimitError ? 'Aguarde um momento' : 'Erro'}</AlertTitle>
                          <AlertDescription>
                            {error}
                            {isRateLimitError && (
                              <p className="mt-2 text-sm">
                                O serviço de consulta está temporariamente indisponível. Você pode preencher os dados manualmente ou tentar novamente em alguns instantes.
                              </p>
                            )}
                          </AlertDescription>
                        </Alert>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="contato@empresa.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="telefone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="(00) 00000-0000"
                        onChange={(e) => {
                          const formatted = formatPhone(e.target.value);
                          field.onChange(formatted);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="whatsapp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="(00) 00000-0000"
                        onChange={(e) => {
                          const formatted = formatPhone(e.target.value);
                          field.onChange(formatted);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="md:col-span-2">
                <FormLabel>Logo da Empresa</FormLabel>
                <div className="mt-2">
                  {logoUrl ? (
                    <div className="relative inline-block">
                      <img 
                        src={logoUrl} 
                        alt="Logo da empresa" 
                        className="h-24 w-auto border rounded-lg"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                        onClick={handleRemoveLogo}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleLogoUpload(file);
                        }}
                        className="hidden"
                        id="logo-upload"
                        disabled={uploadingLogo}
                      />
                      <label 
                        htmlFor="logo-upload"
                        className="cursor-pointer flex flex-col items-center gap-2"
                      >
                        {uploadingLogo ? (
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        ) : (
                          <Upload className="h-8 w-8 text-muted-foreground" />
                        )}
                        <span className="text-sm text-muted-foreground">
                          {uploadingLogo ? 'Enviando...' : 'Clique para enviar o logo'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          PNG, JPG ou WEBP (recomendado: fundo transparente)
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <FormField
                control={form.control}
                name="endereco"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Endereço</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Rua, número, bairro, cidade" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="md:col-span-2">
                <GeolocationCapture
                  label="Localização da Empresa (pelo endereço)"
                  captureLabel="Buscar pelo endereço"
                  recaptureLabel="Atualizar pelo endereço"
                  loadingLabel="Buscando..."
                  position={companyLatitude && companyLongitude ? {
                    latitude: companyLatitude,
                    longitude: companyLongitude,
                    timestamp: Date.now(),
                  } : null}
                  loading={geoLoading}
                  error={geoError}
                  onCapture={async () => {
                    const endereco = form.getValues('endereco');
                    if (!endereco || !endereco.trim()) {
                      setGeoError('Preencha o endereço antes de buscar a localização.');
                      return;
                    }
                    setGeoLoading(true);
                    setGeoError(null);
                    const result = await geocodeByAddress(endereco);
                    setGeoLoading(false);
                    if (result) {
                      setCompanyLatitude(result.latitude);
                      setCompanyLongitude(result.longitude);
                      toast({
                        title: '📍 Localização encontrada',
                        description: result.fonte === 'cep'
                          ? 'Coordenadas obtidas pelo CEP do endereço.'
                          : 'Coordenadas obtidas pelo endereço.',
                      });
                    } else {
                      setGeoError('Não foi possível localizar pelo endereço. Verifique o CEP/endereço.');
                    }
                  }}
                />
              </div>

              <FormField
                control={form.control}
                name="sla_primeiro_atendimento_horas"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SLA Primeiro Atendimento (horas)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        min="1"
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 4)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sla_solucao_horas"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SLA Solução (horas)</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="number" 
                        min="1"
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 16)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tipo_contrato"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Tipo de Contrato</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex flex-col sm:flex-row gap-4"
                      >
                        <div className="flex items-center space-x-2 border rounded-lg p-4 flex-1 cursor-pointer hover:bg-accent/50 transition-colors">
                          <RadioGroupItem value="eventual" id="eventual" />
                          <label htmlFor="eventual" className="flex-1 cursor-pointer">
                            <div className="font-medium">Cliente Eventual</div>
                            <div className="text-sm text-muted-foreground">
                              Atendido apenas sob demanda (quando abre chamado)
                            </div>
                          </label>
                        </div>
                        <div className="flex items-center space-x-2 border rounded-lg p-4 flex-1 cursor-pointer hover:bg-accent/50 transition-colors border-primary/30 bg-primary/5">
                          <RadioGroupItem value="contrato_manutencao" id="contrato_manutencao" />
                          <label htmlFor="contrato_manutencao" className="flex-1 cursor-pointer">
                            <div className="font-medium">Contrato de Manutenção</div>
                            <div className="text-sm text-muted-foreground">
                              Visitas preventivas mensais obrigatórias
                            </div>
                          </label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />


              <div className="md:col-span-2">
                <label className="text-sm font-medium">Datto RMM Site ID</label>
                <Input
                  value={dattoSiteId}
                  onChange={(e) => setDattoSiteId(e.target.value)}
                  placeholder="Ex: 128495 (preenchido automaticamente pela varredura)"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Vincula esta empresa a um Site específico do Datto RMM para sincronização precisa
                </p>
              </div>

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Empresa Ativa</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Salvando...' : (company ? 'Salvar' : 'Criar')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
