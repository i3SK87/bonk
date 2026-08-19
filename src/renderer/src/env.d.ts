/// <reference types="vite/client" />
import type { BonkApi } from '../../preload'

declare global {
  interface Window {
    bonk: BonkApi
  }
}

export {}
