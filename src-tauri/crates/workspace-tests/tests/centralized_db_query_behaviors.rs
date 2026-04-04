use std::{fs, path::PathBuf};

use ctxrun_db::{AppEntry, apps::sync_scanned_apps, secrets::get_all_ignored_values_internal};
use rusqlite::{Connection, params};

fn read_db_migration(name: &str) -> String {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let crates_dir = manifest_dir
        .parent()
        .expect("workspace-tests should be inside crates/");
    let migration_path = crates_dir.join("db").join("migrations").join(name);
    fs::read_to_string(&migration_path).unwrap_or_else(|e| {
        panic!(
            "failed to read migration file {}: {}",
            migration_path.display(),
            e
        )
    })
}

fn apply_migration(conn: &Connection, name: &str) {
    let sql = read_db_migration(name);
    conn.execute_batch(&sql)
        .unwrap_or_else(|e| panic!("failed to apply {name}: {e}"));
}

fn insert_prompt(
    conn: &Connection,
    id: &str,
    title: &str,
    group_name: &str,
    type_: Option<&str>,
    use_as_chat_template: i64,
) {
    conn.execute(
        "INSERT INTO prompts (
            id, title, content, group_name, description, tags,
            is_favorite, created_at, updated_at, source, pack_id, original_id, type,
            is_executable, shell_type, use_as_chat_template
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 1, 1, 'local', NULL, NULL, ?7, 0, NULL, ?8)",
        params![
            id,
            title,
            format!("content-{id}"),
            group_name,
            "",
            "[]",
            type_,
            use_as_chat_template
        ],
    )
    .expect("insert prompt");
}

#[allow(clippy::too_many_arguments)]
fn insert_prompt_row(
    conn: &Connection,
    id: &str,
    title: &str,
    content: &str,
    group_name: &str,
    description: Option<&str>,
    type_: Option<&str>,
    is_favorite: i64,
    created_at: i64,
    updated_at: i64,
) {
    conn.execute(
        "INSERT INTO prompts (
            id, title, content, group_name, description, tags,
            is_favorite, created_at, updated_at, source, pack_id, original_id, type,
            is_executable, shell_type, use_as_chat_template
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'local', NULL, NULL, ?10, 0, NULL, 0)",
        params![
            id,
            title,
            content,
            group_name,
            description,
            "[]",
            is_favorite,
            created_at,
            updated_at,
            type_
        ],
    )
    .expect("insert prompt row");
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct TestProjectConfig {
    dirs: Vec<String>,
    files: Vec<String>,
    extensions: Vec<String>,
}

#[derive(Debug, Clone)]
struct TestProjectConfigExportItem {
    path: String,
    config: TestProjectConfig,
    updated_at: i64,
}

fn insert_project_config(conn: &Connection, path: &str, config_json: &str, updated_at: i64) {
    conn.execute(
        "INSERT INTO project_configs (path, config, updated_at) VALUES (?1, ?2, ?3)",
        params![path, config_json, updated_at],
    )
    .expect("insert project config");
}

fn insert_app(
    conn: &Connection,
    path: &str,
    name: &str,
    keywords: Option<&str>,
    usage_count: i64,
    last_used_at: i64,
) {
    conn.execute(
        "INSERT INTO apps (path, name, keywords, icon, usage_count, last_used_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            path,
            name,
            keywords,
            Option::<String>::None,
            usage_count,
            last_used_at
        ],
    )
    .expect("insert app row");
}

fn parse_project_config_or_default(config_json: &str) -> TestProjectConfig {
    let value = match serde_json::from_str::<serde_json::Value>(config_json) {
        Ok(v) => v,
        Err(_) => return TestProjectConfig::default(),
    };

    let as_strings = |key: &str| -> Vec<String> {
        value
            .get(key)
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str().map(ToString::to_string))
                    .collect()
            })
            .unwrap_or_default()
    };

    TestProjectConfig {
        dirs: as_strings("dirs"),
        files: as_strings("files"),
        extensions: as_strings("extensions"),
    }
}

fn project_config_to_json(config: &TestProjectConfig) -> String {
    serde_json::json!({
        "dirs": config.dirs,
        "files": config.files,
        "extensions": config.extensions
    })
    .to_string()
}

#[test]
fn centralized_db_prompt_counts_treats_null_type_as_prompt() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_prompt(&conn, "p1", "Prompt One", "Default", Some("prompt"), 0);
    insert_prompt(&conn, "p2", "Null Type Prompt", "Default", None, 0);
    insert_prompt(&conn, "c1", "Command One", "Default", Some("command"), 0);

    let (command_count, prompt_count): (i64, i64) = conn
        .query_row(
            "SELECT
                COUNT(CASE WHEN type = 'command' THEN 1 END),
                COUNT(CASE WHEN type = 'prompt' OR type IS NULL THEN 1 END)
             FROM prompts",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("query prompt counts");

    assert_eq!(command_count, 1);
    assert_eq!(prompt_count, 2);
}

