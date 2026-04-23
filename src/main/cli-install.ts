import { app, dialog } from 'electron'
import { exec } from 'node:child_process'
import { access, readlink } from 'node:fs/promises'
import path from 'node:path'

const SYMLINK_PATH = '/usr/local/bin/mstry'

const getCliScriptPath = (): string => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'cli', 'mstry.sh')
  }
  return path.join(__dirname, '../../resources/cli/mstry.sh')
}

export const isCliInstalled = async (): Promise<boolean> => {
  try {
    await access(SYMLINK_PATH)
    const target = await readlink(SYMLINK_PATH)
    return target === getCliScriptPath()
  } catch {
    return false
  }
}

export const installCli = async (): Promise<void> => {
  const scriptPath = getCliScriptPath()

  try {
    await access(scriptPath)
  } catch {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Error',
      message: 'CLI script not found.',
      detail: `Expected at: ${scriptPath}`
    })
    return
  }

  const command = `ln -sf "${scriptPath}" "${SYMLINK_PATH}"`

  return new Promise((resolve) => {
    exec(`osascript -e 'do shell script "${command.replace(/"/g, '\\"')}" with administrator privileges'`, (error) => {
      if (error) {
        dialog.showMessageBox({
          type: 'error',
          title: 'Error',
          message: 'Could not install the command.',
          detail: error.message
        })
      } else {
        dialog.showMessageBox({
          type: 'info',
          title: 'Command installed',
          message: 'The "mstry" command was installed successfully.',
          detail: 'You can now run "mstry ." from your terminal.'
        })
      }
      resolve()
    })
  })
}

export const uninstallCli = async (): Promise<void> => {
  const command = `rm -f "${SYMLINK_PATH}"`

  return new Promise((resolve) => {
    exec(`osascript -e 'do shell script "${command.replace(/"/g, '\\"')}" with administrator privileges'`, (error) => {
      if (error) {
        dialog.showMessageBox({
          type: 'error',
          title: 'Error',
          message: 'Could not uninstall the command.',
          detail: error.message
        })
      } else {
        dialog.showMessageBox({
          type: 'info',
          title: 'Command uninstalled',
          message: 'The "mstry" command was removed from PATH.'
        })
      }
      resolve()
    })
  })
}
