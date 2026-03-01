import * as React from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Expand,
  Trash2,
  Download,
  X,
} from 'lucide-react'
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

  // Close lightbox on Escape
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
      // Fallback: open in new tab if fetch fails (CORS)
      window.open(src, '_blank')
    }
  }

  const handleAlignment = (align: string) => {
    updateAttributes({ alignment: align })
  }

  const alignClass =
    alignment === 'left' ? 'ri-align-left' :
    alignment === 'right' ? 'ri-align-right' :
    'ri-align-center'

  const imgStyle: React.CSSProperties = {
    width: currentWidth ? `${currentWidth}px` : width ? `${width}px` : undefined,
    maxWidth: '100%',
  }

  return (
    <>
      <NodeViewWrapper
        className={`resizable-image-wrapper ${alignClass} ${selected ? 'ri-selected' : ''} ${isResizing ? 'ri-resizing' : ''}`}
        ref={containerRef}
        data-drag-handle=""
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { if (!isResizing) setIsHovered(false) }}
      >
        {/* Hover toolbar */}
        {isEditable && (isHovered || selected) && !isResizing && (
          <div className="ri-toolbar" contentEditable={false}>
            <button
              className={`ri-toolbar-btn ${alignment === 'left' ? 'ri-active' : ''}`}
              onClick={() => handleAlignment('left')}
              title="Align left"
            >
              <AlignLeft size={14} />
            </button>
            <button
              className={`ri-toolbar-btn ${alignment === 'center' ? 'ri-active' : ''}`}
              onClick={() => handleAlignment('center')}
              title="Align center"
            >
              <AlignCenter size={14} />
            </button>
            <button
              className={`ri-toolbar-btn ${alignment === 'right' ? 'ri-active' : ''}`}
              onClick={() => handleAlignment('right')}
              title="Align right"
            >
              <AlignRight size={14} />
            </button>
            <div className="ri-toolbar-divider" />
            <button
              className="ri-toolbar-btn"
              onClick={() => setShowLightbox(true)}
              title="View full size"
            >
              <Expand size={14} />
            </button>
            <button className="ri-toolbar-btn" onClick={handleDownload} title="Download">
              <Download size={14} />
            </button>
            <button className="ri-toolbar-btn ri-toolbar-btn-danger" onClick={deleteNode} title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        )}

        <div className="ri-image-container">
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

          {/* Width indicator while resizing */}
          {isResizing && currentWidth && (
            <div className="ri-width-indicator">
              {currentWidth}px
            </div>
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

      {/* Lightbox modal */}
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
