from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


TABLE_COLUMNS = {
    "drama": [
        ("wide_cover_url", "VARCHAR(500) DEFAULT ''"),
        ("categories_json", "TEXT DEFAULT '[]'"),
        ("cast_tags_json", "TEXT DEFAULT '[]'"),
        ("updated_at", "TIMESTAMP"),
    ],
    "episode": [
        ("asset_status", "VARCHAR(32) DEFAULT 'draft'"),
        ("video_width", "INTEGER DEFAULT 0"),
        ("video_height", "INTEGER DEFAULT 0"),
        ("video_file_size", "INTEGER DEFAULT 0"),
        ("video_mime_type", "VARCHAR(120) DEFAULT ''"),
        ("updated_at", "TIMESTAMP"),
    ],
    "user_interaction_log": [
        ("play_session_id", "VARCHAR(160)"),
    ],
}


def ensure_app_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table_name, columns in TABLE_COLUMNS.items():
            if table_name not in table_names:
                continue
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, column_type in columns:
                if column_name in existing:
                    continue
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))
            if table_name in {"drama", "episode"}:
                connection.execute(text(f"UPDATE {table_name} SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))
