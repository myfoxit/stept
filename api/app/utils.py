import random, string
from datetime import datetime, timezone

def gen_suffix(length: int = 5) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))

def utc_now_naive() -> datetime:
    """Return current UTC time as a naive datetime (without timezone info)"""
    return datetime.now(timezone.utc).replace(tzinfo=None)