#[test]
fn centralized_db_prompt_groups_query_returns_sorted_distinct() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_prompt(&conn, "a", "A", "Zeta", Some("prompt"), 0);
    insert_prompt(&conn, "b", "B", "Alpha", Some("prompt"), 0);
    insert_prompt(&conn, "c", "C", "Zeta", Some("command"), 0);

    let mut stmt = conn
        .prepare("SELECT DISTINCT group_name FROM prompts ORDER BY group_name")
        .expect("prepare group query");
    let groups = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query groups")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect groups");

    assert_eq!(groups, vec!["Alpha".to_string(), "Zeta".to_string()]);
}

#[test]
fn centralized_db_chat_templates_query_filters_and_orders_by_title() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_prompt(
        &conn,
        "t1",
        "Charlie Template",
        "Default",
        Some("prompt"),
        1,
    );
    insert_prompt(&conn, "t2", "Alpha Template", "Default", Some("prompt"), 1);
    insert_prompt(&conn, "n1", "Normal Prompt", "Default", Some("prompt"), 0);

    let mut stmt = conn
        .prepare(
            "SELECT title FROM prompts
             WHERE use_as_chat_template = 1
             ORDER BY title ASC",
        )
        .expect("prepare chat template query");
    let titles = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query chat templates")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect chat templates");

    assert_eq!(
        titles,
        vec!["Alpha Template".to_string(), "Charlie Template".to_string()]
    );
}

#[test]
fn centralized_db_shell_history_upsert_increments_execution_count() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V2__shell_history.sql");

    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count)
         VALUES (?1, ?2, 1)
         ON CONFLICT(command) DO UPDATE SET
           execution_count = execution_count + 1,
           timestamp = ?2",
        params!["npm test", 100_i64],
    )
    .expect("insert shell command");

    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count)
         VALUES (?1, ?2, 1)
         ON CONFLICT(command) DO UPDATE SET
           execution_count = execution_count + 1,
           timestamp = ?2",
        params!["npm test", 200_i64],
    )
    .expect("upsert shell command");

    let (execution_count, timestamp): (i64, i64) = conn
        .query_row(
            "SELECT execution_count, timestamp FROM shell_history WHERE command = ?1",
            params!["npm test"],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("query upserted shell command");

    assert_eq!(execution_count, 2);
    assert_eq!(timestamp, 200);
}

#[test]
fn centralized_db_shell_history_keyword_search_requires_all_keywords() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V2__shell_history.sql");

    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["git commit -m test", 100_i64, 1_i64],
    )
    .expect("insert command 1");
    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["git push origin main", 99_i64, 1_i64],
    )
    .expect("insert command 2");
    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["npm test", 98_i64, 1_i64],
    )
    .expect("insert command 3");

    let keywords = ["git", "commit"];
    let mut sql = String::from("SELECT command FROM shell_history WHERE ");
    sql.push_str(
        &keywords
            .iter()
            .map(|_| "command LIKE ?")
            .collect::<Vec<_>>()
            .join(" AND "),
    );
    sql.push_str(" ORDER BY timestamp DESC");

    let mut stmt = conn.prepare(&sql).expect("prepare keyword search");
    let commands = stmt
        .query_map(params!["%git%", "%commit%"], |row| row.get::<_, String>(0))
        .expect("query keyword search")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect keyword search");

    assert_eq!(commands, vec!["git commit -m test".to_string()]);
}

#[test]
fn centralized_db_url_history_short_query_sorts_by_visit_count_then_recent() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    conn.execute(
        "INSERT INTO url_history (url, title, visit_count, last_visit) VALUES (?1, ?2, ?3, ?4)",
        params!["https://example.com/a", "Example A", 5_i64, 100_i64],
    )
    .expect("insert url a");
    conn.execute(
        "INSERT INTO url_history (url, title, visit_count, last_visit) VALUES (?1, ?2, ?3, ?4)",
        params!["https://example.com/b", "Example B", 5_i64, 200_i64],
    )
    .expect("insert url b");
    conn.execute(
        "INSERT INTO url_history (url, title, visit_count, last_visit) VALUES (?1, ?2, ?3, ?4)",
        params!["https://example.com/c", "Example C", 9_i64, 50_i64],
    )
    .expect("insert url c");

    let like_query = "%ex%";
    let mut stmt = conn
        .prepare(
            "SELECT url FROM url_history
             WHERE (url LIKE ?1 OR title LIKE ?1)
             ORDER BY visit_count DESC, last_visit DESC
             LIMIT 5",
        )
        .expect("prepare short query search");
    let urls = stmt
        .query_map(params![like_query], |row| row.get::<_, String>(0))
        .expect("query short query search")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect short query results");

    assert_eq!(
        urls,
        vec![
            "https://example.com/c".to_string(),
            "https://example.com/b".to_string(),
            "https://example.com/a".to_string()
        ]
    );
}

