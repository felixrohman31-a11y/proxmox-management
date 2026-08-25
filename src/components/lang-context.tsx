'use client';

import { createContext, useContext } from 'react';
import { getDict, type Dict, type Locale } from '@/lib/i18n-dict';

interface CtxVal {
  locale: Locale;
  L: Dict;
}

const Ctx = createContext<CtxVal>({ locale: 'id', L: getDict('id') });

export function LangProvider({
  initial,
  children
}: {
  initial: Locale;
  children: React.ReactNode;
}) {
  const value: CtxVal = { locale: initial, L: getDict(initial) };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useL(): Dict {
  return useContext(Ctx).L;
}

export function useLocale(): Locale {
  return useContext(Ctx).locale;
}

export function setLangCookie(locale: Locale): void {
  document.cookie = `pc_lang=${locale};path=/;max-age=31536000;samesite=lax`;
}
