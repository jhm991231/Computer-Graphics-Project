/* volleyball.js – renders a static volleyball‑spike pose (mirrored: LEFT‑hand spike)
 * usage: include after a <canvas id="glCanvas"> element in your html
 */

import * as glMatrix from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/+esm";
const { mat4 } = glMatrix;

/*=======================
  Matrix–stack helper
=======================*/
class MatrixStack {
  constructor() {
    this.stack = [];
    this.current = mat4.create();
  }
  push() {
    this.stack.push(mat4.clone(this.current));
  }
  pop() {
    if (!this.stack.length) throw new Error("Stack underflow");
    this.current = this.stack.pop();
  }
  loadIdentity() {
    mat4.identity(this.current);
  }
  translate(v) {
    mat4.translate(this.current, this.current, v);
  }
  rotate(rad, axis) {
    mat4.rotate(this.current, this.current, rad, axis);
  }
  scale(v) {
    mat4.scale(this.current, this.current, v);
  }
  getCurrentMatrix() {
    return this.current;
  }
}

/*=======================
  GL & shader set‑up
=======================*/
const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl2");
if (!gl) alert("WebGL 2.0이 지원되지 않습니다.");

const vs = `#version 300 es
in vec4 aPosition;
in vec3 aNormal;
uniform mat4 uModelViewProjection;
uniform mat4 uModelView;
out vec3 vNormal;
void main(){
  gl_Position = uModelViewProjection * aPosition;
  vNormal     = mat3(uModelView)*aNormal;
}`;

const fs = `#version 300 es
precision mediump float;
in  vec3 vNormal;
out vec4 fragColor;
void main(){
  vec3 L  = normalize(vec3(1.0,1.0,1.0));
  float d = max(dot(normalize(vNormal),L),0.0);
  vec3  c = vec3(0.8,0.8,1.0)*(0.3+0.7*d);
  fragColor = vec4(c,1.0);
}`;

function compile(t, s) {
  const sh = gl.createShader(t);
  gl.shaderSource(sh, s);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw gl.getShaderInfoLog(sh);
  return sh;
}
function link(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p);
  return p;
}
const program = link(
  compile(gl.VERTEX_SHADER, vs),
  compile(gl.FRAGMENT_SHADER, fs)
);
gl.useProgram(program);

/*=======================
   Geometry builders
=======================*/
function sphere(r, lat, lon) {
  const v = [],
    n = [],
    i = [];
  for (let a = 0; a <= lat; ++a) {
    const th = (a * Math.PI) / lat,
      st = Math.sin(th),
      ct = Math.cos(th);
    for (let b = 0; b <= lon; ++b) {
      const ph = (b * 2 * Math.PI) / lon,
        sp = Math.sin(ph),
        cp = Math.cos(ph);
      const x = cp * st,
        y = ct,
        z = sp * st;
      v.push(r * x, r * y, r * z);
      n.push(x, y, z);
    }
  }
  for (let a = 0; a < lat; ++a)
    for (let b = 0; b < lon; ++b) {
      const first = a * (lon + 1) + b,
        second = first + lon + 1;
      i.push(first, second, first + 1, second, second + 1, first + 1);
    }
  return {
    v: new Float32Array(v),
    n: new Float32Array(n),
    idx: new Uint16Array(i),
  };
}
function cylinder(rt, rb, h, radSeg, hSeg, open) {
  const v = [],
    n = [],
    idx = [],
    hh = h / 2,
    tl = 2 * Math.PI;
  for (let y = 0; y <= hSeg; ++y) {
    const vy = y / hSeg,
      r = rt + (rb - rt) * vy,
      yPos = hh - vy * h;
    for (let x = 0; x <= radSeg; ++x) {
      const u = x / radSeg,
        th = u * tl,
        st = Math.sin(th),
        ct = Math.cos(th);
      v.push(r * st, yPos, r * ct);
      const nx = st,
        ny = (rb - rt) / h,
        nz = ct,
        l = Math.hypot(nx, ny, nz);
      n.push(nx / l, ny / l, nz / l);
    }
  }
  for (let y = 0; y < hSeg; ++y)
    for (let x = 0; x < radSeg; ++x) {
      const a = y * (radSeg + 1) + x,
        b = a + radSeg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  return {
    v: new Float32Array(v),
    n: new Float32Array(n),
    idx: new Uint16Array(idx),
  };
}
function cube() {
  const p = [
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5,
    -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5,
  ];
  const faces = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [3, 2, 6, 5],
    [0, 3, 5, 4],
    [1, 7, 6, 2],
    [0, 4, 7, 1],
  ];
  const v = [],
    n = [],
    idx = [];
  faces.forEach((f, fi) => {
    const nx = [0, 0, 0];
    nx[Math.floor(fi / 2)] = fi % 2 ? -1 : 1;
    f.forEach((vi) => {
      v.push(...p.slice(vi * 3, vi * 3 + 3));
      n.push(...nx);
    });
    const o = v.length / 3 - 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return {
    v: new Float32Array(v),
    n: new Float32Array(n),
    idx: new Uint16Array(idx),
  };
}

function setup(geo) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bPos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bPos);
  gl.bufferData(gl.ARRAY_BUFFER, geo.v, gl.STATIC_DRAW);
  const locPos = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(locPos);
  gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 0, 0);
  const bNor = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bNor);
  gl.bufferData(gl.ARRAY_BUFFER, geo.n, gl.STATIC_DRAW);
  const locNor = gl.getAttribLocation(program, "aNormal");
  gl.enableVertexAttribArray(locNor);
  gl.vertexAttribPointer(locNor, 3, gl.FLOAT, false, 0, 0);
  const bIdx = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);

  gl.enable(gl.DEPTH_TEST);

  return { vao, count: geo.idx.length };
}

