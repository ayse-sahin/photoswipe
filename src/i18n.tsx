import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

// All the text in the app, in English and Turkish.
// Turkish doesn't add a plural ending after a number ("5 fotoğraf"), English does.

export type Language = 'en' | 'tr';

const en = {
  tagline: 'Pare your camera roll down to the best.',
  permissionText:
    'Pare needs access to your photos so you can swipe through them. Your photos never leave your phone.',
  allowAccess: 'Allow photo access',
  accessOff: 'Photo access is turned off. You can turn it on in Settings.',
  openSettings: 'Open Settings',
  limitedAccess: 'You gave access to only some photos, so only those will show.',
  from: 'From',
  until: 'Until',
  today: 'Today',
  findPhotos: 'Find photos',
  somethingWrong: (e: string) => `Something went wrong: ${e}`,
  inThisRange: (n: number): string => (n === 1 ? 'photo in this range' : 'photos in this range'),
  swipe: 'Swipe',
  swipeSub: 'Go through them one by one',
  bestShot: 'Best shot',
  bestShotSub: 'Pick from similar photos',
  showPhotos: 'Show photos',
  hidePhotos: 'Hide photos',
  back: '‹ Back',
  backToStart: 'Back to start',
  backToGroups: 'Back to groups',
  gettingReady: 'Getting your photos ready…',
  findingSimilar: (done: number, total: number) => `Finding similar photos… ${done} / ${total}`,
  allDone: 'All done!',
  almostDone: 'Almost done!',
  keep: 'Keep',
  delete: 'Delete',
  undecided: 'Undecided',
  undecidedSub: (n: number) => `${n} ${n === 1 ? 'photo' : 'photos'} · tap to swipe these`,
  reviewToDelete: (n: number) => `Review ${n} ${n === 1 ? 'photo' : 'photos'} to delete`,
  noneMarked: 'No photos marked for deletion.',
  undoLast: 'Undo last swipe',
  exit: 'Exit',
  exitTitle: (n: number) => `Delete ${n} ${n === 1 ? 'photo' : 'photos'}?`,
  exitBody: (n: number) => `You marked ${n} ${n === 1 ? 'photo' : 'photos'} to delete so far.`,
  cancel: 'Cancel',
  exitNoDelete: 'Exit without deleting',
  deleteAndExit: (n: number) => `Delete ${n} & exit`,
  undecidedRound: 'Undecided ',
  stampKeep: 'KEEP',
  stampDelete: 'DELETE',
  stampUnsure: 'NOT SURE',
  swipeHint: 'Left: delete · Up: not sure · Right: keep',
  review: 'Review',
  reviewSub: (n: number): string =>
    n === 0
      ? 'No photos left to delete.'
      : `${n} ${n === 1 ? 'photo' : 'photos'} will be deleted. Tap a photo to keep it instead.`,
  nothingDeleted: (e: string) => `Nothing was deleted. (${e})`,
  recentlyDeletedNote:
    'Deleted photos go to "Recently Deleted" in your Photos app, so you can still get them back for 30 days.',
  deleting: 'Deleting…',
  deleteN: (n: number) => `Delete ${n} ${n === 1 ? 'photo' : 'photos'}`,
  pickBestShot: 'Pick the best shot',
  noGroups: (min: number) => `No groups of ${min} or more similar photos in these dates.`,
  youFreed: (size: string) => `You freed ${size}`,
  photosDeleted: (n: number) => `${n} ${n === 1 ? 'photo' : 'photos'} deleted`,
  spaceNote:
    'The space comes back when "Recently Deleted" is emptied in the Photos app, or after 30 days.',
  totalFreed: (size: string) => `Pare has freed ${size} for you so far`,
  groupsFound: (n: number) =>
    `${n} ${n === 1 ? 'group' : 'groups'} of similar photos. Tap one to swipe through it.`,
};