#[test]
fn centralized_db_url_history_fts_query_handles_quoted_input() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    conn.execute(
        "INSERT INTO url_history (url, title, visit_count, last_visit) VALUES (?1, ?2, ?3, ?4)",
        params!["https://example.com", "Example Domain", 1_i64, 100_i64],
    )
    .expect("insert example url");
    conn.execute(
        "INSERT INTO url_history (url, title, visit_count, last_visit) VALUES (?1, ?2, ?3, ?4)",
        params!["https://rust-lang.org", "Rust", 1_i64, 90_i64],
    )
    .expect("insert rust url");

    let clean_query = "\"Example\"".replace('"', "");
    let fts_query = format!("\"{}\"", clean_query);

    let mut stmt = conn
        .prepare(
            "SELECT h.url
             FROM url_history h
             JOIN url_history_fts f ON h.url = f.url
             WHERE url_history_fts MATCH ?1
             ORDER BY h.visit_count DESC, h.last_visit DESC
             LIMIT 5",
        )
        .expect("prepare fts query");
    let urls = stmt
        .query_map(params![fts_query], |row| row.get::<_, String>(0))
        .expect("query fts results")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect fts results");

    assert!(
        urls.iter().any(|u| u == "https://example.com"),
        "quoted input should be sanitized and still match expected url"
    );
}

#[test]
fn centralized_db_prompt_category_prompt_includes_null_and_prompt_only() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_prompt(&conn, "p1", "Prompt Type", "Default", Some("prompt"), 0);
    insert_prompt(&conn, "p2", "Null Type", "Default", None, 0);
    insert_prompt(&conn, "c1", "Command Type", "Default", Some("command"), 0);

    let mut stmt = conn
        .prepare(
            "SELECT id FROM prompts
             WHERE (type = 'prompt' OR type IS NULL)
             ORDER BY id",
        )
        .expect("prepare prompt category filter query");
    let ids = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query prompt category filter")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect prompt category ids");

    assert_eq!(ids, vec!["p1".to_string(), "p2".to_string()]);
}

#[test]
fn centralized_db_project_config_export_falls_back_to_default_when_json_is_invalid() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_project_config(
        &conn,
        "/valid",
        r#"{"dirs":["src"],"files":["README.md"],"extensions":["rs"]}"#,
        100_i64,
    );
    insert_project_config(&conn, "/broken", "{not-json", 200_i64);

    let mut stmt = conn
        .prepare("SELECT path, config, updated_at FROM project_configs ORDER BY path ASC")
        .expect("prepare project config export query");

    let rows = stmt
        .query_map([], |row| {
            let path: String = row.get(0)?;
            let config_str: String = row.get(1)?;
            let updated_at: i64 = row.get(2)?;
            let config = parse_project_config_or_default(&config_str);
            Ok(TestProjectConfigExportItem {
                path,
                config,
                updated_at,
            })
        })
        .expect("query project config export rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect project config export rows");

    assert_eq!(rows.len(), 2);

    let broken = rows
        .iter()
        .find(|x| x.path == "/broken")
        .expect("broken config should exist");
    assert_eq!(
        broken.config,
        TestProjectConfig::default(),
        "invalid config JSON should fallback to empty config shape"
    );
}

#[test]
fn centralized_db_project_config_import_overwrite_replaces_existing_rows() {
    let mut conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_project_config(
        &conn,
        "/old-1",
        r#"{"dirs":["a"],"files":[],"extensions":[]}"#,
        10_i64,
    );
    insert_project_config(
        &conn,
        "/old-2",
        r#"{"dirs":["b"],"files":[],"extensions":[]}"#,
        20_i64,
    );

    let import_list = vec![TestProjectConfigExportItem {
        path: "/new".to_string(),
        config: TestProjectConfig {
            dirs: vec!["new-dir".to_string()],
            files: vec!["new-file".to_string()],
            extensions: vec!["rs".to_string()],
        },
        updated_at: 999_i64,
    }];

    let tx = conn.transaction().expect("open transaction");
    tx.execute("DELETE FROM project_configs", [])
        .expect("overwrite should clear table first");
    {
        let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO project_configs (path, config, updated_at) VALUES (?1, ?2, ?3)",
            )
            .expect("prepare import statement");
        for item in import_list {
            let config_json = project_config_to_json(&item.config);
            stmt.execute(params![item.path, config_json, item.updated_at])
                .expect("import project config row");
        }
    }
    tx.commit().expect("commit transaction");

    let paths = conn
        .prepare("SELECT path FROM project_configs ORDER BY path ASC")
        .expect("prepare path query")
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query paths")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect paths");

    assert_eq!(
        paths,
        vec!["/new".to_string()],
        "overwrite mode should remove previously existing rows"
    );
}

