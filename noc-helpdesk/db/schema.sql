-- ============================================================
-- SYNOC — NOC Helpdesk System
-- MySQL 8.0 schema: master data, SLA, tickets, users, audit
-- ============================================================

CREATE TABLE IF NOT EXISTS `users` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(50)  NOT NULL,
  `full_name`     VARCHAR(120) NOT NULL,
  `email`         VARCHAR(160) NOT NULL,
  `phone`         VARCHAR(40)  NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role`          ENUM('admin','noc','engineer','viewer') NOT NULL DEFAULT 'noc',
  `department`    VARCHAR(80)  NULL,
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `last_login_at` DATETIME     NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `ix_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- MASTER DATA
-- ---------------------------------------------------------

-- Bookmark migrasi data (marker) — dipakai agar migrasi hanya jalan sekali.
CREATE TABLE IF NOT EXISTS `m_schema_migration` (
  `name`       VARCHAR(80)  NOT NULL,
  `applied_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note`       VARCHAR(255) NULL,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Service type: Access / Backbone / Fishbone / Other
CREATE TABLE IF NOT EXISTS `m_service_type` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(30)  NOT NULL,
  `name`        VARCHAR(80)  NOT NULL,
  `description` VARCHAR(255) NULL,
  `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  `sort_order`  INT          NOT NULL DEFAULT 0,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_service_type_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Customer / client master
CREATE TABLE IF NOT EXISTS `m_customer` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(30)  NOT NULL,
  `name`        VARCHAR(120) NOT NULL,
  `contact_name`  VARCHAR(120) NULL,
  `contact_phone` VARCHAR(40)  NULL,
  `contact_email` VARCHAR(160) NULL,
  `address`     VARCHAR(255) NULL,
  `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ISP (Internet Service Provider) master
CREATE TABLE IF NOT EXISTS `m_isp` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(30)  NOT NULL,
  `name`        VARCHAR(120) NOT NULL,
  `contact_name`  VARCHAR(120) NULL,
  `contact_phone` VARCHAR(40)  NULL,
  `contact_email` VARCHAR(160) NULL,
  `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_isp_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Link master (a physical/ logical link served by an ISP)
CREATE TABLE IF NOT EXISTS `m_link` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(40)  NOT NULL,
  `link_name`   VARCHAR(120) NOT NULL,
  `isp_id`      INT UNSIGNED NULL,
  `customer_id` INT UNSIGNED NULL,
  `cid`         VARCHAR(80)  NULL,
  `bandwidth`   VARCHAR(40)  NULL,
  `media_type`  VARCHAR(60)  NULL,
  `site_a`      VARCHAR(120) NULL,
  `site_b`      VARCHAR(120) NULL,
  `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_link_code` (`code`),
  KEY `ix_link_isp` (`isp_id`),
  KEY `ix_link_customer` (`customer_id`),
  CONSTRAINT `fk_link_isp`      FOREIGN KEY (`isp_id`)      REFERENCES `m_isp` (`id`)      ON DELETE SET NULL,
  CONSTRAINT `fk_link_customer` FOREIGN KEY (`customer_id`) REFERENCES `m_customer` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- POP (Point of Presence) master
CREATE TABLE IF NOT EXISTS `m_pop` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(30)  NOT NULL,
  `name`       VARCHAR(120) NOT NULL,
  `city`       VARCHAR(80)  NULL,
  `province`   VARCHAR(80)  NULL,
  `address`    VARCHAR(255) NULL,
  `lat`        DECIMAL(10,7) NULL,
  `lng`        DECIMAL(10,7) NULL,
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pop_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MS / Splitter master (ONT, splitter, MS)
CREATE TABLE IF NOT EXISTS `m_ms_splitter` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`          VARCHAR(40)  NOT NULL,
  `type`          ENUM('MS','Splitter','ONT','CPE') NOT NULL DEFAULT 'ONT',
  `name`          VARCHAR(120) NOT NULL,
  `pop_id`        INT UNSIGNED NULL,
  `mac_address`   VARCHAR(32)  NULL,
  `serial_number` VARCHAR(80)  NULL,
  `status`        ENUM('active','reserved','decommissioned') NOT NULL DEFAULT 'active',
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ms_code` (`code`),
  KEY `ix_ms_pop` (`pop_id`),
  CONSTRAINT `fk_ms_pop` FOREIGN KEY (`pop_id`) REFERENCES `m_pop` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reporting channel master (Custom / Email / Telegram / WhatsApp / ...)
CREATE TABLE IF NOT EXISTS `m_report_channel` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(30)  NOT NULL,
  `name`       VARCHAR(80)  NOT NULL,
  `icon`       VARCHAR(40)  NULL,
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  `sort_order` INT          NOT NULL DEFAULT 0,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_channel_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PIC master — Person in Charge / penanggung jawab tiket
CREATE TABLE IF NOT EXISTS `m_pic` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(30)  NOT NULL,
  `name`       VARCHAR(120) NOT NULL,
  `position`   VARCHAR(80)  NULL,
  `department` VARCHAR(80)  NULL,
  `phone`      VARCHAR(40)  NULL,
  `email`      VARCHAR(160) NULL,
  `regional`   VARCHAR(80)  NULL,
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pic_code` (`code`),
  KEY `ix_pic_regional` (`regional`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Branch / Cabang master — unit operasional cabang NOC
CREATE TABLE IF NOT EXISTS `m_branch` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(30)  NOT NULL,
  `name`       VARCHAR(120) NOT NULL,
  `regional`   VARCHAR(80)  NULL,
  `city`       VARCHAR(80)  NULL,
  `province`   VARCHAR(80)  NULL,
  `address`    VARCHAR(255) NULL,
  `phone`      VARCHAR(40)  NULL,
  `manager`    VARCHAR(120) NULL,
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_branch_code` (`code`),
  KEY `ix_branch_regional` (`regional`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- SLA
-- ---------------------------------------------------------

-- Priority master — carries the SLA resolution time in hours
CREATE TABLE IF NOT EXISTS `m_priority` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`             VARCHAR(30)  NOT NULL,
  `name`             VARCHAR(40)  NOT NULL,
  `level`            TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `response_hours`   DECIMAL(6,2) NOT NULL DEFAULT 24,
  `resolution_hours` DECIMAL(6,2) NOT NULL DEFAULT 48,
  `color`            VARCHAR(20)  NOT NULL DEFAULT '#64748b',
  `is_active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `sort_order`       INT          NOT NULL DEFAULT 0,
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_priority_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SLA policy — per service type, ties priority to clock rules
CREATE TABLE IF NOT EXISTS `m_sla_policy` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`             VARCHAR(120) NOT NULL,
  `service_type_id`  INT UNSIGNED NOT NULL,
  `priority_id`      INT UNSIGNED NOT NULL,
  `response_hours`   DECIMAL(6,2) NOT NULL,
  `resolution_hours` DECIMAL(6,2) NOT NULL,
  `escalation_hours` DECIMAL(6,2) NULL,
  `pause_on_customer_wait` TINYINT(1) NOT NULL DEFAULT 1,
  `business_hours_only`    TINYINT(1) NOT NULL DEFAULT 0,
  `description`      VARCHAR(255) NULL,
  `is_active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sla_service_priority` (`service_type_id`, `priority_id`),
  KEY `ix_sla_priority` (`priority_id`),
  CONSTRAINT `fk_sla_service`  FOREIGN KEY (`service_type_id`) REFERENCES `m_service_type` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sla_priority` FOREIGN KEY (`priority_id`)      REFERENCES `m_priority` (`id`)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- TICKETS
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS `tickets` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_number`  VARCHAR(30)  NOT NULL,
  `service_type_id` INT UNSIGNED NOT NULL,
  `title`          VARCHAR(255) NOT NULL,
  `description`    TEXT         NULL,

  -- Access / network
  `cid`            VARCHAR(80)  NULL,
  `link_id`        INT UNSIGNED NULL,
  `link_name`      VARCHAR(120) NULL,
  `isp_id`         INT UNSIGNED NULL,
  `isp_name`       VARCHAR(120) NULL,
  `pop_id`         INT UNSIGNED NULL,
  `ms_splitter_id` INT UNSIGNED NULL,

  -- Technical parameters
  `mac_address`    VARCHAR(32)  NULL,
  `serial_number`  VARCHAR(80)  NULL,
  `vlan_id`        VARCHAR(20)  NULL,
  `signal_input_cpe_dbm` DECIMAL(7,2) NULL,
  `latitude`       DECIMAL(10,7) NULL,
  `longitude`      DECIMAL(10,7) NULL,

  -- General info
  `priority_id`    INT UNSIGNED NOT NULL,
  `channel_id`     INT UNSIGNED NULL,
  `customer_id`    INT UNSIGNED NULL,
  `customer_name`  VARCHAR(120) NULL,
  `pic_id`         INT UNSIGNED NULL,
  `branch_id`      INT UNSIGNED NULL,
  `reported_by`    VARCHAR(120) NULL,

  -- Workflow
  `status`         ENUM('open','in_progress','pending_customer','escalated','resolved','closed','cancelled') NOT NULL DEFAULT 'open',
  `assigned_to`    BIGINT UNSIGNED NULL,
  `regional`       VARCHAR(80)  NULL,
  `resolution_note` TEXT        NULL,
  `root_cause`     VARCHAR(255) NULL,
  `closed_at`      DATETIME     NULL,
  `created_by`     BIGINT UNSIGNED NULL,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ticket_number` (`ticket_number`),
  KEY `ix_ticket_status` (`status`),
  KEY `ix_ticket_priority` (`priority_id`),
  KEY `ix_ticket_service_type` (`service_type_id`),
  KEY `ix_ticket_assigned` (`assigned_to`),
  KEY `ix_ticket_created` (`created_at`),
  KEY `ix_ticket_cid` (`cid`),
  KEY `ix_ticket_channel` (`channel_id`),
  KEY `ix_ticket_branch` (`branch_id`),
  CONSTRAINT `fk_ticket_service`   FOREIGN KEY (`service_type_id`) REFERENCES `m_service_type` (`id`),
  CONSTRAINT `fk_ticket_priority`  FOREIGN KEY (`priority_id`)      REFERENCES `m_priority` (`id`),
  CONSTRAINT `fk_ticket_link`      FOREIGN KEY (`link_id`)          REFERENCES `m_link` (`id`)         ON DELETE SET NULL,
  CONSTRAINT `fk_ticket_isp`       FOREIGN KEY (`isp_id`)           REFERENCES `m_isp` (`id`)          ON DELETE SET NULL,
  CONSTRAINT `fk_ticket_pop`       FOREIGN KEY (`pop_id`)           REFERENCES `m_pop` (`id`)          ON DELETE SET NULL,
  CONSTRAINT `fk_ticket_ms`        FOREIGN KEY (`ms_splitter_id`)   REFERENCES `m_ms_splitter` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ticket_channel`   FOREIGN KEY (`channel_id`)       REFERENCES `m_report_channel` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ticket_customer`  FOREIGN KEY (`customer_id`)      REFERENCES `m_customer` (`id`)    ON DELETE SET NULL,
  CONSTRAINT `fk_ticket_pic`       FOREIGN KEY (`pic_id`)           REFERENCES `m_pic` (`id`)        ON DELETE SET NULL,  CONSTRAINT `fk_ticket_branch`    FOREIGN KEY (`branch_id`)     REFERENCES `m_branch` (`id`)     ON DELETE SET NULL,  CONSTRAINT `fk_ticket_assignee`  FOREIGN KEY (`assigned_to`)      REFERENCES `users` (`id`)         ON DELETE SET NULL,
  CONSTRAINT `fk_ticket_creator`   FOREIGN KEY (`created_by`)       REFERENCES `users` (`id`)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SLA clock table — records the actual due dates computed per ticket.
-- Created after `tickets` because it holds a foreign key to it.
CREATE TABLE IF NOT EXISTS `ticket_sla` (
  `ticket_id`            BIGINT UNSIGNED NOT NULL,
  `sla_policy_id`        INT UNSIGNED NULL,
  `priority_id`          INT UNSIGNED NOT NULL,
  `response_due_at`      DATETIME NULL,
  `resolution_due_at`    DATETIME NULL,
  `first_response_at`    DATETIME NULL,
  `resolved_at`          DATETIME NULL,
  `response_breached`    TINYINT(1) NOT NULL DEFAULT 0,
  `resolution_breached`  TINYINT(1) NOT NULL DEFAULT 0,
  `paused_at`            DATETIME NULL,
  `paused_minutes`       INT NOT NULL DEFAULT 0,
  `updated_at`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ticket_id`),
  KEY `ix_sla_resolution_due` (`resolution_due_at`),
  CONSTRAINT `fk_sla_ticket`       FOREIGN KEY (`ticket_id`)    REFERENCES `tickets` (`id`)    ON DELETE CASCADE,
  CONSTRAINT `fk_sla_policy`       FOREIGN KEY (`sla_policy_id`) REFERENCES `m_sla_policy` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ticket_sla_priority` FOREIGN KEY (`priority_id`) REFERENCES `m_priority` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket timeline / activity log
CREATE TABLE IF NOT EXISTS `ticket_events` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id`   BIGINT UNSIGNED NOT NULL,
  `event_type`  ENUM('created','status_change','assigned','priority_change','note','sla_breach','comment','attachment','field_update') NOT NULL,
  `from_value`  VARCHAR(255) NULL,
  `to_value`    VARCHAR(255) NULL,
  `note`        TEXT NULL,
  `created_by`  BIGINT UNSIGNED NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_event_ticket` (`ticket_id`, `created_at`),
  CONSTRAINT `fk_event_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_event_user`   FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lampiran (gambar) pada catatan timeline
CREATE TABLE IF NOT EXISTS `ticket_event_attachments` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_id`    BIGINT UNSIGNED NOT NULL,
  `ticket_id`   BIGINT UNSIGNED NOT NULL,
  `file_name`   VARCHAR(255) NOT NULL,
  `stored_name` VARCHAR(255) NOT NULL,
  `mime_type`   VARCHAR(120) NOT NULL,
  `size_bytes`  INT UNSIGNED  NOT NULL DEFAULT 0,
  `created_by`  BIGINT UNSIGNED NULL,
  `created_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attachment_stored` (`stored_name`),
  KEY `ix_attachment_event` (`event_id`),
  KEY `ix_attachment_ticket` (`ticket_id`),
  CONSTRAINT `fk_attachment_event`  FOREIGN KEY (`event_id`)  REFERENCES `ticket_events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attachment_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`)       ON DELETE CASCADE,
  CONSTRAINT `fk_attachment_user`   FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit trail for master-data changes
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `entity`      VARCHAR(60)  NOT NULL,
  `entity_id`   VARCHAR(60)  NULL,
  `action`      ENUM('create','update','delete','login','logout') NOT NULL,
  `changes`     JSON         NULL,
  `created_by`  BIGINT UNSIGNED NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_audit_entity` (`entity`, `entity_id`),
  KEY `ix_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- SLA helper views
