import * as cheerio from "cheerio";
import { z } from "zod";
import type { Locale } from "@aihot/contracts/locale";
import { translateText, chatJson, ModelOutputError } from "../providers/llm.ts";
import { rejectReceivedResponse } from "../providers/receipts.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { translationMatchesLocale } from "../content/language.ts";
import { translationPolicy, translationQualityVersion, reviewEnabled } from "./translation-policy.ts";
import { promptText, promptVersion } from "./prompts.ts";
import { modelFor } from "./models.ts";

const LANGUAGE: Record<Locale, string> = { zh: "Chinese", ru: "Russian", en: "English" };
const MAX_CHARS = 3500;
export class TranslationInterruptedError extends Error {}

type Options = {
  model: string; purpose: string; subject: string; promptVersion: string;
  locale: Locale; deadline: number; attemptTag?: string; plain?: boolean; review?: boolean;
};

/** 日历月份在三种语言中可以写成月份名或数字；单独比较月份，避免把 9 月当成新增数字。 */
function calendarMonths(prose: string) {
  const months: string[] = [];
  const take = (month: string) => { months.push(String(Number(month))); return " "; };
  let text = prose.replace(/(?<![\d.,+−-])(0?[1-9]|1[0-2])\s*月/g, (_match, month: string) => take(month));
  const names = [
    ["January", "январ(?:ь|я|е)", "一月"], ["February", "феврал(?:ь|я|е)", "二月"],
    ["March", "март(?:а|е)?", "三月"], ["April", "апрел(?:ь|я|е)", "四月"],
    ["May", "ма(?:й|я|е)", "五月"], ["June", "июн(?:ь|я|е)", "六月"],
    ["July", "июл(?:ь|я|е)", "七月"], ["August", "август(?:а|е)?", "八月"],
    ["September", "сентябр(?:ь|я|е)", "九月"], ["October", "октябр(?:ь|я|е)", "十月"],
    ["November", "ноябр(?:ь|я|е)", "十一月"], ["December", "декабр(?:ь|я|е)", "十二月"],
  ];
  // 中文月份先匹配长词，避免把十一月拆成十 + 一月。
  for (let i = names.length - 1; i >= 0; i--) {
    const [en, ru, zh] = names[i]!;
    text = text.replace(new RegExp(zh!, "gu"), () => take(String(i + 1)));
    text = text.replace(new RegExp(`(?<![А-Яа-яЁё])${ru}(?![А-Яа-яЁё])`, "giu"), () => take(String(i + 1)));
    text = text.replace(new RegExp(`\\b${en}\\b`, "gu"), (match, offset: number) => {
      if (en === "May" && !/\b(in|since|by|during|on|of)\s+$/i.test(text.slice(0, offset))
        && !/^\s+(\d|build|release|update|launch|deadline)/i.test(text.slice(offset + match.length))) return match;
      return take(String(i + 1));
    });
  }
  return { text, months: months.sort() };
}

