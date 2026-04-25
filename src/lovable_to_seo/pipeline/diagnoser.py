"""Diagnose stage — skeleton only. Returns fixture data; real API calls are TODO."""
from __future__ import annotations

from datetime import date, timedelta

from ..models.peecai import DiagnoseBundle


async def diagnose(
    project_id: str,
    own_brand_id: str,
    lookback_days: int = 30,
    fixture_path: str = "examples/founder-mvp/peec-fixture.json",
) -> DiagnoseBundle:
    # TODO: implement real PeecAI API calls via clients/peecai.py
    # end = date.today()
    # start = end - timedelta(days=lookback_days)
    # async with PeecAIClient(api_key, base_url) as client:
    #     brand_report, search_queries, url_report = await asyncio.gather(
    #         client.get_brand_report(project_id, start.isoformat(), end.isoformat()),
    #         client.list_search_queries(project_id, start.isoformat(), end.isoformat()),
    #         client.get_url_report(project_id, start.isoformat(), end.isoformat()),
    #     )
    #     return DiagnoseBundle(brand_report=brand_report,
    #                           search_queries=search_queries,
    #                           url_report=url_report)
    return DiagnoseBundle.from_fixture(fixture_path)
