export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_alerts: {
        Row: {
          acao_sugerida: string | null
          created_at: string | null
          dados: Json | null
          descricao: string | null
          id: string
          lido: boolean | null
          resolvido: boolean | null
          severidade: string
          tipo: string
          titulo: string
        }
        Insert: {
          acao_sugerida?: string | null
          created_at?: string | null
          dados?: Json | null
          descricao?: string | null
          id?: string
          lido?: boolean | null
          resolvido?: boolean | null
          severidade: string
          tipo: string
          titulo: string
        }
        Update: {
          acao_sugerida?: string | null
          created_at?: string | null
          dados?: Json | null
          descricao?: string | null
          id?: string
          lido?: boolean | null
          resolvido?: boolean | null
          severidade?: string
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      ai_assistant_memory: {
        Row: {
          chave: string
          contexto: Json | null
          created_at: string | null
          id: string
          tipo: string
          updated_at: string | null
          user_id: string
          valor: string
          vezes_usado: number | null
        }
        Insert: {
          chave: string
          contexto?: Json | null
          created_at?: string | null
          id?: string
          tipo: string
          updated_at?: string | null
          user_id: string
          valor: string
          vezes_usado?: number | null
        }
        Update: {
          chave?: string
          contexto?: Json | null
          created_at?: string | null
          id?: string
          tipo?: string
          updated_at?: string | null
          user_id?: string
          valor?: string
          vezes_usado?: number | null
        }
        Relationships: []
      }
      ai_predictions: {
        Row: {
          asset_id: string | null
          created_at: string | null
          dias_estimados: number | null
          historico_resumo: string | null
          id: string
          probabilidade_falha: number | null
          recomendacao: string | null
          tipo_falha_prevista: string | null
          valido_ate: string | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string | null
          dias_estimados?: number | null
          historico_resumo?: string | null
          id?: string
          probabilidade_falha?: number | null
          recomendacao?: string | null
          tipo_falha_prevista?: string | null
          valido_ate?: string | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string | null
          dias_estimados?: number | null
          historico_resumo?: string | null
          id?: string
          probabilidade_falha?: number | null
          recomendacao?: string | null
          tipo_falha_prevista?: string | null
          valido_ate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_predictions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_summaries: {
        Row: {
          created_at: string | null
          id: string
          padrao_detectado: boolean | null
          padroes: Json | null
          problema_identificado: string | null
          recomendacao_preventiva: string | null
          recomendacoes: string | null
          resumo: string
          solucao_aplicada: string | null
          source_id: string
          source_type: string
          tags_sugeridas: string[] | null
          tempo_estimado_futuro: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          padrao_detectado?: boolean | null
          padroes?: Json | null
          problema_identificado?: string | null
          recomendacao_preventiva?: string | null
          recomendacoes?: string | null
          resumo: string
          solucao_aplicada?: string | null
          source_id: string
          source_type: string
          tags_sugeridas?: string[] | null
          tempo_estimado_futuro?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          padrao_detectado?: boolean | null
          padroes?: Json | null
          problema_identificado?: string | null
          recomendacao_preventiva?: string | null
          recomendacoes?: string | null
          resumo?: string
          solucao_aplicada?: string | null
          source_id?: string
          source_type?: string
          tags_sugeridas?: string[] | null
          tempo_estimado_futuro?: string | null
        }
        Relationships: []
      }
      appointment_notification_log: {
        Row: {
          appointment_id: string
          channel: string
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          channel?: string
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          channel?: string
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notification_log_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string | null
          company_id: string | null
          created_at: string
          description: string | null
          end_time: string | null
          id: string
          notify_minutes: number | null
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_date: string
          appointment_time?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          notify_minutes?: number | null
          status?: string
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          notify_minutes?: number | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "asset_inventory_by_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_statistics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      asset_categories: {
        Row: {
          cor: string | null
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      asset_changelog: {
        Row: {
          asset_id: string
          campo: string
          changed_by: string | null
          created_at: string | null
          id: string
          observacao: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          asset_id: string
          campo: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          observacao?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          asset_id?: string
          campo?: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          observacao?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_changelog_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_changelog_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_changelog_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_relationships: {
        Row: {
          child_asset_id: string
          created_at: string | null
          descricao: string | null
          id: string
          parent_asset_id: string
          relationship_type: Database["public"]["Enums"]["asset_relationship_type"]
        }
        Insert: {
          child_asset_id: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          parent_asset_id: string
          relationship_type: Database["public"]["Enums"]["asset_relationship_type"]
        }
        Update: {
          child_asset_id?: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          parent_asset_id?: string
          relationship_type?: Database["public"]["Enums"]["asset_relationship_type"]
        }
        Relationships: [
          {
            foreignKeyName: "asset_relationships_child_asset_id_fkey"
            columns: ["child_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_relationships_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_subcategories: {
        Row: {
          category_id: string
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          categoria_id: string | null
          company_id: string
          configuracoes: Json | null
          created_at: string | null
          data_compra: string | null
          datto_device_id: string | null
          datto_device_uid: string | null
          datto_last_sync: string | null
          datto_site_id: string | null
          datto_status: string | null
          estado: Database["public"]["Enums"]["asset_status"] | null
          fabricante: string | null
          garantia_fim: string | null
          id: string
          local: string | null
          modelo: string | null
          nome: string
          numero_serie: string | null
          observacoes: string | null
          qrcode_token: string | null
          setor: string | null
          sistema_operacional: string | null
          subcategoria_id: string | null
          tag_patrimonial: string | null
          tipo: Database["public"]["Enums"]["asset_type"]
          updated_at: string | null
        }
        Insert: {
          categoria_id?: string | null
          company_id: string
          configuracoes?: Json | null
          created_at?: string | null
          data_compra?: string | null
          datto_device_id?: string | null
          datto_device_uid?: string | null
          datto_last_sync?: string | null
          datto_site_id?: string | null
          datto_status?: string | null
          estado?: Database["public"]["Enums"]["asset_status"] | null
          fabricante?: string | null
          garantia_fim?: string | null
          id?: string
          local?: string | null
          modelo?: string | null
          nome: string
          numero_serie?: string | null
          observacoes?: string | null
          qrcode_token?: string | null
          setor?: string | null
          sistema_operacional?: string | null
          subcategoria_id?: string | null
          tag_patrimonial?: string | null
          tipo: Database["public"]["Enums"]["asset_type"]
          updated_at?: string | null
        }
        Update: {
          categoria_id?: string | null
          company_id?: string
          configuracoes?: Json | null
          created_at?: string | null
          data_compra?: string | null
          datto_device_id?: string | null
          datto_device_uid?: string | null
          datto_last_sync?: string | null
          datto_site_id?: string | null
          datto_status?: string | null
          estado?: Database["public"]["Enums"]["asset_status"] | null
          fabricante?: string | null
          garantia_fim?: string | null
          id?: string
          local?: string | null
          modelo?: string | null
          nome?: string
          numero_serie?: string | null
          observacoes?: string | null
          qrcode_token?: string | null
          setor?: string | null
          sistema_operacional?: string | null
          subcategoria_id?: string | null
          tag_patrimonial?: string | null
          tipo?: Database["public"]["Enums"]["asset_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "asset_inventory_by_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_statistics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "assets_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "asset_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          cor: string | null
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      chat_channels: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      cnpj_cache: {
        Row: {
          cnpj: string
          consultado_em: string | null
          dados: Json
          valido_ate: string | null
        }
        Insert: {
          cnpj: string
          consultado_em?: string | null
          dados: Json
          valido_ate?: string | null
        }
        Update: {
          cnpj?: string
          consultado_em?: string | null
          dados?: Json
          valido_ate?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          cnpj: string | null
          created_at: string | null
          datto_site_id: string | null
          email: string | null
          endereco: string | null
          id: string
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          nome_fantasia: string
          razao_social: string | null
          representante_cpf: string | null
          representante_legal: string | null
          sla_primeiro_atendimento_horas: number | null
          sla_solucao_horas: number | null
          status: boolean | null
          telefone: string | null
          tipo_contrato: Database["public"]["Enums"]["company_contract_type"]
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string | null
          datto_site_id?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          nome_fantasia: string
          razao_social?: string | null
          representante_cpf?: string | null
          representante_legal?: string | null
          sla_primeiro_atendimento_horas?: number | null
          sla_solucao_horas?: number | null
          status?: boolean | null
          telefone?: string | null
          tipo_contrato?: Database["public"]["Enums"]["company_contract_type"]
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string | null
          datto_site_id?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          nome_fantasia?: string
          razao_social?: string | null
          representante_cpf?: string | null
          representante_legal?: string | null
          sla_primeiro_atendimento_horas?: number | null
          sla_solucao_horas?: number | null
          status?: boolean | null
          telefone?: string | null
          tipo_contrato?: Database["public"]["Enums"]["company_contract_type"]
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      contract_hour_entries: {
        Row: {
          contract_id: string
          created_at: string | null
          data_registro: string
          descricao: string | null
          horas: number
          id: string
          service_order_id: string | null
          tecnico_id: string | null
          ticket_id: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          data_registro?: string
          descricao?: string | null
          horas?: number
          id?: string
          service_order_id?: string | null
          tecnico_id?: string | null
          ticket_id?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          data_registro?: string
          descricao?: string | null
          horas?: number
          id?: string
          service_order_id?: string | null
          tecnico_id?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_hour_entries_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_hour_entries_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_hour_entries_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_hour_entries_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_hour_entries_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          company_id: string
          created_at: string | null
          descricao: string | null
          dia_vencimento: number | null
          horas_consumidas: number | null
          horas_contratadas: number | null
          id: string
          observacoes: string | null
          renovacao_automatica: boolean | null
          status: Database["public"]["Enums"]["contract_status"]
          tipo: Database["public"]["Enums"]["contract_type"]
          updated_at: string | null
          valor_implantacao: number | null
          valor_mensal: number | null
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          descricao?: string | null
          dia_vencimento?: number | null
          horas_consumidas?: number | null
          horas_contratadas?: number | null
          id?: string
          observacoes?: string | null
          renovacao_automatica?: boolean | null
          status?: Database["public"]["Enums"]["contract_status"]
          tipo?: Database["public"]["Enums"]["contract_type"]
          updated_at?: string | null
          valor_implantacao?: number | null
          valor_mensal?: number | null
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          descricao?: string | null
          dia_vencimento?: number | null
          horas_consumidas?: number | null
          horas_contratadas?: number | null
          id?: string
          observacoes?: string | null
          renovacao_automatica?: boolean | null
          status?: Database["public"]["Enums"]["contract_status"]
          tipo?: Database["public"]["Enums"]["contract_type"]
          updated_at?: string | null
          valor_implantacao?: number | null
          valor_mensal?: number | null
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "asset_inventory_by_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_statistics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          amount: number
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          reference_date: string
          service_order_id: string | null
          ticket_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_date?: string
          service_order_id?: string | null
          ticket_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_date?: string
          service_order_id?: string | null
          ticket_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "asset_inventory_by_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "cost_centers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_statistics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "cost_centers_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_service_records: {
        Row: {
          asset_id: string | null
          canal: Database["public"]["Enums"]["service_channel"]
          company_id: string
          created_at: string | null
          data_atendimento: string
          descricao: string
          endereco_cliente: string | null
          fotos: Json | null
          hora_fim: string | null
          hora_inicio: string
          id: string
          latitude_fim: number | null
          latitude_inicio: number | null
          longitude_fim: number | null
          longitude_inicio: number | null
          observacoes: string | null
          solucao: string | null
          status: string
          tecnico_id: string
          ticket_id: string | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          asset_id?: string | null
          canal: Database["public"]["Enums"]["service_channel"]
          company_id: string
          created_at?: string | null
          data_atendimento?: string
          descricao: string
          endereco_cliente?: string | null
          fotos?: Json | null
          hora_fim?: string | null
          hora_inicio: string
          id?: string
          latitude_fim?: number | null
          latitude_inicio?: number | null
          longitude_fim?: number | null
          longitude_inicio?: number | null
          observacoes?: string | null
          solucao?: string | null
          status?: string
          tecnico_id: string
          ticket_id?: string | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          asset_id?: string | null
          canal?: Database["public"]["Enums"]["service_channel"]
          company_id?: string
          created_at?: string | null
          data_atendimento?: string
          descricao?: string
          endereco_cliente?: string | null
          fotos?: Json | null
          hora_fim?: string | null
          hora_inicio?: string
          id?: string
          latitude_fim?: number | null
          latitude_inicio?: number | null
          longitude_fim?: number | null
          longitude_inicio?: number | null
          observacoes?: string | null
          solucao?: string | null
          status?: string
          tecnico_id?: string
          ticket_id?: string | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_service_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_service_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "asset_inventory_by_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "daily_service_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_service_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_service_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_service_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_statistics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "daily_service_records_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_service_records_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_service_records_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      datto_alerts_log: {
        Row: {
          alert_category: string | null
          alert_message: string | null
          alert_priority: string | null
          alert_type: string | null
          alert_uid: string | null
          asset_id: string | null
          created_at: string | null
          device_hostname: string | null
          device_id: string | null
          device_ip: string | null
          id: string
          processed: boolean | null
          raw_payload: Json | null
          site_name: string | null
          ticket_id: string | null
        }
        Insert: {
          alert_category?: string | null
          alert_message?: string | null
          alert_priority?: string | null
          alert_type?: string | null
          alert_uid?: string | null
          asset_id?: string | null
          created_at?: string | null
          device_hostname?: string | null
          device_id?: string | null
          device_ip?: string | null
          id?: string
          processed?: boolean | null
          raw_payload?: Json | null
          site_name?: string | null
          ticket_id?: string | null
        }
        Update: {
          alert_category?: string | null
          alert_message?: string | null
          alert_priority?: string | null
          alert_type?: string | null
          alert_uid?: string | null
          asset_id?: string | null
          created_at?: string | null
          device_hostname?: string | null
          device_id?: string | null
          device_ip?: string | null
          id?: string
          processed?: boolean | null
          raw_payload?: Json | null
          site_name?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "datto_alerts_log_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datto_alerts_log_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      datto_oauth_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string | null
          id: string
          refresh_token: string | null
          token_type: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          token_type?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          refresh_token?: string | null
          token_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      knowledge_articles: {
        Row: {
          categoria: string | null
          created_at: string
          id: string
          problema: string
          solucao: string
          tags: string[] | null
          ticket_id: string | null
          titulo: string
          updated_at: string
          util_count: number | null
          visualizacoes: number | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          id?: string
          problema: string
          solucao: string
          tags?: string[] | null
          ticket_id?: string | null
          titulo: string
          updated_at?: string
          util_count?: number | null
          visualizacoes?: number | null
        }
        Update: {
          categoria?: string | null
          created_at?: string
          id?: string
          problema?: string
          solucao?: string
          tags?: string[] | null
          ticket_id?: string | null
          titulo?: string
          updated_at?: string
          util_count?: number | null
          visualizacoes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          id: string
          nome: string
          phone_visibility:
            | Database["public"]["Enums"]["phone_visibility"]
            | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          id: string
          nome: string
          phone_visibility?:
            | Database["public"]["Enums"]["phone_visibility"]
            | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          phone_visibility?:
            | Database["public"]["Enums"]["phone_visibility"]
            | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "asset_inventory_by_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_statistics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      profiles_company_mapping: {
        Row: {
          company_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      project_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          project_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          name: string
          priority: string
          progress: number
          responsible_id: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          priority?: string
          progress?: number
          responsible_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          priority?: string
          progress?: number
          responsible_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "asset_inventory_by_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_statistics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      security_audit_logs: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          severity: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      service_order_history: {
        Row: {
          campo_alterado: string
          changed_by: string
          created_at: string | null
          id: string
          observacao: string | null
          service_order_id: string
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          campo_alterado: string
          changed_by: string
          created_at?: string | null
          id?: string
          observacao?: string | null
          service_order_id: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          campo_alterado?: string
          changed_by?: string
          created_at?: string | null
          id?: string
          observacao?: string | null
          service_order_id?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_order_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_history_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          asset_id: string | null
          company_id: string
          contato_local: string | null
          created_at: string | null
          custo_pecas: number | null
          custo_total: number | null
          data_agendada: string | null
          data_emissao: string
          data_execucao: string | null
          descricao_servicos: string
          endereco_atendimento: string | null
          equipamento_descricao: string | null
          equipamentos_necessarios: string[] | null
          fotos: Json | null
          hora_agendada: string | null
          id: string
          latitude_fim: number | null
          latitude_inicio: number | null
          longitude_fim: number | null
          longitude_inicio: number | null
          modalidade: string | null
          notified_at: string | null
          numero_os: number
          observacoes: string | null
          pecas_previstas: Json | null
          prioridade: string | null
          status: string
          tecnico_id: string | null
          telefone_contato: string | null
          tempo_estimado_horas: number | null
          tempo_gasto_horas: number | null
          ticket_id: string | null
          tipo_servico: string | null
          updated_at: string | null
        }
        Insert: {
          asset_id?: string | null
          company_id: string
          contato_local?: string | null
          created_at?: string | null
          custo_pecas?: number | null
          custo_total?: number | null
          data_agendada?: string | null
          data_emissao?: string
          data_execucao?: string | null
          descricao_servicos: string
          endereco_atendimento?: string | null
          equipamento_descricao?: string | null
          equipamentos_necessarios?: string[] | null
          fotos?: Json | null
          hora_agendada?: string | null
          id?: string
          latitude_fim?: number | null
          latitude_inicio?: number | null
          longitude_fim?: number | null
          longitude_inicio?: number | null
          modalidade?: string | null
          notified_at?: string | null
          numero_os: number
          observacoes?: string | null
          pecas_previstas?: Json | null
          prioridade?: string | null
          status?: string
          tecnico_id?: string | null
          telefone_contato?: string | null
          tempo_estimado_horas?: number | null
          tempo_gasto_horas?: number | null
          ticket_id?: string | null
          tipo_servico?: string | null
          updated_at?: string | null
        }
        Update: {
          asset_id?: string | null
          company_id?: string
          contato_local?: string | null
          created_at?: string | null
          custo_pecas?: number | null
          custo_total?: number | null
          data_agendada?: string | null
          data_emissao?: string
          data_execucao?: string | null
          descricao_servicos?: string
          endereco_atendimento?: string | null
          equipamento_descricao?: string | null
          equipamentos_necessarios?: string[] | null
          fotos?: Json | null
          hora_agendada?: string | null
          id?: string
          latitude_fim?: number | null
          latitude_inicio?: number | null
          longitude_fim?: number | null
          longitude_inicio?: number | null
          modalidade?: string | null
          notified_at?: string | null
          numero_os?: number
          observacoes?: string | null
          pecas_previstas?: Json | null
          prioridade?: string | null
          status?: string
          tecnico_id?: string | null
          telefone_contato?: string | null
          tempo_estimado_horas?: number | null
          tempo_gasto_horas?: number | null
          ticket_id?: string | null
          tipo_servico?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "asset_inventory_by_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "service_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_statistics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "service_orders_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string | null
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          comentario: string
          created_at: string | null
          id: string
          is_internal: boolean | null
          ticket_id: string
          user_id: string
        }
        Insert: {
          comentario: string
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          ticket_id: string
          user_id: string
        }
        Update: {
          comentario?: string
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          asset_id: string | null
          avaliacao: number | null
          canal: string | null
          category_id: string | null
          comentario_avaliacao: string | null
          company_id: string
          created_at: string | null
          custo_pecas: number | null
          data_fechamento: string | null
          data_primeiro_atendimento: string | null
          data_solucao: string | null
          descricao: string
          id: string
          impacto: Database["public"]["Enums"]["impact_level"] | null
          numero: number
          prioridade: Database["public"]["Enums"]["priority_level"] | null
          public_request: boolean | null
          sla_atendimento_limite: string | null
          sla_escalado: string | null
          sla_solucao_limite: string | null
          solicitante_contato: string | null
          solicitante_id: string | null
          solicitante_nome: string | null
          solucao: string | null
          status: Database["public"]["Enums"]["ticket_status"] | null
          subcategory_id: string | null
          tecnico_id: string | null
          tempo_gasto_horas: number | null
          titulo: string
          updated_at: string | null
          urgencia: Database["public"]["Enums"]["urgency_level"] | null
        }
        Insert: {
          asset_id?: string | null
          avaliacao?: number | null
          canal?: string | null
          category_id?: string | null
          comentario_avaliacao?: string | null
          company_id: string
          created_at?: string | null
          custo_pecas?: number | null
          data_fechamento?: string | null
          data_primeiro_atendimento?: string | null
          data_solucao?: string | null
          descricao: string
          id?: string
          impacto?: Database["public"]["Enums"]["impact_level"] | null
          numero?: number
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          public_request?: boolean | null
          sla_atendimento_limite?: string | null
          sla_escalado?: string | null
          sla_solucao_limite?: string | null
          solicitante_contato?: string | null
          solicitante_id?: string | null
          solicitante_nome?: string | null
          solucao?: string | null
          status?: Database["public"]["Enums"]["ticket_status"] | null
          subcategory_id?: string | null
          tecnico_id?: string | null
          tempo_gasto_horas?: number | null
          titulo: string
          updated_at?: string | null
          urgencia?: Database["public"]["Enums"]["urgency_level"] | null
        }
        Update: {
          asset_id?: string | null
          avaliacao?: number | null
          canal?: string | null
          category_id?: string | null
          comentario_avaliacao?: string | null
          company_id?: string
          created_at?: string | null
          custo_pecas?: number | null
          data_fechamento?: string | null
          data_primeiro_atendimento?: string | null
          data_solucao?: string | null
          descricao?: string
          id?: string
          impacto?: Database["public"]["Enums"]["impact_level"] | null
          numero?: number
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          public_request?: boolean | null
          sla_atendimento_limite?: string | null
          sla_escalado?: string | null
          sla_solucao_limite?: string | null
          solicitante_contato?: string | null
          solicitante_id?: string | null
          solicitante_nome?: string | null
          solucao?: string | null
          status?: Database["public"]["Enums"]["ticket_status"] | null
          subcategory_id?: string | null
          tecnico_id?: string | null
          tempo_gasto_horas?: number | null
          titulo?: string
          updated_at?: string | null
          urgencia?: Database["public"]["Enums"]["urgency_level"] | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "asset_inventory_by_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_statistics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "tickets_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      visit_schedules: {
        Row: {
          ai_justificativa: string | null
          company_id: string
          created_at: string
          frequencia: Database["public"]["Enums"]["visit_frequency"]
          id: string
          motivo: Database["public"]["Enums"]["visit_reason"]
          observacoes: string | null
          prioridade: Database["public"]["Enums"]["visit_priority"]
          proxima_visita: string
          service_order_id: string | null
          status: Database["public"]["Enums"]["visit_status"]
          tecnico_responsavel_id: string | null
          ultima_visita: string | null
          updated_at: string
        }
        Insert: {
          ai_justificativa?: string | null
          company_id: string
          created_at?: string
          frequencia?: Database["public"]["Enums"]["visit_frequency"]
          id?: string
          motivo?: Database["public"]["Enums"]["visit_reason"]
          observacoes?: string | null
          prioridade?: Database["public"]["Enums"]["visit_priority"]
          proxima_visita: string
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          tecnico_responsavel_id?: string | null
          ultima_visita?: string | null
          updated_at?: string
        }
        Update: {
          ai_justificativa?: string | null
          company_id?: string
          created_at?: string
          frequencia?: Database["public"]["Enums"]["visit_frequency"]
          id?: string
          motivo?: Database["public"]["Enums"]["visit_reason"]
          observacoes?: string | null
          prioridade?: Database["public"]["Enums"]["visit_priority"]
          proxima_visita?: string
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          tecnico_responsavel_id?: string | null
          ultima_visita?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "asset_inventory_by_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "visit_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_statistics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "visit_schedules_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_schedules_tecnico_responsavel_id_fkey"
            columns: ["tecnico_responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_schedules_tecnico_responsavel_id_fkey"
            columns: ["tecnico_responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      waba_conversations: {
        Row: {
          ai_context: Json | null
          ai_enabled: boolean
          assigned_to: string | null
          contact_name: string | null
          created_at: string
          first_response_at: string | null
          id: string
          last_message_at: string | null
          phone_number: string
          profile_photo_url: string | null
          queue_status: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_context?: Json | null
          ai_enabled?: boolean
          assigned_to?: string | null
          contact_name?: string | null
          created_at?: string
          first_response_at?: string | null
          id?: string
          last_message_at?: string | null
          phone_number: string
          profile_photo_url?: string | null
          queue_status?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_context?: Json | null
          ai_enabled?: boolean
          assigned_to?: string | null
          contact_name?: string | null
          created_at?: string
          first_response_at?: string | null
          id?: string
          last_message_at?: string | null
          phone_number?: string
          profile_photo_url?: string | null
          queue_status?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waba_conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waba_conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      waba_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          direction: string
          id: string
          media_url: string | null
          message_type: string
          raw_payload: Json | null
          sender_type: string
          status: string | null
          wamid: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          message_type?: string
          raw_payload?: Json | null
          sender_type?: string
          status?: string | null
          wamid?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          message_type?: string
          raw_payload?: Json | null
          sender_type?: string
          status?: string | null
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waba_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "waba_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contacts: {
        Row: {
          company_id: string | null
          contact_name: string | null
          created_at: string | null
          id: string
          last_message_at: string | null
          phone_number: string
        }
        Insert: {
          company_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          phone_number: string
        }
        Update: {
          company_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          phone_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "asset_inventory_by_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "whatsapp_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_statistics"
            referencedColumns: ["company_id"]
          },
        ]
      }
    }
    Views: {
      asset_inventory_by_company: {
        Row: {
          ativos_baixados: number | null
          ativos_em_garantia: number | null
          ativos_em_uso: number | null
          ativos_estoque: number | null
          ativos_fora_garantia: number | null
          ativos_garantia_expirando: number | null
          ativos_manutencao: number | null
          cnpj: string | null
          company_id: string | null
          media_armazenamento_gb: number | null
          media_ram_gb: number | null
          nome_fantasia: string | null
          total_ativos: number | null
          total_desktops: number | null
          total_impressoras: number | null
          total_monitores: number | null
          total_notebooks: number | null
          total_perifericos: number | null
          total_roteadores: number | null
          total_servidores: number | null
          total_switches: number | null
        }
        Relationships: []
      }
      companies_basic: {
        Row: {
          created_at: string | null
          id: string | null
          nome_fantasia: string | null
          status: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          nome_fantasia?: string | null
          status?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          nome_fantasia?: string | null
          status?: boolean | null
        }
        Relationships: []
      }
      companies_safe: {
        Row: {
          cnpj: string | null
          created_at: string | null
          email: string | null
          endereco: string | null
          id: string | null
          nome_fantasia: string | null
          razao_social: string | null
          sla_primeiro_atendimento_horas: number | null
          sla_solucao_horas: number | null
          status: boolean | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          cnpj?: never
          created_at?: string | null
          email?: never
          endereco?: string | null
          id?: string | null
          nome_fantasia?: string | null
          razao_social?: string | null
          representante_cpf?: string | null
          representante_legal?: string | null
          sla_primeiro_atendimento_horas?: number | null
          sla_solucao_horas?: number | null
          status?: boolean | null
          telefone?: never
          updated_at?: string | null
        }
        Update: {
          cnpj?: never
          created_at?: string | null
          email?: never
          endereco?: string | null
          id?: string | null
          nome_fantasia?: string | null
          razao_social?: string | null
          representante_cpf?: string | null
          representante_legal?: string | null
          sla_primeiro_atendimento_horas?: number | null
          sla_solucao_horas?: number | null
          status?: boolean | null
          telefone?: never
          updated_at?: string | null
        }
        Relationships: []
      }
      company_statistics: {
        Row: {
          ativos_baixados: number | null
          ativos_em_uso: number | null
          ativos_estoque: number | null
          ativos_manutencao: number | null
          cnpj: string | null
          company_id: string | null
          media_avaliacao: number | null
          nome_fantasia: string | null
          sla_primeiro_atendimento_horas: number | null
          sla_solucao_horas: number | null
          status: boolean | null
          tempo_medio_resolucao_horas: number | null
          tickets_em_atendimento: number | null
          tickets_fechados: number | null
          tickets_novos: number | null
          tickets_resolvidos: number | null
          tickets_sla_violado: number | null
          total_ativos: number | null
          total_tickets: number | null
        }
        Relationships: []
      }
      profiles_safe: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          id: string | null
          nome: string | null
          phone_visibility:
            | Database["public"]["Enums"]["phone_visibility"]
            | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string | null
          nome?: string | null
          phone_visibility?:
            | Database["public"]["Enums"]["phone_visibility"]
            | null
          telefone?: never
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string | null
          nome?: string | null
          phone_visibility?:
            | Database["public"]["Enums"]["phone_visibility"]
            | null
          telefone?: never
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "asset_inventory_by_company"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_statistics"
            referencedColumns: ["company_id"]
          },
        ]
      }
      security_rls_violations: {
        Row: {
          created_at: string | null
          event_type: string | null
          ip_address: string | null
          metadata: Json | null
          severity: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type?: string | null
          ip_address?: string | null
          metadata?: Json | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string | null
          ip_address?: string | null
          metadata?: Json | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_priority: {
        Args: {
          p_impacto: Database["public"]["Enums"]["impact_level"]
          p_urgencia: Database["public"]["Enums"]["urgency_level"]
        }
        Returns: Database["public"]["Enums"]["priority_level"]
      }
      can_view_asset_details: { Args: { _user_id: string }; Returns: boolean }
      can_view_financial_data: { Args: { _user_id: string }; Returns: boolean }
      can_view_phone: {
        Args: { target_user_id: string; viewer_user_id: string }
        Returns: boolean
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: { Args: { user_id: string }; Returns: string }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["user_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      log_phone_access_attempt: {
        Args: {
          access_granted: boolean
          target_user_id: string
          viewer_user_id: string
        }
        Returns: undefined
      }
      log_security_event: {
        Args: {
          p_event_type: string
          p_ip?: string
          p_metadata?: Json
          p_severity?: string
          p_user_agent?: string
          p_user_id?: string
        }
        Returns: undefined
      }
      migrate_daily_records_to_tickets: {
        Args: never
        Returns: {
          error_count: number
          migrated_count: number
        }[]
      }
      uuid_generate_v4: { Args: never; Returns: string }
    }
    Enums: {
      asset_relationship_type:
        | "hospeda"
        | "conecta"
        | "depende_de"
        | "backup_de"
        | "virtualiza"
      asset_status: "em_uso" | "estoque" | "manutencao" | "baixado"
      asset_type:
        | "desktop"
        | "notebook"
        | "impressora"
        | "monitor"
        | "roteador"
        | "switch"
        | "servidor"
        | "periferico"
        | "outro"
        | "camera"
      canal_atendimento:
        | "whatsapp"
        | "ligacao"
        | "visita_tecnica"
        | "email"
        | "web"
      company_contract_type: "eventual" | "contrato_manutencao"
      contract_status: "ativo" | "expirado" | "cancelado" | "pendente"
      contract_type: "bloco_horas" | "ilimitado" | "por_chamado" | "mensal_fixo"
      impact_level: "alto" | "medio" | "baixo"
      phone_visibility: "everyone" | "managers_only" | "private"
      priority_level: "critica" | "alta" | "media" | "baixa"
      service_channel:
        | "whatsapp"
        | "ligacao"
        | "visita_tecnica"
        | "acesso_remoto"
      ticket_status:
        | "novo"
        | "triagem"
        | "em_atendimento"
        | "aguardando_usuario"
        | "aguardando_peca"
        | "resolvido"
        | "validando_cliente"
        | "fechado"
      urgency_level: "alta" | "media" | "baixa"
      user_role: "admin_provedor" | "tecnico" | "gestor_cliente" | "solicitante"
      visit_frequency: "semanal" | "quinzenal" | "mensal" | "trimestral"
      visit_priority: "alta" | "media" | "baixa"
      visit_reason: "preventiva" | "corretiva" | "acompanhamento"
      visit_status:
        | "pendente"
        | "agendada"
        | "concluida"
        | "cancelada"
        | "atrasada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      asset_relationship_type: [
        "hospeda",
        "conecta",
        "depende_de",
        "backup_de",
        "virtualiza",
      ],
      asset_status: ["em_uso", "estoque", "manutencao", "baixado"],
      asset_type: [
        "desktop",
        "notebook",
        "impressora",
        "monitor",
        "roteador",
        "switch",
        "servidor",
        "periferico",
        "outro",
        "camera",
      ],
      canal_atendimento: [
        "whatsapp",
        "ligacao",
        "visita_tecnica",
        "email",
        "web",
      ],
      company_contract_type: ["eventual", "contrato_manutencao"],
      contract_status: ["ativo", "expirado", "cancelado", "pendente"],
      contract_type: ["bloco_horas", "ilimitado", "por_chamado", "mensal_fixo"],
      impact_level: ["alto", "medio", "baixo"],
      phone_visibility: ["everyone", "managers_only", "private"],
      priority_level: ["critica", "alta", "media", "baixa"],
      service_channel: [
        "whatsapp",
        "ligacao",
        "visita_tecnica",
        "acesso_remoto",
      ],
      ticket_status: [
        "novo",
        "triagem",
        "em_atendimento",
        "aguardando_usuario",
        "aguardando_peca",
        "resolvido",
        "validando_cliente",
        "fechado",
      ],
      urgency_level: ["alta", "media", "baixa"],
      user_role: ["admin_provedor", "tecnico", "gestor_cliente", "solicitante"],
      visit_frequency: ["semanal", "quinzenal", "mensal", "trimestral"],
      visit_priority: ["alta", "media", "baixa"],
      visit_reason: ["preventiva", "corretiva", "acompanhamento"],
      visit_status: [
        "pendente",
        "agendada",
        "concluida",
        "cancelada",
        "atrasada",
      ],
    },
  },
} as const
