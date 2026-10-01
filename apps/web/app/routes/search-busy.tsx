import { localeFromPath } from "../i18n/locale";
import { createT } from "../i18n/index";
import { titled } from "../lib/seo";
import { SearchBusy } from "./all";
export function meta({ location }: { location: { pathname: string } }) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  return [{ title: titled(t("搜索繁忙")) }, { name: "robots", content: "noindex, follow" }];
}

export function headers() {
  return { "Cache-Control": "no-store" };
}

export default SearchBusy;
