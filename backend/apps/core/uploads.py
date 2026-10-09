import uuid
from pathlib import PurePosixPath

from django.utils.deconstruct import deconstructible


@deconstructible
class RutaAleatoria:
    """`upload_to` que guarda el archivo con un nombre UUID impredecible.

    Evita que se puedan adivinar las URLs de fotos subidas y colisiones de nombres.
    """

    def __init__(self, carpeta: str):
        self.carpeta = carpeta.strip("/")

    def __call__(self, instance, filename: str) -> str:
        extension = PurePosixPath(filename).suffix.lower()
        return f"{self.carpeta}/{uuid.uuid4().hex}{extension}"

    def __eq__(self, other):
        return isinstance(other, RutaAleatoria) and self.carpeta == other.carpeta
