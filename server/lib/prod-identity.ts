import { isAbsolute, relative, resolve, sep } from 'node:path';

import { USER_ROLES } from '@shared/schema';
import { z } from 'zod/v4';

import { DEV_SEED_PASSWORDS } from './seed-users';

const prodIdentitySchema = z
  .object({
    username: z.string().min(1),
    password: z.string().min(16),
    role: z.enum(USER_ROLES),
    fundIds: z
      .array(z.number().int().positive())
      .refine((fundIds) => new Set(fundIds).size === fundIds.length, {
        message: 'fundIds must not contain duplicates',
      }),
  })
  .strict();

const prodIdentityFileSchema = z.array(prodIdentitySchema).min(1);

export type ProdIdentity = z.infer<typeof prodIdentitySchema>;

export class ProdIdentityValidationError extends Error {
  override readonly name = 'ProdIdentityValidationError';
}

export function parseProdIdentityFile(contents: string): ProdIdentity[] {
  let input: unknown;
  try {
    input = JSON.parse(contents) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown JSON parse error';
    throw new ProdIdentityValidationError(`Invalid production identity JSON: ${message}`);
  }

  const parseResult = prodIdentityFileSchema.safeParse(input);
  if (!parseResult.success) {
    throw new ProdIdentityValidationError(
      `Invalid production identity file: ${parseResult.error.message}`
    );
  }
  const identities = parseResult.data;
  const seenUsernames = new Set<string>();
  const duplicateUsernames = new Set<string>();

  for (const identity of identities) {
    if (seenUsernames.has(identity.username)) {
      duplicateUsernames.add(identity.username);
    }
    seenUsernames.add(identity.username);
  }

  if (duplicateUsernames.size > 0) {
    throw new ProdIdentityValidationError(
      `Duplicate usernames in production identity file: ${[...duplicateUsernames]
        .sort()
        .map((username) => JSON.stringify(username))
        .join(', ')}`
    );
  }

  const devPasswordUsernames = identities
    .filter(({ password }) => DEV_SEED_PASSWORDS.has(password))
    .map(({ username }) => username)
    .sort();

  if (devPasswordUsernames.length > 0) {
    throw new ProdIdentityValidationError(
      `Refusing production dev seed password for username(s): ${devPasswordUsernames
        .map((username) => JSON.stringify(username))
        .join(', ')}`
    );
  }

  return identities;
}

export function assertIdentityFileOutsideRepo(filePath: string, repoRoot: string): string {
  const resolvedFilePath = resolve(filePath);
  const resolvedRepoRoot = resolve(repoRoot);
  const relativePath = relative(resolvedRepoRoot, resolvedFilePath);
  const isOutsideRepo =
    relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);

  if (!isOutsideRepo) {
    throw new ProdIdentityValidationError('IDENTITY_FILE must be outside the repository.');
  }

  return resolvedFilePath;
}

export function assertFundIdsExist(
  identities: readonly ProdIdentity[],
  existingFundIds: ReadonlySet<number>
): void {
  const missingFundIds = new Set<number>();

  for (const { fundIds } of identities) {
    for (const fundId of fundIds) {
      if (!existingFundIds.has(fundId)) {
        missingFundIds.add(fundId);
      }
    }
  }

  if (missingFundIds.size > 0) {
    throw new ProdIdentityValidationError(
      `Production identity file references missing fund id(s): ${[...missingFundIds]
        .sort((left, right) => left - right)
        .join(', ')}`
    );
  }
}

export function getProdIdentityBcryptCost(nodeEnv: string | undefined): 8 | 12 {
  return nodeEnv === 'production' ? 12 : 8;
}
