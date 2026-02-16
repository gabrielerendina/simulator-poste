#!/usr/bin/env python3
"""
Migration script: Add start_year and start_month fields to business_plans table
"""

import sqlite3
import os
from pathlib import Path

def migrate_business_plan_dates():
    """Add start_year and start_month columns to business_plans table"""

    # Database path
    db_path = Path(__file__).parent / "simulator_poste.db"

    if not db_path.exists():
        print(f"❌ Database not found at {db_path}")
        return False

    print(f"📊 Migrating business_plans table in {db_path}")

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Check if columns already exist
        cursor.execute("PRAGMA table_info(business_plans)")
        columns = {row[1] for row in cursor.fetchall()}

        migrations = []

        if 'start_year' not in columns:
            migrations.append(('start_year', 'INTEGER DEFAULT NULL', 'Anno inizio contratto'))

        if 'start_month' not in columns:
            migrations.append(('start_month', 'INTEGER DEFAULT NULL', 'Mese inizio contratto (1-12)'))

        if not migrations:
            print("✅ Columns already exist, no migration needed")
            conn.close()
            return True

        # Apply migrations
        for column_name, column_type, description in migrations:
            print(f"  ➕ Adding column: {column_name} ({description})")
            cursor.execute(f"ALTER TABLE business_plans ADD COLUMN {column_name} {column_type}")

        conn.commit()
        print(f"✅ Migration completed: added {len(migrations)} column(s)")

        conn.close()
        return True

    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        if conn:
            conn.close()
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("Business Plan Dates Migration")
    print("=" * 60)
    success = migrate_business_plan_dates()
    print("=" * 60)
    exit(0 if success else 1)
