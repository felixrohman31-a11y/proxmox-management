import { cookies } from 'next/headers';
import {
  LOCALE_COOKIE,
  getDict,
  type Dict,
  type Locale
} from './i18n-dict';

export function getServerLocale(): Locale {
  const v = cookies().get(LOCALE_COOKIE)?.value;
  return v === 'en' ? 'en' : 'id';
}

export function serverT(): Dict {
  return getDict(getServerLocale());
}
