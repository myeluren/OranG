-- 智能投标标书生成系统 - 数据库初始化脚本
-- 版本: v2.2

-- 创建数据库
CREATE DATABASE IF NOT EXISTS bidai DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bidai;

-- 租户表
CREATE TABLE IF NOT EXISTS tenants (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL COMMENT '租户名称',
    status ENUM('active', 'disabled') DEFAULT 'active' COMMENT '状态',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户表';

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户',
    username VARCHAR(30) NOT NULL COMMENT '用户名（登录用）',
    email VARCHAR(255) NOT NULL COMMENT '邮箱',
    password_hash VARCHAR(255) NOT NULL COMMENT '密码哈希',
    name VARCHAR(50) NOT NULL COMMENT '真实姓名',
    role ENUM('super_admin', 'tenant_admin', 'user') DEFAULT 'user' COMMENT '角色',
    theme ENUM('light', 'dark') DEFAULT 'light' COMMENT '主题偏好',
    is_first_login TINYINT(1) DEFAULT 1 COMMENT '是否首次登录',
    status ENUM('pending', 'active', 'disabled', 'rejected') DEFAULT 'pending' COMMENT '账号状态',
    last_login_at DATETIME DEFAULT NULL COMMENT '最后登录时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_username (username),
    UNIQUE KEY uk_email (email),
    INDEX idx_tenant (tenant_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 注册申请表
CREATE TABLE IF NOT EXISTS user_register_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(30) NOT NULL COMMENT '用户名',
    email VARCHAR(255) NOT NULL COMMENT '邮箱',
    password_hash VARCHAR(255) NOT NULL COMMENT '密码哈希',
    name VARCHAR(50) NOT NULL COMMENT '真实姓名',
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' COMMENT '审批状态',
    review_note VARCHAR(500) DEFAULT NULL COMMENT '审批备注',
    reviewed_by BIGINT UNSIGNED DEFAULT NULL COMMENT '审批人ID',
    reviewed_at DATETIME DEFAULT NULL COMMENT '审批时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_username (username),
    UNIQUE KEY uk_email (email),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='注册申请表';

-- 套餐表
CREATE TABLE IF NOT EXISTS plans (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL COMMENT '套餐名称',
    price DECIMAL(10, 2) NOT NULL COMMENT '价格（元）',
    period_word_limit INT UNSIGNED NOT NULL COMMENT '每期字数限额',
    valid_days INT UNSIGNED NOT NULL COMMENT '有效天数',
    features_json TEXT COMMENT '功能特权JSON',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否上架',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='套餐表';

-- 订阅记录表
CREATE TABLE IF NOT EXISTS subscriptions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
    plan_id BIGINT UNSIGNED DEFAULT NULL COMMENT '来源套餐',
    start_at DATETIME NOT NULL COMMENT '开始时间',
    expire_at DATETIME NOT NULL COMMENT '到期时间',
    period_word_limit INT UNSIGNED NOT NULL COMMENT '本期字数上限',
    period_used_words INT UNSIGNED DEFAULT 0 COMMENT '本期已消耗字数',
    status ENUM('active', 'expired', 'cancelled') DEFAULT 'active' COMMENT '状态',
    operator_id BIGINT UNSIGNED DEFAULT NULL COMMENT '开通操作人ID',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_status (tenant_id, status),
    INDEX idx_expire (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅记录表';

-- 标书项目表
CREATE TABLE IF NOT EXISTS projects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '创建用户ID',
    title VARCHAR(255) NOT NULL COMMENT '项目标题',
    tender_file_url VARCHAR(1000) DEFAULT NULL COMMENT '招标文件路径',
    tender_file_name VARCHAR(255) DEFAULT NULL COMMENT '招标文件名',
    tender_file_word_count INT UNSIGNED DEFAULT 0 COMMENT '招标文件字数',
    tender_file_status ENUM('pending', 'uploaded', 'parsed', 'failed') DEFAULT 'pending' COMMENT '文件状态',
    outline_json TEXT COMMENT '大纲JSON',
    template VARCHAR(50) DEFAULT 'government' COMMENT '格式模板',
    target_pages INT UNSIGNED DEFAULT 50 COMMENT '目标页数',
    words_per_page INT UNSIGNED DEFAULT 700 COMMENT '每页字数',
    status ENUM('draft', 'outline_generated', 'format_set', 'generating', 'completed', 'failed', 'cancelled') DEFAULT 'draft' COMMENT '项目状态',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant (tenant_id),
    INDEX idx_user (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='标书项目表';

-- 生成任务表
CREATE TABLE IF NOT EXISTS generation_tasks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL COMMENT '项目ID',
    tenant_id BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
    status ENUM('pending', 'running', 'paused_manual', 'paused_quota', 'completed', 'failed', 'cancelled') DEFAULT 'pending' COMMENT '任务状态',
    pause_reason VARCHAR(50) DEFAULT NULL COMMENT '暂停原因',
    total_chapters INT UNSIGNED DEFAULT 0 COMMENT '总章节数',
    completed_chapters INT UNSIGNED DEFAULT 0 COMMENT '已完成章节数',
    total_words_generated INT UNSIGNED DEFAULT 0 COMMENT '已生成字数',
    rollback_words INT UNSIGNED DEFAULT 0 COMMENT '回滚字数',
    error_message TEXT COMMENT '错误信息',
    started_at DATETIME DEFAULT NULL COMMENT '开始时间',
    completed_at DATETIME DEFAULT NULL COMMENT '完成时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_project (project_id),
    INDEX idx_tenant (tenant_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生成任务表';

-- 章节检查点表
CREATE TABLE IF NOT EXISTS task_checkpoints (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    task_id BIGINT UNSIGNED NOT NULL COMMENT '任务ID',
    chapter_index INT UNSIGNED NOT NULL COMMENT '章节索引',
    chapter_title VARCHAR(255) NOT NULL COMMENT '章节标题',
    content TEXT COMMENT '章节内容',
    word_count INT UNSIGNED DEFAULT 0 COMMENT '字数',
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task (task_id),
    UNIQUE KEY uk_task_chapter (task_id, chapter_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='章节检查点表';

-- 字数流水表
CREATE TABLE IF NOT EXISTS word_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
    subscription_id BIGINT UNSIGNED NOT NULL COMMENT '关联订阅记录',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
    task_id BIGINT UNSIGNED DEFAULT NULL COMMENT '关联任务',
    type ENUM('consume', 'rollback') NOT NULL COMMENT '类型',
    amount INT UNSIGNED NOT NULL COMMENT '数量',
    balance_after INT UNSIGNED NOT NULL COMMENT '剩余额度',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_sub (tenant_id, subscription_id),
    INDEX idx_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字数流水表';

-- LLM配置表
CREATE TABLE IF NOT EXISTS llm_configs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED DEFAULT NULL COMMENT '租户ID，NULL表示全局默认',
    provider VARCHAR(50) NOT NULL COMMENT '供应商',
    base_url VARCHAR(500) DEFAULT NULL COMMENT 'API地址',
    api_key_encrypted VARCHAR(1000) NOT NULL COMMENT '加密的API Key',
    model VARCHAR(100) NOT NULL COMMENT '模型名称',
    usage_type ENUM('analysis', 'generation') NOT NULL COMMENT '用途类型：分析/生成',
    is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tenant_usage (tenant_id, usage_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='LLM配置表';

-- 格式模板表
CREATE TABLE IF NOT EXISTS format_templates (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED DEFAULT NULL COMMENT '租户ID，NULL表示系统预设',
    name VARCHAR(100) NOT NULL COMMENT '模板名称',
    config_json TEXT NOT NULL COMMENT '格式配置JSON',
    is_preset TINYINT(1) DEFAULT 0 COMMENT '是否系统预设',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='格式模板表';

-- 全局设置表
CREATE TABLE IF NOT EXISTS global_settings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL COMMENT '设置键',
    setting_value TEXT COMMENT '设置值',
    description VARCHAR(255) DEFAULT NULL COMMENT '说明',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='全局设置表';

-- 插入默认套餐数据
INSERT INTO plans (name, price, period_word_limit, valid_days, features_json, is_active) VALUES
('基础版', 199.00, 500000, 30, '{"templates": ["standard"], "priority_queue": false, "sla": "normal"}', 1),
('专业版', 599.00, 2000000, 30, '{"templates": ["standard", "custom"], "priority_queue": true, "sla": "high"}', 1),
('企业版', 1999.00, 10000000, 30, '{"templates": ["standard", "custom"], "priority_queue": true, "sla": "premium", "multi_account": true, "api_access": true}', 1);

-- 插入默认格式模板
INSERT INTO format_templates (tenant_id, name, config_json, is_preset) VALUES
(NULL, '政府标准', '{"h1": {"font": "黑体", "size": 16, "align": "center"}, "h2": {"font": "黑体", "size": 14, "align": "left"}, "body": {"font": "宋体", "size": 12, "lineHeight": 1.5}, "page": {"size": "A4", "margin": 2.5}}', 1),
(NULL, '商务简洁', '{"h1": {"font": "Arial", "size": 18, "align": "center", "bold": true}, "h2": {"font": "Arial", "size": 14, "align": "left", "bold": true}, "body": {"font": "Arial", "size": 11, "lineHeight": 1.2}, "page": {"size": "A4", "margin": 2}}', 1),
(NULL, '工程规范', '{"h1": {"font": "黑体", "size": 16, "align": "center", "bold": true}, "h2": {"font": "黑体", "size": 13, "align": "left", "bold": true}, "body": {"font": "仿宋", "size": 12, "lineHeight": 2}, "page": {"size": "A4", "margin": 2.5}}', 1);

-- 插入全局设置
INSERT INTO global_settings (setting_key, setting_value, description) VALUES
('words_per_page', '700', '每页基准字数'),
('max_file_size', '52428800', '最大文件大小（字节）'),
('allowed_file_types', 'pdf,docx,doc', '允许的文件类型');

-- 创建一个默认租户（用于演示）
INSERT INTO tenants (name) VALUES ('默认租户');

-- 创建超级管理员用户（密码: Admin2026!）
INSERT INTO users (tenant_id, username, email, password_hash, name, role, is_first_login, status) VALUES
(1, 'admin', 'admin@bidai.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyY8GKgFWNzW', '系统管理员', 'super_admin', 0, 'active');

-- 为默认租户创建订阅记录（无限额试用订阅）
INSERT INTO subscriptions (tenant_id, plan_id, start_at, expire_at, period_word_limit, period_used_words, status, remark) VALUES
(1, NULL, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 1000000, 0, 'active', '系统赠送的试用订阅');
