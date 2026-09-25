import { useAuth } from '@/hooks/use-auth'
import { Link } from 'react-router-dom'
import {
  Sparkles,
  BookOpen,
  Users,
  Repeat,
  BookmarkCheck,
  Settings,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Lock,
  Calendar,
  FileSpreadsheet,
  Building2,
  Library,
  HelpCircle,
  Mail,
  UserPlus,
  Send,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function PrimeirosPassos() {
  const { isOperadorOrAdmin } = useAuth()

  return (
    <div className="space-y-8 pb-16 max-w-5xl mx-auto">
      {/* Topo / Header da Página */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-900 rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 opacity-10 pointer-events-none">
          <BookOpen className="w-80 h-80" />
        </div>

        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-emerald-100 text-xs font-semibold backdrop-blur-xs border border-white/20">
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Guia Rápido de 1 Página — Biblioteca CEP v4.0</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            Primeiros Passos do Operador
          </h1>
          <p className="text-emerald-100 text-xs sm:text-sm md:text-base leading-relaxed">
            Bem-vindo(a) à equipe! Elaboramos este guia prático para ajudar você a dominar as
            funções essenciais do nosso sistema com facilidade e segurança. Sinta-se preparado(a)
            para realizar seus atendimentos de forma ágil, autônoma e eficiente desde o primeiro
            dia. Conte conosco nessa jornada e excelente trabalho!
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="bg-white text-emerald-900 hover:bg-emerald-50 text-xs font-bold gap-1.5 shadow-sm"
            >
              <Link to="/manual">
                <HelpCircle className="w-3.5 h-3.5 text-emerald-700" />
                <span>Abrir Manual Completo</span>
              </Link>
            </Button>
            <span className="text-emerald-200 text-xs px-2 hidden sm:inline">•</span>
            <span className="text-emerald-100 text-xs">
              Tempo de leitura estimado: <strong>3 minutos</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Caixa de Regras de Ouro (Destaque Principal) */}
      <Card className="border-2 border-amber-300 bg-gradient-to-br from-amber-50/80 via-amber-50/40 to-white shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-amber-100 bg-amber-100/40">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500 text-white shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-amber-950">
                Regras de Ouro da Biblioteca CEP
              </CardTitle>
              <CardDescription className="text-xs text-amber-800">
                Memorize estes 4 parâmetros institucionais para tirar dúvidas no balcão de
                atendimento
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-white border border-amber-200/80 shadow-2xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                Empréstimos
              </span>
              <Repeat className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-slate-900">Máx. 4 livros</div>
            <p className="text-xs text-slate-600 leading-snug">
              Limite simultâneo por leitor. O 5º livro é bloqueado pelo sistema.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-amber-200/80 shadow-2xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                Fila de Reserva
              </span>
              <BookmarkCheck className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-slate-900">Máx. 2 leitores</div>
            <p className="text-xs text-slate-600 leading-snug">
              Fila máxima de espera por livro. Acima disso, novas reservas são rejeitadas.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-amber-200/80 shadow-2xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                Retirada
              </span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-slate-900">4 dias úteis</div>
            <p className="text-xs text-slate-600 leading-snug">
              Prazo após a contemplação do livro para retirar no balcão da CEP.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-amber-200/80 shadow-2xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                Dias Úteis
              </span>
              <Calendar className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-lg font-bold text-slate-900 flex items-center gap-1.5 pt-1">
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-black">
                SÁBADO CONTA
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-snug pt-0.5">
              Sábado é dia útil na CEP. Domingos e feriados cadastrados não contam.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Roteiro Numerado do Dia a Dia (6 Etapas Essenciais) */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-4 h-4" />
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Roteiro Essencial do Dia a Dia do Operador
            </h2>
          </div>
          <Badge variant="outline" className="text-xs font-mono text-slate-600">
            6 passos fundamentais
          </Badge>
        </div>

        {/* Passo 1: Visão Geral e os Dois Acervos */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-emerald-700 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-2xs">
                1
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Visão Geral do Sistema & Os Dois Acervos
                </h3>
                <p className="text-xs text-slate-500">
                  Entenda a estrutura das duas bibliotecas mantidas pela CEP
                </p>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-xs h-7 gap-1 border-slate-300"
            >
              <Link to="/acervo">
                <span>Ver Acervo Geral</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
              </Link>
            </Button>
          </div>

          <div className="p-5 space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed">
            <p>
              A Biblioteca CEP é o sistema unificado de controle de obras da literatura espírita,
              que, além da movimentação (empréstimos de livros físicos), envolve cadastro de
              leitores e catalogação do material do acervo da Coligação Espírita Progressista. As
              obras são divididas em duas coleções distintas:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/40 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs sm:text-sm">
                  <BookOpen className="w-4 h-4 text-emerald-700" />
                  <span>Biblioteca Cecília Braga (Acervo Geral)</span>
                </div>
                <p className="text-xs text-slate-600 leading-snug">
                  Reúne literatura espírita, obras básicas de Allan Kardec, romances, estudos,
                  mediunidade e infantojuvenil. <strong>Acesso público</strong> a todos os leitores
                  cadastrados.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/40 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-950 font-bold text-xs sm:text-sm">
                  <Building2 className="w-4 h-4 text-amber-700" />
                  <span>Biblioteca Rino Curti (Restrita à Diretoria)</span>
                  <Badge className="bg-amber-200 text-amber-950 border-amber-300 text-[10px] px-1 py-0 ml-auto">
                    Restrito
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 leading-snug">
                  Acervo sob guarda especial da Diretoria Executiva da CEP (obras históricas e
                  raras). Códigos começam com prefixo <code>DIR-</code> e a retirada só é permitida
                  para leitores autorizados no cadastro.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Passo 2: Fluxo do Leitor */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-emerald-700 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-2xs">
                2
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Fluxo do Leitor: Cadastro, Aprovação e Primeiro Acesso
                </h3>
                <p className="text-xs text-slate-500">
                  Como gerenciar novas inscrições de frequentadores da casa
                </p>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-xs h-7 gap-1 border-slate-300"
            >
              <Link to="/leitores">
                <span>Abrir Leitores</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
              </Link>
            </Button>
          </div>

          <div className="p-5 space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
                  1. Cadastrar leitor presencial
                </span>
                <p className="text-xs text-slate-600">
                  Clique em <strong>"Cadastrar Novo Leitor"</strong> em Leitores. Preencha nome
                  (mín. 3 letras), e-mail único, telefone celular com DDD e vincule o(s) curso(s)
                  frequentados na CEP (ex: Curso Básico, Educação Mediúnica).
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  2. Aprovar na aba "Pendentes"
                </span>
                <p className="text-xs text-slate-600">
                  Quando frequentadores se inscrevem pelo celular, eles entram na aba{' '}
                  <strong>"Pendentes de Validação"</strong>. Revise os dados e clique em{' '}
                  <strong>"Aprovar"</strong>.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <Send className="w-3.5 h-3.5 text-emerald-600" />
                  3. Enviar / Reenviar link de acesso
                </span>
                <p className="text-xs text-slate-600">
                  O sistema dispara automaticamente o link de primeiro acesso por e-mail.{' '}
                  <strong>O link expira em 1 hora</strong>. Se expirar, clique em{' '}
                  <strong>"Reenviar Link"</strong> no card do leitor (possui proteção de taxa com
                  cronômetro regressivo).
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
              <Mail className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                <strong>Atenção:</strong> O e-mail de primeiro acesso possui remetente institucional{' '}
                <em>"Biblioteca da Coligação Espírita Progressista (CEP)"</em>. Oriente o leitor a
                checar a caixa de spam se necessário.
              </span>
            </div>
          </div>
        </section>

        {/* Passo 3: Fluxo do Acervo */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-emerald-700 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-2xs">
                3
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Fluxo do Acervo: Cadastrar Livros, Exemplares & Importação CSV
                </h3>
                <p className="text-xs text-slate-500">
                  Catalogação inteligente e geração determinística de códigos
                </p>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-xs h-7 gap-1 border-slate-300"
            >
              <Link to="/acervo">
                <span>Novo Livro</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
              </Link>
            </Button>
          </div>

          <div className="p-5 space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
            <ul className="space-y-2 list-none">
              <li className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <ArrowRight className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Cadastro por ISBN ou Leitor de Código de Barras:</strong> Digite o ISBN ou
                  use o leitor óptico/câmera para buscar capa, título, autor e editora
                  automaticamente.
                </div>
              </li>
              <li className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <ArrowRight className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Códigos Automáticos e Sequenciais:</strong> O sistema gera o ID do livro
                  pelas iniciais (ex: Chico Xavier + Emmanuel vira <code>CX-EM001</code>; Allan
                  Kardec vira <code>AK-001</code>; Diretoria ganha <code>DIR-</code>). Os exemplares
                  físicos ganham sufixo sequencial (ex: <code>CX-EM001-1</code>,{' '}
                  <code>CX-EM001-2</code>).
                </div>
              </li>
              <li className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <ArrowRight className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Importação em Lote via Planilha CSV:</strong> Clique em "Importar CSV" no
                  Acervo, baixe o modelo oficial e carregue dezenas de títulos de uma só vez com
                  validação prévia.
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* Passo 4: Fluxo de Empréstimos & Ciclo Completo */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-emerald-700 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-2xs">
                4
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Fluxo de Empréstimos: Da Solicitação à Devolução com Fila FIFO
                </h3>
                <p className="text-xs text-slate-500">
                  O ciclo mais importante da sua rotina no balcão
                </p>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-xs h-7 gap-1 border-slate-300"
            >
              <Link to="/emprestimos">
                <span>Abrir Empréstimos</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
              </Link>
            </Button>
          </div>

          <div className="p-5 space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed">
            {/* Visual Timeline do Empréstimo */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
              <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 flex flex-col justify-between">
                <div>
                  <Badge className="bg-emerald-700 text-white text-[10px] mb-1">Passo A</Badge>
                  <div className="font-bold text-slate-900">1. Solicitação</div>
                  <p className="text-slate-600 text-[11px] mt-1">
                    Leitor solicita pelo catálogo (Pré-Reserva) ou operador cria direto no balcão.
                  </p>
                </div>
                <div className="mt-2 text-[10px] text-emerald-800 font-semibold">
                  Aprovar em Reservas
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 flex flex-col justify-between">
                <div>
                  <Badge className="bg-amber-600 text-white text-[10px] mb-1">Passo B</Badge>
                  <div className="font-bold text-slate-900">2. Aguardando Retirada</div>
                  <p className="text-slate-600 text-[11px] mt-1">
                    Exemplar fica <strong>BLOQUEADO</strong>. Leitor tem{' '}
                    <strong>4 dias úteis</strong> para retirar.
                  </p>
                </div>
                <div className="mt-2 text-[10px] text-amber-800 font-semibold">
                  Sábado conta como dia útil
                </div>
              </div>

              <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 flex flex-col justify-between">
                <div>
                  <Badge className="bg-blue-600 text-white text-[10px] mb-1">Passo C</Badge>
                  <div className="font-bold text-slate-900">3. Confirmar Retirada</div>
                  <p className="text-slate-600 text-[11px] mt-1">
                    Ao entregar o livro, clique em <strong>"Confirmar Retirada"</strong>. O status
                    muda para <strong>ATIVO</strong>.
                  </p>
                </div>
                <div className="mt-2 text-[10px] text-blue-800 font-semibold">
                  Prazo: 15 dias corridos
                </div>
              </div>

              <div className="p-3 rounded-lg bg-purple-50/70 border border-purple-200 flex flex-col justify-between">
                <div>
                  <Badge className="bg-purple-600 text-white text-[10px] mb-1">Passo D</Badge>
                  <div className="font-bold text-slate-900">4. Devolver & Fila FIFO</div>
                  <p className="text-slate-600 text-[11px] mt-1">
                    Ao devolver, se houver fila de espera, o <strong>1º da fila</strong> é
                    contemplado automaticamente!
                  </p>
                </div>
                <div className="mt-2 text-[10px] text-purple-800 font-semibold">
                  Alocação 100% automática
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <strong>Como realizar devolução:</strong> Abra a página <em>Empréstimos</em>, localize
              o leitor ou o exemplar ativo e clique no botão verde <strong>"Devolver"</strong>. Se
              houver fila, o livro já entra como "Aguardando Retirada" para a próxima pessoa.
            </div>
          </div>
        </section>

        {/* Passo 5: Bloqueio e Exclusão Segura */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-emerald-700 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-2xs">
                5
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Bloqueio, Desbloqueio e Exclusão Segura de Leitores
                </h3>
                <p className="text-xs text-slate-500">
                  Proteção de integridade referencial e penalidades
                </p>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-xs h-7 gap-1 border-slate-300"
            >
              <Link to="/leitores">
                <span>Gerenciar Leitores</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
              </Link>
            </Button>
          </div>

          <div className="p-5 space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  Bloquear / Desbloquear Leitor
                </span>
                <p className="text-xs text-slate-600">
                  Clique no botão <strong>"Bloquear"</strong> no card do leitor para suspender novas
                  retiradas ou reservas (ex: atrasos reincidentes). Para reativar, clique em{' '}
                  <strong>"Desbloquear"</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-rose-200 bg-rose-50/40 space-y-1.5">
                <span className="font-bold text-rose-950 flex items-center gap-1.5 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  Regra Rígida de Exclusão
                </span>
                <p className="text-xs text-slate-700">
                  O sistema <strong>bloqueia a exclusão</strong> se o leitor tiver qualquer
                  empréstimo ativo ou reserva pendente. Primeiro é obrigatório devolver os livros ou
                  cancelar a reserva.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Passo 6: Configurações de Administrador */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-emerald-700 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-2xs">
                6
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Configurações de Admin: Parâmetros, Feriados e Auditoria
                </h3>
                <p className="text-xs text-slate-500">
                  Controles avançados visíveis para perfil Administrador
                </p>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-xs h-7 gap-1 border-slate-300"
            >
              <Link to="/configuracoes">
                <span>Configurações</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
              </Link>
            </Button>
          </div>

          <div className="p-5 space-y-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <Settings className="w-3.5 h-3.5 text-emerald-600" />
                  Parâmetros Rígidos
                </span>
                <p className="text-xs text-slate-600">
                  Ajuste o prazo de retirada (4 dias), fila de reservas (2), limites por leitor (4)
                  e prazo de empréstimo (15 dias).
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  Semeadura de Feriados
                </span>
                <p className="text-xs text-slate-600">
                  Insira feriados nacionais com o botão <strong>"Semear Padrões"</strong>. Dias
                  feriados são pulados automaticamente na contagem de dias úteis.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  Log de Auditoria
                </span>
                <p className="text-xs text-slate-600">
                  Rastreabilidade completa: cada transição de status de exemplar ou empréstimo fica
                  registrada com data, hora e operador responsável.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Atalho para o Manual Completo / Dúvidas */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1 text-center sm:text-left">
          <div className="font-bold text-base flex items-center justify-center sm:justify-start gap-2">
            <HelpCircle className="w-5 h-5 text-emerald-400" />
            Precisa de detalhes aprofundados ou resolução de casos específicos?
          </div>
          <p className="text-xs text-slate-300">
            Acesse o Manual Completo com capturas, mensagens de erro detalhadas, simulação de leitor
            e regras de negócio completas.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            asChild
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 shadow-sm"
          >
            <Link to="/manual">
              <span>Ir para Manual Completo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
