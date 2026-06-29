import { execFile } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { getSetting, setSetting } from '../db/project-repository';
import { APP_NAME, COLLECTIONS_FILENAME, LEGACY_COLLECTIONS_FILENAMES } from '../branding';

const execFileAsync = promisify(execFile);

export type GitFileChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked';

export interface GitFileChange {
  path: string;
  status: GitFileChangeStatus;
  staged: boolean;
}

export interface GitCommitEntry {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  graph?: string;
  refs?: string;
}

export interface GitStatusResult {
  repoPath: string | null;
  isRepo: boolean;
  branch: string | null;
  remoteUrl: string | null;
  hasChanges: boolean;
  changedFiles: string[];
  stagedFiles: GitFileChange[];
  unstagedFiles: GitFileChange[];
  commits: GitCommitEntry[];
  ahead: number;
  behind: number;
}

let storageRoot = '';
let settingsStore: { get: (key: string) => string | null; set: (key: string, value: string) => void } | null = null;

export function configureGitSettings(store: {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
}): void {
  settingsStore = store;
}

function readSetting(key: string): string | null {
  if (settingsStore) return settingsStore.get(key);
  return getSetting(key);
}

function writeSetting(key: string, value: string): void {
  if (settingsStore) {
    settingsStore.set(key, value);
    return;
  }
  setSetting(key, value);
}

export function setGitStorageRoot(root: string): void {
  storageRoot = root;
}

function repoPathKey(projectId: string): string {
  return `gitRepoPath:${projectId}`;
}

export function getGitRepoPath(projectId: string): string | null {
  return readSetting(repoPathKey(projectId));
}

export function setGitRepoPath(projectId: string, repoPath: string): void {
  writeSetting(repoPathKey(projectId), repoPath);
}

export function defaultGitRepoPath(projectId: string): string {
  return join(storageRoot, 'git-repos', projectId);
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout.trim();
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    const message = (e.stderr ?? e.message ?? 'Git command failed').trim();
    throw new Error(message);
  }
}

function isGitRepo(repoPath: string): boolean {
  return existsSync(join(repoPath, '.git'));
}

function mapPorcelainStatus(code: string): GitFileChangeStatus | null {
  if (code === 'M') return 'modified';
  if (code === 'A') return 'added';
  if (code === 'D') return 'deleted';
  if (code === 'R') return 'renamed';
  if (code === 'C') return 'copied';
  if (code === '?') return 'untracked';
  return null;
}

function parsePorcelainStatus(porcelain: string): { stagedFiles: GitFileChange[]; unstagedFiles: GitFileChange[] } {
  const stagedFiles: GitFileChange[] = [];
  const unstagedFiles: GitFileChange[] = [];
  const stagedPaths = new Set<string>();
  const unstagedPaths = new Set<string>();

  for (const line of porcelain.split('\n').filter(Boolean)) {
    const x = line[0] ?? ' ';
    const y = line[1] ?? ' ';
    let path = line.slice(3).trim();
    if (path.includes(' -> ')) {
      path = path.split(' -> ').pop()?.trim() ?? path;
    }

    if (x === '?' && y === '?') {
      if (!unstagedPaths.has(path)) {
        unstagedFiles.push({ path, status: 'untracked', staged: false });
        unstagedPaths.add(path);
      }
      continue;
    }

    if (x !== ' ' && x !== '?') {
      const status = mapPorcelainStatus(x) ?? 'modified';
      if (!stagedPaths.has(path)) {
        stagedFiles.push({ path, status, staged: true });
        stagedPaths.add(path);
      }
    }

    if (y !== ' ' && y !== '?') {
      const status = mapPorcelainStatus(y) ?? 'modified';
      if (!unstagedPaths.has(path)) {
        unstagedFiles.push({ path, status, staged: false });
        unstagedPaths.add(path);
      }
    }
  }

  return { stagedFiles, unstagedFiles };
}

function parseGraphLogLine(line: string): GitCommitEntry | null {
  const parts = line.split('\x1f');
  if (parts.length < 5) return null;

  const head = parts[0] ?? '';
  const graphMatch = head.match(/^([*|\\\/ ]*)\s*([a-f0-9]{40})$/i);
  const hash = graphMatch?.[2] ?? head;
  const graph = (graphMatch?.[1] ?? '').trimEnd();

  const shortHash = parts[1] ?? '';
  const author = parts[2] ?? '';
  const date = parts[3] ?? '';
  const message = parts[4] ?? '';
  const refs = parts[5]?.trim() ?? '';

  if (!hash) return null;

  return { hash, shortHash, author, date, message, graph, refs };
}

