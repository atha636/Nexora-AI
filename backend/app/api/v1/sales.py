import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_auth_context, log_activity
from app.db.models import Lead, OrganizationMember, Sale
from app.db.session import get_db
from app.schemas.analytics import SaleCreate, SaleOut

router = APIRouter(prefix="/sales", tags=["sales"])

MAX_AMOUNT = 1_000_000_000


def _out(s: Sale) -> SaleOut:
    return SaleOut(
        id=s.id, amount=float(s.amount), sold_at=s.sold_at, lead_id=s.lead_id, salesperson_id=s.salesperson_id
    )


@router.get("", response_model=list[SaleOut])
def list_sales(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[SaleOut]:
    rows = db.scalars(
        select(Sale).where(Sale.organization_id == ctx.organization_id).order_by(Sale.sold_at.desc()).limit(50)
    ).all()
    return [_out(s) for s in rows]


@router.post("", response_model=SaleOut, status_code=status.HTTP_201_CREATED)
def record_sale(
    body: SaleCreate, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> SaleOut:
    if not (0 < body.amount <= MAX_AMOUNT):
        raise HTTPException(422, f"Amount must be greater than 0 and at most {MAX_AMOUNT:,}")

    if body.lead_id is not None:
        owns_lead = db.scalar(
            select(Lead.id).where(Lead.id == body.lead_id, Lead.organization_id == ctx.organization_id)
        )
        if owns_lead is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")

    salesperson_id: uuid.UUID = body.salesperson_id or ctx.user.id
    is_member = db.scalar(
        select(OrganizationMember.id).where(
            OrganizationMember.profile_id == salesperson_id,
            OrganizationMember.organization_id == ctx.organization_id,
        )
    )
    if is_member is None:
        raise HTTPException(422, "Salesperson is not in your organization")

    sale = Sale(
        organization_id=ctx.organization_id,
        lead_id=body.lead_id,
        salesperson_id=salesperson_id,
        amount=Decimal(str(round(body.amount, 2))),
        sold_at=body.sold_at or datetime.now(timezone.utc),
    )
    db.add(sale)
    db.flush()
    log_activity(
        db,
        ctx,
        entity_type="sale",
        entity_id=sale.id,
        action="sale.recorded",
        details={"amount": float(sale.amount)},
    )
    db.commit()
    db.refresh(sale)
    return _out(sale)