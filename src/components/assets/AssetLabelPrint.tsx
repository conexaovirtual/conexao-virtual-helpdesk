import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { buildAssetQrData } from '@/lib/assetQrCode';

interface AssetLabelPrintProps {
  assets: Array<{
    id: string;
    nome: string;
    tag_patrimonial?: string | null;
    local?: string | null;
    company?: { nome_fantasia?: string; logo_url?: string | null } | null;
  }>;
  onClose: () => void;
}

const CANVAS_SIZE = 591; // 50mm at 300dpi

export function AssetLabelPrint({ assets, onClose }: AssetLabelPrintProps) {
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const generateQRCodes = async () => {
      const codes: Record<string, string> = {};
      for (const asset of assets) {
        const url = buildAssetQrData(asset);
        codes[asset.id] = await QRCode.toDataURL(url, {
          width: 400,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        });
      }
      setQrCodes(codes);
    };
    generateQRCodes();
  }, [assets]);

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  };

  const handleExportPNG = async (asset: typeof assets[0]) => {
    const qr = qrCodes[asset.id];
    if (!qr) return;

    setExporting(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext('2d')!;

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      let yPos = 20;

      // Logo
      const logoSrc = asset.company?.logo_url || '/logo-conexaovirtual.png';
      try {
        const logoImg = await loadImage(logoSrc);
        const maxLogoW = 200;
        const maxLogoH = 70;
        const ratio = Math.min(maxLogoW / logoImg.width, maxLogoH / logoImg.height);
        const logoW = logoImg.width * ratio;
        const logoH = logoImg.height * ratio;
        ctx.drawImage(logoImg, (CANVAS_SIZE - logoW) / 2, yPos, logoW, logoH);
        yPos += logoH + 15;
      } catch {
        // Fallback: try default logo
        try {
          const fallback = await loadImage('/logo-conexaovirtual.png');
          const ratio = Math.min(200 / fallback.width, 70 / fallback.height);
          const w = fallback.width * ratio;
          const h = fallback.height * ratio;
          ctx.drawImage(fallback, (CANVAS_SIZE - w) / 2, yPos, w, h);
          yPos += h + 15;
        } catch {
          yPos += 30;
        }
      }

      // Asset name
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 28px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      const name = asset.nome;
      if (ctx.measureText(name).width > CANVAS_SIZE - 40) {
        ctx.font = 'bold 22px Arial, Helvetica, sans-serif';
      }
      // Wrap text if needed
      const words = name.split(' ');
      let line = '';
      const lines: string[] = [];
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > CANVAS_SIZE - 40) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);

      for (const l of lines.slice(0, 2)) {
        ctx.fillText(l, CANVAS_SIZE / 2, yPos + 28);
        yPos += 32;
      }
      yPos += 5;

      // Location
      if (asset.local) {
        ctx.font = '20px Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#555555';
        ctx.fillText(asset.local, CANVAS_SIZE / 2, yPos + 20);
        yPos += 30;
      }

      // QR Code
      try {
        const qrImg = await loadImage(qr);
        const qrSize = 280;
        const qrX = (CANVAS_SIZE - qrSize) / 2;
        const qrY = Math.max(yPos + 5, (CANVAS_SIZE - qrSize) / 2 + 20);
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
        yPos = qrY + qrSize + 10;
      } catch {
        // QR failed
      }

      // Footer
      ctx.font = '16px Arial, Helvetica, sans-serif';
      ctx.fillStyle = '#666666';
      ctx.fillText('Escaneie para suporte via WhatsApp', CANVAS_SIZE / 2, Math.min(yPos + 16, CANVAS_SIZE - 10));

      // Export
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const fileName = asset.tag_patrimonial
          ? `etiqueta-${asset.tag_patrimonial}.png`
          : `etiqueta-${asset.id.slice(0, 8)}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: `Etiqueta - ${asset.nome}` });
          } catch (e) {
            // User cancelled share - ignore
          }
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.download = fileName;
          a.href = url;
          a.click();
          URL.revokeObjectURL(url);
        }
        setExporting(false);
      }, 'image/png');
    } catch {
      setExporting(false);
    }
  };

  const handleExportAllPNG = async () => {
    setExporting(true);
    for (const asset of assets) {
      await handleExportPNG(asset);
      // Small delay between downloads
      await new Promise(r => setTimeout(r, 300));
    }
    setExporting(false);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const labelsHtml = assets.map(asset => {
      const logoUrl = asset.company?.logo_url || '/logo-conexaovirtual.png';
      const qr = qrCodes[asset.id] || '';
      return `
        <div class="label">
          <img src="${logoUrl}" class="logo" alt="Logo" onerror="this.src='/logo-conexaovirtual.png'" />
          <div class="asset-name">${asset.nome}</div>
          ${asset.local ? `<div class="asset-local">${asset.local}</div>` : ''}
          ${qr ? `<img src="${qr}" class="qr" alt="QR Code" />` : ''}
          <div class="footer">Escaneie para suporte via WhatsApp</div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etiquetas de Ativos</title>
        <style>
          @page {
            size: 50mm 50mm;
            margin: 2mm;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .label {
            width: 46mm;
            height: 46mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            padding: 1.5mm;
            page-break-after: always;
            overflow: hidden;
          }
          .label:last-child {
            page-break-after: auto;
          }
          .logo {
            max-width: 20mm;
            max-height: 7mm;
            object-fit: contain;
          }
          .asset-name {
            font-size: 7pt;
            font-weight: 700;
            text-align: center;
            line-height: 1.1;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
          .asset-local {
            font-size: 6pt;
            color: #555;
            text-align: center;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .qr {
            width: 22mm;
            height: 22mm;
          }
          .footer {
            font-size: 4.5pt;
            color: #666;
            text-align: center;
          }
        </style>
      </head>
      <body>${labelsHtml}</body>
      </html>
    `);

    printWindow.document.close();
    
    const images = printWindow.document.querySelectorAll('img');
    let loaded = 0;
    const totalImages = images.length;
    
    if (totalImages === 0) {
      printWindow.print();
      return;
    }
    
    images.forEach(img => {
      img.onload = img.onerror = () => {
        loaded++;
        if (loaded >= totalImages) {
          setTimeout(() => printWindow.print(), 200);
        }
      };
      if (img.complete) {
        loaded++;
        if (loaded >= totalImages) {
          setTimeout(() => printWindow.print(), 200);
        }
      }
    });
  };

  const allReady = Object.keys(qrCodes).length === assets.length;

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div ref={printRef} className="flex flex-wrap gap-4 justify-center">
        {assets.map(asset => (
          <div
            key={asset.id}
            className="w-[188px] h-[188px] border rounded-lg flex flex-col items-center justify-between p-2 bg-white text-black"
          >
            <img
              src={asset.company?.logo_url || '/logo-conexaovirtual.png'}
              alt="Logo"
              className="max-w-[75px] max-h-[26px] object-contain"
              onError={(e) => { (e.target as HTMLImageElement).src = '/logo-conexaovirtual.png'; }}
            />
            <div className="text-[9px] font-bold text-center leading-tight line-clamp-2">
              {asset.nome}
            </div>
            {asset.local && (
              <div className="text-[7px] text-gray-500 text-center truncate max-w-full">
                {asset.local}
              </div>
            )}
            {qrCodes[asset.id] && (
              <img src={qrCodes[asset.id]} alt="QR" className="w-[83px] h-[83px]" />
            )}
            <div className="text-[5px] text-gray-400 text-center">
              Escaneie para suporte via WhatsApp
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 flex-wrap">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
        >
          Fechar
        </button>
        <button
          onClick={handleExportAllPNG}
          disabled={!allReady || exporting}
          className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 disabled:opacity-50"
        >
          {exporting ? '⏳ Exportando...' : '📲 Salvar para Niimbot'}
        </button>
        <button
          onClick={handlePrint}
          disabled={!allReady}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          🖨️ Imprimir Etiquetas
        </button>
      </div>
    </div>
  );
}
