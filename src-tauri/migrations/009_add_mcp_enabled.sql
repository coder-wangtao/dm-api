-- Add mcp_enabled column to kb_knowledge_bases
-- Controls whether a knowledge base is exposed via MCP server
-- 知识库是否通过 MCP 协议对外暴露
ALTER TABLE kb_knowledge_bases ADD COLUMN mcp_enabled INTEGER NOT NULL DEFAULT 1;
