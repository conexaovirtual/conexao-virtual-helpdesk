import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  CatalogItemDialog, type CatalogItemRow, type CatalogKind,
} from "@/components/catalog/CatalogItemDialog";
import type { LucideIcon } from "lucide-react";
import {
  Plus, Pencil, Trash2, Search, Loader2, DollarSign, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

const fmtMoeda = (v: number | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TABLE: Record<CatalogKind, string> = {
  produto: "bc_produtos",
  servico: "bc_servicos",
};

interface Props {
  kind: CatalogKind;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

export function CatalogManager({ kind, icon, title, subtitle }: Props) {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  const table = TABLE[kind];
  const novoLabel = kind === "produto" ? "Novo Produto" : "Novo Serviço";
  const itemLabel = kind === "produto" ? "produto" : "serviço";
  const colLabel = kind === "produto" ? "Produto" : "Serviço";

  const [itens, setItens] = useState<CatalogItemRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItemRow | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<CatalogItemRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !profile) { navigate("/auth"); return; }
    if (profile && !profile.roles?.some((r: string) => ["admin_provedor", "tecnico"].includes(r))) {
      navigate("/dashboard"); toast.error("Acesso negado"); return;
    }
    if (profile) loadItens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, loading, navigate, kind]);

  const loadItens = async () => {
    setLoadingData(true);
    const { data, error } = await supabase
      .from(table)
      .select("bc_id, nome, preco_custo, percentual_lucro, preco_venda")
      .eq("ativo", true)
      .order("nome")
      .limit(2000);
    if (error) toast.error(`Erro ao carregar ${itemLabel}s: ` + error.message);
    setItens((data as CatalogItemRow[]) || []);
    setLoadingData(false);
  };

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (it: CatalogItemRow) => { setEditing(it); setDialogOpen(true); };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from(table).update({ ativo: false }).eq("bc_id", deleteTarget.bc_id);
      if (error) throw error;
      toast.success(`${colLabel} removido.`);
      setDeleteTarget(null);
      loadItens();
    } catch (err: any) {
      toast.error("Erro ao remover: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? itens.filter((p) => p.nome.toLowerCase().includes(q)) : itens;
  }, [itens, search]);

  const somaVenda = itens.reduce((acc, p) => acc + (p.preco_venda ?? 0), 0);

  if (loading || !profile) return null;

  return (
    <div className="bg-background min-h-screen">
      <PageHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        metrics={[
          { icon, label: "Cadastrados", value: itens.length, color: "bg-blue-600/90" },
          { icon: DollarSign, label: "Soma p/ venda", value: fmtMoeda(somaVenda), color: "bg-emerald-600/90" },
        ]}
        actions={
          <Button
            onClick={openNew}
            size="sm"
            className="h-8 text-xs gap-1 bg-white/10 hover:bg-white/20 text-white border-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{novoLabel}</span>
          </Button>
        }
      />

      <main className="container mx-auto px-4 py-4 space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar ${itemLabel}...`}
            className="pl-8"
          />
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[240px]">{colLabel}</TableHead>
                <TableHead className="w-32 text-right">Custo</TableHead>
                <TableHead className="w-24 text-right">Lucro %</TableHead>
                <TableHead className="w-32 text-right">Venda</TableHead>
                <TableHead className="w-32 text-right">Margem</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingData ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-sm text-muted-foreground">
                    {search ? `Nenhum ${itemLabel} encontrado.` : (
                      <>
                        Nenhum {itemLabel} cadastrado ainda.{" "}
                        <button className="text-primary underline" onClick={openNew}>
                          Cadastrar o primeiro?
                        </button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const margem = (p.preco_venda ?? 0) - (p.preco_custo ?? 0);
                  return (
                    <TableRow key={p.bc_id} className="group">
                      <TableCell className="text-sm font-medium">{p.nome}</TableCell>
                      <TableCell className="text-right text-sm">{fmtMoeda(p.preco_custo)}</TableCell>
                      <TableCell className="text-right text-sm">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <TrendingUp className="h-3 w-3" />
                          {(p.percentual_lucro ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold text-primary">
                        {fmtMoeda(p.preco_venda)}
                      </TableCell>
                      <TableCell className={`text-right text-sm ${margem >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {fmtMoeda(margem)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(p)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <CatalogItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kind={kind}
        item={editing}
        onSuccess={loadItens}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover {itemLabel}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            O {itemLabel} <strong>{deleteTarget?.nome}</strong> será desativado e não aparecerá mais no
            catálogo. Orçamentos já criados não são afetados.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
