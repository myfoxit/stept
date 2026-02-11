#!/usr/bin/env python3
"""
Script to create test tables with various column types and relations,
then populate them with over 10,000 rows of fake data.
"""
# Ensure 'api' (which contains the 'app' package) is importable when running this file directly.
import sys
from pathlib import Path


_api_root = Path(__file__).resolve().parents[2]  # .../snaprow/api
if str(_api_root) not in sys.path:
    sys.path.insert(0, str(_api_root))

import asyncio
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any

from faker import Faker
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.utils import gen_suffix
from app.database import session_scope
from app.crud.table import create_table
from app.crud.column import add_column
from app.crud.relation import add_relation
from app.crud.field import insert_row, get_rows
from app.models import TableMeta, User, Project
from app.security import hash_password, verify_password

fake = Faker()
Faker.seed(12345)  # For reproducible data

def _to_row_id(val):
    """Normalize insert_row return values to an integer row id."""
    if isinstance(val, dict):
        return val.get("row_id") or val.get("id") or val.get("rowId")
    return val

async def create_companies_table(db: AsyncSession, project_id: str) -> TableMeta:
    """Create a companies table with various column types."""
    print("Creating companies table...")
    
    # Create the table
    table = await create_table(db, "Companies", project_id)
    
    # Add columns of different types
    await add_column(db, table, "company_name", "single_line_text")
    await add_column(db, table, "employee_count", "number")
    await add_column(db, table, "revenue", "decimal", scale=2)
    await add_column(db, table, "is_public", "BOOLEAN")
    await add_column(db, table, "industry", "single_select")
    await add_column(db, table, "founded_year", "number")
    await add_column(db, table, "website", "single_line_text")
    await add_column(db, table, "description", "single_line_text")
    
    await db.commit()
    return table

async def create_employees_table(db: AsyncSession, project_id: str) -> TableMeta:
    """Create an employees table."""
    print("Creating employees table...")
    
    table = await create_table(db, "Employees", project_id)
    
    # Add columns
    await add_column(db, table, "first_name", "single_line_text")
    await add_column(db, table, "last_name", "single_line_text")
    await add_column(db, table, "email", "single_line_text")
    await add_column(db, table, "phone", "single_line_text")
    await add_column(db, table, "salary", "decimal", scale=2)
    await add_column(db, table, "hire_date", "single_line_text")
    await add_column(db, table, "department", "single_select")
    await add_column(db, table, "is_active", "BOOLEAN")
    await add_column(db, table, "performance_score", "REAL")
    
    await db.commit()
    return table

async def create_projects_table(db: AsyncSession, project_id: str) -> TableMeta:
    """Create a projects table."""
    print("Creating projects table...")
    
    table = await create_table(db, "Projects", project_id)
    
    # Add columns
    await add_column(db, table, "project_name", "single_line_text")
    await add_column(db, table, "status", "single_select")
    await add_column(db, table, "budget", "decimal", scale=2)
    await add_column(db, table, "start_date", "single_line_text")
    await add_column(db, table, "end_date", "single_line_text")
    await add_column(db, table, "completion_percentage", "number")
    await add_column(db, table, "priority", "single_select")
    await add_column(db, table, "description", "single_line_text")
    
    await db.commit()
    return table

async def create_relations(
    db: AsyncSession,
    companies: TableMeta,
    employees: TableMeta,
    projects: TableMeta
) -> None:
    """Create various relation types between tables."""
    print("Creating relations...")
    
    # Many-to-one: Employee -> Company (many employees work for one company)
    await add_relation(db, employees, companies, "many_to_one", "Company")
    
    # One-to-many: Company -> Projects (one company has many projects)
    await add_relation(db, companies, projects, "one_to_many", "Projects")
    
    # Many-to-many: Employees <-> Projects (employees can work on multiple projects)
    await add_relation(db, employees, projects, "many_to_many", "Projects")
    
    # One-to-one: Employee -> Employee (manager relationship)
    await add_relation(db, employees, employees, "one_to_one", "Manager")
    
    await db.commit()
    print("Relations created successfully!")

