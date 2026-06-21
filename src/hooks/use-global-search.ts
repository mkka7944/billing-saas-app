'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { SearchResultUnit } from '@/types/search'

interface UseGlobalSearchOptions {
  scope?: 'global' | 'assignment'
  minQueryLength?: number
}

export function useGlobalSearch({ scope = 'global', minQueryLength = 2 }: UseGlobalSearchOptions = {}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultUnit[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const abortRef = useRef<AbortController>(undefined)

  const doSearch = useCallback(async (q: string) => {
    if (abortRef.current) abortRef.current.abort()
    if (q.length < minQueryLength) {
      setResults([])
      setShowResults(false)
      return
    }
    setIsSearching(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&scope=${scope}`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('Search failed')
      const json = await res.json()
      if (!controller.signal.aborted) {
        setResults(json.results || [])
        setShowResults(json.results?.length > 0)
      }
    } catch {
      if (!controller.signal.aborted) {
        setResults([])
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false)
      }
    }
  }, [scope, minQueryLength])

  const onChange = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }, [doSearch])

  const clearResults = useCallback(() => {
    setResults([])
    setShowResults(false)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  return { query, setQuery: onChange, results, isSearching, showResults, setShowResults, clearResults }
}
