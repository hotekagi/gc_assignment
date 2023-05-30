/**
 * Copyright 2023 Yuki Koyama
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * This code simulates incompressible fluid in a 2D squire domain using the Stable Fluids (semi-Lagrangian) approach [1]. In particular, this code mostly follows the follow-up document [2].
 *
 * - [1] Jos Stam. Stable Fluids. In Proceedings of SIGGRAPH 1999. https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/ns.pdf
 * - [2] Jos Stam. Real-Time Fluid Dynamics for Games. In Proceedings of the Game Developer Conference 2003. https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/GDC03.pdf
 */

const canvas = document.getElementById("myCanvas");
const context = canvas.getContext("2d");

/**
 * 空間離散化の解像度
 */
const numCells = 50;

/**
 * セルの総数（ここでは便宜上境界にもセルを配置している)
 */
const size = (numCells + 2) * (numCells + 2);

/**
 * 速度（x方向）を格納をする配列
 */
let u = new Float32Array(size);

/**
 * 速度（y方向）を格納をする配列
 */
let v = new Float32Array(size);

/**
 * 可視化に用いる物質（例えば煙など）の密度（計算対象の流体そのものの密度とは異なる）を格納をする配列
 */
let d = new Float32Array(size);

let uPrev = new Float32Array(size);
let vPrev = new Float32Array(size);
let dPrev = new Float32Array(size);

const dSource = new Float32Array(size);
const uSource = new Float32Array(size);
const vSource = new Float32Array(size);

const numSubSteps = 8;
const dt = 1.0 / (numSubSteps * 30.0);

function clamp(x, x_min, x_max) {
  return Math.max(x_min, Math.min(x, x_max));
}

function index(i, j) {
  return i + (numCells + 2) * j;
}

/**
 * addSource - 対象となるデータに値を足す
 *
 * @param  {type} x 足される対象となる配列
 * @param  {type} s 足す値を格納した配列
 */
function addSource(x, s) {
  for (let i = 0; i < size; ++i) {
    x[i] += dt * s[i];
  }
}

/**
 * setBoundary - 境界条件を適用する
 *
 * @param  {type} x 境界条件を適用する対象となる配列
 * @param  {type} boundaryType 'continuous', 'left_right_walls', 'top_bottom_walls' のいずれか
 */
function setBoundary(x, boundaryType) {
  // 上下のエッジについて境界条件を適用する
  for (let i = 1; i <= numCells; ++i) {
    if (boundaryType == "top_bottom_walls") {
      // 上のエッジ
      x[index(i, 0)] = -x[index(i, 1)];
      // 下のエッジ
      x[index(i, numCells + 1)] = -x[index(i, numCells)];
    } else {
      // 上のエッジ
      x[index(i, 0)] = x[index(i, 1)];
      // 下のエッジ
      x[index(i, numCells + 1)] = x[index(i, numCells)];
    }
  }
  // 左右のエッジについて境界条件を適用する
  for (let j = 1; j <= numCells; ++j) {
    if (boundaryType == "left_right_walls") {
      // 左のエッジ
      x[index(0, j)] = -x[index(1, j)];
      // 右のエッジ
      x[index(numCells + 1, j)] = -x[index(numCells, j)];
    } else {
      // 左のエッジ
      x[index(0, j)] = x[index(1, j)];
      // 右のエッジ
      x[index(numCells + 1, j)] = x[index(numCells, j)];
    }
  }

  // 四隅のセルには近傍のエッジのセルの平均値を代入しておく
  x[index(0, 0)] = 0.5 * (x[index(0, 1)] + x[index(1, 0)]);
  x[index(numCells + 1, 0)] =
    0.5 * (x[index(numCells + 1, 1)] + x[index(numCells, 0)]);
  x[index(0, numCells + 1)] =
    0.5 * (x[index(0, numCells)] + x[index(1, numCells + 1)]);
  x[index(numCells + 1, numCells + 1)] =
    0.5 * (x[index(numCells + 1, numCells)] + x[index(numCells, numCells + 1)]);
}

/**
 * diffuse - 拡散を計算する
 *
 * この実装ではガウスザイデル法によって拡散方程式を解く。
 *
 * @param  {Float32Array} x 計算後のデータが格納される配列
 * @param  {Float32Array} x_0 計算前のデータが格納されている配列
 * @param  {string} boundaryType 'continuous', 'left_right_walls', 'top_bottom_walls' のいずれか
 */
