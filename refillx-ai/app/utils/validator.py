from pydantic import BaseModel, Field
from typing import List, Union

class RetrainRequest(BaseModel):
    models: Union[str, List[str]] = Field(
        ..., 
        description="List of models to retrain (e.g. ['arima', 'lstm', 'kmeans', 'rf', 'collab']) or 'all'"
    )
