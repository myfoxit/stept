import * as React from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Expand,
  Trash2,
  Download,
  EllipsisVertical,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import './resizable-image.scss'

export const ResizableImageComponent: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor,
}) => {
  const { src, alt, title, width, alignment = 'center' } = node.attrs
  const [isHovered, setIsHovered] = React.useState(false)
  const [isResizing, setIsResizing] = React.useState(false)
  const [showLightbox, setShowLightbox] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [currentWidth, setCurrentWidth] = React.useState<number | null>(
    width ? parseInt(width, 10) : null
  )
  const containerRef = React.useRef<HTMLDivElement>(null)
  const imgRef = React.useRef<HTMLImageElement>(null)
  const widthRef = React.useRef(currentWidth)

  const isEditable = editor.isEditable

  React.useEffect(() => {
    widthRef.current = currentWidth
  }, [currentWidth])

  React.useEffect(() => {
    if (!showLightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowLightbox(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showLightbox])

  const handleResizeStart = React.useCallback(
    (e: React.MouseEvent, direction: 'left' | 'right') => {
      if (!isEditable) return
      e.preventDefault()
      e.stopPropagation()
      setIsResizing(true)

      const startX = e.clientX
      const startWidth = imgRef.current?.offsetWidth || 400
      const maxWidth = containerRef.current?.parentElement?.offsetWidth || 800

      const onMouseMove = (moveEvent: MouseEvent) => {
        const diff = direction === 'right'
          ? moveEvent.clientX - startX
          : startX - moveEvent.clientX
        const newWidth = Math.max(100, Math.min(startWidth + diff, maxWidth))
        setCurrentWidth(newWidth)
        widthRef.current = newWidth
      }

      const onMouseUp = () => {
        setIsResizing(false)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        updateAttributes({ width: widthRef.current })
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [isEditable, updateAttributes]
  )

  const handleDownload = async () => {
    try {
      const response = await fetch(src)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = alt || title || 'image'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      window.open(src, '_blank')
    }
  }

  const alignClass =
    alignment === 'left' ? 'ri-align-left' :
    alignment === 'right' ? 'ri-align-right' :
    'ri-align-center'

  const imgStyle: React.CSSProperties = {
    width: currentWidth ? `${currentWidth}px` : width ? `${width}px` : undefined,
    maxWidth: '100%',
  }

  const showDot = isEditable && (isHovered || selected || menuOpen) && !isResizing

  return (
    <>
      <NodeViewWrapper
        className={`resizable-image-wrapper ${alignClass} ${selected ? 'ri-selected' : ''} ${isResizing ? 'ri-resizing' : ''}`}
        ref={containerRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { if (!isResizing && !menuOpen) setIsHovered(false) }}
      >
        <div className="ri-image-container">
          {/* Dot menu — top right */}
          {showDot && (
            <div className="ri-dot-menu" contentEditable={false}>
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button className="ri-dot-btn" title="Image options">
                    <EllipsisVertical size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => updateAttributes({ alignment: 'left' })}>
                    <AlignLeft className="mr-2 h-4 w-4" /> Align left
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateAttributes({ alignment: 'center' })}>
                    <AlignCenter className="mr-2 h-4 w-4" /> Align center
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateAttributes({ alignment: 'right' })}>
                    <AlignRight className="mr-2 h-4 w-4" /> Align right
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowLightbox(true)}>
                    <Expand className="mr-2 h-4 w-4" /> View full size
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" /> Download
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={deleteNode} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Left resize handle */}
          {isEditable && (isHovered || selected || isResizing) && (
            <div
              className="ri-resize-handle ri-resize-left"
              onMouseDown={(e) => handleResizeStart(e, 'left')}
            >
              <div className="ri-resize-bar" />
            </div>
          )}

          <img
            ref={imgRef}
            src={src}
            alt={alt || ''}
            title={title || ''}
            style={imgStyle}
            className="ri-image"
            draggable={false}
            onDoubleClick={() => setShowLightbox(true)}
          />

          {isResizing && currentWidth && (
            <div className="ri-width-indicator">{currentWidth}px</div>
          )}

          {/* Right resize handle */}
          {isEditable && (isHovered || selected || isResizing) && (
            <div
              className="ri-resize-handle ri-resize-right"
              onMouseDown={(e) => handleResizeStart(e, 'right')}
            >
              <div className="ri-resize-bar" />
            </div>
          )}
        </div>
      </NodeViewWrapper>

      {showLightbox && (
        <div className="ri-lightbox" onClick={() => setShowLightbox(false)}>
          <button
            className="ri-lightbox-close"
            onClick={(e) => { e.stopPropagation(); setShowLightbox(false) }}
          >
            <X size={24} />
          </button>
          <img
            src={src}
            alt={alt || ''}
            className="ri-lightbox-image"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
