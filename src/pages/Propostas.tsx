import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { OrcamentoDialog } from "@/components/orcamentos/OrcamentoDialog";
import {
  Receipt, Plus, Search, Loader2, FileText, Building2, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const fmtMoeda = (v: number | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado", cancelado: "Cancelado",
};
const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-800 border-yellow-200",
  aprovado: "bg-green-100 text-green-800 border-green-200",
  recusado: "bg-red-100 text-red-800 border-red-200",
  cancelado: "bg-gray-100 text-gray-600 border-gray-200",
};

const origemLabel = (o: any) =>
  o.service_order_id ? "Ordem de Serviço"
  : o.ticket_id ? "Chamado"
  : o.daily_service_record_id ? "Atendimento"
  : "Avulsa";

interface Company {
  id: string;
  nome_fantasia: string | null;
  whatsapp: string | null;
  telefone: string | null;
}

export default function Propostas() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();

  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  // Diálogo do orçamento (nova / visualizar)
  const [dlg, setDlg] = useState<{ open: boolean; company?: Company | null; orcamentoId?: string }>({
    open: false,
  });

  // Seletor de cliente para nova proposta
  const [pickerOpen, setPickerOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companySearch, setCompanySearch] = useState("");
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  useEffect(() => {
    if (!loading && !profile) { navigate("/auth"); return; }
    if (profile && !profile.roles?.some((r: string) => ["admin_provedor", "tecnico", "gestor_cliente"].includes(r))) {
      navigate("/dashboard"); toast.error("Acesso negado"); return;
    }
    if (profile) loadOrcamentos();
  }, [profile, loading, navigate]);

  const loadOrcamentos = async () => {
    setLoadingData(true);
    const { data, error } = await supabase
      .from("orcamentos")
      .select("id, numero, status, valor_total, validade, created_at, company_id, service_order_id, ticket_id, daily_service_record_id, companies(id, nome_fantasia, whatsapp, telefone)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error("Erro ao carregar propostas: " + error.message);
    setOrcamentos(data || []);
    setLoadingData(false);
  };

  const openPicker = async () => {
    setPickerOpen(true);
    if (companies.length === 0) {
      setLoadingCompanies(true);
      const { data } = await supabase
        .from("companies")
        .select("id, nome_fantasia, whatsapp, telefone")
        .order("nome_fantasia")
        .limit(2000);
      setCompanies((data as Company[]) || []);
      setLoadingCompanies(false);
    }
  };

  const startNova = (company: Company) => {
    setPickerOpen(false);
    setCompanySearch("");
    setDlg({ open: true, company, orcamentoId: undefined });
  };

  const openExistente = (o: any) => {
    setDlg({ open: true, company: o.companies, orcamentoId: o.id });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orcamentos.filter((o) => {
      if (statusFilter !== "todos" && o.status !== statusFilter) return false;
      if (!q) return true;
      const cliente = o.companies?.nome_fantasia?.toLowerCase() || "";
      return cliente.includes(q) || String(o.numero).includes(q);
    });
  }, [orcamentos, search, statusFilter]);

  const totalAprovado = orcamentos
    .filter((o) => o.status === "aprovado")
    .reduce((acc, o) => acc + (o.valor_total ?? 0), 0);
  const pendentes = orcamentos.filter((o) => o.status === "pendente").length;

  const companiesFiltradas = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    return q
      ? companies.filter((c) => (c.nome_fantasia || "").toLowerCase().includes(q))
      : companies;
  }, [companies, companySearch]);

  if (loading || !profile) return null;

  return (
    <div className="bg-background min-h-screen">
      <PageHeader
        icon={Receipt}
        title="Propostas"
        subtitle="Orçamentos e propostas comerciais"
        metrics={[
          { icon: FileText, label: "Total", value: orcamentos.length, color: "bg-blue-600/90" },
          { icon: Loader2, label: "Pendentes", value: pendentes, color: "bg-yellow-600/90" },
          { icon: CheckCircle2, label: "Aprovado (R$)", value: fmtMoeda(totalAprovado), color: "bg-emerald-600/90" },
        ]}
        actions={
          <Button
            onClick={openPicker}
            size="sm"
            className="h-8 text-xs gap-1 bg-white/10 hover:bg-white/20 text-white border-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nova Proposta</span>
          </Button>
        }
      />

      <main className="container mx-auto px-4 py-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente ou nº..."
              className="pl-8"
            />
          </div>
          <div className="flex gap-1">
            {["todos", "pendente", "aprovado", "recusado"].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                className="h-9 text-xs capitalize"
                onClick={() => setStatusFilter(s)}
              >
                {s === "todos" ? "Todos" : STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Nº</TableHead>
                <TableHead className="min-w-[200px]">Cliente</TableHead>
                <TableHead className="w-36">Origem</TableHead>
                <TableHead className="w-32 text-right">Total</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-28">Validade</TableHead>
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
                    {search || statusFilter !== "todos" ? "Nenhuma proposta encontrada." : (
                      <>
                        Nenhuma proposta ainda.{" "}
                        <button className="text-primary underline" onClick={openPicker}>
                          Criar a primeira?
                        </button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((o) => (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => openExistente(o)}
                  >
                    <TableCell className="font-medium text-sm">#{o.numero}</TableCell>
                    <TableCell className="text-sm">
                      {o.companies?.nome_fantasia || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-normal">
                        {origemLabel(o)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-primary">
                      {fmtMoeda(o.valor_total)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[o.status] ?? ""}>
                        {STATUS_LABELS[o.status] ?? o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {o.validade ? format(new Date(o.validade + "T00:00:00"), "dd/MM/yyyy") : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      {/* Seletor de cliente para nova proposta */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Selecione o cliente
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              placeholder="Buscar empresa..."
              className="pl-8"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto -mx-1">
            {loadingCompanies ? (
              <div className="py-8 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : companiesFiltradas.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>
            ) : (
              companiesFiltradas.map((c) => (
                <button
                  key={c.id}
                  onClick={() => startNova(c)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm flex items-center gap-2"
                >
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{c.nome_fantasia || "(sem nome)"}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <OrcamentoDialog
        open={dlg.open}
        onOpenChange={(v) => setDlg((p) => ({ ...p, open: v }))}
        company={dlg.company}
        orcamentoId={dlg.orcamentoId}
        onSuccess={loadOrcamentos}
      />
    </div>
  );
}
