from typing import Union, Optional, Literal
from pydantic import BaseModel


class LayerPosition(BaseModel):
    x: float  # 0–100 (% of frame)
    y: float  # 0–100


class LayerSize(BaseModel):
    width: float   # 0–100 (% of frame width)
    height: float  # 0–100


class OverlayLayer(BaseModel):
    id: str
    type: Literal["image", "text"]
    startTime: float
    endTime: Union[float, Literal["end"]]
    position: LayerPosition
    size: LayerSize

    # Image
    src: Optional[str] = None       # base64 data URL
    opacity: Optional[float] = 1.0

    # Text
    content: Optional[str] = None
    fontSize: Optional[int] = 24
    fontColor: Optional[str] = "#ffffff"
    fontFamily: Optional[str] = "sans-serif"
    backgroundColor: Optional[str] = "transparent"
    bold: Optional[bool] = False
