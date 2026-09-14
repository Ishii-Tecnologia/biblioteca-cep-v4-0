import { supabase } from '@/lib/supabase/client'

export interface CompressOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  outputFormat?: 'image/jpeg' | 'image/webp' | 'image/png'
}

/**
 * Utilitário vanilla JS que recebe um File de imagem, redimensiona proporcionalmente via Canvas
 * e comprime retornando um Blob pronto para upload e uma dataUrl para preview imediato.
 *
 * @param file Arquivo original selecionado pelo usuário
 * @param options Opções de largura máxima, altura máxima, qualidade (0 a 1) e formato de saída
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const { maxWidth = 800, maxHeight = 800, quality = 0.8, outputFormat = 'image/jpeg' } = options

  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('O arquivo selecionado não é uma imagem válida.'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error('Arquivo de imagem inválido ou corrompido.'))
      img.onload = () => {
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height

        // Redimensionar proporcionalmente se exceder as dimensões máximas
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Não foi possível obter o contexto 2D do Canvas.'))
          return
        }

        // Fundo branco caso a imagem original tenha transparência e estejamos exportando para JPEG
        if (outputFormat === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, width, height)
        }

        // Suavização de imagem de alta qualidade
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        const dataUrl = canvas.toDataURL(outputFormat, quality)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Falha ao gerar o Blob da imagem comprimida.'))
              return
            }
            resolve({ blob, dataUrl, width, height })
          },
          outputFormat,
          quality,
        )
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Faz a compressão e o upload de um arquivo de imagem para o Supabase Storage ('avatars' ou 'capas').
 * Retorna a URL pública gerada para persistência no banco de dados.
 */
export async function uploadImageToStorage(
  file: File,
  bucket: 'avatars' | 'capas',
  options: CompressOptions = {},
): Promise<string> {
  const { blob } = await compressImage(file, options)
  const ext =
    options.outputFormat === 'image/webp'
      ? 'webp'
      : options.outputFormat === 'image/png'
        ? 'png'
        : 'jpg'
  const randomSuffix = Math.random().toString(36).substring(2, 9)
  const timestamp = Date.now()
  const filePath = `${bucket}_${timestamp}_${randomSuffix}.${ext}`

  const { data, error } = await supabase.storage.from(bucket).upload(filePath, blob, {
    contentType: options.outputFormat || 'image/jpeg',
    cacheControl: '3600',
    upsert: true,
  })

  if (error) {
    throw new Error(`Erro ao enviar imagem para o storage: ${error.message}`)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(data.path)

  return publicUrl
}

/**
 * Converte uma URL de imagem externa ou dataURL (base64) em um objeto File,
 * útil quando o usuário copia uma imagem da web ou arrasta/cola uma URL.
 */
export async function urlToFile(url: string, filename = 'imagem.png'): Promise<File> {
  // Trata dataURL (data:image/...)
  if (url.startsWith('data:')) {
    const arr = url.split(',')
    const mimeMatch = arr[0].match(/:(.*?);/)
    const mime = mimeMatch ? mimeMatch[1] : 'image/png'
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new File([u8arr], filename, { type: mime })
  }

  // Tenta baixar via fetch (blob: ou http/https se permitido por CORS)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Não foi possível baixar a imagem da URL informada (HTTP ${response.status}).`)
  }
  const blob = await response.blob()
  const mime = blob.type || 'image/png'
  return new File([blob], filename, { type: mime })
}

/**
 * Extrai um objeto File a partir de um evento ClipboardEvent ou leitura direta
 * do navigator.clipboard. Suporta:
 * 1. Arquivos diretos de imagem nos items da área de transferência
 * 2. Arquivos na lista de clipboardData.files
 * 3. HTML com tag <img src="..."> copiada de páginas web
 * 4. URLs de imagem ou dataURL coladas como texto puro
 */
