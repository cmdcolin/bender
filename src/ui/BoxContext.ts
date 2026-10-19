import { createContext } from 'react'

export const BoxStage = createContext<{
  stage: string
  seconds: number
} | null>(null)

export const BoxTitle = createContext<string | null>(null)
