from ninja import Schema


class Mensaje(Schema):
    detail: str


class Punto(Schema):
    lat: float
    lng: float