export async function extractImageFileFromClipboard(
  e?: React.ClipboardEvent | ClipboardEvent,
): Promise<File | null> {
  const defaultFilename = `pasted-image-${Date.now()}.png`

  // 1. Tentar ler do ClipboardEvent fornecido
  if (e && 'clipboardData' in e && e.clipboardData) {
    const clipboardData = e.clipboardData

    // 1.1 Itens de arquivo (prioridade)
    if (clipboardData.items) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i]
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) {
            return new File([blob], defaultFilename, { type: blob.type || 'image/png' })
          }
        }
      }
    }

    // 1.2 Files diretos
    if (clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        const f = clipboardData.files[i]
        if (f.type.startsWith('image/')) {
          return f
        }
      }
    }

    // 1.3 HTML (quando o usuário clica com botão direito e escolhe "Copiar imagem" em um navegador)
    const html = clipboardData.getData('text/html')
    if (html) {
      console.log('[image-upload] Tag HTML encontrada no clipboard:', html.slice(0, 100))
      const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
      if (match && match[1]) {
        try {
          const file = await urlToFile(match[1], defaultFilename)
          console.log(
            '[image-upload] Imagem extraída de HTML img src com sucesso:',
            file.size,
            'bytes',
          )
          return file
        } catch (fetchErr) {
          console.warn('[image-upload] Não foi possível obter imagem da tag HTML colada:', fetchErr)
        }
      }
    }

    // 1.4 Texto plano que seja URL de imagem ou data:image
    const text = clipboardData.getData('text')?.trim()
    if (text) {
      console.log('[image-upload] Texto plano no clipboard:', text.slice(0, 60))
      if (text.startsWith('data:image/')) {
        try {
          const file = await urlToFile(text, defaultFilename)
          console.log(
            '[image-upload] Imagem extraída de base64 texto com sucesso:',
            file.size,
            'bytes',
          )
          return file
        } catch (err) {
          console.warn('[image-upload] Erro ao converter dataURL de imagem colada:', err)
        }
      } else if (/^https?:\/\/.*\.(png|jpg|jpeg|webp|gif|svg)(\?.*)?$/i.test(text)) {
        try {
          const file = await urlToFile(text, defaultFilename)
          console.log('[image-upload] Imagem baixada de URL com sucesso:', file.size, 'bytes')
          return file
        } catch (err) {
          console.warn('[image-upload] Erro ao baixar imagem da URL copiada:', err)
        }
      }
    }
  }

  // 2. Fallback: tentar ler via navigator.clipboard.read()
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      if (navigator.clipboard.read) {
        const clipboardItems = await navigator.clipboard.read()
        for (const item of clipboardItems) {
          const imageType = item.types.find((t) => t.startsWith('image/'))
          if (imageType) {
            const blob = await item.getType(imageType)
            console.log(
              '[image-upload] Imagem obtida via navigator.clipboard.read():',
              blob.size,
              imageType,
            )
            return new File([blob], defaultFilename, { type: imageType })
          }
        }
      }

      if (navigator.clipboard.readText) {
        const text = (await navigator.clipboard.readText()).trim()
        if (text.startsWith('data:image/')) {
          const file = await urlToFile(text, defaultFilename)
          console.log(
            '[image-upload] Imagem obtida via navigator.clipboard.readText (base64):',
            file.size,
          )
          return file
        } else if (/^https?:\/\/.*\.(png|jpg|jpeg|webp|gif|svg)(\?.*)?$/i.test(text)) {
          const file = await urlToFile(text, defaultFilename)
          console.log(
            '[image-upload] Imagem baixada via navigator.clipboard.readText (URL):',
            file.size,
          )
          return file
        }
      }
    } catch (clipErr) {
      console.warn('[image-upload] Acesso a navigator.clipboard negado ou indisponível:', clipErr)
    }
  }

  console.log('[image-upload] Nenhuma imagem identificada no evento de clipboard.')
  return null
}
