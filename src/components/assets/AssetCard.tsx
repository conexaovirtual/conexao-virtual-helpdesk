import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QrCode, Edit, Package, Building2, Eye, Download, Printer, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AssetOriginBadge } from './AssetOriginBadge';
import QRCode from 'qrcode';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useState } from 'react';
import { AssetLabelPrint } from './AssetLabelPrint';
import { buildAssetQrData } from '@/lib/assetQrCode';

interface AssetCardProps {
  asset: any;
  onEdit: (asset: any) => void;
  onDelete?: () => void;
}

export function AssetCard({ asset, onEdit, onDelete }: AssetCardProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [showLabelPrint, setShowLabelPrint] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canManage = profile?.roles?.some(r => ['admin_provedor', 'tecnico', 'gestor_cliente'].includes(r)) || false;
  const canDelete = profile?.roles?.includes('admin_provedor') || false;
  const canViewDetails = profile?.roles?.some(r => ['admin_provedor', 'gestor_cliente'].includes(r)) || false;

  const handleViewQR = async () => {
    try {
      // Mesmo formato de QR usado na etiqueta impressa (buildAssetQrData) —
      // José pediu unificar (05/08/2026): só um QR pra cliente E técnico,
      // não mais dois formatos diferentes confundindo quem escaneia.
      const qrData = buildAssetQrData(asset);
      const qrCodeUrl = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
      });
      
      setQrCodeUrl(qrCodeUrl);
      setShowQRModal(true);
    } catch (error) {
      console.error("Error generating QR code:", error);
      toast({
        title: "Erro",
        description: "Não foi possível gerar o QR code",
        variant: "destructive",
      });
    }
  };

  const handleDownloadQR = () => {
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = `qrcode-${asset.tag_patrimonial || asset.id}.png`;
    link.click();
    
    toast({
      title: 'QR Code baixado',
      description: 'O QR Code foi salvo com sucesso',
    });
  };

  const handleDeleteAsset = async () => {
    setDeleting(true);
    try {
      await supabase.from('asset_changelog').delete().eq('asset_id', asset.id);
      await supabase.from('asset_relationships').delete().eq('parent_asset_id', asset.id);
      await supabase.from('asset_relationships').delete().eq('child_asset_id', asset.id);
      await supabase.from('ai_predictions').delete().eq('asset_id', asset.id);
      await supabase.from('datto_alerts_log').delete().eq('asset_id', asset.id);

      const { error } = await supabase.from('assets').delete().eq('id', asset.id);
      if (error) {
        toast({ title: 'Erro ao excluir ativo', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Ativo excluído com sucesso' });
        onDelete?.();
      }
    } catch (err: any) {
      toast({ title: 'Erro ao excluir ativo', description: err.message, variant: 'destructive' });
    }
    setDeleting(false);
    setDeleteOpen(false);
  };

  const estadoLabels: Record<string, string> = {
    em_uso: 'Em Uso',
    estoque: 'Estoque',
    manutencao: 'Manutenção',
    baixado: 'Baixado',
  };

  const companyName = asset.company?.nome_fantasia || 'Sem empresa';

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold mb-1">{asset.nome}</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="capitalize text-xs">
                  {asset.tipo}
                </Badge>
                <AssetOriginBadge asset={asset} size="sm" />
                <span className="text-sm text-muted-foreground">
                  {asset.fabricante} {asset.modelo && `• ${asset.modelo}`}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate">{companyName}</span>
              </div>
            </div>
            <Badge variant={asset.estado === 'em_uso' ? 'success' : 'secondary'}>
              {estadoLabels[asset.estado] || asset.estado}
            </Badge>
          </div>
        </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1 text-sm">
          {asset.tag_patrimonial && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tag:</span>
              <span className="font-mono">{asset.tag_patrimonial}</span>
            </div>
          )}
          {asset.numero_serie && canViewDetails && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Série:</span>
              <span className="font-mono text-xs">{asset.numero_serie}</span>
            </div>
          )}
          {asset.configuracoes?.ip_interno && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">IP Interno:</span>
              <span className="font-mono text-xs">{asset.configuracoes.ip_interno}</span>
            </div>
          )}
          {asset.configuracoes?.ip_externo && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">IP Externo:</span>
              <span className="font-mono text-xs">{asset.configuracoes.ip_externo}</span>
            </div>
          )}
          {asset.configuracoes?.mac_address && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">MAC:</span>
              <span className="font-mono text-xs">{asset.configuracoes.mac_address}</span>
            </div>
          )}
          {asset.local && canViewDetails && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Local:</span>
              <span>{asset.local}</span>
            </div>
          )}
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleViewQR}
            className="flex-1"
          >
            <QrCode className="h-4 w-4 mr-1" />
            QR Code
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLabelPrint(true)}
            title="Imprimir Etiqueta"
          >
            <Printer className="h-4 w-4" />
          </Button>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(asset)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>

    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir ativo</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir <strong>{asset.nome}</strong>? Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteAsset} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
            {deleting ? 'Excluindo...' : 'Excluir'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={showQRModal} onOpenChange={setShowQRModal}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>QR Code do Ativo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-center p-4 bg-white rounded-lg">
            {qrCodeUrl && (
              <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64" />
            )}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo:</span>
              <span className="font-medium">{asset.tipo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fabricante:</span>
              <span className="font-medium">{asset.fabricante || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Modelo:</span>
              <span className="font-medium">{asset.modelo || 'N/A'}</span>
            </div>
            {asset.tag_patrimonial && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tag:</span>
                <span className="font-mono font-medium">{asset.tag_patrimonial}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Empresa:</span>
              <span className="font-medium">{companyName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estado:</span>
              <Badge variant={asset.estado === 'em_uso' ? 'success' : 'secondary'}>
                {estadoLabels[asset.estado] || asset.estado}
              </Badge>
            </div>
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => setShowQRModal(false)} className="flex-1">
            Fechar
          </Button>
          <Button onClick={handleDownloadQR} className="flex-1">
            <Download className="h-4 w-4 mr-2" />
            Baixar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={showLabelPrint} onOpenChange={setShowLabelPrint}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Imprimir Etiqueta 50x50mm</DialogTitle>
        </DialogHeader>
        <AssetLabelPrint
          assets={[asset]}
          onClose={() => setShowLabelPrint(false)}
        />
      </DialogContent>
    </Dialog>
    </>
  );
}
