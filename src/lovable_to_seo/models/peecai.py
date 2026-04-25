import json
from pathlib import Path
from pydantic import BaseModel


class BrandReportRow(BaseModel):
    brand_id: str
    brand_name: str
    visibility: float
    mention_count: int
    share_of_voice: float
    sentiment: float
    position: float


class SearchQuery(BaseModel):
    prompt_id: str
    chat_id: str
    model_id: str
    date: str
    query_text: str


class UrlReportRow(BaseModel):
    url: str
    classification: str
    title: str
    citation_count: int
    retrievals: int
    citation_rate: float
    mentioned_brand_ids: list[str] = []


class DiagnoseBundle(BaseModel):
    brand_report: list[BrandReportRow]
    search_queries: list[SearchQuery]
    url_report: list[UrlReportRow]

    @classmethod
    def from_fixture(cls, path: str) -> "DiagnoseBundle":
        raw = json.loads(Path(path).read_text())
        return cls(
            brand_report=[BrandReportRow(**r) for r in raw["brand_report"]],
            search_queries=[SearchQuery(**q) for q in raw["search_queries"]],
            url_report=[UrlReportRow(**u) for u in raw["url_report"]],
        )
