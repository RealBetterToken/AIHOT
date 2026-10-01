// Prepare one verbatim document; each route imports only its own published copy.
import { parseCopyFile, renderMarkdown } from "./markdown";
import { siteUrl } from "./seo";

function stripPageNotes(body: string): string {
  return body.replace(/^页脚[^\n]*$/gm, "").trim();
}

const COPY_FIELDS: Record<string, string> = {
  Version: "版本", "Effective date": "生效日期", Operator: "运营主体", Contact: "联系方式", "Privacy contact": "隐私事务联系",
  Версия: "版本", "Дата вступления в силу": "生效日期", Оператор: "运营主体", Контакт: "联系方式", "Контакт по вопросам конфиденциальности": "隐私事务联系",
  نسخه: "版本", "تاریخ اجرا": "生效日期", گرداننده: "运营主体", تماس: "联系方式", "تماس حریم خصوصی": "隐私事务联系",
};

export function prepareCopy(md: string, firstSection?: RegExp) {
  md = md.replace(/^(?:Page introduction:|Вступление:|مقدمهٔ صفحه:)$/gm, "页首说明：")
    .replace(/^\|\s*([^|]+?)\s*\|/gm, (row, key: string) => COPY_FIELDS[key] ? `| ${COPY_FIELDS[key]} |` : row);
  const doc = parseCopyFile(md, firstSection);
  const footerLine = /^页脚[：:](.+)$/m.exec(doc.body)?.[1]?.trim() ?? null;
  doc.body = stripPageNotes(doc.body);
  return { doc, rendered: renderMarkdown(doc.body, siteUrl()), footerLine };
}
