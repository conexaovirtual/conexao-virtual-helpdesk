import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Plus, Trash2, FileText, Send, Loader2,
  CheckCircle2, Pencil, AlertCircle, Printer, MessageCircle, Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BcCatalogPicker } from "@/components/service-orders/BcCatalogPicker";
import type { BcCatalogItem } from "@/components/service-orders/BcCatalogPicker";
import { format, addDays } from "date-fns";
import { generateOrcamentoPDF } from "@/lib/orcamentoPDF";

// Valores numéricos ficam como string no estado local para evitar
// problemas com inputs controlados do tipo número (Number("") = 0).
interface Item {
  id?: string;
  bc_id?: number;
  bc_tipo?: "servico" | "produto";
  descricao: string;
  qtdStr: string;
  unitStr: string;
  descStr: string;
  ordem: number;
}

const toNum = (s: string) =>
  Math.max(0, parseFloat(s.replace(",", ".")) || 0);

const ITEM_VAZIO = (): Item => ({
  descricao: "", qtdStr: "1", unitStr: "0", descStr: "0", ordem: 0,
});

const itemSubtotal = (it: Item) =>
  toNum(it.qtdStr) * toNum(it.unitStr) - toNum(it.descStr);

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const defaultValidade = () => format(addDays(new Date(), 30), "yyyy-MM-dd");

const normalizePhone = (raw: string): string => {
  let n = raw.replace(/\D/g, "");
  if (n.startsWith("0")) n = n.slice(1);
  if (!n.startsWith("55")) n = "55" + n;
  return n;
};

// Mesma lógica do notify-daily-record-status:
// 1. solicitante_contato do ticket vinculado (se houver)
// 2. company.whatsapp normalizado (com prefixo 55)
// 3. company.telefone normalizado
const getWhatsappPhone = async (
  _companyId: string | undefined,
  company: any,
  dailyServiceRecordId?: string,
  ticketId?: string,
): Promise<{ phone: string; open_ticket: boolean } | null> => {
  let resolvedTicketId = ticketId;
  if (!resolvedTicketId && dailyServiceRecordId) {
    const { data: rec } = await supabase
      .from("daily_service_records")
      .select("ticket_id")
      .eq("id", dailyServiceRecordId)
      .maybeSingle();
    resolvedTicketId = rec?.ticket_id;
  }
  if (resolvedTicketId) {
    const { data: ticket } = await supabase
      .from("tickets")
      .select("solicitante_contato")
      .eq("id", resolvedTicketId)
      .maybeSingle();
    if (ticket?.solicitante_contato) {
      const n = normalizePhone(ticket.solicitante_contato);
      if (n.length >= 12) return { phone: n, open_ticket: false };
    }
  }
  if (company?.whatsapp) {
    const n = normalizePhone(company.whatsapp);
    if (n.length >= 12) return { phone: n, open_ticket: false };
  }
  if (company?.telefone) {
    const n = normalizePhone(company.telefone);
    if (n.length >= 12) return { phone: n, open_ticket: false };
  }
  return null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serviceOrder?: { id?: string; numero_os?: string; companies?: any };
  ticketId?: string;
  dailyServiceRecordId?: string;
  /** Proposta avulsa: empresa selecionada (sem OS/ticket/atendimento vinculado). */
  company?: any;
  /** Abrir uma proposta já existente diretamente pelo id (ex.: lista de Propostas). */
  orcamentoId?: string;
  onSuccess?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-800 border-yellow-200",
  aprovado: "bg-green-100 text-green-800 border-green-200",
  recusado: "bg-red-100 text-red-800 border-red-200",
  cancelado: "bg-gray-100 text-gray-600 border-gray-200",
};

