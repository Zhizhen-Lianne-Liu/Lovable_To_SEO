"""PeecAI REST client — skeleton. Real API calls are TODO placeholders."""
from __future__ import annotations

import httpx
from ..models.peecai import BrandReportRow, DiagnoseBundle, SearchQuery, UrlReportRow


class PeecAIClient:
    def __init__(self, api_key: str, base_url: str = "https://api.peec.ai/customer/v1"):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")

    async def get_brand_report(
        self, project_id: str, start_date: str, end_date: str
    ) -> list[BrandReportRow]:
        # TODO: implement real API call
        # async with httpx.AsyncClient() as client:
        #     resp = await client.post(
        #         f"{self._base_url}/reports/brands",
        #         headers={"X-API-Key": self._api_key},
        #         json={"project_id": project_id, "start_date": start_date,
        #               "end_date": end_date, "limit": 50},
        #     )
        #     resp.raise_for_status()
        #     data = resp.json()
        #     rows = data if isinstance(data, list) else data["data"]
        #     return [BrandReportRow(**r) for r in rows]
        raise NotImplementedError("PeecAI brand report not yet implemented — use fixture mode")

    async def list_search_queries(
        self, project_id: str, start_date: str, end_date: str
    ) -> list[SearchQuery]:
        # TODO: implement real API call
        raise NotImplementedError("PeecAI search queries not yet implemented — use fixture mode")

    async def get_url_report(
        self, project_id: str, start_date: str, end_date: str
    ) -> list[UrlReportRow]:
        # TODO: implement real API call
        raise NotImplementedError("PeecAI URL report not yet implemented — use fixture mode")
