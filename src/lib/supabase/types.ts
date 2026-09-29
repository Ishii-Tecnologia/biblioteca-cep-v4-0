// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auditoria_transicoes: {
        Row: {
          created_at: string | null
          entidade: string
          estado_anterior: string | null
          estado_novo: string
          id: number
          motivo: string | null
          operador_id: string | null
          operador_nome: string | null
          payload: Json | null
          registro_id: string
        }
        Insert: {
          created_at?: string | null
          entidade: string
          estado_anterior?: string | null
          estado_novo: string
          id?: number
          motivo?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          payload?: Json | null
          registro_id: string
        }
        Update: {
          created_at?: string | null
          entidade?: string
          estado_anterior?: string | null
          estado_novo?: string
          id?: number
          motivo?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          payload?: Json | null
          registro_id?: string
        }
        Relationships: []
      }
      authors: {
        Row: {
          created_at: string
          id: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: string
        }
        Relationships: []
      }
      categorias: {
        Row: {
          created_at: string
          id: number
          nome: string
        }
        Insert: {
          created_at?: string
          id?: number
          nome: string
        }
        Update: {
          created_at?: string
          id?: number
          nome?: string
        }
        Relationships: []
      }
      configuracao: {
        Row: {
          chave: string
          descricao: string | null
          updated_at: string | null
          valor: string
        }
        Insert: {
          chave: string
          descricao?: string | null
          updated_at?: string | null
          valor: string
        }
        Update: {
          chave?: string
          descricao?: string | null
          updated_at?: string | null
          valor?: string
        }
        Relationships: []
      }
      cursos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      emprestimo: {
        Row: {
          atraso: boolean
          created_at: string
          data_agendada: string | null
          data_devolucao_real: string | null
          data_emprestimo: string
          data_limite_retirada: string | null
          data_prevista_devolucao: string
          data_retirada_real: string | null
          dias_atraso: number | null
          id_emprestimo: number
          id_exemplar: string
          id_leitor: number
          numero_renovacoes: number
          status: string | null
        }
        Insert: {
          atraso?: boolean
          created_at?: string
          data_agendada?: string | null
          data_devolucao_real?: string | null
          data_emprestimo?: string
          data_limite_retirada?: string | null
          data_prevista_devolucao: string
          data_retirada_real?: string | null
          dias_atraso?: number | null
          id_emprestimo?: never
          id_exemplar: string
          id_leitor: number
          numero_renovacoes?: number
          status?: string | null
        }
        Update: {
          atraso?: boolean
          created_at?: string
          data_agendada?: string | null
          data_devolucao_real?: string | null
          data_emprestimo?: string
          data_limite_retirada?: string | null
          data_prevista_devolucao?: string
          data_retirada_real?: string | null
          dias_atraso?: number | null
          id_emprestimo?: never
          id_exemplar?: string
          id_leitor?: number
          numero_renovacoes?: number
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emprestimo_id_exemplar_fkey"
            columns: ["id_exemplar"]
            isOneToOne: false
            referencedRelation: "exemplar"
            referencedColumns: ["id_exemplar"]
          },
          {
            foreignKeyName: "emprestimo_id_leitor_fkey"
            columns: ["id_leitor"]
            isOneToOne: false
            referencedRelation: "leitor"
            referencedColumns: ["id_leitor"]
          },
        ]
      }
      exemplar: {
        Row: {
          created_at: string
          id_exemplar: string
          id_titulo: string
          localizacao: string | null
          seq: number
          status: string
        }
        Insert: {
          created_at?: string
          id_exemplar: string
          id_titulo: string
          localizacao?: string | null
          seq: number
          status?: string
        }
        Update: {
          created_at?: string
          id_exemplar?: string
          id_titulo?: string
          localizacao?: string | null
          seq?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "exemplar_id_titulo_fkey"
            columns: ["id_titulo"]
            isOneToOne: false
            referencedRelation: "titulo"
            referencedColumns: ["id_titulo"]
          },
        ]
      }
      feriado: {
        Row: {
          ano: number | null
          created_at: string | null
          data: string
          descricao: string
          id: number
        }
        Insert: {
          ano?: number | null
          created_at?: string | null
          data: string
          descricao: string
          id?: number
        }
        Update: {
          ano?: number | null
          created_at?: string | null
          data?: string
          descricao?: string
          id?: number
        }
        Relationships: []
      }
      historico: {
        Row: {
          created_at: string
          descricao: string
          entidade_id: string
          entidade_tipo: string
          id: string
          id_leitor: number | null
          observacao: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          descricao: string
          entidade_id: string
          entidade_tipo: string
          id?: string
          id_leitor?: number | null
          observacao?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string
          entidade_id?: string
          entidade_tipo?: string
          id?: string
          id_leitor?: number | null
          observacao?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      job_execucoes: {
        Row: {
          ano_mes: string
          created_at: string
          data_execucao: string
          destinatarios: string | null
          detalhes: Json | null
          duracao_ms: number | null
          id: string
          mensagem: string | null
          registros_expurgados: number | null
          registros_incluidos: number | null
          status: string
          tipo_job: string
        }
        Insert: {
          ano_mes: string
          created_at?: string
          data_execucao?: string
          destinatarios?: string | null
          detalhes?: Json | null
          duracao_ms?: number | null
          id?: string
          mensagem?: string | null
          registros_expurgados?: number | null
          registros_incluidos?: number | null
          status?: string
          tipo_job: string
        }
        Update: {
          ano_mes?: string
          created_at?: string
          data_execucao?: string
          destinatarios?: string | null
          detalhes?: Json | null
          duracao_ms?: number | null
          id?: string
          mensagem?: string | null
          registros_expurgados?: number | null
          registros_incluidos?: number | null
          status?: string
          tipo_job?: string
        }
        Relationships: []
      }
      leitor: {
        Row: {
          acesso_diretoria: boolean
          bloqueado: boolean
          created_at: string
          curso: string | null
          data_cadastro: string
          email: string
          foto: string | null
          id_auth: string | null
          id_leitor: number
          nome_do_leitor: string
          primeiro_acesso_pendente: boolean
          senha_redefinida: boolean
          status: string | null
          status_cadastro: string
          telefone: string | null
          telefone_fixo: string | null
          ultimo_envio_email_em: string | null
        }
        Insert: {
          acesso_diretoria?: boolean
          bloqueado?: boolean
          created_at?: string
          curso?: string | null
          data_cadastro?: string
          email: string
          foto?: string | null
          id_auth?: string | null
          id_leitor?: never
          nome_do_leitor: string
          primeiro_acesso_pendente?: boolean
          senha_redefinida?: boolean
          status?: string | null
          status_cadastro?: string
          telefone?: string | null
          telefone_fixo?: string | null
          ultimo_envio_email_em?: string | null
        }
        Update: {
          acesso_diretoria?: boolean
          bloqueado?: boolean
          created_at?: string
          curso?: string | null
          data_cadastro?: string
          email?: string
          foto?: string | null
          id_auth?: string | null
          id_leitor?: never
          nome_do_leitor?: string
          primeiro_acesso_pendente?: boolean
          senha_redefinida?: boolean
          status?: string | null
          status_cadastro?: string
          telefone?: string | null
          telefone_fixo?: string | null
          ultimo_envio_email_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leitor_curso_fkey"
            columns: ["curso"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["nome"]
          },
        ]
      }
      leitor_curso: {
        Row: {
          created_at: string
          id: string
          id_curso: string
          id_leitor: number
        }
        Insert: {
          created_at?: string
          id?: string
          id_curso: string
          id_leitor: number
        }
        Update: {
          created_at?: string
          id?: string
          id_curso?: string
          id_leitor?: number
        }
        Relationships: [
          {
            foreignKeyName: "leitor_curso_id_curso_fkey"
            columns: ["id_curso"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leitor_curso_id_leitor_fkey"
            columns: ["id_leitor"]
            isOneToOne: false
            referencedRelation: "leitor"
            referencedColumns: ["id_leitor"]
          },
        ]
      }
      parametros: {
        Row: {
          chave: string
          descricao: string | null
          id: string
          updated_at: string
          valor: string
        }
        Insert: {
          chave: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor: string
        }
        Update: {
          chave?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      pre_reserva: {
        Row: {
          created_at: string | null
          data_validacao: string | null
          id: number
          leitor_id: number
          livro_id: string
          motivo_rejeicao: string | null
          operador_id: string | null
          operador_nome: string | null
          resultado_fluxo: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          data_validacao?: string | null
          id?: number
          leitor_id: number
          livro_id: string
          motivo_rejeicao?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          resultado_fluxo?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          data_validacao?: string | null
          id?: number
          leitor_id?: number
          livro_id?: string
          motivo_rejeicao?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          resultado_fluxo?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_reserva_leitor_id_fkey"
            columns: ["leitor_id"]
            isOneToOne: false
            referencedRelation: "leitor"
            referencedColumns: ["id_leitor"]
          },
          {
            foreignKeyName: "pre_reserva_livro_id_fkey"
            columns: ["livro_id"]
            isOneToOne: false
            referencedRelation: "titulo"
            referencedColumns: ["id_titulo"]
          },
        ]
      }
      profiles: {
        Row: {
          acesso_diretoria: boolean
          avatar_url: string | null
          bloqueado: boolean | null
          created_at: string
          curso: string | null
          email: string
          email_notificacoes: string | null
          full_name: string | null
          id: string
          nome: string | null
          papel: string | null
          primeiro_acesso_pendente: boolean
          role: string | null
          senha_alterada_em: string | null
          senha_redefinida: boolean
          telefone: string | null
          telefone_fixo: string | null
          ultimo_envio_email_em: string | null
        }
        Insert: {
          acesso_diretoria?: boolean
          avatar_url?: string | null
          bloqueado?: boolean | null
          created_at?: string
          curso?: string | null
          email: string
          email_notificacoes?: string | null
          full_name?: string | null
          id: string
          nome?: string | null
          papel?: string | null
          primeiro_acesso_pendente?: boolean
          role?: string | null
          senha_alterada_em?: string | null
          senha_redefinida?: boolean
          telefone?: string | null
          telefone_fixo?: string | null
          ultimo_envio_email_em?: string | null
        }
        Update: {
          acesso_diretoria?: boolean
          avatar_url?: string | null
          bloqueado?: boolean | null
          created_at?: string
          curso?: string | null
          email?: string
          email_notificacoes?: string | null
          full_name?: string | null
          id?: string
          nome?: string | null
          papel?: string | null
          primeiro_acesso_pendente?: boolean
          role?: string | null
          senha_alterada_em?: string | null
          senha_redefinida?: boolean
          telefone?: string | null
          telefone_fixo?: string | null
          ultimo_envio_email_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_curso_fkey"
            columns: ["curso"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["nome"]
          },
        ]
      }
      reserva: {
        Row: {
          created_at: string
          data_atendimento: string | null
          data_limite_desejada: string | null
          data_limite_retirada: string | null
          data_notificacao: string | null
          data_reserva: string
          exemplar_reservado_id: string | null
          id_leitor: number
          id_reserva: number
          id_titulo: string
          notificacao_enviada: boolean | null
          ordem_fila: number | null
          posicao_fila: number | null
          status: string | null
          status_reserva: string
        }
        Insert: {
          created_at?: string
          data_atendimento?: string | null
          data_limite_desejada?: string | null
          data_limite_retirada?: string | null
          data_notificacao?: string | null
          data_reserva?: string
          exemplar_reservado_id?: string | null
          id_leitor: number
          id_reserva?: never
          id_titulo: string
          notificacao_enviada?: boolean | null
          ordem_fila?: number | null
          posicao_fila?: number | null
          status?: string | null
          status_reserva?: string
        }
        Update: {
          created_at?: string
          data_atendimento?: string | null
          data_limite_desejada?: string | null
          data_limite_retirada?: string | null
          data_notificacao?: string | null
          data_reserva?: string
          exemplar_reservado_id?: string | null
          id_leitor?: number
          id_reserva?: never
          id_titulo?: string
          notificacao_enviada?: boolean | null
          ordem_fila?: number | null
          posicao_fila?: number | null
          status?: string | null
          status_reserva?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserva_exemplar_reservado_id_fkey"
            columns: ["exemplar_reservado_id"]
            isOneToOne: false
            referencedRelation: "exemplar"
            referencedColumns: ["id_exemplar"]
          },
          {
            foreignKeyName: "reserva_id_leitor_fkey"
            columns: ["id_leitor"]
            isOneToOne: false
            referencedRelation: "leitor"
            referencedColumns: ["id_leitor"]
          },
          {
            foreignKeyName: "reserva_id_titulo_fkey"
            columns: ["id_titulo"]
            isOneToOne: false
            referencedRelation: "titulo"
            referencedColumns: ["id_titulo"]
          },
        ]
      }
      titulo: {
        Row: {
          ano_publicacao: number | null
          ativo: boolean
          author_id: string | null
          autor: string
          autor_espiritual: string | null
          autor_mediunico: string | null
          capa_url: string | null
          categoria: string | null
          colecao: string
          created_at: string
          editora: string | null
          id_titulo: string
          isbn: string | null
          sinopse: string | null
          titulo_de_livro: string
          vol: number
        }
        Insert: {
          ano_publicacao?: number | null
          ativo?: boolean
          author_id?: string | null
          autor: string
          autor_espiritual?: string | null
          autor_mediunico?: string | null
          capa_url?: string | null
          categoria?: string | null
          colecao?: string
          created_at?: string
          editora?: string | null
          id_titulo: string
          isbn?: string | null
          sinopse?: string | null
          titulo_de_livro: string
          vol?: number
        }
        Update: {
          ano_publicacao?: number | null
          ativo?: boolean
          author_id?: string | null
          autor?: string
          autor_espiritual?: string | null
          autor_mediunico?: string | null
          capa_url?: string | null
          categoria?: string | null
          colecao?: string
          created_at?: string
          editora?: string | null
          id_titulo?: string
          isbn?: string | null
          sinopse?: string | null
          titulo_de_livro?: string
          vol?: number
        }
        Relationships: [
          {
            foreignKeyName: "titulo_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_user: {
        Args: {
          new_avatar_url?: string
          new_email: string
          new_nome: string
          new_papel?: string
          new_password: string
        }
        Returns: Json
      }
      admin_reset_password: {
        Args: { new_password: string; target_user_id: string }
        Returns: Json
      }
      app_can_access_diretoria: { Args: never; Returns: boolean }
      app_is_staff: { Args: never; Returns: boolean }
      app_user_papel: { Args: never; Returns: string }
      aprovar_cadastro_leitor: { Args: { p_id_leitor: number }; Returns: Json }
      atender_reserva: {
        Args: { p_id_reserva: number; p_operador_nome?: string }
        Returns: Json
      }
      atualizar_status_atrasos: { Args: never; Returns: number }
      calcular_prazo_dias_uteis: {
        Args: { p_data_inicio?: string; p_qtd_dias_uteis?: number }
        Returns: string
      }
      check_email_exists: {
        Args: { check_email: string; exclude_user_id?: string }
        Returns: boolean
      }
      check_leitor_status: { Args: { p_email: string }; Returns: string }
      concluir_definicao_senha: { Args: never; Returns: Json }
      confirm_user_email: { Args: { user_id: string }; Returns: undefined }
      confirmar_retirada_emprestimo: {
        Args: { p_emprestimo_id: number; p_operador_nome?: string }
        Returns: Json
      }
      criar_pre_reserva: {
        Args: {
          p_leitor_id: number
          p_livro_id: string
          p_operador_nome?: string
        }
        Returns: Json
      }
      current_profile: { Args: never; Returns: string }
      dearmor: { Args: { "": string }; Returns: string }
      delete_leitor: { Args: { p_id_leitor: number }; Returns: Json }
      delete_user: { Args: { target_user_id: string }; Returns: Json }
      devolver_exemplar: {
        Args: { p_id_exemplar: string; p_usuario_sistema?: string }
        Returns: Json
      }
      devolver_exemplar_v2: {
        Args: { p_id_exemplar: string; p_operador_nome?: string }
        Returns: Json
      }
      emprestar_exemplar: {
        Args: {
          p_id_exemplar: string
          p_id_leitor: number
          p_usuario_sistema?: string
        }
        Returns: Json
      }
      expurgar_historico_em_lotes: {
        Args: { p_batch_size?: number; p_dias_retencao?: number }
        Returns: Json
      }
      gen_random_uuid: { Args: never; Returns: string }
      gen_salt: { Args: { "": string }; Returns: string }
      gerar_id_titulo: {
        Args: { p_autor: string; p_titulo?: string }
        Returns: string
      }
      get_current_user_papel: { Args: never; Returns: string }
      leitor_tem_acesso_diretoria: {
        Args: { p_id_leitor: number }
        Returns: boolean
      }
      marcar_reset_senha_pendente: { Args: { p_email: string }; Returns: Json }
      pgp_armor_headers: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      processar_expiracoes_automaticas: {
        Args: { p_operador_nome?: string }
        Returns: Json
      }
      registrar_auditoria_transicao: {
        Args: {
          p_entidade: string
          p_estado_anterior: string
          p_estado_novo: string
          p_motivo?: string
          p_operador_id: string
          p_operador_nome: string
          p_payload?: Json
          p_registro_id: string
        }
        Returns: undefined
      }
      registrar_envio_email_acesso: { Args: { p_email: string }; Returns: Json }
      renovar_emprestimo: {
        Args: { p_id_emprestimo: number; p_usuario_sistema?: string }
        Returns: Json
      }
      semear_feriados_padrao: { Args: { p_ano: number }; Returns: number }
      sync_leitor_cursos:
        | {
            Args: { p_curso_ids: string[]; p_id_leitor: number }
            Returns: Json
          }
        | {
            Args: { p_curso_ids: string[]; p_id_leitor: number }
            Returns: Json
          }
      update_user_info:
        | {
            Args: {
              new_avatar_url?: string
              new_email: string
              new_name: string
              new_role: string
              new_telefone?: string
              target_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              new_avatar_url?: string
              new_email: string
              new_email_notificacoes?: string
              new_name: string
              new_role: string
              new_telefone?: string
              target_user_id: string
            }
            Returns: Json
          }
      validar_pre_reserva: {
        Args: {
          p_acao: string
          p_motivo_rejeicao?: string
          p_operador_id?: string
          p_operador_nome?: string
          p_pre_reserva_id: number
        }
        Returns: Json
      }
      verificar_atrasos_geral: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

