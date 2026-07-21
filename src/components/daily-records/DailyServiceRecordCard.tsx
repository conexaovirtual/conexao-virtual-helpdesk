import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhotoGallery } from "@/components/ui/PhotoGallery";
import { UploadedImage } from "@/lib/imageUtils";
import { MessageCircle, Phone, MapPin, Clock, Building2, User, Edit, Eye, Camera, FileDown, Monitor, Package } from "lucide-react";
import { formatDateBR } from "@/lib/formatters";
import { exportSingleDailyServiceToPDF } from "@/lib/exportSingleDailyService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DailyServiceRecordCardProps {
  record: any;
  onEdit?: (record: any) => void;
  onView?: (record: any) => void;
}

export function DailyServiceRecordCard({ record, onEdit, onView }: DailyServiceRecordCardProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  
  const handleExportPDF = async () => {
    try {
      const { data, error } = await supabase
        .from('daily_service_records')
        .select(`
          *,
          companies (nome_fantasia, cnpj, endereco, telefone, email),
          profiles (nome, telefone),
          tickets (numero, titulo),
          assets (tag_patrimonial, tipo, nome, fabricante, modelo, numero_serie)
        `)
        .eq('id', record.id)
        .single();
      
      if (error) throw error;
      if (data) {
        await exportSingleDailyServiceToPDF(data as any);
        toast.success("PDF gerado com sucesso!");
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Erro ao gerar PDF");
    }
  };
  
  const getChannelConfig = (canal: string) => {
    switch (canal) {
      case "whatsapp":
        return {
          icon: MessageCircle,
          label: "WhatsApp",
          className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
        };
      case "ligacao":
        return {
          icon: Phone,
          label: "Ligação",
          className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
        };
      case "visita_tecnica":
        return {
          icon: MapPin,
          label: "Visita Técnica",
          className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
        };
      case "acesso_remoto":
        return {
          icon: Monitor,
          label: "Acesso Remoto",
          className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
        };
      default:
        return {
          icon: MessageCircle,
          label: canal,
          className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
        };
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "concluido":
        return { label: "Concluído", className: "bg-green-100 text-green-800" };
      case "em_andamento":
        return { label: "Em Andamento", className: "bg-yellow-100 text-yellow-800" };
      case "pendente":
        return { label: "Pendente", className: "bg-red-100 text-red-800" };
      default:
        return { label: status, className: "bg-gray-100 text-gray-800" };
    }
  };

  const channelConfig = getChannelConfig(record.canal);
  const statusConfig = getStatusConfig(record.status);
  const ChannelIcon = channelConfig.icon;
  
  const photos = (record.fotos as unknown as UploadedImage[]) || [];

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-1">
              <Badge className={channelConfig.className}>
                <ChannelIcon className="h-3 w-3 mr-1" />
                {channelConfig.label}
              </Badge>
              <Badge className={statusConfig.className}>
                {statusConfig.label}
              </Badge>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleExportPDF}
                className="h-8 w-8"
                title="Exportar PDF"
              >
                <FileDown className="h-4 w-4" />
              </Button>
              {onView && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onView(record)}
                  className="h-8 w-8"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(record)}
                  className="h-8 w-8"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-3">
          <div>
            <h3 className="font-semibold text-lg mb-1 break-words">{record.titulo}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 break-words">
              {record.descricao}
            </p>
          </div>

          <div className="space-y-2 text-sm">
            {record.companies && (
              <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">{record.companies.nome_fantasia}</span>
              </div>
            )}

            {record.assets && (
              <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                <Package className="h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">{record.assets.nome} - {record.assets.tipo}{record.assets.tag_patrimonial ? ` (${record.assets.tag_patrimonial})` : ''}</span>
              </div>
            )}
            {record.profiles && (
              <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                <User className="h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">{record.profiles.nome}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <Clock className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">
                {formatDateBR(record.data_atendimento)}
                {" • "}
                {record.hora_inicio}
                {record.hora_fim && ` - ${record.hora_fim}`}
              </span>
            </div>
          </div>

          {photos.length > 0 && (
            <div className="pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setGalleryOpen(true)}
                className="w-full justify-start gap-2 h-auto py-2"
              >
                <Camera className="h-4 w-4" />
                <span className="text-sm">
                  {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
                </span>
              </Button>
            </div>
          )}

          {record.solucao && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                <strong>Solução:</strong> {record.solucao.substring(0, 100)}
                {record.solucao.length > 100 && "..."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      <PhotoGallery
        images={photos}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
      />
    </>
  );
}
