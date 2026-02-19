#!/usr/bin/env python3
"""
Esegue tutte le migrazioni pendenti per il database Business Plan
"""

import sqlite3
from pathlib import Path
import sys

def check_and_add_column(cursor, table, column_name, column_type, description):
    """
    Controlla se una colonna esiste e la aggiunge se mancante
    """
    cursor.execute(f"PRAGMA table_info({table})")
    columns = {row[1] for row in cursor.fetchall()}

    if column_name not in columns:
        print(f"  ➕ Adding column: {column_name} ({description})")
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column_name} {column_type}")
        return True
    return False

def migrate_database(db_path):
    """
    Esegue tutte le migrazioni necessarie
    """
    print(f"📊 Checking database: {db_path}")
    print(f"   Path exists: {db_path.exists()}")
    print(f"   Absolute path: {db_path.absolute()}")

    if not db_path.exists():
        print(f"⚠️  Database not found at {db_path}")
        print(f"   This is normal for first startup - database will be created by the application")
        return True  # Return success - let the app create the DB

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Lista di migrazioni da applicare
        migrations = []

        # Migrazione: Contract Dates
        migrations.append(('business_plans', 'start_year', 'INTEGER DEFAULT NULL', 'Anno inizio contratto'))
        migrations.append(('business_plans', 'start_month', 'INTEGER DEFAULT NULL', 'Mese inizio contratto'))

        # Migrazione: Governance Enhancements
        migrations.append(('business_plans', 'governance_mode', 'TEXT DEFAULT "percentage"', 'Modalità calcolo governance'))
        migrations.append(('business_plans', 'governance_fte_periods', 'TEXT DEFAULT "[]"', 'Time slices per governance FTE'))
        migrations.append(('business_plans', 'governance_apply_reuse', 'INTEGER DEFAULT 0', 'Flag: applicare riuso alla governance'))

        # Migrazione: Inflation YoY
        migrations.append(('business_plans', 'inflation_pct', 'REAL DEFAULT 0.0', 'Inflazione annua % YoY sulle tariffe Lutech'))

        # Applica migrazioni
        added_count = 0
        for table, column_name, column_type, description in migrations:
            if check_and_add_column(cursor, table, column_name, column_type, description):
                added_count += 1

        if added_count > 0:
            conn.commit()
            print(f"✅ Migration completed: added {added_count} column(s)")
        else:
            print("✅ All migrations already applied, database is up to date")

        conn.close()
        return True

    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        if conn:
            conn.close()
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("Business Plan Database Migrations")
    print("=" * 60)

    # Usa il path del database dalla variabile d'ambiente o default
    import os
    db_path = os.environ.get('DB_PATH')

    if db_path:
        db_path = Path(db_path)
    else:
        db_path = Path(__file__).parent / "simulator_poste.db"

    success = migrate_database(db_path)
    print("=" * 60)

    sys.exit(0 if success else 1)
