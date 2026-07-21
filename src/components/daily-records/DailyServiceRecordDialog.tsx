import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation, GeoPosition } from "@/hooks/useGeolocation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { VoiceInputButton } from "@/components/ui/VoiceInputButton";
import { AISummaryCard } from "@/components/ai/AISummaryCard";
import { AISolutionSuggester } from "@/components/ai/AISolutionSuggester";
import { AIExecutionReport } from "@/components/ai/AIExecutionReport";
import { GeolocationCapture } from "@/components/ui/GeolocationCapture";
import { UploadedImage } from "@/lib/imageUtils";
import { toast } from "sonner";
import { Loader2, MessageCircle, Phone, MapPin, FileDown, Monitor, Plus, Receipt } from "lucide-react";
import { QuickAssetDialog } from "@/components/assets/QuickAssetDialog";
import { format } from "date-fns";
import { exportSingleDailyServiceToPDF } from "@/lib/exportSingleDailyService";
import { OrcamentoDialog } from "@/components/orcamentos/OrcamentoDialog";

const canalEnum = z.union([
  z.literal("whatsapp"),
  z.literal("ligacao"),
  z.literal("visita_tecnica"),
  z.literal("acesso_remoto"),
]);

const statusEnum = z.union([
  z.literal("em_andamento"),
  z.literal("concluido"),
  z.literal("pendente"),
]);

const formSchema = z.object({
  company_id: z.string().min(1, "Selecione uma empresa"),
  asset_id: z.string().optional().default(""),
  data_atendimento: z.string().min(1, "Data é obrigatória"),
  hora_inicio: z.string().min(1, "Horário de início é obrigatório"),
  hora_fim: z.string().optional(),
  canal: canalEnum,
  titulo: z.string().min(5, "Título deve ter no mínimo 5 caracteres"),
  descricao: z.string().min(1, "Descrição é obrigatória"),
  solucao: z.string().optional(),
  status: statusEnum,
  observacoes: z.string().optional(),
}).refine(
  (data) => {
    if (data.hora_fim && data.hora_inicio) {
      return data.hora_fim > data.hora_inicio;
    }
    return true;
  },
  {
    message: "Horário de fim deve ser maior que o horário de início",
    path: ["hora_fim"],
  }
);

type FormData = z.infer<typeof formSchema>;

interface DailyServiceRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  recordId?: string;
  defaultCompanyId?: string;
}

