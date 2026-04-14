import type { ElectronApi } from '../../shared/contracts'

declare global {
  interface Window {
    mstry: ElectronApi
  }
}

export {}
