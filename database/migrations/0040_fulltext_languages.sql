-- 全文默认展示；个别信源可在后台独立关闭。
ALTER TABLE sources ALTER COLUMN site_fulltext SET DEFAULT true;
ALTER TABLE sources ALTER COLUMN syndicate_fulltext SET DEFAULT true;

-- 保留旧表，中文历史状态迁入按语言独立计数的表。
CREATE TABLE translation_attempts_lang (
  article_id text NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  lang text NOT NULL CHECK (lang IN ('zh', 'ru', 'en')),
  revision integer NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  outcome text NOT NULL CHECK (outcome IN ('translated', 'partial', 'skipped', 'failed')),
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, lang)
);
INSERT INTO translation_attempts_lang (article_id, lang, revision, attempts, outcome, reason, updated_at)
SELECT article_id, 'zh', revision, attempts, outcome, reason, updated_at FROM translation_attempts;

CREATE TABLE quote_translations_lang (
  tweet_id text NOT NULL,
  lang text NOT NULL CHECK (lang IN ('zh', 'ru', 'en')),
  text_hash text NOT NULL,
  text text NOT NULL,
  origin text NOT NULL DEFAULT 'model' CHECK (origin IN ('model', 'reused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tweet_id, lang)
);
