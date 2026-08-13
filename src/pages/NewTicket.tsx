import { useState, useEffect, FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, AlertCircle, Plus, QrCode, Sparkles, Check, X, Loader2 } from "lucide-react";
import { ticketSchema, type TicketFormData } from "@/lib/validations";
import { AssetDialog } from "@/components/assets/AssetDialog";
import { TicketNextStepsDialog } from "@/components/tickets/TicketNextStepsDialog";
import { VoiceInputButton } from "@/components/ui/VoiceInputButton";

export default function NewTicket() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showAssetDialog, setShowAssetDialog] = useState(false);
  const [showNextStepsDialog, setShowNextStepsDialog] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [lastSubmit, setLastSubmit] = useState<number>(0);
  const [selectedAssetInfo, setSelectedAssetInfo] = useState<any>(null);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState(false);

  // Estados para entrada por voz
  const [isCategorizingVoice, setIsCategorizingVoice] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<{
    titulo: string;
    categoria: string;
    subcategoria: string;
    impacto: "baixo" | "medio" | "alto";
    urgencia: "baixa" | "media" | "alta";
    descricao_formatada: string;
  } | null>(null);

  const preSelectedAssetId = searchParams.get("ativo");
  const preSelectedCompanyId = searchParams.get("empresa");
  const qrCodeToken = searchParams.get("token");

  const [formData, setFormData] = useState({
    titulo: "",
    descricao: "",
    category_id: "",
    subcategory_id: "",
    asset_id: preSelectedAssetId || "",
    company_id: preSelectedCompanyId || "",
    canal: "web" as "whatsapp" | "ligacao" | "visita_tecnica" | "email" | "web",
    impacto: "medio" as "baixo" | "medio" | "alto",
    urgencia: "media" as "baixa" | "media" | "alta",
    tecnico_id: "",
  });

  useEffect(() => {
    // Se veio de QR Code mas não está autenticado, redirecionar para login
    if ((preSelectedAssetId || qrCodeToken) && !profile && !authLoading) {
      const currentParams = new URLSearchParams(searchParams);
      const returnUrl = `/tickets/new?${currentParams.toString()}`;
      navigate(`/auth?redirect=${encodeURIComponent(returnUrl)}`);
      return;
    }

    // Aguardar carregamento do profile
    if (authLoading) return;

    if (!profile) return;

    loadCategories();

    // Validar token do QR Code se presente
    if (preSelectedAssetId && qrCodeToken) {
      validateQRCodeToken();
    }

    // Se for admin/técnico, carregar empresas e técnicos
    if (profile?.roles.includes("admin_provedor") || profile?.roles.includes("tecnico")) {
      loadCompanies();
      loadTechnicians();
      // Se já veio empresa pré-selecionada
      if (preSelectedCompanyId) {
        setSelectedCompanyId(preSelectedCompanyId);
      }
    } else if (profile?.company_id) {
      // Usuário comum: carregar ativos da própria empresa
      setSelectedCompanyId(profile.company_id);
      setFormData((prev) => ({ ...prev, company_id: profile.company_id! }));
    }
  }, [profile, authLoading, preSelectedAssetId, qrCodeToken, searchParams, navigate]);

  useEffect(() => {
    if (selectedCompanyId) {
      loadAssets(selectedCompanyId);
    } else {
      setAssets([]);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    if (formData.category_id) {
      loadSubcategories(formData.category_id);
    }
  }, [formData.category_id]);

  const loadCategories = async () => {
    const { data } = await supabase.from("categories").select("*");
    if (data) setCategories(data);
  };

  const loadSubcategories = async (categoryId: string) => {
    const { data } = await supabase.from("subcategories").select("*").eq("category_id", categoryId);
    if (data) setSubcategories(data);
  };

  const loadCompanies = async () => {
    const { data } = await supabase
      .from("companies")
      .select("id, nome_fantasia")
      .eq("status", true)
      .order("nome_fantasia");
    if (data) setCompanies(data);
  };

  const loadTechnicians = async () => {
    // SECURITY: Query user_roles table to prevent privilege escalation
    const { data: userRolesData, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin_provedor", "tecnico"]);

    if (rolesError || !userRolesData || userRolesData.length === 0) {
      console.error("Erro ao carregar roles:", rolesError);
      setTechnicians([]);
      return;
    }

    // Get user IDs
    const technicianIds = userRolesData.map((ur) => ur.user_id);

    // Fetch profiles for these users
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, nome")
      .in("id", technicianIds);

    if (profilesError) {
      console.error("Erro ao carregar profiles:", profilesError);
      setTechnicians([]);
      return;
    }

    if (profilesData) {
      const techs = profilesData.map((profile) => ({
        id: profile.id,
        nome: profile.nome,
      }));
      setTechnicians(techs);
    }
  };

  const loadAssets = async (companyId: string) => {
    const { data } = await supabase
      .from("assets")
      .select(
        `
        *,
        company:companies(nome_fantasia)
      `,
      )
      .eq("company_id", companyId)
      .order("nome")
      .neq("estado", "baixado");
    if (data) setAssets(data);
  };

  const validateQRCodeToken = async () => {
    if (!preSelectedAssetId || !qrCodeToken) return;

    const { data: asset, error } = await supabase
      .from("assets")
      .select(
        `
        *,
        company:companies(nome_fantasia)
      `,
      )
      .eq("id", preSelectedAssetId)
      .eq("qrcode_token", qrCodeToken)
      .single();

    if (error || !asset) {
      setTokenError(true);
      toast({
        title: "QR Code inválido",
        description: "O código QR escaneado não é válido ou expirou",
        variant: "destructive",
      });
      return;
    }

    setTokenValid(true);
    setSelectedAssetInfo(asset);
  };

  // Função para processar transcrição de voz com IA
  const handleVoiceTranscript = async (transcript: string) => {
    if (!transcript.trim()) return;

    setVoiceTranscript(transcript);
    setIsCategorizingVoice(true);
    setAiSuggestion(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-ticket-categorizer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ transcription: transcript }),
      });

      if (!response.ok) {
        throw new Error("Falha na categorização");
      }

      const data = await response.json();

      if (data.success && data.categorization) {
        setAiSuggestion(data.categorization);
        toast({
          title: "✨ IA analisou o chamado",
          description: "Revise as sugestões e confirme ou edite manualmente",
        });
      } else {
        throw new Error(data.error || "Erro na categorização");
      }
    } catch (error) {
      console.error("Erro ao categorizar:", error);
      toast({
        title: "Erro na categorização",
        description: "Não foi possível categorizar. Preencha manualmente.",
        variant: "destructive",
      });
      // Pelo menos preenche a descrição com o texto falado
      setFormData((prev) => ({
        ...prev,
        descricao: transcript,
      }));
    } finally {
      setIsCategorizingVoice(false);
    }
  };

  // Função para aceitar sugestão da IA
  const acceptAiSuggestion = () => {
    if (!aiSuggestion) return;

    // Encontrar IDs de categoria e subcategoria baseado nos nomes
    const categoryMatch = categories.find((c) => c.nome.toLowerCase() === aiSuggestion.categoria.toLowerCase());

    let subcategoryMatch = null;
    if (categoryMatch && subcategories.length > 0) {
      subcategoryMatch = subcategories.find((s) => s.nome.toLowerCase() === aiSuggestion.subcategoria.toLowerCase());
    }

    setFormData((prev) => ({
      ...prev,
      titulo: aiSuggestion.titulo,
      descricao: aiSuggestion.descricao_formatada,
      category_id: categoryMatch?.id || prev.category_id,
      subcategory_id: subcategoryMatch?.id || "",
      impacto: aiSuggestion.impacto,
      urgencia: aiSuggestion.urgencia,
    }));

    // Se encontrou categoria, carregar subcategorias
    if (categoryMatch) {
      loadSubcategories(categoryMatch.id);
    }

    setAiSuggestion(null);
    setVoiceTranscript("");

    toast({
      title: "Sugestão aplicada",
      description: "Revise os campos e faça ajustes se necessário",
    });
  };

  // Função para rejeitar sugestão da IA
  const rejectAiSuggestion = () => {
    // Apenas preenche a descrição com o texto original
    setFormData((prev) => ({
      ...prev,
      descricao: voiceTranscript,
    }));
    setAiSuggestion(null);
    setVoiceTranscript("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    // Validar token se vier de QR Code
    if (preSelectedAssetId && qrCodeToken && !tokenValid) {
      toast({
        title: "QR Code inválido",
        description: "O código QR escaneado não é válido",
        variant: "destructive",
      });
      return;
    }

    // Rate limiting: prevent ticket spam (10 seconds between submissions)
    const now = Date.now();
    if (now - lastSubmit < 10000) {
      toast({
        title: "Aguarde",
        description: "Aguarde alguns segundos antes de criar outro chamado",
        variant: "destructive",
      });
      return;
    }

    // Validar formulário
    try {
      ticketSchema.parse(formData);

      // Validação adicional: Técnico obrigatório para admins/técnicos
      if (profile?.roles.includes("admin_provedor") || profile?.roles.includes("tecnico")) {
        if (!formData.tecnico_id || formData.tecnico_id === "none") {
          setValidationErrors({ tecnico_id: "Selecione um técnico responsável" });
          toast({
            title: "Campo obrigatório",
            description: "Você precisa atribuir um técnico responsável ao chamado",
            variant: "destructive",
          });
          return;
        }
      }

      setValidationErrors({});
      setLastSubmit(now);
    } catch (error: any) {
      const errors: Record<string, string> = {};
      error.errors.forEach((err: any) => {
        errors[err.path[0]] = err.message;
      });
      setValidationErrors(errors);
      toast({
        title: "Erro de validação",
        description: "Verifique os campos destacados",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        titulo: formData.titulo,
        descricao: formData.descricao,
        category_id: formData.category_id || null,
        subcategory_id: formData.subcategory_id || null,
        asset_id: formData.asset_id,
        company_id: formData.company_id,
        solicitante_id: profile.id,
        tecnico_id: formData.tecnico_id || null,
        canal: formData.canal,
        impacto: formData.impacto,
        urgencia: formData.urgencia,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Erro ao criar chamado",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setCreatedTicket(data);
      setShowNextStepsDialog(true);

      toast({
        title: "Chamado criado com sucesso",
        description: `Chamado #${data.numero} foi registrado`,
      });

      // Automação fire-and-forget: só triagem IA. NÃO notifica o cliente na
      // abertura do chamado — decisão do José (28/07/2026): cliente só deve
      // ser avisado quando um técnico faz atendimento de verdade (OS/registro
      // diário), nunca na simples abertura/criação do chamado.
      const runAutomations = async () => {
        await Promise.allSettled([
          supabase.functions.invoke("ai-ticket-triage", { body: { ticket_id: data.id } }),
        ]);
      };
      runAutomations().catch(console.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <h1 className="text-2xl font-bold">Novo Chamado</h1>
          <p className="text-muted-foreground">Preencha os dados do chamado técnico</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {tokenError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                QR Code inválido. Por favor, escaneie novamente ou crie o chamado manualmente.
              </AlertDescription>
            </Alert>
          )}

          {tokenValid && selectedAssetInfo && (
            <Alert>
              <QrCode className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">Chamado via QR Code</p>
                  <div className="text-sm space-y-0.5">
                    <p>
                      <span className="text-muted-foreground">Ativo:</span> {selectedAssetInfo.tipo}
                    </p>
                    {selectedAssetInfo.tag_patrimonial && (
                      <p>
                        <span className="text-muted-foreground">Tag:</span> {selectedAssetInfo.tag_patrimonial}
                      </p>
                    )}
                    <p>
                      <span className="text-muted-foreground">Empresa:</span> {selectedAssetInfo.company?.nome_fantasia}
                    </p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {Object.keys(validationErrors).length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Por favor, corrija os erros no formulário antes de continuar.</AlertDescription>
            </Alert>
          )}

          {/* Campo Empresa - Apenas para admins/técnicos */}
          {(profile?.roles.includes("admin_provedor") || profile?.roles.includes("tecnico")) && (
            <div className="space-y-2">
              <Label htmlFor="company">Empresa *</Label>
              <Select
                required
                value={formData.company_id}
                onValueChange={(value) => {
                  setFormData({ ...formData, company_id: value, asset_id: "" });
                  setSelectedCompanyId(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa cliente" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.nome_fantasia}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Campo Técnico Responsável - OBRIGATÓRIO para admins/técnicos */}
          {(profile?.roles.includes("admin_provedor") || profile?.roles.includes("tecnico")) && (
            <div className="space-y-2">
              <Label htmlFor="tecnico">
                Técnico Responsável <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.tecnico_id}
                onValueChange={(value) => setFormData({ ...formData, tecnico_id: value })}
                required
              >
                <SelectTrigger className={validationErrors.tecnico_id ? "border-destructive" : ""}>
                  <SelectValue placeholder="Selecione um técnico responsável" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.tecnico_id && <p className="text-sm text-destructive">{validationErrors.tecnico_id}</p>}
              <p className="text-xs text-muted-foreground">Este campo é obrigatório para garantir atendimento ágil</p>
            </div>
          )}

          {/* Card de Sugestão da IA */}
          {aiSuggestion && (
            <Card className="border-primary/50 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  IA Sugeriu
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Título:</span>{" "}
                    <span className="font-medium">{aiSuggestion.titulo}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Categoria:</span>{" "}
                    <span className="font-medium">
                      {aiSuggestion.categoria} › {aiSuggestion.subcategoria}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <span className="text-muted-foreground">Impacto:</span>{" "}
                      <span className="font-medium capitalize">{aiSuggestion.impacto}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Urgência:</span>{" "}
                      <span className="font-medium capitalize">{aiSuggestion.urgencia}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={acceptAiSuggestion} className="flex-1">
                    <Check className="h-4 w-4 mr-1" />
                    Aceitar Sugestão
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={rejectAiSuggestion}>
                    <X className="h-4 w-4 mr-1" />
                    Editar Manualmente
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading da categorização por voz */}
          {isCategorizingVoice && (
            <Card className="border-muted">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div>
                    <p className="font-medium">Analisando com IA...</p>
                    <p className="text-sm text-muted-foreground">Categorizando o chamado automaticamente</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="titulo">Título *</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Fale o chamado</span>
                <VoiceInputButton onFinalResult={handleVoiceTranscript} disabled={isCategorizingVoice} size="sm" />
              </div>
            </div>
            <Input
              id="titulo"
              required
              value={formData.titulo}
              onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              placeholder="Resumo do problema"
              className={validationErrors.titulo ? "border-destructive" : ""}
            />
            {validationErrors.titulo && <p className="text-sm text-destructive">{validationErrors.titulo}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição *</Label>
            <Textarea
              id="descricao"
              required
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Descreva o problema em detalhes"
              rows={5}
              className={validationErrors.descricao ? "border-destructive" : ""}
            />
            {validationErrors.descricao && <p className="text-sm text-destructive">{validationErrors.descricao}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Categoria *</Label>
              <Select
                required
                value={formData.category_id}
                onValueChange={(value) => setFormData({ ...formData, category_id: value, subcategory_id: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subcategory">Subcategoria</Label>
              <Select
                value={formData.subcategory_id}
                onValueChange={(value) => setFormData({ ...formData, subcategory_id: value })}
                disabled={!formData.category_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {subcategories.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="asset">Ativo/Equipamento *</Label>
              {selectedCompanyId && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => setShowAssetDialog(true)}
                  className="h-auto p-0 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Cadastrar Novo Ativo
                </Button>
              )}
            </div>

            <Select
              required
              value={formData.asset_id}
              onValueChange={(value) => setFormData({ ...formData, asset_id: value })}
              disabled={!!preSelectedAssetId || !selectedCompanyId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !selectedCompanyId
                      ? "Selecione uma empresa primeiro"
                      : assets.length === 0
                        ? "Nenhum ativo disponível - Clique em 'Cadastrar Novo Ativo'"
                        : "Selecione o equipamento"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {assets.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.nome} - {asset.tipo} {asset.tag_patrimonial && `(${asset.tag_patrimonial})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {assets.length === 0 && selectedCompanyId && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Esta empresa não possui ativos cadastrados.{" "}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setShowAssetDialog(true)}
                    className="h-auto p-0 underline"
                  >
                    Clique aqui para cadastrar o primeiro ativo
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="canal">Canal de Atendimento *</Label>
            <Select
              required
              value={formData.canal}
              onValueChange={(value: any) => setFormData({ ...formData, canal: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Como foi aberto?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="web">Portal Web</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="ligacao">Ligação Telefônica</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="visita_tecnica">Visita Técnica</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="impacto">Impacto *</Label>
              <Select
                required
                value={formData.impacto}
                onValueChange={(value: any) => setFormData({ ...formData, impacto: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixo">Baixo</SelectItem>
                  <SelectItem value="medio">Médio</SelectItem>
                  <SelectItem value="alto">Alto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="urgencia">Urgência *</Label>
              <Select
                required
                value={formData.urgencia}
                onValueChange={(value: any) => setFormData({ ...formData, urgencia: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => navigate(-1)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Criando..." : "Criar Chamado"}
            </Button>
          </div>
        </form>
      </main>

      {/* Dialog de Próximos Passos */}
      {createdTicket && (
        <TicketNextStepsDialog
          open={showNextStepsDialog}
          onOpenChange={(open) => {
            setShowNextStepsDialog(open);
            if (!open) {
              navigate("/tickets");
            }
          }}
          ticketId={createdTicket.id}
          ticketNumber={createdTicket.numero}
          companyId={createdTicket.company_id}
          assetId={createdTicket.asset_id}
        />
      )}

      {/* Dialog de Criação de Ativo */}
      <AssetDialog
        open={showAssetDialog}
        onOpenChange={setShowAssetDialog}
        preSelectedCompanyId={selectedCompanyId}
        onSuccess={(newAssetId) => {
          if (newAssetId) {
            loadAssets(selectedCompanyId);
            setFormData({ ...formData, asset_id: newAssetId });
            toast({
              title: "Ativo cadastrado!",
              description: "O ativo foi selecionado automaticamente no chamado",
            });
          }
          setShowAssetDialog(false);
        }}
      />
    </div>
  );
}
