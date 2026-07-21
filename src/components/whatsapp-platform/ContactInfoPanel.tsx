import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Phone, Building2, Ticket, Calendar, Bot, UserRound, X, ExternalLink, UserCheck, Wrench, Loader2
} from "lucide-react";
import { AssignmentSelect } from "./AssignmentSelect";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Conversation } from "./ConversationList";

interface ContactInfoPanelProps {
  conversation: Conversation;
  onClose: () => void;
}

export function ContactInfoPanel({ conversation, onClose }: ContactInfoPanelProps) {
  const navigate = useNavigate();
  const [contact, setContact] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [msgStats, setMsgStats] = useState({ total: 0, ai: 0, agent: 0 });
  const [creating, setCreating] = useState<null | "ticket" | "os">(null);

  const abrirChamado = async () => {
    if (!contact?.company_id) { toast.error("Vincule o contato a uma empresa primeiro."); return; }
    setCreating("ticket");
    try {
      const { data, error } = await supabase.from("tickets").insert({
        company_id: contact.company_id,
        titulo: `WhatsApp — ${conversation.contact_name || conversation.phone_number}`,
        descricao: `Chamado aberto a partir da conversa de WhatsApp (${conversation.phone_number}).`,
        canal: "whatsapp",
        status: "novo",
      }).select("id, numero").single();
      if (error) throw error;
      toast.success(`Chamado #${data.numero} aberto!`);
      navigate(`/tickets/${data.id}`);
    } catch (e: any) {
      toast.error("Erro ao abrir chamado: " + e.message);
    } finally { setCreating(null); }
  };

  const gerarOS = async () => {
    if (!contact?.company_id) { toast.error("Vincule o contato a uma empresa primeiro."); return; }
    setCreating("os");
    try {
      const { data, error } = await supabase.from("service_orders").insert({
        company_id: contact.company_id,
        tipo_servico: "corretivo",
        prioridade: "media",
        status: "agendada",
        descricao_servicos: `Atendimento solicitado via WhatsApp (${conversation.phone_number}).`,
        data_emissao: new Date().toISOString(),
      }).select("id, numero_os").single();
      if (error) throw error;
      toast.success(`OS #${data.numero_os} criada!`);
      navigate("/reports?tab=service-orders");
    } catch (e: any) {
      toast.error("Erro ao gerar OS: " + e.message);
    } finally { setCreating(null); }
  };

  useEffect(() => {
    const load = async () => {
      // Find contact
      const { data: contactData } = await supabase
        .from("whatsapp_contacts")
        .select("*, companies:company_id(id, nome_fantasia, telefone, email, tipo_contrato)")
        .eq("phone_number", conversation.phone_number)
        .maybeSingle();

      if (contactData) {
        setContact(contactData);
        setCompany(contactData.companies);

        if (contactData.company_id) {
          const { data: ticketData } = await supabase
            .from("tickets")
            .select("id, numero, titulo, status, prioridade, created_at")
            .eq("company_id", contactData.company_id)
            .order("created_at", { ascending: false })
            .limit(5);
          setTickets(ticketData || []);
        }
      }

      // Message stats
      const { data: msgs } = await supabase
        .from("waba_messages")
        .select("sender_type")
        .eq("conversation_id", conversation.id);
      if (msgs) {
        setMsgStats({
          total: msgs.length,
          ai: msgs.filter((m) => m.sender_type === "ai").length,
          agent: msgs.filter((m) => m.sender_type === "agent").length,
        });
      }
    };
    load();
  }, [conversation.id, conversation.phone_number]);

  const statusColor: Record<string, string> = {
    novo: "bg-info text-info-foreground",
    em_atendimento: "bg-warning text-warning-foreground",
    resolvido: "bg-success text-success-foreground",
    fechado: "bg-muted text-muted-foreground",
  };

  return (
    <div className="w-full h-full md:w-80 border-l bg-card flex flex-col shrink-0">
      {/* Header */}
      <div className="h-12 sm:h-14 border-b px-4 flex items-center justify-between shrink-0">
        <span className="font-medium text-sm">Detalhes do Contato</span>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center space-y-2">
            <Avatar className="h-14 w-14 sm:h-16 sm:w-16">
              {conversation.profile_photo_url && (
                <AvatarImage src={conversation.profile_photo_url} alt={conversation.contact_name || conversation.phone_number} />
              )}
              <AvatarFallback className="bg-primary/10 text-primary text-base sm:text-lg font-semibold">
                {(conversation.contact_name || conversation.phone_number).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{conversation.contact_name || "Contato"}</p>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <Phone className="h-3 w-3" /> {conversation.phone_number}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <Badge variant={conversation.ai_enabled ? "default" : "secondary"} className="text-xs gap-1">
                {conversation.ai_enabled ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                {conversation.ai_enabled ? "IA Ativa" : "Manual"}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {conversation.status}
              </Badge>
            </div>
          </div>

          {/* Ações rápidas: abrir chamado / gerar OS a partir do chat */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm" variant="outline" className="h-8 text-xs gap-1"
                disabled={creating !== null || !contact?.company_id}
                onClick={abrirChamado}
              >
                {creating === "ticket" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ticket className="h-3 w-3" />}
                Abrir Chamado
              </Button>
              <Button
                size="sm" variant="outline" className="h-8 text-xs gap-1"
                disabled={creating !== null || !contact?.company_id}
                onClick={gerarOS}
              >
                {creating === "os" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                Gerar OS
              </Button>
            </div>
            {!contact?.company_id && (
              <p className="text-[10px] text-muted-foreground text-center">
                Vincule o contato a uma empresa para abrir chamado/OS
              </p>
            )}
          </div>

          <Separator />

          {/* Assignment */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              Técnico Responsável
            </div>
            <AssignmentSelect
              conversationId={conversation.id}
              currentAssignedTo={conversation.assigned_to}
            />
            <Badge variant="outline" className="text-[10px] capitalize">
              {conversation.queue_status === "waiting" ? "Na fila" : conversation.queue_status === "assigned" ? "Atribuída" : "Resolvida"}
            </Badge>
          </div>

          <Separator />

          {/* Company */}
          {company ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Empresa
              </div>
              <div className="rounded-lg border p-3 space-y-1.5">
                <p className="font-medium text-sm">{company.nome_fantasia}</p>
                {company.email && <p className="text-xs text-muted-foreground">{company.email}</p>}
                {company.telefone && <p className="text-xs text-muted-foreground">{company.telefone}</p>}
                <Badge variant="outline" className="text-[10px] capitalize">
                  {company.tipo_contrato}
                </Badge>
                <Button
                  variant="ghost" size="sm" className="w-full mt-1 h-7 text-xs gap-1"
                  onClick={() => navigate(`/companies/${company.id}`)}
                >
                  <ExternalLink className="h-3 w-3" /> Ver Empresa
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Empresa
              </div>
              <p className="text-xs text-muted-foreground">Contato não vinculado a nenhuma empresa</p>
            </div>
          )}

          <Separator />

          {/* Message Stats */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Estatísticas</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border p-2 text-center">
                <p className="text-lg font-bold">{msgStats.total}</p>
                <p className="text-[10px] text-muted-foreground">Msgs</p>
              </div>
              <div className="rounded-lg border p-2 text-center">
                <p className="text-lg font-bold text-primary">{msgStats.ai}</p>
                <p className="text-[10px] text-muted-foreground">IA</p>
              </div>
              <div className="rounded-lg border p-2 text-center">
                <p className="text-lg font-bold">{msgStats.agent}</p>
                <p className="text-[10px] text-muted-foreground">Técnico</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Recent Tickets */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Ticket className="h-4 w-4 text-muted-foreground" />
              Chamados Recentes
            </div>
            {tickets.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum chamado encontrado</p>
            ) : (
              <div className="space-y-1.5">
                {tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/tickets/${t.id}`)}
                    className="w-full rounded-lg border p-2.5 text-left hover:bg-accent/50 active:bg-accent transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">#{t.numero}</span>
                      <Badge className={`text-[10px] px-1.5 py-0 h-4 ${statusColor[t.status] || ""}`}>
                        {t.status?.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-xs truncate mt-0.5">{t.titulo}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {format(new Date(t.created_at), "dd/MM/yy HH:mm")}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Timeline */}
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Linha do Tempo
            </div>
            <div className="text-xs space-y-1.5 text-muted-foreground">
              <p>Criado em: {format(new Date(conversation.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
              <p>Última msg: {format(new Date(conversation.last_message_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
