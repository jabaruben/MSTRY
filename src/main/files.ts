import { execFile } from 'node:child_process'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import type {
  FileEntry,
  GitDiffResult,
  GitFileStatus,
  GitFileStatusEntry,
  ListWorkspaceFilesInput,
  ListDirectoryInput,
  ReadWorkspaceFileInput,
  ReadWorkspaceFileResult,
  WriteWorkspaceFileInput
} from '../shared/contracts'

const execFileAsync = promisify(execFile)

const HIDDEN_ENTRIES = new Set(['.git', 'node_modules', '.DS_Store'])
const MAX_TEXT_FILE_SIZE_BYTES = 2 * 1024 * 1024

const resolveWorkspacePath = (cwd: string, targetPath: string) => {
  const base = path.resolve(cwd)
  const absoluteTarget = path.resolve(targetPath)

  if (absoluteTarget !== base && !absoluteTarget.startsWith(base + path.sep)) {
    throw new Error('Path escapes workspace root.')
  }

  return {
    base,
    absoluteTarget
  }
}

export const listDirectory = async (input: ListDirectoryInput): Promise<FileEntry[]> => {
  const base = path.resolve(input.cwd)
  const rel = path.normalize(input.relativePath || '.')

  if (rel.startsWith('..')) {
    throw new Error('Invalid relative path.')
  }

  const target = path.resolve(base, rel)
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error('Path escapes workspace root.')
  }

  let dirents
  try {
    dirents = await readdir(target, { withFileTypes: true })
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }

  return dirents
    .filter((entry) => !HIDDEN_ENTRIES.has(entry.name))
    .map<FileEntry>((entry) => {
      const entryPath = path.join(target, entry.name)
      return {
        name: entry.name,
        path: entryPath,
        relativePath: path.relative(base, entryPath),
        isDirectory: entry.isDirectory()
      }
    })
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

const ensureReadableTextFile = async (absolutePath: string) => {
  const fileStats = await stat(absolutePath)

  if (!fileStats.isFile()) {
    throw new Error('Only files can be opened.')
  }

  if (fileStats.size > MAX_TEXT_FILE_SIZE_BYTES) {
    throw new Error('The file is too large for the embedded editor.')
  }

  const buffer = await readFile(absolutePath)
  if (buffer.includes(0)) {
    throw new Error('Only text files can be opened.')
  }

  return buffer.toString('utf8')
}

export const readWorkspaceFile = async (
  input: ReadWorkspaceFileInput
): Promise<ReadWorkspaceFileResult> => {
  const { absoluteTarget } = resolveWorkspacePath(input.cwd, input.filePath)
  const content = await ensureReadableTextFile(absoluteTarget)
  return { content }
}

export const writeWorkspaceFile = async (input: WriteWorkspaceFileInput): Promise<void> => {
  const { absoluteTarget } = resolveWorkspacePath(input.cwd, input.filePath)
  const fileStats = await stat(absoluteTarget)

  if (!fileStats.isFile()) {
    throw new Error('Only files can be saved.')
  }

  await writeFile(absoluteTarget, input.content, 'utf8')
}

const runGit = async (repoPath: string, args: string[]) => {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  })
  return stdout
}

const parseStatusCode = (
  x: string,
  y: string
): { status: GitFileStatus; staged: boolean } => {
  if (x === '?' && y === '?') return { status: 'untracked', staged: false }
  if (x === '!' && y === '!') return { status: 'ignored', staged: false }

  const isConflicted =
    x === 'U' ||
    y === 'U' ||
    (x === 'A' && y === 'A') ||
    (x === 'D' && y === 'D')
  if (isConflicted) return { status: 'conflicted', staged: false }

  const staged = x !== ' ' && x !== '?'

  const toStatus = (ch: string): GitFileStatus => {
    switch (ch) {
      case 'A':
        return 'added'
      case 'M':
        return 'modified'
      case 'D':
        return 'deleted'
      case 'R':
      case 'C':
        return 'renamed'
      case 'T':
        return 'typechange'
      default:
        return 'modified'
    }
  }

  if (y !== ' ' && y !== '') return { status: toStatus(y), staged }
  return { status: toStatus(x), staged }
}

interface PorcelainEntry {
  relativePath: string
  status: GitFileStatus
  staged: boolean
}

