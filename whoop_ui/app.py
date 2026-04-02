from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
import os

app = Flask(__name__, static_folder='static')
CORS(app)

# Global variables for model and data
model = None
X_train = None
feature_columns = None
historical_data = None
importances_list = []

def load_and_train():
    global model, X_train, feature_columns, historical_data, importances_list
    base_dir = os.path.join(os.path.dirname(__file__), "..", "whoop_data")
    phys_path = os.path.join(base_dir, "physiological_cycles.csv")
    journal_path = os.path.join(base_dir, "journal_entries.csv")
    sleep_path = os.path.join(base_dir, "sleeps.csv")

    try:
        cycles = pd.read_csv(phys_path)
        journal = pd.read_csv(journal_path)
        sleeps = pd.read_csv(sleep_path)
    except FileNotFoundError:
        print("Data files not found. Ensure whoop_data exists in the parent directory.")
        return

    cycles['Cycle start time'] = pd.to_datetime(cycles['Cycle start time'])
    cycles = cycles.sort_values(by='Cycle start time').reset_index(drop=True)
    cycles['Prev_Day_Strain'] = cycles['Day Strain'].shift(1)
    cycles['Prev_Energy_Burned'] = cycles['Energy burned (cal)'].shift(1)

    cycle_features = cycles[['Cycle start time', 'Recovery score %', 'Prev_Day_Strain', 'Prev_Energy_Burned', 'Day Strain']].copy()

    journal['Cycle start time'] = pd.to_datetime(journal['Cycle start time'])
    journal['Answered yes'] = journal['Answered yes'].map({'True': True, 'true': True, 'False': False, 'false': False, True: True, False: False})
    journal_wide = journal.drop_duplicates(subset=['Cycle start time', 'Question text']).pivot(
        index='Cycle start time', 
        columns='Question text', 
        values='Answered yes'
    ).reset_index()
    question_cols = journal_wide.columns.drop('Cycle start time')
    journal_wide[question_cols] = journal_wide[question_cols].fillna(False).astype(int)
    journal_wide['Cycle start time'] = pd.to_datetime(journal_wide['Cycle start time'])

    sleeps['Cycle start time'] = pd.to_datetime(sleeps['Cycle start time'])
    sleep_features = sleeps[['Cycle start time', 'Sleep performance %', 'Asleep duration (min)', 'Sleep need (min)', 'Sleep debt (min)', 'Sleep consistency %']].copy()

    merged = pd.merge(cycle_features, journal_wide, on='Cycle start time', how='inner')
    merged = pd.merge(merged, sleep_features, on='Cycle start time', how='inner')

    final_data = merged.dropna(subset=['Recovery score %', 'Prev_Day_Strain']).copy()

    # Save historical data for charting
    historical_data = final_data.copy()
    historical_data['Cycle start time'] = historical_data['Cycle start time'].dt.strftime('%Y-%m-%d')

    X = final_data.drop(columns=['Cycle start time', 'Recovery score %', 'Day Strain'])
    y = final_data['Recovery score %']

    X = X.fillna(X.median(numeric_only=True))

    for col in X.columns:
        if X[col].dtype == object:
            X[col] = pd.to_numeric(X[col], errors='coerce').fillna(0)

    feature_columns = list(X.columns)

    model = RandomForestRegressor(n_estimators=200, random_state=42, max_depth=7)
    model.fit(X, y)
    X_train = X

    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1]

    importances_list = []
    for i in range(min(10, len(indices))):
        col = X.columns[indices[i]]
        imp = importances[indices[i]]
        importances_list.append({"feature": col, "importance": round(imp * 100, 1)})

# Initialize on startup
load_and_train()

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/history')
def get_history():
    if historical_data is None:
        return jsonify([])
    
    raw_dicts = historical_data[[
        'Cycle start time', 'Recovery score %', 'Day Strain', 
        'Sleep performance %', 'Asleep duration (min)', 'Sleep debt (min)'
    ]].to_dict(orient='records')
    
    res = []
    for row in raw_dicts:
        clean_row = {}
        for k, v in row.items():
            if pd.isna(v):
                clean_row[k] = None
            else:
                clean_row[k] = v
        res.append(clean_row)
        
    return jsonify(res)

@app.route('/api/insights')
def get_insights():
    return jsonify(importances_list)

@app.route('/api/features')
def get_features():
    # Return features and their medians for defaults
    defaults = {}
    if X_train is not None:
        raw_defs = X_train.median().to_dict()
        for k, v in raw_defs.items():
            if pd.isna(v):
                defaults[k] = None
            else:
                defaults[k] = v
    return jsonify({"features": feature_columns, "defaults": defaults})

@app.route('/api/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({"error": "Model not trained"}), 500
    
    data = request.json
    row = []
    
    medians = X_train.median()
    for col in feature_columns:
        if col in data:
            row.append(float(data[col]))
        else:
            row.append(medians[col])
            
    df = pd.DataFrame([row], columns=feature_columns)
    pred_score = model.predict(df)[0]
    return jsonify({"predicted_recovery": round(pred_score, 1)})

@app.route('/api/upload', methods=['POST'])
def upload_files():
    base_dir = os.path.join(os.path.dirname(__file__), "..", "whoop_data")
    if not os.path.exists(base_dir):
        os.makedirs(base_dir)

    uploaded_files = request.files.getlist("file")
    if not uploaded_files:
        return jsonify({"error": "No files uploaded"}), 400

    for file in uploaded_files:
        if file.filename:
            file.save(os.path.join(base_dir, file.filename))
            
    # Retrain model with new data
    load_and_train()
    
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
