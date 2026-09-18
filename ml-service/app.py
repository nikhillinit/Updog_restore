"""Optional ML reserve prediction service."""

import asyncio
import hmac
import logging
import os
import tempfile
import time
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Reserve ML Service", version="1.0.0")

allowed_origins = [
    origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()
]
if not allowed_origins and os.getenv("ENV", "development") == "development":
    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:5000",
        "http://127.0.0.1:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

MODEL_PATH = os.getenv("MODEL_PATH", "./model.pkl")
MODEL_VERSION = os.getenv("MODEL_VERSION", "ml-gbrt-v1.0")
CONFIDENCE_LEVEL = float(os.getenv("CONFIDENCE_LEVEL", "0.8"))
TRAINING_API_KEY = os.getenv("ML_TRAINING_API_KEY", "").strip()

_model: Optional[Pipeline] = None
_model_metadata: Dict[str, Any] = {}
_training_lock = asyncio.Lock()


class Company(BaseModel):
    id: str
    fundId: str
    name: str
    stage: str = Field(
        ..., pattern="^(preseed|seed|series_a|series_b|series_c|series_dplus)$"
    )
    sector: Optional[str] = None
    checkSize: float = Field(..., gt=0)
    invested: float = Field(..., gt=0)
    ownership: float = Field(..., gt=0, le=1)
    exitMoic: Optional[float] = None
    entryDate: Optional[str] = None
    lastRoundDate: Optional[str] = None


class Market(BaseModel):
    asOfDate: str
    marketScore: Optional[float] = Field(None, ge=0, le=1)
    vix: Optional[float] = Field(None, gt=0)
    fedFundsRate: Optional[float] = Field(None, ge=0)
    ust10yYield: Optional[float] = Field(None, ge=0)
    ipoCount30d: Optional[int] = Field(None, ge=0)
    creditSpreadBaa: Optional[float] = Field(None, ge=0)


class TrainingRow(BaseModel):
    company: Company
    market: Market
    realizedReserveUsed: float = Field(..., ge=0)
    actualOutcome: Optional[str] = Field(None, pattern="^(success|failure|partial)$")


class TrainingRequest(BaseModel):
    rows: List[TrainingRow] = Field(..., min_length=10)
    modelVersion: Optional[str] = None
    hyperparameters: Optional[Dict[str, Any]] = None


class PredictRequest(BaseModel):
    company: Company
    market: Market
    explain: bool = True
    confidenceLevel: Optional[float] = Field(CONFIDENCE_LEVEL, ge=0.5, le=0.99)


class PredictionResponse(BaseModel):
    modelVersion: str
    prediction: Dict[str, Any]
    explanation: Optional[Dict[str, Any]] = None
    latencyMs: int


def get_feature_columns() -> Dict[str, List[str]]:
    return {
        "numerical": [
            "checkSize",
            "invested",
            "ownership",
            "exitMoic",
            "marketScore",
            "vix",
            "fedFundsRate",
            "ust10yYield",
            "ipoCount30d",
            "creditSpreadBaa",
        ],
        "categorical": ["stage", "sector"],
    }


def create_pipeline() -> Pipeline:
    features = get_feature_columns()
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), features["numerical"]),
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                features["categorical"],
            ),
        ],
        remainder="drop",
    )
    return Pipeline(
        [
            ("preprocessor", preprocessor),
            (
                "regressor",
                GradientBoostingRegressor(
                    n_estimators=100,
                    learning_rate=0.1,
                    max_depth=6,
                    random_state=42,
                    validation_fraction=0.2,
                    n_iter_no_change=10,
                    tol=1e-4,
                ),
            ),
        ]
    )


