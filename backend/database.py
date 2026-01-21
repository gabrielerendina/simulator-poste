"""
Database configuration and setup for SQLite
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os

# Database URL - using SQLite in project root
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./simulator_poste.db"
)

# Create engine with SQLite-specific options
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    echo=False  # Set to True for SQL logging
)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Base class for models
Base = declarative_base()