-- ---------------------------------------------------------

CREATE OR REPLACE VIEW `v_ticket_sla_status` AS
SELECT
  t.id                AS ticket_id,
  t.ticket_number,
  t.title,
  t.status,
  t.service_type_id,
  t.priority_id,
  p.code              AS priority_code,
  p.name              AS priority_name,
  s.response_due_at,
  s.resolution_due_at,
  s.first_response_at,
  s.resolved_at,
  s.response_breached,
  s.resolution_breached,
  t.created_at,
  TIMESTAMPDIFF(MINUTE, t.created_at, s.resolution_due_at) AS total_minutes,
  TIMESTAMPDIFF(MINUTE, t.created_at, COALESCE(s.first_response_at, NOW())) AS elapsed_minutes,
  CASE
    WHEN t.status IN ('resolved','closed','cancelled') THEN
      CASE WHEN s.resolved_at IS NOT NULL AND s.resolved_at > s.resolution_due_at THEN 1 ELSE 0 END
    WHEN NOW() > s.resolution_due_at THEN 1
    ELSE 0
  END AS is_breached,
  CASE
    WHEN t.status IN ('resolved','closed','cancelled') THEN
      CASE WHEN s.resolved_at IS NOT NULL AND s.resolved_at <= s.resolution_due_at THEN 1 ELSE 0 END
    ELSE 0
  END AS is_met
