import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Mail, Phone, MapPin, Clock, Eye, FileText, Calendar, MessageCircle, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface CompanyRowProps {
  company: any;
  onEdit: (company: any) => void;
  onUpdate: () => void;
  canDelete?: boolean;
}

export const CompanyRow = memo(({ company, onEdit, onUpdate, canDelete }: CompanyRowProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data: tickets } = await supabase.from('tickets').select('id').eq('company_id', company.id);
      const ticketIds = tickets?.map(t => t.id) || [];

      if (ticketIds.length > 0) {
        await supabase.from('ticket_comments').delete().in('ticket_id', ticketIds);
        await supabase.from('ticket_attachments').delete().in('ticket_id', ticketIds);
      }

      const { data: assets } = await supabase.from('assets').select('id').eq('company_id', company.id);
      const assetIds = assets?.map(a => a.id) || [];

      if (assetIds.length > 0) {
        await supabase.from('asset_changelog').delete().in('asset_id', assetIds);
        await supabase.from('asset_relationships').delete().in('parent_asset_id', assetIds);
        await supabase.from('asset_relationships').delete().in('child_asset_id', assetIds);
        await supabase.from('ai_predictions').delete().in('asset_id', assetIds);
        await supabase.from('datto_alerts_log').delete().in('asset_id', assetIds);
      }

      const { data: serviceOrders } = await supabase.from('service_orders').select('id').eq('company_id', company.id);
      const soIds = serviceOrders?.map(s => s.id) || [];

      if (soIds.length > 0) {
        await supabase.from('service_order_history').delete().in('service_order_id', soIds);
        await supabase.from('contract_hour_entries').delete().in('service_order_id', soIds);
      }

      const { data: contracts } = await supabase.from('contracts').select('id').eq('company_id', company.id);
      const contractIds = contracts?.map(c => c.id) || [];

      if (contractIds.length > 0) {
        await supabase.from('contract_hour_entries').delete().in('contract_id', contractIds);
      }

      await supabase.from('whatsapp_contacts').delete().eq('company_id', company.id);
      await supabase.from('visit_schedules').delete().eq('company_id', company.id);
      await supabase.from('daily_service_records').delete().eq('company_id', company.id);
      await supabase.from('tickets').delete().eq('company_id', company.id);
      await supabase.from('service_orders').delete().eq('company_id', company.id);
      await supabase.from('assets').delete().eq('company_id', company.id);
      await supabase.from('contracts').delete().eq('company_id', company.id);
      await supabase.from('cost_centers').delete().eq('company_id', company.id);
      await supabase.from('projects').delete().eq('company_id', company.id);

      const { error } = await supabase.from('companies').delete().eq('id', company.id);
      if (error) {
        toast({ title: 'Erro ao excluir empresa', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Empresa excluída com sucesso' });
        onUpdate();
      }
    } catch (err: any) {
      toast({ title: 'Erro ao excluir empresa', description: err.message, variant: 'destructive' });
    }
    setDeleting(false);
    setDeleteOpen(false);
  };

  return (
    <>
      <div
        className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/40 transition-colors cursor-pointer"
        onClick={() => navigate(`/companies/${company.id}`)}
      >
        {/* Nome + razão social */}
        <div className="min-w-0 flex-[1.4]">
          <p className="font-medium text-sm truncate">{company.nome_fantasia}</p>
          {company.razao_social && (
            <p className="text-xs text-muted-foreground truncate">{company.razao_social}</p>
          )}
        </div>

        {/* Badges */}
        <div className="hidden sm:flex flex-col gap-1 items-start w-28 shrink-0">
          <Badge
            variant={company.tipo_contrato === 'contrato_manutencao' ? 'default' : 'outline'}
            className={`text-[10px] px-1.5 py-0 h-5 ${company.tipo_contrato === 'contrato_manutencao' ? 'bg-primary' : ''}`}
          >
            {company.tipo_contrato === 'contrato_manutencao' ? (
              <><Calendar className="h-2.5 w-2.5 mr-1" />Contrato</>
            ) : (
              <><FileText className="h-2.5 w-2.5 mr-1" />Eventual</>
            )}
          </Badge>
          <Badge variant={company.status ? 'secondary' : 'outline'} className="text-[10px] px-1.5 py-0 h-5">
            {company.status ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>

        {/* CNPJ */}
        <div className="hidden md:block text-xs text-muted-foreground w-36 shrink-0 truncate">
          {company.cnpj || '—'}
        </div>

        {/* Contato */}
        <div className="hidden lg:flex flex-col gap-0.5 w-44 shrink-0">
          {company.telefone && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <Phone className="h-3 w-3 shrink-0" />{company.telefone}
            </span>
          )}
          {company.whatsapp && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <MessageCircle className="h-3 w-3 shrink-0" />{company.whatsapp}
            </span>
          )}
          {company.email && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <Mail className="h-3 w-3 shrink-0" />{company.email}
            </span>
          )}
        </div>

        {/* Endereço */}
        <div className="hidden xl:flex items-center gap-1 text-xs text-muted-foreground flex-1 min-w-0">
          {company.endereco && (
            <>
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{company.endereco}</span>
            </>
          )}
        </div>

        {/* SLA */}
        <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground w-24 shrink-0">
          {(company.sla_primeiro_atendimento_horas !== null && company.sla_solucao_horas !== null) && (
            <>
              <Clock className="h-3 w-3 shrink-0" />
              {company.sla_primeiro_atendimento_horas}h/{company.sla_solucao_horas}h
            </>
          )}
        </div>

        {/* Ações */}
        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Detalhes" onClick={() => navigate(`/companies/${company.id}`)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => onEdit(company)}>
            <Edit className="h-3.5 w-3.5" />
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:bg-destructive/10"
              title="Excluir"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{company.nome_fantasia}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
