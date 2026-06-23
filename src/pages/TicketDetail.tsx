import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Clock, User, Package, AlertCircle, PlayCircle, Calendar as CalendarIcon, Loader2, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TicketTimeline } from '@/components/tickets/TicketTimeline';
import { TicketComments } from '@/components/tickets/TicketComments';
import { TicketStatusUpdate } from '@/components/tickets/TicketStatusUpdate';
import { TicketAssignment } from '@/components/tickets/TicketAssignment';
import { ServiceOrderDialog } from '@/components/service-orders/ServiceOrderDialog';
import { FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { AITriageCard } from '@/components/ai/AITriageCard';
import { AIDiagnosticButton } from '@/components/ai/AIDiagnosticButton';
import { OrcamentoBomControle } from '@/components/service-orders/OrcamentoBomControle';

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isServiceOrderDialogOpen, setIsServiceOrderDialogOpen] = useState(false);
  const [isOrcamentoOpen, setIsOrcamentoOpen] = useState(false);
  
  // States for service actions
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [actionType, setActionType] = useState<'immediate' | 'schedule'>('immediate');
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date());
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [channel, setChannel] = useState<'whatsapp' | 'ligacao' | 'visita_tecnica' | 'acesso_remoto'>('visita_tecnica');
  const [creatingService, setCreatingService] = useState(false);

  useEffect(() => {
    loadTicket();
    loadTechnicians();
  }, [id]);

  const loadTechnicians = async () => {
    // First get user_roles for techs/admins
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin_provedor', 'tecnico']);

    if (roles && roles.length > 0) {
      const userIds = roles.map(r => r.user_id);
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nome')
        .in('id', userIds)
        .order('nome');

      if (profiles) {
        setTechnicians(profiles);
      }
    }
  };

  const loadTicket = async () => {
    if (!id) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('tickets')
      .select(`
        *,
        companies:company_id(id, nome_fantasia, cnpj, whatsapp, telefone, bomcontrole_cliente_id),
        categories:category_id(nome, cor),
        subcategories:subcategory_id(nome),
        assets:asset_id(tipo, tag_patrimonial, numero_serie, fabricante, modelo),
        solicitante:solicitante_id(nome, telefone),
        tecnico:tecnico_id(nome)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Erro ao carregar chamado:', error);
      // Fallback: query simplificada
      const { data: basic } = await supabase
        .from('tickets')
        .select('*, companies:company_id(nome_fantasia)')
        .eq('id', id)
        .single();
      if (basic) setTicket(basic);
    } else if (data) {
      setTicket(data);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <Skeleton className="h-8 w-48" />
          </div>
        </header>
        <main className="container mx-auto px-4 py-6 max-w-5xl">
          <Skeleton className="h-96 w-full" />
        </main>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Chamado não encontrado</p>
          <Button onClick={() => navigate('/tickets')}>Voltar para Chamados</Button>
        </div>
      </div>
    );
  }

  const canManage = profile?.roles?.some(r => ['admin_provedor', 'tecnico', 'gestor_cliente'].includes(r)) || false;
  const canViewFinancials = profile?.roles?.some(r => ['admin_provedor', 'gestor_cliente'].includes(r)) || false;
  const canOpenService = canManage && ['novo', 'triagem'].includes(ticket?.status);

  const handleOpenActionDialog = (type: 'immediate' | 'schedule') => {
    setActionType(type);
    setSelectedTechnician(user?.id || '');
    setShowActionDialog(true);
  };

  const handleCreateImmediateService = async () => {
    if (!selectedTechnician) {
      toast.error('Selecione um técnico');
      return;
    }

    setCreatingService(true);
    try {
      const { data: dailyRecord, error } = await supabase
        .from('daily_service_records')
        .insert({
          company_id: ticket.company_id,
          tecnico_id: selectedTechnician,
          ticket_id: ticket.id,
          asset_id: ticket.asset_id,
          data_atendimento: format(new Date(), 'yyyy-MM-dd'),
          hora_inicio: format(new Date(), 'HH:mm'),
          canal: channel,
          titulo: ticket.titulo,
          descricao: ticket.descricao,
          status: 'em_andamento',
        })
        .select()
        .single();

      if (error) throw error;

      // Update ticket status and technician
      await supabase
        .from('tickets')
        .update({ 
          status: 'em_atendimento',
          tecnico_id: selectedTechnician 
        })
        .eq('id', ticket.id);

      toast.success('Atendimento criado com sucesso!');
      setShowActionDialog(false);
      navigate(`/daily-services?recordId=${dailyRecord.id}`);
    } catch (error) {
      console.error('Erro ao criar atendimento:', error);
      toast.error('Erro ao criar atendimento');
    } finally {
      setCreatingService(false);
    }
  };

  const handleCreateScheduledService = async () => {
    if (!selectedTechnician) {
      toast.error('Selecione um técnico');
      return;
    }

    setCreatingService(true);
    try {
      const { data: maxOS } = await supabase
        .from('service_orders')
        .select('numero_os')
        .order('numero_os', { ascending: false })
        .limit(1)
        .single();

      const numeroOS = (maxOS?.numero_os || 0) + 1;

      const { error } = await supabase
        .from('service_orders')
        .insert({
          company_id: ticket.company_id,
          asset_id: ticket.asset_id,
          ticket_id: ticket.id,
          tecnico_id: selectedTechnician,
          numero_os: numeroOS,
          tipo_servico: 'corretivo',
          prioridade: ticket.prioridade === 'critica' ? 'urgente' : 'media',
          descricao_servicos: ticket.descricao,
          data_agendada: format(scheduledDate, 'yyyy-MM-dd'),
          hora_agendada: scheduledTime,
          status: 'agendada',
        });

      if (error) throw error;

      // Update ticket status and technician
      await supabase
        .from('tickets')
        .update({ 
          status: 'em_atendimento',
          tecnico_id: selectedTechnician 
        })
        .eq('id', ticket.id);

      toast.success('Ordem de serviço criada com sucesso!');
      setShowActionDialog(false);
      navigate('/service-orders');
    } catch (error) {
      console.error('Erro ao criar ordem de serviço:', error);
      toast.error('Erro ao criar ordem de serviço');
    } finally {
      setCreatingService(false);
    }
  };

  const getSLAStatus = () => {
    if (!ticket.sla_solucao_limite) return null;
    
    const now = new Date();
    const limite = new Date(ticket.sla_solucao_limite);
    const diff = limite.getTime() - now.getTime();
    const hoursLeft = diff / (1000 * 60 * 60);

    if (diff < 0) return { color: 'destructive', text: 'SLA violado', hours: Math.abs(hoursLeft) };
    if (hoursLeft < 2) return { color: 'warning', text: 'SLA em risco', hours: hoursLeft };
    return { color: 'success', text: 'SLA em dia', hours: hoursLeft };
  };

  const slaStatus = getSLAStatus();

  return (
    <>
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <Button variant="ghost" onClick={() => navigate('/tickets')} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg font-mono text-muted-foreground">#{ticket.numero}</span>
                  <Badge variant={ticket.status as any}>{ticket.status.replace(/_/g, ' ')}</Badge>
                  <Badge variant={ticket.prioridade as any}>{ticket.prioridade}</Badge>
                  {ticket.public_request && (
                    <Badge variant="outline" className="text-xs">Via QR Code</Badge>
                  )}
                </div>
                <h1 className="text-2xl font-bold">{ticket.titulo}</h1>
              </div>
              {slaStatus && (
                <Badge variant={slaStatus.color as any} className="text-sm">
                  <Clock className="h-4 w-4 mr-1" />
                  {slaStatus.text} ({Math.round(slaStatus.hours)}h)
                </Badge>
              )}
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Descrição</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{ticket.descricao}</p>
                </CardContent>
              </Card>

              {ticket.solucao && (
                <Card>
                  <CardHeader>
                    <CardTitle>Solução</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{ticket.solucao}</p>
                  </CardContent>
                </Card>
              )}

              <TicketTimeline ticketId={ticket.id} />
              <TicketComments ticketId={ticket.id} />
            </div>

            <div className="space-y-4">
              {/* AI Triage Card for new tickets */}
              {canManage && ['novo', 'triagem'].includes(ticket?.status) && (
                <AITriageCard ticket={ticket} onApplySuggestion={loadTicket} />
              )}

              {/* AI Diagnostic Button for tickets in progress */}
              {canManage && ticket?.status === 'em_atendimento' && (
                <AIDiagnosticButton 
                  contexto={{
                    ticket_id: ticket.id,
                    asset_id: ticket.asset_id,
                    descricao_problema: ticket.descricao
                  }}
                  variant="outline"
                  className="w-full"
                />
              )}

              {canManage && (
                <>
                  {/* Card para abrir atendimento ou OS quando ticket está novo/triagem */}
                  {canOpenService && (
                    <Card className="border-primary/50">
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <PlayCircle className="h-5 w-5 text-primary" />
                          Iniciar Atendimento
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-sm text-muted-foreground mb-3">
                          Escolha como deseja atender este chamado:
                        </p>
                        <Button 
                          onClick={() => handleOpenActionDialog('immediate')}
                          className="w-full"
                          variant="default"
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Atender Agora
                        </Button>
                        <Button 
                          onClick={() => handleOpenActionDialog('schedule')}
                          className="w-full"
                          variant="outline"
                        >
                          <CalendarIcon className="h-4 w-4 mr-2" />
                          Agendar Atendimento
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  <TicketStatusUpdate ticket={ticket} onUpdate={loadTicket} />
                  <TicketAssignment ticket={ticket} onUpdate={loadTicket} />
                  
                  {(ticket.status === 'resolvido' || ticket.status === 'fechado') && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Ordem de Serviço</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Button
                          onClick={() => setIsServiceOrderDialogOpen(true)}
                          className="w-full"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Gerar OS
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {ticket.status !== 'cancelado' && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Orçamento</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Button
                          onClick={() => setIsOrcamentoOpen(true)}
                          className="w-full"
                          variant={ticket.bomcontrole_orcamento_id ? "outline" : "default"}
                        >
                          <Receipt className="h-4 w-4 mr-2" />
                          {ticket.bomcontrole_orcamento_id
                            ? `Orçamento #${ticket.bomcontrole_orcamento_id}`
                            : 'Gerar Orçamento'}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Informações</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-muted-foreground">Solicitante</p>
                      <p className="font-medium">{ticket.solicitante?.nome || ticket.solicitante_nome || 'N/A'}</p>
                      {(ticket.solicitante?.telefone || ticket.solicitante_contato) && (
                        <p className="text-xs text-muted-foreground">{ticket.solicitante?.telefone || ticket.solicitante_contato}</p>
                      )}
                    </div>
                  </div>

                  {ticket.tecnico && (
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-muted-foreground">Técnico</p>
                        <p className="font-medium">{ticket.tecnico.nome}</p>
                      </div>
                    </div>
                  )}

                  {ticket.categories && (
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-muted-foreground">Categoria</p>
                        <p className="font-medium">{ticket.categories.nome}</p>
                        {ticket.subcategories && (
                          <p className="text-xs text-muted-foreground">{ticket.subcategories.nome}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {ticket.assets && (
                    <div className="flex items-start gap-2">
                      <Package className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-muted-foreground">Ativo</p>
                        <p className="font-medium">{ticket.assets.tipo}</p>
                        <p className="text-xs text-muted-foreground">
                          {ticket.assets.fabricante} {ticket.assets.modelo}
                        </p>
                        <p className="text-xs font-mono">{ticket.assets.tag_patrimonial || ticket.assets.numero_serie}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-muted-foreground">Criado em</p>
                      <p className="font-medium">
                        {format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Impacto</p>
                        <p className="font-medium capitalize">{ticket.impacto}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Urgência</p>
                        <p className="font-medium capitalize">{ticket.urgencia}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Canal</p>
                        <p className="font-medium capitalize">{ticket.canal}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>

        <ServiceOrderDialog
          open={isServiceOrderDialogOpen}
          onOpenChange={setIsServiceOrderDialogOpen}
          ticket={ticket}
          onSuccess={loadTicket}
        />

        <OrcamentoBomControle
          open={isOrcamentoOpen}
          onOpenChange={setIsOrcamentoOpen}
          ticketId={ticket.id}
          serviceOrder={{
            numero_os: ticket.numero,
            companies: ticket.companies,
            bomcontrole_orcamento_id: ticket.bomcontrole_orcamento_id,
            bomcontrole_orcamento_url: ticket.bomcontrole_orcamento_url,
            bomcontrole_orcamento_status: ticket.bomcontrole_orcamento_status,
          }}
          onSuccess={loadTicket}
        />
      </div>

      {/* Dialog para criar atendimento ou OS */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'immediate' ? 'Abrir Atendimento' : 'Agendar Ordem de Serviço'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'immediate' 
                ? 'Crie um atendimento imediato para este chamado'
                : 'Agende uma ordem de serviço para este chamado'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Técnico Responsável</Label>
              <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o técnico" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {actionType === 'immediate' && (
              <div className="space-y-2">
                <Label>Canal de Atendimento</Label>
                <Select value={channel} onValueChange={(v: any) => setChannel(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visita_tecnica">Visita Técnica</SelectItem>
                    <SelectItem value="acesso_remoto">Acesso Remoto (DATTO)</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="ligacao">Ligação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {actionType === 'schedule' && (
              <>
                <div className="space-y-2">
                  <Label>Data do Agendamento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(scheduledDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduledDate}
                        onSelect={(date) => date && setScheduledDate(date)}
                        locale={ptBR}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Horário</Label>
                  <Input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowActionDialog(false)}
              disabled={creatingService}
            >
              Cancelar
            </Button>
            <Button 
              onClick={actionType === 'immediate' ? handleCreateImmediateService : handleCreateScheduledService}
              disabled={creatingService || !selectedTechnician}
            >
              {creatingService && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {actionType === 'immediate' ? 'Iniciar Atendimento' : 'Agendar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
