import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/hooks/use-auth'
import { HeaderCountersProvider } from '@/hooks/use-header-counters'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Index from './pages/Index'
import Acervo from './pages/Acervo'
import AcervoDiretoria from './pages/AcervoDiretoria'
import Emprestimos from './pages/Emprestimos'
import Leitores from './pages/Leitores'
import Reservas from './pages/Reservas'
import Historico from './pages/Historico'
import Configuracoes from './pages/Configuracoes'
import Usuarios from './pages/Usuarios'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <HeaderCountersProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Layout>
            <Routes>
              {/* Rotas Públicas */}
              <Route path="/" element={<Index />} />
              <Route path="/acervo" element={<Acervo />} />
              <Route
                path="/acervo-diretoria"
                element={
                  <ProtectedRoute requireDiretoria>
                    <AcervoDiretoria />
                  </ProtectedRoute>
                }
              />
              <Route path="/login" element={<Login />} />

              {/* Rotas Autenticadas */}
              <Route
                path="/emprestimos"
                element={
                  <ProtectedRoute>
                    <Emprestimos />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reservas"
                element={
                  <ProtectedRoute>
                    <Reservas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leitores"
                element={
                  <ProtectedRoute>
                    <Leitores />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/historico"
                element={
                  <ProtectedRoute requireOperator>
                    <Historico />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/logs"
                element={
                  <ProtectedRoute requireOperator>
                    <Historico />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/usuarios"
                element={
                  <ProtectedRoute requireAdmin>
                    <Usuarios />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/configuracoes"
                element={
                  <ProtectedRoute requireAdmin>
                    <Configuracoes />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </TooltipProvider>
      </HeaderCountersProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
