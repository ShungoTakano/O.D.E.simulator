document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const ctx = document.getElementById('solution-chart').getContext('2d');
    const formulaTypeSelect = document.getElementById('formula-type');
    const stepSlider = document.getElementById('step-slider');
    const hValueSpan = document.getElementById('h-value');
    const customTooltip = document.getElementById('custom-tooltip');
    const checkboxes = {
        true: document.getElementById('show-true'),
        euler: document.getElementById('show-euler'),
        rk2: document.getElementById('show-rk2'),
        rk4: document.getElementById('show-rk4'),
    };
    const resetZoomBtn = document.getElementById('reset-zoom-btn'); // ★変更: ボタン要素を取得

    // --- 物理モデルの設定 ---
    const models = {
        'air-resistance': {
            label: '空気抵抗を受ける物体の落下運動',
            yAxisLabel: '速度 (v)',
            t_max: 10.0,
            initialValue: [0], // [v0]
            f: (t, y) => { // y = [v]
                const [v] = y;
                const g = 9.81, m = 1.0, k = 0.5;
                return [g - (k / m) * v];
            },
            trueSolution: (t) => {
                const g = 9.81, m = 1.0, k = 0.5;
                return [(m * g / k) * (1 - Math.exp(-k * t / m))];
            }
        },
        'damped-oscillation': {
            label: 'ばねの減衰運動',
            yAxisLabel: '位置 (x)',
            t_max: 20.0,
            initialValue: [1.0, 0], // [x0, v0]
            f: (t, y) => { // y = [x, v]
                const [x, v] = y;
                const m = 1.0, c = 0.5, k = 2.0; // 質量, 減衰係数, ばね定数
                const dv_dt = -(c / m) * v - (k / m) * x;
                return [v, dv_dt]; // [dx/dt, dv/dt]
            },
            trueSolution: (t) => { // Underdamped case
                const m = 1.0, c = 0.5, k = 2.0;
                const gamma = c / (2 * m);
                const omega_d = Math.sqrt(k / m - gamma * gamma);
                return [Math.exp(-gamma * t) * (1.0 * Math.cos(omega_d * t) + (gamma / omega_d) * Math.sin(omega_d * t))];
            }
        }
    };

    let currentModel = models[formulaTypeSelect.value];
    
    // ベクトル演算のヘルパー関数
    const vecAdd = (v1, v2) => v1.map((val, i) => val + v2[i]);
    const vecScale = (v, s) => v.map(val => val * s);

    // --- 数値解法（ベクトル対応） ---
    const solve = (solverFunc, h) => {
        const points = [];
        let t = 0;
        let y = [...currentModel.initialValue];
        while (t <= currentModel.t_max) {
            points.push({ x: t, y: y[0] }); // 位置(x)または速度(v)をプロット
            y = solverFunc(t, y, h);
            t = t + h;
        }
        return points;
    };
    
    const eulerStep = (t, y, h) => vecAdd(y, vecScale(currentModel.f(t, y), h));
    const rk2Step = (t, y, h) => {
        const k1 = currentModel.f(t, y);
        const k2 = currentModel.f(t + h / 2, vecAdd(y, vecScale(k1, h / 2)));
        return vecAdd(y, vecScale(k2, h));
    };
    const rk4Step = (t, y, h) => {
        const k1 = currentModel.f(t, y);
        const k2 = currentModel.f(t + h / 2, vecAdd(y, vecScale(k1, h / 2)));
        const k3 = currentModel.f(t + h / 2, vecAdd(y, vecScale(k2, h / 2)));
        const k4 = currentModel.f(t + h, vecAdd(y, vecScale(k3, h)));
        const weighted_k = vecAdd(vecAdd(vecAdd(k1, vecScale(k2, 2)), vecScale(k3, 2)), k4);
        return vecAdd(y, vecScale(weighted_k, h / 6));
    };

    // 真の解のデータ生成
    const getTrueSolutionPoints = () => {
        const points = [];
        const t_max = currentModel.t_max;
        for (let t = 0; t <= t_max; t += 0.05) {
            points.push({ x: t, y: currentModel.trueSolution(t)[0] });
        }
        return points;
    };

    // --- グラフの初期化と設定 ---
    const crosshairPlugin = {
        id: 'crosshair',
        afterDraw: chart => {
            if (chart.tooltip._active && chart.tooltip._active.length) {
                const activePoint = chart.tooltip._active[0];
                const ctx = chart.ctx;
                const x = activePoint.element.x;
                const topY = chart.scales.y.top;
                const bottomY = chart.scales.y.bottom;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, topY);
                ctx.lineTo(x, bottomY);
                ctx.lineWidth = 1;
                ctx.strokeStyle = '#666';
                ctx.stroke();
                ctx.restore();
            }
        }
    };

    const chart = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: [ /* ... datasets ... */ ] },
        options: { /* ... options ... */ },
        plugins: [crosshairPlugin]
    });

    chart.options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { type: 'linear', position: 'bottom', title: { display: true, text: '時間 (t)' } },
            y: { title: { display: true, text: currentModel.yAxisLabel } }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                enabled: false, // 標準ツールチップを無効化
            },
            // ★変更: ズームプラグインの設定を追加
            zoom: {
                pan: {
                    enabled: true, // パン(ドラッグでの移動)を有効化
                    mode: 'xy',    // X軸、Y軸ともにパン可能
                    threshold: 5,  // 5pxドラッグしたらパン開始
                },
                zoom: {
                    wheel: {
                        enabled: true, // マウスホイールでのズームを有効化
                    },
                    pinch: {
                        enabled: true // ピンチ操作でのズームを有効化 (モバイル向け)
                    },
                    drag: {
                        enabled: true, // ドラッグでの範囲選択ズームを有効化
                        backgroundColor: 'rgba(52, 152, 219, 0.2)' // 選択範囲の背景色
                    },
                    mode: 'xy', // X軸、Y軸ともにズーム可能
                }
            }
        },
        interaction: {
            mode: 'index',
            intersect: false,
        },
    };
    chart.data.datasets = [
        { label: '真の解', data: [], borderColor: '#2ecc71', backgroundColor: '#2ecc71', showLine: true, pointRadius: 0, borderWidth: 3 },
        { label: 'オイラー法 (1次)', data: [], borderColor: '#e74c3c', backgroundColor: '#e74c3c', showLine: true, borderDash: [5, 5] },
        { label: 'ルンゲ・クッタ法 (2次)', data: [], borderColor: '#f39c12', backgroundColor: '#f39c12', showLine: true },
        { label: 'ルンゲ・クッタ法 (4次)', data: [], borderColor: '#3498db', backgroundColor: '#3498db', showLine: true }
    ];
    
    // 線形補間でカーソル位置のy値を計算
    const interpolate = (dataset, xValue) => {
        const data = dataset.data;
        if (!data || data.length === 0) return null;
        let p1 = data.find(p => p.x >= xValue);
        let p0 = data[data.indexOf(p1) - 1];
        if (!p1) return data[data.length-1].y;
        if (!p0) return p1.y;
        
        return p0.y + (p1.y - p0.y) * (xValue - p0.x) / (p1.x - p0.x);
    };

    // --- グラフ更新関数 ---
    const updateChart = () => {
        currentModel = models[formulaTypeSelect.value];
        const h = parseFloat(stepSlider.value);
        hValueSpan.textContent = h.toFixed(2);

        chart.options.scales.y.title.text = currentModel.yAxisLabel;

        const datasets = chart.data.datasets;
        datasets[0].data = getTrueSolutionPoints();
        datasets[0].hidden = !checkboxes.true.checked;
        
        datasets[1].data = solve(eulerStep, h);
        datasets[1].hidden = !checkboxes.euler.checked;

        datasets[2].data = solve(rk2Step, h);
        datasets[2].hidden = !checkboxes.rk2.checked;

        datasets[3].data = solve(rk4Step, h);
        datasets[3].hidden = !checkboxes.rk4.checked;

        chart.update();
    };

    // --- イベントリスナー ---
    const canvas = document.getElementById('solution-chart');
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        
        if (mouseX < chart.chartArea.left || mouseX > chart.chartArea.right) {
            customTooltip.style.display = 'none';
            return;
        }

        const xValue = chart.scales.x.getValueForPixel(mouseX);
        let tooltipHtml = `時間: ${xValue.toFixed(2)}`;
        
        chart.data.datasets.forEach(dataset => {
            if (!dataset.hidden && dataset.data.length > 0) {
                const yValue = interpolate(dataset, xValue);
                if (yValue !== null) {
                   tooltipHtml += `\n<span style="color:${dataset.borderColor};">■</span> ${dataset.label}: ${yValue.toFixed(3)}`;
                }
            }
        });

        customTooltip.innerHTML = tooltipHtml;
        customTooltip.style.display = 'block';
        customTooltip.style.left = `${e.clientX - rect.left}px`;
        customTooltip.style.top = `${e.clientY - rect.top}px`;
    });
    
    canvas.addEventListener('mouseout', () => {
        customTooltip.style.display = 'none';
    });

    // ★変更: グラフ更新とズームリセットを分離
    formulaTypeSelect.addEventListener('change', () => {
        updateChart();
        chart.resetZoom(); // グラフの種類が変わったらズームをリセット
    });
    stepSlider.addEventListener('input', updateChart);
    Object.values(checkboxes).forEach(cb => cb.addEventListener('change', updateChart));

    // ★変更: リセットボタンのクリックイベントを追加
    resetZoomBtn.addEventListener('click', () => {
        chart.resetZoom();
    });

    updateChart(); // 初期描画
});