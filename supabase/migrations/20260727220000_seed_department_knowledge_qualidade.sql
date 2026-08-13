-- Fase 3 (Departamento Qualidade/Retenção) da "empresa virtual": contexto
-- inicial pro departamento qualidade, injetado no prompt da Miya.
insert into department_knowledge_base (departamento, secao, conteudo)
values (
  'qualidade',
  'retencao',
  'Nota de satisfação (CSAT) 1 ou 2 é tratada como sinal claro de insatisfação e escala automaticamente para o José assim que o cliente responde a pesquisa, sem precisar de intervenção da Miya. Empresas com contrato de manutenção sem nenhuma visita no mês são sinalizadas semanalmente ao José pelo preventive-maintenance-check. Qualquer reclamação recorrente ou risco de cancelamento identificado em conversa deve ser escalado com escalate_to_department(''qualidade'', motivo).'
);
