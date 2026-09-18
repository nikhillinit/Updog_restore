import os
import tempfile
import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

import app


def request_with_bearer(token: str = "") -> Request:
    headers = []
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode()))
    return Request({"type": "http", "method": "POST", "path": "/train", "headers": headers})


def training_request() -> app.TrainingRequest:
    rows = []
    for index in range(10):
        rows.append(
            app.TrainingRow(
                company=app.Company(
                    id=str(index),
                    fundId="1",
                    name=f"Company {index}",
                    stage="seed",
                    checkSize=100_000 + index,
                    invested=100_000,
                    ownership=0.1,
                ),
                market=app.Market(asOfDate="2026-09-06", marketScore=0.5),
                realizedReserveUsed=50_000 + index * 1_000,
            )
        )
    return app.TrainingRequest(rows=rows)


class MlServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.original_model_path = app.MODEL_PATH
        self.original_key = app.TRAINING_API_KEY
        app._model = None
        app._model_metadata = {}

    def tearDown(self) -> None:
        app.MODEL_PATH = self.original_model_path
        app.TRAINING_API_KEY = self.original_key
        app._model = None
        app._model_metadata = {}

    def test_training_authorization_fails_closed(self) -> None:
        app.TRAINING_API_KEY = ""
        with self.assertRaisesRegex(HTTPException, "training is disabled") as disabled:
            app.require_training_authorization(request_with_bearer())
        self.assertEqual(disabled.exception.status_code, 503)

        app.TRAINING_API_KEY = "expected"
        with self.assertRaisesRegex(HTTPException, "Invalid training credentials") as unauthorized:
            app.require_training_authorization(request_with_bearer("wrong"))
        self.assertEqual(unauthorized.exception.status_code, 401)
        app.require_training_authorization(request_with_bearer("expected"))

    def test_pydantic_v2_patterns_reject_invalid_enums(self) -> None:
        with self.assertRaises(ValidationError):
            app.Company(
                id="1",
                fundId="1",
                name="Invalid",
                stage="unknown",
                checkSize=1,
                invested=1,
                ownership=0.1,
            )

    async def test_training_persists_atomically_and_readiness_runs_inference(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            app.MODEL_PATH = os.path.join(directory, "model.pkl")
            app.TRAINING_API_KEY = "secret"
            result = await app.train_model(training_request(), request_with_bearer("secret"))

            self.assertEqual(result["rows"], 10)
            self.assertTrue(os.path.isfile(app.MODEL_PATH))
            self.assertEqual(os.listdir(directory), ["model.pkl"])
            self.assertEqual((await app.readiness_check())["status"], "ready")
            prediction = await app.predict_reserve(
                app.PredictRequest(
                    company=app.Company(
                        id="prediction",
                        fundId="1",
                        name="Prediction",
                        stage="seed",
                        checkSize=100_000,
                        invested=100_000,
                        ownership=0.1,
                    ),
                    market=app.Market(asOfDate="2026-09-06"),
                )
            )
            self.assertGreaterEqual(prediction.prediction["recommendedReserve"], 0)

            with open(app.MODEL_PATH, "wb") as model_file:
                model_file.write(b"corrupt")
            with self.assertRaisesRegex(HTTPException, "Model not ready"):
                await app.readiness_check()


if __name__ == "__main__":
    unittest.main()
