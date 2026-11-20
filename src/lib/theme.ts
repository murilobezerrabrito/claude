// Tema claro, escuro ou o do sistema (SPEC, "Identidade": temas claro e escuro no console). A escolha fica no
// navegador de quem usa; sem acesso ao armazenamento, vale o tema do sistema.

import { useEffect, useState } from 'react'

export type ThemeChoice = 'claro' | 'escuro' | 'sistema'

const KEY = 'aware-tema'

function readChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY)
    return v === 'claro' || v === 'escuro' ? v : 'sistema'
  } catch {
    return 'sistema'
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'escuro' || (choice === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice)
  useEffect(() => {
    apply(choice)
    try {
      if (choice === 'sistema') window.localStorage.removeItem(KEY)
      else window.localStorage.setItem(KEY, choice)
    } catch {
      // Sem armazenamento: o tema vale só nesta página.
    }
    if (choice !== 'sistema') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('sistema')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [choice])
  return [choice, setChoice]
}
