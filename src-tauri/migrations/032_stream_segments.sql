-- 流式生成内容段（溢出表）：大文本不入 request_logs 主表，避免拖慢日志列表查询。
-- detail_level=detailed 时随流式落账写入（受日志策略门控）；保留期清理与主表同步。
-- response_id：Responses 协议逐帧持久化路径的续传锚点（上游 response.id 透传），
-- 其余协议为 NULL（整段内容模式）。
CREATE TABLE IF NOT EXISTS stream_segments (
    log_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    response_id TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (log_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_stream_segments_created ON stream_segments(created_at);
CREATE INDEX IF NOT EXISTS idx_stream_segments_response ON stream_segments(response_id, seq);