async function getGitLog(repoPath: string, limit = 50): Promise<GitCommitEntry[]> {
  const output = await runGit(repoPath, [
    'log',
    `-n`,
    String(limit),
    '--graph',
    '--decorate=short',
    '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%d',
    '--date=short',
  ]).catch(() => '');

  if (!output) return [];

  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => parseGraphLogLine(line))
    .filter((entry): entry is GitCommitEntry => entry !== null);
}

function requireRepoPath(projectId: string): string {
  const repoPath = getGitRepoPath(projectId);
  if (!repoPath || !isGitRepo(repoPath)) {
    throw new Error('Initialize a Git repository first');
  }
  return repoPath;
}

export async function getGitStatus(projectId: string): Promise<GitStatusResult> {
  const repoPath = getGitRepoPath(projectId) ?? defaultGitRepoPath(projectId);
  const empty: GitStatusResult = {
    repoPath: getGitRepoPath(projectId),
    isRepo: false,
    branch: null,
    remoteUrl: null,
    hasChanges: false,
    changedFiles: [],
    stagedFiles: [],
    unstagedFiles: [],
    commits: [],
    ahead: 0,
    behind: 0,
  };

  if (!existsSync(repoPath) || !isGitRepo(repoPath)) {
    return empty;
  }

  const branch = await runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => null);
  let remoteUrl: string | null = null;
  try {
    remoteUrl = await runGit(repoPath, ['config', '--get', 'remote.origin.url']);
  } catch {
    remoteUrl = null;
  }

  const porcelain = await runGit(repoPath, ['status', '--porcelain']).catch(() => '');
  const { stagedFiles, unstagedFiles } = parsePorcelainStatus(porcelain);
  const changedFiles = [...new Set([...stagedFiles.map((f) => f.path), ...unstagedFiles.map((f) => f.path)])];
  const commits = await getGitLog(repoPath);

  let ahead = 0;
  let behind = 0;
  try {
    const counts = await runGit(repoPath, ['rev-list', '--left-right', '--count', '@{u}...HEAD']);
    const [behindStr, aheadStr] = counts.split(/\s+/);
    behind = parseInt(behindStr, 10) || 0;
    ahead = parseInt(aheadStr, 10) || 0;
  } catch {
    /* no upstream */
  }

  return {
    repoPath,
    isRepo: true,
    branch,
    remoteUrl: remoteUrl || null,
    hasChanges: changedFiles.length > 0,
    changedFiles,
    stagedFiles,
    unstagedFiles,
    commits,
    ahead,
    behind,
  };
}

export async function initGitRepo(projectId: string, repoPath?: string): Promise<GitStatusResult> {
  const resolved = repoPath ?? defaultGitRepoPath(projectId);
  mkdirSync(resolved, { recursive: true });

  if (!isGitRepo(resolved)) {
    await runGit(resolved, ['init']);
    await runGit(resolved, ['branch', '-M', 'main']).catch(() => undefined);
  }

  writeFileSync(
    join(resolved, '.gitignore'),
    `# ${APP_NAME}\n.DS_Store\nThumbs.db\n*.tmp\n`,
    'utf-8'
  );

  setGitRepoPath(projectId, resolved);
  return getGitStatus(projectId);
}

export async function setGitRemote(projectId: string, remoteUrl: string): Promise<GitStatusResult> {
  const repoPath = getGitRepoPath(projectId);
  if (!repoPath || !isGitRepo(repoPath)) {
    throw new Error('Initialize a Git repository first');
  }

  const url = remoteUrl.trim();
  if (!url) throw new Error('Remote URL is required');

  try {
    await runGit(repoPath, ['remote', 'get-url', 'origin']);
    await runGit(repoPath, ['remote', 'set-url', 'origin', url]);
  } catch {
    await runGit(repoPath, ['remote', 'add', 'origin', url]);
  }

  return getGitStatus(projectId);
}