function preservedContent(text: string) {
  const doc = cheerio.load(text, null, false);
  const elements = doc("*").toArray();
  const markup = elements.flatMap((el) => "attribs" in el ? [[el.name, Object.entries(el.attribs).sort(), elements.indexOf(el.parent!)]] : []);
  const markers = [...text.matchAll(/⟦[^⟧]+⟧/g)].map((m) => m[0]).sort();
  doc("code,pre").remove();
  const prose = doc.root().text().replace(/⟦[^⟧]+⟧|https?:\/\/\S+|`[^`]+`/g, " ");
  const calendar = calendarMonths(prose);
  // percent / процентов 可以自然写成 %；先统一表达，仍拒绝百分比数值或单位的改变。
  const numericText = calendar.text.replace(/([−+-]?\d+(?:[.,]\d+)*)\s*(?:percent|per cent|процент(?:а|ов|ы|у|е|ом|ам|ах|ами)?)(?![A-Za-zА-Яа-яЁё])/giu, "$1%")
    .replace(/百分之\s*([−+-]?\d+(?:[.,]\d+)*)/g, "$1%")
    .replace(/(\d)\s+([%‰°])/g, "$1$2");
  const numbers = (numericText.match(/[−+-]?\d+(?:[.,]\d+)*(?:%|‰|°|\+)?/g) ?? []).sort();
  const currency = (prose.match(/[$€£¥₽₩]/g) ?? []).sort();
  const currencyWords = [
    ["USD", "USD|dollars?|доллар(?:а|ов|ы|у|е|ом|ам|ах|ами)?|美元"], ["EUR", "EUR|euros?|евро|欧元"],
    ["CNY", "CNY|RMB|yuans?|юан(?:ь|я|ей|ю|е|ями|ях)|人民币|元人民币"], ["RUB", "RUB|рубл(?:ь|я|ей|ю|е|ём|ем|ям|ях|ями)|卢布"],
  ].flatMap(([unit, pattern]) => [...prose.matchAll(new RegExp(`(?<![A-Za-zА-Яа-яЁё])(?:${pattern})(?![A-Za-zА-Яа-яЁё])`, "giu"))].map(() => unit)).sort();
  const unitPatterns = [
    ["ms", "milliseconds?|msec|ms|毫秒|мс|миллисекунд(?:а|ы|у|е|ой|ам|ах|ами)?"],
    ["s", "seconds?|secs?|s|秒钟|秒|секунд(?:а|ы|у|е|ой|ам|ах|ами)?|сек|с"],
    ["min", "minutes?|mins?|分钟|минут(?:а|ы|у|е|ой|ам|ах|ами)?|мин"],
    ["hour", "hours?|hrs?|小时|час(?:а|ов|у|е|ом|ам|ах|ами)?|ч"],
    ["day", "days?|天|д(?:ень|ня|ней|ню|нём|нем|ням|нями|нях)|дн"],
    ["GB", "GB|ГБ"], ["GiB", "GiB|ГиБ"], ["MB", "MB|МБ"], ["MiB", "MiB|МиБ"],
    ["KB", "KB|КБ"], ["KiB", "KiB|КиБ"],
    ["million", "millions?|млн|миллион(?:а|ов|ы|у|е|ом|ам|ах|ами)?|百万"],
    ["billion", "billions?|млрд|миллиард(?:а|ов|ы|у|е|ом|ам|ах|ами)?|十亿"],
    ["hundred-million", "亿"],
  ];
  const units = unitPatterns.flatMap(([unit, pattern]) => [...calendar.text.matchAll(new RegExp(`([−+-]?\\d+(?:[.,]\\d+)*)(?:[-\\s]*)(?:${pattern})(?![A-Za-zА-Яа-яЁё])`, unit?.endsWith("B") ? "gu" : "giu"))].map((m) => `${m[1]}:${unit}`)).sort();
  return { markup, markers, numbers, currency, currencyWords, units, months: calendar.months };
}

/** 将数值保护到审校结束；映射给模型看实际数值，本地恢复保证 340+ 等限定不丢失。 */
function protectNumbers(source: string[], draft: string[]) {
  const facts: Array<{ marker: string; value: string }> = [];
  const rewrite = (html: string, replace: (value: string) => string) => {
    const doc = cheerio.load(html, null, false);
    for (const node of new Set([...doc.root().contents().toArray(), ...doc("*").contents().toArray()])) {
      if (node.type !== "text" || doc(node).parents("code,pre").length) continue;
      // 日历月份可写成目标语言的月份名，由 months 校验；年份及其他数值仍用占位符保护。
      node.data = node.data.replace(/⟦[^⟧]+⟧|https?:\/\/[^\s<>]+|`[^`]+`|(?<![\d.,+−-])(?:0?[1-9]|1[0-2])\s*月|[−+-]?\d+(?:[.,]\d+)*(?:%|‰|°|\+)?/g,
        (value) => /^(⟦|https?:|`)/.test(value) || value.endsWith("月") ? value : replace(value));
    }
    return doc.html();
  };
  const protectedSource = source.map((html, i) => rewrite(html, (value) => {
    const fact = { marker: `⟦N${i}_${facts.length}⟧`, value }; facts.push(fact); return fact.marker;
  }));
  const protectedDraft = draft.map((html, i) => {
    const available = facts.filter((fact) => fact.marker.startsWith(`⟦N${i}_`));
    return rewrite(html, (value) => {
      const index = available.findIndex((fact) => fact.value === value);
      return index < 0 ? value : available.splice(index, 1)[0]!.marker;
    });
  });
  const restore = (text: string) => text.replace(/⟦N\d+_\d+⟧/g, (marker) => facts.find((fact) => fact.marker === marker)?.value ?? marker);
  return { source: protectedSource, draft: protectedDraft, facts, restore };
}

/** 初译与母语审校各自经过回执；校验失败仅拒绝审校回执，初译可用于恢复。 */
async function reviewParts(source: string[], draft: string[], opts: Options): Promise<{ parts: string[] | null; receiptIds: number[] }> {
  if (opts.review === false || !reviewEnabled()) return { parts: draft, receiptIds: [] };
  if (shutdownSignal.signal.aborted || Date.now() >= opts.deadline) throw new TranslationInterruptedError("翻译审校已中断，保留初译回执供恢复");
  const protectedText = protectNumbers(source, draft);
  const model = await modelFor("translationReview");
  if (shutdownSignal.signal.aborted || Date.now() >= opts.deadline) throw new TranslationInterruptedError("翻译审校已中断，保留初译回执供恢复");
  const res = await chatJson({ model, purpose: "translation_review", subject: opts.subject,
    system: promptText("translation-edit"), promptVersion: promptVersion("translation-edit"),
    user: JSON.stringify({ locale: opts.locale, source: protectedText.source, draft: protectedText.draft, facts: protectedText.facts,
      style: promptText(`translate-native-${opts.locale}`),
      terms: translationPolicy(source.join("\n"), opts.locale).terms }),
    schema: z.object({ t: z.array(z.string()) }), temperature: 0.2,
    maxTokens: Math.min(8000, Math.max(1500, Math.ceil(draft.join("").length * 1.3) + 400)),
    timeoutMs: Math.max(1, Math.min(180000, opts.deadline - Date.now())), attemptTag: opts.attemptTag,
  });
  const errors: string[] = [];
  const valid = res.data.t.length === source.length && res.data.t.every((text, i) => {
    if (!text.trim()) return false;
    const before = preservedContent(protectedText.source[i]!), after = preservedContent(text);
    for (const key of ["markup", "markers"] as const) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) { errors.push(`${i}:${key}`); return false; }
    }
    const original = preservedContent(source[i]!), restored = preservedContent(protectedText.restore(text));
    for (const key of ["numbers", "currency", "currencyWords", "units", "months"] as const) {
      if (JSON.stringify(original[key]) !== JSON.stringify(restored[key])) { errors.push(`${i}:${key}`); return false; }
    }
    return translationMatchesLocale(protectedText.restore(text), opts.locale);
  });
  if (!valid) await rejectReceivedResponse(res.receiptId, `翻译审校改动了数字、结构、占位符或目标语言 ${errors.join(",")}`);
  return { parts: valid ? res.data.t.map(protectedText.restore) : null, receiptIds: [res.receiptId] };
}

function protectText(value: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const text = value.replace(/```[\s\S]*?```|`[^`]+`|https?:\/\/[^\s<>]+/g, (token) => {
    tokens.push(token); return `⟦VH${tokens.length - 1}⟧`;
  });
  return { text, tokens };
}

function restoreText(text: string, tokens: string[]): string | null {
  const markers = [...text.matchAll(/⟦VH(\d+)⟧/g)];
  if (markers.length !== tokens.length || tokens.some((_token, i) => markers.filter((m) => Number(m[1]) === i).length !== 1)) return null;
  return text.replace(/⟦VH(\d+)⟧/g, (_marker, i: string) => tokens[Number(i)]!);
}

const escapeText = (text: string) => cheerio.load("<span></span>", null, false)("span").text(text).html()!;

/** 专用翻译接口只接收正文；段落标识由程序包装并校验，不让模型生成 JSON。 */
export async function machineTranslateBatch(parts: string[], opts: Options): Promise<{ parts: string[] | null; receiptId: number; receiptIds: number[] }> {
  const protectedParts = opts.plain ? parts.map(protectText) : null;
  const input = protectedParts ? protectedParts.map((part) => escapeText(part.text)) : parts;
  const text = input.length === 1 ? input[0]! : input.map((part, i) => `<div id="VHMT_${i}">${part}</div>`).join("\n");
  const policy = translationPolicy(text, opts.locale);
  const res = await translateText({ model: opts.model, purpose: opts.purpose, subject: opts.subject,
    promptVersion: `${opts.promptVersion}:${translationQualityVersion()}:mt-html-v1`, text,
    sourceLanguage: "auto", targetLanguage: LANGUAGE[opts.locale], ...policy,
    attemptTag: opts.attemptTag, timeoutMs: Math.max(1, Math.min(180_000, opts.deadline - Date.now())) });
  let translated: string[] | null = null;
  if (parts.length === 1) translated = [res.data];
  else {
    const doc = cheerio.load(res.data, null, false);
    const blocks = doc.root().children().toArray();
    if (blocks.length === parts.length && blocks.every((el, i) => el.name === "div" && el.attribs.id === `VHMT_${i}`)) {
      translated = blocks.map((el) => doc(el).html() ?? "");
      for (const el of blocks) doc(el).remove();
      if (doc.root().text().trim()) translated = null;
    }
  }
  const receiptIds = [res.receiptId];
  if (translated) {
    const reviewed = await reviewParts(input, translated, opts);
    receiptIds.push(...reviewed.receiptIds);
    if (!reviewed.parts) return { parts: null, receiptId: res.receiptId, receiptIds };
    translated = reviewed.parts;
  }
  if (translated && protectedParts) {
    const restored = translated.map((part, i) => restoreText(cheerio.load(part, null, false).root().text(), protectedParts[i]!.tokens));
    translated = restored.every((part) => part !== null) ? restored as string[] : null;
  }
  if (!translated || translated.some((part) => !part.trim())) {
    await rejectReceivedResponse(res.receiptId, "翻译丢失或改动了段落边界");
    return { parts: null, receiptId: res.receiptId, receiptIds };
  }
  return { parts: translated, receiptId: res.receiptId, receiptIds };
}

/** HTML 翻译损坏时只重试文字；标签、代码占位符和链接结构由本地保留。 */
export async function machineTranslateTextNodes(parts: string[], opts: Options): Promise<{ parts: string[] | null; receiptIds: number[] }> {
  const docs = parts.map((part) => cheerio.load(part, null, false));
  const slots: Array<{ text: string; set: (text: string) => void }> = [];
  for (const doc of docs) {
    const nodes = new Set([...doc.root().contents().toArray(), ...doc("*").contents().toArray()]);
    for (const node of nodes) {
      if (node.type !== "text") continue;
      const chunks = node.data.split(/(⟦\d+⟧)/g);
      chunks.forEach((text, i) => {
        if (/^⟦\d+⟧$/.test(text) || !/\p{L}/u.test(text)) return;
        slots.push({ text, set: (translated) => {
          chunks[i] = `${text.match(/^\s*/)?.[0] ?? ""}${translated.trim()}${text.match(/\s*$/)?.[0] ?? ""}`;
          node.data = chunks.join("");
        } });
      });
    }
  }
  const receiptIds: number[] = [];
  for (let start = 0, index = 0; start < slots.length; index++) {
    if (shutdownSignal.signal.aborted || Date.now() >= opts.deadline) return { parts: null, receiptIds };
    let end = start, chars = 0;
    while (end < slots.length && (end === start || chars + slots[end]!.text.length <= MAX_CHARS)) chars += slots[end++]!.text.length;
    const batch = slots.slice(start, end);
    const res = await machineTranslateBatch(batch.map((slot) => slot.text), {
      ...opts, plain: true, review: false, subject: `${opts.subject}:text#${index}`,
    });
    receiptIds.push(...res.receiptIds);
    if (!res.parts) return { parts: null, receiptIds };
    if (!res.parts.every((text) => {
      const prose = text.replace(/```[\s\S]*?```|`[^`]+`|https?:\/\/\S+|⟦(?:VH)?\d+⟧/g, " ");
      return /\p{L}/u.test(prose) && translationMatchesLocale(prose, opts.locale);
    })) {
      await rejectReceivedResponse(res.receiptId, "文字翻译丢失叙述内容或目标语言不符");
      return { parts: null, receiptIds };
    }
    res.parts.forEach((text, i) => batch[i]!.set(text));
    start = end;
  }
  const reviewed = await reviewParts(parts, docs.map((doc) => doc.html()), opts);
  return { parts: reviewed.parts, receiptIds: [...receiptIds, ...reviewed.receiptIds] };
}

type Card = { id: string; fields: Record<string, unknown>; locales: readonly Locale[] };
export type MachineLocalization = {
  data: { items: Array<Record<string, unknown>> }; receiptId: number | null;
  receiptIds: number[]; locales: readonly Locale[];
};

/** 只收集读者文字，标识、空值和数组顺序在本地复制；收到一个语言就交给调用方保存。 */
export async function* machineLocalizations(cards: Card[], opts: Omit<Options, "locale">): AsyncGenerator<MachineLocalization> {
  for (const locale of ["zh", "ru", "en"] as const) {
    if (shutdownSignal.signal.aborted || Date.now() >= opts.deadline) return;
    const selected = cards.filter((card) => card.locales.includes(locale));
    if (!selected.length) continue;
    const slots: Array<{ parts: string[]; translated: string[]; tokens: string[]; set: (text: string) => void }> = [];
    const items = selected.map((card) => {
      const fields = structuredClone(card.fields);
      const visit = (obj: Record<string, unknown> | unknown[]) => {
        for (const [key, value] of Object.entries(obj)) {
          if (key === "public_id" || key === "id") continue;
          if (value && typeof value === "object") visit(value as Record<string, unknown>);
          else if (typeof value === "string" && value.trim()) {
            const { text: protectedText, tokens } = protectText(value);
            const parts: string[] = [];
            let remaining = protectedText;
            while (remaining.length) {
              let end = Math.min(2000, remaining.length);
              if (end < remaining.length) {
                const boundary = [...remaining.slice(0, end).matchAll(/[\s。！？.!?;,，]/g)].at(-1)?.index;
                if (boundary !== undefined && boundary > end / 2) end = boundary + 1;
                if (/[\uD800-\uDBFF]/.test(remaining[end - 1]!)) end--;
                const placeholder = remaining.lastIndexOf("⟦", end - 1);
                if (placeholder >= 0 && remaining.indexOf("⟧", placeholder) >= end) end = placeholder || remaining.indexOf("⟧", placeholder) + 1;
              }
              const part = remaining.slice(0, end);
              parts.push(escapeText(part));
              remaining = remaining.slice(end);
            }
            slots.push({ parts, translated: [], tokens, set: (text) => { (obj as Record<string, unknown>)[key] = text; } });
          }
        }
      };
      visit(fields);
      return { id: card.id, [locale]: fields };
    });
    const allParts = slots.flatMap((slot) => slot.parts.map((text) => ({ text, slot })));
    const receiptIds: number[] = [];
    // 批次边界被改动时缩小批次，最终逐字段翻译；失败回执仍计入预算。
    const translate = async (parts: typeof allParts, subject: string): Promise<void> => {
      if (shutdownSignal.signal.aborted || Date.now() >= opts.deadline) throw new ModelOutputError("翻译时间预算已耗尽");
      const res = await machineTranslateBatch(parts.map((part) => part.text), { ...opts, locale, subject });
      if (!res.parts) {
        if (parts.length === 1) throw new ModelOutputError("千问翻译未保留全部字段边界");
        const mid = Math.ceil(parts.length / 2);
        await translate(parts.slice(0, mid), `${subject}:left`);
        await translate(parts.slice(mid), `${subject}:right`);
        return;
      }
      receiptIds.push(...res.receiptIds);
      res.parts.forEach((text, i) => parts[i]!.slot.translated.push(cheerio.load(text, null, false).root().text()));
    };
    for (let start = 0, index = 0; start < allParts.length; index++) {
      if (shutdownSignal.signal.aborted || Date.now() >= opts.deadline) return;
      let end = start, chars = 0;
      while (end < allParts.length && (end === start || chars + allParts[end]!.text.length <= MAX_CHARS)) chars += allParts[end++]!.text.length;
      const batch = allParts.slice(start, end);
      await translate(batch, `${opts.subject}:${locale}#${index}`);
      start = end;
    }
    for (const slot of slots) {
      let text = slot.translated.join(locale === "zh" ? "" : " ");
      const restored = restoreText(text, slot.tokens);
      if (restored === null) {
        for (const id of receiptIds) await rejectReceivedResponse(id, "翻译改动了代码或链接占位符");
        throw new ModelOutputError("千问翻译未保留代码或链接");
      }
      slot.set(restored);
    }
    yield { data: { items }, receiptId: receiptIds[0] ?? null, receiptIds, locales: [locale] };
  }
}
