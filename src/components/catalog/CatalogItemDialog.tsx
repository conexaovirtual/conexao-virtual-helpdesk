import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Package, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type CatalogKind = "produto" | "servico";

export interface CatalogItemRow {
  bc_id: number;
  nome: string;
  preco_custo: number | null;
  percentual_lucro: number | null;
  preco_venda: number | null;
}

const TABLE: Record<CatalogKind, string> = {
  produto: "bc_produtos",
  servico: "bc_servicos",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: CatalogKind;
  item?: CatalogItemRow | null;
  onSuccess?: () => void;
}

// Aceita formato pt-BR ("1.800,00", "2.000") e simples ("1800.50").
// - Com vírgula: pontos são milhar, vírgula é decimal.
// - Sem vírgula mas com pontos agrupando 3 dígitos ("2.000", "1.234.567"): milhar.
// - Caso contrário, o ponto é decimal ("1800.50").
const toNum = (s: string) => {
  let str = (s ?? "").trim().replace(/\s/g, "");
  if (str.includes(",")) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
    str = str.replace(/\./g, "");
  }
  return Math.max(0, parseFloat(str) || 0);
};
const fmtNum = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface FormState {
  nome: string;
  custoStr: string;
  lucroStr: string;
  vendaStr: string;
}

const FORM_VAZIO = (): FormState => ({ nome: "", custoStr: "", lucroStr: "", vendaStr: "" });

export function CatalogItemDialog({ open, onOpenChange, kind, item, onSuccess }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(FORM_VAZIO());
  const [saving, setSaving] = useState(false);
  const editing = !!item;

  const label = kind === "produto" ? "produto" : "serviço";
  const Icon = kind === "produto" ? Package : Wrench;
  const placeholder =
    kind === "produto" ? "Ex: Mouse sem fio Logitech M170" : "Ex: Formatação de computador";

  useEffect(() => {
    if (open) {
      setForm(
        item
          ? {
              nome: item.nome,
              custoStr: item.preco_custo ? fmtNum(item.preco_custo) : "",
              lucroStr: item.percentual_lucro ? String(item.percentual_lucro) : "",
              vendaStr: item.preco_venda ? fmtNum(item.preco_venda) : "",
            }
          : FORM_VAZIO()
      );
    }
  }, [open, item]);

  // Custo ou % lucro mudou → recalcula venda
  const onCustoChange = (v: string) => {
    setForm((p) => {
      const custo = toNum(v);
      const lucro = toNum(p.lucroStr);
      const venda = custo * (1 + lucro / 100);
      return { ...p, custoStr: v, vendaStr: venda > 0 ? fmtNum(venda) : p.vendaStr };
    });
  };

  const onLucroChange = (v: string) => {
    setForm((p) => {
      const custo = toNum(p.custoStr);
      const lucro = toNum(v);
      const venda = custo * (1 + lucro / 100);
      return { ...p, lucroStr: v, vendaStr: custo > 0 ? fmtNum(venda) : p.vendaStr };
    });
  };

  // Venda mudou manualmente → recalcula % lucro a partir do custo
  const onVendaChange = (v: string) => {
    setForm((p) => {
      const custo = toNum(p.custoStr);
      const venda = toNum(v);
      const lucro = custo > 0 ? ((venda / custo - 1) * 100) : 0;
      return {
        ...p,
        vendaStr: v,
        lucroStr: custo > 0 ? String(Math.round(lucro * 100) / 100) : p.lucroStr,
      };
    });
  };

  const margem = toNum(form.vendaStr) - toNum(form.custoStr);

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast({ title: `Nome do ${label} é obrigatório`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const custo = toNum(form.custoStr);
      const lucro = toNum(form.lucroStr);
      const venda = toNum(form.vendaStr);
      const payload = {
        nome: form.nome.trim(),
        preco_custo: custo,
        percentual_lucro: lucro,
        preco_venda: venda,
        // preco_unitario espelha o preço de venda para o seletor de orçamento
        preco_unitario: venda,
        ativo: true,
        synced_at: new Date().toISOString(),
      };
      const table = TABLE[kind];

      if (editing && item) {
        const { error } = await supabase.from(table).update(payload).eq("bc_id", item.bc_id);
        if (error) throw error;
        toast({ title: `${kind === "produto" ? "Produto" : "Serviço"} atualizado!` });
      } else {
        const { data: maxRow } = await supabase
          .from(table)
          .select("bc_id")
          .order("bc_id", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextId = (maxRow?.bc_id ?? 90000) + 1;
        const { error } = await supabase.from(table).insert({ bc_id: nextId, ...payload });
        if (error) throw error;
        toast({ title: `${kind === "produto" ? "Produto" : "Serviço"} cadastrado!` });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast({ title: `Erro ao salvar ${label}`, description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            {editing ? `Editar ${label}` : `Novo ${label}`}
          </DialogTitle>
          <DialogDescription>
            Preencha o custo e a margem de lucro — o preço de venda é calculado automaticamente
            (você também pode digitar o preço de venda e a margem é recalculada).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div>
            <Label className="text-sm mb-1 block">Nome / Descrição</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
              placeholder={placeholder}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm mb-1 block">Preço de custo (R$)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={form.custoStr}
                onChange={(e) => onCustoChange(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="0,00"
              />
            </div>
            <div>
              <Label className="text-sm mb-1 block">Lucro (%)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={form.lucroStr}
                onChange={(e) => onLucroChange(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm mb-1 block">Preço de venda (R$)</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={form.vendaStr}
              onChange={(e) => onVendaChange(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="0,00"
            />
            {toNum(form.custoStr) > 0 && toNum(form.vendaStr) > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Margem por unidade:{" "}
                <span className={margem >= 0 ? "text-emerald-600 font-medium" : "text-destructive font-medium"}>
                  R$ {fmtNum(margem)}
                </span>
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {editing ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