FROM tickets t
JOIN m_priority p        ON p.id = t.priority_id
LEFT JOIN ticket_sla s   ON s.ticket_id = t.id;

CREATE OR REPLACE VIEW `v_ticket_list` AS
SELECT
  t.*,
  st.code  AS service_type_code,
  st.name  AS service_type_name,
  p.name   AS priority_name,
  p.code   AS priority_code,
  p.color  AS priority_color,
  p.resolution_hours AS sla_resolution_hours,
  ch.name  AS channel_name,
  ch.code  AS channel_code,
  c.name   AS customer_name_master,
  po.name  AS pop_name,
  po.code  AS pop_code,
  ms.name  AS ms_splitter_name,
  ms.type  AS ms_splitter_type,
  pic.name AS pic_name,
  pic.code AS pic_code,
  br.name AS branch_name,
  br.code AS branch_code,
  u.full_name AS assignee_name,
  sla.response_due_at,
  sla.resolution_due_at,
  sla.first_response_at,
  sla.resolved_at,
  sla.response_breached,
  sla.resolution_breached,
  sla.paused_minutes,
  (sla.resolution_due_at IS NOT NULL AND NOW() > sla.resolution_due_at
     AND t.status NOT IN ('resolved','closed','cancelled')) AS sla_overdue,
  (sla.resolution_due_at IS NOT NULL AND t.status NOT IN ('resolved','closed','cancelled')
     AND NOT (sla.resolution_due_at < NOW())) AS sla_running
FROM tickets t
JOIN m_service_type st        ON st.id = t.service_type_id
JOIN m_priority p             ON p.id  = t.priority_id
LEFT JOIN m_report_channel ch ON ch.id = t.channel_id
LEFT JOIN m_customer c        ON c.id  = t.customer_id
LEFT JOIN m_pop po            ON po.id = t.pop_id
LEFT JOIN m_ms_splitter ms    ON ms.id = t.ms_splitter_id
LEFT JOIN m_pic pic           ON pic.id = t.pic_id
LEFT JOIN m_branch br         ON br.id  = t.branch_id
LEFT JOIN users u             ON u.id  = t.assigned_to
LEFT JOIN ticket_sla sla      ON sla.ticket_id = t.id;
