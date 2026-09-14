import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Camera,
  CameraOff,
  Barcode,
  Search,
  Loader2,
  RefreshCw,
  AlertCircle,
  Keyboard,
  Sparkles,
  SwitchCamera,
  CheckCircle2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { fetchBookByIsbn, BookMetadata, sanitizeIsbn } from '@/services/isbn'
import {
  scanCanvasForBarcode,
  playBeepFeedback,
  triggerHapticFeedback,
} from '@/lib/barcode-decoder'

interface BarcodeScannerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBookFound: (book: BookMetadata) => void
}

export function BarcodeScannerModal({ open, onOpenChange, onBookFound }: BarcodeScannerModalProps) {
  const { toast } = useToast()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameId = useRef<number | null>(null)
  const isScanningRef = useRef<boolean>(false)
  const handledCodeRef = useRef<string | null>(null)

  const [mode, setMode] = useState<'camera' | 'manual'>('camera')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualIsbn, setManualIsbn] = useState('')
  const [searching, setSearching] = useState(false)
  const [scanningActive, setScanningActive] = useState(false)
  const [detectedCode, setDetectedCode] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [isSecureContext, setIsSecureContext] = useState<boolean>(true)

  // Safe stop for camera & animation frames
  const stopCamera = useCallback(() => {
    isScanningRef.current = false
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current)
      animationFrameId.current = null
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          track.stop()
        })
      } catch (err) {
        console.warn('Erro ao parar tracks da câmera:', err)
      }
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setScanningActive(false)
  }, [])

  // Process found ISBN / barcode
  const handleLookup = useCallback(
    async (code: string) => {
      const clean = sanitizeIsbn(code)
      if (!clean) {
        toast({
          title: 'Código inválido',
          description: 'Digite ou escaneie um código de barras / ISBN numérico válido.',
          variant: 'destructive',
        })
        return
      }

      setSearching(true)
      try {
        const bookData = await fetchBookByIsbn(clean)
        toast({
          title: 'Livro encontrado!',
          description: `"${bookData.titulo_de_livro}" preenchido automaticamente.`,
        })
        stopCamera()
        onBookFound(bookData)
        onOpenChange(false)
      } catch (err: any) {
        toast({
          title: 'Não foi possível obter dados automaticamente',
          description:
            err.message ||
            'Obra não localizada pelo ISBN nas bases públicas. Você pode preencher os dados manualmente.',
          variant: 'destructive',
        })
      } finally {
        setSearching(false)
      }
    },
    [onBookFound, onOpenChange, stopCamera, toast],
  )

  // Detection loop with BarcodeDetector and fallback canvas decoder
  const startDetectionLoop = useCallback(() => {
    const BarcodeDetectorClass = (window as any).BarcodeDetector
    let nativeDetector: any = null

    if (BarcodeDetectorClass) {
      try {
        nativeDetector = new BarcodeDetectorClass({
          formats: ['ean_13', 'ean_8', 'isbn', 'upc_a', 'upc_e', 'code_128', 'qr_code'],
        })
      } catch (e) {
        console.warn('BarcodeDetector constructor warning:', e)
      }
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    isScanningRef.current = true
    handledCodeRef.current = null
    let lastScanTime = 0

    const detectLoop = async (timestamp: number) => {
      if (!isScanningRef.current || !videoRef.current) return

      const video = videoRef.current

      // Verify video is ready with valid dimensions
      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        // Increased frame frequency for mobile responsiveness (~25-30 fps, interval 35ms)
        if (timestamp - lastScanTime > 35 && !handledCodeRef.current) {
          lastScanTime = timestamp

          // 1. Try native BarcodeDetector first
          if (nativeDetector) {
            try {
              const barcodes = await nativeDetector.detect(video)
              if (barcodes && barcodes.length > 0) {
                for (const bc of barcodes) {
                  const raw = bc.rawValue || ''
                  const clean = sanitizeIsbn(raw)
                  if (clean && (clean.length === 10 || clean.length === 13 || clean.length === 8)) {
                    handledCodeRef.current = clean
                    playBeepFeedback()
                    triggerHapticFeedback()
                    setDetectedCode(clean)
                    stopCamera()
                    await handleLookup(clean)
                    return
                  }
                }
              }
            } catch {
              // Frame detection error, continue next frame
            }
          }

          // 2. Canvas sampling decoder with enhanced contrast and orientation
          if (!handledCodeRef.current && ctx) {
            try {
              const vw = video.videoWidth
              const vh = video.videoHeight
              // Use balanced resolution for crisp edge detection
              canvas.width = Math.min(vw, 800)
              canvas.height = Math.min(vh, 600)

              // Draw original video frame
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

              // Contrast & brightness pre-processing on canvas for glare/low contrast covers
              const decoded = scanCanvasForBarcode(ctx, canvas.width, canvas.height)
              if (decoded) {
                const clean = sanitizeIsbn(decoded)
                if (clean) {
                  handledCodeRef.current = clean
                  playBeepFeedback()
                  triggerHapticFeedback()
                  setDetectedCode(clean)
                  stopCamera()
                  await handleLookup(clean)
                  return
                }
              }
            } catch {
              // Canvas processing error, continue loop
            }
          }
        }
      }

      if (isScanningRef.current) {
        animationFrameId.current = requestAnimationFrame(detectLoop)
      }
    }

    animationFrameId.current = requestAnimationFrame(detectLoop)
  }, [handleLookup, stopCamera])

  // Start Camera with resilient fallback constraints
  const startCamera = useCallback(
    async (preferredFacing: 'environment' | 'user' = facingMode) => {
      stopCamera()
      setCameraError(null)
      setDetectedCode(null)
      handledCodeRef.current = null

      // Check for HTTPS / secure context
      const isSecure = window.isSecureContext || window.location.hostname === 'localhost'
      setIsSecureContext(isSecure)
      if (!isSecure) {
        setCameraError(
          'O acesso à câmera pelo navegador exige conexão segura (HTTPS). Utilize a busca manual de ISBN.',
        )
        setMode('manual')
        return
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Seu navegador não possui suporte à API de câmera. Utilize o modo de digitação manual.',
        )
        setMode('manual')
        return
      }

      // Progressive constraint strategy for maximum mobile compatibility
      const constraintOptions: MediaStreamConstraints[] = [
        // 1. High-res rear camera with focus mode
        {
          video: {
            facingMode: { ideal: preferredFacing },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            aspectRatio: { ideal: 16 / 9 },
          },
          audio: false,
        },
        // 2. Standard exact facingMode
        {
          video: {
            facingMode: preferredFacing,
          },
          audio: false,
        },
        // 3. Fallback generic video stream
        {
          video: true,
          audio: false,
        },
      ]

      let stream: MediaStream | null = null
      let lastErr: any = null

      for (const constraints of constraintOptions) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
          if (stream) break
        } catch (err) {
          lastErr = err
        }
      }

      if (!stream) {
        console.warn('Falha em todas as tentativas de getUserMedia:', lastErr)
        let message = 'Não foi possível acessar a câmera do dispositivo.'
        if (
          lastErr?.name === 'NotAllowedError' ||
          lastErr?.name === 'PermissionDeniedError' ||
          lastErr?.message?.includes('Permission denied')
        ) {
          message =
            'Permissão de câmera negada. Por favor, autorize o acesso à câmera nas configurações do navegador do celular.'
        } else if (lastErr?.name === 'NotFoundError' || lastErr?.name === 'DevicesNotFoundError') {
          message = 'Nenhuma câmera compatível encontrada neste dispositivo.'
        } else if (lastErr?.name === 'NotReadableError' || lastErr?.name === 'TrackStartError') {
          message =
            'A câmera já está sendo utilizada por outro aplicativo ou aba. Feche outros apps e tente novamente.'
        } else if (lastErr?.name === 'OverconstrainedError') {
          message = 'Configuração de vídeo não suportada pela câmera deste dispositivo.'
        }

        setCameraError(message)
        setMode('manual')
        return
      }

      streamRef.current = stream

      if (videoRef.current) {
        const video = videoRef.current
        video.srcObject = stream
        video.setAttribute('playsinline', 'true') // Required for iOS Safari
        video.setAttribute('webkit-playsinline', 'true')
        video.muted = true

        try {
          await video.play()
        } catch (playErr) {
          console.warn('Autoplay error on video element:', playErr)
        }
      }

      setScanningActive(true)
      startDetectionLoop()
    },
    [facingMode, startDetectionLoop, stopCamera],
  )

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextMode)
    startCamera(nextMode)
  }

  useEffect(() => {
    if (open) {
      setMode('camera')
      setDetectedCode(null)
      startCamera('environment')
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [open, startCamera, stopCamera])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleLookup(manualIsbn)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Barcode className="w-5 h-5 text-emerald-600" />
            Leitor de Código de Barras / ISBN
          </DialogTitle>
          <DialogDescription>
            Aponte a câmera para o código de barras (EAN-13/ISBN) no verso do livro para preencher
            os dados automaticamente.
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher: Camera or Manual */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => {
              setMode('camera')
              startCamera(facingMode)
            }}
            className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              mode === 'camera'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Camera className="w-4 h-4" />
            Câmera do Dispositivo
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('manual')
              stopCamera()
            }}
            className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              mode === 'manual'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            Digitar ISBN Manualmente
          </button>
        </div>

        {mode === 'camera' ? (
          <div className="space-y-3 py-1">
            <div className="relative aspect-4/3 w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-300 flex items-center justify-center shadow-inner">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />

              {/* Scanning visual guide frame */}
              {scanningActive && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                  <div className="w-64 sm:w-72 h-36 border-2 border-emerald-400 rounded-xl shadow-2xl relative bg-emerald-500/10 flex items-center justify-center overflow-hidden">
                    <div className="w-full h-0.5 bg-rose-500 animate-pulse shadow-md" />
                    {/* Corner Reticles */}
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-emerald-300" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-emerald-300" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-emerald-300" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-emerald-300" />

                    <span className="absolute bottom-2 text-[10px] text-white font-medium bg-slate-900/80 px-2 py-0.5 rounded backdrop-blur-xs">
                      Alinhe a linha vermelha sobre as barras
                    </span>
                  </div>
                </div>
              )}

              {/* Camera Error / Fallback State */}
              {cameraError && (
                <div className="absolute inset-0 bg-slate-900/95 text-white p-6 flex flex-col items-center justify-center text-center space-y-3">
                  <CameraOff className="w-10 h-10 text-rose-400" />
                  <p className="text-xs font-medium text-slate-200 max-w-sm">{cameraError}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMode('manual')}
                      className="text-xs bg-white text-slate-900 border-none hover:bg-slate-100 font-medium"
                    >
                      <Keyboard className="w-3.5 h-3.5 mr-1.5 text-emerald-700" />
                      Digitar ISBN
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startCamera(facingMode)}
                      className="text-xs bg-slate-800 text-white border-slate-700 hover:bg-slate-700 font-medium"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Tentar Novamente
                    </Button>
                  </div>
                </div>
              )}

              {searching && (
                <div className="absolute inset-0 bg-slate-900/85 backdrop-blur-xs text-white flex flex-col items-center justify-center gap-2 z-10">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                  <p className="text-xs font-semibold">Consultando informações do livro...</p>
                  {detectedCode && (
                    <span className="text-[11px] font-mono text-emerald-300 flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ISBN: {detectedCode}
                    </span>
                  )}
                </div>
              )}

              {/* Botão de alternar câmera (traseira/frontal) no celular */}
              {scanningActive && (
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/70 text-white hover:bg-slate-900 transition-colors shadow-md backdrop-blur-xs"
                  title="Alternar câmera frontal/traseira"
                  aria-label="Alternar câmera"
                >
                  <SwitchCamera className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Hint and controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5 text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Posicione o código de barras com boa iluminação e foco.</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => startCamera(facingMode)}
                  className="h-7 text-xs text-slate-700 hover:text-emerald-700"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Reiniciar Câmera
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="manualIsbnInput" className="text-xs font-semibold text-slate-700">
                Código ISBN ou Código de Barras (EAN-13)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="manualIsbnInput"
                  autoFocus
                  placeholder="Ex: 9788535902778 ou 8535902775"
                  value={manualIsbn}
                  onChange={(e) => setManualIsbn(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button
                  type="submit"
                  disabled={searching || !manualIsbn.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shrink-0"
                >
                  {searching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Buscar Livro
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                O ISBN possui 10 ou 13 dígitos numéricos e pode ser encontrado no verso ou na ficha
                catalográfica do livro.
              </p>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Busca bibliográfica automática</p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Os dados de título, autores, editora e sinopse são buscados na base pública do
                  Google Books e Open Library.
                </p>
              </div>
            </div>
          </form>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              stopCamera()
              onOpenChange(false)
            }}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
