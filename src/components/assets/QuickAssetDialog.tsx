import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, Info } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AssetType = Database["public"]["Enums"]["asset_type"];

const assetTypes: { value: AssetType; label: string }[] = [
  { value: "desktop", label: "Desktop" },
  { value: "notebook", label: "Notebook" },
  { value: "servidor", label: "Servidor" },
  { value: "impressora", label: "Impressora" },
  { value: "monitor", label: "Monitor" },
  { value: "roteador", label: "Roteador" },
  { value: "switch", label: "Switch" },
  { value: "camera", label: "Câmera" },
  { value: "periferico", label: "Periférico" },
  { value: "outro", label: "Outro" },
];

interface QuickAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onSuccess: (assetId: string) => void;
}

export function QuickAssetDialog({ open, onOpenChange, companyId, onSuccess }: QuickAssetDialogProps) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<AssetType>("desktop");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do ativo");
      return;
    }

    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("assets")
        .insert({
          nome: nome.trim(),
          tipo,
          company_id: companyId,
        })
        .select("id")
        .single();

      if (error) throw error;

      toast.success("Ativo cadastrado com sucesso!");
      onSuccess(data.id);
      setNome("");
      setTipo("desktop");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating asset:", error);
      toast.error(error.message || "Erro ao cadastrar ativo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cadastro Rápido de Ativo</DialogTitle>
          <DialogDescription>
            Cadastre um ativo com as informações essenciais
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="asset-name">Nome / Hostname *</Label>
            <Input
              id="asset-name"
              placeholder="Ex: CAIXA-01, RECEPCAO-PC"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as AssetType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assetTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Alert className="border-info/30 bg-info/5">
            <Info className="h-4 w-4 text-info" />
            <AlertDescription className="text-xs">
              Este ativo será criado como <strong>Manual</strong> e não será afetado pela sincronização NexoRMM.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !nome.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
