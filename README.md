# Conexão Virtual — Help Desk TI

Sistema de Help Desk com QR Code, gestão de ativos, contratos, ordens de serviço e
atendimento via WhatsApp. **Produção:** https://conexaovirtual.cloud

## Tecnologias

- Vite + React + TypeScript
- shadcn-ui + Tailwind CSS
- Supabase (banco, auth e edge functions)

## Desenvolvimento local

Requer Node.js e npm.

```sh
# 1. Instalar dependências
npm i

# 2. Subir o servidor de desenvolvimento (preview instantâneo + auto-reload)
npm run dev
```

## Build

```sh
npm run build      # gera a pasta dist/
npm run preview    # serve o build localmente para conferência
```

## Deploy (VPS)

O deploy do frontend é feito pelo script [`deploy.sh`](./deploy.sh), que faz o build
e envia a pasta `dist/` para a VPS via `scp`:

```sh
./deploy.sh
```

Publica em https://conexaovirtual.cloud.

## Backend (Supabase)

As edge functions ficam em [`supabase/functions/`](./supabase/functions) e as
migrations em [`supabase/migrations/`](./supabase/migrations).
