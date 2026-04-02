import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
import os

# Paths
base_dir = "whoop_data"
phys_path = os.path.join(base_dir, "physiological_cycles.csv")
journal_path = os.path.join(base_dir, "journal_entries.csv")
sleep_path = os.path.join(base_dir, "sleeps.csv")

# 1. Load Data
cycles = pd.read_csv(phys_path)
journal = pd.read_csv(journal_path)
sleeps = pd.read_csv(sleep_path)

# Ensure Cycle start time is datetime and sorted
cycles['Cycle start time'] = pd.to_datetime(cycles['Cycle start time'])
cycles = cycles.sort_values(by='Cycle start time').reset_index(drop=True)

# 2. Shift Day Strain and Energy Burned
# The Recovery score of Cycle N is impacted by the Day Strain of Cycle N-1
cycles['Prev_Day_Strain'] = cycles['Day Strain'].shift(1)
cycles['Prev_Energy_Burned'] = cycles['Energy burned (cal)'].shift(1)

# Select relevant cycle features
cycle_features = cycles[['Cycle start time', 'Recovery score %', 'Prev_Day_Strain', 'Prev_Energy_Burned']].copy()

# 3. Process Journal Entries
# Pivot journal to wide format
journal['Cycle start time'] = pd.to_datetime(journal['Cycle start time'])
journal['Answered yes'] = journal['Answered yes'].map({'True': True, 'true': True, 'False': False, 'false': False, True: True, False: False})
journal_wide = journal.drop_duplicates(subset=['Cycle start time', 'Question text']).pivot(
    index='Cycle start time', 
    columns='Question text', 
    values='Answered yes'
).reset_index()

# Replace NaNs in journal with False (assuming un-answered or missing means False for the analysis purpose)
question_cols = journal_wide.columns.drop('Cycle start time')
journal_wide[question_cols] = journal_wide[question_cols].fillna(False).astype(int)

# 4. Process Sleep Data
sleeps['Cycle start time'] = pd.to_datetime(sleeps['Cycle start time'])
sleep_features = sleeps[['Cycle start time', 'Sleep performance %', 'Asleep duration (min)', 'Sleep need (min)', 'Sleep debt (min)', 'Sleep consistency %']].copy()

# 5. Merge Everything
merged = pd.merge(cycle_features, journal_wide, on='Cycle start time', how='inner')
merged = pd.merge(merged, sleep_features, on='Cycle start time', how='inner')

# Drop rows with missing Recovery score or Prev day strain
final_data = merged.dropna(subset=['Recovery score %', 'Prev_Day_Strain']).copy()

# Separate X and y
X = final_data.drop(columns=['Cycle start time', 'Recovery score %'])
y = final_data['Recovery score %']

# Fill any remaining NaNs in X with medians
X = X.fillna(X.median(numeric_only=True))

# Ensure all columns are numeric
for col in X.columns:
    if X[col].dtype == object:
        X[col] = pd.to_numeric(X[col], errors='coerce').fillna(0)

# Train Test Split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train Random Forest
model = RandomForestRegressor(n_estimators=200, random_state=42, max_depth=7)
model.fit(X_train, y_train)

# Predict
preds = model.predict(X_test)
mae = mean_absolute_error(y_test, preds)
r2 = r2_score(y_test, preds)

print("=== WHOOP RECOVERY MODEL RESULTS ===")
print(f"Rows of training data: {len(X_train)}, Testing: {len(X_test)}")
print(f"Mean Absolute Error   : {mae:.2f} % (On average, our prediction is off by {mae:.2f}%)")
print(f"R-squared (R2)        : {r2:.2f}")

# Feature Importances
importances = model.feature_importances_
indices = np.argsort(importances)[::-1]

print("\n=== TOP 15 DRIVERS OF RECOVERY SCORE ===")
for i in range(min(15, len(indices))):
    col = X.columns[indices[i]]
    imp = importances[indices[i]]
    print(f"{i+1}. {col:40s} - {imp*100:.1f}% importance")

# Build a small correlation to show direction
print("\n=== DIRECTION OF TOP DRIVERS ===")
for i in range(min(5, len(indices))):
    col = X.columns[indices[i]]
    corr = final_data['Recovery score %'].corr(final_data[col])
    direction = "Positively" if corr > 0 else "Negatively"
    print(f"- {col} {direction} correlates with Recovery (r={corr:.2f})")

with open('model_insights.txt', 'w') as f:
    f.write("=== WHOOP RECOVERY MODEL RESULTS ===\n")
    f.write(f"Mean Absolute Error   : {mae:.2f} %\n")
    f.write("\n=== TOP 15 DRIVERS ===\n")
    for i in range(min(15, len(indices))):
        f.write(f"{i+1}. {X.columns[indices[i]]} - {importances[indices[i]]*100:.1f}%\n")
    f.write("\n=== DIRECTION OF TOP DRIVERS ===\n")
    for i in range(min(5, len(indices))):
        col = X.columns[indices[i]]
        corr = final_data['Recovery score %'].corr(final_data[col])
        direction = "Positively" if corr > 0 else "Negatively"
        f.write(f"- {col} {direction} correlates with Recovery (r={corr:.2f})\n")