#[test]
fn centralized_db_project_config_import_merge_keeps_existing_and_upserts_conflicts() {
    let mut conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_project_config(
        &conn,
        "/existing",
        r#"{"dirs":["old"],"files":[],"extensions":[]}"#,
        1_i64,
    );

    let import_list = vec![
        TestProjectConfigExportItem {
            path: "/existing".to_string(),
            config: TestProjectConfig {
                dirs: vec!["updated".to_string()],
                files: vec![],
                extensions: vec![],
            },
            updated_at: 2_i64,
        },
        TestProjectConfigExportItem {
            path: "/new".to_string(),
            config: TestProjectConfig {
                dirs: vec!["new".to_string()],
                files: vec!["new.toml".to_string()],
                extensions: vec!["toml".to_string()],
            },
            updated_at: 3_i64,
        },
    ];

    let tx = conn.transaction().expect("open transaction");
    {
        let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO project_configs (path, config, updated_at) VALUES (?1, ?2, ?3)",
            )
            .expect("prepare merge statement");
        for item in import_list {
            let config_json = project_config_to_json(&item.config);
            stmt.execute(params![item.path, config_json, item.updated_at])
                .expect("merge project config row");
        }
    }
    tx.commit().expect("commit transaction");

    let total_rows: i64 = conn
        .query_row("SELECT COUNT(*) FROM project_configs", [], |row| row.get(0))
        .expect("count project config rows");
    assert_eq!(total_rows, 2);

    let existing_json: String = conn
        .query_row(
            "SELECT config FROM project_configs WHERE path = ?1",
            params!["/existing"],
            |row| row.get(0),
        )
        .expect("query existing row");
    let existing_cfg = parse_project_config_or_default(&existing_json);
    assert_eq!(existing_cfg.dirs, vec!["updated".to_string()]);
}

#[test]
fn centralized_db_ignored_secrets_insert_or_ignore_deduplicates_by_value() {
    let mut conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    let tx = conn.transaction().expect("open transaction");
    {
        let mut stmt = tx
            .prepare(
                "INSERT OR IGNORE INTO ignored_secrets (id, value, rule_id, created_at) VALUES (?1, ?2, ?3, ?4)",
            )
            .expect("prepare insert ignored secret");

        stmt.execute(params!["id-1", "token-1", Option::<String>::None, 10_i64])
            .expect("insert token-1 first");
        stmt.execute(params!["id-2", "token-1", Option::<String>::None, 20_i64])
            .expect("insert duplicate token-1 should be ignored");
        stmt.execute(params!["id-3", "token-2", Some("RULE".to_string()), 30_i64])
            .expect("insert token-2");
    }
    tx.commit().expect("commit transaction");

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM ignored_secrets", [], |row| row.get(0))
        .expect("count ignored secrets");
    assert_eq!(count, 2, "duplicate value should be ignored");

    let original_id: String = conn
        .query_row(
            "SELECT id FROM ignored_secrets WHERE value = ?1",
            params!["token-1"],
            |row| row.get(0),
        )
        .expect("query token-1 owner id");
    assert_eq!(
        original_id, "id-1",
        "first insert should be kept when duplicate value appears later"
    );
}

#[test]
fn centralized_db_ignored_secrets_query_orders_by_created_at_desc() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    conn.execute(
        "INSERT INTO ignored_secrets (id, value, rule_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params!["id-1", "v1", Option::<String>::None, 100_i64],
    )
    .expect("insert v1");
    conn.execute(
        "INSERT INTO ignored_secrets (id, value, rule_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params!["id-2", "v2", Some("R2".to_string()), 300_i64],
    )
    .expect("insert v2");
    conn.execute(
        "INSERT INTO ignored_secrets (id, value, rule_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params!["id-3", "v3", Option::<String>::None, 200_i64],
    )
    .expect("insert v3");

    let ids = conn
        .prepare(
            "SELECT id FROM ignored_secrets
             ORDER BY created_at DESC",
        )
        .expect("prepare ignored secrets order query")
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query ignored secrets order")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect ignored secret ids");

    assert_eq!(
        ids,
        vec!["id-2".to_string(), "id-3".to_string(), "id-1".to_string()]
    );
}