def extract_features(company: Company, market: Market) -> Dict[str, Any]:
    return {
        "checkSize": company.checkSize,
        "invested": company.invested,
        "ownership": company.ownership,
        "exitMoic": company.exitMoic if company.exitMoic is not None else 2.0,
        "stage": company.stage,
        "sector": company.sector or "unknown",
        "marketScore": market.marketScore if market.marketScore is not None else 0.5,
        "vix": market.vix if market.vix is not None else 20.0,
        "fedFundsRate": market.fedFundsRate if market.fedFundsRate is not None else 2.5,
        "ust10yYield": market.ust10yYield if market.ust10yYield is not None else 3.0,
        "ipoCount30d": market.ipoCount30d if market.ipoCount30d is not None else 30,
        "creditSpreadBaa": (
            market.creditSpreadBaa if market.creditSpreadBaa is not None else 1.8
        ),
    }


def require_training_authorization(request: Request) -> None:
    if not TRAINING_API_KEY:
        raise HTTPException(status_code=503, detail="ML training is disabled")

    scheme, _, credential = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(credential, TRAINING_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid training credentials")


def load_persisted_model() -> tuple[Pipeline, Dict[str, Any]]:
    if not os.path.isfile(MODEL_PATH):
        raise FileNotFoundError("Trained model artifact is unavailable")

    saved_data = joblib.load(MODEL_PATH)
    if not isinstance(saved_data, dict) or "model" not in saved_data:
        raise ValueError("Model artifact has an invalid envelope")

    model = saved_data["model"]
    metadata = saved_data.get("metadata", {})
    if not isinstance(model, Pipeline) or not isinstance(metadata, dict):
        raise ValueError("Model artifact has incompatible types")
    if int(metadata.get("training_samples", 0)) <= 0:
        raise ValueError("Model artifact is not trained")
    return model, metadata


def persist_model(model: Pipeline, metadata: Dict[str, Any]) -> None:
    model_path = os.path.abspath(MODEL_PATH)
    model_dir = os.path.dirname(model_path)
    os.makedirs(model_dir, exist_ok=True)
    descriptor, temporary_path = tempfile.mkstemp(prefix=".reserve-model-", dir=model_dir)
    os.close(descriptor)
    try:
        joblib.dump({"model": model, "metadata": metadata}, temporary_path)
        os.replace(temporary_path, model_path)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)


def train_candidate(request: TrainingRequest) -> tuple[Pipeline, Dict[str, Any], Dict[str, float]]:
    model = create_pipeline()
    x_frame = pd.DataFrame(
        [extract_features(row.company, row.market) for row in request.rows]
    )
    targets = np.array([row.realizedReserveUsed for row in request.rows])
    model.fit(x_frame, targets)
    predictions = model.predict(x_frame)
    mse = mean_squared_error(targets, predictions)
    r2 = r2_score(targets, predictions)
    metadata = {
        "version": request.modelVersion or MODEL_VERSION,
        "last_trained": time.time(),
        "training_samples": len(request.rows),
        "training_mse": float(mse),
        "training_r2": float(r2),
        "feature_names": list(x_frame.columns),
    }
    persist_model(model, metadata)
    return model, metadata, {"mse": float(mse), "r2": float(r2), "rmse": float(np.sqrt(mse))}


def readiness_probe() -> tuple[Pipeline, Dict[str, Any]]:
    model, metadata = load_persisted_model()
    sample = pd.DataFrame(
        [
            {
                "checkSize": 1.0,
                "invested": 1.0,
                "ownership": 0.01,
                "exitMoic": 2.0,
                "stage": "seed",
                "sector": "unknown",
                "marketScore": 0.5,
                "vix": 20.0,
                "fedFundsRate": 2.5,
                "ust10yYield": 3.0,
                "ipoCount30d": 30,
                "creditSpreadBaa": 1.8,
            }
        ]
    )
    prediction = model.predict(sample)
    if len(prediction) != 1 or not np.isfinite(prediction[0]):
        raise ValueError("Model readiness inference returned an invalid prediction")
    return model, metadata


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    return {"status": "alive", "version": MODEL_VERSION, "timestamp": time.time()}


