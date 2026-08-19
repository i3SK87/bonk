/// <reference types="vite/client" />
import type { MoneyFlowApi } from '../../preload'

declare global {
  interface Window {
    moneyflow: MoneyFlowApi
  }
}

export {}
