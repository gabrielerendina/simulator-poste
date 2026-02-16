"""
Database migration for Business Plan module
Adds new columns to business_plans table
Run this BEFORE deploying the new version
"""
import sqlite3
import sys
from pathlib import Path

def migrate():
    db_path = Path(__file__).parent / 'simulator_poste.db'

    if not db_path.exists():
        print(f"✓ Database {db_path} doesn't exist yet - will be created on first startup")
        return True

    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        # Check if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='business_plans'")
        if not cursor.fetchone():
            print("✓ business_plans table doesn't exist yet - will be created on startup")
            conn.close()
            return True

        # Check existing columns
        cursor.execute('PRAGMA table_info(business_plans)')
        existing_cols = [col[1] for col in cursor.fetchall()]
        print(f"Found {len(existing_cols)} existing columns in business_plans table")

        # New columns to add
        migrations = [
            ('governance_profile_mix', 'TEXT DEFAULT "[]"', 'JSON array for governance team profile mix'),
            ('governance_cost_manual', 'REAL DEFAULT NULL', 'Manual override for governance cost'),
            ('margin_warning_threshold', 'REAL DEFAULT 0.05', 'Warning threshold for margin (default 5%)'),
            ('margin_success_threshold', 'REAL DEFAULT 0.15', 'Success threshold for margin (default 15%)'),
        ]

        changes_made = False
        for col_name, col_def, description in migrations:
            if col_name not in existing_cols:
                try:
                    cursor.execute(f'ALTER TABLE business_plans ADD COLUMN {col_name} {col_def}')
                    print(f'✓ Added column: {col_name} ({description})')
                    changes_made = True
                except sqlite3.OperationalError as e:
                    print(f'✗ Error adding {col_name}: {e}')
                    conn.close()
                    return False
            else:
                print(f'  Column {col_name} already exists')

        if changes_made:
            conn.commit()
            print('\n✓ Migration completed successfully!')
        else:
            print('\n✓ No migration needed - all columns already exist')

        conn.close()
        return True

    except Exception as e:
        print(f'\n✗ Migration failed: {e}')
        return False

if __name__ == '__main__':
    success = migrate()
    sys.exit(0 if success else 1)
