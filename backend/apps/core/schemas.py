from ninja import Schema
from pydantic import Field


class Mensaje(Schema):
    detail: str


class Punto(Schema):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
