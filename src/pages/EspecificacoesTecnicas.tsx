import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  Database,
  ShieldCheck,
  Server,
  Lock,
  Layers,
  ArrowRight,
  ChevronRight,
  Info,
  FileText,
  UserCog,
  History,
  Eye,
  Sparkles,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface SpecSection {
  id: string
  number: number
  title: string
  icon: React.ElementType
  blocks: SpecBlock[]
}

type SpecBlock =
  | { kind: 'text'; content: string }
  | { kind: 'list'; title?: string; items: string[] }
  | { kind: 'mono'; title: string; items: string[] }
  | { kind: 'example'; title: string; body: string }
  | { kind: 'note'; tone: 'info' | 'warning'; content: string }

const SECTIONS: SpecSection[] = [
  {
    id: 'spec-visao-geral',
    number: 1,
    title: 'Visão Geral e Stack Tecnológica',
    icon: Layers,
    blocks: [
      {
        kind: 'text',
        content:
          'O Biblioteca CEP é uma aplicação web single-page (SPA) de gestão de acervo e circulação, composta por um front-end reativo e um back-end gerenciado sem servidores próprios (arquitetura serverless). Todo o tráfego entre cliente e servidor é feito por HTTPS.',
      },
      {
        kind: 'list',
        title: 'Front-end (interface)',
        items: [
          'React + TypeScript: interfaces componentizadas com tipagem estática de ponta a ponta.',
          'Vite: ferramenta de build e servidor de desenvolvimento.',
          'Tailwind CSS + biblioteca shadcn/ui: padronização visual e componentes acessíveis reutilizáveis.',
          'React Router: navegação entre telas com rotas protegidas por papel (ex.: /usuarios e /configuracoes exigem admin; /manual e /primeiros-passos exigem papel interno).',
        ],
      },
      {
        kind: 'list',
        title: 'Back-end (Supabase — plataforma gerenciada)',
        items: [
          'PostgreSQL gerenciado: banco de dados relacional com Row Level Security (RLS) ativo.',
          'Supabase Auth: autenticação por e-mail/senha com tokens JWT e sessões com renovação automática.',
          'Edge Functions (Deno): funções de servidor para operações sensíveis, como redefinição administrativa de senha, criação de usuários e o expurgo mensal da auditoria.',
          'Storage: buckets para fotos de leitores e capas de livros, com políticas de acesso próprias.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        content:
          'Não há servidores intermediários mantidos pela equipe: a lógica sensível vive no banco (funções SQL e RLS) ou nas funções de servidor do Supabase, e a interface é apenas a camada de apresentação.',
      },
    ],
  },
  {
    id: 'spec-banco-dados',
    number: 2,
    title: 'Banco de Dados: PostgreSQL via Supabase',
    icon: Database,
    blocks: [
      {
        kind: 'text',
        content:
          'O sistema utiliza PostgreSQL, gerenciado pela plataforma Supabase, com estrutura relacional normalizada. As tabelas do domínio (17 no total, no schema público) e seu papel:',
      },
      {
        kind: 'mono',
        title: 'Tabelas do acervo e circulação',
        items: [
          'titulo — obras do catálogo (título, autores, ISBN, coleção, categoria, sinopse).',
          'exemplar — cópias físicas de um título (1 título → N exemplares), com status e localização.',
          'emprestimo — empréstimos (1 leitor → N empréstimos; 1 exemplar → 1 empréstimo ativo).',
          'reserva — reservas e fila de espera por título.',
          'pre_reserva — solicitações de reserva ainda não validadas pelo operador.',
          'leitor — cadastro da comunidade leitora (nome, e-mail, telefones, bloqueios, status de cadastro).',
        ],
      },
      {
        kind: 'mono',
        title: 'Tabelas de apoio e configuração',
        items: [
          'authors — autores, com tipo (espírito ou médium/encarnado) e vínculo com títulos.',
          'categorias — categorias do acervo.',
          'cursos e leitor_curso — cursos da instituição e vínculo N:N com leitores.',
          'feriado — calendário de feriados usado no cálculo de prazos em dias úteis.',
          'parametros e configuracao — parâmetros operacionais (prazos, limites, rótulos, e-mails) e configurações gerais.',
        ],
      },
      {
        kind: 'mono',
        title: 'Tabelas de segurança e rastreabilidade',
        items: [
          'profiles — perfil dos usuários internos (papel, bloqueio, controle de senha e notificações).',
          'historico — trilha de movimentações (tipo, entidade, descrição, usuário, leitor, observação).',
          'auditoria_transicoes — trilha fina de mudanças de estado (estado anterior, estado novo, operador, motivo).',
          'job_execucoes — registro de execuções dos jobs automatizados (expurgo mensal da auditoria).',
        ],
      },
      {
        kind: 'list',
        title: 'Relacionamentos principais',
        items: [
          'titulo (1) → exemplar (N): cada cópia física pertence a um título.',
          'leitor (1) → emprestimo (N) → exemplar (1): quem levou qual cópia.',
          'leitor (1) → reserva / pre_reserva (N) → titulo (1): pedidos e fila por obra.',
          'leitor (N) ↔ cursos (N) através de leitor_curso.',
          'leitor.id_auth → profiles.id: vincula o cadastro do leitor à conta de autenticação.',
        ],
      },
      {
        kind: 'list',
        title: 'Funções de banco (SQL) de controle de acesso e regras',
        items: [
          'app_user_papel() — retorna o papel do chamador (do cadastro ou dos metadados do token JWT).',
          'app_is_staff() — verdadeiro para os papéis internos: admin, operador_diretoria e operador.',
          'app_can_access_diretoria() — verdadeiro para papéis com acesso à Biblioteca Rino Curti (Diretoria).',
          'Funções de regra de negócio executadas no servidor, com verificação de permissão, como emprestar_exemplar, devolver_exemplar, renovar_emprestimo, atender_reserva, validar_pre_reserva, calcular_prazo_dias_uteis e processar_expiracoes_automaticas.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        content:
          'Essas funções de acesso são declaradas SECURITY DEFINER com busca fixa de schema (search_path "public"), o que evita manipulação do caminho de busca por chamadores mal-intencionados.',
      },
    ],
  },
  {
    id: 'spec-acesso-autenticacao',
    number: 3,
    title: 'Modelo de Acesso e Autenticação',
    icon: Lock,
    blocks: [
      {
        kind: 'text',
        content:
          'O acesso é feito por e-mail e senha. A autenticação é delegada ao Supabase Auth, que emite um token JWT assinado contendo a identidade do usuário e metadados do papel. Toda requisição ao banco leva esse token, e a identidade (auth.uid()) é a base das políticas de acesso. Sessões são renovadas automaticamente e há tratamento dedicado de expiração de sessão, com devolução do usuário à tela de login.',
      },
      {
        kind: 'list',
        title: 'Os 4 papéis do sistema',
        items: [
          'admin (Administrador) — acesso total: gestão de usuários, configurações e parâmetros, redefinição administrativa de senha e exclusões definitivas (títulos, exemplares, leitores).',
          'operador_diretoria (Operador de Diretoria) — visão operacional completa e acesso ao acervo da Biblioteca Rino Curti; sem administração de usuários nem configurações.',
          'operador (Operador) — atendimento de balcão: leitores, empréstimos, reservas e acervo geral; sem exclusões definitivas nem área administrativa.',
          'leitor — autoatendimento: pesquisa do acervo, consulta e cancelamento dos próprios empréstimos, reservas e pré-reservas e edição dos próprios dados.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        content:
          'Os três primeiros são os "papéis internos" (staff). O papel de leitor é atribuído à comunidade: pode ser criado por autoatendimento (cadastro pendente de aprovação) ou pelo balcão, e pode ser bloqueado por um operador.',
      },
      {
        kind: 'example',
        title: 'Exemplo: o mesmo token, acessos diferentes',
        body: 'Um leitor autenticado consulta /emprestimos e recebe apenas os próprios empréstimos. Um operador autenticado na mesma tela recebe os empréstimos de toda a biblioteca. A diferença não está na interface: é a política de RLS do banco, que compara o auth.uid() do token com o id_auth vinculado ao leitor.',
      },
    ],
  },
  {
    id: 'spec-rls',
    number: 4,
    title: 'Row Level Security: Políticas por Papel',
    icon: ShieldCheck,
    blocks: [
      {
        kind: 'text',
        content:
          'Todas as tabelas de aplicação têm Row Level Security ativo: mesmo uma consulta maliciosa construída fora da interface recebe do banco apenas as linhas que o papel do chamador pode ver. As políticas usam as funções app_user_papel(), app_is_staff() e app_can_access_diretoria() descritas na seção 2.',
      },
      {
        kind: 'list',
        title: 'Leitura de dados de circulação (empréstimos)',
        items: [
          'Política real "emprestimo_select_own_or_staff": o leitor vê apenas empréstimos cujo id_leitor está vinculado à própria conta de autenticação; papéis internos veem todos.',
        ],
      },
      {
        kind: 'mono',
        title: 'Essência da política (SQL simplificado)',
        items: [
          'id_leitor IN (SELECT id_leitor FROM leitor WHERE id_auth = auth.uid())',
          'OR app_is_staff()',
        ],
      },
      {
        kind: 'list',
        title: 'Cadastro do leitor',
        items: [
          'Política real "leitor_select_own_or_staff": (id_auth = auth.uid()) OR app_is_staff() — o leitor vê somente o próprio cadastro.',
          'Política real "leitor_insert_anon_pending": um visitante anônimo só pode inserir um cadastro com status_cadastro = \'pendente\', sem vínculo de autenticação, sem bloqueio e sem acesso à Diretoria — é o autoatendimento de cadastro, controlado pelo banco.',
        ],
      },
      {
        kind: 'list',
        title: 'Operações destrutivas e áreas administrativas',
        items: [
          'Exclusão definitiva (ex.: "titulo_delete_admin" e "leitor_delete_admin") exige papel admin, avaliado no servidor do banco.',
          'Parâmetros, configurações e feriados: leitura ampla (a interface precisa dos prazos) e escrita restrita a admin/operador.',
          'Autores, cursos e categorias: leitura pública do catálogo; escrita apenas para papéis internos.',
        ],
      },
      {
        kind: 'list',
        title: 'Auditoria',
        items: [
          'Política real "Leitura de auditoria por staff": SELECT permitido somente se app_is_staff() — leitor e anônimo não leem a trilha.',
          'Inserção na trilha é permitida a usuários autenticados; edição e exclusão não são expostas ao cliente.',
        ],
      },
    ],
  },
  {
    id: 'spec-servidor',
    number: 5,
    title: 'Blindagem das Funções de Servidor',
    icon: Server,
    blocks: [
      {
        kind: 'text',
        content:
          'Operações sensíveis que precisam de poder elevado (ex.: redefinir a senha de outro usuário) não são executadas direto no banco pelo cliente: rodam em Edge Functions. Toda função sensível segue o mesmo roteiro de blindagem:',
      },
      {
        kind: 'list',
        items: [
          'Exige o token JWT do chamador — requisições sem token válido são rejeitadas.',
          'Verifica o papel no servidor (ex.: redefinição de senha exige admin; bloquear leitor exige papel interno) — nunca confia apenas na interface.',
          'Bloqueia leitores, chamadores anônimos e contas bloqueadas antes de qualquer operação.',
          'Valida os dados de entrada (ex.: presença de campos, tamanho mínimo de senha).',
          'Registra a ação nas trilhas de auditoria (historico / auditoria_transicoes).',
        ],
      },
      {
        kind: 'list',
        title: 'Rate limiting (proteção contra força bruta)',
        items: [
          'Funções sensíveis limitam o número de chamadas por minuto por usuário e por IP. Exemplo real: a redefinição administrativa de senha admite no máximo 5 chamadas por minuto por usuário/IP; acima disso a função responde com o código HTTP 429 e o tempo de espera, em vez de executar.',
        ],
      },
      {
        kind: 'list',
        title: 'Política de senha',
        items: [
          'Senha mínima de 8 caracteres, validada nos formulários da interface E novamente nas funções de servidor — a checagem da interface é conveniência; a que vale é a do servidor.',
          'Senhas não são armazenadas nem logadas pela aplicação; ficam sob o gerenciamento de hash do provedor de autenticação.',
          'Cooldown de reenvio do link de primeiro acesso e aviso de "link expirado" reduzem vetores de adivinhação.',
        ],
      },
      {
        kind: 'note',
        tone: 'warning',
        content:
          'Parâmetros globais do provedor de autenticação — como o comprimento mínimo de senha e a proteção contra senhas vazadas ("Leaked password protection") — dependem de ajuste manual no painel do Supabase e não são gerenciados pelo código.',
      },
    ],
  },
  {
    id: 'spec-auditoria',
    number: 6,
    title: 'Rastreabilidade e Auditoria',
    icon: History,
    blocks: [
      {
        kind: 'text',
        content:
          'Duas trilhas complementares registram o que acontece no sistema, e um job automatizado limita por quanto tempo são conservadas:',
      },
      {
        kind: 'list',
        items: [
          'historico — trilha de movimentações de circulação e gestão: tipo de evento, entidade afetada, descrição, usuário responsável, leitor envolvido e observação. É a base das telas de Histórico e Logs.',
          'auditoria_transicoes — trilha fina de mudanças de estado (ex.: status de uma reserva): guarda estado anterior, estado novo, operador e motivo informado, vinculando cada transição a quem a fez e por quê.',
          'job_execucoes — registro das execuções do job de auditoria (período, registros incluídos/expurgados, duração e status), dando transparência sobre o próprio mecanismo de expurgo.',
        ],
      },
      {
        kind: 'list',
        title: 'Expurgo mensal automatizado (limitação do prazo de conservação)',
        items: [
          'Uma função de servidor executada mensalmente apaga registros de auditoria mais antigos que o período de retenção configurado (padrão: 90 dias, ajustável pelo administrador), em lotes.',
          'Cada execução gera relatório para os destinatários configurados e é registrada em job_execucoes.',
          'Isso materializa o princípio LGPD de limitação do prazo de conservação: os dados de auditoria são mantidos pelo tempo necessário à auditoria e depois eliminados.',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        content:
          'A trilha de auditoria é somente leitura para quem usa o sistema: nenhuma tela permite editar ou apagar registros individualmente; o único caminho de eliminação é o expurgo automatizado por idade.',
      },
    ],
  },
  {
    id: 'spec-privacidade-camadas',
    number: 7,
    title: 'Arquitetura de Privacidade por Camadas',
    icon: Layers,
    blocks: [
      {
        kind: 'text',
        content:
          'A privacidade dos dados da comunidade (quem emprestou o quê, cadastros, e-mails) é protegida em três camadas independentes — violar uma delas não expõe os dados:',
      },
      {
        kind: 'list',
        title: 'Camada 1 — Interface (o que cada papel vê)',
        items: [
          'A tela inicial pública exibe a visitantes anônimos apenas métricas institucionais (títulos no acervo e disponibilidade): os cards de empréstimos ativos, atrasos e leitores cadastrados, os contadores do cabeçalho e os botões de atendimento só existem para papéis internos.',
          'Nenhuma consulta às métricas confidenciais é disparada ao banco para visitantes deslogados — a informação não sai do servidor, não é apenas escondida na tela.',
          'Rotas administrativas são barradas antes de renderizar (ex.: /usuarios e /configuracoes exigem admin).',
        ],
      },
      {
        kind: 'list',
        title: 'Camada 2 — Banco (RLS)',
        items: [
          'Mesmo que alguém consulte o banco diretamente com um token de leitor, o Row Level Security devolve somente as linhas próprias (ver seção 4).',
          'Tabelas de auditoria e parâmetros sensíveis não são legíveis por leitores.',
        ],
      },
      {
        kind: 'list',
        title: 'Camada 3 — Servidor (funções blindadas + auditoria)',
        items: [
          'Operações de elevação de privilégio (senha, criação de usuário, bloqueios) passam por Edge Functions que revalidam identidade, papel e taxa de chamadas.',
          'Toda operação sensível deixa registro nas trilhas de auditoria (seção 6).',
        ],
      },
    ],
  },
  {
    id: 'spec-lgpd',
    number: 8,
    title: 'Normativas de Segurança Alinhadas à LGPD',
    icon: FileText,
    blocks: [
      {
        kind: 'text',
        content:
          'A Lei Geral de Proteção de Dados (Lei nº 13.709/2018) exige princípios e medidas técnicas e organizacionais de proteção. O mapeamento abaixo descreve o que o sistema efetivamente implementa — e também o que ainda depende de ação organizacional.',
      },
      {
        kind: 'list',
        title: 'Princípios atendidos',
        items: [
          'Finalidade e adequação: os dados coletados (nome, e-mail, telefones, curso, foto) servem exclusivamente à operação da biblioteca — empréstimos, reservas e comunicação com o leitor.',
          'Necessidade (minimização): o sistema não coleta CPF — o campo foi removido do cadastro de leitores. Não há coleta de dados sensíveis (saúde, biometria, religião) nas tabelas do domínio.',
          'Qualidade dos dados: validação de formato de e-mail (incluindo bloqueio de domínios descartáveis), de telefones e unicidade de cadastro.',
          'Segurança (medidas técnicas): RLS em todas as tabelas, funções de servidor blindadas com verificação de papel, rate limiting, senha mínima validada no servidor e transporte por HTTPS.',
          'Transparência: as regras de circulação, privacidade da tela inicial e responsabilidade dos papéis estão documentadas para o usuário no Manual do Sistema e no Guia de Primeiros Passos.',
          'Limitação do prazo de conservação: expurgo mensal automatizado das trilhas de auditoria (seção 6).',
        ],
      },
      {
        kind: 'list',
        title: 'Rastreabilidade e controle',
        items: [
          'Todo empréstimo, devolução, renovação, reserva e mudança de estado gera registro com operador, data e (quando aplicável) motivo.',
          'Contas podem ser bloqueadas individualmente por operadores, e o bloqueio é verificado também no servidor.',
          'O leitor tem controle sobre os próprios dados visíveis: vê e edita o próprio cadastro e acompanha/cancela os próprios pedidos.',
        ],
      },
      {
        kind: 'list',
        title: 'Pendências organizacionais conhecidas (transparência)',
        items: [
          'Aviso de privacidade publicado em /politica-de-privacidade e fluxo de atendimento de direitos do titular descrito no Manual do Sistema. O sistema não possui tela dedicada para registrar pedidos do titular: o registro é feito pela equipe, fora do sistema.',
          'Parâmetros do provedor de autenticação ("Minimum password length" e "Leaked password protection") dependem de ajuste manual no painel do Supabase (ver seção 5).',
        ],
      },
      {
        kind: 'note',
        tone: 'info',
        content:
          'Esta documentação descreve a arquitetura e as medidas implementadas; não substitui o registro de operações de tratamento nem a análise de risco formal exigida quando aplicável.',
      },
    ],
  },
]

export default function EspecificacoesTecnicas() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id)

  const scrollToSection = (id: string) => {
    setActiveId(id)
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 opacity-10 pointer-events-none">
          <Database className="w-80 h-80" />
        </div>

        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-slate-100 text-xs font-semibold backdrop-blur-xs border border-white/20">
            <FileText className="w-3.5 h-3.5" />
            <span>Documentação Técnica — Biblioteca CEP v4.0</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            Especificações Técnicas e Segurança (LGPD)
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm md:text-base leading-relaxed">
            Documento de referência para a equipe de manutenção, diretoria e auditorias de
            conformidade: stack tecnológica, banco de dados utilizado e estrutura adotada, modelo de
            acesso e autenticação, políticas de segurança e o alinhamento com a Lei Geral de
            Proteção de Dados (LGPD — Lei nº 13.709/2018).
          </p>

          <div className="pt-2 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-lg border border-white/10">
              <Database className="w-3.5 h-3.5 text-emerald-300" />
              PostgreSQL via Supabase
            </span>
            <span className="inline-flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-lg border border-white/10">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              RLS ativo em todas as tabelas
            </span>
            <span className="inline-flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-lg border border-white/10">
              <UserCog className="w-3.5 h-3.5 text-emerald-300" />4 papéis de acesso
            </span>
            <span className="inline-flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-lg border border-white/10">
              <Clock className="w-3.5 h-3.5 text-emerald-300" />
              Auditoria com expurgo mensal
            </span>
          </div>

          <div className="pt-2">
            <Button
              asChild
              size="sm"
              className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold text-xs gap-1.5 shadow-sm"
            >
              <Link to="/manual">
                <BookOpen className="w-3.5 h-3.5 text-amber-800" />
                <span>Ver o Manual do Sistema (visão operacional)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Layout Principal: Sumário Lateral + Conteúdo */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-4">
          <div className="sticky top-20 bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <Layers className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Seções do Documento
              </h2>
            </div>
            <nav className="space-y-1">
              {SECTIONS.map((section) => {
                const Icon = section.icon
                const isActive = activeId === section.id
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => scrollToSection(section.id)}
                    className={`w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-900 font-bold border border-emerald-200'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          isActive ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {section.number}
                      </span>
                      <Icon
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isActive ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      />
                      <span>{section.title}</span>
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
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg">
              <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Este documento descreve a arquitetura e as medidas implementadas — não expõe
                credenciais, chaves nem detalhes que possam auxiliar um ataque.
              </span>
            </div>
          </div>
        </aside>

        <main className="lg:col-span-8 space-y-6">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            return (
              <article
                key={section.id}
                id={section.id}
                className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden scroll-mt-20 hover:border-emerald-300 transition-all"
              >
                <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white">
                  <div className="flex items-center gap-3">
                    <span className="p-2.5 rounded-lg bg-emerald-100 text-emerald-800">
                      <Icon className="w-5 h-5" />
                    </span>
                    <div>
                      <Badge
                        variant="secondary"
                        className="text-[10px] uppercase tracking-wider font-semibold text-slate-600 mb-0.5"
                      >
                        Seção {section.number}
                      </Badge>
                      <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                        {section.title}
                      </h2>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6 space-y-4">
                  {section.blocks.map((block, idx) => {
                    if (block.kind === 'text') {
                      return (
                        <p key={idx} className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                          {block.content}
                        </p>
                      )
                    }
                    if (block.kind === 'list') {
                      return (
                        <div key={idx} className="space-y-1.5">
                          {block.title && (
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                              {block.title}
                            </h4>
                          )}
                          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 list-disc list-inside">
                            {block.items.map((item, i) => (
                              <li key={i} className="leading-relaxed">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    }
                    if (block.kind === 'mono') {
                      return (
                        <div
                          key={idx}
                          className="rounded-lg border border-slate-200 bg-slate-900 p-3.5 space-y-1"
                        >
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                            {block.title}
                          </span>
                          {block.items.map((item, i) => (
                            <div
                              key={i}
                              className="font-mono text-[11px] text-emerald-100 leading-relaxed"
                            >
                              {item}
                            </div>
                          ))}
                        </div>
                      )
                    }
                    if (block.kind === 'example') {
                      return (
                        <div
                          key={idx}
                          className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded bg-emerald-600 text-white">
                              <Sparkles className="w-3.5 h-3.5" />
                            </span>
                            <h4 className="text-xs sm:text-sm font-bold text-emerald-950 uppercase tracking-wide">
                              {block.title}
                            </h4>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                            {block.body}
                          </p>
                        </div>
                      )
                    }
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed ${
                          block.tone === 'warning'
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-blue-50 border-blue-200 text-blue-900'
                        }`}
                      >
                        <Info className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{block.content}</span>
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}

          {/* Fechamento */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white border-0 shadow-sm rounded-xl p-5 sm:p-6 space-y-3">
            <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
              <Eye className="w-5 h-5 text-emerald-400" />
              Compromisso com a privacidade da comunidade
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Os dados da comunidade leitora pertencem às pessoas: o sistema coleta o mínimo
              necessário, protege em camadas independentes, registra quem acessa o quê e elimina
              trilhas antigas automaticamente. Dúvidas sobre esta documentação ou solicitações
              relacionadas a dados pessoais podem ser encaminhadas à equipe da biblioteca nos dias
              de atendimento.
            </p>
            <Button
              asChild
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              <Link to="/manual">Voltar ao Manual do Sistema</Link>
            </Button>
          </div>
        </main>
      </div>
    </div>
  )
}
