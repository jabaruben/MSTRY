import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface PersistedTab {
  id: string
  workspacePath: string
  tmuxSessionName: string
}

export interface PersistedTabState {
  tabs: PersistedTab[]
  activeTabId: Record<string, string>
}

const EMPTY_STATE: PersistedTabState = { tabs: [], activeTabId: {} }

const statePath = () => path.join(app.getPath('userData'), 'tabs.json')

export const loadTabState = async (): Promise<PersistedTabState> => {
  try {
    const raw = await readFile(statePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedTabState>

    return {
      tabs: Array.isArray(parsed.tabs) ? parsed.tabs : [],
      activeTabId:
        parsed.activeTabId && typeof parsed.activeTabId === 'object' ? parsed.activeTabId : {}
    }
  } catch {
    return { ...EMPTY_STATE }
  }
}

export const saveTabState = async (state: PersistedTabState): Promise<void> => {
  await mkdir(path.dirname(statePath()), { recursive: true })
  await writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8')
}
