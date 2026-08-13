import { z } from 'zod';
import { zxcvbn } from '@zxcvbn-ts/core';

export const ticketSchema = z.object({
  titulo: z.string()
    .trim()
    .min(5, 'O título deve ter no mínimo 5 caracteres')
    .max(100, 'O título deve ter no máximo 100 caracteres'),
  descricao: z.string()
    .trim()
    .min(10, 'A descrição deve ter no mínimo 10 caracteres')
    .max(2000, 'A descrição deve ter no máximo 2000 caracteres'),
  category_id: z.string().trim().min(1, 'Selecione uma categoria'),
  subcategory_id: z.string().trim().optional(),
  asset_id: z.string().trim().min(1, 'Selecione um ativo'),
  canal: z.enum(['whatsapp', 'ligacao', 'visita_tecnica', 'email', 'web']),
  impacto: z.enum(['baixo', 'medio', 'alto']),
  urgencia: z.enum(['baixa', 'media', 'alta']),
  tecnico_id: z.string().trim().optional(),
});

// Schema para configurações JSONB de ativos
export const assetConfigSchema = z.object({
  // Processador
  processador: z.string().trim().max(200).optional(),
  processador_cores: z.number().int().min(1).max(128).optional(),
  processador_threads: z.number().int().min(1).max(256).optional(),
  processador_ghz: z.number().min(0.1).max(10).optional(),
  
  // Memória RAM
  memoria_ram_gb: z.number().int().min(1).max(2048).optional(),
  memoria_ram_tipo: z.enum(['DDR3', 'DDR4', 'DDR5', 'DDR6', 'Outro']).optional(),
  memoria_ram_slots: z.number().int().min(1).max(16).optional(),
  
  // Armazenamento
  armazenamento_principal_gb: z.number().int().min(1).optional(),
  armazenamento_principal_tipo: z.enum(['HDD', 'SSD', 'NVMe', 'M.2', 'Outro']).optional(),
  armazenamento_secundario_gb: z.number().int().optional(),
  armazenamento_secundario_tipo: z.enum(['HDD', 'SSD', 'NVMe', 'M.2', 'Outro']).optional(),
  
  // Placa de Vídeo
  placa_video: z.string().trim().max(200).optional(),
  placa_video_memoria_gb: z.number().int().min(1).max(128).optional(),
  placa_video_integrada: z.boolean().optional(),
  
  // Monitor
  tela_polegadas: z.number().min(10).max(100).optional(),
  tela_resolucao: z.string().trim().max(50).optional(),
  tela_touchscreen: z.boolean().optional(),
  
  // Rede
  rede_ethernet: z.boolean().optional(),
  rede_wifi: z.boolean().optional(),
  rede_wifi_standard: z.enum(['Wi-Fi 4', 'Wi-Fi 5', 'Wi-Fi 6', 'Wi-Fi 6E', 'Wi-Fi 7']).optional(),
  rede_bluetooth: z.boolean().optional(),
  
  // Outros
  peso_kg: z.number().min(0.1).max(1000).optional(),
  dimensoes: z.string().trim().max(100).optional(),
  fonte_watts: z.number().int().min(50).max(5000).optional(),
}).passthrough();

export const assetSchema = z.object({
  tipo: z.string().trim().min(1, 'Selecione o tipo'),
  fabricante: z.string().trim().max(100, 'Fabricante muito longo').optional(),
  modelo: z.string().trim().max(100, 'Modelo muito longo').optional(),
  numero_serie: z.string().trim().max(100, 'Número de série muito longo').optional(),
  tag_patrimonial: z.string().trim().max(50, 'Tag muito longa').optional(),
  local: z.string().trim().max(100, 'Local muito longo').optional(),
  setor: z.string().trim().max(100, 'Setor muito longo').optional(),
  sistema_operacional: z.string().trim().max(100, 'SO muito longo').optional(),
  estado: z.enum(['em_uso', 'estoque', 'manutencao', 'baixado']),
  data_compra: z.string().trim().optional(),
  garantia_fim: z.string().trim().optional(),
  observacoes: z.string().trim().max(500, 'Observações muito longas').optional(),
  configuracoes: assetConfigSchema.optional(),
});

export const commentSchema = z.object({
  comentario: z.string()
    .trim()
    .min(1, 'O comentário não pode estar vazio')
    .max(1000, 'O comentário deve ter no máximo 1000 caracteres'),
  is_internal: z.boolean().optional(),
});

/**
 * Validates Brazilian CNPJ using check digit algorithm
 */
