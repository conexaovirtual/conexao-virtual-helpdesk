import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { UploadedImage } from "@/lib/imageUtils";
import { VoiceInputButton } from "@/components/ui/VoiceInputButton";
import { AIExecutionReport } from "@/components/ai/AIExecutionReport";
import { useGeolocation, GeoPosition } from "@/hooks/useGeolocation";
import { ChevronDown, CheckCircle2, Save, Loader2 } from "lucide-react";

interface ServiceOrderExecutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrder: any;
  onSuccess?: () => void;
}

const hoje = () => new Date().toISOString().split("T")[0];

const executionSchema = z.object({
  descricao_servicos: z.string().min(5, "Descreva o que foi feito (mín. 5 caracteres)"),
  data_execucao: z.string().min(1, "Data é obrigatória"),
  tempo_gasto_horas: z.number().min(0).max(24).optional(),
  custo_pecas: z.number().min(0).optional(),
});

type ExecutionFormData = z.infer<typeof executionSchema>;

export function ServiceOrderExecutionDialog({
  open,
  onOpenChange,
  serviceOrder,
  onSuccess,
}: ServiceOrderExecutionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [gpsLocal, setGpsLocal] = useState<GeoPosition | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const geoLocal = useGeolocation();
  const { toast } = useToast();

  const form = useForm<ExecutionFormData>({
    resolver: zodResolver(executionSchema),
    defaultValues: {
      descricao_servicos: serviceOrder?.descricao_servicos || "",
      data_execucao: hoje(),
      tempo_gasto_horas: undefined,
      custo_pecas: 0,
    },
  });

  // Carregar fotos existentes se houver
  useEffect(() => {
    if (serviceOrder?.fotos && Array.isArray(serviceOrder.fotos)) {
      setUploadedImages(serviceOrder.fotos as UploadedImage[]);
    }
  }, [serviceOrder]);

  // Captura a localização em segundo plano ao abrir (sem ocupar a tela)
  useEffect(() => {
    if (open && !gpsLocal) {
      geoLocal.captureLocation().then((pos) => {
        if (pos) setGpsLocal(pos);
      });
    }
  }, [open]);

  const onSubmit = async (data: ExecutionFormData, finalizar: boolean) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const custoTotal = data.custo_pecas || 0;
      const novoStatus = finalizar ? "finalizada" : "executada";

      const updateData: any = {
        data_execucao: data.data_execucao,
        descricao_servicos: data.descricao_servicos,
        tempo_gasto_horas: data.tempo_gasto_horas ?? null,
        custo_pecas: data.custo_pecas || 0,
        custo_total: custoTotal,
        status: novoStatus,
        fotos: uploadedImages,
        updated_at: new Date().toISOString(),
        latitude_inicio: gpsLocal?.latitude || null,
        longitude_inicio: gpsLocal?.longitude || null,
      };

      const { error: updateError } = await supabase
        .from("service_orders")
        .update(updateData)
        .eq("id", serviceOrder.id);

      if (updateError) throw updateError;

      // Histórico
      const execucaoDetalhada = [
        `📝 ${data.descricao_servicos.substring(0, 120)}${data.descricao_servicos.length > 120 ? "…" : ""}`,
        data.tempo_gasto_horas ? `⏱️ ${data.tempo_gasto_horas}h` : null,
        (data.custo_pecas || 0) > 0 ? `🔧 Peças: R$ ${(data.custo_pecas || 0).toFixed(2)}` : null,
        `📸 ${uploadedImages.length} foto(s)`,
        `✅ ${finalizar ? "Finalizada" : "Executada"}`,
      ].filter(Boolean).join(" | ");

      const { error: historyError } = await supabase.from("service_order_history").insert({
        service_order_id: serviceOrder.id,
        changed_by: user.id,
        campo_alterado: "Execução",
        valor_anterior: "-",
        valor_novo: execucaoDetalhada,
        observacao: "Execução registrada",
      });
      if (historyError) console.error("Erro ao registrar histórico:", historyError);

      // Notificar cliente via WhatsApp (fire and forget)
      supabase.functions.invoke("notify-os-status", {
        body: { service_order_id: serviceOrder.id, new_status: novoStatus },
      }).then(res => {
        if (res.error) console.error("Erro ao notificar cliente:", res.error);
      }).catch(err => console.error("Erro ao chamar notify-os-status:", err));

      toast({
        title: finalizar ? "OS finalizada!" : "Execução salva!",
        description: `OS #${serviceOrder.numero_os} ${finalizar ? "finalizada" : "marcada como executada"}.`,
      });

      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Erro ao registrar execução:", error);
      toast({
        title: "Erro ao registrar execução",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const submitWith = (finalizar: boolean) =>
    form.handleSubmit((data) => onSubmit(data, finalizar))();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar Execução</DialogTitle>
          <DialogDescription>
            OS #{serviceOrder?.numero_os}
            {serviceOrder?.equipamento_descricao && (
              <span className="block text-xs mt-1">📟 Equipamento: {serviceOrder.equipamento_descricao}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
            {/* Campo único: o que foi feito */}
            <FormField
              control={form.control}
              name="descricao_servicos"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>O que foi feito? *</FormLabel>
                    <div className="flex gap-1">
                      <AIExecutionReport
                        titulo={serviceOrder?.descricao_servicos}
                        descricao={field.value || ''}
                        tempoGasto={form.watch('tempo_gasto_horas')}
                        observacoes={''}
                        tipoServico={serviceOrder?.tipo_servico}
                        onApply={(text) => field.onChange(text)}
                      />
                      <VoiceInputButton
                        onFinalResult={(text) => field.onChange(field.value ? `${field.value} ${text}` : text)}
                        size="sm"
                      />
                    </div>
                  </div>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={5}
                      placeholder="Descreva o serviço realizado. Use o microfone para ditar ou a IA para gerar o texto."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Fotos (prova do atendimento) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Fotos do Atendimento (opcional)</label>
              <ImageUpload
                bucketName="service-order-photos"
                maxImages={5}
                onImagesChange={setUploadedImages}
                existingImages={uploadedImages}
                disabled={loading}
              />
            </div>

            {/* Detalhes opcionais (recolhido) */}
            <div className="rounded-md border">
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50"
              >
                <span>Detalhes opcionais (data, tempo, peças)</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />
              </button>
              {showDetails && (
                <div className="p-3 pt-1 space-y-3 border-t">
                  <FormField
                    control={form.control}
                    name="data_execucao"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Data de execução</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} max={hoje()} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="tempo_gasto_horas"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Tempo gasto (horas)</FormLabel>
                          <FormControl>
                            <Input
                              type="number" step="0.25" min="0" max="24" placeholder="—"
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="custo_pecas"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Custo de peças (R$)</FormLabel>
                          <FormControl>
                            <Input
                              type="number" step="0.01" min="0" placeholder="0,00"
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Botões */}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button type="button" variant="secondary" onClick={() => submitWith(false)} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
              <Button type="button" onClick={() => submitWith(true)} disabled={loading} className="bg-green-600 hover:bg-green-700">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Finalizar OS
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