export function OrcamentoDialog({
  open, onOpenChange, serviceOrder, ticketId, dailyServiceRecordId,
  company: companyProp, orcamentoId, onSuccess,
}: Props) {
  const { toast } = useToast();
  const [orcamento, setOrcamento] = useState<any>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([ITEM_VAZIO()]);
  const [observacao, setObservacao] = useState("");
  const [validade, setValidade] = useState(defaultValidade());
  const [enviarWhatsApp, setEnviarWhatsApp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [sendingWpp, setSendingWpp] = useState(false);
  const [sendingPdf, setSendingPdf] = useState(false);
  const [gerandoOS, setGerandoOS] = useState(false);

  const standalone = !serviceOrder?.id && !ticketId && !dailyServiceRecordId;
  const resolvedCompany = serviceOrder?.companies ?? companyProp ?? null;
  const effOrcamentoId = orcamentoId ?? createdId ?? null;

  const entityColumn = dailyServiceRecordId
    ? "daily_service_record_id"
    : ticketId
    ? "ticket_id"
    : "service_order_id";

  const entityValue = dailyServiceRecordId || ticketId || serviceOrder?.id;

  const titulo = ticketId
    ? `Chamado #${serviceOrder?.numero_os}`
    : dailyServiceRecordId
    ? (serviceOrder?.numero_os || "Atendimento")
    : serviceOrder?.id
    ? `OS #${serviceOrder?.numero_os}`
    : resolvedCompany?.nome_fantasia
    ? `Proposta — ${resolvedCompany.nome_fantasia}`
    : "Nova Proposta";

  useEffect(() => {
    if (open && (entityValue || effOrcamentoId)) loadOrcamento();
    if (!open) {
      setOrcamento(null);
      setItens([ITEM_VAZIO()]);
      setObservacao("");
      setValidade(defaultValidade());
      setEditMode(false);
      setCreatedId(null);
    }
  }, [open]);

  const loadOrcamento = async (idOverride?: string) => {
    const oid = idOverride ?? effOrcamentoId;
    if (!entityValue && !oid) return;
    setLoadingData(true);
    let query = supabase.from("orcamentos").select("*, orcamento_itens(*)");
    query = oid ? query.eq("id", oid) : query.eq(entityColumn, entityValue);
    const { data } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      const sorted = [...(data.orcamento_itens || [])].sort((a, b) => a.ordem - b.ordem);
      setOrcamento({ ...data, orcamento_itens: sorted });
    }
    setLoadingData(false);
  };

  const enterEditMode = () => {
    if (orcamento) {
      setItens(
        (orcamento.orcamento_itens || []).map((it: any) => ({
          id: it.id,
          bc_id: it.bc_servico_id ?? it.bc_produto_id ?? undefined,
          bc_tipo: it.bc_servico_id ? "servico" : "produto",
          descricao: it.descricao,
          qtdStr: String(it.quantidade ?? 1),
          unitStr: String(it.valor_unitario ?? 0),
          descStr: String(it.valor_desconto ?? 0),
          ordem: it.ordem,
        }))
      );
      setObservacao(orcamento.observacao || "");
      setValidade(orcamento.validade || defaultValidade());
    }
    setEditMode(true);
  };

  const addItem = () => setItens((p) => [...p, ITEM_VAZIO()]);

  const removeItem = (i: number) =>
    setItens((p) => p.filter((_, idx) => idx !== i));

  const updateItem = (i: number, patch: Partial<Item>) =>
    setItens((p) => p.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const selectCatalogItem = (i: number, cat: BcCatalogItem) => {
    updateItem(i, {
      bc_id: cat.bc_id,
      bc_tipo: cat.bc_tipo,
      descricao: cat.nome,
      unitStr:
        cat.preco_unitario && cat.preco_unitario > 0
          ? String(cat.preco_unitario)
          : itens[i].unitStr,
    });
  };

  const total = itens.reduce((acc, it) => acc + itemSubtotal(it), 0);

  const handleSalvar = async () => {
    const invalidos = itens.filter(
      (it) => !it.descricao.trim() || toNum(it.unitStr) <= 0
    );
    if (invalidos.length) {
      toast({ title: "Preencha serviço e valor de todos os itens.", variant: "destructive" });
      return;
    }

    if (standalone && !resolvedCompany?.id) {
      toast({ title: "Selecione o cliente da proposta.", variant: "destructive" });
      return;
    }

    setLoading(true);
    let resultId: string | undefined;
    try {
      const company = resolvedCompany;
      const itensOrdenados = itens.map((it, i) => ({ ...it, ordem: i }));

      const toRow = (it: Item, orcId: string) => ({
        orcamento_id: orcId,
        descricao: it.descricao,
        quantidade: toNum(it.qtdStr),
        valor_unitario: toNum(it.unitStr),
        valor_desconto: toNum(it.descStr),
        bc_servico_id: it.bc_tipo === "servico" ? it.bc_id ?? null : null,
        bc_produto_id: it.bc_tipo === "produto" ? it.bc_id ?? null : null,
        ordem: it.ordem,
      });

      if (orcamento && editMode) {
        const { error: upErr } = await supabase
          .from("orcamentos")
          .update({
            observacao: observacao || null,
            validade,
            valor_total: total,
            updated_at: new Date().toISOString(),
          })
          .eq("id", orcamento.id);
        if (upErr) throw upErr;
        resultId = orcamento.id;

        await supabase.from("orcamento_itens").delete().eq("orcamento_id", orcamento.id);
        await supabase.from("orcamento_itens").insert(
          itensOrdenados.map((it) => toRow(it, orcamento.id))
        );

        toast({ title: "Orçamento atualizado!" });
      } else {
        const insertPayload: any = {
          company_id: company?.id ?? null,
          observacao: observacao || null,
          validade,
          valor_total: total,
        };
        // Proposta vinculada a OS/ticket/atendimento grava a coluna de origem;
        // proposta avulsa fica só com company_id.
        if (!standalone) insertPayload[entityColumn] = entityValue;

        const { data: novo, error: insErr } = await supabase
          .from("orcamentos")
          .insert(insertPayload)
          .select("id, numero")
          .single();
        if (insErr) throw insErr;
        resultId = novo.id;
        setCreatedId(novo.id);

        await supabase.from("orcamento_itens").insert(
          itensOrdenados.map((it) => toRow(it, novo.id))
        );

        if (enviarWhatsApp) {
          await enviarMensagem(novo.id, novo.numero, company);
        }

        toast({
          title: `Orçamento #${novo.numero} criado!`,
          description: enviarWhatsApp ? "Mensagem enviada ao cliente." : undefined,
        });
      }

      await loadOrcamento(resultId);
      setEditMode(false);
      onSuccess?.();
    } catch (err: any) {
      toast({ title: "Erro ao salvar orçamento", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const enviarMensagem = async (orcId: string, numero: number, company: any) => {
    try {
      const result = await getWhatsappPhone(company?.id, company, dailyServiceRecordId, ticketId);
      if (!result) return;
      const printUrl = `${window.location.origin}/orcamento/${orcId}/print`;
      const msg =
        `Olá! Segue o Orçamento #${numero} — ${titulo}.\n\n` +
        `💰 Total: ${fmt(total)}\n` +
        `📅 Válido até: ${format(new Date(validade + "T00:00:00"), "dd/MM/yyyy")}\n\n` +
        `📄 Visualize aqui: ${printUrl}`;
      await supabase.functions.invoke("waba-send", {
        body: { action: "send_text", phone: result.phone, text: msg, open_ticket: result.open_ticket },
      });
    } catch {
      // falha silenciosa
    }
  };

  const updateStatus = async (status: string) => {
    if (!orcamento) return;
    await supabase.from("orcamentos").update({ status }).eq("id", orcamento.id);
    setOrcamento((p: any) => ({ ...p, status }));
    toast({ title: `Status atualizado: ${STATUS_LABELS[status]}` });
  };

  const openPrint = () => {
    window.open(`/orcamento/${orcamento.id}/print`, "_blank");
  };

  const gerarOS = async () => {
    if (!orcamento) return;
    const companyId = orcamento.company_id ?? resolvedCompany?.id ?? null;
    if (!companyId) {
      toast({ title: "Proposta sem empresa vinculada.", variant: "destructive" });
      return;
    }
    setGerandoOS(true);
    try {
      const itensTxt = (orcamento.orcamento_itens || [])
        .map((it: any) => `• ${it.quantidade}x ${it.descricao}`)
        .join("\n");
      const descricao =
        `Serviços da Proposta #${orcamento.numero}:\n${itensTxt}`.trim() ||
        `Proposta #${orcamento.numero}`;

      const { data: { user } } = await supabase.auth.getUser();

      const { data: osData, error: osError } = await supabase
        .from("service_orders")
        .insert({
          company_id: companyId,
          tipo_servico: "corretivo",
          prioridade: "media",
          descricao_servicos: descricao,
          status: "agendada",
          data_emissao: new Date().toISOString(),
          observacoes:
            `Gerada a partir da Proposta #${orcamento.numero} — Total ${fmt(orcamento.valor_total)}.` +
            (orcamento.observacao ? `\n${orcamento.observacao}` : ""),
        })
        .select()
        .single();
      if (osError) throw osError;

      // Vincula a proposta à OS criada
      await supabase
        .from("orcamentos")
        .update({ service_order_id: osData.id })
        .eq("id", orcamento.id);

      // Histórico (best-effort)
      if (user) {
        await supabase.from("service_order_history").insert({
          service_order_id: osData.id,
          changed_by: user.id,
          campo_alterado: "status",
          valor_anterior: null,
          valor_novo: "agendada",
          observacao: `OS criada a partir da Proposta #${orcamento.numero}`,
        });
      }

      // Notifica o cliente (fire and forget)
      supabase.functions
        .invoke("notify-os-status", {
          body: { service_order_id: osData.id, new_status: "agendada" },
        })
        .catch(() => {});

      toast({
        title: `OS #${osData.numero_os} criada!`,
        description: "Ordem de serviço gerada a partir da proposta.",
      });
      await loadOrcamento(orcamento.id);
      onSuccess?.();
    } catch (err: any) {
      toast({ title: "Erro ao gerar OS", description: err.message, variant: "destructive" });
    } finally {
      setGerandoOS(false);
    }
  };

  const reenviarWhatsApp = async () => {
    if (!orcamento) return;
    const company = resolvedCompany;
    const phoneResult = await getWhatsappPhone(company?.id, company, dailyServiceRecordId, ticketId);
    if (!phoneResult) {
      toast({ title: "Empresa sem número de WhatsApp cadastrado.", variant: "destructive" });
      return;
    }
    setSendingWpp(true);
    try {
      const msg =
        `Olá! Segue o Orçamento #${orcamento.numero} — ${titulo}.\n\n` +
        `💰 Total: ${fmt(orcamento.valor_total)}\n` +
        `📅 Válido até: ${format(new Date(orcamento.validade + "T00:00:00"), "dd/MM/yyyy")}\n\n` +
        `📄 Visualize aqui: ${window.location.origin}/orcamento/${orcamento.id}/print`;
      await supabase.functions.invoke("waba-send", {
        body: { action: "send_text", phone: phoneResult.phone, text: msg, open_ticket: phoneResult.open_ticket },
      });
      toast({ title: "Orçamento enviado via WhatsApp!" });
    } catch {
      toast({ title: "Erro ao enviar WhatsApp", variant: "destructive" });
    } finally {
      setSendingWpp(false);
    }
  };

  const enviarPDF = async () => {
    if (!orcamento) return;
    const company = resolvedCompany;
    const phoneResult = await getWhatsappPhone(company?.id, company, dailyServiceRecordId, ticketId);
    if (!phoneResult) {
      toast({ title: "Empresa sem número de WhatsApp cadastrado.", variant: "destructive" });
      return;
    }
    setSendingPdf(true);
    try {
      const pdfBlob = await generateOrcamentoPDF(orcamento, company);
      const fileName = `orcamento_${orcamento.numero}_${Date.now()}.pdf`;
      const { data: upload, error: upErr } = await supabase.storage
        .from("orcamentos")
        .upload(fileName, pdfBlob, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("orcamentos").getPublicUrl(upload.path);
      const pdfUrl = urlData.publicUrl;
      await supabase.functions.invoke("waba-send", {
        body: {
          action: "send_media",
          phone: phoneResult.phone,
          media_url: pdfUrl,
          filename: `Orcamento_${orcamento.numero}.pdf`,
          caption: `Orçamento #${orcamento.numero} — ${titulo}\n💰 Total: ${fmt(orcamento.valor_total)}`,
          media_type: "document",
          open_ticket: phoneResult.open_ticket,
        },
      });
      toast({ title: `PDF do Orçamento #${orcamento.numero} enviado via WhatsApp!` });
      // Limpa o arquivo do storage após envio
      setTimeout(() => supabase.storage.from("orcamentos").remove([fileName]), 60000);
    } catch (err: any) {
      toast({ title: "Erro ao enviar PDF", description: err.message, variant: "destructive" });
    } finally {
      setSendingPdf(false);
    }
  };

  const jaExiste = !!orcamento;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Orçamento — {titulo}
          </DialogTitle>
          {resolvedCompany?.nome_fantasia && (
            <DialogDescription>
              Cliente: <strong>{resolvedCompany.nome_fantasia}</strong>
            </DialogDescription>
          )}
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : jaExiste && !editMode ? (
          /* ── VIEW MODE ── */
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 p-4">
              <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-800 dark:text-green-400">
                  Orçamento #{orcamento.numero}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge
                    variant="outline"
                    className={STATUS_COLORS[orcamento.status] ?? ""}
                  >
                    {STATUS_LABELS[orcamento.status] ?? orcamento.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Válido até {format(new Date(orcamento.validade + "T00:00:00"), "dd/MM/yyyy")}
                  </span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <Button size="sm" variant="outline" onClick={reenviarWhatsApp} disabled={sendingWpp || sendingPdf} className="border-green-300 text-green-700 hover:bg-green-50">
                  {sendingWpp ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5 mr-1.5" />}
                  WA Texto
                </Button>
                <Button size="sm" variant="outline" onClick={enviarPDF} disabled={sendingPdf || sendingWpp} className="border-green-300 text-green-700 hover:bg-green-50">
                  {sendingPdf ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1.5" />}
                  WA PDF
                </Button>
                <Button size="sm" variant="outline" onClick={openPrint}>
                  <Printer className="h-3.5 w-3.5 mr-1.5" />
                  Imprimir
                </Button>
                <Button size="sm" variant="outline" onClick={enterEditMode}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Editar
                </Button>
              </div>
            </div>

            {orcamento.orcamento_itens?.length > 0 && (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-20 text-center">Qtd</TableHead>
                      <TableHead className="w-28 text-right">Unit.</TableHead>
                      <TableHead className="w-24 text-right">Desc.</TableHead>
                      <TableHead className="w-28 text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orcamento.orcamento_itens.map((it: any) => (
                      <TableRow key={it.id}>
                        <TableCell className="text-sm">{it.descricao}</TableCell>
                        <TableCell className="text-center text-sm">{it.quantidade}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(it.valor_unitario)}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(it.valor_desconto)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {fmt(it.quantidade * it.valor_unitario - it.valor_desconto)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end px-4 py-2 border-t bg-muted/20">
                  <span className="text-sm font-bold text-primary">{fmt(orcamento.valor_total)}</span>
                </div>
              </div>
            )}

            {orcamento.observacao && (
              <div className="text-sm p-3 rounded-md bg-muted/30 border">
                <p className="text-muted-foreground text-xs mb-1">Observação</p>
                <p className="whitespace-pre-wrap">{orcamento.observacao}</p>
              </div>
            )}

            {orcamento.status === "pendente" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => updateStatus("aprovado")}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Marcar como Aprovado
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => updateStatus("recusado")}
                >
                  Marcar como Recusado
                </Button>
              </div>
            )}

            {orcamento.status === "aprovado" && (
              orcamento.service_order_id ? (
                <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm">
                  <Wrench className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-blue-800 dark:text-blue-400">
                    Ordem de Serviço já gerada a partir desta proposta.
                  </span>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={gerarOS}
                  disabled={gerandoOS}
                >
                  {gerandoOS ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Wrench className="h-4 w-4 mr-1.5" />
                  )}
                  Gerar Ordem de Serviço
                </Button>
              )
            )}

            <div className="flex justify-end pt-2 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          /* ── CREATE / EDIT MODE ── */
          <div className="space-y-4">
            {editMode && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-sm">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-amber-800 dark:text-amber-400">
                  Editando o <strong>Orçamento #{orcamento?.numero}</strong>. As alterações serão salvas.
                </p>
              </div>
            )}

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Serviço / Produto</TableHead>
                    <TableHead className="w-20 text-center">Qtd</TableHead>
                    <TableHead className="w-28 text-right">Valor Unit.</TableHead>
                    <TableHead className="w-24 text-right">Desconto</TableHead>
                    <TableHead className="w-28 text-right">Subtotal</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-2">
                        <BcCatalogPicker
                          value={it.descricao || undefined}
                          onSelect={(cat) => selectCatalogItem(i, cat)}
                          placeholder="Selecionar do catálogo…"
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={it.qtdStr}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateItem(i, { qtdStr: e.target.value })}
                          style={{ width: "100%", height: "32px", fontSize: "14px", textAlign: "center", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "0 8px", background: "white", color: "#0f172a" }}
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={it.unitStr}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateItem(i, { unitStr: e.target.value })}
                          style={{ width: "100%", height: "32px", fontSize: "14px", textAlign: "left", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "0 8px", background: "white", color: "#0f172a" }}
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={it.descStr}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateItem(i, { descStr: e.target.value })}
                          style={{ width: "100%", height: "32px", fontSize: "14px", textAlign: "left", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "0 8px", background: "white", color: "#0f172a" }}
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium py-2">
                        {fmt(itemSubtotal(it))}
                      </TableCell>
                      <TableCell className="py-2">
                        {itens.length > 1 && (
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeItem(i)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar item
              </Button>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold text-primary">{fmt(total)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm mb-1 block">Validade</Label>
                <Input
                  type="date"
                  value={validade}
                  onChange={(e) => setValidade(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-sm mb-1 block">Observação (opcional)</Label>
                <Textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Condições, prazo, garantia…"
                  rows={2} className="text-sm"
                />
              </div>
            </div>

            {!editMode && (
              <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
                <Switch
                  id="whatsapp-switch"
                  checked={enviarWhatsApp}
                  onCheckedChange={setEnviarWhatsApp}
                />
                <Label htmlFor="whatsapp-switch" className="cursor-pointer text-sm">
                  Enviar orçamento via WhatsApp para o cliente
                </Label>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => (editMode ? setEditMode(false) : onOpenChange(false))}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button onClick={handleSalvar} disabled={loading} className="flex-1">
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" />{editMode ? "Salvar Alterações" : "Criar Orçamento"}</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
