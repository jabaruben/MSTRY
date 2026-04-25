import { app, dialog } from 'electron'
import { exec } from 'node:child_process'
import { access, readlink } from 'node:fs/promises'
import path from 'node:path'
import { homedir } from 'node:os'

const isMac = process.platform === 'darwin'
const isLinux = process.platform === 'linux'
const isWindows = process.platform === 'win32'

const getSymlinkPath = (): string => {
  if (isMac) {
    return '/usr/local/bin/mstry'
  }
  if (isLinux) {
    return path.join(homedir(), '.local', 'bin', 'mstry')
  }
  return path.join(homedir(), 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'mstry.cmd')
}

const getCliScriptPath = (): string => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'cli', 'mstry.sh')
  }
  return path.join(__dirname, '../../resources/cli/mstry.sh')
}

export const isCliInstalled = async (): Promise<boolean> => {
  const symlinkPath = getSymlinkPath()
  try {
    await access(symlinkPath)
    const target = await readlink(symlinkPath)
    return target === getCliScriptPath()
  } catch {
    return false
  }
}

const installOnMac = async (scriptPath: string, symlinkPath: string): Promise<void> => {
  return new Promise((resolve) => {
    const command = `ln -sf "${scriptPath}" "${symlinkPath}"`
    exec(`osascript -e 'do shell script "${command.replace(/"/g, '\\"')}" with administrator privileges'`, (error) => {
      if (error) {
        dialog.showMessageBox({
          type: 'error',
          title: 'Error',
          message: 'No se pudo instalar el comando.',
          detail: error.message
        })
      } else {
        dialog.showMessageBox({
          type: 'info',
          title: 'Comando instalado',
          message: 'El comando "mstry" se ha instalado correctamente.',
          detail: 'Ahora puedes usar "mstry ." desde tu terminal.'
        })
      }
      resolve()
    })
  })
}

const installOnLinux = async (scriptPath: string, symlinkPath: string): Promise<void> => {
  return new Promise((resolve) => {
    const fs = require('node:fs')
    const binDir = path.dirname(symlinkPath)
    try {
      fs.mkdirSync(binDir, { recursive: true })
      fs.symlinkSync(scriptPath, symlinkPath)
      fs.chmodSync(symlinkPath, 0o755)
      dialog.showMessageBox({
        type: 'info',
        title: 'Comando instalado',
        message: 'El comando "mstry" se ha instalado correctamente.',
        detail: `Ahora puedes usar "mstry ." desde tu terminal.\n\nAsegurate de que ${binDir} este en tu PATH.`
      })
    } catch (error) {
      dialog.showMessageBox({
        type: 'error',
        title: 'Error',
        message: 'No se pudo instalar el comando.',
        detail: error instanceof Error ? error.message : 'Error desconocido'
      })
    }
    resolve()
  })
}

export const installCli = async (): Promise<void> => {
  const scriptPath = getCliScriptPath()
  const symlinkPath = getSymlinkPath()

  try {
    await access(scriptPath)
  } catch {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Error',
      message: 'No se encontro el script CLI.',
      detail: `Se esperaba en: ${scriptPath}`
    })
    return
  }

  if (isMac) {
    await installOnMac(scriptPath, symlinkPath)
  } else if (isLinux) {
    await installOnLinux(scriptPath, symlinkPath)
  } else {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Windows',
      message: 'En Windows, agrega la carpeta de MSTRY al PATH manualmente.',
      detail: 'O usa "npm run dev" para desarrollo.'
    })
  }
}

export const uninstallCli = async (): Promise<void> => {
  const symlinkPath = getSymlinkPath()

  if (isMac) {
    return new Promise((resolve) => {
      const command = `rm -f "${symlinkPath}"`
      exec(`osascript -e 'do shell script "${command.replace(/g, '\\"')}" with administrator privileges'`, (error) => {
        if (error) {
          dialog.showMessageBox({
            type: 'error',
            title: 'Error',
            message: 'No se pudo desinstalar el comando.',
            detail: error.message
          })
        } else {
          dialog.showMessageBox({
            type: 'info',
            title: 'Comando desinstalado',
            message: 'El comando "mstry" se ha eliminado del PATH.'
          })
        }
        resolve()
      })
    })
  }

  if (isLinux || isWindows) {
    const fs = require('node:fs')
    try {
      if (isWindows) {
        require('node:fs').unlinkSync(symlinkPath)
      } else {
        fs.unlinkSync(symlinkPath)
      }
      dialog.showMessageBox({
        type: 'info',
        title: 'Comando desinstalado',
        message: 'El comando "mstry" se ha eliminado del PATH.'
      })
    } catch {
      dialog.showMessageBox({
        type: 'info',
        title: 'Comando desinstalado',
        message: 'El comando "mstry" no estaba instalado.'
      })
    }
  }
}