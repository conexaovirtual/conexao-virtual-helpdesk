// Formato ÚNICO de QR code de ativo, usado tanto pelo cliente (abre WhatsApp
// direto com a Miya, que já identifica o equipamento pelo contexto) quanto
// pelo técnico em campo (o scanner interno em AssetQRScannerDialog.tsx lê o
// mesmo formato pra pré-preencher empresa+ativo). Antes existiam DOIS
// formatos diferentes (um QR abria um formulário web, outro abria WhatsApp)
// e isso confundia quem ia escanear — José pediu unificar (05/08/2026).
const WHATSAPP_NUMBER = "5562984515801";

export function buildAssetQrData(asset: { id: string; nome: string; local?: string | null }): string {
  const message = `[ASSET:${asset.id}] Suporte: ${asset.nome}${asset.local ? ` - ${asset.local}` : ""}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
