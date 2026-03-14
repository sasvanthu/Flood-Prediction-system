from __future__ import annotations

import json
import re
from pathlib import Path

import joblib
import matplotlib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier, plot_importance

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

DATASET_CANDIDATES = [
    Path('flood_risk_dataset_india.csv'),
    Path('dataset.csv'),
]

TARGET_ALIASES = {
    'flood',
    'floodoccurred',
    'floodrisk',
}


def normalize_column_name(column_name: str) -> str:
    cleaned = column_name.replace('\ufeff', '').replace('Â', '')
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


def canonical_name(column_name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', column_name.lower())


def load_dataset() -> tuple[pd.DataFrame, Path]:
    for path in DATASET_CANDIDATES:
        if path.exists():
            frame = pd.read_csv(path)
            frame.columns = [normalize_column_name(c) for c in frame.columns]
            return frame, path

    searched = ', '.join(str(p) for p in DATASET_CANDIDATES)
    raise FileNotFoundError(f'No dataset found. Expected one of: {searched}')


def find_target_column(columns: list[str]) -> str:
    for column in columns:
        if canonical_name(column) in TARGET_ALIASES:
            return column

    raise ValueError(
        'Target column not found. Expected aliases: '
        + ', '.join(sorted(TARGET_ALIASES))
    )


def coerce_target(series: pd.Series) -> pd.Series:
    if series.dtype == bool:
        return series.astype(int)

    if pd.api.types.is_numeric_dtype(series):
        return series.fillna(0).astype(int)

    normalized = series.astype(str).str.strip().str.lower().map(
        {
            '1': 1,
            '0': 0,
            'yes': 1,
            'no': 0,
            'true': 1,
            'false': 0,
            'flood': 1,
            'safe': 0,
        }
    )

    return normalized.fillna(0).astype(int)


def preprocess_features(features: pd.DataFrame) -> pd.DataFrame:
    output = features.copy()

    numeric_columns = output.select_dtypes(include=['number']).columns
    categorical_columns = output.select_dtypes(exclude=['number']).columns

    if len(numeric_columns) > 0:
        output[numeric_columns] = output[numeric_columns].fillna(output[numeric_columns].median())

    for column in categorical_columns:
        mode_value = output[column].mode(dropna=True)
        fill_value = mode_value.iloc[0] if not mode_value.empty else 'Unknown'
        output[column] = output[column].fillna(fill_value).astype(str)

    return output


def build_pipeline(feature_frame: pd.DataFrame) -> Pipeline:
    numeric_columns = feature_frame.select_dtypes(include=['number']).columns.tolist()
    categorical_columns = feature_frame.select_dtypes(exclude=['number']).columns.tolist()

    preprocessor = ColumnTransformer(
        transformers=[
            ('numeric', 'passthrough', numeric_columns),
            (
                'categorical',
                OneHotEncoder(handle_unknown='ignore', sparse_output=False),
                categorical_columns,
            ),
        ]
    )

    model = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        random_state=42,
        eval_metric='logloss',
    )

    return Pipeline(
        steps=[
            ('preprocessor', preprocessor),
            ('model', model),
        ]
    )


def main() -> None:
    data, path = load_dataset()
    print(f'Loaded dataset: {path}')
    print(f'Shape: {data.shape}')

    target_column = find_target_column(data.columns.tolist())
    features = preprocess_features(data.drop(columns=[target_column]))
    target = coerce_target(data[target_column])

    print('\nTarget column:', target_column)
    print('Features used:', ', '.join(features.columns))

    stratify_target = target if target.nunique() > 1 else None

    x_train, x_test, y_train, y_test = train_test_split(
        features,
        target,
        test_size=0.2,
        random_state=42,
        stratify=stratify_target,
    )

    pipeline = build_pipeline(features)

    print('\nTraining model...')
    pipeline.fit(x_train, y_train)

    predictions = pipeline.predict(x_test)

    accuracy = accuracy_score(y_test, predictions)
    precision = precision_score(y_test, predictions, zero_division=0)
    recall = recall_score(y_test, predictions, zero_division=0)
    f1 = f1_score(y_test, predictions, zero_division=0)
    matrix = confusion_matrix(y_test, predictions, labels=[0, 1])

    print('\nModel Performance')
    print(f'Accuracy : {accuracy:.4f}')
    print(f'Precision: {precision:.4f}')
    print(f'Recall   : {recall:.4f}')
    print(f'F1 Score : {f1:.4f}')
    print('\nClassification Report:')
    print(classification_report(y_test, predictions, zero_division=0))

    metrics_payload = {
        'dataset': str(path),
        'target_column': target_column,
        'sample_size': int(len(data)),
        'train_size': int(len(x_train)),
        'test_size': int(len(x_test)),
        'accuracy': float(round(accuracy, 4)),
        'precision': float(round(precision, 4)),
        'recall': float(round(recall, 4)),
        'f1_score': float(round(f1, 4)),
        'confusion_matrix': {
            'tn': int(matrix[0][0]),
            'fp': int(matrix[0][1]),
            'fn': int(matrix[1][0]),
            'tp': int(matrix[1][1]),
        },
    }

    joblib.dump(pipeline, 'flood_model.pkl')
    with Path('model_metrics.json').open('w', encoding='utf-8') as file:
        json.dump(metrics_payload, file, indent=2)

    model = pipeline.named_steps['model']
    fig, ax = plt.subplots(figsize=(10, 6))
    plot_importance(model, max_num_features=15, ax=ax)
    ax.set_title('Flood Risk Feature Importance')
    fig.tight_layout()
    fig.savefig('feature_importance.png', dpi=180)
    plt.close(fig)

    print('\nSaved artifacts:')
    print('- flood_model.pkl')
    print('- model_metrics.json')
    print('- feature_importance.png')


if __name__ == '__main__':
    main()
