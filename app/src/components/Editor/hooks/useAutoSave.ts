import { Editor } from '@tiptap/core'
import { useEffect, useRef, useState, useCallback } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'validation-error' | 'conflict'

const MAX_CONTENT_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_RETRIES = 5
const MAX_BACKOFF = 30000 // 30s

function getLocalStorageKey(docId: string) {
  return `ondoki:autosave:${docId}`
}

export interface LocalRecovery {
  content: unknown
  timestamp: number
}

function saveToLocalStorage(docId: string, content: unknown) {
  try {
    localStorage.setItem(
      getLocalStorageKey(docId),
      JSON.stringify({ content, timestamp: Date.now() } satisfies LocalRecovery)
    )
  } catch {
    // localStorage full or unavailable
  }
}

function loadFromLocalStorage(docId: string): LocalRecovery | null {
  try {
    const raw = localStorage.getItem(getLocalStorageKey(docId))
    if (!raw) return null
    return JSON.parse(raw) as LocalRecovery
  } catch {
    return null
  }
}

function clearLocalStorage(docId: string) {
  try {
    localStorage.removeItem(getLocalStorageKey(docId))
  } catch {
    // ignore
  }
}

function validateContent(json: unknown): string | null {
  try {
    const serialized = JSON.stringify(json)
    if (serialized.length > MAX_CONTENT_SIZE) {
      return `Content too large (${(serialized.length / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.`
    }
    JSON.parse(serialized)
    return null
  } catch {
    return 'Content is not valid JSON.'
  }
}

export interface UseAutoSaveOptions {
  docId: string
  onConflict?: () => void
}

export function useAutoSave(
  editor: Editor | null,
  onSave: (json: unknown) => Promise<any>,
  delay = 3000,
  dependencies: any[] = [],
  options?: UseAutoSaveOptions
) {
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const optionsRef = useRef(options)
  optionsRef.current = options

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastSavedContentRef = useRef<string>('')
  const retryCountRef = useRef(0)
  const backoffRef = useRef(1000)

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hasLocalRecovery, setHasLocalRecovery] = useState(false)
  const [localRecovery, setLocalRecovery] = useState<LocalRecovery | null>(null)

  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Check for local recovery on mount
  useEffect(() => {
    if (!options?.docId) return
    const recovery = loadFromLocalStorage(options.docId)
    if (recovery) {
      setLocalRecovery(recovery)
      setHasLocalRecovery(true)
    }
  }, [options?.docId])

  const restoreFromLocal = useCallback(() => {
    if (!editor || !localRecovery || !options?.docId) return
    editor.commands.setContent(localRecovery.content as any, { emitUpdate: false })
    setHasLocalRecovery(false)
    setLocalRecovery(null)
    clearLocalStorage(options.docId)
  }, [editor, localRecovery, options?.docId])

  const dismissRecovery = useCallback(() => {
    if (options?.docId) clearLocalStorage(options.docId)
    setHasLocalRecovery(false)
    setLocalRecovery(null)
  }, [options?.docId])

  const performSave = useCallback(
    async (json: unknown) => {
      const validationError = validateContent(json)
      if (validationError) {
        setSaveStatus('validation-error')
        setErrorMessage(validationError)
        return
      }

      setSaveStatus('saving')
      setErrorMessage(null)

      try {
        await onSaveRef.current(json)
        setSaveStatus('saved')
        retryCountRef.current = 0
        backoffRef.current = 1000

        if (optionsRef.current?.docId) {
          clearLocalStorage(optionsRef.current.docId)
        }

        clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
      } catch (err: any) {
        const status = err?.response?.status ?? err?.status
        if (status === 409) {
          setSaveStatus('conflict')
          setErrorMessage('This document was modified elsewhere. Reload to get the latest version.')
          optionsRef.current?.onConflict?.()
          return
        }

        if (optionsRef.current?.docId) {
          saveToLocalStorage(optionsRef.current.docId, json)
        }

        retryCountRef.current++
        if (retryCountRef.current >= MAX_RETRIES) {
          setSaveStatus('error')
          setErrorMessage('Failed to save after multiple attempts. Your changes are backed up locally.')
          return
        }

        const retryDelay = Math.min(backoffRef.current, MAX_BACKOFF)
        backoffRef.current = backoffRef.current * 2
        setSaveStatus('error')
        setErrorMessage(`Save failed. Retrying in ${Math.round(retryDelay / 1000)}s...`)

        timeoutRef.current = setTimeout(() => {
          performSave(json)
        }, retryDelay)
      }
    },
    []
  )

  // Register editor listeners
  useEffect(() => {
    if (!editor) return

    const handleChange = () => {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        const { from, to } = editor.state.selection
        const currentContent = JSON.stringify(editor.getJSON())

        if (currentContent !== lastSavedContentRef.current) {
          lastSavedContentRef.current = currentContent
          performSave(editor.getJSON())

          requestAnimationFrame(() => {
            if (editor && !editor.isDestroyed) {
              editor.commands.setTextSelection({ from, to })
            }
          })
        }
      }, delay)
    }

    editor.on('update', handleChange)
    lastSavedContentRef.current = JSON.stringify(editor.getJSON())

    return () => {
      clearTimeout(timeoutRef.current)
      clearTimeout(savedTimerRef.current)
      editor.off('update', handleChange)
    }
  }, [editor, delay, performSave])

  // Save on dependency changes (e.g. title)
  useEffect(() => {
    if (!editor || dependencies.length === 0) return

    const { from, to } = editor.state.selection
    const currentContent = JSON.stringify(editor.getJSON())

    if (currentContent !== lastSavedContentRef.current || dependencies.length > 0) {
      lastSavedContentRef.current = currentContent
      performSave(editor.getJSON())

      requestAnimationFrame(() => {
        if (editor && !editor.isDestroyed) {
          editor.commands.setTextSelection({ from, to })
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  return {
    saveStatus,
    errorMessage,
    hasLocalRecovery,
    localRecovery,
    restoreFromLocal,
    dismissRecovery,
  }
}
