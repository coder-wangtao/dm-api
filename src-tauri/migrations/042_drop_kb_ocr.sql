-- 移除知识库 LLM OCR 留下的列。扫描版识别已从入库流程删除。
ALTER TABLE kb_knowledge_bases DROP COLUMN ocr_model;
ALTER TABLE kb_documents DROP COLUMN ocr_engine;
ALTER TABLE kb_documents DROP COLUMN page_count;
ALTER TABLE kb_documents DROP COLUMN ocr_failed_pages;
