-- C-06/R1：chunk 内容哈希——文档重处理时内容未变的块复用既有 embedding，
-- 不再调用付费 embedding 渠道。可空列，不做历史回填（随文档下次处理自然填充）；
-- 查询按 doc_id 走既有 idx_chunks_doc 索引，无需为哈希单独建索引。
ALTER TABLE kb_chunks ADD COLUMN content_hash TEXT;
