import { isInLibrary } from '../components/shared/LibraryBadge';
// Fork-only: bulk "Want to Read" for a series page. Kept in its own file so
// upstream merges only ever touch the one-line hook in ResultsSection.
import { setBookTargetState } from '../services/api';
import type { Book } from '../types';
import { emitBookTargetChange } from './bookTargetEvents';
import { bookSupportsTargets, loadBookTargets } from './bookTargetLoader';

const WANT_TO_READ = 'status:1';

export interface SeriesWantToReadResult {
  added: number;
  skipped: number;
  failed: number;
}

/**
 * Put every Hardcover book in `books` on Want to Read, except books already in the
 * library or already on any status shelf (setting Want to Read would overwrite Read/Reading).
 * Unreleased books never reach here: series results already honour HARDCOVER_EXCLUDE_UNRELEASED.
 */
export const addSeriesToWantToRead = async (books: Book[]): Promise<SeriesWantToReadResult> => {
  const candidates = books.flatMap((book) =>
    book.provider && book.provider_id && bookSupportsTargets(book) && !isInLibrary(book.library)
      ? [{ provider: book.provider, bookId: book.provider_id }]
      : [],
  );
  const result: SeriesWantToReadResult = {
    added: 0,
    skipped: books.length - candidates.length,
    failed: 0,
  };

  // One batched lookup (the loader coalesces same-tick calls), then sequential writes
  // to stay under Hardcover's rate limit.
  const options = await Promise.all(
    candidates.map(({ provider, bookId }) => loadBookTargets(provider, bookId).catch(() => null)),
  );

  for (const [index, { provider, bookId }] of candidates.entries()) {
    const bookOptions = options[index];
    if (!bookOptions) {
      result.failed += 1;
    } else if (bookOptions.some((o) => o.value.startsWith('status:') && o.checked)) {
      result.skipped += 1;
    } else {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential on purpose (rate limit)
        const state = await setBookTargetState(provider, bookId, WANT_TO_READ, true);
        if (state.changed) {
          emitBookTargetChange({
            provider,
            bookId,
            target: WANT_TO_READ,
            selected: state.selected,
          });
          result.added += 1;
        }
      } catch {
        result.failed += 1;
      }
    }
  }
  return result;
};