#[test]
fn centralized_db_ignored_secrets_delete_removes_only_target_row() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    conn.execute(
        "INSERT INTO ignored_secrets (id, value, rule_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params!["id-keep", "keep", Option::<String>::None, 1_i64],
    )
    .expect("insert keep row");
    conn.execute(
        "INSERT INTO ignored_secrets (id, value, rule_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params!["id-del", "delete-me", Option::<String>::None, 2_i64],
    )
    .expect("insert delete row");

    conn.execute(
        "DELETE FROM ignored_secrets WHERE id = ?1",
        params!["id-del"],
    )
    .expect("delete target row");

    let remaining = conn
        .prepare("SELECT id FROM ignored_secrets ORDER BY id ASC")
        .expect("prepare remaining row query")
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query remaining rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect remaining rows");

    assert_eq!(remaining, vec!["id-keep".to_string()]);
}

#[test]
fn centralized_db_sync_scanned_apps_non_empty_scan_deletes_stale_and_inserts_new() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_app(
        &conn,
        "C:/apps/keep.exe",
        "KeepApp",
        Some("keep"),
        9_i64,
        123_i64,
    );
    insert_app(
        &conn,
        "C:/apps/stale.exe",
        "StaleApp",
        Some("stale"),
        3_i64,
        100_i64,
    );

    let scanned = vec![
        AppEntry {
            name: "KeepApp".to_string(),
            path: "C:/apps/keep.exe".to_string(),
            icon: None,
            usage_count: 0,
        },
        AppEntry {
            name: "NewApp".to_string(),
            path: "C:/apps/new.exe".to_string(),
            icon: None,
            usage_count: 0,
        },
    ];

    let count = sync_scanned_apps(&conn, scanned).expect("sync scanned apps");
    assert_eq!(count, 2, "return value should match scanned list length");

    let rows = conn
        .prepare("SELECT path, usage_count FROM apps ORDER BY path ASC")
        .expect("prepare apps row query")
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .expect("query apps rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect app rows");

    assert_eq!(
        rows,
        vec![
            ("C:/apps/keep.exe".to_string(), 9_i64),
            ("C:/apps/new.exe".to_string(), 0_i64),
        ],
        "sync should remove stale rows, preserve kept usage_count, and add new rows with usage_count=0"
    );
}

#[test]
fn centralized_db_sync_scanned_apps_empty_scan_preserves_existing_rows() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_app(
        &conn,
        "C:/apps/existing.exe",
        "ExistingApp",
        Some("existing"),
        5_i64,
        999_i64,
    );

    let count = sync_scanned_apps(&conn, Vec::new()).expect("sync empty scanned app list");
    assert_eq!(count, 0);

    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM apps", [], |row| row.get(0))
        .expect("count apps after empty scan");
    assert_eq!(
        total, 1,
        "empty scan should not delete existing rows to avoid accidental data loss"
    );
}

#[test]
fn centralized_db_apps_search_query_orders_by_usage_then_name_and_limits_to_10() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    for i in 0..12_i64 {
        let name = format!("Builder{:02}", i);
        let path = format!("C:/apps/{name}.exe");
        insert_app(
            &conn,
            &path,
            &name,
            Some("builder keyword"),
            if i < 3 { 20_i64 } else { 10_i64 - (i % 10) },
            i,
        );
    }

    let query = "%builder%";
    let rows = conn
        .prepare(
            "SELECT name FROM apps
             WHERE name LIKE ?1 OR keywords LIKE ?1
             ORDER BY usage_count DESC, name ASC
             LIMIT 10",
        )
        .expect("prepare app search query")
        .query_map(params![query], |row| row.get::<_, String>(0))
        .expect("query app search rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect app search rows");

    assert_eq!(rows.len(), 10);
    assert_eq!(
        &rows[0..3],
        &[
            "Builder00".to_string(),
            "Builder01".to_string(),
            "Builder02".to_string()
        ],
        "same usage_count should be tie-broken by name ASC"
    );
}

#[test]
fn centralized_db_url_history_empty_query_orders_by_last_visit_desc_and_limits_10() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    for i in 0..12_i64 {
        conn.execute(
            "INSERT INTO url_history (url, title, visit_count, last_visit) VALUES (?1, ?2, ?3, ?4)",
            params![
                format!("https://example.com/{i}"),
                format!("Example {i}"),
                1_i64,
                100_i64 + i
            ],
        )
        .expect("insert url row");
    }

    let rows = conn
        .prepare(
            "SELECT url FROM url_history
             ORDER BY last_visit DESC LIMIT 10",
        )
        .expect("prepare empty-query url history SQL")
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query empty-query url history SQL")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect url rows");

    assert_eq!(rows.len(), 10);
    assert_eq!(rows[0], "https://example.com/11".to_string());
    assert_eq!(rows[9], "https://example.com/2".to_string());
}

