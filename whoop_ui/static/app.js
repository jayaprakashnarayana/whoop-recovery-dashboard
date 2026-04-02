const API_BASE = '/api';

let currentFeatures = [];
let defaultValues = {};
let fullData = [];

let historyChartInst = null;
let sleepChartInst = null;
let scatterChartInst = null;

// Ensure standard Chart.js defaults
Chart.defaults.color = '#94a3b8';

// 1. Fetch History and Render Charts
async function fetchHistory() {
    try {
        const response = await fetch(`${API_BASE}/history`);
        const data = await response.json();
        
        if (!data || data.length === 0) return;
        fullData = data;
        
        // Initial render with 30 days
        renderAllCharts(30);

        // Bind filter buttons
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const days = parseInt(e.target.dataset.days);
                renderAllCharts(days);
            });
        });

    } catch (err) {
        console.error('Failed to load history', err);
    }
}

function renderAllCharts(days) {
    let dataSlice = fullData;
    if (fullData.length > days) {
        dataSlice = fullData.slice(fullData.length - days);
    }

    renderHistoryChart(dataSlice);
    renderSleepChart(dataSlice);
    renderScatterChart(dataSlice);
}

function renderHistoryChart(data) {
    const labels = data.map(d => d['Cycle start time']);
    const recoveryData = data.map(d => d['Recovery score %']);
    const strainData = data.map(d => d['Day Strain']);

    const ctx = document.getElementById('historyChart').getContext('2d');
    if (historyChartInst) historyChartInst.destroy();

    historyChartInst = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Recovery %',
                    data: recoveryData,
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Day Strain',
                    data: strainData,
                    borderColor: '#3498db',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { maxTicksLimit: 10 }, grid: { display:false } },
                y: { 
                    type: 'linear', display: true, position: 'left',
                    min: 0, max: 100,
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y1: {
                    type: 'linear', display: true, position: 'right',
                    min: 0, max: 21,
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function renderSleepChart(data) {
    const labels = data.map(d => d['Cycle start time']);
    const perfData = data.map(d => d['Sleep performance %']);
    const debtData = data.map(d => d['Sleep debt (min)'] / 60); // convert to hours for chart mapping readability

    const ctx = document.getElementById('sleepChart').getContext('2d');
    if (sleepChartInst) sleepChartInst.destroy();

    sleepChartInst = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Sleep Perf %',
                    data: perfData,
                    borderColor: '#9b59b6',
                    backgroundColor: 'rgba(155, 89, 182, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Sleep Debt (hrs)',
                    data: debtData,
                    borderColor: '#e74c3c',
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { maxTicksLimit: 10 }, grid: { display:false } },
                y: { 
                    type: 'linear', display: true, position: 'left',
                    min: 0, max: 100,
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y1: {
                    type: 'linear', display: true, position: 'right',
                    min: 0,
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function renderScatterChart(data) {
    // Scatter Asleep Duration vs Recovery Score
    const scatterData = data.map(d => ({
        x: d['Asleep duration (min)'] / 60, // hours
        y: d['Recovery score %']
    }));

    const ctx = document.getElementById('scatterChart').getContext('2d');
    if (scatterChartInst) scatterChartInst.destroy();

    scatterChartInst = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Sleep vs Recovery',
                data: scatterData,
                backgroundColor: 'rgba(52, 152, 219, 0.6)',
                borderColor: '#3498db'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { 
                    title: { display: true, text: 'Asleep Duration (Hours)', color: '#e2e8f0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: { 
                    min: 0, max: 100,
                    title: { display: true, text: 'Recovery Score %', color: '#e2e8f0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

// 2. Fetch Insights
async function fetchInsights() {
    try {
        const response = await fetch(`${API_BASE}/insights`);
        const data = await response.json();
        
        const list = document.getElementById('insights-list');
        list.innerHTML = '';
        data.slice(0, 5).forEach(item => {
            list.innerHTML += `
                <li>
                    <span class="insight-name">${item.feature}</span>
                    <span class="insight-val">${item.importance}%</span>
                </li>
            `;
        });
    } catch (err) {
        console.error('Failed to load insights', err);
    }
}

// 3. Build Form from Features
async function buildForm() {
    try {
        const response = await fetch(`${API_BASE}/features`);
        const data = await response.json();
        currentFeatures = data.features;
        defaultValues = data.defaults;

        const form = document.getElementById('simulator-form');
        form.innerHTML = '';

        const priorityContinuous = ['Asleep duration (min)', 'Prev_Day_Strain', 'Sleep debt (min)'];
        const priorityBooleans = ['Consumed protein?', 'Shared your bed?', 'Saw direct sunlight upon waking up?'];

        priorityContinuous.forEach(f => {
            if (currentFeatures.includes(f)) {
                let max = 100;
                let step = 1;
                if (f.includes('min')) { max = 600; step = 10; }
                if (f.includes('Strain')) { max = 21; step = 0.5; }

                let def = defaultValues[f] || 0;
                
                form.innerHTML += `
                    <div class="control-group">
                        <label>${f}</label>
                        <input type="range" id="input-${f}" data-feature="${f}" min="0" max="${max}" step="${step}" value="${def}">
                        <div class="range-vals"><span>0</span><span id="val-${f}">${def}</span><span>${max}</span></div>
                    </div>
                `;
            }
        });

        priorityBooleans.forEach(f => {
            if (currentFeatures.includes(f)) {
                let isChecked = defaultValues[f] === 1 ? 'checked' : '';
                form.innerHTML += `
                    <div class="control-group" style="flex-direction:row; justify-content:space-between; align-items:center;">
                        <label style="margin:0">${f}</label>
                        <label class="toggle-switch">
                            <input type="checkbox" id="input-${f}" data-feature="${f}" ${isChecked}>
                            <span class="slider"></span>
                        </label>
                    </div>
                `;
            }
        });

        form.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', (e) => {
                if (e.target.type === 'range') {
                    document.getElementById(`val-${e.target.dataset.feature}`).innerText = e.target.value;
                }
                updatePrediction();
            });
        });

        updatePrediction();
    } catch (err) {
        console.error('Failed to build form', err);
    }
}

// 4. Update Prediction
async function updatePrediction() {
    const payload = {};
    const form = document.getElementById('simulator-form');
    
    currentFeatures.forEach(f => {
        payload[f] = defaultValues[f] || 0;
        const el = document.getElementById(`input-${f}`);
        if (el) {
            if (el.type === 'checkbox') {
                payload[f] = el.checked ? 1 : 0;
            } else {
                payload[f] = parseFloat(el.value);
            }
        }
    });

    try {
        const response = await fetch(`${API_BASE}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        let score = data.predicted_recovery;
        const display = document.getElementById('score-display');
        display.innerText = `${score}%`;
        
        display.className = 'score-circle'; // reset
        if (score >= 67) display.classList.add('score-green');
        else if (score >= 34) display.classList.add('score-yellow');
        else display.classList.add('score-red');

    } catch (err) {
        console.error('Failed to predict', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchHistory();
    fetchInsights();
    buildForm();

    const uploadInput = document.getElementById('csv-upload');
    const statusText = document.getElementById('upload-status');
    
    uploadInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (files.length === 0) return;
        
        statusText.innerText = `Uploading ${files.length} files and re-training model...`;
        
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('file', files[i]);
        }
        
        try {
            const res = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                body: formData
            });
            const result = await res.json();
            
            if (result.success) {
                statusText.innerText = "Model Retrained Successfully!";
                statusText.style.color = 'var(--whoop-green)';
                // Re-fetch all data to redraw EVERYTHING!
                fetchHistory();
                fetchInsights();
                buildForm();
                setTimeout(() => statusText.innerText = "", 3000);
            } else {
                statusText.innerText = "Error: " + result.error;
                statusText.style.color = 'var(--whoop-red)';
            }
        } catch (err) {
            statusText.innerText = "Upload failed.";
            statusText.style.color = 'var(--whoop-red)';
        }
    });
});
