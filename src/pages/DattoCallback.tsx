import { useEffect, useState } from 'react';

type CallbackState = 'processing' | 'success' | 'error';

const CALLBACK_RESULT_KEY = 'datto_oauth_result';

export default function DattoCallback() {
  const [state, setState] = useState<CallbackState>('processing');
  const [message, setMessage] = useState('Processando autorização do NexoRMM...');
  const [details, setDetails] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    const code = searchParams.get('code') ?? hashParams.get('code');
    const error = searchParams.get('error') ?? hashParams.get('error');
    const errorDescription = searchParams.get('error_description') ?? hashParams.get('error_description');

    if (error) {
      const payload = {
        type: 'datto-oauth-callback-error',
        error,
        error_description: errorDescription,
        ts: Date.now(),
      };

      localStorage.setItem(CALLBACK_RESULT_KEY, JSON.stringify(payload));
      window.opener?.postMessage(payload, '*');
      setState('error');
      setMessage('A autorização foi recusada ou falhou no NexoRMM.');
      setDetails(errorDescription || error);
      return;
    }

    if (code) {
      const payload = { type: 'datto-oauth-callback', code, ts: Date.now() };
      localStorage.setItem(CALLBACK_RESULT_KEY, JSON.stringify(payload));
      window.opener?.postMessage(payload, '*');
      setState('success');
      setMessage('Autorização concluída! Fechando esta janela...');
      window.setTimeout(() => window.close(), 300);
      return;
    }

    setState('error');
    setMessage('Não foi possível concluir a autorização do NexoRMM.');
    setDetails('O retorno não trouxe código de autorização.');
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-4">
        {state === 'processing' && (
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
        )}
        <p className="text-muted-foreground">{message}</p>
        {details && <p className="text-xs text-muted-foreground">Detalhe: {details}</p>}
        <p className="text-xs text-muted-foreground">
          {state === 'error' ? 'Você já pode fechar esta janela.' : 'Esta janela será fechada automaticamente.'}
        </p>
      </div>
    </div>
  );
}
