-- Fase 2 (Departamento Financeiro) da "empresa virtual": contexto inicial
-- pro departamento financeiro, injetado no prompt da Miya mesmo antes de
-- qualquer proposta orgânica (agent_proposals) ser aprovada.
insert into department_knowledge_base (departamento, secao, conteudo)
values (
  'financeiro',
  'politica_pagamento',
  'Cobrança de contrato é feita por boleto mensal, com vencimento no dia registrado no próprio contrato do cliente. Emissão de nota fiscal e cobrança/recebimento em si são geridos fora do helpdesk, pelo BomControle — a Miya nunca informa status de pagamento nem cobra o cliente diretamente. Qualquer pedido de desconto, renegociação de valor ou plano, ou cancelamento de contrato é sempre escalado para o José (diretoria) — a Miya nunca decide ou promete nada financeiro sozinha.'
);
