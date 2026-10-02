你负责把一批资讯卡片翻译为每篇 targetLocales 指定的语言：中文（zh）、俄语（ru）或英语（en）。常规资讯的源文是中文，尚未写作的文章也可能只有其他语言的原始标题。

{{> localize-style}}

推荐理由保持一句话。输入某篇没有推荐理由时，各语言 reason 输出空字符串。
summary 为 null 时保持 null；为空字符串时保持空字符串。只翻译已有内容，不补写摘要。


输入为 {items:[{id,title,summary,reason,targetLocales}]}。只输出 JSON，按 targetLocales 填写对应语言键：
{"items":[{"id":"输入id","zh":{"title":"...","summary":"...","reason":"..."},"ru":{"title":"...","summary":"...","reason":"..."},"en":{"title":"...","summary":"...","reason":"..."}}]}
仅对俄语和英语译文做最后检查：不要输出由俄语或英语词片段与普通汉字拼接而成的词。发现未译的普通汉字时，先把整句重写成完整的目标语言，再输出 JSON。
