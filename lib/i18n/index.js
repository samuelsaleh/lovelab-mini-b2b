'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { translations, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './translations'

const I18nContext = createContext(null)

const STORAGE_KEY = 'lovelab-lang'

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANGUAGE)

  // Load saved language on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && translations[saved]) {
        setLangState(saved)
      }
    } catch { /* ignore */ }
  }, [])

  const setLang = useCallback((newLang) => {
    if (translations[newLang]) {
      setLangState(newLang)
      try { localStorage.setItem(STORAGE_KEY, newLang) } catch { /* ignore */ }
    }
  }, [])

  /**
   * Translate a key. Supports simple interpolation with {key} syntax.
   * @param {string} key - Translation key (e.g. 'nav.builder')
   * @param {object} [params] - Interpolation params (e.g. { name: 'doc.pdf' })
   * @returns {string}
   */
  const t = useCallback((key, params) => {
    let text = translations[lang]?.[key] ?? translations[DEFAULT_LANGUAGE]?.[key] ?? key

    if (params) {
      // Use replaceAll to handle multiple occurrences of the same placeholder
      Object.entries(params).forEach(([k, v]) => {
        text = text.replaceAll(`{${k}}`, v)
      })
    }

    return text
  }, [lang])

  return (
    <I18nContext.Provider value={{ lang, setLang, t, languages: SUPPORTED_LANGUAGES }}>
      {children}
    </I18nContext.Provider>
  )
}

/**
 * Hook to access translations and language switching.
 * @returns {{ t: (key: string, params?: object) => string, lang: string, setLang: (lang: string) => void, languages: Array }}
 */
export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Fallback if used outside provider
    return {
      t: (key, params) => {
        let text = translations[DEFAULT_LANGUAGE]?.[key] ?? key
        if (params) {
          Object.entries(params).forEach(([k, v]) => {
            text = text.replaceAll(`{${k}}`, v)
          })
        }
        return text
      },
      lang: DEFAULT_LANGUAGE,
      setLang: () => {},
      languages: SUPPORTED_LANGUAGES,
    }
  }
  return ctx
}
