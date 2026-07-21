import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

const safeFormat = (dateStr: string | null | undefined, fmt: string) => {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return isValid(d) ? format(d, fmt, { locale: ptBR }) : "N/A";
};
import { CheckCircle, XCircle, PlayCircle, FileText, Clock, Calendar, Edit, Loader2, Receipt } from "lucide-react";
import { generateServiceOrderPDF } from "./ServiceOrderPDF";
import { ServiceOrderEditDialog } from "./ServiceOrderEditDialog";
import { ServiceOrderExecutionDialog } from "./ServiceOrderExecutionDialog";
import { OrcamentoDialog } from "@/components/orcamentos/OrcamentoDialog";

interface ServiceOrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrder: any;
  onUpdate?: () => void;
}

const statusColors: Record<string, string> = {
  agendada: "bg-blue-500",
  confirmada: "bg-green-500",
  em_execucao: "bg-yellow-500",
  executada: "bg-purple-500",
  finalizada: "bg-gray-700",
  cancelada: "bg-red-500",
};

const statusLabels: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  em_execucao: "Em Execução",
  executada: "Executada",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export function ServiceOrderDetailDialog({
  open,
  onOpenChange,
  serviceOrder,
  onUpdate,
}: ServiceOrderDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isExecutionDialogOpen, setIsExecutionDialogOpen] = useState(false);
  const [isOrcamentoOpen, setIsOrcamentoOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && serviceOrder) {
      loadHistory();
    }
  }, [open, serviceOrder]);

  const loadHistory = async () => {
    const { data, error } = await supabase
      .from("service_order_history")
      .select(`
        *,
        profiles (nome)
      `)
      .eq("service_order_id", serviceOrder.id)
      .order("created_at", { ascending: false });

    if (!error) {
      setHistory(data || []);
    }
  };

  const updateStatus = async (newStatus: string, observacao?: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error: updateError } = await supabase
        .from("service_orders")
        .update({ status: newStatus })
        .eq("id", serviceOrder.id);

      if (updateError) throw updateError;

      await supabase.from("service_order_history").insert({
        service_order_id: serviceOrder.id,
        changed_by: user.id,
        campo_alterado: "status",
        valor_anterior: serviceOrder.status,
        valor_novo: newStatus,
        observacao,
      });

      // Notificar cliente via WhatsApp APENAS quando o status mudou de fato.
      if (newStatus !== serviceOrder.status) {
        supabase.functions.invoke("notify-os-status", {
          body: {
            service_order_id: serviceOrder.id,
            new_status: newStatus,
            observacao,
          },
        }).then(res => {
          if (res.error) console.error("Erro ao notificar cliente:", res.error);
          else console.log("Notificação WhatsApp enviada:", res.data);
        }).catch(err => console.error("Erro ao chamar notify-os-status:", err));
      }

      toast({
        title: "Status atualizado!",
        description: `OS #${serviceOrder.numero_os} agora está ${statusLabels[newStatus]}`,
      });

      onUpdate?.();
    } catch (error: any) {
      console.error("Erro ao atualizar status:", error);
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      await generateServiceOrderPDF(serviceOrder);
      toast({
        title: "PDF gerado com sucesso!",
        description: `OS #${serviceOrder.numero_os} baixada.`,
      });
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast({
        title: "Erro ao gerar PDF",
        description: "Não foi possível gerar o PDF. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  if (!serviceOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Ordem de Serviço #{serviceOrder.numero_os}</DialogTitle>
            <Badge className={statusColors[serviceOrder.status]}>
              {statusLabels[serviceOrder.status]}
            </Badge>
          </div>
          <DialogDescription>
            Criada em {safeFormat(serviceOrder.created_at, "dd/MM/yyyy 'às' HH:mm")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Informações Básicas */}
          <div className="grid grid-cols-2 gap-4">
            {serviceOrder.tickets && (
              <div className="col-span-2">
                <h4 className="text-sm font-semibold text-muted-foreground">Chamado</h4>
                <p>#{serviceOrder.tickets.numero} - {serviceOrder.tickets.titulo}</p>
              </div>
            )}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground">Empresa</h4>
              <p>{serviceOrder.companies?.nome_fantasia}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground">Tipo de Serviço</h4>
              <p className="capitalize">{serviceOrder.tipo_servico}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground">Prioridade</h4>
              <p className="capitalize">{serviceOrder.prioridade}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground">Técnico</h4>
              <p>{serviceOrder.profiles?.nome || "Não atribuído"}</p>
            </div>
          </div>

          <Separator />

          {/* Agendamento */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Agendamento</h4>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                  {serviceOrder.data_agendada 
                    ? safeFormat(serviceOrder.data_agendada, "dd/MM/yyyy")
                    : "Não agendada"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{serviceOrder.hora_agendada?.slice(0, 5) || "N/A"}</span>
              </div>
              {serviceOrder.tempo_estimado_horas && (
                <span className="text-sm text-muted-foreground">
                  ({serviceOrder.tempo_estimado_horas}h estimadas)
                </span>
              )}
            </div>
          </div>

          <Separator />

          {/* Descrição */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Descrição do Serviço</h4>
            <p className="text-sm whitespace-pre-wrap">{serviceOrder.descricao_servicos}</p>
          </div>

          {/* Localização */}
          {serviceOrder.endereco_atendimento && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">Localização</h4>
                <p className="text-sm">{serviceOrder.endereco_atendimento}</p>
                {serviceOrder.contato_local && (
                  <p className="text-sm mt-1">Contato: {serviceOrder.contato_local} {serviceOrder.telefone_contato && `- ${serviceOrder.telefone_contato}`}</p>
                )}
              </div>
            </>
          )}

          {/* Observações */}
          {serviceOrder.observacoes && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">Observações</h4>
                <p className="text-sm whitespace-pre-wrap">{serviceOrder.observacoes}</p>
              </div>
            </>
          )}

          {/* Dados de Execução */}
          {(serviceOrder.status === "executada" || serviceOrder.status === "finalizada") && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">Dados de Execução</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Data de Execução</p>
                    <p className="text-sm font-medium">
                      {serviceOrder.data_execucao 
                        ? safeFormat(serviceOrder.data_execucao, "dd/MM/yyyy")
                        : "Não informada"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tempo Gasto</p>
                    <p className="text-sm font-medium">{serviceOrder.tempo_gasto_horas || 0}h</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Custo de Peças</p>
                    <p className="text-sm font-medium">
                      R$ {(serviceOrder.custo_pecas || 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Custo Total</p>
                    <p className="text-sm font-medium">
                      R$ {(serviceOrder.custo_total || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Histórico Melhorado */}
          {history.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">📋 Histórico de Alterações</h4>
                <div className="space-y-3">
                  {history.map(item => {
                    const isExecution = item.campo_alterado === "Execução";
                    const isStatus = item.campo_alterado === "status";
                    const isEdit = !isExecution && !isStatus;
                    
                    return (
                      <div 
                        key={item.id} 
                        className={`rounded-lg border p-3 ${
                          isExecution ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" : 
                          isStatus ? "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800" : 
                          "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800"
                        }`}
                      >
                        {/* Cabeçalho */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            {isExecution && <span className="text-lg">✅</span>}
                            {isStatus && <span className="text-lg">🔄</span>}
                            {isEdit && <span className="text-lg">📝</span>}
                            <span className="font-semibold text-sm">
                              {isExecution ? "Execução Registrada" : 
                               isStatus ? "Mudança de Status" : 
                               `${item.campo_alterado} Alterado(a)`}
                            </span>
                          </div>
                        </div>

                        {/* Conteúdo */}
                        {isExecution ? (
                          <div className="space-y-1 text-xs">
                            {item.valor_novo.split(" | ").map((info: string, idx: number) => (
                              <p key={idx} className="text-foreground/80">{info}</p>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="px-2 py-1 rounded bg-background/50 text-muted-foreground line-through">
                              {item.valor_anterior || "—"}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className="px-2 py-1 rounded bg-primary/10 font-medium">
                              {item.valor_novo}
                            </span>
                          </div>
                        )}

                        {/* Observação */}
                        {item.observacao && (
                          <p className="text-xs text-muted-foreground mt-2 italic">
                            💬 {item.observacao}
                          </p>
                        )}

                        {/* Rodapé */}
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t text-xs text-muted-foreground">
                          <span>👤 {item.profiles?.nome}</span>
                          <span>•</span>
                          <span>📅 {safeFormat(item.created_at, "dd/MM/yyyy 'às' HH:mm")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Ações */}
          <div className="flex flex-wrap gap-2">
            {/* Botão Editar - disponível para todos os status (técnicos podem corrigir dados) */}
            <Button
              onClick={() => setIsEditDialogOpen(true)}
              variant="outline"
              size="sm"
            >
              <Edit className="h-4 w-4 mr-2" />
              Editar OS
            </Button>

            {/* Orçamento */}
            {serviceOrder.status !== "cancelada" && (
              <Button
                onClick={() => setIsOrcamentoOpen(true)}
                variant="outline"
                size="sm"
                className="border-orange-400 text-orange-700 hover:bg-orange-50"
              >
                <Receipt className="h-4 w-4 mr-2" />
                Orçamento
              </Button>
            )}

            {/* Botão Registrar Execução - disponível apenas quando em_execucao */}
            {serviceOrder.status === "em_execucao" && (
              <Button
                onClick={() => setIsExecutionDialogOpen(true)}
                size="sm"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Registrar Execução
              </Button>
            )}

            {serviceOrder.status === "agendada" && (
              <>
                <Button
                  onClick={() => updateStatus("confirmada", "OS confirmada pelo técnico")}
                  disabled={loading}
                  size="sm"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirmar
                </Button>
                <Button
                  onClick={() => updateStatus("cancelada", "OS cancelada")}
                  disabled={loading}
                  variant="destructive"
                  size="sm"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
              </>
            )}

            {serviceOrder.status === "confirmada" && (
              <Button
                onClick={() => updateStatus("em_execucao", "Atendimento iniciado")}
                disabled={loading}
                size="sm"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Iniciar Atendimento
              </Button>
            )}

            {serviceOrder.status === "executada" && (
              <Button
                onClick={() => updateStatus("finalizada", "OS finalizada e aprovada")}
                disabled={loading}
                size="sm"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Finalizar OS
              </Button>
            )}

            {(serviceOrder.status === "executada" || serviceOrder.status === "finalizada") && (
              <Button
                onClick={handleGeneratePDF}
                variant="outline"
                size="sm"
                disabled={isGeneratingPDF}
              >
                {isGeneratingPDF ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando PDF...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Baixar PDF
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Dialogs de Edição e Execução */}
        <ServiceOrderEditDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          serviceOrder={serviceOrder}
          onSuccess={() => {
            onUpdate?.();
            setIsEditDialogOpen(false);
          }}
        />

        <ServiceOrderExecutionDialog
          open={isExecutionDialogOpen}
          onOpenChange={setIsExecutionDialogOpen}
          serviceOrder={serviceOrder}
          onSuccess={() => {
            onUpdate?.();
            setIsExecutionDialogOpen(false);
          }}
        />

        <OrcamentoDialog
          open={isOrcamentoOpen}
          onOpenChange={setIsOrcamentoOpen}
          serviceOrder={serviceOrder}
          onSuccess={onUpdate}
        />
      </DialogContent>
    </Dialog>
  );
}