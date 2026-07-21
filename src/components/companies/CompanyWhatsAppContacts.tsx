import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, Plus, Trash2, User, Phone, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface WhatsAppContact {
  id: string;
  phone_number: string;
  contact_name: string | null;
  company_id: string | null;
  last_message_at: string | null;
  created_at: string;
}

interface CompanyWhatsAppContactsProps {
  companyId: string;
}

export function CompanyWhatsAppContacts({ companyId }: CompanyWhatsAppContactsProps) {
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadContacts();
  }, [companyId]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('company_id', companyId)
        .order('contact_name', { ascending: true });

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Erro ao carregar contatos:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPhoneForDisplay = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 13) {
      return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    if (digits.length === 12) {
      return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
    }
    return phone;
  };

  const handleAdd = async () => {
    if (!newPhone.trim()) {
      toast({ title: 'Informe o número de WhatsApp', variant: 'destructive' });
      return;
    }

    const digits = newPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      toast({ title: 'Número inválido', description: 'Informe um número com DDD, ou o ID do grupo', variant: 'destructive' });
      return;
    }

    // IDs de grupo do WhatsApp têm 15+ dígitos e não levam o "55" do Brasil
    // na frente — só normaliza como telefone de verdade quando é curto o
    // suficiente pra ser um número de celular real.
    const phone = digits.length >= 14
      ? digits
      : digits.startsWith('55') && digits.length >= 12
        ? digits
        : `55${digits}`;

    setSaving(true);
    try {
      const { error } = await supabase.from('whatsapp_contacts').upsert(
        {
          phone_number: phone,
          contact_name: newName.trim() || null,
          company_id: companyId,
        },
        { onConflict: 'phone_number' }
      );

      if (error) throw error;

      toast({ title: 'Contato adicionado!' });
      setNewName('');
      setNewPhone('');
      setShowAddDialog(false);
      loadContacts();
    } catch (error: any) {
      console.error('Erro ao adicionar contato:', error);
      toast({ title: 'Erro ao adicionar contato', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from('whatsapp_contacts').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Contato removido' });
      loadContacts();
    } catch (error: any) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Contatos vinculados a esta empresa para identificação automática pela IA no WhatsApp.
        </p>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Contato
        </Button>
      </div>

      {contacts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>Nenhum contato WhatsApp cadastrado</p>
          <p className="text-xs mt-1">
            Contatos são registrados automaticamente quando o cliente abre chamados via QR Code com número de telefone.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-500/10">
                  <MessageSquare className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {contact.contact_name ? (
                      <span className="font-medium text-sm">{contact.contact_name}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">Sem nome</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {formatPhoneForDisplay(contact.phone_number)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {contact.last_message_at && (
                  <Badge variant="outline" className="text-xs">
                    Última msg: {new Date(contact.last_message_at).toLocaleDateString('pt-BR')}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(contact.id)}
                  disabled={deletingId === contact.id}
                >
                  {deletingId === contact.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog de adicionar contato */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Contato WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Contato</Label>
              <Input
                placeholder="Ex: João da Silva"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Número WhatsApp ou ID do grupo *</Label>
              <Input
                placeholder="(11) 99999-9999 ou ID do grupo"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Número com DDD (o código do país 55 é adicionado automaticamente) ou o ID de um grupo do WhatsApp.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
