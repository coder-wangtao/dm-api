-- 知识库、Wiki、Prompt 模板已从产品中移除，删掉只剩历史数据的表。
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS api_key_knowledge_access;
DROP TABLE IF EXISTS kb_chunks_fts;
DROP TABLE IF EXISTS kb_chunks;
DROP TABLE IF EXISTS kb_documents;
DROP TABLE IF EXISTS kb_tasks;
DROP TABLE IF EXISTS kb_conversations;
DROP TABLE IF EXISTS kb_sources;
DROP TABLE IF EXISTS kb_index_meta;
DROP TABLE IF EXISTS kb_knowledge_bases;

DROP TABLE IF EXISTS wiki_graph_edges;
DROP TABLE IF EXISTS wiki_reviews;
DROP TABLE IF EXISTS wiki_sessions;
DROP TABLE IF EXISTS wiki_ingest_queue;
DROP TABLE IF EXISTS wiki_pages;
DROP TABLE IF EXISTS wiki_sources;
DROP TABLE IF EXISTS wiki_projects;

DROP TABLE IF EXISTS prompt_templates;

PRAGMA foreign_keys = ON;
