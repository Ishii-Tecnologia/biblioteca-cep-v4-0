import React, { useState, useMemo } from 'react'
import { useAuth } from '@/hooks/use-auth'
import {
  BookOpen,
  Users,
  Repeat,
  BookmarkCheck,
  Settings,
  Shield,
  Search,
  CheckCircle2,
  AlertTriangle,
  Info,
  Calendar,
  GraduationCap,
  Mail,
  KeyRound,
  FileSpreadsheet,
  Clock,
  ArrowRight,
  BookMarked,
  Briefcase,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Layers,
  Sparkles,
  UserCheck,
  Building2,
  History,
  Lock,
  Unlock,
  Trash2,
  UserPlus,
  Send,
  Eye,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Link } from 'react-router-dom'

interface StepItem {
  number: number
  title: string
  detail: string
  tip?: string
}

interface ExampleBox {
  title: string
  context: string
  action: string
  result: string
  type?: 'success' | 'warning' | 'info' | 'error'
}

interface ManualTopic {
  id: string
  title: string
  shortTitle: string
  profile: 'operador' | 'leitor'
  category: string
  icon: React.ElementType
  summary: string
  prerequisites?: string[]
  steps: StepItem[]
  systemMessages?: { text: string; meaning: string }[]
  example?: ExampleBox
  rules?: string[]
  screenUrl?: string
  screenButtonText?: string
}