#[test]
fn centralized_db_shell_history_recent_query_orders_by_timestamp_desc_and_limits() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V2__shell_history.sql");

    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["cmd-100", 100_i64, 1_i64],
    )
    .expect("insert cmd-100");
    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["cmd-300", 300_i64, 1_i64],
    )
    .expect("insert cmd-300");
    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["cmd-200", 200_i64, 1_i64],
    )
    .expect("insert cmd-200");
    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["cmd-400", 400_i64, 1_i64],
    )
    .expect("insert cmd-400");

    let commands = conn
        .prepare(
            "SELECT command FROM shell_history
             ORDER BY timestamp DESC
             LIMIT ?1",
        )
        .expect("prepare recent shell history SQL")
        .query_map(params![3_i64], |row| row.get::<_, String>(0))
        .expect("query recent shell history SQL")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect recent shell commands");

    assert_eq!(
        commands,
        vec![
            "cmd-400".to_string(),
            "cmd-300".to_string(),
            "cmd-200".to_string()
        ]
    );
}

#[test]
fn centralized_db_shell_history_search_score_prefers_exact_then_prefix_then_contains() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V2__shell_history.sql");

    let now = 200_000_i64;
    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["git", now - 10, 1_i64],
    )
    .expect("insert exact");
    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["git status", now - 20, 1_i64],
    )
    .expect("insert prefix");
    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["run git status", now - 30, 1_i64],
    )
    .expect("insert contains");
    conn.execute(
        "INSERT INTO shell_history (command, timestamp, execution_count) VALUES (?1, ?2, ?3)",
        params!["alpha git beta", now - 40, 1_i64],
    )
    .expect("insert contains");

    let trimmed_query = "git";
    let keywords = ["git"];
    let mut sql = String::from(
        "SELECT command,
        (
            (CASE WHEN command LIKE ?1 THEN 100 ELSE 0 END) +
            (CASE WHEN command LIKE ?2 THEN 80 ELSE 0 END) +
            (CASE WHEN command LIKE ?3 THEN 60 ELSE 0 END) +
            (CASE WHEN command LIKE ?4 THEN 40 ELSE 0 END) +
            (execution_count * 5) +
            (CASE WHEN (?5 - timestamp) < 86400 THEN 50 ELSE 0 END)
        ) as score
        FROM shell_history WHERE ",
    );
    sql.push_str(
        &keywords
            .iter()
            .map(|_| "command LIKE ?")
            .collect::<Vec<_>>()
            .join(" AND "),
    );
    sql.push_str(" ORDER BY score DESC, timestamp DESC LIMIT ?");

    let rows = conn
        .prepare(&sql)
        .expect("prepare search shell history SQL")
        .query_map(
            params![
                trimmed_query,
                format!("{trimmed_query}%"),
                format!("% {trimmed_query}%"),
                format!("%{trimmed_query}%"),
                now,
                "%git%",
                10_i64
            ],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .expect("query search shell history SQL")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect scored shell commands");

    let ordered_commands: Vec<String> = rows.iter().map(|(cmd, _)| cmd.clone()).collect();
    assert_eq!(
        ordered_commands,
        vec![
            "git".to_string(),
            "git status".to_string(),
            "run git status".to_string(),
            "alpha git beta".to_string()
        ]
    );
}

#[test]
fn centralized_db_get_all_ignored_values_internal_returns_complete_set() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    conn.execute(
        "INSERT INTO ignored_secrets (id, value, rule_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params!["s1", "token-a", Option::<String>::None, 10_i64],
    )
    .expect("insert token-a");
    conn.execute(
        "INSERT INTO ignored_secrets (id, value, rule_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params!["s2", "token-b", Some("RULE".to_string()), 20_i64],
    )
    .expect("insert token-b");

    let values = get_all_ignored_values_internal(&conn).expect("load ignored value set");
    assert_eq!(values.len(), 2);
    assert!(values.contains("token-a"));
    assert!(values.contains("token-b"));
}

#[test]
fn centralized_db_get_all_ignored_values_internal_returns_empty_set_when_no_rows() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    let values = get_all_ignored_values_internal(&conn).expect("load ignored value set");
    assert!(values.is_empty());
}

