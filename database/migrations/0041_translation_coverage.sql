-- 旧版分段可能漏掉容器中的文字；后台逐步重验，不删除现有译文。
ALTER TABLE translations ADD COLUMN coverage_version integer NOT NULL DEFAULT 0;
