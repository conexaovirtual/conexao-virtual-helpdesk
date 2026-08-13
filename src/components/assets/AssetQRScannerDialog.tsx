import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QrCode, CameraOff } from "lucide-react";

interface AssetQRScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (assetId: string) => void;
}

const SCANNER_ELEMENT_ID = "asset-qr-scanner-region";

// scanner.stop() e scanner.clear() da lib html5-qrcode podem lançar exceção
// SÍNCRONA (throw de string, não Promise rejeitada) se chamados no estado
// errado (ex.: stop() quando já parado, clear() enquanto ainda escaneando).
// Chamador nunca deve invocar stop()/clear() direto — sempre por aqui, que
// blinda os dois casos (sync throw e async reject) e sempre devolve uma
// Promise resolvida, pra nunca derrubar o componente que chama.
async function safeStopAndClear(scanner: Html5Qrcode | null): Promise<void> {
  if (!scanner) return;
  try {
    await scanner.stop();
  } catch {
    // já parado, ou nunca chegou a iniciar — sem problema, segue pro clear.
  }
  try {
    scanner.clear();
  } catch {
    // idem — se não der pra limpar (já desmontado, etc.), não é fatal.
  }
}

// A etiqueta impressa (buildAssetQrData, src/lib/assetQrCode.ts) grava um
// link wa.me com o texto "[ASSET:<uuid>] Suporte: <nome>..." — mesmo padrão
// já lido pela Miya em waba-ai-agent (regex idêntica). Aqui só extraímos o
// UUID pra pré-preencher empresa+ativo na tela de OS/atendimento, sem abrir
// WhatsApp nenhum.
function extractAssetId(rawText: string): string | null {
  let decoded = rawText;
  try {
    const url = new URL(rawText);
    const textParam = url.searchParams.get("text");
    if (textParam) decoded = textParam;
    // Compat com etiquetas antigas impressas antes da unificação
    // (05/08/2026), que apontavam pra /public/ticket?asset=<uuid>&token=...
    // em vez do formato wa.me atual.
    const assetParam = url.searchParams.get("asset");
    if (assetParam && /^[a-f0-9-]{36}$/i.test(assetParam)) return assetParam;
  } catch {
    // não é uma URL — tenta casar direto no texto cru
  }
  const match = decoded.match(/\[ASSET:([a-f0-9-]{36})\]/i);
  return match ? match[1] : null;
}

export function AssetQRScannerDialog({ open, onOpenChange, onScan }: AssetQRScannerDialogProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStarting(true);
    let stopped = false;
    let scanner: Html5Qrcode | null = null;

    // O Dialog (Radix, com Portal + animação de entrada) pode ainda não ter
    // commitado a <div id=SCANNER_ELEMENT_ID> no DOM no exato instante em
    // que este efeito roda — e o construtor do Html5Qrcode faz
    // document.getElementById(...) e lança uma exceção SÍNCRONA (não uma
    // Promise) se não achar o elemento. Sem essa espera, isso derrubava o
    // efeito inteiro antes mesmo de chegar no .start(): a câmera nunca
    // abria e nenhum erro aparecia pro usuário (falha silenciosa — era
    // exatamente esse o bug reportado). Tenta por até ~1s, checando o DOM
    // a cada frame antes de desistir.
    const tryStart = (attempt = 0) => {
      if (stopped) return;
      if (!document.getElementById(SCANNER_ELEMENT_ID)) {
        if (attempt > 30) {
          setStarting(false);
          setError("Não consegui preparar a câmera. Feche e tenta abrir o scanner de novo.");
          return;
        }
        requestAnimationFrame(() => tryStart(attempt + 1));
        return;
      }

      try {
        scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
        scannerRef.current = scanner;
        scanner
          .start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
              const assetId = extractAssetId(decodedText);
              if (assetId) {
                if (!stopped) {
                  stopped = true;
                  safeStopAndClear(scanner).finally(() => {
                    onScan(assetId);
                    onOpenChange(false);
                  });
                }
              } else {
                setError("QR code lido, mas não é uma etiqueta de ativo reconhecida. Tenta de novo.");
              }
            },
            () => {
              // erro de leitura de frame — normal, ignora (acontece a cada frame sem QR visível)
            }
          )
          .then(() => setStarting(false))
          .catch((err) => {
            console.error("Failed to start QR scanner:", err);
            setStarting(false);
            setError("Não foi possível acessar a câmera. Verifique se você deu permissão de câmera pro navegador.");
          });
      } catch (err) {
        console.error("Failed to construct QR scanner:", err);
        setStarting(false);
        setError("Não foi possível preparar o leitor de QR code neste navegador.");
      }
    };

    tryStart();

    return () => {
      // Se o próprio scan de sucesso já chamou stop/clear (stopped=true),
      // NÃO chama de novo aqui: scanner.stop() lança uma exceção SÍNCRONA
      // (nem é Promise rejeitada, é um `throw` de string) se chamado quando
      // já não está escaneando — isso derrubava a árvore inteira do React
      // (tela em branco) porque acontecia dentro do cleanup do efeito, fora
      // de qualquer try/catch que pudesse segurar. Era exatamente o bug
      // reportado depois de uma leitura com sucesso.
      if (!stopped) {
        stopped = true;
        safeStopAndClear(scanner);
      }
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" /> Escanear QR Code do ativo
          </DialogTitle>
          <DialogDescription>
            Aponte a câmera pra etiqueta colada na máquina.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <CameraOff className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div
          id={SCANNER_ELEMENT_ID}
          className="w-full aspect-square rounded-md overflow-hidden bg-muted"
        />
        {starting && !error && (
          <p className="text-sm text-muted-foreground text-center">Iniciando câmera...</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
