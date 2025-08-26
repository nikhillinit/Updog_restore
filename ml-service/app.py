"""
ML Reserve Prediction Service
FastAPI microservice for machine learning enhanced reserve allocation
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import time
import joblib
import os
import logging
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_squared_error, r2_score
import pandas as pd

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Reserve ML Service", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
MODEL_PATH = os.getenv("MODEL_PATH", "./model.pkl")
MODEL_VERSION = os.getenv("MODEL_VERSION", "ml-gbrt-v1.0")
CONFIDENCE_LEVEL = float(os.getenv("CONFIDENCE_LEVEL", "0.8"))

# Global model instance
_model: Optional[Pipeline] = None
_model_metadata: Dict[str, Any] = {}

class Company(BaseModel):
    id: str
    fundId: str
    name: str
    stage: str = Field(..., regex="^(preseed|seed|series_a|series_b|series_c|series_dplus)$")
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
    actualOutcome: Optional[str] = Field(None, regex="^(success|failure|partial)$")

class TrainingRequest(BaseModel):
    rows: List[TrainingRow] = Field(..., min_items=10)  # Minimum 10 rows for training
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

def get_feature_columns():
    """Define feature columns for consistent processing"""
    return {
        'numerical': [
            'checkSize', 'invested', 'ownership', 'exitMoic',
            'marketScore', 'vix', 'fedFundsRate', 'ust10yYield', 'ipoCount30d', 'creditSpreadBaa'
        ],
        'categorical': ['stage', 'sector']
    }

def create_pipeline() -> Pipeline:
    """Create a new ML pipeline"""
    features = get_feature_columns()
    
    # Create column transformer
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), features['numerical']),
            ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), features['categorical'])
        ],
        remainder='drop'
    )
    
    # Create full pipeline
    model = GradientBoostingRegressor(
        n_estimators=100,
        learning_rate=0.1,
        max_depth=6,
        random_state=42,
        validation_fraction=0.2,
        n_iter_no_change=10,
        tol=1e-4
    )
    
    pipeline = Pipeline([
        ('preprocessor', preprocessor),
        ('regressor', model)
    ])
    
    return pipeline

def load_or_create_model() -> Pipeline:
    """Load existing model or create new one"""
    global _model, _model_metadata
    
    if _model is not None:
        return _model
        
    if os.path.exists(MODEL_PATH):
        try:
            saved_data = joblib.load(MODEL_PATH)
            _model = saved_data['model']
            _model_metadata = saved_data.get('metadata', {})
            logger.info(f"Loaded model from {MODEL_PATH}")
            return _model
        except Exception as e:
            logger.warning(f"Failed to load model: {e}, creating new one")
    
    _model = create_pipeline()
    _model_metadata = {
        'version': MODEL_VERSION,
        'created_at': time.time(),
        'training_samples': 0,
        'features': get_feature_columns()
    }
    
    logger.info("Created new model pipeline")
    return _model

def extract_features(company: Company, market: Market) -> Dict[str, Any]:
    """Extract features from company and market data"""
    return {
        # Company features
        'checkSize': company.checkSize,
        'invested': company.invested,
        'ownership': company.ownership,
        'exitMoic': company.exitMoic or 2.0,  # Default assumption
        'stage': company.stage,
        'sector': company.sector or 'unknown',
        
        # Market features
        'marketScore': market.marketScore or 0.5,  # Neutral default
        'vix': market.vix or 20.0,  # Neutral VIX
        'fedFundsRate': market.fedFundsRate or 2.5,
        'ust10yYield': market.ust10yYield or 3.0,
        'ipoCount30d': market.ipoCount30d or 30,
        'creditSpreadBaa': market.creditSpreadBaa or 1.8,
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    model_loaded = _model is not None
    model_path_exists = os.path.exists(MODEL_PATH)
    
    return {
        "status": "ok",
        "modelLoaded": model_loaded,
        "modelPathExists": model_path_exists,
        "version": MODEL_VERSION,
        "timestamp": time.time()
    }

@app.post("/train")
async def train_model(request: TrainingRequest):
    """Train or retrain the ML model"""
    start_time = time.time()
    
    try:
        model = load_or_create_model()
        
        # Extract features and targets
        X_data = []
        y_data = []
        
        for row in request.rows:
            features = extract_features(row.company, row.market)
            X_data.append(features)
            y_data.append(row.realizedReserveUsed)
        
        # Convert to DataFrame for consistent column ordering
        X_df = pd.DataFrame(X_data)
        y_array = np.array(y_data)
        
        # Fit the model
        model.fit(X_df, y_array)
        
        # Calculate training metrics
        y_pred = model.predict(X_df)
        mse = mean_squared_error(y_array, y_pred)
        r2 = r2_score(y_array, y_pred)
        
        # Update metadata
        _model_metadata.update({
            'last_trained': time.time(),
            'training_samples': len(request.rows),
            'training_mse': float(mse),
            'training_r2': float(r2),
            'feature_names': list(X_df.columns)
        })
        
        # Save model with metadata
        model_data = {
            'model': model,
            'metadata': _model_metadata
        }
        joblib.dump(model_data, MODEL_PATH)
        
        training_time = int((time.time() - start_time) * 1000)
        
        logger.info(f"Model trained successfully: R2={r2:.3f}, MSE={mse:.0f}, time={training_time}ms")
        
        return {
            "modelVersion": request.modelVersion or MODEL_VERSION,
            "rows": len(request.rows),
            "trainingTimeMs": training_time,
            "metrics": {
                "mse": float(mse),
                "r2": float(r2),
                "rmse": float(np.sqrt(mse))
            }
        }
        
    except Exception as e:
        logger.error(f"Training failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")

@app.post("/predict", response_model=PredictionResponse)
async def predict_reserve(request: PredictRequest):
    """Predict reserve allocation for a company"""
    start_time = time.time()
    
    try:
        model = load_or_create_model()
        
        # Check if model is trained
        if _model_metadata.get('training_samples', 0) == 0:
            raise HTTPException(
                status_code=400, 
                detail="Model not trained. Call /train endpoint first."
            )
        
        # Extract features
        features = extract_features(request.company, request.market)
        X_df = pd.DataFrame([features])
        
        # Make prediction
        prediction = float(model.predict(X_df)[0])
        prediction = max(0.0, prediction)  # Ensure non-negative
        
        # Calculate confidence interval (simplified approach)
        # In production, use proper prediction intervals
        base_uncertainty = prediction * 0.15  # 15% base uncertainty
        market_uncertainty = abs(features['marketScore'] - 0.5) * prediction * 0.1
        total_uncertainty = base_uncertainty + market_uncertainty
        
        confidence_low = max(0.0, prediction - total_uncertainty)
        confidence_high = prediction + total_uncertainty
        
        # Generate explanation if requested
        explanation = None
        if request.explain:
            try:
                explanation = generate_explanation(model, features, prediction)
            except Exception as e:
                logger.warning(f"Failed to generate explanation: {e}")
                explanation = {
                    "method": "feature_importance",
                    "details": {"error": "Explanation generation failed"}
                }
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        result = PredictionResponse(
            modelVersion=MODEL_VERSION,
            prediction={
                "recommendedReserve": prediction,
                "confidence": {
                    "low": confidence_low,
                    "high": confidence_high,
                    "level": request.confidenceLevel
                },
                "notes": [
                    f"ML prediction based on {_model_metadata.get('training_samples', 0)} training samples",
                    f"Market score: {features['marketScore']:.3f}",
                    f"Stage: {features['stage']}, Check: ${features['checkSize']:,.0f}"
                ]
            },
            explanation=explanation,
            latencyMs=latency_ms
        )
        
        logger.info(f"Prediction completed: {prediction:.0f}, latency={latency_ms}ms")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Prediction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

def generate_explanation(model: Pipeline, features: Dict[str, Any], prediction: float) -> Dict[str, Any]:
    """Generate explanation for the prediction"""
    try:
        # Get feature importances from the trained model
        regressor = model.named_steps['regressor']
        preprocessor = model.named_steps['preprocessor']
        
        if hasattr(regressor, 'feature_importances_'):
            importances = regressor.feature_importances_
            
            # Get feature names after preprocessing
            feature_names = []
            
            # Add numerical feature names
            num_features = get_feature_columns()['numerical']
            feature_names.extend(num_features)
            
            # Add categorical feature names (after one-hot encoding)
            try:
                cat_transformer = preprocessor.named_transformers_['cat']
                if hasattr(cat_transformer, 'get_feature_names_out'):
                    cat_features = cat_transformer.get_feature_names_out()
                    feature_names.extend(cat_features)
                else:
                    # Fallback for older sklearn versions
                    cat_features = get_feature_columns()['categorical']
                    feature_names.extend(cat_features)
            except:
                pass
            
            # Create feature importance dictionary
            feature_importance = {}
            for i, importance in enumerate(importances):
                if i < len(feature_names):
                    feature_importance[feature_names[i]] = float(importance)
            
            # Sort by importance
            top_features = sorted(
                feature_importance.items(), 
                key=lambda x: x[1], 
                reverse=True
            )[:8]
            
            return {
                "method": "feature_importance",
                "details": dict(top_features),
                "topFactors": [
                    {
                        "factor": name,
                        "importance": importance,
                        "direction": "positive" if importance > 0 else "negative"
                    }
                    for name, importance in top_features
                ]
            }
    except Exception as e:
        logger.warning(f"Feature importance extraction failed: {e}")
    
    # Fallback explanation
    return {
        "method": "feature_importance",
        "details": {
            "stage_factor": 0.3,
            "market_factor": 0.25,
            "size_factor": 0.2,
            "ownership_factor": 0.15,
            "other_factors": 0.1
        }
    }

@app.get("/model/info")
async def get_model_info():
    """Get information about the current model"""
    load_or_create_model()  # Ensure model is loaded
    
    return {
        "version": MODEL_VERSION,
        "metadata": _model_metadata,
        "features": get_feature_columns(),
        "modelPath": MODEL_PATH,
        "isTrained": _model_metadata.get('training_samples', 0) > 0
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8088)