#[test]
fn centralized_db_prompts_group_filter_orders_by_created_at_desc() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_prompt_row(
        &conn,
        "g1-100",
        "A",
        "A",
        "GroupA",
        None,
        Some("prompt"),
        0_i64,
        100_i64,
        100_i64,
    );
    insert_prompt_row(
        &conn,
        "g1-300",
        "B",
        "B",
        "GroupA",
        None,
        Some("prompt"),
        0_i64,
        300_i64,
        300_i64,
    );
    insert_prompt_row(
        &conn,
        "g1-200",
        "C",
        "C",
        "GroupA",
        None,
        Some("command"),
        0_i64,
        200_i64,
        200_i64,
    );
    insert_prompt_row(
        &conn,
        "g2-400",
        "D",
        "D",
        "GroupB",
        None,
        Some("prompt"),
        0_i64,
        400_i64,
        400_i64,
    );

    let ids = conn
        .prepare(
            "SELECT id FROM prompts
             WHERE group_name = ?1
             ORDER BY created_at DESC
             LIMIT ?2 OFFSET ?3",
        )
        .expect("prepare prompt group SQL")
        .query_map(params!["GroupA", 10_i64, 0_i64], |row| {
            row.get::<_, String>(0)
        })
        .expect("query prompt group SQL")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect prompt ids");

    assert_eq!(
        ids,
        vec![
            "g1-300".to_string(),
            "g1-200".to_string(),
            "g1-100".to_string()
        ]
    );
}

#[test]
fn centralized_db_prompts_favorite_filter_returns_only_favorites() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_prompt_row(
        &conn,
        "fav-1",
        "Fav1",
        "Fav1",
        "Default",
        None,
        Some("prompt"),
        1_i64,
        100_i64,
        100_i64,
    );
    insert_prompt_row(
        &conn,
        "normal-1",
        "Normal1",
        "Normal1",
        "Default",
        None,
        Some("prompt"),
        0_i64,
        300_i64,
        300_i64,
    );
    insert_prompt_row(
        &conn,
        "fav-2",
        "Fav2",
        "Fav2",
        "Default",
        None,
        Some("command"),
        1_i64,
        200_i64,
        200_i64,
    );

    let ids = conn
        .prepare(
            "SELECT id FROM prompts
             WHERE is_favorite = 1
             ORDER BY created_at DESC
             LIMIT ?1 OFFSET ?2",
        )
        .expect("prepare favorite prompt SQL")
        .query_map(params![10_i64, 0_i64], |row| row.get::<_, String>(0))
        .expect("query favorite prompt SQL")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect favorite ids");

    assert_eq!(ids, vec!["fav-2".to_string(), "fav-1".to_string()]);
}

#[test]
fn centralized_db_prompts_pagination_uses_limit_and_offset() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    for i in 1..=5_i64 {
        insert_prompt_row(
            &conn,
            &format!("p{i}"),
            &format!("Prompt{i}"),
            "content",
            "Default",
            None,
            Some("prompt"),
            0_i64,
            i * 100_i64,
            i * 100_i64,
        );
    }

    let ids = conn
        .prepare(
            "SELECT id FROM prompts
             WHERE 1=1
             ORDER BY created_at DESC
             LIMIT ?1 OFFSET ?2",
        )
        .expect("prepare pagination SQL")
        .query_map(params![2_i64, 2_i64], |row| row.get::<_, String>(0))
        .expect("query pagination SQL")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect pagination ids");

    assert_eq!(ids, vec!["p3".to_string(), "p2".to_string()]);
}

#[test]
fn centralized_db_prompts_search_where_requires_all_keywords() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_prompt_row(
        &conn,
        "both",
        "git tool",
        "commit message helper",
        "Default",
        None,
        Some("prompt"),
        0_i64,
        100_i64,
        100_i64,
    );
    insert_prompt_row(
        &conn,
        "split",
        "utility",
        "contains git data",
        "Default",
        Some("commit docs"),
        Some("prompt"),
        0_i64,
        200_i64,
        200_i64,
    );
    insert_prompt_row(
        &conn,
        "only-git",
        "git status",
        "status helper",
        "Default",
        None,
        Some("prompt"),
        0_i64,
        300_i64,
        300_i64,
    );

    let ids = conn
        .prepare(
            "SELECT id FROM prompts
             WHERE (title LIKE ?1 OR content LIKE ?2 OR description LIKE ?3)
               AND (title LIKE ?4 OR content LIKE ?5 OR description LIKE ?6)
             ORDER BY id ASC",
        )
        .expect("prepare prompt search keyword SQL")
        .query_map(
            params!["git%", "%git%", "%git%", "commit%", "%commit%", "%commit%"],
            |row| row.get::<_, String>(0),
        )
        .expect("query prompt search keyword SQL")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect keyword-match prompt ids");

    assert_eq!(ids, vec!["both".to_string(), "split".to_string()]);
}

