import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Configuração exclusiva do Vitest.
 *
 * Existe separada do vite.config.ts para que o build de produção continue
 * intocado e para deixar explícito que os testes NÃO acessam rede nem banco:
 * todo serviço que fala com o Supabase é mockado no próprio arquivo de teste.
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Nenhum teste deve depender de banco: se um dia depender, falha aqui.
    globals: false,
    reporters: 'default',
  },
})
