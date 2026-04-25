import { spawnSync } from 'node:child_process'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'

const isMac = process.platform === 'darwin'
const isLinux = process.platform === 'linux'
const isWindows = process.platform === 'win32'

if (!isWindows) {
  const result = spawnSync('npm', ['rebuild', 'node-pty', '--build-from-source'], {
    stdio: 'inherit',
    shell: isWindows
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const BIN_NAME = 'mstry'
const getScriptPath = () => {
  if (isMac) {
    return `/usr/local/bin/${BIN_NAME}`
  }
  if (isLinux) {
    return path.join(homedir(), '.local', 'bin', BIN_NAME)
  }
  return null
}

const getInstallCommand = () => {
  const scriptPath = process.argv[2]
  if (!scriptPath) {
    console.error('Usage: node postinstall.mjs <path-to-mstry-sh>')
    return null
  }

  if (isMac) {
    return `ln -sf "${scriptPath}" "/usr/local/bin/${BIN_NAME}"`
  }
  if (isLinux) {
    execSync('mkdir -p ~/.local/bin')
    return `ln -sf "${scriptPath}" "${path.join(homedir(), '.local', 'bin', BIN_NAME)}"`
  }
  return null
}

if (process.argv.length > 2) {
  const installCmd = getInstallCommand()
  if (installCmd) {
    try {
      console.log(`Installing ${BIN_NAME} CLI...`)
      execSync(installCmd, { stdio: 'inherit' })
      console.log(`${BIN_NAME} CLI installed successfully!`)
    } catch (error) {
      console.error(`Failed to install ${BIN_NAME} CLI:`, error.message)
    }
  }
}
