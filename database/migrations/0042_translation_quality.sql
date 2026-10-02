-- 文风、术语更新后可后台补译；公开读取继续提供已有完整译文。
ALTER TABLE translations ADD COLUMN quality_version text NOT NULL DEFAULT '';
ALTER TABLE localizations ADD COLUMN quality_version text NOT NULL DEFAULT '';
