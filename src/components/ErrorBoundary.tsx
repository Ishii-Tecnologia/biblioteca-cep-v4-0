import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

/**
 * Barra erros de renderização (JavaScript lançado durante a montagem/atualização
 * de uma página) para que um bug em uma tela não derrube o app inteiro com uma
 * página em branco. Oferece recarregar e voltar ao início.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error ?? 'Erro desconhecido'),
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Erro de renderização capturado pelo ErrorBoundary:', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleGoHome = () => {
    window.location.assign('/')
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <Card className="w-full max-w-lg border-destructive/40 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Algo deu errado nesta tela
            </CardTitle>
            <CardDescription>
              Ocorreu um erro inesperado ao exibir esta página. As demais telas do sistema continuam
              disponíveis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="max-h-32 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {this.state.message}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button onClick={this.handleReload}>Recarregar página</Button>
              <Button variant="outline" onClick={this.handleGoHome}>
                Voltar ao início
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
}

export default ErrorBoundary
