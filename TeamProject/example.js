"use strict";

var gl, program;
var modelMatrixLoc;
var modelViewMatrix = mat4();
var stack = [];

const torsoId = 0;
const headId = 1;
const leftUpperArmId = 2;
const leftLowerArmId = 3;
const rightUpperArmId = 4;
const rightLowerArmId = 5;
const leftUpperLegId = 6;
const leftLowerLegId = 7;
const rightUpperLegId = 8;
const rightLowerLegId = 9;
const swordId = 10;

const numNodes = 11;
let figure = new Array(numNodes);

let eye = vec3(0.0, 0.0, 2.0);
const at = vec3(0.0, 0.0, 0.0);
const up = vec3(0.0, 1.0, 0.0);

let theta = 0;
let phi = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;

let viewMatrixLoc, projectionMatrixLoc;

// 애니메이션 변수
let rightArmAngle = 0;
let direction = 1;

// 큐브 데이터
const cubeVertices = [
  vec4(-0.5, -0.5, 0.5, 1.0),
  vec4(0.5, -0.5, 0.5, 1.0),
  vec4(0.5, 0.5, 0.5, 1.0),
  vec4(-0.5, 0.5, 0.5, 1.0),
  vec4(-0.5, -0.5, -0.5, 1.0),
  vec4(0.5, -0.5, -0.5, 1.0),
  vec4(0.5, 0.5, -0.5, 1.0),
  vec4(-0.5, 0.5, -0.5, 1.0),
];
const cubeIndices = [
  1, 0, 3, 1, 3, 2, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 6, 5, 1, 6, 1, 2, 4, 5,
  6, 4, 6, 7, 5, 4, 0, 5, 0, 1,
];

window.onload = function init() {
  const canvas = document.getElementById("gl-canvas");
  gl = WebGLUtils.setupWebGL(canvas);
  if (!gl) alert("WebGL isn't available");

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.95, 0.95, 0.95, 1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  program = initShaders(gl, "vertex-shader", "fragment-shader");
  gl.useProgram(program);
  modelMatrixLoc = gl.getUniformLocation(program, "modelMatrix");
  viewMatrixLoc = gl.getUniformLocation(program, "viewMatrix");
  projectionMatrixLoc = gl.getUniformLocation(program, "projectionMatrix");

  for (let i = 0; i < numNodes; i++) initNodes(i);

  render();

  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener("mouseup", () => (dragging = false));
  canvas.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    let dx = e.clientX - lastX;
    let dy = e.clientY - lastY;
    theta += dx * 0.5;
    phi += dy * 0.5;
    lastX = e.clientX;
    lastY = e.clientY;
  });
};

function createNode(transform, renderFunc, sibling, child) {
  return { transform, render: renderFunc, sibling, child };
}

function initNodes(id) {
  let m = mat4();
  let s = radians(-90);
  let offset = 0.25;

  let rotationAboutTop = mult(
    translate(0, offset, 0),
    mult(rotateZ(s), translate(0, -offset, 0))
  );

  switch (id) {
    case torsoId:
      figure[torsoId] = createNode(m, torso, null, headId);
      break;
    case headId:
      m = translate(0.0, 0.6 / 2 + 0.2 / 2, 0.0);
      figure[headId] = createNode(m, head, rightUpperArmId, null);
      break;
    case rightUpperArmId:
      m = mult(translate(0.8, 0.2, 0.0), rotationAboutTop);
      figure[rightUpperArmId] = createNode(
        m,
        rightUpperArm,
        leftUpperArmId,
        rightLowerArmId
      );
      break;
    case rightLowerArmId:
      m = translate(0.0, -1, 0.0);
      figure[rightLowerArmId] = createNode(m, rightLowerArm, null, swordId);
      break;
    case swordId:
      m = translate(0.0, -0.25, 0.0);
      figure[swordId] = createNode(m, sword, null, null);
      break;
    case leftUpperArmId:
      // 전체 위치로 이동 (몸에서 떨어뜨리기)
      m = mult(translate(-0.8, 0.2, 0.0), rotationAboutTop);
      figure[leftUpperArmId] = createNode(
        m,
        leftUpperArm,
        leftUpperLegId,
        leftLowerArmId
      );
      break;
    case leftLowerArmId:
      m = translate(0.0, -1, 0.0);
      figure[leftLowerArmId] = createNode(m, leftLowerArm, null, null);
      break;
    case leftUpperLegId:
      m = translate(-0.2, -0.6, 0.0); // 몸통에서 아래
      figure[leftUpperLegId] = createNode(
        m,
        leftUpperLeg,
        rightUpperLegId,
        leftLowerLegId
      );
      break;

    case leftLowerLegId:
      m = translate(0.0, -0.6, 0.0); // 상다리 기준 아래
      figure[leftLowerLegId] = createNode(m, leftLowerLeg, null, null);
      break;

    // 오른쪽 다리 (상다리)
    case rightUpperLegId:
      m = translate(0.2, -0.6, 0.0);
      figure[rightUpperLegId] = createNode(
        m,
        rightUpperLeg,
        null,
        rightLowerLegId
      );
      break;

    case rightLowerLegId:
      m = translate(0.0, -0.6, 0.0);
      figure[rightLowerLegId] = createNode(m, rightLowerLeg, null, null);
      break;
  }
}