/*=======================
   Geometries / VAOs
=======================*/
const sphereVAO = setup(sphere(0.5, 16, 32));
const cylVAO = setup(cylinder(0.5, 0.5, 1.0, 16, 1));
const ballVAO = setup(sphere(0.15, 16, 32));

const uMVP = gl.getUniformLocation(program, "uModelViewProjection");
const uMV = gl.getUniformLocation(program, "uModelView");
const projection = mat4.create();

/*=======================
   Draw helpers
=======================*/
const stk = new MatrixStack();
function drawVAO(vao) {
  const mv = mat4.create(),
    mvp = mat4.create();
  mat4.multiply(mv, view, stk.getCurrentMatrix());
  mat4.multiply(mvp, projection, mv);
  gl.uniformMatrix4fv(uMV, false, mv);
  gl.uniformMatrix4fv(uMVP, false, mvp);
  gl.bindVertexArray(vao.vao);
  gl.drawElements(gl.TRIANGLES, vao.count, gl.UNSIGNED_SHORT, 0);
}
const drawSphere = () => drawVAO(sphereVAO);
const drawCylinder = () => drawVAO(cylVAO);
const drawBall = () => drawVAO(ballVAO);

/*=======================
   Body parts
=======================*/
function body() {
  stk.push();
  mat4.scale(stk.current, stk.current, [0.5, 1.5, 0.25]);
  drawCylinder();
  stk.pop();
}
function head(tilt) {
  stk.push();
  mat4.translate(stk.current, stk.current, [0, 1.1, 0]);
  mat4.rotate(stk.current, stk.current, tilt, [1, 0, 0]);
  drawSphere();
  stk.pop();
}

function arm(side, shoulder, elbow, customSX = 0.3) {
  const sg = side === "left" ? -1 : 1;
  const sY = 0.5,
    sX = customSX,
    sZ = 0.3,
    upper = 0.6,
    lower = 0.6,
    j = 0.1;
  stk.push();
  mat4.translate(stk.current, stk.current, [sg * sX, sY, sg * sZ]);
  mat4.rotate(stk.current, stk.current, shoulder, [0, 0, 1]);
  // shoulder sphere
  stk.push();
  mat4.scale(stk.current, stk.current, [0.2, 0.2, 0.2]);
  drawSphere();
  stk.pop();
  // upper arm
  stk.push();
  mat4.translate(stk.current, stk.current, [0, -(j + upper / 2), 0]);
  mat4.scale(stk.current, stk.current, [0.15, upper, 0.15]);
  drawCylinder();
  stk.pop();
  // elbow joint
  mat4.translate(stk.current, stk.current, [0, -(j + upper + j), 0]);
  mat4.rotate(stk.current, stk.current, elbow, [0, 0, 1]);
  stk.push();
  mat4.scale(stk.current, stk.current, [0.18, 0.18, 0.18]);
  drawSphere();
  stk.pop();
  // lower arm + hand/ball
  stk.push();
  mat4.translate(stk.current, stk.current, [0, -(j + lower / 2), 0]);
  mat4.scale(stk.current, stk.current, [0.12, lower, 0.12]);
  drawCylinder();
  stk.pop();
  stk.pop();
}
function leg(side, hip, knee) {
  const sg = side === "left" ? -1 : 1;
  const hY = -0.75,
    hX = 0,
    hZ = 0.25,
    upper = 0.8,
    lower = 0.7,
    j = 0.125;
  stk.push();
  mat4.translate(stk.current, stk.current, [sg * hX, hY, sg * hZ]);
  mat4.rotate(stk.current, stk.current, hip, [0, 0, 1]);
  stk.push();
  mat4.scale(stk.current, stk.current, [0.25, 0.25, 0.25]);
  drawSphere();
  stk.pop();
  stk.push();
  mat4.translate(stk.current, stk.current, [0, -(j + upper / 2), 0]);
  mat4.scale(stk.current, stk.current, [0.18, upper, 0.18]);
  drawCylinder();
  stk.pop();
  mat4.translate(stk.current, stk.current, [0, -(j + upper + j), 0]);
  mat4.rotate(stk.current, stk.current, knee, [0, 0, 1]);
  stk.push();
  mat4.scale(stk.current, stk.current, [0.2, 0.2, 0.2]);
  drawSphere();
  stk.pop();
  stk.push();
  mat4.translate(stk.current, stk.current, [0, -(j + lower / 2), 0]);
  mat4.scale(stk.current, stk.current, [0.15, lower, 0.15]);
  drawCylinder();
  stk.pop();
  stk.pop();
}
function character(p) {
  stk.push();
  body();
  head(p.HEAD_TILT);
  arm("left", p.LEFT_SHOULDER, p.LEFT_ELBOW, p.RIGHT_ARM_SX);
  arm("right", p.RIGHT_SHOULDER, p.RIGHT_ELBOW, p.RIGHT_ARM_SX);
  leg("left", p.LEFT_HIP, p.LEFT_KNEE);
  leg("right", p.RIGHT_HIP, p.RIGHT_KNEE);
  stk.pop();
}

