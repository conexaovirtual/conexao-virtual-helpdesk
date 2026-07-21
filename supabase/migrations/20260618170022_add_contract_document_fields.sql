-- Campos necessários para geração do documento (PDF) do contrato
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS representante_legal text,
  ADD COLUMN IF NOT EXISTS representante_cpf text;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS dia_vencimento smallint,
  ADD COLUMN IF NOT EXISTS valor_implantacao numeric;

COMMENT ON COLUMN public.companies.representante_legal IS 'Nome do representante legal para contratos';
COMMENT ON COLUMN public.companies.representante_cpf IS 'CPF do representante legal para contratos';
COMMENT ON COLUMN public.contracts.dia_vencimento IS 'Dia do mes de vencimento do boleto (1-31)';
COMMENT ON COLUMN public.contracts.valor_implantacao IS 'Valor unico de instalacao/implantacao do contrato';
