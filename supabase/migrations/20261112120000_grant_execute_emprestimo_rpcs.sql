-- Concede EXECUTE nas RPCs de movimentação de exemplares para authenticated e anon.
-- Causa: as funções tinham ACL restrita (apenas postgres/service_role), o que bloqueava
-- operadores (e todos os perfis de UI) de registrar empréstimos/devoluções.
-- A proteção contra leitor/anônimo continua garantida dentro das funções (SECURITY DEFINER),
-- que validam o papel via public.app_user_papel().

GRANT EXECUTE ON FUNCTION public.emprestar_exemplar(varchar, integer, varchar)
  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.devolver_exemplar_v2(varchar, varchar)
  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.renovar_emprestimo(integer, varchar)
  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_retirada_emprestimo(integer, varchar)
  TO authenticated, anon;