const parsePorcelain = (output: string): PorcelainEntry[] => {
  const records = output.split('\0')
  const entries: PorcelainEntry[] = []
  let i = 0

  while (i < records.length) {
    const record = records[i]
    if (!record) {
      i += 1
      continue
    }

    const x = record.charAt(0)
    const y = record.charAt(1)
    const relativePath = record.slice(3)
    const { status, staged } = parseStatusCode(x, y)

    // Renames/copies: next record is the old path (discarded).
    if (x === 'R' || x === 'C') {
      i += 2
    } else {
      i += 1
    }

    entries.push({ relativePath, status, staged })
  }

  return entries
}

interface NumstatEntry {
  relativePath: string
  added: number
  deleted: number
}

const parseNumstat = (output: string): NumstatEntry[] => {
  const records = output.split('\0').filter((record) => record.length > 0)
  const results: NumstatEntry[] = []
  let i = 0

  while (i < records.length) {
    const line = records[i]
    const match = line.match(/^(-|\d+)\t(-|\d+)\t(.*)$/)
    if (!match) {
      i += 1
      continue
    }

    const added = match[1] === '-' ? 0 : Number(match[1])
    const deleted = match[2] === '-' ? 0 : Number(match[2])
    const pathStr = match[3]

    if (pathStr === '') {
      // Rename in -z mode: old path, then new path follow.
      const newPath = records[i + 2] ?? ''
      results.push({ relativePath: newPath, added, deleted })
      i += 3
    } else {
      results.push({ relativePath: pathStr, added, deleted })
      i += 1
    }
  }

  return results
}

const countUntrackedLines = async (absolutePath: string) => {
  try {
    const stats = await stat(absolutePath)
    if (!stats.isFile() || stats.size > 2 * 1024 * 1024) {
      return 0
    }
    const content = await readFile(absolutePath, 'utf8')
    if (content === '') return 0
    const newlines = content.match(/\n/g)?.length ?? 0
    return newlines + (content.endsWith('\n') ? 0 : 1)
  } catch {
    return 0
  }
}

export const getGitStatus = async (cwd: string): Promise<GitFileStatusEntry[]> => {
  const base = path.resolve(cwd)

  try {
    await execFileAsync('git', ['-C', base, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8'
    })
  } catch {
    return []
  }

  const [porcelainOut, numstatOut] = await Promise.all([
    runGit(base, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    runGit(base, ['diff', '--numstat', '-z', 'HEAD']).catch(() => '')
  ])

  const porcelain = parsePorcelain(porcelainOut)
  const numstat = new Map(parseNumstat(numstatOut).map((n) => [n.relativePath, n]))

  return Promise.all(
    porcelain.map(async (item) => {
      let added = 0
      let deleted = 0

      const diff = numstat.get(item.relativePath)
      if (diff) {
        added = diff.added
        deleted = diff.deleted
      } else if (item.status === 'untracked') {
        added = await countUntrackedLines(path.join(base, item.relativePath))
      }

      return {
        relativePath: item.relativePath,
        status: item.status,
        staged: item.staged,
        added,
        deleted
      }
    })
  )
}

const isMissingRevisionError = (error: unknown) =>
  error instanceof Error &&
  /exists on disk, but not in|path .* does not exist in|bad revision|unknown revision/i.test(
    error.message
  )

const readGitTextFile = async (cwd: string, filePath: string) => {
  try {
    const output = await runGit(cwd, ['show', `HEAD:${filePath}`])
    if (output.includes('\0')) {
      throw new Error('Binary file diffs cannot be shown.')
    }
    return output
  } catch (error) {
    if (isMissingRevisionError(error)) {
      return ''
    }
    throw error
  }
}

export const getGitDiff = async (cwd: string, filePath: string): Promise<GitDiffResult> => {
  const [statusEntries, originalContent] = await Promise.all([
    getGitStatus(cwd),
    readGitTextFile(cwd, filePath)
  ])

  const statusEntry = statusEntries.find((entry) => entry.relativePath === filePath)
  if (!statusEntry) {
    throw new Error('The file no longer appears as modified.')
  }

  let modifiedContent = ''
  if (statusEntry.status !== 'deleted') {
    const { absoluteTarget } = resolveWorkspacePath(cwd, path.join(cwd, filePath))
    modifiedContent = await ensureReadableTextFile(absoluteTarget)
  }

  return {
    filePath,
    status: statusEntry.status,
    originalContent,
    modifiedContent
  }
}

export const listWorkspaceFiles = async (input: ListWorkspaceFilesInput): Promise<string[]> => {
  const base = path.resolve(input.cwd)

  try {
    const { stdout } = await execFileAsync(
      'rg',
      ['--files', '--hidden', '-g', '!.git', '-g', '!node_modules', '-g', '!.DS_Store'],
      {
        cwd: base,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024
      }
    )

    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}
