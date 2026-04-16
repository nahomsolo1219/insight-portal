// Thin adapters between Server Action FormData payloads and the generic
// uploadFile() helper. Keeps action files from reimplementing the same
// "pull file out of FormData → upload → collect successes/failures" dance.

import 'server-only';

import { uploadFile } from './upload';

export type UploadSingleResult =
  | { success: true; path: string }
  | { success: false; error: string };

/**
 * Pull a single file from `formData.get(fieldName)` and upload it to `path`.
 * Returns the stored path on success.
 */
export async function uploadSingleFromForm(
  formData: FormData,
  fieldName: string,
  path: string,
): Promise<UploadSingleResult> {
  const file = formData.get(fieldName);
  if (!(file instanceof File)) return { success: false, error: 'No file provided' };
  if (file.size === 0) return { success: false, error: 'File is empty' };

  const result = await uploadFile({
    path,
    file,
    contentType: file.type || 'application/octet-stream',
  });

  if ('error' in result) return { success: false, error: result.error };
  return { success: true, path: result.path };
}

export interface UploadManyResult {
  successes: { path: string; originalName: string }[];
  failures: { originalName: string; error: string }[];
}

/**
 * Upload every file posted as `fieldName` (multi-file form inputs use the
 * same field name for each file). Runs sequentially so one bad file
 * doesn't abort the rest — callers can show partial-success UI from the
 * returned successes / failures lists.
 */
export async function uploadManyFromForm(
  formData: FormData,
  fieldName: string,
  pathFor: (file: File, index: number) => string,
): Promise<UploadManyResult> {
  const files = formData.getAll(fieldName).filter((f): f is File => f instanceof File);

  const successes: UploadManyResult['successes'] = [];
  const failures: UploadManyResult['failures'] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size === 0) {
      failures.push({ originalName: file.name, error: 'File is empty' });
      continue;
    }

    const path = pathFor(file, i);
    const result = await uploadFile({
      path,
      file,
      contentType: file.type || 'application/octet-stream',
    });

    if ('error' in result) {
      failures.push({ originalName: file.name, error: result.error });
    } else {
      successes.push({ path: result.path, originalName: file.name });
    }
  }

  return { successes, failures };
}