/*=======================
   Pose constants (left spike)
=======================*/
const deg = (a) => (a * Math.PI) / 180;
// const BODY_LEAN_X = deg(-25);
// const BODY_LEAN_Z = deg(30); // opposite sign of original
// const HEAD_TILT = deg(-15);
// const LEFT_SHOULDER = deg(100); // swapped
// const RIGHT_SHOULDER = deg(-80);
// const LEFT_ELBOW = deg(15);
// const RIGHT_ELBOW = deg(-125);
// const LEFT_HIP = deg(-60);
// const RIGHT_HIP = deg(-30);
// const LEFT_KNEE = deg(-70);
// const RIGHT_KNEE = deg(-30);

// const deg = (a) => (a * Math.PI) / 180;
// const BODY_LEAN_X = deg(0);
// const BODY_LEAN_Y = deg(0);
// const BODY_LEAN_Z = deg(-20); // opposite sign of original
// const HEAD_TILT = deg(-15);
// const LEFT_SHOULDER = deg(0); // swapped
// const RIGHT_SHOULDER = deg(50);
// const LEFT_ELBOW = deg(70);
// const RIGHT_ELBOW = deg(0);
// const LEFT_HIP = deg(60);
// const RIGHT_HIP = deg(60);
// const LEFT_KNEE = deg(-10);
// const RIGHT_KNEE = deg(-70);

const startPose = {
  BODY_LEAN_X: deg(0),
  BODY_LEAN_Y: deg(0),
  BODY_LEAN_Z: deg(30),
  HEAD_TILT: deg(-15),

  LEFT_SHOULDER: deg(100),
  RIGHT_SHOULDER: deg(-80),
  LEFT_ELBOW: deg(15),
  RIGHT_ELBOW: deg(-125),

  LEFT_HIP: deg(-60),
  RIGHT_HIP: deg(-30),
  LEFT_KNEE: deg(-70),
  RIGHT_KNEE: deg(-30),
};

const endPose = {
  BODY_LEAN_X: deg(0),
  BODY_LEAN_Y: deg(0),
  BODY_LEAN_Z: deg(-20),
  HEAD_TILT: deg(-15),

  LEFT_SHOULDER: deg(0),
  RIGHT_SHOULDER: deg(-310),
  LEFT_ELBOW: deg(70),
  RIGHT_ELBOW: deg(0),

  LEFT_HIP: deg(60),
  RIGHT_HIP: deg(60),
  LEFT_KNEE: deg(-10),
  RIGHT_KNEE: deg(-70),
};

const SX_START = -0.3; // 처음엔 몸 안쪽
const SX_END = 0.3; // –160° 도달 시 바깥쪽
const SHOULDER_LIMIT = deg(-160);

const lerp = (a, b, t) => a + (b - a) * t;

// t 를 받아서 “현재 pose” 객체를 반환
function interpolatePose(t) {
  const p = {};
  for (const k in startPose) p[k] = lerp(startPose[k], endPose[k], t);

  const sh = p.RIGHT_SHOULDER;

  if (sh > SHOULDER_LIMIT) {
    const k =
      (sh - startPose.RIGHT_SHOULDER) /
      (SHOULDER_LIMIT - startPose.RIGHT_SHOULDER);
    p.RIGHT_ELBOW = lerp(startPose.RIGHT_ELBOW, 0, k);

    p.RIGHT_ARM_SX = lerp(SX_START, SX_END, k);
  } else {
    p.RIGHT_ELBOW = 0;
    p.RIGHT_ARM_SX = SX_END;
  }
  return p;
}

