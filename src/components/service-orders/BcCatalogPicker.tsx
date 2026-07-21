import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ChevronsUpDown, Wrench, Package, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface BcCatalogItem {
  bc_id: number;
  bc_tipo: "servico" | "produto";
  nome: string;
  preco_unitario?: number;
}

interface CatalogRow {
  bc_id: number;
  nome: string;
  preco_unitario: number | null;
  tipo: "servico" | "produto";
}

interface BcCatalogPickerProps {
  value?: string;
  onSelect: (item: BcCatalogItem) => void;
  placeholder?: string;
  className?: string;
}

interface ItemFormState {
  nome: string;
  precoStr: string;
}

const FORM_VAZIO = (): ItemFormState => ({ nome: "", precoStr: "" });
const toNum = (s: string) => Math.max(0, parseFloat(s.replace(",", ".")) || 0);

export function BcCatalogPicker({ value, onSelect, placeholder = "Buscar serviço...", className }: BcCatalogPickerProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CatalogRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Dialog de adicionar/editar
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ItemFormState>(FORM_VAZIO());
  const [saving, setSaving] = useState(false);

  // Dialog de confirmação de exclusão
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open && !loaded) loadCatalog();
  }, [open]);

  const loadCatalog = async () => {
    const [servRes, prodRes] = await Promise.all([
      supabase
        .from("bc_servicos")
        .select("bc_id, nome, preco_unitario, preco_venda")
        .eq("ativo", true)
        .order("nome")
        .limit(2000),
      supabase
        .from("bc_produtos")
        .select("bc_id, nome, preco_unitario, preco_venda")
        .eq("ativo", true)
        .order("nome")
        .limit(2000),
    ]);
    const servicos: CatalogRow[] = (servRes.data || []).map((s: any) => ({
      bc_id: s.bc_id, nome: s.nome, preco_unitario: s.preco_venda || s.preco_unitario, tipo: "servico",
    }));
    const produtos: CatalogRow[] = (prodRes.data || []).map((p: any) => ({
      bc_id: p.bc_id, nome: p.nome, preco_unitario: p.preco_venda || p.preco_unitario, tipo: "produto",
    }));
    setItems([...servicos, ...produtos].sort((a, b) => a.nome.localeCompare(b.nome)));
    setLoaded(true);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(FORM_VAZIO());
    setDialogOpen(true);
  };

  const openEdit = (row: CatalogRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(row.bc_id);
    setForm({ nome: row.nome, precoStr: row.preco_unitario ? String(row.preco_unitario) : "" });
    setDialogOpen(true);
    setOpen(false);
  };

  const confirmDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteId(id);
    setOpen(false);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const preco = toNum(form.precoStr);
      if (editingId !== null) {
        const { error } = await supabase
          .from("bc_servicos")
          .update({ nome: form.nome.trim(), preco_unitario: preco })
          .eq("bc_id", editingId);
        if (error) throw error;
        toast({ title: "Item atualizado!" });
      } else {
        const { data: maxRow } = await supabase
          .from("bc_servicos")
          .select("bc_id")
          .order("bc_id", { ascending: false })
          .limit(1)
          .single();
        const nextId = (maxRow?.bc_id ?? 10000) + 1;
        const { error } = await supabase.from("bc_servicos").insert({
          bc_id: nextId,
          nome: form.nome.trim(),
          preco_unitario: preco,
          ativo: true,
          synced_at: new Date().toISOString(),
        });
        if (error) throw error;
        toast({ title: "Item adicionado ao catálogo!" });
      }
      setDialogOpen(false);
      setLoaded(false);
      await loadCatalog();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await supabase.from("bc_servicos").update({ ativo: false }).eq("bc_id", deleteId);
      toast({ title: "Item removido do catálogo." });
      setDeleteId(null);
      setLoaded(false);
      await loadCatalog();
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const fmt = (v: number) =>
    v > 0 ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null;

  const q = search.toLowerCase();
  const filtered = q ? items.filter((s) => s.nome.toLowerCase().includes(q)) : items;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className={`w-full justify-between h-8 text-sm font-normal ${className ?? ""}`}
          >
            <span className="truncate text-left flex-1">{value || placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[440px] p-0"
          align="start"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <div className="flex items-center border-b">
              <CommandInput
                placeholder="Buscar item do catálogo..."
                value={search}
                onValueChange={setSearch}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 mr-1 shrink-0 text-primary"
                onClick={(e) => { e.stopPropagation(); setOpen(false); openAdd(); }}
                title="Adicionar item ao catálogo"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <CommandList className="max-h-72">
              {!loaded && (
                <div className="p-4 text-center text-sm text-muted-foreground">Carregando catálogo...</div>
              )}
              {loaded && filtered.length === 0 && (
                <CommandEmpty>
                  Nenhum item encontrado.{" "}
                  <button
                    className="text-primary underline text-sm"
                    onClick={() => { setOpen(false); openAdd(); }}
                  >
                    Adicionar?
                  </button>
                </CommandEmpty>
              )}
              {filtered.length > 0 && (
                <CommandGroup heading={`Itens (${filtered.length})`}>
                  {filtered.map((item) => (
                    <CommandItem
                      key={`${item.tipo}-${item.bc_id}`}
                      value={`${item.tipo}-${item.bc_id}-${item.nome}`}
                      onSelect={() => {
                        onSelect({
                          bc_id: item.bc_id,
                          bc_tipo: item.tipo,
                          nome: item.nome,
                          preco_unitario: item.preco_unitario ?? 0,
                        });
                        setOpen(false);
                        setSearch("");
                      }}
                      className="group flex items-center gap-2 pr-1"
                    >
                      {item.tipo === "produto" ? (
                        <Package className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      ) : (
                        <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="flex-1 text-sm truncate">{item.nome}</span>
                      {item.preco_unitario && item.preco_unitario > 0 && (
                        <span className="text-xs text-muted-foreground mr-1">
                          {fmt(item.preco_unitario)}
                        </span>
                      )}
                      {item.tipo === "servico" && (
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Button
                            variant="ghost" size="icon"
                            className="h-6 w-6"
                            onClick={(e) => openEdit(item, e)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={(e) => confirmDelete(item.bc_id, e)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Dialog adicionar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "Editar item" : "Adicionar item ao catálogo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-sm mb-1 block">Nome / Descrição</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Formatação de computador"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>
            <div>
              <Label className="text-sm mb-1 block">Valor unitário (opcional)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={form.precoStr}
                onChange={(e) => setForm((p) => ({ ...p, precoStr: e.target.value }))}
                placeholder="0,00"
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId !== null ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmação de exclusão */}
      <Dialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover item do catálogo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            O item será desativado e não aparecerá mais no catálogo. Orçamentos existentes não são afetados.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
