import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Plus, Building2 } from 'lucide-react';
import { CompanyList } from '@/components/companies/CompanyList';
import { CompanyDialog } from '@/components/companies/CompanyDialog';
import { PageHeader } from '@/components/layout/PageHeader';

export default function Companies() {
  const navigate = useNavigate();
  const { profile, isAdmin, loading } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Técnico de campo não edita mais dado de empresa (José pediu 05/08/2026,
  // ao contratar o Mike) — RLS já bloqueia insert/update pra 'tecnico', e a
  // tela inteira agora é admin-only pra não oferecer botão que vai falhar.
  const canAccess = profile?.roles?.includes('admin_provedor');
  const canCreate = canAccess;
  const canEdit = canAccess;
  const canDelete = profile?.roles?.includes('admin_provedor');

  useEffect(() => {
    if (!loading) {
      if (!profile) navigate('/auth');
      else if (!canAccess) navigate('/dashboard');
    }
  }, [profile, navigate, loading, canAccess]);

  const handleEdit = (company: any) => {
    if (!canEdit) return;
    setEditingCompany(company);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingCompany(null);
  };

  const handleSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (loading || !profile || !canAccess) return null;

  return (
    <div className="bg-background min-h-screen">
      <PageHeader
        icon={Building2}
        title="Empresas"
        subtitle="Gerencie empresas atendidas"
        actions={
          canCreate ? (
            <Button
              onClick={() => setDialogOpen(true)}
              size="sm"
              className="h-8 text-xs gap-1 bg-white/10 hover:bg-white/20 text-white border-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nova Empresa</span>
            </Button>
          ) : undefined
        }
      />

      <main className="container mx-auto px-4 py-4">
        <CompanyList onEdit={handleEdit} refreshTrigger={refreshTrigger} canDelete={canDelete} />
      </main>

      <CompanyDialog
        open={dialogOpen}
        onOpenChange={handleClose}
        company={editingCompany}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