function diffuse(x, x_0, boundaryType) {
  // 動粘性係数
  const diffusion_rate = 0.0001;

  // ガウスザイデル法における反復回数
  const numIters = 4;

  // セルの大きさ（空間離散化の幅）
  const h = 1.0 / numCells;

  // ガイスザイデル法の計算で用いる係数
  const a = (dt * diffusion_rate) / (h * h);

  // ガウスザイデル法を使って拡散方程式を解く
  for (let k = 0; k < numIters; ++k) {
    // 各セルにガウスザイデル法の更新式を適用する
    for (let i = 1; i <= numCells; ++i) {
      for (let j = 1; j <= numCells; ++j) {
        x[index(i, j)] =
          x_0[index(i, j)] +
          a *
            (x[index(i - 1, j)] +
              x[index(i + 1, j)] +
              x[index(i, j - 1)] +
              x[index(i, j + 1)]);
        x[index(i, j)] /= 1.0 + 4.0 * a;
      }
    }

    // 境界条件を設定する
    setBoundary(x, boundaryType);
  }
}

/**
 * advect - 移流を計算する
 *
 * この実装では、Semi-Lagrangianなバックトレースを行い、周囲のセルから値の補間を行う。
 *
 * バックトレースには単純な前進オイラー法を用いる。なお、精度の観点でバックトレースにはルンゲクッタ法 [1] (RK2など) を使う方が好ましいとされている。
 *
 * 補間にはバイリニア補間 [2] を用いる。Monotonic Cubic Interpolation [3] などの手法を用いる方がより好ましい。
 *
 * - [1] https://en.wikipedia.org/wiki/Bilinear_interpolation
 * - [2] https://en.wikipedia.org/wiki/Runge%E2%80%93Kutta_methods
 * - [3] Ronald Fedkiw, Jos Stam, and Henrik Wann Jensen. 2001. Visual Simulation of Smoke. In Proc. SIGGRAPH 2001. https://dl.acm.org/doi/10.1145/383259.383260
 *
 * @param  {Float32Array} x 計算後のデータが格納される配列
 * @param  {Float32Array} x_0 計算前のデータが格納されている配列
 * @param  {Float32Array} u_0 速度のx成分が格納されている配列
 * @param  {Float32Array} v_0 速度のy成分が格納されている配列
 * @param  {string} boundaryType 'continuous', 'left_right_walls', 'top_bottom_walls' のいずれか
 */
function advect(x, x_0, u_0, v_0, boundaryType) {
  for (let i = 1; i <= numCells; ++i) {
    for (let j = 1; j <= numCells; ++j) {
      // TODO: バックトレースした先の座標値 (p_x, p_y) を計算する
      let p_x = i - dt * u_0[index(i, j)] * numCells;
      let p_y = j - dt * v_0[index(i, j)] * numCells;
      // TODO: コーナーケース（境界付近）の処理をする（計算領域からはみ出ていた場合）
      // TODO: バイリニア補間の対象となるセルのインデックスを計算する
      // TODO: バイリニア補間のウェイトを計算する
      // TODO: バイニリア補間を計算する
      if (p_x < 0.5) p_x = 0.5;
      if (p_x > numCells + 0.5) p_x = numCells + 0.5;
      if (p_y < 0.5) p_y = 0.5;
      if (p_y > numCells + 0.5) p_y = numCells + 0.5;
      let i0 = Math.floor(p_x);
      let i1 = i0 + 1;
      let j0 = Math.floor(p_y);
      let j1 = j0 + 1;
      let s1 = p_x - i0;
      let s0 = 1 - s1;
      let t1 = p_y - j0;
      let t0 = 1 - t1;
      x[index(i, j)] =
        s0 * (t0 * x_0[index(i0, j0)] + t1 * x_0[index(i0, j1)]) +
        s1 * (t0 * x_0[index(i1, j0)] + t1 * x_0[index(i1, j1)]);
    }
  }

  setBoundary(x, boundaryType);
}

/**
 * project - 速度場の発散をゼロにする
 *
 * @param  {Float32Array} u 速度のx成分が格納されている配列
 * @param  {Float32Array} v 速度のy成分が格納されている配列
 * @param  {Float32Array} p 途中計算結果を格納するための確保済みの適当な配列
 * @param  {Float32Array} div 途中計算結果を格納するための確保済みの適当な配列
 */
