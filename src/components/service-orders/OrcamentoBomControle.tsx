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
import { Plus, Trash2, FileText, Send, Loader2, ExternalLink, CheckCircle2, Pencil, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BcCatalogPicker } from "./BcCatalogPicker";
import type { BcCatalogItem } from "./BcCatalogPicker";

interface Item {
  bc_id?: number;
  bc_tipo?: "servico" | "produto";
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_desconto: number;
}

const ITEM_VAZIO: Item = { descricao: "", quantidade: 1, valor_unitario: 0, valor_desconto: 0 };

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serviceOrder: any;
  ticketId?: string;
  dailyServiceRecordId?: string;
  onSuccess?: () => void;
}

export function OrcamentoBomControle({ open, onOpenChange, serviceOrder, ticketId, dailyServiceRecordId, onSuccess }: Props) {
  const { toast } = useToast();
  const [itens, setItens] = useState<Item[]>([{ ...ITEM_VAZIO }]);
  const [observacao, setObservacao] = useState("");
  const [enviarWhatsApp, setEnviarWhatsApp] = useState(true);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [bcDetails, setBcDetails] = useState<any>(null);

  const jaGerado = !!serviceOrder?.bomcontrole_orcamento_id;

  useEffect(() => {
    if (open && jaGerado && serviceOrder.bomcontrole_orcamento_id) {
      fetchDetails(serviceOrder.bomcontrole_orcamento_id);
    }
    if (!open) {
      setEditMode(false);
      setBcDetails(null);
      setItens([{ ...ITEM_VAZIO }]);
      setObservacao("");
    }
  }, [open]);

  const fetchDetails = async (bcId: number) => {
    setLoadingDetails(true);
    try {
      const { data, error } = await supabase.functions.invoke("bomcontrole-orcamento", {
        body: { action: "get", bcId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setBcDetails(data.data);
    } catch (err: any) {
      console.error("Erro ao buscar orçamento:", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const enterEditMode = () => {
    if (bcDetails?.Itens?.length) {
      setItens(bcDetails.Itens.map((it: any) => ({
        descricao: it.Descricao || it.Nome || "",
        quantidade: it.Quantidade || 1,
        valor_unitario: it.ValorUnitario || 0,
        valor_desconto: it.ValorDesconto || 0,
      })));
      setObservacao(bcDetails.Observacao || "");
    }
    setEditMode(true);
  };

  const addItem = () => setItens((p) => [...p, { ...ITEM_VAZIO }]);
  const removeItem = (i: number) => setItens((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, patch: Partial<Item>) =>
    setItens((p) => p.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const selectCatalogItem = (i: number, cat: BcCatalogItem) => {
    updateItem(i, {
      bc_id: cat.bc_id,
      bc_tipo: cat.bc_tipo,
      descricao: cat.nome,
      valor_unitario: cat.preco_unitario && cat.preco_unitario > 0 ? cat.preco_unitario : itens[i].valor_unitario,
    });
  };

  const total = itens.reduce(
    (acc, it) => acc + (it.quantidade * it.valor_unitario - it.valor_desconto),
    0
  );

  const handleGerar = async () => {
    const invalidos = itens.filter((it) => !it.descricao.trim() || it.valor_unitario <= 0);
    if (invalidos.length) {
      toast({ title: "Preencha serviço e valor de todos os itens.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const entityParam = ticketId
        ? { ticket_id: ticketId }
        : dailyServiceRecordId
        ? { daily_service_record_id: dailyServiceRecordId }
        : { service_order_id: serviceOrder.id };

      const { data, error } = await supabase.functions.invoke("bomcontrole-orcamento", {
        body: {
          action: "create",
          ...entityParam,
          itens,
          observacao,
          enviar_whatsapp: enviarWhatsApp,
        },
      });

      if (error || data?.error) throw new Error(data?.error || error?.message);

      toast({ title: "Orçamento gerado!", description: data.message });
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao gerar orçamento", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const bcTotal = bcDetails?.Valor ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {ticketId
              ? `Orçamento BomControle — Chamado #${serviceOrder?.numero_os}`
              : dailyServiceRecordId
              ? `Orçamento BomControle — ${serviceOrder?.numero_os}`
              : `Orçamento BomControle — OS #${serviceOrder?.numero_os}`}
          </DialogTitle>
          <DialogDescription>
            {serviceOrder?.companies?.nome_fantasia && (
              <>Cliente: <strong>{serviceOrder.companies.nome_fantasia}</strong></>
            )}
          </DialogDescription>
        </DialogHeader>

        {jaGerado && !editMode ? (
          /* ── VIEW MODE ── */
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 p-4">
              <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-800 dark:text-green-400">
                  Orçamento #{serviceOrder.bomcontrole_orcamento_id} — BomControle
                </p>
                <p className="text-sm text-muted-foreground">
                  Status: <Badge variant="outline">{serviceOrder.bomcontrole_orcamento_status}</Badge>
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={enterEditMode}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Editar
              </Button>
            </div>

            {/* Itens do orçamento */}
            {loadingDetails ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : bcDetails?.Itens?.length > 0 ? (
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
                    {bcDetails.Itens.map((it: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{it.Descricao || it.Nome || "—"}</TableCell>
                        <TableCell className="text-center text-sm">{it.Quantidade}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(it.ValorUnitario)}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(it.ValorDesconto)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {fmt(it.Quantidade * it.ValorUnitario - it.ValorDesconto)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end px-4 py-2 border-t bg-muted/20">
                  <span className="text-sm font-bold text-primary">{fmt(bcTotal)}</span>
                </div>
              </div>
            ) : null}

            {bcDetails?.Observacao && (
              <div className="text-sm p-3 rounded-md bg-muted/30 border">
                <p className="text-muted-foreground text-xs mb-1">Observação</p>
                <p className="whitespace-pre-wrap">{bcDetails.Observacao}</p>
              </div>
            )}

            <div className="flex gap-2">
              {serviceOrder.bomcontrole_orcamento_url ? (
                <Button asChild variant="outline" className="flex-1">
                  <a href={serviceOrder.bomcontrole_orcamento_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir PDF
                  </a>
                </Button>
              ) : (
                <Button asChild variant="outline" className="flex-1">
                  <a href="https://new.bomcontrole.com.br" target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir no BomControle
                  </a>
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* ── CREATE / EDIT MODE ── */
          <div className="space-y-4">
            {editMode && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-sm">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-amber-800 dark:text-amber-400">
                  Será criado um <strong>novo orçamento</strong>. O #{serviceOrder.bomcontrole_orcamento_id} permanece no BomControle — cancele-o lá se necessário.
                </p>
              </div>
            )}

            {/* Tabela de itens */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[240px]">Serviço / Produto</TableHead>
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
                          placeholder="Selecionar do catálogo BC…"
                        />
                        {it.bc_id && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{it.descricao}</p>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <Input
                          type="number" min={1} value={it.quantidade}
                          onChange={(e) => updateItem(i, { quantidade: Number(e.target.value) })}
                          className="h-8 text-sm text-center"
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <Input
                          type="number" min={0} step={0.01} value={it.valor_unitario}
                          onChange={(e) => updateItem(i, { valor_unitario: Number(e.target.value) })}
                          className="h-8 text-sm text-right"
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <Input
                          type="number" min={0} step={0.01} value={it.valor_desconto}
                          onChange={(e) => updateItem(i, { valor_desconto: Number(e.target.value) })}
                          className="h-8 text-sm text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium py-2">
                        {fmt(it.quantidade * it.valor_unitario - it.valor_desconto)}
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

            <div>
              <Label className="text-sm mb-1 block">Observação (opcional)</Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Condições de pagamento, prazo de entrega, garantia…"
                rows={2} className="text-sm"
              />
            </div>

            <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
              <Switch id="whatsapp-switch" checked={enviarWhatsApp} onCheckedChange={setEnviarWhatsApp} />
              <Label htmlFor="whatsapp-switch" className="cursor-pointer text-sm">
                Enviar orçamento via WhatsApp para o cliente
              </Label>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => editMode ? setEditMode(false) : onOpenChange(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button onClick={handleGerar} disabled={loading} className="flex-1">
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando…</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" />{editMode ? "Criar Novo Orçamento" : "Gerar Orçamento"}</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
