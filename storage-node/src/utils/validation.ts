import path from 'path';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitizedPath?: string;
}

/**
 * Validates a chunk ID for path traversal attacks, invalid characters, and empty values.
 * Returns a ValidationResult with the resolved safe filepath if valid.
 */
export function validateAndResolveChunkPath(chunkId: string, dataDir: string): ValidationResult {
  if (!chunkId || typeof chunkId !== 'string') {
    return { valid: false, error: 'Chunk ID must be a non-empty string.' };
  }

  const trimmedId = chunkId.trim();
  if (trimmedId.length === 0) {
    return { valid: false, error: 'Chunk ID cannot be empty or whitespace.' };
  }

  if (trimmedId.length > 255) {
    return { valid: false, error: 'Chunk ID exceeds maximum length of 255 characters.' };
  }

  // Prevent null bytes or illegal characters
  if (trimmedId.includes('\0') || trimmedId.includes('%00')) {
    return { valid: false, error: 'Chunk ID contains illegal characters.' };
  }

  // Enforce alphanumeric, hyphen, underscore, and dot (if dot doesn't form relative path)
  const safeIdRegex = /^[a-zA-Z0-9_\-]+$/;
  if (!safeIdRegex.test(trimmedId)) {
    return { valid: false, error: 'Chunk ID must contain only letters, numbers, hyphens (-), and underscores (_).' };
  }

  const resolvedDataDir = path.resolve(dataDir);
  const targetPath = path.resolve(resolvedDataDir, trimmedId);

  // Strictly enforce path containment within dataDir
  const relativePath = path.relative(resolvedDataDir, targetPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || targetPath === resolvedDataDir) {
    return { valid: false, error: 'Path traversal attempt detected.' };
  }

  if (!targetPath.startsWith(resolvedDataDir + path.sep)) {
    return { valid: false, error: 'Path traversal attempt detected.' };
  }

  return { valid: true, sanitizedPath: targetPath };
}
