import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle, QrCode, Wrench, Building2, Tag } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function PublicTicket() {
  const [searchParams] = useSearchParams();
  const assetId = searchParams.get("asset");
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [asset, setAsset] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [createdTicket, setCreatedTicket] = useState<any>(null);
  const [formData, setFormData] = useState({ nome: "", contato: "", descricao: "" });

  useEffect(() => {
    if (!assetId || !token) {
      toast({
        title: "Link inválido",
        description: "Este link de abertura de chamado não é válido.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    loadAssetData();
  }, [assetId, token]);

  const loadAssetData = async () => {
    try {
      setLoading(true);
      const { data: assetData, error } = await supabase
        .from("assets")
        .select("*, companies(*)")
        .eq("id", assetId!)
        .eq("qrcode_token", token!)
        .single();

      if (error || !assetData) {
        toast({
          title: "QR Code inválido",
          description: "Este QR Code não é válido ou expirou.",
          variant: "destructive",
        });
        return;
      }
      setAsset(assetData);
      setCompany(assetData.companies);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.contato || !formData.descricao) {
      toast({ title: "Campos obrigatórios", description: "Preencha todos os campos.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data: ticket, error } = await supabase
        .from("tickets")
        .insert({
          company_id: company.id,
          asset_id: asset.id,
          titulo: `Chamado via QR Code — ${asset.nome}`,
          descricao: formData.descricao,
          public_request: true,
          solicitante_nome: formData.nome,
          solicitante_contato: formData.contato,
          status: "novo",
          impacto: "medio",
          urgencia: "media",
          canal: "web",
        })
        .select()
        .single();

      if (error) throw error;

      setCreatedTicket(ticket);
      setSuccess(true);

      // Sem notify-ticket-created aqui de propósito: cliente não deve ser
      // avisado por WhatsApp na simples abertura do chamado, só quando um
      // técnico faz atendimento de verdade (decisão José, 28/07/2026).
      await Promise.allSettled([
        supabase.functions.invoke("ai-auto-response", {
          body: { ticket_id: ticket.id, descricao: formData.descricao },
        }),
        supabase.functions.invoke("ai-ticket-triage", {
          body: { ticket_id: ticket.id },
        }),
      ]);
    } catch (err) {
      console.error(err);
      toast({
        title: "Erro",
        description: "Não foi possível criar o chamado. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Verificando QR Code...</p>
        </div>
      </div>
    );
  }

  if (!asset || !company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold">Link inválido</h1>
          <p className="text-sm text-muted-foreground">
            Este QR Code não é válido ou expirou. Solicite um novo código ao suporte técnico.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="relative flex items-center justify-center">
            <div className="h-24 w-24 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center animate-in zoom-in duration-300">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Chamado aberto!</h1>
            <p className="text-sm text-muted-foreground">
              Seu chamado foi registrado com sucesso. Nossa equipe técnica já foi notificada e entrará em contato via{" "}
              <span className="font-medium text-foreground">{formData.contato}</span>.
            </p>
          </div>

          <div className="bg-muted rounded-xl p-4 text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Número do chamado</span>
              <span className="font-mono font-bold text-primary">#{createdTicket?.numero}</span>
            </div>
            <div className="border-t border-border pt-3 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Wrench className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{asset.nome}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{company.nome_fantasia}</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">Você pode fechar esta página agora.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary px-4 py-5 text-primary-foreground">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <QrCode className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">Abertura de Chamado</h1>
            <p className="text-xs text-primary-foreground/70">{company.nome_fantasia}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Equipamento identificado</p>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm leading-tight">{asset.nome}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs capitalize">
                  {asset.tipo}
                </Badge>
                {asset.tag_patrimonial && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Tag className="h-3 w-3" />
                    {asset.tag_patrimonial}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome">
              Seu nome <span className="text-destructive">*</span>
            </Label>
            <Input
              id="nome"
              placeholder="Digite seu nome completo"
              value={formData.nome}
              onChange={(e) => setFormData((p) => ({ ...p, nome: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contato">
              E-mail ou WhatsApp <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contato"
              placeholder="email@empresa.com ou (62) 99999-9999"
              value={formData.contato}
              onChange={(e) => setFormData((p) => ({ ...p, contato: e.target.value }))}
              required
            />
            <p className="text-xs text-muted-foreground">Usaremos este contato para retornar sobre o chamado</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">
              Descreva o problema <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="descricao"
              placeholder="O que está acontecendo? Descreva com o máximo de detalhes possível..."
              value={formData.descricao}
              onChange={(e) => setFormData((p) => ({ ...p, descricao: e.target.value }))}
              rows={5}
              required
            />
          </div>

          <Button type="submit" className="w-full h-11 text-base" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registrando chamado...
              </>
            ) : (
              "Enviar chamado"
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Conexão Virtual Soluções Tecnológicas — Suporte TI
        </p>
      </div>
    </div>
  );
}