export async function gitCommit(
  projectId: string,
  message: string,
  amend = false
): Promise<GitStatusResult> {
  const repoPath = requireRepoPath(projectId);

  const msg = message.trim();
  if (!msg) throw new Error('Commit message is required');

  const statusBefore = await getGitStatus(projectId);
  if (!amend && statusBefore.stagedFiles.length === 0) {
    throw new Error('No staged changes to commit. Stage files first or use Sync to Git.');
  }

  if (amend) {
    await runGit(repoPath, ['commit', '--amend', '-m', msg]);
  } else {
    await runGit(repoPath, ['commit', '-m', msg]);
  }
  return getGitStatus(projectId);
}

export async function gitStage(projectId: string, paths: string[]): Promise<GitStatusResult> {
  const repoPath = requireRepoPath(projectId);
  const files = paths.map((p) => p.trim()).filter(Boolean);
  if (files.length === 0) throw new Error('No files to stage');

  await runGit(repoPath, ['add', '--', ...files]);
  return getGitStatus(projectId);
}

export async function gitUnstage(projectId: string, paths: string[]): Promise<GitStatusResult> {
  const repoPath = requireRepoPath(projectId);
  const files = paths.map((p) => p.trim()).filter(Boolean);
  if (files.length === 0) throw new Error('No files to unstage');

  await runGit(repoPath, ['restore', '--staged', '--', ...files]).catch(async () => {
    await runGit(repoPath, ['reset', 'HEAD', '--', ...files]);
  });
  return getGitStatus(projectId);
}

export async function gitStageAll(projectId: string): Promise<GitStatusResult> {
  const repoPath = requireRepoPath(projectId);
  await runGit(repoPath, ['add', '-A']);
  return getGitStatus(projectId);
}

export async function gitUnstageAll(projectId: string): Promise<GitStatusResult> {
  const repoPath = requireRepoPath(projectId);
  await runGit(repoPath, ['reset', 'HEAD']).catch(() => undefined);
  return getGitStatus(projectId);
}

export async function getGitDiff(projectId: string, filePath: string, staged = false): Promise<string> {
  const repoPath = requireRepoPath(projectId);
  const path = filePath.trim();
  if (!path) throw new Error('File path is required');

  const status = await getGitStatus(projectId);
  const isUntracked = status.unstagedFiles.some((f) => f.path === path && f.status === 'untracked');

  if (isUntracked && !staged) {
    const fullPath = join(repoPath, path);
    if (!existsSync(fullPath)) return '';
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const header = `--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n`;
    return header + lines.map((line) => `+${line}`).join('\n');
  }

  const args = staged ? ['diff', '--cached', '--', path] : ['diff', '--', path];
  return runGit(repoPath, args).catch(() => '');
}

export async function gitPush(projectId: string): Promise<GitStatusResult> {
  const repoPath = getGitRepoPath(projectId);
  if (!repoPath || !isGitRepo(repoPath)) {
    throw new Error('Initialize a Git repository first');
  }

  const branch = await runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  try {
    await runGit(repoPath, ['push', '-u', 'origin', branch]);
  } catch {
    await runGit(repoPath, ['push', 'origin', branch]);
  }
  return getGitStatus(projectId);
}

export async function gitPull(projectId: string): Promise<GitStatusResult> {
  const repoPath = getGitRepoPath(projectId);
  if (!repoPath || !isGitRepo(repoPath)) {
    throw new Error('Initialize a Git repository first');
  }

  const branch = await runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  try {
    await runGit(repoPath, ['pull', 'origin', branch]);
  } catch {
    await runGit(repoPath, ['pull']);
  }
  return getGitStatus(projectId);
}

export async function gitClone(projectId: string, remoteUrl: string, parentPath: string): Promise<GitStatusResult> {
  const url = remoteUrl.trim();
  if (!url) throw new Error('Remote URL is required');

  const repoName = url.replace(/\.git$/, '').split('/').pop() ?? 'httpforge-collections';
  const targetPath = join(parentPath, repoName);

  if (existsSync(targetPath)) {
    throw new Error(`Folder already exists: ${targetPath}. Choose another location or use an existing repo.`);
  }

  await runGit(parentPath, ['clone', url, targetPath]);
  setGitRepoPath(projectId, targetPath);
  return getGitStatus(projectId);
}

export function readRepoCollectionsFile(repoPath: string): string | null {
  for (const name of [COLLECTIONS_FILENAME, ...LEGACY_COLLECTIONS_FILENAMES]) {
    const filePath = join(repoPath, name);
    if (existsSync(filePath)) return readFileSync(filePath, 'utf-8');
  }
  return null;
}
