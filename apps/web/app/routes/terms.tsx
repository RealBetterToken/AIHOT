import { useT, useLocale, createT } from "../i18n/index.ts";
import { localeFromPath } from "../i18n/locale.ts";
import { SITE } from "@aihot/industry/site";
import { pageMeta } from "../lib/seo";
import { prepareCopy } from "../lib/site-copy";
import copy from "@aihot/industry/pages/terms.md?raw";
import { CopyPage, LegalFooterLinks } from "../features/copy/CopyPage";
import ruCopy from "@aihot/industry/pages/terms.ru.md?raw";
import enCopy from "@aihot/industry/pages/terms.en.md?raw";

const COPIES = { zh: prepareCopy(copy), ru: prepareCopy(ruCopy), en: prepareCopy(enCopy) };

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export function meta({ location }: { location: { pathname: string } }) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  return pageMeta({ locale, title: t("使用规则"), description: t("本站网站、RSS、公开 API 与 MCP 的使用规则。"), path: "/terms", image: "/og/pages/terms.png" });
}

export default function TermsPage() {
  const t = useT();
  const TERMS = COPIES[useLocale()];
  return (
    <CopyPage
      doc={TERMS.doc}
      rendered={TERMS.rendered}
      eyebrow={SITE.name}
      footer={<LegalFooterLinks links={[{ to: "/privacy", label: t("隐私说明") }, { to: "/agent", label: t("Agent 接入页") }]} note={`${t("使用规则")} ${TERMS.doc.meta["版本"] ?? ""} · ${TERMS.doc.meta["生效日期"] ?? ""}`} />}
    />
  );
}
