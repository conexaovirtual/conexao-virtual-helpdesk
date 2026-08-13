-- Fase 4 (Departamento Comercial) da "empresa virtual": contexto inicial
-- pro departamento comercial, injetado no prompt da Miya.
insert into department_knowledge_base (departamento, secao, conteudo)
values (
  'comercial',
  'politica_envio',
  'A Miya nunca envia mensagem comercial (novidade, cross-sell, oferta) diretamente — ela só sugere via propose_commercial_message, e o José revisa destinatário e texto antes de decidir enviar. O envio real só funciona se o cliente tiver mandado mensagem nas últimas 24h (regra da API do WhatsApp: fora dessa janela, só um Message Template aprovado pela Meta funcionaria, e isso não está configurado hoje). Não existe envio em massa/campanha/broadcast no sistema — cada mensagem comercial é individual, revisada e enviada manualmente pelo José.'
);
