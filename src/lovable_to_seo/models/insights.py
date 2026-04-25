from enum import Enum
from pydantic import BaseModel


class EditType(str, Enum):
    ADD_JSON_LD_ORG_SOFTWARE = "ADD_JSON_LD_ORG_SOFTWARE"
    ADD_FAQ_SECTION = "ADD_FAQ_SECTION"
    ADD_COMPARISON_TABLE = "ADD_COMPARISON_TABLE"
    TIGHTEN_HERO_COPY = "TIGHTEN_HERO_COPY"
    ADD_PRIMARY_KEYWORD_TO_TITLE_H1 = "ADD_PRIMARY_KEYWORD_TO_TITLE_H1"
    EMIT_ROBOTS_TXT = "EMIT_ROBOTS_TXT"
    EMIT_SITEMAP_XML = "EMIT_SITEMAP_XML"
    EMIT_LLMS_TXT = "EMIT_LLMS_TXT"
    EMIT_PRICING_MD = "EMIT_PRICING_MD"
    ADD_OG_TWITTER_META = "ADD_OG_TWITTER_META"


class Priority(int, Enum):
    CRITICAL = 1
    HIGH = 2
    MEDIUM = 3
    LOW = 4


class ActionItem(BaseModel):
    edit_type: EditType
    priority: Priority
    target_file: str
    rationale: str
    evidence: str = ""