function project(u, v, p, div) {
  // ガウスザイデル法における反復回数
  const numIters = 10;

  // セルの大きさ（空間離散化の幅）
  const h = 1.0 / numCells;

  // 解を格納するためのバッファをゼロで初期化しておく
  for (let i = 0; i < size; ++i) {
    p[i] = 0.0;
  }

  // TODO: 各セルの発散を中心差分法により計算する
  for (let i = 1; i <= numCells; ++i) {
    for (let j = 1; j <= numCells; ++j) {
      div[index(i, j)] =
        ((u[index(i + 1, j)] - u[index(i - 1, j)]) / -2) * h +
        ((v[index(i, j + 1)] - v[index(i, j - 1)]) / -2) * h;
    }
  }
  setBoundary(div, "continuous");

  // ガウスザイデル法によってポアソン方程式を解くことでスカラー場を計算する
  for (let k = 0; k < numIters; ++k) {
    // TODO: 各セルにガウスザイデル法の更新式を適用する
    for (let i = 1; i <= numCells; ++i) {
      for (let j = 1; j <= numCells; ++j) {
        p[index(i, j)] =
          (p[index(i - 1, j)] +
            p[index(i + 1, j)] +
            p[index(i, j - 1)] +
            p[index(i, j + 1)] +
            div[index(i, j)]) /
          4;
      }
    }

    // 境界条件を設定する
    setBoundary(p, "continuous");
  }

  // TODO: 速度場から得られたスカラー場の勾配（中央差分法で計算）を引く
  for (let i = 1; i <= numCells; ++i) {
    for (let j = 1; j <= numCells; ++j) {
      u[index(i, j)] -= (p[index(i + 1, j)] - p[index(i - 1, j)]) / (2 * h);
      v[index(i, j)] -= (p[index(i, j + 1)] - p[index(i, j - 1)]) / (2 * h);
    }
  }
  setBoundary(u, "left_right_walls");
  setBoundary(v, "top_bottom_walls");
}

function densityStep() {
  addSource(d, dSource);

  [d, dPrev] = [dPrev, d];
  diffuse(d, dPrev, "continuous");

  [d, dPrev] = [dPrev, d];
  advect(d, dPrev, u, v, "continuous");
}

/**
 * velocityStep - 速度場を更新する
 *
 * ここでの実装は Stable Fluids (SIGGRAPH 1999) ではなく Real-Time Fluid Dynamics for Games (GDC 2003) に基づいている。後者の方が多少計算コストが上がるものの、より視覚的に優れた結果が得られるようである。
 */
function velocityStep() {
  addSource(u, uSource);
  addSource(v, vSource);

  [u, uPrev] = [uPrev, u];
  [v, vPrev] = [vPrev, v];
  diffuse(u, uPrev, "left_right_walls");
  diffuse(v, vPrev, "top_bottom_walls");

  project(u, v, uPrev, vPrev);

  [u, uPrev] = [uPrev, u];
  [v, vPrev] = [vPrev, v];
  advect(u, uPrev, uPrev, vPrev, "left_right_walls");
  advect(v, vPrev, uPrev, vPrev, "top_bottom_walls");

  project(u, v, uPrev, vPrev);
}

function step() {
  velocityStep();
  densityStep();
}

function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height);

  const cellWidth = canvas.width / (numCells + 2);
  const cellHeight = canvas.height / (numCells + 2);

  context.strokeStyle = "rgba(100, 100, 100, 0.2)";
  context.lineWidth = 2.0;
  for (let i = 1; i <= numCells; ++i) {
    for (let j = 1; j <= numCells; ++j) {
      // Draw a grid with its color-coded density
      const scale = 0.08;
      const rgb = evaluate_cmap(
        clamp(d[index(i, j)] * scale, 0.0, 1.0),
        "jet",
        false
      );
      const color = "rgb(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ", 1.0)";

      context.fillStyle = color;
      context.beginPath();
      context.rect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);
      context.fill();
      context.stroke();
    }
  }

  // Visualize velocities
  const velColor = "rgba(181, 226, 255, 0.2)";
  context.strokeStyle = velColor;
  context.lineWidth = 2.0;
  for (let i = 1; i <= numCells; ++i) {
    for (let j = 1; j <= numCells; ++j) {
      const scale = 80.0;

      const centerX = (i + 0.5) * cellWidth;
      const centerY = (j + 0.5) * cellHeight;
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.lineTo(
        centerX + u[index(i, j)] * scale,
        centerY + v[index(i, j)] * scale
      );
      context.stroke();
    }
  }
}

