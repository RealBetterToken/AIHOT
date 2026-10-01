import { LocaleAnchor } from "../../lib/locale-links";
import { IconArrowUpRight } from "../../components/icons";
import { useT } from "../../i18n/index";
import type { XPostView } from "@aihot/contracts/site";
// The post an X item quotes, as X shows it under the post: who wrote it, what they said and a way to
// it. The item's own text and translation often only make sense next to it.

type Quoted = NonNullable<XPostView["quoted"]>;

function Author({ quoted }: { quoted: Pick<Quoted, "authorName" | "handle"> }) {
  const t = useT();
  return (
    <>
      <span className="text-ink-4">{t("引用")}</span>
      <bdi className="font-semibold text-ink-2">{quoted.authorName || `@${quoted.handle}`}</bdi>
      {quoted.authorName && quoted.handle && <span dir="ltr" className="text-ink-4">@{quoted.handle}</span>}
    </>
  );
}

/** 引用帖按当前语言展示，原文可展开；原文页的接口不传译文。 */
export function QuotedPost({ quoted, original = false }: { quoted: Quoted; original?: boolean }) {
  const t = useT();
  const translated = original ? null : quoted.translation;
  return (
    <figure className="mt-6 rounded-tile border border-line px-4 py-3.5">
      <figcaption className="flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
        <Author quoted={quoted} />
      </figcaption>
      <blockquote className="mt-2 whitespace-pre-line text-[15px] leading-[1.75] text-ink-2">{translated ?? quoted.text}</blockquote>
      {translated && (
        <details className="mt-2 text-[13px] text-ink-4">
          <summary className="cursor-pointer select-none hover:text-ink-3">{t("原文")}</summary>
          <p className="mt-1.5 whitespace-pre-line text-[14px] leading-[1.7] text-ink-3">{quoted.text}</p>
        </details>
      )}
      {quoted.url && (
        <LocaleAnchor href={quoted.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-0.5 text-[13px] text-accent hover:text-accent-ink">
          {t("在 X 查看被引用的帖子")} <IconArrowUpRight size={13} />
        </LocaleAnchor>
      )}
    </figure>
  );
}

/** Feed card: who is quoted and the start of what they said (the card itself opens the item). */
export function QuotedLine({ quoted }: { quoted: Omit<Quoted, "url"> }) {
  return (
    <div className="mt-2.5 rounded-tile border border-line-soft px-3 py-2 text-[13px] leading-[1.6]">
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <Author quoted={quoted} />
      </div>
      <p className="mt-0.5 line-clamp-2 text-ink-3">{quoted.translation ?? quoted.text}</p>
    </div>
  );
}