export default function Manual() {
  const { isOperadorOrAdmin, isAdmin, profile } = useAuth()

  // Perfil padrão: operador (o acesso já é restrito a operadores/admin na rota e navegação)
  const [activeTab, setActiveTab] = useState<'operador' | 'leitor'>('operador')
  const [searchFilter, setSearchFilter] = useState('')
  const [activeSectionId, setActiveSectionId] = useState<string>('op-leitores')
  const [mobileTocOpen, setMobileTocOpen] = useState(false)

  // Lista de tópicos operacionais
  const operatorTopics: ManualTopic[] = [
    {
      id: 'op-leitores-cadastro',
      shortTitle: 'Cadastrar Leitor',
      title: 'Gestão de Leitores: Novo Cadastro Completo',
      profile: 'operador',
      category: 'Gestão de Leitores',
      icon: UserPlus,
      screenUrl: '/leitores',
      screenButtonText: 'Abrir Gestão de Leitores',
      summary:
        'Como registrar um novo leitor presencialmente ou por demanda da secretaria, preenchendo dados pessoais, cursos na CEP e senha inicial.',
      prerequisites: [
        'Estar logado com perfil de Operador ou Administrador.',
        'Ter o e-mail válido do leitor (não pode ser domínio descartável nem duplicado).',
      ],
      steps: [
        {
          number: 1,
          title: 'Acessar o menu Leitores',
          detail: 'No menu principal superior (ou drawer lateral), clique em "Leitores".',
        },
        {
          number: 2,
          title: 'Acionar o botão de cadastro',
          detail: 'No canto superior direito da página, clique no botão "Cadastrar Novo Leitor".',
        },
        {
          number: 3,
          title: 'Preencher os Dados Pessoais (Coluna Única)',
          detail:
            'Preencha o Nome Completo (obrigatório, mín. 3 letras), E-mail de contato e o Telefone Celular com DDD (máscara automática: (99) 99999-9999). Se houver, informe também o Telefone Fixo.',
          tip: 'O modal opera em coluna única para maior ergonomia e clareza de validação.',
        },
        {
          number: 4,
          title: 'Vincular o(s) Curso(s) Frequentado(s) na CEP',
          detail:
            'No campo "Curso(s) que está frequentando na CEP", selecione os cursos dos quais o leitor participa (ex: ESDE, Infância, Mocidade, Passes, Obras Básicas) e clique em "Adicionar Curso". É possível vincular múltiplos cursos.',
        },
        {
          number: 5,
          title: 'Definir Senha Inicial e Permissão de Diretoria',
          detail:
            'Informe a senha provisória de primeiro acesso (mínimo 6 caracteres). Se o leitor for membro da Diretoria Executiva da CEP, marque a caixa "Permitir empréstimos da Coleção Diretoria (Biblioteca Rino Curti)".',
        },
        {
          number: 6,
          title: 'Salvar e Concluir',
          detail:
            'Clique no botão "Cadastrar Leitor". O sistema criará o registro ativo imediatamente e enviará o e-mail de boas-vindas/primeiro acesso com a identidade da CEP.',
        },
      ],
      rules: [
        'O e-mail deve ser único na base; domínios descartáveis (ex: @tempmail, @guerrillamail) são rejeitados automaticamente.',
        'Ao salvar, o leitor já fica ativo e pode receber empréstimos de imediato.',
      ],
      example: {
        title: 'Exemplo: Cadastro de Aluno do ESDE I',
        context:
          'O leitor Carlos Eduardo deseja retirar livros do acervo e frequenta o curso de Terça-feira.',
        action:
          'O operador preenche Nome: Carlos Eduardo, Celular: (11) 98765-4321, E-mail: carlos.edu@gmail.com, seleciona o curso "ESDE I" e clica em Cadastrar Leitor.',
        result:
          'O leitor é criado com ID gerado (ex: #42). Um e-mail com link de primeiro acesso é enviado para carlos.edu@gmail.com com validade de 1 hora.',
        type: 'success',
      },
      systemMessages: [
        {
          text: 'Leitor cadastrado com sucesso!',
          meaning: 'Conta criada e e-mail de boas-vindas disparado.',
        },
        {
          text: 'O e-mail informado já está cadastrado para outro leitor.',
          meaning: 'Já existe um cadastro com este mesmo e-mail na base.',
        },
      ],
    },
    {
      id: 'op-leitores-validacao',
      shortTitle: 'Aprovar Auto-Cadastros',
      title: 'Aprovação de Cadastros "Pendentes de Validação"',
      profile: 'operador',
      category: 'Gestão de Leitores',
      icon: CheckCircle2,
      screenUrl: '/leitores',
      screenButtonText: 'Ver Leitores Pendentes',
      summary:
        'Como o operador revisa e aprova ou recusa as solicitações de cadastro feitas pelos próprios leitores na tela inicial/login.',
      prerequisites: [
        'Existirem cadastros submetidos pelos leitores com status "Pendente de Validação".',
      ],
      steps: [
        {
          number: 1,
          title: 'Localizar a lista de pendentes',
          detail:
            'Na página "Leitores", use o botão de filtro "Pendentes de Validação" (badge em destaque âmbar).',
        },
        {
          number: 2,
          title: 'Revisar os dados do leitor',
          detail:
            'Observe o nome, foto enviada, e-mail institucional/pessoal e os cursos informados pelo interessado.',
        },
        {
          number: 3,
          title: 'Aprovar o cadastro',
          detail:
            'Clique no botão verde "Aprovar" no card do leitor. Confirme no modal clicando em "Sim, Aprovar e Enviar E-mail".',
        },
        {
          number: 4,
          title: 'Disparo do Link de Primeiro Acesso',
          detail:
            'O sistema ativa o cadastro do leitor e dispara automaticamente um e-mail com o link de definição de senha com remetente institucional "Biblioteca da Coligação Espírita Progressista (CEP)".',
          tip: 'O link enviado para o leitor expira em 1 hora.',
        },
        {
          number: 5,
          title: 'Recusar cadastro (se aplicável)',
          detail:
            'Se a solicitação for spam, inconsistente ou indevida, clique em "Recusar" e confirme a remoção. O registro temporário é excluído e o e-mail volta a ficar disponível.',
        },
      ],
      rules: [
        'Caso já tenha havido disparo recente para o mesmo e-mail, o sistema ativa o leitor mas aplica proteção de taxa (cooldown) para não sofrer bloqueio de spam.',
        'Após aprovação, o leitor migra de status "Pendente" para "Ativo".',
      ],
      example: {
        title: 'Exemplo: Leitora que se auto-cadastrou pelo celular',
        context:
          'Maria Souza solicitou cadastro na tela de login. O card dela exibe a etiqueta "Pendente de Validação".',
        action: 'O operador clica no botão "Aprovar" no card de Maria Souza e confirma.',
        result:
          'Maria recebe no e-mail dela o link institucional "Biblioteca da Coligação Espírita Progressista (CEP) — Defina sua Senha". Ela clica, define sua senha e acessa o acervo.',
        type: 'success',
      },
      systemMessages: [
        {
          text: 'Cadastro aprovado com sucesso!',
          meaning: 'Leitor ativado e e-mail de primeiro acesso despachado.',
        },
        {
          text: 'Você já enviou um e-mail para este leitor recentemente. Aguarde alguns minutos antes de reenviar.',
          meaning: 'Proteção contra spam de disparo ativo (cooldown).',
        },
      ],
    },
    {
      id: 'op-leitores-reenvio',
      shortTitle: 'Reenviar Link de Acesso',
      title: 'Reenvio de Link de Primeiro Acesso com Cooldown',
      profile: 'operador',
      category: 'Gestão de Leitores',
      icon: Send,
      screenUrl: '/leitores',
      screenButtonText: 'Ir para Leitores',
      summary:
        'Como reenviar o link de ativação caso o leitor tenha deixado a hora limite expirar ou não tenha recebido.',
      steps: [
        {
          number: 1,
          title: 'Localizar o leitor',
          detail:
            'Utilize o campo de busca por nome, e-mail ou telefone para achar o cadastro do leitor.',
        },
        {
          number: 2,
          title: 'Verificar status do botão de reenvio',
          detail: 'No rodapé do card do leitor, clique no botão "Reenviar Link".',
          tip: 'Se o botão tiver sido clicado há menos de 60 segundos, ele exibirá um cronômetro regressivo: "Reenviar (45s)". O botão fica travado até o término.',
        },
        {
          number: 3,
          title: 'Notificar o leitor',
          detail:
            'Oriente o leitor a verificar a caixa de entrada (e pasta de lixo eletrônico/spam). O e-mail chega com o título de definição de senha da Biblioteca CEP e expira em 1 hora.',
        },
      ],
      rules: [
        'O link expira impreterivelmente em 1 hora por segurança de credenciais.',
        'O remetente exibe o nome institucional "Biblioteca da Coligação Espírita Progressista (CEP)".',
      ],
      example: {
        title: 'Exemplo: Leitor não encontrou o e-mail na hora',
        context:
          'O leitor João avisa no balcão que o e-mail não chegou ou que o link de ontem diz "expirado".',
        action: 'O operador localiza o card de João e clica em "Reenviar Link".',
        result:
          'Um novo token de 1 hora é gerado e o botão passa a exibir "Reenviar (60s)" em contagem regressiva.',
        type: 'info',
      },
    },
    {
      id: 'op-leitores-bloqueio-exclusao',
      shortTitle: 'Bloquear e Excluir Leitor',
      title: 'Bloqueio de Retirada e Exclusão Segura de Leitor',
      profile: 'operador',
      category: 'Gestão de Leitores',
      icon: Lock,
      screenUrl: '/leitores',
      screenButtonText: 'Gerenciar Leitores',
      summary:
        'Regras e procedimentos para suspender temporariamente novos empréstimos ou remover definitivamente o cadastro de um leitor.',
      steps: [
        {
          number: 1,
          title: 'Bloquear / Desbloquear Leitor',
          detail:
            'Clique no botão "Bloquear" no card do leitor. Enquanto bloqueado, ele NÃO poderá realizar novos empréstimos nem retirar reservas contempladas.',
        },
        {
          number: 2,
          title: 'Desbloquear Leitor',
          detail:
            'Quando a situação for regularizada, clique em "Desbloquear" para restituir imediatamente a capacidade de retirada.',
        },
        {
          number: 3,
          title: 'Excluir Leitor (Somente Administrador)',
          detail:
            'Clique no ícone de lixeira (Trash) no canto inferior direito do card do leitor e confirme a exclusão.',
        },
      ],
      rules: [
        'O sistema BLOQUEIA a exclusão se houver empréstimo em aberto ou reserva ativa pendente. Primeiro é obrigatório devolver os livros ou cancelar as reservas.',
        'Ao excluir um leitor, o e-mail dele é totalmente desvinculado e liberado para novo uso futuro.',
      ],
      systemMessages: [
        {
          text: 'Não é possível excluir leitor com empréstimos ativos em andamento.',
          meaning: 'O leitor possui livros em sua posse que precisam ser devolvidos antes.',
        },
        {
          text: 'Não é possível excluir leitor com reserva ativa pendente.',
          meaning: 'Cancele a reserva na tela de Reservas antes de excluir o cadastro.',
        },
      ],
      example: {
        title: 'Exemplo: Tentativa de exclusão de leitor com livro emprestado',
        context:
          'Operador tenta excluir o leitor Paulo, que está com o livro "Nosso Lar" emprestado.',
        action:
          'Ao clicar no botão de excluir, o sistema exibe alerta vermelho impedindo a operação.',
        result: 'O leitor é mantido na base com integridade referencial protegida.',
        type: 'warning',
      },
    },
    {
      id: 'op-acervo-cadastros',
      shortTitle: 'Cadastrar Livros & Exemplares',
      title: 'Gestão de Acervo: Bibliotecas Cecília Braga e Rino Curti',
      profile: 'operador',
      category: 'Acervo & Exemplares',
      icon: BookOpen,
      screenUrl: '/acervo',
      screenButtonText: 'Abrir Acervo',
      summary:
        'Como cadastrar novas obras, definir a biblioteca correta, adicionar múltiplos exemplares físicos e gerar códigos determinísticos.',
      steps: [
        {
          number: 1,
          title: 'Acessar o Acervo correspondente',
          detail:
            'Use o menu "Acervo": selecione "Biblioteca Cecília Braga" (acervo geral) ou "Biblioteca Rino Curti" (acervo especial, restrito à Diretoria).',
        },
        {
          number: 2,
          title: 'Clicar em "Novo Livro"',
          detail: 'Clique no botão verde "Novo Livro" no canto superior direito do acervo.',
        },
        {
          number: 3,
          title: 'Busca Automática por ISBN ou Código de Barras (Opcional)',
          detail:
            'Você pode digitar o ISBN ou escanear o código de barras com a câmera do celular/leitor óptico para preencher título, autor, editora e capa automaticamente via Google Books / OpenLibrary.',
        },
        {
          number: 4,
          title: 'Regra de Formação de Código de Livro (id_titulo)',
          detail:
            'O sistema gera o código automaticamente: para autores espíritas (médium + espírito), extrai as iniciais dos dois (ex: Chico Xavier + Emmanuel vira "CX-EM001"). Para autor convencional, usa as iniciais do autor (ex: Allan Kardec vira "AK-001"). Na coleção Diretoria, ganha o prefixo "DIR-" (ex: "DIR-CX-EM001").',
        },
        {
          number: 5,
          title: 'Definir Quantidade de Exemplares Iniciais',
          detail:
            'Informe a quantidade de cópias físicas (ex: 2 exemplares). O sistema gerará os códigos sequenciais de exemplar: "CX-EM001-1" e "CX-EM001-2".',
        },
        {
          number: 6,
          title: 'Gerenciar Exemplares Avulsos',
          detail:
            'Posteriormente, no card do livro no Acervo, clique no botão "Exemplares" para adicionar novas cópias, alterar status (Disponível, Em Manutenção, Danificado) ou excluir cópias que não estejam emprestadas.',
        },
      ],
      rules: [
        'A Biblioteca Cecília Braga é de livre acesso a todos os leitores cadastrados.',
        'A Biblioteca Rino Curti é restrita: apenas leitores com a marcação "Acesso Diretoria" podem solicitar ou retirar livros dela.',
      ],
      example: {
        title: 'Exemplo: Adição de 3 exemplares de "O Evangelho Segundo o Espiritismo"',
        context: 'Livro de Allan Kardec código AK-002 para o acervo Cecília Braga.',
        action: 'Operador cadastra a obra com 3 exemplares físicos.',
        result: 'Criados os exemplares AK-002-1, AK-002-2 e AK-002-3 com status DISPONÍVEL.',
        type: 'success',
      },
    },
    {
      id: 'op-acervo-csv',
      shortTitle: 'Importação em Lote via CSV',
      title: 'Importação de Acervo via Planilha CSV',
      profile: 'operador',
      category: 'Acervo & Exemplares',
      icon: FileSpreadsheet,
      screenUrl: '/acervo',
      screenButtonText: 'Ver Importação CSV no Acervo',
      summary:
        'Procedimento para cadastrar dezenas ou centenas de livros e seus exemplares a partir de um arquivo delimitado por ponto e vírgula.',
      steps: [
        {
          number: 1,
          title: 'Abrir a tela de importação',
          detail: 'No cabeçalho da tela de Acervo, clique no botão "Importar CSV".',
        },
        {
          number: 2,
          title: 'Baixar o Modelo CSV Oficial',
          detail:
            'Clique no botão "Baixar Modelo CSV" para garantir o cabeçalho exato e o caractere delimitador (padrão: ponto e vírgula ";").',
        },
        {
          number: 3,
          title: 'Preencher as Colunas Obrigatórias',
          detail:
            'Preencha: titulo, autor_convencional ou (autor_espirito + autor_medium), editora, ano, categoria, colecao (geral ou diretoria) e quantidade de exemplares.',
        },
        {
          number: 4,
          title: 'Carregar e Validar',
          detail:
            'Arraste o arquivo CSV. O sistema analisará linha a linha, validará ISBNs duplicados dentro do lote e exibirá a prévia com eventuais avisos.',
        },
        {
          number: 5,
          title: 'Executar Importação',
          detail:
            'Clique em "Processar Importação". Os livros e todos os exemplares derivados (ex: DIR-CX-EM005-1, DIR-CX-EM005-2) serão gerados com registro no log de auditoria.',
        },
      ],
      rules: [
        'O delimitador de campo deve seguir a configuração do sistema (ponto e vírgula).',
        'Livros com colecao="diretoria" são vinculados automaticamente à Biblioteca Rino Curti.',
      ],
      example: {
        title: 'Exemplo: Importação de 50 títulos com 75 exemplares',
        context: 'Secretaria preparou a planilha de doações recebidas no semestre.',
        action: 'Operador carrega "doacoes_2025.csv" e clica em Iniciar Importação.',
        result:
          'O relatório final informa: "50 títulos importados (75 exemplares gerados), 0 rejeitados". O registro é auditado em Relatórios / Histórico.',
        type: 'success',
      },
    },
    {
      id: 'op-emprestimos-ciclo',
      shortTitle: 'Ciclo do Empréstimo & PENDENTE_RETIRADA',
      title: 'Ciclo Completo: Aguardando Retirada, Ativação e Devolução',
      profile: 'operador',
      category: 'Empréstimos & Devoluções',
      icon: Repeat,
      screenUrl: '/emprestimos',
      screenButtonText: 'Abrir Tela de Empréstimos',
      summary:
        'Roteiro passo a passo do fluxo de empréstimo: geração de reserva/retirada, prazo de 4 dias úteis, confirmação de retirada física e devolução com avanço FIFO na fila.',
      steps: [
        {
          number: 1,
          title: 'Novo Empréstimo Presencial Direto',
          detail:
            'Na página de Empréstimos, clique em "Novo Empréstimo". Selecione o leitor e escolha o exemplar DISPONÍVEL da obra desejada.',
        },
        {
          number: 2,
          title: 'Estado "Aguardando Retirada" (PENDENTE_RETIRADA)',
          detail:
            'Quando um empréstimo é gerado a partir de uma pré-reserva ou reserva atendida, ele entra com status PENDENTE_RETIRADA. O leitor tem um prazo de 4 dias úteis para comparecer à biblioteca física da CEP.',
          tip: 'O exemplar correspondente fica BLOQUEADO para que ninguém mais o retire.',
        },
        {
          number: 3,
          title: 'Confirmar Retirada Física na Biblioteca',
          detail:
            'Quando o leitor comparece ao balcão e retira o livro em mãos, o operador clica no botão "Confirmar Retirada" na aba "Aguardando Retirada" de Empréstimos.',
        },
        {
          number: 4,
          title: 'Transição para ATIVO e Início do Prazo de 15 Dias',
          detail:
            'Ao confirmar, o status transiciona para ATIVO e passa a contar o prazo regular do empréstimo (padrão: 15 dias corridos).',
        },
        {
          number: 5,
          title: 'Devolução do Exemplar',
          detail:
            'Na devolução do livro, o operador localiza o empréstimo ativo e clica no botão "Devolver". Confirma as condições do exemplar.',
        },
        {
          number: 6,
          title: 'Contemplação Automática da Fila (FIFO)',
          detail:
            'Se houver outros leitores na fila de espera daquela obra, o sistema contempla automaticamente o 1º leitor da fila (critério FIFO — First In, First Out). A reserva dele é atendida, o exemplar permanece BLOQUEADO e gera um novo empréstimo PENDENTE_RETIRADA com 4 dias úteis para o novo contemplado.',
        },
      ],
      rules: [
        'Limite por leitor: máximo de 4 livros distintos emprestados simultaneamente.',
        'Se o leitor tentar retirar um 5º livro, o sistema exibe erro: "O leitor atingiu o limite de 4 empréstimos".',
        'Cada empréstimo permite 1 renovação desde que não haja fila de espera para a obra.',
      ],
      example: {
        title: 'Exemplo: Devolução de obra concorrida',
        context:
          'O leitor André devolve o livro "Violetas na Janela", que possui Bia como 1ª da fila de espera.',
        action: 'O operador clica em "Devolver".',
        result:
          'O empréstimo de André é marcado como Devolvido. Imediatamente o sistema aloca o exemplar para Bia, gerando um registro "Aguardando Retirada" de 4 dias úteis e enviando notificação de disponibilidade.',
        type: 'success',
      },
      systemMessages: [
        {
          text: 'O leitor atingiu o limite de 4 empréstimos',
          meaning:
            'O leitor já possui 4 obras em aberto e precisa devolver ao menos uma antes de pegar outra.',
        },
        {
          text: 'Este empréstimo já atingiu o limite de 1 renovação permitida.',
          meaning: 'Não é possível renovar novamente o mesmo empréstimo.',
        },
      ],
    },
    {
      id: 'op-reservas-filas',
      shortTitle: 'Reservas, Pré-Reservas & Fila de Espera',
      title: 'Gestão de Fila de Reservas e Aprovação de Solicitações',
      profile: 'operador',
      category: 'Reservas & Fila',
      icon: BookmarkCheck,
      screenUrl: '/reservas',
      screenButtonText: 'Abrir Gestão de Reservas',
      summary:
        'Como gerenciar a fila máxima de 2 leitores por livro, aprovar pré-reservas digitais, atender reservas manualmente e entender o job automático de expiração.',
      steps: [
        {
          number: 1,
          title: 'Visualizar a Fila de Reservas',
          detail:
            'Na página "Reservas", a aba principal "Fila de Reservas" lista todos os livros com reservas ativas e a ordem de posicionamento dos leitores.',
        },
        {
          number: 2,
          title: 'Acessar a aba "Pré-Reservas (Solicitações)"',
          detail:
            'Aba com badge numérico indicando pré-reservas pendentes de validação feitas pelos leitores pelo catálogo digital.',
        },
        {
          number: 3,
          title: 'Aprovar Solicitação de Pré-Reserva',
          detail:
            'O operador clica no botão "Aprovar". O sistema checa se o leitor não está bloqueado e valida se o leitor não estourou o limite de 4 empréstimos ou 4 reservas.',
        },
        {
          number: 4,
          title: 'Alocação Imediata vs Entrada na Fila',
          detail:
            'Se houver exemplar disponível no acervo, o exemplar vira BLOQUEADO e gera um empréstimo PENDENTE_RETIRADA de 4 dias úteis. Se todos estiverem emprestados e a fila tiver menos de 2 pessoas, o leitor entra na fila ordenada.',
        },
        {
          number: 5,
          title: 'Rejeitar Solicitação',
          detail:
            'Se não for possível atender, clique em "Rejeitar" e preencha a justificativa obrigatória no modal (ex: obra em restauração, leitor com pendência).',
        },
        {
          number: 6,
          title: 'Atender Reserva Manualmente',
          detail:
            'Quando um exemplar físico for localizado no acervo, o operador pode clicar em "Atender Reserva" para contemplar o leitor da vez imediatamente.',
        },
        {
          number: 7,
          title: 'Job Automático de Expiração de Prazos',
          detail:
            'O sistema possui rotina que monitora as reservas prontas para retirada. Se passarem os 4 dias úteis sem retirada, o status é marcado como "Expirada" e a vez passa automaticamente para o próximo leitor da fila.',
        },
      ],
      rules: [
        'Limite da fila de espera por livro: máximo de 2 leitores simultâneos na fila.',
        'Se um 3º leitor tentar reservar uma obra com 2 reservas ativas, o sistema rejeita com a mensagem: "Não há disponibilidade para mais reservas."',
        'Se o operador tentar atender uma reserva e nenhum exemplar estiver apto, o sistema informa: "Nenhum exemplar disponível para atender esta reserva no momento."',
      ],
      systemMessages: [
        {
          text: 'Não há disponibilidade para mais reservas.',
          meaning:
            'A fila daquela obra já atingiu o limite de 2 leitores configurado nos parâmetros.',
        },
        {
          text: 'Nenhum exemplar disponível para atender esta reserva no momento.',
          meaning: 'Todos os exemplares estão emprestados, perdidos ou em manutenção.',
        },
      ],
      example: {
        title: 'Exemplo: Terceiro leitor tentando reservar a mesma obra',
        context:
          'O livro "O Livro dos Espíritos" já possui Leitor 1 (posição 1) e Leitor 2 (posição 2) na fila.',
        action: 'Um terceiro leitor tenta solicitar a reserva.',
        result:
          'O sistema rejeita a operação com o aviso: "Não há disponibilidade para mais reservas."',
        type: 'warning',
      },
    },
    {
      id: 'op-config-parametros',
      shortTitle: 'Parâmetros Rígidos & Feriados',
      title: 'Configurações do Sistema: Parâmetros, Feriados e Auditoria',
      profile: 'operador',
      category: 'Administração & Sistema',
      icon: Settings,
      screenUrl: '/configuracoes',
      screenButtonText: 'Abrir Configurações',
      summary:
        'Módulo exclusivo para Administradores: ajuste de prazos úteis, limites rígidos, semeadura de feriados nacionais e auditoria de transições de estado.',
      prerequisites: ['Acesso restrito ao perfil Administrador.'],
      steps: [
        {
          number: 1,
          title: 'Acessar o menu "Configurações"',
          detail: 'No menu principal, clique em "Configurações" (visível apenas para Admins).',
        },
        {
          number: 2,
          title: 'Aba "Parâmetros"',
          detail:
            'Visualize e ajuste os parâmetros institucionais: PRAZO_RETIRADA_DIAS_UTEIS (padrão: 4), LIMITE_FILA_RESERVAS (padrão: 2), LIMITE_EMPRESTIMOS_LEITOR (padrão: 4), LIMITE_RESERVAS_LEITOR (padrão: 4), PRAZO_EMPRESTIMO_DIAS (padrão: 15) e canais de notificação (E-mail / SMS).',
        },
        {
          number: 3,
          title: 'Aba "Feriados" (Cálculo de Dias Úteis)',
          detail:
            'Gerencie o calendário de feriados do ano. O botão "Semear Padrões" insere automaticamente todos os feriados nacionais do ano selecionado. Você também pode adicionar datas municipais ou feriados locais.',
          tip: 'Regra de dias úteis: Domingo NÃO conta; SÁBADO CONTA como dia útil na Biblioteca CEP.',
        },
        {
          number: 4,
          title: 'Aba "Auditoria de Transições"',
          detail:
            'Acompanhe o log determinístico com registro de quem, quando e de/para qual estado ocorreu cada movimentação de exemplar, empréstimo e reserva no sistema.',
        },
      ],
      rules: [
        'A alteração de parâmetros afeta imediatamente as novas transações no sistema.',
        'Sábado é dia normal de atendimento na CEP e é contabilizado no prazo de retirada de 4 dias úteis.',
      ],
      example: {
        title: 'Exemplo: Início do ano novo e semeadura de feriados',
        context:
          'Na virada de ano, a biblioteca precisa assegurar que feriados como Tiradentes, Páscoa e Natal sejam respeitados.',
        action:
          'O Admin acessa Configurações > Feriados, escolhe o novo ano e clica em "Semear Padrões".',
        result:
          'Todos os feriados federais são gravados e o cálculo de 4 dias úteis passa a pular automaticamente essas datas.',
        type: 'info',
      },
    },
  ]

  // Lista de tópicos para Leitores
  const readerTopics: ManualTopic[] = [
    {
      id: 'leitor-autocadastro',
      shortTitle: 'Criar Conta (Auto-cadastro)',
      title: 'Como se Cadastrar na Biblioteca pela Tela de Login',
      profile: 'leitor',
      category: 'Conta & Acesso',
      icon: UserPlus,
      screenUrl: '/login',
      screenButtonText: 'Ir para Tela de Login',
      summary:
        'Passo a passo para novos frequentadores solicitarem seu cadastro de leitor diretamente pelo navegador ou celular.',
      steps: [
        {
          number: 1,
          title: 'Acessar a tela de Login',
          detail: 'No canto superior direito da página inicial, clique no botão verde "Entrar".',
        },
        {
          number: 2,
          title: 'Clicar em "Cadastrar-se como Leitor"',
          detail:
            'Abaixo dos campos de e-mail e senha, clique no botão "Cadastrar-se como Leitor".',
        },
        {
          number: 3,
          title: 'Preencher seus dados de contato',
          detail:
            'Informe seu Nome Completo, Telefone Celular com WhatsApp e seu melhor E-mail para contato.',
        },
        {
          number: 4,
          title: 'Validação de E-mail em Tempo Real',
          detail:
            'O sistema verifica se o domínio do seu e-mail é real e ativo. E-mails temporários ou descartáveis (ex: @10minutemail, @tempmail) são bloqueados.',
          tip: 'Você pode usar qualquer provedor de e-mail autêntico (Gmail, Hotmail, Outlook, Yahoo, empresa, etc.).',
        },
        {
          number: 5,
          title: 'Adicionar Cursos Frequentados na CEP',
          detail:
            'Informe os cursos ou atividades que você frequenta na Coligação Espírita Progressista (ex: ESDE, Estudo das Obras Básicas, Infância).',
        },
        {
          number: 6,
          title: 'Foto de Perfil (Opcional)',
          detail:
            'Você pode enviar uma foto sua ou colar diretamente da área de transferência para facilitar sua identificação no balcão de empréstimos.',
        },
        {
          number: 7,
          title: 'Enviar Solicitação',
          detail:
            'Clique em "Enviar Solicitação de Cadastro". Não é necessário criar senha agora: a solicitação irá para validação dos operadores voluntários da CEP.',
        },
      ],
      rules: [
        'Cadastros duplicados com o mesmo e-mail não são permitidos.',
        'Após aprovação pela equipe, você receberá o e-mail de primeiro acesso.',
      ],
      example: {
        title: 'Exemplo: Auto-cadastro no domingo antes da palestra',
        context: 'Mariana acessa a biblioteca pelo celular antes de começar o estudo.',
        action:
          'Ela clica em "Cadastrar-se como Leitor", preenche nome, WhatsApp e e-mail e envia.',
        result:
          'A tela exibe a confirmação: "Solicitação enviada com sucesso! Aguarde a aprovação do operador para receber seu link de acesso."',
        type: 'success',
      },
    },
    {
      id: 'leitor-primeiro-acesso',
      shortTitle: 'Primeiro Acesso & Senha',
      title: 'Definição de Senha e Ativação do Primeiro Acesso',
      profile: 'leitor',
      category: 'Conta & Acesso',
      icon: KeyRound,
      screenUrl: '/login',
      screenButtonText: 'Ir para Login',
      summary: 'O que fazer ao receber a mensagem de boas-vindas com o link de definição de senha.',
      steps: [
        {
          number: 1,
          title: 'Abrir sua Caixa de Entrada',
          detail:
            'Procure pelo e-mail com remetente institucional "Biblioteca da Coligação Espírita Progressista (CEP)". Verifique também a pasta de Spam ou Lixo Eletrônico.',
        },
        {
          number: 2,
          title: 'Clicar no link recebido',
          detail:
            'Clique no botão ou link "Definir Minha Senha". Atenção: o link expira em exatamente 1 hora após o envio.',
        },
        {
          number: 3,
          title: 'Criar sua Senha Definitiva',
          detail:
            'Você será direcionado para a página "Primeiro Acesso — Defina sua Senha". Digite sua senha pessoal de no mínimo 6 dígitos e confirme.',
        },
        {
          number: 4,
          title: 'Login Automático',
          detail:
            'Após salvar sua senha, você será autenticado automaticamente e terá acesso completo para solicitar livros e consultar seus empréstimos.',
        },
      ],
      rules: [
        'Se o link expirar (passar de 1 hora), ao clicar você verá um aviso de "Link expirado". Nesse caso, basta solicitar ao operador que clique em "Reenviar Link" no balcão.',
      ],
      example: {
        title: 'Exemplo: Leitora ativando conta pelo celular',
        context: 'Camila recebe o e-mail às 15h. Às 15h20 ela abre o link no smartphone.',
        action: 'Camila digita sua senha pessoal de 8 caracteres e clica em "Salvar Nova Senha".',
        result:
          'O sistema confirma a redefinição e direciona Camila diretamente para a página inicial da Biblioteca CEP já conectada.',
        type: 'success',
      },
    },
    {
      id: 'leitor-inicio-colecoes',
      shortTitle: 'Nossas Bibliotecas & Coleções',
      title: 'Página Inicial: Conhecendo as Bibliotecas Cecília Braga e Rino Curti',
      profile: 'leitor',
      category: 'Navegação no Catálogo',
      icon: Building2,
      screenUrl: '/',
      screenButtonText: 'Ver Página Inicial',
      summary:
        'Como identificar as duas bibliotecas mantidas pela CEP e saber quais títulos você pode consultar e retirar.',
      steps: [
        {
          number: 1,
          title: 'Acessar a Página Inicial',
          detail:
            'Na página inicial, role até a seção de destaque "Nossas Bibliotecas & Coleções".',
        },
        {
          number: 2,
          title: 'Biblioteca Cecília Braga (Acervo Geral)',
          detail:
            'Reúne obras da Doutrina Espírita, romances, estudos, mediunidade, obras básicas de Allan Kardec, obras de Chico Xavier, Divaldo Franco e literatura infantojuvenil. Disponível para TODOS os leitores cadastrados.',
        },
        {
          number: 3,
          title: 'Biblioteca Rino Curti (Acervo Restrito)',
          detail:
            'Acervo especial de obras históricas, documentos da casa e títulos sob guarda da Diretoria Executiva da CEP. Acesso sinalizado por badge especial e permitido para membros autorizados.',
        },
      ],
      rules: [
        'Leitores comuns podem visualizar os títulos de ambas as bibliotecas, mas a solicitação de obras da Coleção Diretoria requer permissão específica no cadastro.',
      ],
    },
    {
      id: 'leitor-acervo-solicitar',
      shortTitle: 'Buscar Livros & Pré-Reserva',
      title: 'Consultar Disponibilidade e "Solicitar Livro" (Pré-Reserva)',
      profile: 'leitor',
      category: 'Navegação no Catálogo',
      icon: Search,
      screenUrl: '/acervo',
      screenButtonText: 'Buscar no Acervo',
      summary:
        'Como pesquisar livros por título, autor ou código e enviar um pedido de reserva com um clique.',
      steps: [
        {
          number: 1,
          title: 'Navegar até a página Acervo',
          detail: 'Clique em "Acervo" no menu superior.',
        },
        {
          number: 2,
          title: 'Pesquisar a obra desejada',
          detail:
            'Use a barra de pesquisa para digitar o nome do livro, autor espírita, médium ou código da obra. Você também pode filtrar por categoria (ex: Filosofia, Romance, Infantojuvenil).',
        },
        {
          number: 3,
          title: 'Checar a Disponibilidade de Exemplares',
          detail:
            'No card do livro, veja o indicador de exemplares: se houver exemplares disponíveis (verde), você pode solicitá-lo para retirada. Se estiver emprestado, você pode entrar na fila de espera.',
        },
        {
          number: 4,
          title: 'Clicar em "Solicitar Livro"',
          detail:
            'Clique no botão "Solicitar Livro". Um modal abrirá com os detalhes da solicitação.',
        },
        {
          number: 5,
          title: 'Confirmar a Pré-Reserva',
          detail:
            'Clique em "Confirmar Solicitação". O sistema registrará sua intenção e exibirá a confirmação oficial.',
        },
      ],
      systemMessages: [
        {
          text: 'Solicitação enviada, aguardando validação do operador',
          meaning:
            'Sua solicitação foi registrada no sistema. O operador da biblioteca irá processá-la e você receberá o aviso para retirar.',
        },
        {
          text: 'Não há disponibilidade para mais reservas.',
          meaning:
            'A fila máxima deste livro (2 leitores) já foi atingida. Aguarde a devolução dos exemplares.',
        },
      ],
      rules: [
        'Limite por leitor: você pode ter no máximo 4 empréstimos ativos e 4 reservas simultâneas.',
        'Se você já tiver 4 livros ou reservas ativas, precisará concluir ou cancelar alguma antes.',
      ],
      example: {
        title: 'Exemplo: Solicitando "Missionários da Luz"',
        context: 'O leitor Fernando deseja estudar a obra no próximo sábado.',
        action: 'Localiza o livro no acervo e clica no botão "Solicitar Livro".',
        result:
          'O sistema exibe o aviso verde: "Solicitação enviada, aguardando validação do operador". Quando validado, ele terá 4 dias úteis para retirar no balcão da CEP.',
        type: 'success',
      },
    },
    {
      id: 'leitor-minha-conta',
      shortTitle: 'Minha Conta & Reservas',
      title: 'Acompanhar Empréstimos Ativos, Prazos e Fila de Espera',
      profile: 'leitor',
      category: 'Conta & Acesso',
      icon: UserCheck,
      screenUrl: '/emprestimos',
      screenButtonText: 'Ver Meus Empréstimos',
      summary:
        'Como consultar os livros que estão em sua posse, datas de devolução previstas, posição na fila e badges da biblioteca de origem.',
      steps: [
        {
          number: 1,
          title: 'Acessar "Meus Dados" ou "Minha Conta"',
          detail:
            'Clique no seu nome/avatar no canto superior direito para abrir o menu do usuário e clique em "Empréstimos", "Reservas" ou "Meus Dados".',
        },
        {
          number: 2,
          title: 'Verificar Empréstimos Ativos e Prazos',
          detail:
            'Na tela de Empréstimos, veja os livros em sua posse e a data limite de devolução. Fique atento aos alertas coloridos para evitar atrasos.',
        },
        {
          number: 3,
          title: 'Identificar a Biblioteca de Origem',
          detail:
            'Cada item exibe a etiqueta da biblioteca correspondente: "Biblioteca Cecília Braga" (acervo geral) ou "Biblioteca Rino Curti" (Diretoria).',
        },
        {
          number: 4,
          title: 'Acompanhar Posição na Fila de Reservas',
          detail:
            'Na tela de Reservas, você vê sua posição na fila de espera (ex: 1º da fila). Assim que o exemplar for devolvido por quem o estava lendo, ele ficará reservado para você por 4 dias úteis.',
        },
        {
          number: 5,
          title: 'Atualizar Dados de Contato e Foto',
          detail:
            'Em "Meus Dados", você pode manter seu telefone WhatsApp atualizado e alterar sua foto de perfil.',
        },
      ],
      rules: [
        'Mantenha seu telefone com DDD e e-mail sempre em dia para receber avisos sobre a disponibilidade de reservas.',
      ],
      example: {
        title: 'Exemplo: Leitor verificando devolução',
        context: 'Lucas entra na conta para ver quando deve devolver seu livro.',
        action: 'Acessa o menu Empréstimos no cabeçalho.',
        result:
          'Visualiza o livro "Paulo e Estêvão" com o badge "Biblioteca Cecília Braga" e a devolução prevista para a próxima quarta-feira.',
        type: 'info',
      },
    },
  ]

  // Tópicos filtrados pela busca e pela aba ativa
  const currentTopics = useMemo(() => {
    const list = activeTab === 'operador' ? operatorTopics : readerTopics
    if (!searchFilter.trim()) return list
    const q = searchFilter.toLowerCase()
    return list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.shortTitle.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.steps.some(
          (s) => s.title.toLowerCase().includes(q) || s.detail.toLowerCase().includes(q),
        ) ||
        (t.rules && t.rules.some((r) => r.toLowerCase().includes(q))) ||
        (t.systemMessages &&
          t.systemMessages.some(
            (m) => m.text.toLowerCase().includes(q) || m.meaning.toLowerCase().includes(q),
          )),
    )
  }, [activeTab, searchFilter])

  // Categorias únicas para agrupar o sumário
  const categories = useMemo(() => {
    const set = new Set<string>()
    currentTopics.forEach((t) => set.add(t.category))
    return Array.from(set)
  }, [currentTopics])

  const scrollToTopic = (id: string) => {
    setActiveSectionId(id)
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Cabeçalho Institucional do Manual */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-900 rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 opacity-10 pointer-events-none">
          <BookOpen className="w-80 h-80" />
        </div>

        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-emerald-100 text-xs font-semibold backdrop-blur-xs border border-white/20">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Documentação Oficial e Guia Operacional — Biblioteca CEP v4.0</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            Manual do Sistema
          </h1>
          <p className="text-emerald-100 text-xs sm:text-sm md:text-base leading-relaxed">
            Roteiros passo a passo com exemplos concretos, regras institucionais e mensagens do
            sistema aplicados às coleções da Coligação Espírita Progressista (CEP) — Biblioteca
            Cecília Braga (Acervo Geral) e Biblioteca Rino Curti (Diretoria).
          </p>

          <div className="pt-2 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-lg border border-white/10">
              <Clock className="w-3.5 h-3.5 text-emerald-300" />
              Retirada: 4 dias úteis (sábado conta)
            </span>
            <span className="inline-flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-lg border border-white/10">
              <BookmarkCheck className="w-3.5 h-3.5 text-emerald-300" />
              Fila máxima: 2 leitores por obra
            </span>
            <span className="inline-flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-lg border border-white/10">
              <Repeat className="w-3.5 h-3.5 text-emerald-300" />
              Limites: até 4 empréstimos e 4 reservas
            </span>
          </div>

          <div className="pt-2">
            <Button
              asChild
              size="sm"
              className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold text-xs gap-1.5 shadow-sm"
            >
              <Link to="/primeiros-passos">
                <Sparkles className="w-3.5 h-3.5 text-amber-800" />
                <span>Novo Operador? Ver Guia de 1 Página (Primeiros Passos)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Barra de Filtro e Alternância de Perfil */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        {/* Alternância de Abas por Perfil */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-full md:w-auto">
          <Button
            type="button"
            variant={activeTab === 'operador' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('operador')}
            className={`flex-1 md:flex-none text-xs font-semibold gap-1.5 ${
              activeTab === 'operador'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Perfil: Operador & Administrador</span>
            <Badge
              variant="secondary"
              className={`text-[10px] ml-1 px-1.5 py-0 ${
                activeTab === 'operador' ? 'bg-white/20 text-white' : 'bg-slate-200'
              }`}
            >
              {operatorTopics.length}
            </Badge>
          </Button>

          <Button
            type="button"
            variant={activeTab === 'leitor' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('leitor')}
            className={`flex-1 md:flex-none text-xs font-semibold gap-1.5 ${
              activeTab === 'leitor'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Perfil: Leitor</span>
            <Badge
              variant="secondary"
              className={`text-[10px] ml-1 px-1.5 py-0 ${
                activeTab === 'leitor' ? 'bg-white/20 text-white' : 'bg-slate-200'
              }`}
            >
              {readerTopics.length}
            </Badge>
          </Button>
        </div>

        {/* Campo de Busca Rápida de Tópicos */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar funcionalidade, botão, regra ou mensagem de erro..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9 text-xs sm:text-sm bg-slate-50 border-slate-200 focus:bg-white"
          />
          {searchFilter && (
            <button
              type="button"
              onClick={() => setSearchFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Botão de Sumário Mobile */}
      <div className="lg:hidden flex items-center justify-between bg-slate-100 p-3 rounded-lg border border-slate-200">
        <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-emerald-600" />
          Navegação por Sumário
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs h-7 bg-white"
          onClick={() => setMobileTocOpen(!mobileTocOpen)}
        >
          {mobileTocOpen ? 'Recolher Sumário' : 'Expandir Sumário'}
        </Button>
      </div>

      {/* Banner de Destaque para Primeiros Passos no Perfil Operador */}
      {activeTab === 'operador' && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100/70 border border-emerald-300 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-2xs shrink-0">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                É seu primeiro dia como operador ou precisa de um resumo rápido?
                <Badge className="bg-emerald-200 text-emerald-900 border-emerald-300 text-[10px]">
                  1 Página
                </Badge>
              </h3>
              <p className="text-xs text-emerald-800 mt-0.5">
                Consulte o roteiro condensado com o fluxo de ponta a ponta: cadastros, aprovações,
                empréstimos e regras de ouro em 3 minutos.
              </p>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shrink-0 gap-1.5 shadow-xs"
          >
            <Link to="/primeiros-passos">
              <span>Abrir Primeiros Passos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {/* Layout Principal: Sumário Lateral + Conteúdo Central */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sumário Lateral Fixo (Desktop) e Colapsável (Mobile) */}{' '}
        <aside className={`lg:col-span-4 space-y-4 ${mobileTocOpen ? 'block' : 'hidden lg:block'}`}>
          <div className="sticky top-20 bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Índice de Tópicos
                </h2>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                {currentTopics.length} tópico(s)
              </Badge>
            </div>

            {/* Lista Agrupada por Categoria */}
            <div className="space-y-4">
              {categories.map((cat) => {
                const topicsInCat = currentTopics.filter((t) => t.category === cat)
                if (topicsInCat.length === 0) return null

                return (
                  <div key={cat} className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block px-2">
                      {cat}
                    </span>
                    <nav className="space-y-1">
                      {topicsInCat.map((topic) => {
                        const Icon = topic.icon
                        const isActive = activeSectionId === topic.id
                        return (
                          <button
                            key={topic.id}
                            type="button"
                            onClick={() => {
                              scrollToTopic(topic.id)
                              setMobileTocOpen(false)
                            }}
                            className={`w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-900 font-bold border border-emerald-200'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <Icon
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isActive ? 'text-emerald-600' : 'text-slate-400'
                                }`}
                              />
                              <span className="truncate">{topic.shortTitle}</span>
                            </span>
                            <ChevronRight
                              className={`w-3 h-3 shrink-0 ${
                                isActive ? 'text-emerald-600' : 'text-slate-300'
                              }`}
                            />
                          </button>
                        )
                      })}
                    </nav>
                  </div>
                )
              })}
            </div>

            {/* Dica do Perfil no Rodapé do Sumário */}
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg">
              <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                {activeTab === 'operador'
                  ? 'Você está visualizando os procedimentos de retaguarda para operadores e administradores.'
                  : 'Você está visualizando o roteiro de autoatendimento, pesquisa e solicitação para os leitores.'}
              </span>
            </div>
          </div>
        </aside>
        {/* Área Central de Conteúdo dos Roteiros */}
        <main className="lg:col-span-8 space-y-6">
          {currentTopics.length === 0 ? (
            <Card className="border-dashed border-2 border-slate-200 p-12 text-center bg-white">
              <HelpCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">Nenhum tópico encontrado</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Não localizamos nenhuma instrução que coincida com a pesquisa "
                <strong>{searchFilter}</strong>". Tente buscar por palavras-chave como "empréstimo",
                "retirada", "reserva", "feriado" ou "senha".
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchFilter('')}
                className="mt-4 text-xs"
              >
                Limpar Busca
              </Button>
            </Card>
          ) : (
            currentTopics.map((topic) => {
              const Icon = topic.icon
              return (
                <article
                  key={topic.id}
                  id={topic.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-all scroll-mt-20 hover:border-emerald-300"
                >
                  {/* Cabeçalho do Tópico */}
                  <div className="p-5 sm:p-6 border-b border-slate-100 space-y-3 bg-gradient-to-b from-slate-50/50 to-white">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                          <Icon className="w-5 h-5" />
                        </span>
                        <div>
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase tracking-wider font-semibold text-slate-600 mb-0.5"
                          >
                            {topic.category}
                          </Badge>
                          <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                            {topic.title}
                          </h2>
                        </div>
                      </div>

                      {topic.screenUrl && (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="text-xs h-8 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 gap-1.5 shadow-2xs"
                        >
                          <Link to={topic.screenUrl}>
                            <span>{topic.screenButtonText || 'Abrir Tela'}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </Button>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      {topic.summary}
                    </p>

                    {/* Pré-requisitos se houver */}
                    {topic.prerequisites && topic.prerequisites.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">Pré-requisito:</span>
                        {topic.prerequisites.map((req, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-[11px] bg-slate-50 text-slate-600 border-slate-200"
                          >
                            {req}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-5 sm:p-6 space-y-6">
                    {/* Roteiro Passo a Passo Numerado */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                        Roteiro Passo a Passo
                      </h3>

                      <ol className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                        {topic.steps.map((step) => (
                          <li
                            key={step.number}
                            className="relative pl-9 flex flex-col gap-1 text-xs sm:text-sm"
                          >
                            <span className="absolute left-0 top-0.5 w-7 h-7 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow-xs ring-4 ring-white">
                              {step.number}
                            </span>
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1">
                              <span className="font-bold text-slate-900 block">{step.title}</span>
                              <p className="text-slate-600 leading-relaxed text-xs sm:text-sm">
                                {step.detail}
                              </p>
                              {step.tip && (
                                <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 font-medium">
                                  <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                  <span>
                                    <strong>Dica:</strong> {step.tip}
                                  </span>
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Exemplo Concreto Destacado */}
                    {topic.example && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="p-1 rounded bg-emerald-600 text-white">
                            <Sparkles className="w-3.5 h-3.5" />
                          </span>
                          <h4 className="text-xs sm:text-sm font-bold text-emerald-950 uppercase tracking-wide">
                            {topic.example.title}
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-2xs space-y-1">
                            <span className="font-semibold text-slate-500 uppercase text-[10px]">
                              Contexto / Cenário
                            </span>
                            <p className="text-slate-800 leading-snug">{topic.example.context}</p>
                          </div>
                          <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-2xs space-y-1">
                            <span className="font-semibold text-slate-500 uppercase text-[10px]">
                              Ação Realizada
                            </span>
                            <p className="text-slate-800 leading-snug">{topic.example.action}</p>
                          </div>
                          <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-2xs space-y-1">
                            <span className="font-semibold text-emerald-700 uppercase text-[10px]">
                              Resultado Obtido
                            </span>
                            <p className="text-emerald-950 font-medium leading-snug">
                              {topic.example.result}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Regras e Mensagens Reais do Sistema */}
                    {(topic.rules || topic.systemMessages) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        {topic.rules && topic.rules.length > 0 && (
                          <div className="border border-slate-200 rounded-lg p-3.5 bg-white space-y-2">
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-blue-600" />
                              Regras de Negócio Aplicadas
                            </h4>
                            <ul className="space-y-1.5 text-xs text-slate-600 list-disc list-inside">
                              {topic.rules.map((rule, idx) => (
                                <li key={idx} className="leading-snug">
                                  {rule}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {topic.systemMessages && topic.systemMessages.length > 0 && (
                          <div className="border border-slate-200 rounded-lg p-3.5 bg-white space-y-2">
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              Mensagens Reais do Sistema
                            </h4>
                            <div className="space-y-2">
                              {topic.systemMessages.map((msg, idx) => (
                                <div
                                  key={idx}
                                  className="text-xs bg-slate-50 p-2 rounded border border-slate-100 space-y-0.5"
                                >
                                  <div className="font-mono font-semibold text-rose-700 text-[11px]">
                                    "{msg.text}"
                                  </div>
                                  <div className="text-slate-500 text-[11px] leading-tight">
                                    {msg.meaning}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              )
            })
          )}

          {/* Card de Ajuda Adicional no Fim */}
          <Card className="bg-gradient-to-r from-slate-900 to-slate-800 text-white border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-emerald-400" />
                Precisa de auxílio presencial ou suporte técnico?
              </CardTitle>
              <CardDescription className="text-slate-300 text-xs sm:text-sm">
                A equipe voluntária da Biblioteca da Coligação Espírita Progressista (CEP) está à
                disposição nos dias de estudo e palestras para orientar sobre retiradas, reservas e
                consultas.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
              <div className="text-xs text-slate-300">
                Horário de atendimento: Sábados e Domingos durante as reuniões públicas.
              </div>
              <Button
                asChild
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                <Link to="/">Voltar à Página Inicial</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