const validateCNPJ = (cnpj: string): boolean => {
  const cleaned = cnpj.replace(/[^\d]/g, '');
  
  if (cleaned.length !== 14) return false;
  if (/^(\d)\1+$/.test(cleaned)) return false; // Reject sequences like 00000000000000
  
  // Calculate first check digit
  let sum = 0;
  let pos = 5;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleaned[i]) * pos--;
    if (pos < 2) pos = 9;
  }
  let digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== parseInt(cleaned[12])) return false;
  
  // Calculate second check digit
  sum = 0;
  pos = 6;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cleaned[i]) * pos--;
    if (pos < 2) pos = 9;
  }
  digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return digit === parseInt(cleaned[13]);
};

/**
 * Validates Brazilian phone number (landline or mobile)
 */
const validateBrazilianPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/[^\d]/g, '');
  // Accept phones with 8-11 digits (with or without area code)
  // Formats: XXXX-XXXX (8), 9XXXX-XXXX (9), (XX) XXXX-XXXX (10), (XX) 9XXXX-XXXX (11)
  return cleaned.length >= 8 && cleaned.length <= 11;
};

export const companySchema = z.object({
  nome_fantasia: z.string()
    .trim()
    .min(1, 'Nome fantasia é obrigatório')
    .max(200, 'Nome muito longo'),
  razao_social: z.string()
    .trim()
    .max(200, 'Razão social muito longa')
    .optional()
    .or(z.literal('')),
  cnpj: z.string()
    .trim()
    .optional()
    .refine((val) => !val || val.length === 0 || validateCNPJ(val), {
      message: 'CNPJ inválido. Verifique o formato 00.000.000/0000-00'
    }),
  email: z.string()
    .trim()
    .optional()
    .refine((val) => !val || val.length === 0 || z.string().email().safeParse(val).success, {
      message: 'E-mail inválido'
    })
    .transform(val => val === '' ? undefined : val),
  telefone: z.string()
    .trim()
    .optional()
    .refine((val) => !val || val.length === 0 || validateBrazilianPhone(val), {
      message: 'Telefone inválido. Use o formato (00) 00000-0000'
    }),
  whatsapp: z.string()
    .trim()
    .optional()
    .refine((val) => !val || val.length === 0 || validateBrazilianPhone(val), {
      message: 'WhatsApp inválido. Use o formato (00) 00000-0000'
    }),
  endereco: z.string()
    .trim()
    .max(300, 'Endereço muito longo')
    .optional()
    .or(z.literal('')),
  status: z.boolean()
    .default(true),
  sla_primeiro_atendimento_horas: z.number()
    .min(1, 'SLA deve ser maior que 0')
    .default(4),
  sla_solucao_horas: z.number()
    .min(1, 'SLA deve ser maior que 0')
    .default(16),
  tipo_contrato: z.enum(['eventual', 'contrato_manutencao'])
    .default('eventual'),
});

// Login NUNCA deve reavaliar força de senha — isso é coisa de CADASTRO
// (senha nova). No login o usuário está autenticando uma senha que já
// EXISTE; se ela não bater com regra de força atual (ex.: conta antiga,
// senha simples definida na criação), o formulário travava sem nem chegar
// a consultar o Supabase — usuário correto ficava PERMANENTEMENTE sem
// conseguir entrar. Achado real: 05/08/2026, onboarding do técnico Mike.
export const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido').min(1, 'E-mail é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export const authSchema = z.object({
  email: z.string().trim().email('E-mail inválido').min(1, 'E-mail é obrigatório'),
  password: z.string()
    .min(8, 'A senha deve ter no mínimo 8 caracteres')
    .refine((password) => {
      const result = zxcvbn(password);
      return result.score >= 3; // 0-4 scale (3 = good, 4 = strong)
    }, {
      message: 'Senha fraca. Use maiúsculas, minúsculas, números e caracteres especiais.'
    })
    .refine((password) => {
      // Block common leaked passwords
      const commonPasswords = ['123456', 'password', 'admin', 'qwerty', '12345678', 'abc123'];
      return !commonPasswords.some(common => 
        password.toLowerCase().includes(common)
      );
    }, {
      message: 'Senha muito comum. Escolha uma senha mais segura.'
    }),
  nome: z.string().trim().min(1, 'Nome é obrigatório').optional(),
});

export type TicketFormData = z.infer<typeof ticketSchema>;
export type AssetFormData = z.infer<typeof assetSchema>;
export type CommentFormData = z.infer<typeof commentSchema>;
export type CompanyFormData = z.infer<typeof companySchema>;
export type AuthFormData = z.infer<typeof authSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