const HIT_T = 0.5; // 어깨가 -160° 되는 시점 (60% 지점)
const BALL_START = [0.6, 2.4, 0.4]; // 손·머리 쪽 초기 위치
const BALL_END = [8, 1.0, 0.2]; // 오른쪽 앞·아래 (마음대로 조정)

function interpolateBall(t) {
  // t < HIT_T  →  그대로 손 근처에 고정
  if (t < HIT_T) return BALL_START;

  // t ≥ HIT_T  →  0~1 로 정규화한 s 로 직선 보간
  const s = (t - HIT_T) / (1 - HIT_T); // 0→1
  return [
    BALL_START[0] + (BALL_END[0] - BALL_START[0]) * s,
    BALL_START[1] + (BALL_END[1] - BALL_START[1]) * s,
    BALL_START[2] + (BALL_END[2] - BALL_START[2]) * s,
  ];
}

/*=======================
   Camera interaction
=======================*/
let camX = 0,
  camY = 0,
  drag = false,
  pmx = 0,
  pmy = 0;
canvas.addEventListener("mousedown", (e) => {
  drag = true;
  pmx = e.clientX;
  pmy = e.clientY;
});
canvas.addEventListener("mousemove", (e) => {
  if (drag) {
    const dx = e.clientX - pmx,
      dy = e.clientY - pmy;
    camY += dx * 0.01;
    camX += dy * 0.01;
    camX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camX));
    pmx = e.clientX;
    pmy = e.clientY;
  }
});
canvas.addEventListener("mouseup", () => (drag = false));
canvas.addEventListener("mouseleave", () => (drag = false));

const view = mat4.create();
function resize() {
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    mat4.perspective(projection, Math.PI / 4, w / h, 0.1, 100);
  }
}

/*=======================
   Render (static pose)
=======================*/

// function render() {
//   resize();
//   gl.clearColor(0.05, 0.05, 0.1, 1);
//   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
//   gl.enable(gl.DEPTH_TEST);
//   mat4.identity(view);
//   mat4.translate(view, view, [0, 0, -8]);
//   mat4.rotateX(view, view, camX);
//   mat4.rotateY(view, view, camY);
//   stk.loadIdentity();
//   mat4.rotate(stk.current, stk.current, BODY_LEAN_X, [1, 0, 0]);
//   mat4.rotate(stk.current, stk.current, BODY_LEAN_Y, [0, 1, 0]);
//   mat4.rotate(stk.current, stk.current, BODY_LEAN_Z, [0, 0, 1]);
//   character();

//   stk.push();
//   stk.loadIdentity();

//   const ballPos = [0.6, 2.4, -0.4];
//   mat4.translate(stk.current, stk.current, ballPos);

//   drawBall();
//   stk.pop();

//   requestAnimationFrame(render);
// }

const DURATION = 1000; // 1초에 목표 포즈 도달
const LOOP = true; // true 면 계속 왕복, false 면 1회 후 멈춤
let startTime = null;

function render(now) {
  if (!startTime) startTime = now;
  const elapsed = now - startTime;

  // --- t 계산 -----------------------------
  let t = elapsed / DURATION;
  if (LOOP) {
    // ping-pong: 0→1→0→1 …
    const cycle = Math.floor(t);
    t = t - cycle; // 0~1 사이
    if (cycle % 2 === 1) t = 1 - t; // 홀수 cycle 때 역방향
  } else {
    t = Math.min(t, 1); // 0~1 clamp
  }

  // --- pose 보간 --------------------------
  const pose = interpolatePose(t);

  // ================== 기존 render 로직 ==================
  resize();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.clearColor(0.05, 0.05, 0.1, 1);
  mat4.identity(view);
  mat4.translate(view, view, [0, 0, -8]);
  mat4.rotateX(view, view, camX);
  mat4.rotateY(view, view, camY);

  stk.loadIdentity();
  mat4.rotate(stk.current, stk.current, pose.BODY_LEAN_X, [1, 0, 0]);
  mat4.rotate(stk.current, stk.current, pose.BODY_LEAN_Y, [0, 1, 0]);
  mat4.rotate(stk.current, stk.current, pose.BODY_LEAN_Z, [0, 0, 1]);

  // 캐릭터 그릴 때 pose 값 넘기기
  character(pose); // ✨(아래 4단계 참고)

  stk.push();
  stk.loadIdentity();
  const ballPos = interpolateBall(t);
  mat4.translate(stk.current, stk.current, ballPos);
  drawBall();
  stk.pop();

  requestAnimationFrame(render);
}
requestAnimationFrame(render);