@app.get("/ready")
async def readiness_check() -> Dict[str, Any]:
    global _model, _model_metadata
    try:
        model, metadata = await asyncio.to_thread(readiness_probe)
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"Model not ready: {error}") from error
    _model, _model_metadata = model, metadata
    return {
        "status": "ready",
        "version": metadata.get("version", MODEL_VERSION),
        "trainingSamples": metadata["training_samples"],
        "timestamp": time.time(),
    }


@app.post("/train")
async def train_model(request: TrainingRequest, http_request: Request) -> Dict[str, Any]:
    global _model, _model_metadata
    require_training_authorization(http_request)
    start_time = time.time()
    async with _training_lock:
        try:
            model, metadata, metrics = await asyncio.to_thread(train_candidate, request)
        except Exception as error:
            logger.exception("Training failed")
            raise HTTPException(status_code=500, detail=f"Training failed: {error}") from error
        _model, _model_metadata = model, metadata

    return {
        "modelVersion": metadata["version"],
        "rows": len(request.rows),
        "trainingTimeMs": int((time.time() - start_time) * 1000),
        "metrics": metrics,
    }


def generate_explanation(
    model: Pipeline, features: Dict[str, Any], prediction: float
) -> Dict[str, Any]:
    regressor = model.named_steps["regressor"]
    preprocessor = model.named_steps["preprocessor"]
    if not hasattr(regressor, "feature_importances_"):
        return {"method": "heuristic", "factors": []}

    feature_names = list(get_feature_columns()["numerical"])
    categorical = preprocessor.named_transformers_["cat"]
    if hasattr(categorical, "get_feature_names_out"):
        feature_names.extend(categorical.get_feature_names_out().tolist())

    ranked = sorted(
        zip(feature_names, regressor.feature_importances_), key=lambda item: item[1], reverse=True
    )[:8]
    return {
        "method": "feature_importance",
        "prediction": prediction,
        "factors": [
            {"feature": name, "importance": float(importance), "input": features.get(name)}
            for name, importance in ranked
        ],
    }


def run_prediction(
    model: Pipeline, metadata: Dict[str, Any], request: PredictRequest
) -> PredictionResponse:
    features = extract_features(request.company, request.market)
    prediction = max(0.0, float(model.predict(pd.DataFrame([features]))[0]))
    base_uncertainty = prediction * 0.15
    market_uncertainty = abs(features["marketScore"] - 0.5) * prediction * 0.1
    total_uncertainty = base_uncertainty + market_uncertainty
    explanation = generate_explanation(model, features, prediction) if request.explain else None
    return PredictionResponse(
        modelVersion=str(metadata.get("version", MODEL_VERSION)),
        prediction={
            "recommendedReserve": prediction,
            "confidence": {
                "low": max(0.0, prediction - total_uncertainty),
                "high": prediction + total_uncertainty,
                "level": request.confidenceLevel,
            },
            "notes": [
                f"ML prediction based on {metadata['training_samples']} training samples",
                f"Market score: {features['marketScore']:.3f}",
                f"Stage: {features['stage']}, Check: ${features['checkSize']:,.0f}",
            ],
        },
        explanation=explanation,
        latencyMs=0,
    )


@app.post("/predict", response_model=PredictionResponse)
async def predict_reserve(request: PredictRequest) -> PredictionResponse:
    global _model, _model_metadata
    start_time = time.time()
    if _model is None or int(_model_metadata.get("training_samples", 0)) <= 0:
        try:
            _model, _model_metadata = await asyncio.to_thread(load_persisted_model)
        except Exception as error:
            raise HTTPException(status_code=503, detail=f"Model unavailable: {error}") from error

    try:
        result = await asyncio.to_thread(run_prediction, _model, dict(_model_metadata), request)
    except Exception as error:
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {error}") from error
    result.latencyMs = int((time.time() - start_time) * 1000)
    return result


@app.get("/model/info")
async def model_info() -> Dict[str, Any]:
    return {
        "version": _model_metadata.get("version", MODEL_VERSION),
        "metadata": _model_metadata,
        "features": get_feature_columns(),
        "modelPath": MODEL_PATH,
        "isTrained": int(_model_metadata.get("training_samples", 0)) > 0,
    }