const tr: typeof en = {
  tagline: 'Pare your camera roll down to the best.', // Bora: keep English in Turkish too
  permissionText:
    'Fotoğraflarında gezinebilmen için Pare fotoğraflarına erişmeli. Fotoğrafların telefonundan hiç çıkmaz.',
  allowAccess: 'Fotoğraflara erişim izni ver',
  accessOff: 'Fotoğraf erişimi kapalı. Ayarlar’dan açabilirsin.',
  openSettings: 'Ayarları aç',
  limitedAccess: 'Sadece bazı fotoğraflara erişim verdin, yalnızca onlar görünecek.',
  from: 'Başlangıç',
  until: 'Bitiş',
  today: 'Bugün',
  findPhotos: 'Fotoğrafları bul',
  somethingWrong: (e) => `Bir şeyler ters gitti: ${e}`,
  inThisRange: () => 'fotoğraf bu tarihlerde',
  swipe: 'Kaydır',
  swipeSub: 'Tek tek gözden geçir',
  bestShot: 'En iyi kare',
  bestShotSub: 'Benzer fotoğraflardan seç',
  showPhotos: 'Fotoğrafları göster',
  hidePhotos: 'Fotoğrafları gizle',
  back: '‹ Geri',
  backToStart: 'Başa dön',
  backToGroups: 'Gruplara dön',
  gettingReady: 'Fotoğrafların hazırlanıyor…',
  findingSimilar: (done, total) => `Benzer fotoğraflar aranıyor… ${done} / ${total}`,
  allDone: 'Hepsi bitti!',
  almostDone: 'Neredeyse bitti!',
  keep: 'Sakla',
  delete: 'Sil',
  undecided: 'Kararsız',
  undecidedSub: (n) => `${n} fotoğraf · bunları kaydırmak için dokun`,
  reviewToDelete: (n) => `Silinecek ${n} fotoğrafı gözden geçir`,
  noneMarked: 'Silinmek üzere işaretlenen fotoğraf yok.',
  undoLast: 'Son kaydırmayı geri al',
  exit: 'Çık',
  exitTitle: (n) => `${n} fotoğraf silinsin mi?`,
  exitBody: (n) => `Şu ana kadar ${n} fotoğrafı silmek için işaretledin.`,
  cancel: 'Vazgeç',
  exitNoDelete: 'Silmeden çık',
  deleteAndExit: (n) => `${n} fotoğrafı sil ve çık`,
  undecidedRound: 'Kararsız ',
  stampKeep: 'SAKLA',
  stampDelete: 'SİL',
  stampUnsure: 'KARARSIZ',
  swipeHint: 'Sol: sil · Yukarı: kararsız · Sağ: sakla',
  review: 'Gözden geçir',
  reviewSub: (n) =>
    n === 0
      ? 'Silinecek fotoğraf kalmadı.'
      : `${n} fotoğraf silinecek. Saklamak istediğin fotoğrafa dokun.`,
  nothingDeleted: (e) => `Hiçbir şey silinmedi. (${e})`,
  recentlyDeletedNote:
    'Silinen fotoğraflar Fotoğraflar uygulamasındaki "Son Silinenler"e gider, 30 gün boyunca geri alabilirsin.',
  deleting: 'Siliniyor…',
  deleteN: (n) => `${n} fotoğrafı sil`,
  pickBestShot: 'En iyi kareyi seç',
  noGroups: (min) => `Bu tarihlerde ${min} veya daha fazla benzer fotoğraftan oluşan grup yok.`,
  youFreed: (size) => `${size} yer açtın`,
  photosDeleted: (n) => `${n} fotoğraf silindi`,
  spaceNote:
    'Yer, Fotoğraflar’daki "Son Silinenler" boşaltılınca ya da 30 gün sonra geri kazanılır.',
  totalFreed: (size) => `Pare şimdiye kadar ${size} yer açtı`,
  groupsFound: (n) => `${n} benzer fotoğraf grubu. Kaydırmak için birine dokun.`,
};

export const strings = { en, tr };
export type Strings = typeof en;

const STORAGE_KEY = 'pare.language';

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (l: Language) => void;
}>({ language: 'en', setLanguage: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  // Remember the choice between app launches.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'en' || saved === 'tr') setLanguageState(saved);
      })
      .catch(() => {});
  }, []);

  const setLanguage = (l: Language) => {
    setLanguageState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

// The text for the current language, plus a locale for dates and times.
export function useT(): Strings & { locale: string } {
  const { language } = useLanguage();
  return { ...strings[language], locale: language === 'tr' ? 'tr-TR' : 'en-US' };
}