let fluidSpeed = 500.0;

function update() {
  // 速度や密度のソースを指定する
  dSource.fill(0.0);
  uSource.fill(0.0);
  vSource.fill(0.0);
  if (
    50 < prevMouseX < canvas.width - 50 &&
    50 < prevMouseY < canvas.height - 50
  ) {
    const nowX = Math.round((numCells * mouseX) / canvas.width);
    const nowY = Math.round((numCells * mouseY) / canvas.height);
    const prevX = Math.round((numCells * prevMouseX) / canvas.width);
    const prevY = Math.round((numCells * prevMouseY) / canvas.height);

    for (let i = 0; i < 10; ++i) {
      const x = Math.round(prevX + (nowX - prevX) * (i / 5));
      const y = Math.round(prevY + (nowY - prevY) * (i / 5));
      dSource[index(x, y)] = 1000.0;
      uSource[index(x, y)] = mouseSpeedX * fluidSpeed;
      uSource[index(x - 1, y)] = mouseSpeedX * fluidSpeed;
      uSource[index(x + 1, y)] = mouseSpeedX * fluidSpeed;
      uSource[index(x, y - 1)] = mouseSpeedX * fluidSpeed;
      uSource[index(x, y + 1)] = mouseSpeedX * fluidSpeed;
      vSource[index(x, y)] = mouseSpeedY * fluidSpeed;
      vSource[index(x - 1, y)] = mouseSpeedY * fluidSpeed;
      vSource[index(x + 1, y)] = mouseSpeedY * fluidSpeed;
      vSource[index(x, y - 1)] = mouseSpeedY * fluidSpeed;
      vSource[index(x, y + 1)] = mouseSpeedY * fluidSpeed;
    }
  }

  // シミュレーションを一ステップ前に進める
  for (let i = 0; i < numSubSteps; ++i) {
    step();
  }

  draw();
  // 再帰的に関数を呼び出すことでアニメーションを継続する
  window.requestAnimationFrame(update);
}

// マウスの座標と速度を格納する変数
let mouseX = 0;
let mouseY = 0;
let mouseSpeedX = 0;
let mouseSpeedY = 0;
let prevMouseX = 0;
let prevMouseY = 0;
let prevTimestamp;

// マウスの移動イベントのリスナーを追加
canvas.addEventListener("mousemove", function (event) {
  // 現在のマウス座標を取得
  mouseX = event.clientX - canvas.offsetLeft;
  mouseY = event.clientY - canvas.offsetTop;

  // 前回のマウス座標との差から速度を計算
  const timestamp = new Date().getTime();
  if (prevTimestamp) {
    var timeDiff = timestamp - prevTimestamp;
    mouseSpeedX = ((mouseX - prevMouseX) / timeDiff) | 0;
    mouseSpeedY = ((mouseY - prevMouseY) / timeDiff) | 0;
  }

  // 前回の座標とタイムスタンプを更新
  prevMouseX = mouseX;
  prevMouseY = mouseY;
  prevTimestamp = timestamp;
});

const slider = document.getElementById("slider");
slider.addEventListener("input", function () {
  fluidSpeed = parseFloat(slider.value).toFixed(1);
});

// スマホでのタッチイベントのリスナーを追加
canvas.addEventListener("touchmove", function (event) {
  // 現在のマウス座標を取得
  let touch = event.touches[0];
  mouseX = touch.clientX - canvas.offsetLeft;
  mouseY = touch.clientY - canvas.offsetTop;

  // 前回のマウス座標との差から速度を計算
  const timestamp = new Date().getTime();
  if (prevTimestamp) {
    var timeDiff = timestamp - prevTimestamp;
    mouseSpeedX = ((mouseX - prevMouseX) / timeDiff) | 0;
    mouseSpeedY = ((mouseY - prevMouseY) / timeDiff) | 0;
  }

  // 前回の座標とタイムスタンプを更新
  prevMouseX = mouseX;
  prevMouseY = mouseY;
  prevTimestamp = timestamp;
});
