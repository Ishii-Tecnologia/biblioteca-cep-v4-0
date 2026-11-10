import { Link } from 'react-router-dom'
import { ShieldCheck, Mail, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface PoliticaSection {
  id: string
  title: string
  paragraphs: string[]
  items?: string[]
}

const SECTIONS: PoliticaSection[] = [
  {
    id: 'responsavel',
    title: '1. Quem é o responsável pelo tratamento',
    paragraphs: [
      'Os dados pessoais tratados neste sistema são de responsabilidade da Coligação Espírita Progressista (CEP), por meio das suas bibliotecas: Biblioteca Cecília Braga (acervo geral) e Biblioteca Rino Curti (acervo diretoria).',
      'E-mail da biblioteca para contato sobre dados pessoais: [a ser definido pela diretoria].',
    ],
  },
  {
    id: 'finalidades',
    title: '2. Para que usamos seus dados',
    paragraphs: ['Os dados são usados apenas para as finalidades abaixo:'],
    items: [
      'Gestão do acervo e do catálogo de obras da biblioteca.',
      'Controle de empréstimos, devoluções, renovações, reservas e fila de espera.',
      'Comunicação com o leitor sobre seus empréstimos e reservas, como avisos de liberação de obra.',
      'Organização do atendimento de balcão e dos relatórios internos da biblioteca.',
    ],
  },
  {
    id: 'dados',
    title: '3. Quais dados coletamos',
    paragraphs: ['Coletamos somente o necessário para as finalidades acima:'],
    items: [
      'Nome completo.',
      'E-mail.',
      'Telefones (celular e, se houver, telefone fixo).',
      'Foto de identificação, somente se o leitor optar por enviá-la.',
      'Cursos frequentados na CEP, quando informados.',
      'Histórico de empréstimos e de reservas feitos na biblioteca.',
    ],
  },
  {
    id: 'cpf',
    title: '4. O que não coletamos',
    paragraphs: [
      'O número de CPF não é solicitado em nenhum formulário e não é armazenado no sistema. Também não pedimos dados de documentos pessoais para o cadastro.',
    ],
  },
  {
    id: 'sensivel',
    title: '5. Atenção: histórico de leitura e dados sensíveis',
    paragraphs: [
      'O histórico de leitura pode revelar interesses ligados a convicções religiosas e espirituais, que a legislação classifica como dado pessoal sensível. Por isso, esse histórico é tratado com cuidado redobrado: é acessado somente por quem tem função na biblioteca, é usado apenas para o atendimento e não é divulgado a terceiros.',
    ],
  },
  {
    id: 'acesso',
    title: '6. Quem tem acesso aos dados',
    paragraphs: [
      'Somente pessoas com papel interno no sistema têm acesso aos dados de leitores, conforme a função de cada uma:',
    ],
    items: [
      'Administrador: acesso completo, incluindo a gestão de usuários internos e as exclusões.',
      'Operador de Diretoria: rotinas de circulação, acervo geral e acervo restrito da Biblioteca Rino Curti.',
      'Operador: rotinas de circulação e atendimento de balcão no acervo geral.',
      'Leitores acessam apenas os próprios dados e o próprio histórico.',
    ],
  },
  {
    id: 'compartilhamento',
    title: '7. Com quem os dados são compartilhados',
    paragraphs: [
      'Não vendemos nem cedemos dados pessoais para fins comerciais. Os dados podem ser processados apenas pelos serviços técnicos de infraestrutura que mantêm o sistema (armazenamento do banco de dados, arquivos e envio de comunicações por e-mail), sempre para as finalidades descritas nesta política.',
    ],
  },
  {
    id: 'conservacao',
    title: '8. Por quanto tempo guardamos os dados',
    paragraphs: [
      'Os dados do cadastro são mantidos enquanto o leitor estiver ativo na biblioteca. Os registros de auditoria, que documentam quem alterou cada informação, passam por expurgo mensal automatizado, que elimina os registros mais antigos e mantém a base enxuta.',
      'Após um pedido de eliminação atendido, os dados são removidos do sistema, ressalvados eventuais registros que a lei exija manter.',
    ],
  },
  {
    id: 'direitos',
    title: '9. Seus direitos como titular',
    paragraphs: ['Você pode, a qualquer momento, pedir à biblioteca:'],
    items: [
      'Confirmação de que existem dados seus e acesso a eles cópia dos dados.',
      'Correção de dados incompletos, inexatos ou desatualizados.',
      'Informação sobre com quem os seus dados foram compartilhados.',
      'Eliminação dos seus dados, quando não houver outra base legal para mantê-los.',
      'Revogação do consentimento dado no cadastro.',
    ],
  },
  {
    id: 'pedidos',
    title: '10. Como fazer um pedido',
    paragraphs: [
      'Envie seu pedido pelo canal indicado abaixo ou procure a equipe da biblioteca nos dias de atendimento. A equipe poderá pedir a confirmação da sua identidade antes de atender o pedido.',
      'Canal para pedidos (e-mail da biblioteca): [a ser definido pela diretoria].',
    ],
  },
  {
    id: 'atualizacoes',
    title: '11. Alterações desta política',
    paragraphs: [
      'Esta política pode ser atualizada para refletir melhorias no sistema ou exigências legais. A versão vigente é sempre a publicada nesta página.',
    ],
  },
]

export default function PoliticaPrivacidade() {
  return (
    <div className="space-y-6 pb-16 max-w-4xl mx-auto">
      <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-900 rounded-2xl p-6 sm:p-8 text-white shadow-md">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-emerald-100 text-xs font-semibold border border-white/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Proteção de dados pessoais (LGPD)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Política de Privacidade
          </h1>
          <p className="text-emerald-100 text-xs sm:text-sm leading-relaxed">
            Esta política explica quais dados pessoais são usados pelas bibliotecas da Coligação
            Espírita Progressista (CEP), para que finalidade, quem tem acesso e como você pode
            exercer seus direitos.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Usamos seus dados só para organizar o acervo, os empréstimos e as reservas. Não pedimos
            seu CPF. Somente a equipe da biblioteca acessa seus dados, e você pode pedir cópia,
            correção ou eliminação a qualquer momento.
          </CardDescription>
        </CardHeader>
      </Card>

      {SECTIONS.map((section) => (
        <Card key={section.id} id={section.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700 leading-relaxed">
            {section.paragraphs.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
            {section.items && (
              <ul className="list-disc pl-5 space-y-1">
                {section.items.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
          <Link to="/">
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar à Página Inicial
          </Link>
        </Button>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <Mail className="w-3.5 h-3.5" />
          Dúvidas: [a ser definido pela diretoria]
        </span>
      </div>
    </div>
  )
}