export function DailyServiceRecordDialog({
  open,
  onOpenChange,
  onSuccess,
  recordId,
  defaultCompanyId,
}: DailyServiceRecordDialogProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [quickAssetOpen, setQuickAssetOpen] = useState(false);
  const [isOrcamentoOpen, setIsOrcamentoOpen] = useState(false);
  const [recordData, setRecordData] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [pendingAssetId, setPendingAssetId] = useState<string | null>(null);
  // Status com que o registro foi carregado, para só notificar quando ele mudar.
  const [originalStatus, setOriginalStatus] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [enderecoCliente, setEnderecoCliente] = useState("");
  const [gpsLocal, setGpsLocal] = useState<GeoPosition | null>(null);
  const geoLocal = useGeolocation();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      company_id: "",
      asset_id: "",
      data_atendimento: new Date().toLocaleDateString('en-CA'), // Formato ISO usando timezone local
      hora_inicio: "",
      hora_fim: "",
      canal: "whatsapp",
      titulo: "",
      descricao: "",
      solucao: "",
      status: "em_andamento",
      observacoes: "",
    },
  });

  // When assets finish loading, apply the pending asset_id
  useEffect(() => {
    if (pendingAssetId && assets.length > 0) {
      const found = assets.find(a => a.id === pendingAssetId);
      if (found) {
        form.setValue("asset_id", pendingAssetId);
      }
      setPendingAssetId(null);
    }
  }, [assets, pendingAssetId]);

  useEffect(() => {
    if (open) {
      loadCompanies();
      if (recordId) {
        loadRecord();
      } else {
        setGpsLocal(null);
        setEnderecoCliente("");
        // Pré-seleciona a empresa quando aberto a partir do Meu Dia
        if (defaultCompanyId) {
          form.setValue("company_id", defaultCompanyId);
          loadAssets(defaultCompanyId);
        }
      }
      // Auto-capturar localização ao abrir o dialog
      if (!recordId) {
        geoLocal.captureLocation().then((pos) => {
          if (pos) setGpsLocal(pos);
        });
      }
    }
  }, [open, recordId, defaultCompanyId]);

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, nome_fantasia")
        .eq("status", true)
        .order("nome_fantasia");

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error("Error loading companies:", error);
    }
  };

  const loadAssets = async (companyId: string) => {
    if (!companyId) {
      setAssets([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("assets")
        .select("id, nome, tipo, tag_patrimonial")
        .eq("company_id", companyId)
        .order("nome");

      if (error) throw error;
      setAssets(data || []);
    } catch (error) {
      console.error("Error loading assets:", error);
      setAssets([]);
    }
  };

  const loadRecord = async () => {
    if (!recordId) return;

    try {
      const { data, error } = await supabase
        .from("daily_service_records")
        .select("*, companies:company_id(id, nome_fantasia, cnpj, whatsapp, telefone, bomcontrole_cliente_id)")
        .eq("id", recordId)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        toast.error("Registro não encontrado ou sem permissão de acesso");
        onOpenChange(false);
        return;
      }

      if (data) {
        setRecordData(data);

        // Store the asset_id to apply after assets load
        const recordAssetId = data.asset_id || "";
        
        // Start loading assets for this company
        loadAssets(data.company_id);
        
        // Reset form WITHOUT asset_id (will be set via pendingAssetId)
        form.reset({
          company_id: data.company_id,
          asset_id: "",
          data_atendimento: data.data_atendimento,
          hora_inicio: data.hora_inicio,
          hora_fim: data.hora_fim || "",
          canal: data.canal as "whatsapp" | "ligacao" | "visita_tecnica" | "acesso_remoto",
          titulo: data.titulo,
          descricao: data.descricao,
          solucao: data.solucao || "",
          status: data.status as "em_andamento" | "concluido" | "pendente",
          observacoes: data.observacoes || "",
        });
        // Guarda o status original para só notificar o cliente se ele mudar.
        setOriginalStatus(data.status);
        
        // Queue asset_id to be set once assets are loaded
        if (recordAssetId) {
          setPendingAssetId(recordAssetId);
        }
        
        // Carregar endereço do cliente
        setEnderecoCliente((data as any).endereco_cliente || "");
        
        // Restaurar GPS salvo
        if ((data as any).latitude_inicio && (data as any).longitude_inicio) {
          setGpsLocal({
            latitude: (data as any).latitude_inicio,
            longitude: (data as any).longitude_inicio,
            timestamp: Date.now(),
          });
        }
        
        // Carregar fotos existentes
        if (data.fotos && Array.isArray(data.fotos)) {
          setUploadedImages(data.fotos as unknown as UploadedImage[]);
        }
      }
    } catch (error) {
      console.error("Error loading record:", error);
      toast.error("Erro ao carregar registro");
    }
  };

  const notifyClientAboutDailyRecord = async (dailyRecordId: string, status: string, solucao?: string) => {
    try {
      await supabase.functions.invoke('notify-daily-record-status', {
        body: { daily_record_id: dailyRecordId, new_status: status, observacao: solucao },
      });
    } catch (err) {
      console.error('WhatsApp notification error:', err);
    }
  };

  const onSubmit = async (data: FormData) => {
    if (!profile) return;

    try {
      setLoading(true);

      // Verificar se a sessão ainda está ativa antes de salvar
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error("Sessão expirada. Faça login novamente.");
        setLoading(false);
        return;
      }

      const payload: any = {
        company_id: data.company_id,
        asset_id: data.asset_id || null,
        data_atendimento: data.data_atendimento,
        hora_inicio: data.hora_inicio,
        canal: data.canal,
        titulo: data.titulo,
        descricao: data.descricao,
        status: data.status,
        tecnico_id: profile.id,
        hora_fim: data.hora_fim || null,
        solucao: data.solucao || null,
        observacoes: data.observacoes || null,
        fotos: uploadedImages,
        endereco_cliente: enderecoCliente || null,
        latitude_inicio: gpsLocal?.latitude || null,
        longitude_inicio: gpsLocal?.longitude || null,
        latitude_fim: null,
        longitude_fim: null,
      };

      if (recordId) {
        const { error } = await supabase
          .from("daily_service_records")
          .update(payload)
          .eq("id", recordId);

        if (error) throw error;
        toast.success("Atendimento atualizado com sucesso!");

        // Notificar cliente via WhatsApp APENAS quando o status mudou de fato.
        // (Salvar edições sem trocar o status não dispara mais mensagem.)
        if (data.status !== originalStatus) {
          notifyClientAboutDailyRecord(recordId, data.status, data.solucao);
          setOriginalStatus(data.status);
        }
        
        // Gerar artigo de conhecimento ao concluir com solução
        if (data.status === 'concluido' && data.solucao?.trim()) {
          supabase.functions.invoke('ai-knowledge-generator', {
            body: { daily_record_id: recordId },
          }).catch(err => console.error('Knowledge generation error:', err));
        }
      } else {
        const { data: inserted, error } = await supabase
          .from("daily_service_records")
          .insert([payload])
          .select('id, ticket_id')
          .single();

        if (error) throw error;
        toast.success("Atendimento registrado com sucesso!");
        
        // Notificar cliente sobre novo atendimento
        if (inserted) {
          notifyClientAboutDailyRecord(inserted.id, data.status);
        }
      }

      onOpenChange(false);
      form.reset();
      setUploadedImages([]);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error saving record:", error);
      toast.error(error.message || "Erro ao salvar atendimento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {recordId ? "Editar Atendimento" : "Novo Atendimento Diário"}
          </DialogTitle>
          <DialogDescription>
            Registre os detalhes do atendimento realizado
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="company_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa *</FormLabel>
                  <Select 
                    onValueChange={async (value) => {
                      field.onChange(value);
                      loadAssets(value);
                      form.setValue("asset_id", "");
                      // Carregar endereço do cliente
                      const { data: company } = await supabase
                        .from("companies")
                        .select("endereco")
                        .eq("id", value)
                        .single();
                      setEnderecoCliente(company?.endereco || "");
                    }} 
                    value={field.value}
                  >
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
                  <div className="flex items-center justify-between">
                    <FormLabel>Ativo/Equipamento</FormLabel>
                    {form.watch("company_id") && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1 text-primary"
                        onClick={() => setQuickAssetOpen(true)}
                      >
                        <Plus className="h-3 w-3" />
                        Novo Ativo
                      </Button>
                    )}
                  </div>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                    disabled={!form.watch("company_id")}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={
                          !form.watch("company_id")
                            ? "Selecione uma empresa primeiro"
                            : assets.length === 0
                              ? "Nenhum ativo disponível"
                              : "Selecione o ativo"
                        } />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {assets.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground text-center">
                          Nenhum ativo disponível para esta empresa
                        </div>
                      ) : (
                        assets.map((asset) => (
                          <SelectItem key={asset.id} value={asset.id}>
                            {asset.nome} - {asset.tipo}
                            {asset.tag_patrimonial && ` (${asset.tag_patrimonial})`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <QuickAssetDialog
              open={quickAssetOpen}
              onOpenChange={setQuickAssetOpen}
              companyId={form.watch("company_id")}
              onSuccess={(assetId) => {
                loadAssets(form.watch("company_id"));
                setPendingAssetId(assetId);
              }}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="data_atendimento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data do Atendimento *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} max={new Date().toLocaleDateString('en-CA')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="em_andamento">Em Andamento</SelectItem>
                        <SelectItem value="concluido">Concluído</SelectItem>
                        <SelectItem value="pendente">Pendente</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <FormField
                control={form.control}
                name="hora_fim"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Horário de Fim</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="canal"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Canal de Atendimento *</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="whatsapp" />
                        </FormControl>
                        <FormLabel className="font-normal flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-green-600" />
                          WhatsApp
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="ligacao" />
                        </FormControl>
                        <FormLabel className="font-normal flex items-center gap-2">
                          <Phone className="h-4 w-4 text-blue-600" />
                          Ligação
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="visita_tecnica" />
                        </FormControl>
                        <FormLabel className="font-normal flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-orange-600" />
                          Visita Técnica
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="acesso_remoto" />
                        </FormControl>
                        <FormLabel className="font-normal flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-purple-600" />
                          Acesso Remoto (NexoRMM)
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Título *</FormLabel>
                    <VoiceInputButton
                      onFinalResult={(transcript) => {
                        const currentValue = form.getValues("titulo") || "";
                        form.setValue("titulo", currentValue ? `${currentValue} ${transcript}` : transcript);
                      }}
                      size="sm"
                    />
                  </div>
                  <FormControl>
                    <Input placeholder="Ex: Suporte instalação impressora" {...field} />
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
                  <div className="flex items-center justify-between">
                    <FormLabel>Descrição do Atendimento *</FormLabel>
                    <VoiceInputButton
                      onFinalResult={(transcript) => {
                        const currentValue = form.getValues("descricao") || "";
                        form.setValue("descricao", currentValue ? `${currentValue} ${transcript}` : transcript);
                      }}
                      size="sm"
                    />
                  </div>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o atendimento realizado..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Mínimo de 20 caracteres ({field.value?.length || 0}/20)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="solucao"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Solução Aplicada</FormLabel>
                    <div className="flex items-center gap-1">
                      {recordId && (
                        <AISolutionSuggester
                          dailyRecordId={recordId}
                          onApply={(text) => form.setValue("solucao", text)}
                        />
                      )}
                      <AIExecutionReport
                        titulo={form.watch("titulo")}
                        descricao={form.watch("descricao") || ""}
                        observacoes={form.watch("observacoes")}
                        onApply={(text) => form.setValue("solucao", text)}
                      />
                      <VoiceInputButton
                        onFinalResult={(transcript) => {
                          const currentValue = form.getValues("solucao") || "";
                          form.setValue("solucao", currentValue ? `${currentValue} ${transcript}` : transcript);
                        }}
                        size="sm"
                      />
                    </div>
                  </div>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva a solução aplicada..."
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Localização */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Localização do Atendimento
              </h4>
              
              {enderecoCliente && (
                <div className="text-sm p-2 rounded-md bg-muted">
                  <span className="font-medium">Endereço do cliente:</span> {enderecoCliente}
                </div>
              )}

              <GeolocationCapture
                label="Local do Atendimento"
                position={gpsLocal}
                loading={geoLocal.loading}
                error={geoLocal.error}
                onCapture={async () => {
                  const pos = await geoLocal.captureLocation();
                  if (pos) setGpsLocal(pos);
                }}
                disabled={loading}
              />
            </div>

            <ImageUpload
              bucketName="daily-service-photos"
              maxImages={5}
              onImagesChange={setUploadedImages}
              existingImages={uploadedImages}
              disabled={loading}
            />

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Observações Adicionais</FormLabel>
                    <VoiceInputButton
                      onFinalResult={(transcript) => {
                        const currentValue = form.getValues("observacoes") || "";
                        form.setValue("observacoes", currentValue ? `${currentValue} ${transcript}` : transcript);
                      }}
                      size="sm"
                    />
                  </div>
                  <FormControl>
                    <Textarea
                      placeholder="Observações, anotações ou informações adicionais..."
                      className="min-h-[60px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Card de Resumo IA - aparece quando concluído */}
            {recordId && form.watch('status') === 'concluido' && (
              <AISummaryCard 
                serviceType="daily_service"
                serviceId={recordId}
                status={form.watch('status')}
              />
            )}

            <DialogFooter>
              {recordId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOrcamentoOpen(true)}
                >
                  <Receipt className="h-4 w-4 mr-2" />
                  Orçamento
                </Button>
              )}
              {recordId && form.watch('status') === 'concluido' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const { data, error } = await supabase
                        .from('daily_service_records')
                        .select(`
                          *,
                          companies (nome_fantasia, cnpj, endereco, telefone, email),
                          profiles (nome, telefone),
                          assets (tag_patrimonial, tipo, nome, fabricante, modelo, numero_serie)
                        `)
                        .eq('id', recordId)
                        .single();
                      
                      if (error) throw error;
                      if (data) {
                        await exportSingleDailyServiceToPDF(data as any);
                        toast.success("PDF gerado com sucesso!");
                      }
                    } catch (error) {
                      console.error("Error generating PDF:", error);
                      toast.error("Erro ao gerar PDF");
                    }
                  }}
                  disabled={loading}
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Exportar PDF
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {recordId ? "Atualizar" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    {recordId && (
      <OrcamentoDialog
        open={isOrcamentoOpen}
        onOpenChange={setIsOrcamentoOpen}
        dailyServiceRecordId={recordId}
        serviceOrder={{
          numero_os: recordData?.titulo || 'Atendimento',
          companies: recordData?.companies,
        }}
        onSuccess={loadRecord}
      />
    )}
  </>
  );
}
