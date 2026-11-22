import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookTargetOption } from '../services/api';
import type { Book } from '../types';

const loadBookTargets = vi.fn<(provider: string, id: string) => Promise<BookTargetOption[]>>();
const setBookTargetState =
  vi.fn<
    (
      provider: string,
      id: string,
      target: string,
      selected: boolean,
    ) => Promise<{ changed: boolean; selected: boolean }>
  >();

vi.mock('../utils/bookTargetLoader', () => ({
  bookSupportsTargets: (b: Book) => b.provider === 'hardcover' && Boolean(b.provider_id),
  loadBookTargets: (provider: string, id: string) => loadBookTargets(provider, id),
}));
vi.mock('../services/api', () => ({
  setBookTargetState: (provider: string, id: string, target: string, selected: boolean) =>
    setBookTargetState(provider, id, target, selected),
}));

import { addSeriesToWantToRead } from '../utils/seriesWantToRead';

const book = (id: string, extra: Partial<Book> = {}): Book => ({
  id,
  title: id,
  author: 'A',
  provider: 'hardcover',
  provider_id: id,
  ...extra,
});
const shelf = (value: string, checked: boolean) => ({
  value,
  label: value,
  checked,
  writable: true,
});

describe('addSeriesToWantToRead', () => {
  beforeEach(() => {
    loadBookTargets.mockReset();
    setBookTargetState.mockReset();
    setBookTargetState.mockResolvedValue({ changed: true, selected: true });
  });

  it('adds unshelved books and skips library and already-shelved ones', async () => {
    loadBookTargets.mockImplementation(async (_p: string, id: string) =>
      id === 'read' ? [shelf('status:3', true)] : [shelf('status:1', false)],
    );
    const result = await addSeriesToWantToRead([
      book('new'),
      book('read'),
      book('owned', { library: { ebook: 'owned' } }),
      book('other', { provider: 'openlibrary' }),
    ]);
    expect(result).toEqual({ added: 1, skipped: 3, failed: 0 });
    expect(setBookTargetState).toHaveBeenCalledTimes(1);
    expect(setBookTargetState).toHaveBeenCalledWith('hardcover', 'new', 'status:1', true);
  });

  it('counts a failed lookup or write without stopping the rest', async () => {
    loadBookTargets.mockImplementation(async (_p: string, id: string) => {
      if (id === 'a') throw new Error('boom');
      return [];
    });
    setBookTargetState.mockRejectedValueOnce(new Error('nope'));
    const result = await addSeriesToWantToRead([book('a'), book('b'), book('c')]);
    expect(result).toEqual({ added: 1, skipped: 0, failed: 2 });
  });
});
