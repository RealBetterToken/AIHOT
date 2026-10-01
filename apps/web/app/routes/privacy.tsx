import { useT, useLocale, createT } from "../i18n/index.ts";
import { localeFromPath } from "../i18n/locale.ts";
import { SITE } from "@aihot/industry/site";
import { pageMeta } from "../lib/seo";
import { prepareCopy } from "../lib/site-copy";
import copy from "@aihot/industry/pages/privacy.md?raw";
import { CopyPage, LegalFooterLinks } from "../features/copy/CopyPage";
import ruCopy from "@aihot/industry/pages/privacy.ru.md?raw";
import enCopy from "@aihot/industry/pages/privacy.en.md?raw";

const COPIES = { zh: prepareCopy(copy), ru: prepareCopy(ruCopy), en: prepareCopy(enCopy) };

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export function meta({ location }: { location: { pathname: string } }) {
  const locale = localeFromPath(location.pathname);
  const t = createT(locale);
  return pageMeta({ locale, title: t("隐私说明"), description: t("本站如何处理浏览器本地数据、反馈资料与访问日志。"), path: "/privacy", image: "/og/pages/privacy.png" });
}

export default function PrivacyPage() {
  const t = useT();
  const PRIVACY = COPIES[useLocale()];
  return (
    <CopyPage
      doc={PRIVACY.doc}
      rendered={PRIVACY.rendered}
      eyebrow={SITE.name}
      footer={<LegalFooterLinks links={[{ to: "/terms", label: t("使用规则") }, { to: "/feedback", label: t("反馈页") }]} note={`${t("隐私说明")} ${PRIVACY.doc.meta["版本"] ?? ""} · ${PRIVACY.doc.meta["生效日期"] ?? ""}`} />}
    />
  );
}
