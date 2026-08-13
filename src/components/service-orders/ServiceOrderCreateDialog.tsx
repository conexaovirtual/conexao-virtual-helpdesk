import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown, ChevronUp, Plus, QrCode } from "lucide-react";
import { QuickAssetDialog } from "@/components/assets/QuickAssetDialog";
import { AssetQRScannerDialog } from "@/components/assets/AssetQRScannerDialog";

const formSchema = z.object({
  company_id: z.string().min(1, "Selecione uma empresa"),
  asset_id: z.string().optional(),
  equipamento_descricao: z.string().optional(),
  descricao_servicos: z.string().min(5, "Descreva o problema (mínimo 5 caracteres)"),
  // campos opcionais com defaults
  tipo_servico: z.enum(["corretivo", "preventivo", "instalacao", "consultoria"]).default("corretivo"),
  prioridade: z.enum(["baixa", "media", "alta", "urgente"]).default("media"),
  tecnico_id: z.string().optional(),
  data_agendada: z.string().optional(),
  hora_agendada: z.string().optional(),
  endereco_atendimento: z.string().optional(),
  contato_local: z.string().optional(),
  telefone_contato: z.string().optional(),
  observacoes: z.string().optional(),
});

interface ServiceOrderCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preSelectedCompanyId?: string;
  preSelectedTicketId?: string;
  preSelectedAssetId?: string;
  preSelectedTipoServico?: string;
  preSelectedDescricao?: string;
  onSuccess?: () => void;
}