#[test]
fn centralized_db_prompts_search_category_command_excludes_prompt_and_null() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_prompt_row(
        &conn,
        "cmd",
        "git command",
        "execute command",
        "Default",
        None,
        Some("command"),
        0_i64,
        100_i64,
        100_i64,
    );
    insert_prompt_row(
        &conn,
        "prompt",
        "git command",
        "explain command",
        "Default",
        None,
        Some("prompt"),
        0_i64,
        200_i64,
        200_i64,
    );
    insert_prompt_row(
        &conn,
        "null-type",
        "git command",
        "legacy prompt",
        "Default",
        None,
        None,
        0_i64,
        300_i64,
        300_i64,
    );

    let ids = conn
        .prepare(
            "SELECT id FROM prompts
             WHERE (title LIKE ?1 OR content LIKE ?2 OR description LIKE ?3)
               AND type = ?4
             ORDER BY updated_at DESC",
        )
        .expect("prepare command category SQL")
        .query_map(params!["git%", "%git%", "%git%", "command"], |row| {
            row.get::<_, String>(0)
        })
        .expect("query command category SQL")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect command category ids");

    assert_eq!(ids, vec!["cmd".to_string()]);
}

#[test]
fn centralized_db_apps_search_can_match_keywords_without_name_match() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    insert_app(
        &conn,
        "C:/apps/system.exe",
        "System Utility",
        Some("docker container"),
        5_i64,
        100_i64,
    );
    insert_app(
        &conn,
        "C:/apps/editor.exe",
        "Code Editor",
        Some("text coding"),
        9_i64,
        200_i64,
    );

    let rows = conn
        .prepare(
            "SELECT path FROM apps
             WHERE name LIKE ?1 OR keywords LIKE ?1
             ORDER BY usage_count DESC, name ASC
             LIMIT 10",
        )
        .expect("prepare apps keyword SQL")
        .query_map(params!["%docker%"], |row| row.get::<_, String>(0))
        .expect("query apps keyword SQL")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect apps keyword paths");

    assert_eq!(rows, vec!["C:/apps/system.exe".to_string()]);
}

#[test]
fn centralized_db_apps_empty_query_returns_usage_sorted_top10() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    for i in 0..12_i64 {
        let name = format!("App{i:02}");
        let path = format!("C:/apps/{name}.exe");
        insert_app(&conn, &path, &name, Some("tool"), i, i * 10_i64);
    }

    let rows = conn
        .prepare(
            "SELECT name FROM apps
             WHERE name LIKE ?1 OR keywords LIKE ?1
             ORDER BY usage_count DESC, name ASC
             LIMIT 10",
        )
        .expect("prepare apps empty-query SQL")
        .query_map(params!["%%"], |row| row.get::<_, String>(0))
        .expect("query apps empty-query SQL")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect apps empty-query rows");

    assert_eq!(rows.len(), 10);
    assert_eq!(rows[0], "App11".to_string());
    assert_eq!(rows[9], "App02".to_string());
}

#[test]
fn centralized_db_sync_scanned_apps_duplicate_paths_insert_once_without_error() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    let scanned = vec![
        AppEntry {
            name: "Duplicated".to_string(),
            path: "C:/apps/dup.exe".to_string(),
            icon: None,
            usage_count: 0,
        },
        AppEntry {
            name: "Duplicated Copy".to_string(),
            path: "C:/apps/dup.exe".to_string(),
            icon: None,
            usage_count: 0,
        },
    ];

    let count = sync_scanned_apps(&conn, scanned).expect("sync duplicated scanned apps");
    assert_eq!(count, 2);

    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM apps", [], |row| row.get(0))
        .expect("count apps after duplicate scan");
    assert_eq!(
        total, 1,
        "duplicate paths should not produce duplicate inserts"
    );
}

#[test]
fn centralized_db_url_history_short_query_with_quotes_uses_sanitized_like_input() {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_migration(&conn, "V1__baseline.sql");

    conn.execute(
        "INSERT INTO url_history (url, title, visit_count, last_visit) VALUES (?1, ?2, ?3, ?4)",
        params!["https://a.example", "Alpha", 1_i64, 100_i64],
    )
    .expect("insert alpha");
    conn.execute(
        "INSERT INTO url_history (url, title, visit_count, last_visit) VALUES (?1, ?2, ?3, ?4)",
        params!["https://z.example", "Zulu", 1_i64, 90_i64],
    )
    .expect("insert zulu");

    let clean_query = "\"a\"".replace('"', "");
    let like_query = format!("%{}%", clean_query);

    let rows = conn
        .prepare(
            "SELECT url FROM url_history
             WHERE (url LIKE ?1 OR title LIKE ?1)
             ORDER BY visit_count DESC, last_visit DESC
             LIMIT 5",
        )
        .expect("prepare short-query quoted SQL")
        .query_map(params![like_query], |row| row.get::<_, String>(0))
        .expect("query short-query quoted SQL")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect short-query quoted urls");

    assert!(
        rows.iter().any(|u| u == "https://a.example"),
        "quoted short query should be sanitized and still return LIKE matches"
    );
}
