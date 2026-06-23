import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Plus, FileSignature, Clock, AlertTriangle, CheckCircle, Loader2, Building2, Pencil, Trash2, FileDown, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "@/hooks/use-toast";
import { format, differenceInDays, isPast } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCNPJLookup } from "@/hooks/useCNPJLookup";
import { downloadContratoPDF } from "@/lib/contratoPDF";

const contractTypes = [
  { value: "bloco_horas", label: "Bloco de Horas" },
  { value: "ilimitado", label: "Ilimitado" },
  { value: "por_chamado", label: "Por Chamado" },
  { value: "mensal_fixo", label: "Mensal Fixo" },
];

const defaultForm = {
  company_id: "", tipo: "mensal_fixo", valor_mensal: "", horas_contratadas: "",
  vigencia_inicio: format(new Date(), "yyyy-MM-dd"), vigencia_fim: "",
  renovacao_automatica: false, descricao: "", observacoes: "", status: "ativo",
  dia_vencimento: "", valor_implantacao: "", representante_legal: "", representante_cpf: "",
};

const emptyNewCompany = { cnpj: "", razao_social: "", nome_fantasia: "", endereco: "", telefone: "", email: "" };

const Contracts = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState(defaultForm);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  // Fluxo "cadastrar nova empresa via CNPJ" dentro do diálogo de contrato
  const [newCompanyMode, setNewCompanyMode] = useState(false);
  const [newCompany, setNewCompany] = useState(emptyNewCompany);
  const { lookupCNPJ, isLoading: cnpjLoading } = useCNPJLookup();
  const [savingCompany, setSavingCompany] = useState(false);

  const isAdmin = profile?.roles?.includes("admin_provedor");

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-contracts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, nome_fantasia, razao_social, cnpj, endereco, telefone, email, representante_legal, representante_cpf, sla_primeiro_atendimento_horas")
        .eq("status", true)
        .order("nome_fantasia");
      return data || [];
    },
  });

  // Busca CNPJ na Receita e preenche os campos da nova empresa
  const handleBuscarCNPJ = async () => {
    const data = await lookupCNPJ(newCompany.cnpj);
    if (data) {
      setNewCompany({
        cnpj: newCompany.cnpj,
        razao_social: data.razao_social || "",
        nome_fantasia: data.nome_fantasia || data.razao_social || "",
        endereco: data.endereco_completo || "",
        telefone: data.telefone || "",
        email: data.email || "",
      });
      toast({ title: "✓ Dados encontrados", description: "Confira e salve a empresa." });
    }
  };

  // Cadastra a empresa e já a seleciona no contrato
  const handleSalvarEmpresa = async () => {
    if (!newCompany.nome_fantasia && !newCompany.razao_social) {
      toast({ title: "Informe ao menos a razão social ou nome fantasia", variant: "destructive" });
      return;
    }
    setSavingCompany(true);
    try {
      const { data, error } = await supabase
        .from("companies")
        .insert({
          nome_fantasia: newCompany.nome_fantasia || newCompany.razao_social,
          razao_social: newCompany.razao_social || null,
          cnpj: newCompany.cnpj || null,
          endereco: newCompany.endereco || null,
          telefone: newCompany.telefone || null,
          email: newCompany.email || null,
          status: true,
          tipo_contrato: "eventual",
        } as any)
        .select("id, nome_fantasia, razao_social, cnpj, endereco, telefone, email, representante_legal, representante_cpf, sla_primeiro_atendimento_horas")
        .single();
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["companies-contracts"] });
      setForm((f) => ({ ...f, company_id: data.id }));
      setNewCompanyMode(false);
      setNewCompany(emptyNewCompany);
      toast({ title: "Empresa cadastrada!", description: data.nome_fantasia });
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar empresa", description: e?.message, variant: "destructive" });
    } finally {
      setSavingCompany(false);
    }
  };

  // Quando seleciona uma empresa existente, puxa o representante legal já cadastrado
  const handleSelectCompany = (companyId: string) => {
    const c = companies.find((x: any) => x.id === companyId);
    setForm((f) => ({
      ...f,
      company_id: companyId,
      representante_legal: c?.representante_legal || f.representante_legal,
      representante_cpf: c?.representante_cpf || f.representante_cpf,
    }));
  };

  // Gera o PDF do contrato com dados da empresa + contrato
  const handleGerarPDF = async (contract: any) => {
    setGeneratingId(contract.id);
    try {
      const { data: company, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", contract.company_id)
        .single();
      if (error) throw error;
      await downloadContratoPDF(contract, company);
      toast({ title: "Contrato gerado!", description: "O download foi iniciado." });
    } catch (e: any) {
      toast({ title: "Erro ao gerar contrato", description: e?.message, variant: "destructive" });
    } finally {
      setGeneratingId(null);
    }
  };

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts", filterStatus],
    queryFn: async () => {
      let query = supabase.from("contracts").select("*, companies(nome_fantasia)").order("created_at", { ascending: false });
      if (filterStatus !== "all") query = query.eq("status", filterStatus as "ativo" | "expirado" | "cancelado" | "pendente");
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
    setNewCompanyMode(false);
    setNewCompany(emptyNewCompany);
  };

  const openEdit = (contract: any) => {
    const c = companies.find((x: any) => x.id === contract.company_id);
    setForm({
      company_id: contract.company_id,
      tipo: contract.tipo,
      valor_mensal: String(contract.valor_mensal || ""),
      horas_contratadas: String(contract.horas_contratadas || ""),
      vigencia_inicio: contract.vigencia_inicio,
      vigencia_fim: contract.vigencia_fim || "",
      renovacao_automatica: contract.renovacao_automatica || false,
      descricao: contract.descricao || "",
      observacoes: contract.observacoes || "",
      status: contract.status,
      dia_vencimento: String(contract.dia_vencimento || ""),
      valor_implantacao: String(contract.valor_implantacao || ""),
      representante_legal: c?.representante_legal || "",
      representante_cpf: c?.representante_cpf || "",
    });
    setEditingId(contract.id);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: form.company_id,
        tipo: form.tipo as any,
        valor_mensal: parseFloat(form.valor_mensal) || 0,
        horas_contratadas: parseFloat(form.horas_contratadas) || 0,
        vigencia_inicio: form.vigencia_inicio,
        vigencia_fim: form.vigencia_fim || null,
        renovacao_automatica: form.renovacao_automatica,
        descricao: form.descricao || null,
        observacoes: form.observacoes || null,
        status: form.status as any,
        dia_vencimento: form.dia_vencimento ? parseInt(form.dia_vencimento, 10) : null,
        valor_implantacao: form.valor_implantacao ? parseFloat(form.valor_implantacao) : null,
      };
      if (editingId) {
        const { error } = await supabase.from("contracts").update(payload as any).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contracts").insert(payload as any);
        if (error) throw error;
      }

      // Persiste o representante legal na empresa (usado no documento do contrato)
      if (form.company_id && (form.representante_legal || form.representante_cpf)) {
        await supabase
          .from("companies")
          .update({
            representante_legal: form.representante_legal || null,
            representante_cpf: form.representante_cpf || null,
          } as any)
          .eq("id", form.company_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["companies-contracts"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: editingId ? "Contrato atualizado!" : "Contrato criado com sucesso!" });
    },
    onError: (error: any) => {
      console.error("[Contracts] Error:", error);
      toast({ title: "Erro ao salvar contrato", description: error?.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      setDeleteId(null);
      toast({ title: "Contrato excluído com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir contrato", description: error?.message, variant: "destructive" });
    },
  });

  const getStatusBadge = (contract: any) => {
    if (contract.status === "cancelado") return <Badge variant="destructive">Cancelado</Badge>;
    if (contract.status === "pendente") return <Badge variant="secondary">Pendente</Badge>;
    if (contract.vigencia_fim && isPast(new Date(contract.vigencia_fim))) return <Badge variant="destructive">Expirado</Badge>;
    if (contract.vigencia_fim && differenceInDays(new Date(contract.vigencia_fim), new Date()) <= 30) return <Badge className="bg-warning text-warning-foreground">Expirando</Badge>;
    return <Badge className="bg-success text-success-foreground">Ativo</Badge>;
  };

  const getHoursProgress = (contract: any) => {
    if (!contract.horas_contratadas || contract.horas_contratadas === 0) return null;
    return Math.min((contract.horas_consumidas / contract.horas_contratadas) * 100, 100);
  };

  const activeContracts = contracts.filter((c: any) => c.status === "ativo");
  const expiringContracts = contracts.filter((c: any) => c.vigencia_fim && differenceInDays(new Date(c.vigencia_fim), new Date()) <= 30 && differenceInDays(new Date(c.vigencia_fim), new Date()) >= 0);
  const totalMRR = activeContracts.reduce((sum: number, c: any) => sum + (c.valor_mensal || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader icon={FileSignature} title="Contratos" subtitle="Gestão de contratos e SLA avançado" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <FileSignature className="h-8 w-8 text-primary" />
          <div><p className="text-sm text-muted-foreground">Ativos</p><p className="text-2xl font-bold">{activeContracts.length}</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-warning" />
          <div><p className="text-sm text-muted-foreground">Expirando (30d)</p><p className="text-2xl font-bold">{expiringContracts.length}</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <Clock className="h-8 w-8 text-info" />
          <div><p className="text-sm text-muted-foreground">Total Contratos</p><p className="text-2xl font-bold">{contracts.length}</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-success" />
          <div><p className="text-sm text-muted-foreground">MRR</p><p className="text-2xl font-bold">R$ {totalMRR.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="expirado">Expirado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
          </SelectContent>
        </Select>

        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="ml-auto"><Plus className="h-4 w-4 mr-2" />Novo Contrato</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Contrato" : "Novo Contrato"}</DialogTitle>
                <DialogDescription>{editingId ? "Atualize os dados do contrato." : "Preencha os dados para criar um novo contrato."}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <Label>Empresa *</Label>
                    {!editingId && (
                      <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs"
                        onClick={() => setNewCompanyMode((v) => !v)}>
                        {newCompanyMode ? "Selecionar existente" : "➕ Cadastrar nova via CNPJ"}
                      </Button>
                    )}
                  </div>

                  {!newCompanyMode ? (
                    <Select value={form.company_id} onValueChange={handleSelectCompany}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="mt-2 space-y-2 rounded-md border border-dashed p-3">
                      <div className="flex gap-2">
                        <Input placeholder="CNPJ (somente números)" value={newCompany.cnpj}
                          onChange={(e) => setNewCompany({ ...newCompany, cnpj: e.target.value })} />
                        <Button type="button" variant="secondary" onClick={handleBuscarCNPJ} disabled={cnpjLoading}>
                          {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Input placeholder="Razão social" value={newCompany.razao_social}
                        onChange={(e) => setNewCompany({ ...newCompany, razao_social: e.target.value })} />
                      <Input placeholder="Nome fantasia" value={newCompany.nome_fantasia}
                        onChange={(e) => setNewCompany({ ...newCompany, nome_fantasia: e.target.value })} />
                      <Input placeholder="Endereço" value={newCompany.endereco}
                        onChange={(e) => setNewCompany({ ...newCompany, endereco: e.target.value })} />
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Telefone" value={newCompany.telefone}
                          onChange={(e) => setNewCompany({ ...newCompany, telefone: e.target.value })} />
                        <Input placeholder="E-mail" value={newCompany.email}
                          onChange={(e) => setNewCompany({ ...newCompany, email: e.target.value })} />
                      </div>
                      <Button type="button" size="sm" className="w-full" onClick={handleSalvarEmpresa} disabled={savingCompany}>
                        {savingCompany ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Building2 className="h-4 w-4 mr-2" />}
                        Cadastrar e selecionar
                      </Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo *</Label>
                    <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {contractTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Valor Mensal (R$)</Label>
                    <Input type="number" value={form.valor_mensal} onChange={(e) => setForm({ ...form, valor_mensal: e.target.value })} />
                  </div>
                </div>
                {form.tipo === "bloco_horas" && (
                  <div>
                    <Label>Horas Contratadas</Label>
                    <Input type="number" value={form.horas_contratadas} onChange={(e) => setForm({ ...form, horas_contratadas: e.target.value })} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Início *</Label><Input type="date" value={form.vigencia_inicio} onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })} /></div>
                  <div><Label>Fim</Label><Input type="date" value={form.vigencia_fim} onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })} /></div>
                </div>

                <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <FileDown className="h-3.5 w-3.5" /> Dados para o documento do contrato (PDF)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Dia de vencimento</Label>
                      <Input type="number" min={1} max={31} placeholder="ex: 10" value={form.dia_vencimento}
                        onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })} />
                    </div>
                    <div>
                      <Label>Valor implantação (R$)</Label>
                      <Input type="number" placeholder="opcional" value={form.valor_implantacao}
                        onChange={(e) => setForm({ ...form, valor_implantacao: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Representante legal</Label>
                      <Input placeholder="Nome do signatário" value={form.representante_legal}
                        onChange={(e) => setForm({ ...form, representante_legal: e.target.value })} />
                    </div>
                    <div>
                      <Label>CPF do representante</Label>
                      <Input placeholder="000.000.000-00" value={form.representante_cpf}
                        onChange={(e) => setForm({ ...form, representante_cpf: e.target.value })} />
                    </div>
                  </div>
                </div>
                {editingId && (
                  <div>
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                        <SelectItem value="expirado">Expirado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Switch checked={form.renovacao_automatica} onCheckedChange={(v) => setForm({ ...form, renovacao_automatica: v })} />
                  <Label>Renovação automática</Label>
                </div>
                <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
                <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
                <Button onClick={() => saveMutation.mutate()} disabled={!form.company_id || !form.vigencia_inicio || saveMutation.isPending} className="w-full">
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {editingId ? "Salvar Alterações" : "Criar Contrato"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O contrato será removido permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : contracts.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">Nenhum contrato encontrado</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="w-[80px]">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract: any) => {
                  const hoursProgress = getHoursProgress(contract);
                  return (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {contract.companies?.nome_fantasia || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{contractTypes.find(t => t.value === contract.tipo)?.label || contract.tipo}</Badge>
                      </TableCell>
                      <TableCell>R$ {(contract.valor_mensal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>
                        {hoursProgress !== null ? (
                          <div className="space-y-1 min-w-[120px]">
                            <div className="flex justify-between text-xs">
                              <span>{contract.horas_consumidas || 0}h</span>
                              <span className="text-muted-foreground">/ {contract.horas_contratadas}h</span>
                            </div>
                            <Progress value={hoursProgress} className={`h-2 ${hoursProgress > 80 ? "[&>div]:bg-destructive" : hoursProgress > 60 ? "[&>div]:bg-warning" : ""}`} />
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(contract.vigencia_inicio), "dd/MM/yy")}
                        {contract.vigencia_fim ? ` → ${format(new Date(contract.vigencia_fim), "dd/MM/yy")}` : " → ∞"}
                      </TableCell>
                      <TableCell>{getStatusBadge(contract)}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" title="Gerar contrato (PDF)"
                              onClick={() => handleGerarPDF(contract)} disabled={generatingId === contract.id}>
                              {generatingId === contract.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(contract)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(contract.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Contracts;