export function ServiceOrderCreateDialog({
  open,
  onOpenChange,
  preSelectedCompanyId,
  preSelectedTicketId,
  preSelectedAssetId,
  preSelectedTipoServico,
  preSelectedDescricao,
  onSuccess,
}: ServiceOrderCreateDialogProps) {
  const [loading, setLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [isQuickAssetOpen, setIsQuickAssetOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const { toast } = useToast();

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const nowHour = format(new Date(), "HH:mm");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      company_id: preSelectedCompanyId || "",
      asset_id: preSelectedAssetId || "",
      equipamento_descricao: "",
      descricao_servicos: preSelectedDescricao || "",
      tipo_servico: (preSelectedTipoServico as any) || "corretivo",
      prioridade: "media",
      tecnico_id: "",
      data_agendada: todayStr,
      hora_agendada: nowHour,
      endereco_atendimento: "",
      contato_local: "",
      telefone_contato: "",
      observacoes: "",
    },
  });

  useEffect(() => {
    if (open) {
      setShowMore(false);
      loadCompanies();
      loadTechnicians();
      if (preSelectedCompanyId) {
        form.setValue("company_id", preSelectedCompanyId);
        loadCompanyDetails(preSelectedCompanyId);
        loadAssets(preSelectedCompanyId);
      } else if (preSelectedAssetId) {
        loadCompanyFromAsset(preSelectedAssetId);
      }
      if (preSelectedAssetId) {
        form.setValue("asset_id", preSelectedAssetId);
      }
    }
  }, [open]);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, nome_fantasia, endereco, tipo_contrato")
        .eq("status", true)
        .order("nome_fantasia");
      if (error) throw error;
      setCompanies(data || []);
    } catch (error: any) {
      toast({ title: "Erro ao carregar empresas", description: error.message, variant: "destructive" });
      setCompanies([]);
    } finally {
      setLoadingCompanies(false);
    }
  };

  const loadTechnicians = async () => {
    const rolesRes = await supabase.from("user_roles").select("user_id").eq("role", "tecnico");
    const ids = rolesRes.data?.map((r) => r.user_id) || [];
    if (ids.length === 0) return;
    const { data } = await supabase.from("profiles").select("id, nome").in("id", ids);
    setTechnicians(data || []);
  };

  const loadAssets = async (companyId: string) => {
    if (!companyId) { setAssets([]); return; }
    setLoadingAssets(true);
    try {
      const { data, error } = await supabase
        .from("assets")
        .select("id, nome, tipo, tag_patrimonial")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      setAssets(data || []);
    } catch {
      setAssets([]);
    } finally {
      setLoadingAssets(false);
    }
  };

  const loadCompanyDetails = async (companyId: string) => {
    const { data } = await supabase.from("companies").select("*").eq("id", companyId).single();
    if (data) {
      setSelectedCompany(data);
      if (data.endereco) form.setValue("endereco_atendimento", data.endereco);
      if (data.telefone) form.setValue("telefone_contato", data.telefone);
      form.setValue("asset_id", "");
      form.setValue("equipamento_descricao", "");
    }
  };

  const loadCompanyFromAsset = async (assetId: string) => {
    const { data } = await supabase.from("assets").select("company_id").eq("id", assetId).single();
    if (data?.company_id) {
      form.setValue("company_id", data.company_id);
      loadCompanyDetails(data.company_id);
      loadAssets(data.company_id);
    }
  };

  // Ao escanear o QR da etiqueta (mesmo padrão colado nas máquinas — ver
  // AssetLabelPrint.tsx), pré-preenche empresa+ativo igual a um link
  // ?assetId= já faz hoje. Usa await em vez de fire-and-forget aqui pra
  // garantir que o asset_id seja setado DEPOIS que loadCompanyDetails zera
  // esse campo (ela reseta asset_id ao trocar de empresa) — senão a
  // ordem de resolução das duas promises corre risco de sobrescrever.
  const handleScan = async (assetId: string) => {
    const { data } = await supabase.from("assets").select("company_id, nome").eq("id", assetId).maybeSingle();
    if (!data?.company_id) {
      toast({ title: "Ativo não encontrado", description: "Esse QR code não corresponde a um ativo cadastrado.", variant: "destructive" });
      return;
    }
    form.setValue("company_id", data.company_id);
    const company = companies.find((c) => c.id === data.company_id);
    if (company) setSelectedCompany(company);
    await loadCompanyDetails(data.company_id);
    await loadAssets(data.company_id);
    form.setValue("asset_id", assetId);
    toast({ title: "Ativo identificado!", description: data.nome });
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const dataStr = values.data_agendada || todayStr;
      const horaStr = values.hora_agendada || nowHour;
      const dataAgendada = new Date(`${dataStr}T${horaStr}:00`);

      const insertData: any = {
        company_id: values.company_id,
        asset_id: values.asset_id || null,
        equipamento_descricao: values.equipamento_descricao || null,
        ticket_id: preSelectedTicketId || null,
        tipo_servico: values.tipo_servico,
        prioridade: values.prioridade,
        descricao_servicos: values.descricao_servicos,
        data_agendada: dataAgendada.toISOString(),
        hora_agendada: horaStr,
        tempo_estimado_horas: 0,
        status: "agendada",
        data_emissao: new Date().toISOString(),
      };

      if (values.tecnico_id) insertData.tecnico_id = values.tecnico_id;
      if (values.endereco_atendimento) insertData.endereco_atendimento = values.endereco_atendimento;
      if (values.contato_local) insertData.contato_local = values.contato_local;
      if (values.telefone_contato) insertData.telefone_contato = values.telefone_contato;
      if (values.observacoes) insertData.observacoes = values.observacoes;

      const { data: osData, error: osError } = await supabase
        .from("service_orders")
        .insert(insertData)
        .select()
        .single();

      if (osError) throw osError;

      if (preSelectedTicketId) {
        await supabase.from("tickets").update({ status: "em_atendimento" }).eq("id", preSelectedTicketId);
      }

      await supabase.from("service_order_history").insert({
        service_order_id: osData.id,
        changed_by: user.id,
        campo_alterado: "status",
        valor_anterior: null,
        valor_novo: "agendada",
        observacao: "OS criada",
      });

      supabase.functions.invoke("notify-os-status", {
        body: { service_order_id: osData.id, new_status: "agendada" },
      }).catch(() => {});

      toast({
        title: "OS criada com sucesso!",
        description: `OS #${osData.numero_os} — ${format(dataAgendada, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
      });

      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({ title: "Erro ao criar OS", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const watchedCompanyId = form.watch("company_id");
  const isContrato = selectedCompany?.tipo_contrato === "contrato_manutencao";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle>Nova Ordem de Serviço</DialogTitle>
              <DialogDescription>Informe o cliente, equipamento e o problema a resolver.</DialogDescription>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setIsScannerOpen(true)}>
              <QrCode className="h-4 w-4" /> Escanear QR
            </Button>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* 1. EMPRESA */}
            <FormField
              control={form.control}
              name="company_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa *</FormLabel>
                  <Select
                    disabled={loadingCompanies}
                    onValueChange={(value) => {
                      field.onChange(value);
                      const company = companies.find((c) => c.id === value);
                      setSelectedCompany(company || null);
                      loadCompanyDetails(value);
                      loadAssets(value);
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={loadingCompanies ? "Carregando..." : "Selecione a empresa"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="z-[100]">
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

            {/* 2. EQUIPAMENTO */}
            {watchedCompanyId && (
              isContrato ? (
                <FormField
                  control={form.control}
                  name="asset_id"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Equipamento</FormLabel>
                        {watchedCompanyId && (
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                            onClick={() => setIsQuickAssetOpen(true)}
                          >
                            <Plus className="h-3 w-3" />
                            Novo ativo
                          </button>
                        )}
                      </div>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingAssets}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={loadingAssets ? "Carregando..." : assets.length === 0 ? "Nenhum ativo cadastrado" : "Selecione o equipamento"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="z-[100]">
                          {assets.map((asset) => (
                            <SelectItem key={asset.id} value={asset.id}>
                              {asset.nome} — {asset.tipo}
                              {asset.tag_patrimonial ? ` (${asset.tag_patrimonial})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="equipamento_descricao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipamento</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Notebook Dell, servidor, impressora..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )
            )}

            {/* 3. PROBLEMA */}
            <FormField
              control={form.control}
              name="descricao_servicos"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Problema / O que precisa ser feito *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o que está acontecendo ou o que precisa ser feito..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* MAIS OPÇÕES */}
            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowMore((v) => !v)}
              >
                {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showMore ? "Menos opções" : "Mais opções"} (tipo, prioridade, técnico, data, contato...)
              </button>

              {showMore && (
                <div className="mt-4 space-y-4 border-l-2 border-muted pl-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="tipo_servico"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="corretivo">Corretivo</SelectItem>
                              <SelectItem value="preventivo">Preventivo</SelectItem>
                              <SelectItem value="instalacao">Instalação</SelectItem>
                              <SelectItem value="consultoria">Consultoria</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="prioridade"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prioridade</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="baixa">Baixa</SelectItem>
                              <SelectItem value="media">Média</SelectItem>
                              <SelectItem value="alta">Alta</SelectItem>
                              <SelectItem value="urgente">Urgente</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="data_agendada"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="hora_agendada"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Horário</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="tecnico_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Técnico</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Não atribuído" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {technicians.map((tech) => (
                              <SelectItem key={tech.id} value={tech.id}>{tech.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endereco_atendimento"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Endereço</FormLabel>
                        <FormControl>
                          <Input placeholder="Endereço do atendimento" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="contato_local"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contato no local</FormLabel>
                          <FormControl>
                            <Input placeholder="Nome" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="telefone_contato"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telefone</FormLabel>
                          <FormControl>
                            <Input placeholder="(62) 99999-9999" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="observacoes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observações</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Informações extras, requisitos especiais..." {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Criando..." : "Criar OS"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      <AssetQRScannerDialog open={isScannerOpen} onOpenChange={setIsScannerOpen} onScan={handleScan} />

      {isQuickAssetOpen && watchedCompanyId && (
        <QuickAssetDialog
          open={isQuickAssetOpen}
          onOpenChange={setIsQuickAssetOpen}
          companyId={watchedCompanyId}
          onSuccess={(newAssetId) => {
            loadAssets(watchedCompanyId);
            form.setValue("asset_id", newAssetId);
          }}
        />
      )}
    </Dialog>
  );
}
