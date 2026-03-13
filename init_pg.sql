-- PostgreSQL 初始化脚本 for 智能投标系统

-- 租户表
CREATE TABLE tenants (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 用户表
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',
    is_first_login BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
);

-- 注册申请表
CREATE TABLE user_register_requests (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    remark VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 套餐表
CREATE TABLE plans (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) DEFAULT 0,
    valid_days INT DEFAULT 30,
    word_limit INT DEFAULT 100000,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 订阅表
CREATE TABLE subscriptions (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    plan_id BIGINT,
    start_at TIMESTAMP NOT NULL,
    expire_at TIMESTAMP NOT NULL,
    period_word_limit INT DEFAULT 0,
    period_used_words INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    operator_id BIGINT,
    remark VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL,
    FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL
);

-- LLM配置表
CREATE TABLE llm_configs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT DEFAULT NULL,
    provider VARCHAR(50) NOT NULL,
    base_url VARCHAR(500),
    api_key_encrypted VARCHAR(1000) NOT NULL,
    model VARCHAR(100) NOT NULL,
    usage_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, usage_type)
);

-- 项目表
CREATE TABLE projects (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    tender_file_path VARCHAR(500),
    tender_content TEXT,
    outline JSONB,
    format_config JSONB,
    target_pages INT DEFAULT 50,
    status VARCHAR(20) DEFAULT 'draft',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 任务表
CREATE TABLE generation_tasks (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    tenant_id BIGINT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    total_chapters INT DEFAULT 0,
    completed_chapters INT DEFAULT 0,
    error_message TEXT,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 检查点表
CREATE TABLE task_checkpoints (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL,
    chapter_index INT NOT NULL,
    chapter_title VARCHAR(200),
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES generation_tasks(id) ON DELETE CASCADE
);

-- 字数流水表
CREATE TABLE word_transactions (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    subscription_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    task_id BIGINT,
    type VARCHAR(20) NOT NULL,
    amount INT NOT NULL,
    balance_after INT NOT NULL,
    remark VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES generation_tasks(id) ON DELETE SET NULL
);

-- 系统配置表
CREATE TABLE system_configs (
    id BIGSERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value VARCHAR(500),
    description VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_projects_tenant ON projects(tenant_id);
CREATE INDEX idx_tasks_project ON generation_tasks(project_id);
CREATE INDEX idx_tasks_status ON generation_tasks(status);
CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);

-- 插入默认套餐
INSERT INTO plans (name, description, price, valid_days, word_limit, status) VALUES
('基础版', '适合个人用户', 0, 30, 50000, 'active'),
('专业版', '适合小企业', 99, 30, 200000, 'active'),
('企业版', '适合大企业', 299, 30, 1000000, 'active');

-- 插入默认租户
INSERT INTO tenants (name) VALUES ('默认租户');

-- 插入超级管理员 (密码: Admin2026!)
INSERT INTO users (tenant_id, username, email, password_hash, name, role, is_first_login, status) VALUES
(1, 'admin', 'admin@bidai.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyY8GKgFWNzW', '系统管理员', 'super_admin', false, 'active');

-- 插入系统配置
INSERT INTO system_configs (config_key, config_value, description) VALUES
('words_per_page', '700', '每页基准字数'),
('max_file_size', '52428800', '最大文件大小（字节）'),
('allowed_file_types', 'pdf,docx,doc', '允许的文件类型');
