import type { ElectronApi } from '../../../shared/contracts'

export const getElectronBridge = (): ElectronApi => {
  if (!window.mstry) {
    throw new Error('El puente de Electron no esta disponible. Reabre la app en modo Electron.')
  }

  return window.mstry
}
