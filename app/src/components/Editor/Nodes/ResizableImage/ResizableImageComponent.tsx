import * as React from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  Trash2,
  Download,
  GripVertical,
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
  const [currentWidth, setCurrentWidth] = React.useState<number | null>(
    width ? parseInt(width, 10) : null
  )
  const containerRef = React.useRef<HTMLDivElement>(null)
  const imgRef = React.useRef<HTMLImageElement>(null)

  const isEditable = editor.isEditable

  // Resize handler
  const handleResizeStart = React.useCallback(
    (e: React.MouseEvent, direction: 'left' | 'right') => {
      if (!isEditable) return
      e.preventDefault()
      e.stopPropagation()
      setIsResizing(true)

      const startX = e.clientX
      const startWidth = imgRef.current?.offsetWidth || 400

      const onMouseMove = (moveEvent: MouseEvent) => {
        const diff = direction === 'right'
          ? moveEvent.clientX - startX
          : startX - moveEvent.clientX
        const newWidth = Math.max(100, Math.min(startWidth + diff, containerRef.current?.parentElement?.offsetWidth || 800))
        setCurrentWidth(newWidth)
      }

      const onMouseUp = () => {
        setIsResizing(false)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        if (currentWidth) {
          updateAttributes({ width: currentWidth })
        }
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [isEditable, currentWidth, updateAttributes]
  )

  // Use a ref-based approach for resize to avoid stale closure
  const widthRef = React.useRef(currentWidth)
  React.useEffect(() => {
    widthRef.current = currentWidth
  }, [currentWidth])

  const handleResizeStartStable = React.useCallback(
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

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = src
    a.download = alt || 'image'
    a.click()
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
    <NodeViewWrapper
      className={`resizable-image-wrapper ${alignClass} ${selected ? 'ri-selected' : ''} ${isResizing ? 'ri-resizing' : ''}`}
      ref={containerRef}
      data-drag-handle=""
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
            onClick={() => {
              setCurrentWidth(null)
              updateAttributes({ width: null })
            }}
            title="Full width"
          >
            <Maximize2 size={14} />
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
            onMouseDown={(e) => handleResizeStartStable(e, 'left')}
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
        />

        {/* Right resize handle */}
        {isEditable && (isHovered || selected || isResizing) && (
          <div
            className="ri-resize-handle ri-resize-right"
            onMouseDown={(e) => handleResizeStartStable(e, 'right')}
          >
            <div className="ri-resize-bar" />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}