async def populate_companies(db: AsyncSession, table: TableMeta, count: int = 50) -> List[int]:
    """Populate companies table with fake data."""
    print(f"Populating {count} companies...")
    
    industries = ["Technology", "Finance", "Healthcare", "Retail", "Manufacturing", 
                  "Education", "Energy", "Transportation", "Real Estate", "Entertainment"]
    
    company_ids = []
    for i in range(count):
        data = {
            "name": fake.company(),
            "company_name": fake.company() + " " + fake.company_suffix(),
            "employee_count": random.randint(10, 50000),
            "revenue": round(random.uniform(100000, 10000000000), 2),
            "is_public": random.choice([True, False]),
            "industry": random.choice(industries),
            "founded_year": random.randint(1900, 2024),
            "website": fake.url(),
            "description": fake.catch_phrase()
        }
        
        row_id = await insert_row(db, table, data)
        row_id = _to_row_id(row_id)
        company_ids.append(row_id)
        
        if (i + 1) % 10 == 0:
            print(f"  Created {i + 1} companies...")
            await db.commit()
    
    await db.commit()
    return company_ids

async def populate_employees(db: AsyncSession, table: TableMeta, company_ids: List[int], count: int = 5000) -> List[int]:
    """Populate employees table with fake data."""
    print(f"Populating {count} employees...")
    
    departments = ["Engineering", "Sales", "Marketing", "HR", "Finance", 
                   "Operations", "Customer Service", "Legal", "R&D", "IT"]
    
    employee_ids = []
    for i in range(count):
        hire_date = fake.date_between(start_date='-10y', end_date='today')
        
        data = {
            "name": fake.name(),
            "first_name": fake.first_name(),
            "last_name": fake.last_name(),
            "email": fake.email(),
            "phone": fake.phone_number(),
            "salary": round(random.uniform(30000, 250000), 2),
            "hire_date": hire_date.isoformat(),
            "department": random.choice(departments),
            "is_active": random.choices([True, False], weights=[0.95, 0.05])[0],
            "performance_score": round(random.uniform(1.0, 5.0), 2),
            # "company": random.choice(company_ids) if company_ids else None
        }
        
        row_id = await insert_row(db, table, data)
        row_id = _to_row_id(row_id)
        employee_ids.append(row_id)
        
        if (i + 1) % 100 == 0:
            print(f"  Created {i + 1} employees...")
            await db.commit()
    
    await db.commit()
    return employee_ids

async def populate_projects(db: AsyncSession, table: TableMeta, company_ids: List[int], count: int = 5000) -> List[int]:
    """Populate projects table with fake data."""
    print(f"Populating {count} projects...")
    
    statuses = ["Planning", "In Progress", "On Hold", "Completed", "Cancelled"]
    priorities = ["Low", "Medium", "High", "Critical"]
    
    project_ids = []
    for i in range(count):
        start_date = fake.date_between(start_date='-2y', end_date='+1y')
        end_date = fake.date_between(start_date=start_date, end_date='+2y')
        
        status = random.choice(statuses)
        completion = 100 if status == "Completed" else random.randint(0, 95)
        
        data = {
            "name": fake.catch_phrase() + " Project",
            "project_name": fake.bs().title() + " Initiative",
            "status": status,
            "budget": round(random.uniform(10000, 5000000), 2),
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "completion_percentage": completion,
            "priority": random.choice(priorities),
            "description": fake.paragraph(nb_sentences=3),
            # # Link to company via the many-to-one FK field on Projects (not "projects")
            # "company": random.choice(company_ids) if company_ids else None
        }
        
        row_id = await insert_row(db, table, data)
        row_id = _to_row_id(row_id)
        project_ids.append(row_id)
        
        if (i + 1) % 100 == 0:
            print(f"  Created {i + 1} projects...")
            await db.commit()
    
    await db.commit()
    return project_ids

async def assign_employees_to_projects(
    db: AsyncSession,
    employees_table: TableMeta,
    projects_table: TableMeta,
    employee_ids: List[int],
    project_ids: List[int]
) -> None:
    """Create many-to-many relationships between employees and projects."""
    print("Assigning employees to projects (many-to-many)...")
    
    # Get the relation metadata
    from app.models import RelationMeta
    from sqlalchemy import select
    
    stmt = select(RelationMeta).where(
        RelationMeta.left_table_id == employees_table.id,
        RelationMeta.right_table_id == projects_table.id,
        RelationMeta.relation_type == "many_to_many"
    )
    relation = (await db.execute(stmt)).scalar_one_or_none()
    
    if not relation:
        print("Warning: Many-to-many relation not found")
        return
    
    # Assign employees to projects
    assignments = 0
    for project_id in random.sample(project_ids, min(1000, len(project_ids))):
        # Each project gets 2-10 employees
        num_employees = random.randint(2, 10)
        for employee_id in random.sample(employee_ids, min(num_employees, len(employee_ids))):
            try:
                from app.crud.relation import assign_relation
                await assign_relation(
                    db, relation, employee_id, project_id, employees_table.id
                )
                assignments += 1
            except Exception as e:
                print(f"Warning: Could not assign employee {employee_id} to project {project_id}: {e}")
        
        if assignments % 100 == 0:
            print(f"  Created {assignments} assignments...")
            await db.commit()
    
    await db.commit()
    print(f"Created {assignments} employee-project assignments")

