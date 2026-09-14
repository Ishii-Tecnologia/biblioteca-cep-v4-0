import Acervo from '@/pages/Acervo'

/**
 * Página do Catálogo & Acervo de Livros da Diretoria
 * Rota: /acervo-diretoria
 *
 * Exibe todas as funcionalidades do Acervo (listagem, filtros,
 * cadastro/edição de títulos e cópias, capas, empréstimo, reserva,
 * exclusão com bloqueio e auditoria), filtradas fixamente pela coleção 'diretoria'.
 */
export default function AcervoDiretoria() {
  return <Acervo colecao="diretoria" />
}
