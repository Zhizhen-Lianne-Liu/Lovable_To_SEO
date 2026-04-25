import logging

from fastapi import FastAPI
from .routers.pipeline import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)

app = FastAPI(title="lovabletoseo", version="0.1.0")
app.include_router(router)
