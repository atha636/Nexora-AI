"""Natural-language and structured analytics questions.

POST /analytics/query : run a structured query directly (no AI). Same engine the AI uses.
POST /analytics/ask   : ask in plain English; the AI picks the query/queries, we run them safely.
GET  /analytics/schema: what can be asked (metrics, groupings, periods), used by the UI.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.agent.service import AgentFailure, run_analysis
from app.analyst.engine import run_query
from app.analyst.spec import DIMENSION_LABELS, METRICS, AnalyticsError, AnalyticsQuery
from app.core.ratelimit import rate_limit
from app.api.deps import AuthContext, get_auth_context
from app.db.session import get_db
from app.schemas.insights import AnalysisResponse, AskAnalyticsRequest
from app.services.embeddings import Embedder, get_embedder
from app.services.llm import ChatLLM, LLMError, get_chat_llm

router = APIRouter(prefix="/analytics", tags=["analytics-ai"])


@router.get("/schema")
def schema(_: AuthContext = Depends(get_auth_context)) -> dict:
    return {
        "metrics": [{"key": m.key, "label": m.label, "unit": m.unit, "description": m.description} for m in METRICS.values()],
        "dimensions": [{"key": k, "label": v} for k, v in DIMENSION_LABELS.items()],
    }


@router.post("/query")
def query(body: AnalyticsQuery, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> dict:
    try:
        return run_query(db, ctx.organization_id, body)  # org id from the membership, never the request
    except AnalyticsError as e:
        raise HTTPException(422, str(e)) from None


@router.post("/ask", response_model=AnalysisResponse, dependencies=[Depends(rate_limit("analytics_ask", 20))])
def ask(
    body: AskAnalyticsRequest,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
    llm: ChatLLM = Depends(get_chat_llm),
    embedder: Embedder = Depends(get_embedder),
) -> AnalysisResponse:
    try:
        out = run_analysis(db, ctx, llm, embedder, body.question)
    except LLMError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from None
    except AgentFailure as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e)) from None
    return AnalysisResponse(
        answer=out.answer,
        results=out.results,
        run_id=out.run.id,
        trace_id=out.run.trace_id,
        duration_ms=out.run.duration_ms,
        tools=[{"name": r.name, "status": r.status, "summary": r.summary, "error": r.error, "duration_ms": r.duration_ms} for r in out.records],
    )