import logging
from typing import Optional
from app.utils import gen_suffix

logger = logging.getLogger(__name__)

# Cost per 1K tokens (input/output) for known models - approximate Feb 2026 pricing
MODEL_COSTS = {
    "gpt-4o": (0.0025, 0.01),
    "gpt-4o-mini": (0.00015, 0.0006),
    "gpt-4-turbo": (0.01, 0.03),
    "claude-3-5-sonnet": (0.003, 0.015),
    "claude-sonnet-4": (0.003, 0.015),
    "claude-3-haiku": (0.00025, 0.00125),
    "o3-mini": (0.0011, 0.0044),
}

def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> Optional[float]:
    model_lower = model.lower() if model else ""
    for key, (input_rate, output_rate) in MODEL_COSTS.items():
        if key in model_lower:
            return (input_tokens / 1000 * input_rate) + (output_tokens / 1000 * output_rate)
    return None

async def log_usage(user_id: str = None, project_id: str = None, model: str = None, provider: str = None, input_tokens: int = 0, output_tokens: int = 0, endpoint: str = None):
    try:
        from app.database import AsyncSessionLocal
        from app.models import LLMUsage
        total = input_tokens + output_tokens
        cost = estimate_cost(model, input_tokens, output_tokens)
        async with AsyncSessionLocal() as db:
            usage = LLMUsage(id=gen_suffix(), user_id=user_id, project_id=project_id, model=model, provider=provider, input_tokens=input_tokens, output_tokens=output_tokens, total_tokens=total, estimated_cost_usd=cost, endpoint=endpoint)
            db.add(usage)
            await db.commit()
    except Exception as e:
        logger.warning("Failed to log LLM usage: %s", e)
