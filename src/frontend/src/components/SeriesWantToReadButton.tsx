import { useState } from 'react';

import type { Book } from '../types';
import { addSeriesToWantToRead } from '../utils/seriesWantToRead';

interface SeriesWantToReadButtonProps {
  books: Book[];
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const SeriesWantToReadButton = ({ books, onShowToast }: SeriesWantToReadButtonProps) => {
  const [busy, setBusy] = useState(false);

  if (!books.some((book) => book.provider === 'hardcover' && book.provider_id)) return null;

  const handleClick = async () => {
    setBusy(true);
    try {
      const { added, skipped, failed } = await addSeriesToWantToRead(books);
      const failure = failed ? `, ${failed} failed` : '';
      onShowToast?.(
        `Added ${added} to Want to Read, skipped ${skipped} already in library or on a shelf${failure}`,
        failed ? 'error' : 'success',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy}
      title="Add every Hardcover book in this series to Want to Read"
      className="mr-2 rounded-full bg-sky-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? 'Adding…' : 'Add Series to Want to Read'}
    </button>
  );
};