async def assign_managers(
    db: AsyncSession,
    employees_table: TableMeta,
    employee_ids: List[int]
) -> None:
    """Assign managers to employees (one-to-one self-relation)."""
    print("Assigning managers to employees...")
    
    # Get the self-relation metadata
    from app.models import RelationMeta
    from sqlalchemy import select
    
    stmt = select(RelationMeta).where(
        RelationMeta.left_table_id == employees_table.id,
        RelationMeta.right_table_id == employees_table.id,
        RelationMeta.relation_type == "one_to_one"
    )
    relation = (await db.execute(stmt)).scalar_one_or_none()
    
    if not relation:
        print("Warning: Manager relation not found")
        return
    
    # Select some employees to be managers
    num_managers = len(employee_ids) // 10  # 10% are managers
    managers = random.sample(employee_ids, num_managers)
    
    assignments = 0
    for employee_id in employee_ids:
        if employee_id not in managers and random.random() < 0.9:  # 90% have managers
            manager_id = random.choice(managers)
            if manager_id != employee_id:  # Don't assign self as manager
                try:
                    from app.crud.relation import assign_relation
                    await assign_relation(
                        db, relation, employee_id, manager_id, employees_table.id
                    )
                    assignments += 1
                except Exception as e:
                    print(f"Warning: Could not assign manager: {e}")
        
        if assignments % 100 == 0:
            print(f"  Assigned {assignments} managers...")
            await db.commit()
    
    await db.commit()
    print(f"Assigned {assignments} manager relationships")

async def ensure_test_project(db: AsyncSession) -> str:
    """Get or create a test user and project; return the project's 16-char id."""
    user = (await db.execute(select(User).where(User.email == "test@snaprow.com"))).scalar_one_or_none()
    if not user:
        user = User(
            name="Test User",
            email="test@snaprow.com",
            hashed_password=hash_password("test"),  # real hashed password
            is_verified=True,                       # mark verified for easy login
        )
        db.add(user)
        await db.flush()  # ensure user.id is generated
    else:
        # If pre-existing user has a bad (plaintext) password, fix it and verify
        if not verify_password("test", user.hashed_password):
            user.hashed_password = hash_password("test")
        if not user.is_verified:
            user.is_verified = True
        await db.flush()

    project = (await db.execute(
        select(Project).where(Project.name == "Test Project", Project.owner_id == user.id)
    )).scalar_one_or_none()
    if not project:
        project = Project(
            id=gen_suffix(16), 
            name="Test Project", 
            owner_id=user.id,  # Set owner_id (required)
            user_id=user.id    # Keep user_id for backward compatibility
        )
        db.add(project)
        await db.flush()  # ensure project.id is generated

    return project.id

async def main():
    """Main function to orchestrate the data population."""
    print("=" * 60)
    print("Starting test data population script")
    print("=" * 60)
    
    async with session_scope() as db:
        # Ensure a valid project exists (id length 16)
        project_id = await ensure_test_project(db)

        # Create tables
        companies_table = await create_companies_table(db, project_id)
        employees_table = await create_employees_table(db, project_id)
        projects_table = await create_projects_table(db, project_id)
        
        # # Create relations
        # await create_relations(db, companies_table, employees_table, projects_table)
        
        # Populate data
        company_ids = await populate_companies(db, companies_table, count=50)
        employee_ids = await populate_employees(db, employees_table, company_ids, count=5000)
        project_ids = await populate_projects(db, projects_table, company_ids, count=5100)
        
        # # Create relationship assignments
        # await assign_employees_to_projects(
        #     db, employees_table, projects_table, employee_ids, project_ids
        # )
        # await assign_managers(db, employees_table, employee_ids)
        
        # Print summary
        print("\n" + "=" * 60)
        print("DATA POPULATION COMPLETE!")
        print("=" * 60)
        print(f"Project ID: {project_id}")
        print(f"Companies created: {len(company_ids)}")
        print(f"Employees created: {len(employee_ids)}")
        print(f"Projects created: {len(project_ids)}")
        print(f"Total rows created: {len(company_ids) + len(employee_ids) + len(project_ids)}")
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