function traverse(id) {
  if (id == null) return;

  stack.push(modelViewMatrix);
  modelViewMatrix = mult(modelViewMatrix, figure[id].transform);
  figure[id].render();

  if (figure[id].child !== null) traverse(figure[id].child);
  modelViewMatrix = stack.pop();

  if (figure[id].sibling !== null) traverse(figure[id].sibling);
}

function drawAxis() {
  const axisVertices = [
    // X축 (빨강)
    vec3(0.0, 0.0, 0.0),
    vec3(1.0, 0.0, 0.0),
    // Y축 (초록)
    vec3(0.0, 0.0, 0.0),
    vec3(0.0, 1.0, 0.0),
    // Z축 (파랑)
    vec3(0.0, 0.0, 0.0),
    vec3(0.0, 0.0, 1.0),
  ];

  const colors = [
    vec3(1.0, 0.0, 0.0),
    vec3(1.0, 0.0, 0.0), // 빨강
    vec3(0.0, 1.0, 0.0),
    vec3(0.0, 1.0, 0.0), // 초록
    vec3(0.0, 0.0, 1.0),
    vec3(0.0, 0.0, 1.0), // 파랑
  ];

  const aBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, aBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(axisVertices), gl.STATIC_DRAW);
  const vPos = gl.getAttribLocation(program, "vPosition");
  gl.vertexAttribPointer(vPos, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(vPos);

  const cBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);
  const vColor = gl.getAttribLocation(program, "vColor");
  gl.vertexAttribPointer(vColor, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(vColor);

  const modelMat = mat4(); // 좌표축은 원점에 위치
  gl.uniformMatrix4fv(modelMatrixLoc, false, flatten(modelMat));

  gl.drawArrays(gl.LINES, 0, 6);
}

function drawBox() {
  const vBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(cubeVertices), gl.STATIC_DRAW);

  const vPosition = gl.getAttribLocation(program, "vPosition");
  gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(vPosition);

  const iBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(cubeIndices),
    gl.STATIC_DRAW
  );

  gl.uniformMatrix4fv(modelMatrixLoc, false, flatten(modelViewMatrix));
  gl.drawElements(gl.TRIANGLES, cubeIndices.length, gl.UNSIGNED_SHORT, 0);
}

// 각 부위 렌더
function torso() {
  modelViewMatrix = mult(modelViewMatrix, scalem(0.2, 0.6, 0.2));
  drawBox();
}
function head() {
  modelViewMatrix = mult(modelViewMatrix, scalem(0.5, 0.6, 0.5));
  drawBox();
}
function leftUpperArm() {
  modelViewMatrix = mult(modelViewMatrix, scalem(0.3, 0.4, 0.3));
  drawBox();
}
function leftLowerArm() {
  // modelViewMatrix = mult(modelViewMatrix, scalem(0.1, 0.3, 0.1));
  drawBox();
}
function rightUpperArm() {
  modelViewMatrix = mult(modelViewMatrix, scalem(0.3, 0.4, 0.3));
  drawBox();
}
function rightLowerArm() {
  // modelViewMatrix = mult(modelViewMatrix, scalem(0.1, 0.3, 0.1));
  drawBox();
}
function sword() {
  modelViewMatrix = mult(modelViewMatrix, scalem(0.3, 1, 0.3));
  drawBox();
}
function leftUpperLeg() {
  modelViewMatrix = mult(modelViewMatrix, scalem(0.3, 0.6, 0.3));
  drawBox();
}
function leftLowerLeg() {
  // modelViewMatrix = mult(modelViewMatrix, scalem(0.3, 0.6, 0.3));
  drawBox();
}
function rightUpperLeg() {
  modelViewMatrix = mult(modelViewMatrix, scalem(0.3, 0.6, 0.3));
  drawBox();
}
function rightLowerLeg() {
  // modelViewMatrix = mult(modelViewMatrix, scalem(0.3, 0.6, 0.3));
  drawBox();
}

function render() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // spherical → cartesian
  let radTheta = radians(theta);
  let radPhi = radians(phi);
  let r = 3.0;
  eye = vec3(
    r * Math.sin(radTheta) * Math.cos(radPhi),
    r * Math.sin(radPhi),
    r * Math.cos(radTheta) * Math.cos(radPhi)
  );

  let viewMatrix = lookAt(eye, at, up);
  let projectionMatrix = perspective(60, 1, 0.1, 100);

  gl.uniformMatrix4fv(viewMatrixLoc, false, flatten(viewMatrix));
  gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));

  // 애니메이션 업데이트
  rightArmAngle += direction * 1.5;
  if (rightArmAngle > 90) {
    rightArmAngle = 90;
    direction = -1;
  }
  if (rightArmAngle < 0) {
    rightArmAngle = 0;
    direction = 1;
  }

  drawAxis();
  initNodes(rightUpperArmId); // 회전 적용
  modelViewMatrix = mat4();
  traverse(torsoId);

  requestAnimFrame(render);
}
