import * as MediaLibrary from 'expo-media-library/legacy';

export type PhotoPage = {
  photos: MediaLibrary.Asset[];
  totalCount: number;
  hasNextPage: boolean;
  endCursor: string;
};

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Loads one page of photos taken between `from` and `to` (whole days, inclusive),
// newest first. Pass the previous page's endCursor to load the next page.
export async function loadPhotos(from: Date, to: Date, after?: string): Promise<PhotoPage> {
  const page = await MediaLibrary.getAssetsAsync({
    mediaType: MediaLibrary.MediaType.photo,
    createdAfter: startOfDay(from),
    createdBefore: endOfDay(to),
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    first: 60,
    after,
  });
  return {
    photos: page.assets,
    totalCount: page.totalCount,
    hasNextPage: page.hasNextPage,
    endCursor: page.endCursor,
  };
}

// Loads every photo in the range (just the list, not the images themselves),
// newest first. Used by the swipe screen so it knows how many photos there are.
export async function loadAllPhotos(from: Date, to: Date): Promise<MediaLibrary.Asset[]> {
  const all: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  while (true) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      createdAfter: startOfDay(from),
      createdBefore: endOfDay(to),
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      first: 500,
      after,
    });
    all.push(...page.assets);
    if (!page.hasNextPage) return all;
    after = page.endCursor;
  }
}
