import React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { X, ZoomIn, BookOpen } from 'lucide-react'

interface BookCoverLightboxModalProps {
  isOpen: boolean
  onClose: () => void
  coverUrl?: string | null
  title: string
  author?: string
}

export const BookCoverLightboxModal: React.FC<BookCoverLightboxModalProps> = ({
  isOpen,
  onClose,
  coverUrl,
  title,
  author,
}) => {
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] flex flex-col p-0 overflow-hidden bg-background/95 backdrop-blur border-border/80 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors z-20 shadow-xs"
          aria-label="Fechar zoom"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Área rolável da imagem e conteúdo */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 flex flex-col items-center justify-center min-h-0">
          {coverUrl ? (
            <div className="relative max-w-full flex items-center justify-center my-auto">
              <img
                src={coverUrl}
                alt={`Capa do livro ${title}`}
                className="max-h-[50vh] sm:max-h-[55vh] w-auto max-w-full object-contain rounded-lg shadow-xl border border-border"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="w-44 h-60 sm:w-52 sm:h-72 my-auto bg-muted/50 rounded-lg flex flex-col items-center justify-center text-muted-foreground border border-border">
              <BookOpen className="w-14 h-14 mb-2 stroke-[1.2]" />
              <p className="text-xs">Sem foto de capa disponível</p>
            </div>
          )}

          <div className="mt-4 text-center max-w-md w-full shrink-0">
            <h3 className="font-semibold text-sm sm:text-base text-foreground line-clamp-2">
              {title}
            </h3>
            {author && <p className="text-xs text-muted-foreground mt-0.5">{author}</p>}
          </div>
        </div>

        {/* Rodapé fixo de ações — sempre visível */}
        <div className="p-3 sm:p-4 bg-muted/30 border-t border-border flex items-center justify-center gap-2.5 shrink-0">
          <Button size="sm" variant="outline" className="h-8 text-xs px-4" onClick={onClose}>
            Fechar
          </Button>
          {coverUrl && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs gap-1.5 shadow-2xs"
              onClick={() => window.open(coverUrl, '_blank')}
            >
              <ZoomIn className="w-3.5 h-3.5" />
              Abrir imagem original
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
