import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { sourceLanguage, sourceLanguageSql, translationMatchesLocale, translationMatchesLocaleSql } from "@aihot/backend/content/language";
import type { Locale } from "@aihot/contracts/locale";

after(closeDb);
const samples: Array<{ text: string; locale: Locale; expected: boolean }> = [
  { text: 'Пример кода.\n```ts\n// 很长的中文代码注释保持原样，这些文字不应该计入俄语正文。\nconst title = "中文变量值";\n```', locale: "ru", expected: true },
  { text: '中文解释。\n```js\nconst longEnglishVariable = "a long English example with many words";\n```', locale: "zh", expected: true },
  { text: 'An English explanation with `очень длинный русский текст внутри кода`. More details.', locale: "en", expected: true },
  { text: '这段中文确实没有翻译成俄语。 `Russian brand`', locale: "ru", expected: false },
];

test("语言验证排除保留的代码注释，仍拒绝代码外的错语正文", () => {
  for (const { text, locale, expected } of samples) assert.equal(translationMatchesLocale(text, locale), expected, text);
});

test("数据库缓存判断与程序一样忽略 Markdown 代码", async () => {
  for (const { text, locale, expected } of samples) {
    const [row] = await sql`SELECT ${translationMatchesLocaleSql(locale, sql`${text}::text`)} AS matches`;
    assert.equal(row!.matches, expected, text);
  }
});

test("自动原文语言以叙述文字为准，不能被代码里的另一种语言改写", () => {
  assert.equal(sourceLanguage(null, samples[0]!.text), "ru");
  assert.equal(sourceLanguage(null, samples[1]!.text), "zh");
});

test("队列和公开读取的原文语言检测同样排除代码", async () => {
  for (const [text, expected] of [[samples[0]!.text, "ru"], [samples[1]!.text, "zh"]]) {
    const [row] = await sql`SELECT ${sourceLanguageSql(sql`NULL::text`, sql`${text}::text`)} AS language`;
    assert.equal(row!.language, expected);
  }
});
