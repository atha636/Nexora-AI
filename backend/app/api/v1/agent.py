import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.agent.service import AgentFailure, ConversationNotFound, get_conversation, run_chat
from app.core.ratelimit import rate_limit
from app.api.deps import ROLE_RANK, AuthContext, get_auth_context
from app.db.models import AgentRun, Conversation, Message, ToolExecution
from app.db.session import get_db
from app.schemas.agent import (
    ChatRequest,
    ChatResponse,
    ConversationDetail,
    ConversationOut,
    MessageOut,
    RunOut,
    ToolExecutionOut,
    UsageOut,
)
from app.services.embeddings import Embedder, get_embedder
from app.services.llm import ChatLLM, LLMError, get_chat_llm

router = APIRouter(prefix="/agent", tags=["agent"])


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")


@router.post("/chat", response_model=ChatResponse, dependencies=[Depends(rate_limit("chat", 20))])
def chat(
    body: ChatRequest,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
    llm: ChatLLM = Depends(get_chat_llm),
    embedder: Embedder = Depends(get_embedder),
) -> ChatResponse:
    """Sends one message to the AI agent. It may call tools (search leads, read documents, ...)
    before answering. Every run and tool call is recorded and can be inspected afterwards."""
    try:
        out = run_chat(db, ctx, llm, embedder, body.message, body.conversation_id, body.language)
    except ConversationNotFound:
        raise _not_found() from None
    except LLMError as e:  # includes "not configured"; the message is safe to show
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from None
    except AgentFailure as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e)) from None
    run = out.run
    return ChatResponse(
        conversation=ConversationOut.model_validate(out.conversation),
        user_message=MessageOut.model_validate(out.user_message),
        assistant_message=MessageOut.model_validate(out.assistant_message),
        run_id=run.id,
        trace_id=run.trace_id,
        usage=UsageOut(
            steps=run.steps,
            tool_calls=run.tool_call_count,
            prompt_tokens=run.prompt_tokens,
            completion_tokens=run.completion_tokens,
            duration_ms=run.duration_ms,
        ),
    )


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> list[Conversation]:
    return list(
        db.scalars(
            select(Conversation)
            .where(Conversation.organization_id == ctx.organization_id, Conversation.user_id == ctx.user.id)
            .order_by(Conversation.updated_at.desc(), Conversation.id)
            .limit(50)
        )
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def read_conversation(
    conversation_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> ConversationDetail:
    try:
        convo = get_conversation(db, ctx, conversation_id)
    except ConversationNotFound:
        raise _not_found() from None
    messages = db.scalars(
        select(Message).where(Message.conversation_id == convo.id).order_by(Message.created_at, Message.role.desc())
    ).all()
    return ConversationDetail(
        id=convo.id,
        title=convo.title,
        created_at=convo.created_at,
        updated_at=convo.updated_at,
        messages=[MessageOut.model_validate(m) for m in messages],
    )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)
) -> Response:
    """Clears a conversation. The run records stay (without the link) so observability data survives."""
    try:
        convo = get_conversation(db, ctx, conversation_id)
    except ConversationNotFound:
        raise _not_found() from None
    db.execute(delete(Message).where(Message.conversation_id == convo.id))  # explicit: SQLite has no cascades
    for run in db.scalars(select(AgentRun).where(AgentRun.conversation_id == convo.id)):
        run.conversation_id = None
    db.delete(convo)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/runs/{run_id}", response_model=RunOut)
def read_run(run_id: uuid.UUID, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)) -> RunOut:
    """One agent run with its tool timeline. You can see your own runs; managers and above can
    see everyone's in their organization."""
    run = db.scalar(select(AgentRun).where(AgentRun.id == run_id, AgentRun.organization_id == ctx.organization_id))
    if run is None or (run.user_id != ctx.user.id and ROLE_RANK[ctx.role] < ROLE_RANK["manager"]):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    tools = db.scalars(select(ToolExecution).where(ToolExecution.run_id == run.id).order_by(ToolExecution.sequence)).all()
    return RunOut(
        id=run.id,
        trace_id=run.trace_id,
        status=run.status,
        model=run.model,
        steps=run.steps,
        tool_call_count=run.tool_call_count,
        prompt_tokens=run.prompt_tokens,
        completion_tokens=run.completion_tokens,
        error_message=run.error_message,
        started_at=run.started_at,
        finished_at=run.finished_at,
        duration_ms=run.duration_ms,
        tools=[ToolExecutionOut.model_validate(t) for t in tools],
    )