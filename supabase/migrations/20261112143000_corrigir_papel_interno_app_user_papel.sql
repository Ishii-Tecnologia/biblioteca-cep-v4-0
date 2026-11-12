-- Corrige o reconhecimento do papel interno (admin/operador/operador_diretoria)
-- nas funções usadas pelas políticas RLS.
--
-- Problema: app_user_papel() e get_current_user_papel() usavam
-- coalesce(p.papel, p.role, jwt..., default). Como profiles.role tem default
-- 'member', um operador promovido cujo perfil ficou com papel = NULL e
-- role = 'member' era resolvido como 'member' — o JWT (que contém o papel
-- correto) nunca era consultado — e toda política baseada em app_is_staff()
-- o tratava como leitor comum. Resultado: o modal de novo empréstimo exibia
-- "Nenhum leitor encontrado" para operadores.
--
-- Correção: valores internos gravados no perfil continuam tendo prioridade,
-- mas valores NÃO internos (ex.: 'member', 'leitor') deixam de ocultar o JWT;
-- e a ausência de linha em profiles não zera mais o resultado (o JWT ainda é
-- consultado via subconsulta escalar). Leitores e anônimos continuam
-- resolvidos como antes.

CREATE OR REPLACE FUNCTION public.app_user_papel()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select case
               when p.papel in ('admin', 'operador', 'operador_diretoria') then p.papel
               when p.role  in ('admin', 'operador', 'operador_diretoria') then p.role
             end
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    nullif(coalesce(
      current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'papel',
      current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'app_role',
      current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'
    ), ''),
    (
      select nullif(coalesce(nullif(p.papel, ''), nullif(p.role, '')), '')
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    case when auth.uid() is null then 'anon' else 'leitor' end
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_current_user_papel()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $function$
DECLARE
  v_papel TEXT;
  v_jwt   TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'anon';
  END IF;

  v_jwt := nullif(coalesce(
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'papel'),
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'app_role'),
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role')
  ), '');

  SELECT
    CASE
      WHEN p.papel IN ('admin', 'operador', 'operador_diretoria') THEN p.papel
      WHEN p.role  IN ('admin', 'operador', 'operador_diretoria') THEN p.role
    END
  INTO v_papel
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF v_papel IS NULL THEN
    SELECT nullif(coalesce(nullif(p.papel, ''), nullif(p.role, '')), '')
    INTO v_papel
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.papel NOT IN ('admin', 'operador', 'operador_diretoria')
      AND p.role  NOT IN ('admin', 'operador', 'operador_diretoria')
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_papel, v_jwt, 'leitor');
END;
$function$;
