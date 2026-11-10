"""Creates a demo organization with a team, leads, sales and activity.

Run from the backend folder, AFTER `alembic upgrade head`:

    python -m scripts.seed_demo

Safe to re-run: it does nothing if the demo account already exists.
The data is generated with a fixed random seed, so everyone gets the same demo.
"""

import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select

from app.core.security import hash_password
from app.db.models import (
    ActivityLog,
    Lead,
    Organization,
    OrganizationMember,
    Profile,
    Sale,
)
from app.db.session import SessionLocal

DEMO_EMAIL = "demo@nexora.ai"
DEMO_PASSWORD = "DemoPass123!"

TEAM = [
    ("Priya Nair", "priya@nexora.ai", "manager"),
    ("Rahul Sharma", "rahul@nexora.ai", "employee"),
    ("Neha Gupta", "neha@nexora.ai", "employee"),
    ("Arjun Mehta", "arjun@nexora.ai", "employee"),
]
CITIES = ["Delhi", "Mumbai", "Bengaluru", "Jaipur", "Pune", "Hyderabad", "Ahmedabad"]
CITY_WEIGHTS = [28, 22, 18, 10, 9, 8, 5]
SOURCES = ["Website", "Referral", "LinkedIn", "Cold call", "Trade show"]
FIRST = ["Aarav", "Diya", "Kabir", "Isha", "Vihaan", "Anaya", "Rohan", "Meera", "Aditya", "Kavya", "Sahil", "Tara"]
LAST = ["Verma", "Kapoor", "Iyer", "Singh", "Bose", "Reddy", "Joshi", "Malhotra", "Shah", "Rao", "Khanna", "Desai"]
COMPANIES = ["Textiles", "Logistics", "Foods", "Energy", "Retail", "Pharma", "Software", "Builders", "Motors", "Media"]


def main() -> None:
    rnd = random.Random(42)
    now = datetime.now(timezone.utc)

    with SessionLocal() as db:
        if db.scalar(select(Profile).where(Profile.email == DEMO_EMAIL)):
            print(f"Demo data already exists. Sign in as {DEMO_EMAIL} / {DEMO_PASSWORD}")
            return

        org = Organization(name="Nexora Demo Co", created_at=now - timedelta(days=365))
        owner = Profile(email=DEMO_EMAIL, full_name="Demo Owner", password_hash=hash_password(DEMO_PASSWORD))
        db.add_all([org, owner])
        db.flush()
        db.add(OrganizationMember(organization_id=org.id, profile_id=owner.id, role="owner"))
        db.add(
            ActivityLog(
                organization_id=org.id,
                actor_id=owner.id,
                entity_type="organization",
                entity_id=org.id,
                action="organization.created",
                created_at=org.created_at,
            )
        )

        people = [owner]
        pw_hash = hash_password(DEMO_PASSWORD)
        for name, email, role in TEAM:
            p = Profile(email=email, full_name=name, password_hash=pw_hash)
            db.add(p)
            db.flush()
            db.add(OrganizationMember(organization_id=org.id, profile_id=p.id, role=role))
            people.append(p)

        # More leads in recent months, so the acquisition chart shows growth.
        total_leads = 110
        for i in range(total_leads):
            days_ago = int(365 * (1 - rnd.random() ** 0.6))  # skews toward recent
            created = now - timedelta(days=days_ago, hours=rnd.randint(0, 20))
            first, last = rnd.choice(FIRST), rnd.choice(LAST)
            age_bias = days_ago / 365  # older leads are more likely to be resolved
            roll = rnd.random()
            if roll < 0.12 + 0.25 * age_bias:
                status = "won"
            elif roll < 0.25 + 0.35 * age_bias:
                status = "lost"
            elif roll < 0.55:
                status = "qualified"
            elif roll < 0.8:
                status = "contacted"
            else:
                status = "new"
            lead = Lead(
                organization_id=org.id,
                name=f"{first} {last}",
                email=f"{first}.{last}{i}@example.com".lower(),
                phone=f"+91 9{rnd.randint(100000000, 999999999)}",
                company=f"{last} {rnd.choice(COMPANIES)}",
                city=rnd.choices(CITIES, CITY_WEIGHTS)[0],
                source=rnd.choice(SOURCES),
                status=status,
                priority=rnd.choices(["low", "medium", "high"], [3, 4, 3])[0],
                assigned_to=rnd.choice(people).id,
                last_contacted_at=None if status == "new" else created + timedelta(days=rnd.randint(1, 20)),
                created_at=created,
                updated_at=created,
            )
            db.add(lead)
            db.flush()
            db.add(
                ActivityLog(
                    organization_id=org.id,
                    actor_id=lead.assigned_to,
                    entity_type="lead",
                    entity_id=lead.id,
                    action="lead.created",
                    details={"name": lead.name},
                    created_at=created,
                )
            )

            if status == "won":
                sold = min(now, created + timedelta(days=rnd.randint(5, 45)))
                amount = Decimal(rnd.randrange(25_000, 450_000, 500))
                sale = Sale(
                    organization_id=org.id,
                    lead_id=lead.id,
                    salesperson_id=lead.assigned_to,
                    amount=amount,
                    sold_at=sold,
                    created_at=sold,
                )
                db.add(sale)
                db.flush()
                db.add(
                    ActivityLog(
                        organization_id=org.id,
                        actor_id=lead.assigned_to,
                        entity_type="sale",
                        entity_id=sale.id,
                        action="sale.recorded",
                        details={"amount": float(amount)},
                        created_at=sold,
                    )
                )

        db.commit()
        leads = db.scalar(select(func.count()).select_from(Lead))
        sales = db.scalar(select(func.count()).select_from(Sale))
        print(f"Seeded {leads} leads and {sales} sales for 'Nexora Demo Co'.")
        print(f"Sign in as {DEMO_EMAIL} / {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()