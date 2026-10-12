import { spawn } from 'node:child_process';

export class ToolError extends Error {}

interface RunOptions {
  /** Arrêt forcé au-delà de cette durée. */
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Lance un outil externe (ffmpeg, ffprobe, heif-dec) sans shell : les chemins de fichiers
 * passent en arguments, jamais interprétés. En cas d'échec, l'erreur reprend la fin de stderr.
 */
export function run(command: string, args: string[], options: RunOptions = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: options.signal,
    });
    const stdout: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-8000);
    });
    const timer = options.timeoutMs
      ? setTimeout(() => child.kill('SIGKILL'), options.timeoutMs)
      : undefined;
    child.on('error', (error) => {
      clearTimeout(timer);
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      reject(new ToolError(missing ? `${command} introuvable` : error.message));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr });
        return;
      }
      const tail = stderr.trim().split('\n').slice(-3).join(' | ');
      reject(
        new ToolError(`${command} : ${signal ? `arrêté (${signal})` : `code ${code}`} ${tail}`),
      );
    });
  });
}

/** L'outil est-il installé ? (tests et démarrage du worker) */
export async function hasTool(command: string, versionFlag = '-version') {
  try {
    await run(command, [versionFlag], { timeoutMs: 10_000 });
    return true;
  } catch (error) {
    // Certains outils répondent à --version avec un code non nul : seul l'absence compte
    return !(error instanceof ToolError && error.message.endsWith('introuvable'));
  }
}
