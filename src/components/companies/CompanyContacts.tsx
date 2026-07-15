import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, User, Phone, Briefcase, MessageSquare } from "lucide-react";

interface Contact {
  id: string;
  nome: string;
  cargo: string | null;
  whatsapp: string | null;
  email: string | null;
}

interface Props {
  companyId: string;
}

const emptyForm = { nome: "", cargo: "", whatsapp: "", email: "" };

export function CompanyContacts({ companyId }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { toast } = useToast();

  useEffect(() => {
    load();
  }, [companyId]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("company_contacts")
      .select("*")
      .eq("company_id", companyId)
      .order("nome");
    if (!error) setContacts(data || []);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({ nome: c.nome, cargo: c.cargo || "", whatsapp: c.whatsapp || "", email: c.email || "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast({ title: "Informe o nome do contato", variant: "destructive" });
      return;
    }

    // Normalizar WhatsApp: só dígitos, garantir 55 no início
    let whatsapp = form.whatsapp.replace(/\D/g, "");
    if (whatsapp && !whatsapp.startsWith("55")) whatsapp = `55${whatsapp}`;

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("company_contacts")
          .update({ nome: form.nome.trim(), cargo: form.cargo || null, whatsapp: whatsapp || null, email: form.email || null, updated_at: new Date().toISOString() })
          .eq("id", editing.id);
        if (error) throw error;

        // Atualizar whatsapp_contacts se o número mudou
        if (whatsapp && editing.whatsapp !== whatsapp) {
          await supabase
            .from("whatsapp_contacts")
            .update({ contact_name: form.nome.trim(), company_id: companyId })
            .eq("phone_number", whatsapp);
        }
      } else {
        const { error } = await supabase
          .from("company_contacts")
          .insert({ company_id: companyId, nome: form.nome.trim(), cargo: form.cargo || null, whatsapp: whatsapp || null, email: form.email || null });
        if (error) throw error;

        // Pré-vincular em whatsapp_contacts se já existe uma conversa com esse número
        if (whatsapp) {
          await supabase
            .from("whatsapp_contacts")
            .upsert({ phone_number: whatsapp, contact_name: form.nome.trim(), company_id: companyId }, { onConflict: "phone_number" });
        }
      }

      toast({ title: editing ? "Contato atualizado!" : "Contato cadastrado!" });
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este contato?")) return;
    const { error } = await supabase.from("company_contacts").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Contato removido" });
      load();
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground p-4">Carregando contatos...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Contatos da Empresa</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pessoas cadastradas aqui são identificadas automaticamente quando entram em contato pelo WhatsApp.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          Novo contato
        </Button>
      </div>

      {contacts.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground text-sm">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>Nenhum contato cadastrado.</p>
          <p className="text-xs mt-1">Cadastre os telefones dos responsáveis para que a IA os identifique automaticamente.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">{c.nome}</span>
                  </div>
                  {c.cargo && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Briefcase className="h-3 w-3 shrink-0" />
                      <span>{c.cargo}</span>
                    </div>
                  )}
                  {c.whatsapp && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{c.whatsapp}</span>
                    </div>
                  )}
                  {c.email && (
                    <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar contato" : "Novo contato"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input placeholder="João Silva" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo / Função</Label>
              <Input placeholder="Responsável de TI, Gerente..." value={form.cargo} onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input placeholder="(62) 99999-9999" value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} />
              <p className="text-xs text-muted-foreground">A IA identificará este número automaticamente.</p>
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" placeholder="joao@empresa.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
