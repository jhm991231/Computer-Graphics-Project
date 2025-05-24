import * as glMatrix from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/+esm";
const { mat4 } = glMatrix;

class MatrixStack {
  constructor() {
    this.stack = [];
    this.current = mat4.create();
  }
  push() {
    this.stack.push(mat4.clone(this.current));
  }
  pop() {
    if (this.stack.length === 0) throw new Error("Stack underflow");
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

const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl2");
if (!gl) alert("WebGL 2.0이 지원되지 않습니다.");

const vsSource = `#version 300 es
    in vec4 aPosition;
    in vec3 aNormal;
    out vec3 vNormal;
    uniform mat4 uModelViewProjection;
    uniform mat4 uModelView;
    void main() {
      gl_Position = uModelViewProjection * aPosition;
      // Transform normal to view space
      vNormal = mat3(uModelView) * aNormal;
    }`;

const fsSource = `#version 300 es
    precision highp float;
    in vec3 vNormal;
    out vec4 fragColor;
    
    void main() {
      // Simple lighting calculation
      vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
      vec3 normal = normalize(vNormal);
      float diffuse = max(dot(normal, lightDir), 0.0);
      vec3 baseColor = vec3(0.7, 0.7, 0.9);
      vec3 litColor = baseColor * (0.3 + 0.7 * diffuse);
      fragColor = vec4(litColor, 1.0);
    }`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vs, fs) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vs);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fs);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

const program = createProgram(gl, vsSource, fsSource);
gl.useProgram(program);

// Create a sphere for the head
function createSphere(radius, latBands, longBands) {
  const vertices = [];
  const normals = [];
  const indices = [];

  for (let lat = 0; lat <= latBands; lat++) {
    const theta = (lat * Math.PI) / latBands;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= longBands; lon++) {
      const phi = (lon * 2 * Math.PI) / longBands;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      const x = cosPhi * sinTheta;
      const y = cosTheta;
      const z = sinPhi * sinTheta;

      // Position
      vertices.push(radius * x);
      vertices.push(radius * y);
      vertices.push(radius * z);

      // Normal
      normals.push(x);
      normals.push(y);
      normals.push(z);
    }
  }

  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < longBands; lon++) {
      const first = lat * (longBands + 1) + lon;
      const second = first + longBands + 1;

      indices.push(first);
      indices.push(second);
      indices.push(first + 1);

      indices.push(second);
      indices.push(second + 1);
      indices.push(first + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

// Create a cylinder for body parts - modified to align properly with joints
function createCylinder(
  radiusTop,
  radiusBottom,
  height,
  radialSegments,
  heightSegments,
  openEnded = false
) {
  const vertices = [];
  const normals = [];
  const indices = [];

  const halfHeight = height / 2;
  const thetaLength = Math.PI * 2;

  // Generate vertices and normals
  for (let y = 0; y <= heightSegments; y++) {
    const v = y / heightSegments;
    const radius = v * (radiusBottom - radiusTop) + radiusTop;
    const yPos = halfHeight - v * height; // Map [0,1] to [halfHeight, -halfHeight]

    for (let x = 0; x <= radialSegments; x++) {
      const u = x / radialSegments;
      const theta = u * thetaLength;

      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      // Position
      vertices.push(radius * sinTheta);
      vertices.push(yPos);
      vertices.push(radius * cosTheta);

      // Normal
      const normalX = sinTheta;
      const normalY = (radiusBottom - radiusTop) / height;
      const normalZ = cosTheta;
      const length = Math.sqrt(
        normalX * normalX + normalY * normalY + normalZ * normalZ
      );

      normals.push(normalX / length);
      normals.push(normalY / length);
      normals.push(normalZ / length);
    }
  }

  // Generate indices
  for (let y = 0; y < heightSegments; y++) {
    for (let x = 0; x < radialSegments; x++) {
      const vertex1 = y * (radialSegments + 1) + x;
      const vertex2 = vertex1 + radialSegments + 1;

      indices.push(vertex1);
      indices.push(vertex2);
      indices.push(vertex1 + 1);

      indices.push(vertex2);
      indices.push(vertex2 + 1);
      indices.push(vertex1 + 1);
    }
  }

  // Add top and bottom caps if not open-ended
  if (!openEnded) {
    // Top cap
    const topCapBaseIndex = vertices.length / 3;
    vertices.push(0, halfHeight, 0); // Center of top cap
    normals.push(0, 1, 0);

    for (let i = 0; i <= radialSegments; i++) {
      const theta = (i * thetaLength) / radialSegments;
      const x = radiusTop * Math.sin(theta);
      const z = radiusTop * Math.cos(theta);

      vertices.push(x, halfHeight, z);
      normals.push(0, 1, 0);

      if (i > 0) {
        indices.push(topCapBaseIndex);
        indices.push(topCapBaseIndex + i);
        indices.push(topCapBaseIndex + i + 1);
      }
    }

    // Bottom cap
    const bottomCapBaseIndex = vertices.length / 3;
    vertices.push(0, -halfHeight, 0); // Center of bottom cap
    normals.push(0, -1, 0);

    for (let i = 0; i <= radialSegments; i++) {
      const theta = (i * thetaLength) / radialSegments;
      const x = radiusBottom * Math.sin(theta);
      const z = radiusBottom * Math.cos(theta);

      vertices.push(x, -halfHeight, z);
      normals.push(0, -1, 0);

      if (i > 0) {
        indices.push(bottomCapBaseIndex);
        indices.push(bottomCapBaseIndex + i + 1);
        indices.push(bottomCapBaseIndex + i);
      }
    }
  }

  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

// Create cube for joints
function createCube() {
  const vertices = new Float32Array([
    // Front face
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,

    // Back face
    -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5,

    // Top face
    -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5,

    // Bottom face
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,

    // Right face
    0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5,

    // Left face
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
  ]);

  const normals = new Float32Array([
    // Front face
    0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0,

    // Back face
    0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0,

    // Top face
    0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0,

    // Bottom face
    0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0,

    // Right face
    1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0,

    // Left face
    -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0,
  ]);

  const indices = new Uint16Array([
    0,
    1,
    2,
    0,
    2,
    3, // Front face
    4,
    5,
    6,
    4,
    6,
    7, // Back face
    8,
    9,
    10,
    8,
    10,
    11, // Top face
    12,
    13,
    14,
    12,
    14,
    15, // Bottom face
    16,
    17,
    18,
    16,
    18,
    19, // Right face
    20,
    21,
    22,
    20,
    22,
    23, // Left face
  ]);

  return {
    vertices,
    normals,
    indices,
  };
}

// Create geometries
const sphere = createSphere(0.5, 16, 32);
const cylinder = createCylinder(0.5, 0.5, 1.0, 16, 1);
const cube = createCube();

// Setup VAOs for each geometry
function setupGeometry(geometry) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // Position buffer
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

  // Normal buffer
  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);

  const normalLoc = gl.getAttribLocation(program, "aNormal");
  gl.enableVertexAttribArray(normalLoc);
  gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);

  // Index buffer
  const idxBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);

  return {
    vao,
    count: geometry.indices.length,
  };
}

const sphereVAO = setupGeometry(sphere);
const cylinderVAO = setupGeometry(cylinder);
const cubeVAO = setupGeometry(cube);

const uMVP = gl.getUniformLocation(program, "uModelViewProjection");
const uModelView = gl.getUniformLocation(program, "uModelView");

const projection = mat4.create();
mat4.perspective(
  projection,
  Math.PI / 4,
  canvas.width / canvas.height,
  0.1,
  100
);

// Mouse control variables
let mouseX = 0;
let mouseY = 0;
let isDragging = false;
let cameraRotationX = 0;
let cameraRotationY = 0;

// Mouse event handlers
canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  mouseX = e.clientX;
  mouseY = e.clientY;
});

canvas.addEventListener("mousemove", (e) => {
  if (isDragging) {
    const deltaX = e.clientX - mouseX;
    const deltaY = e.clientY - mouseY;

    cameraRotationY += deltaX * 0.01;
    cameraRotationX += deltaY * 0.01;

    // Clamp vertical rotation
    cameraRotationX = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, cameraRotationX)
    );

    mouseX = e.clientX;
    mouseY = e.clientY;
  }
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
});

canvas.addEventListener("mouseleave", () => {
  isDragging = false;
});

const view = mat4.create();

function drawGeometry(stack, geometry) {
  const mvp = mat4.create();
  const modelView = mat4.create();

  // Calculate the model-view matrix
  mat4.multiply(modelView, view, stack.getCurrentMatrix());

  // Calculate the model-view-projection matrix
  mat4.multiply(mvp, projection, modelView);

  gl.uniformMatrix4fv(uMVP, false, mvp);
  gl.uniformMatrix4fv(uModelView, false, modelView);

  gl.bindVertexArray(geometry.vao);
  gl.drawElements(gl.TRIANGLES, geometry.count, gl.UNSIGNED_SHORT, 0);
}

/* ======  S W O R D  ====== */
const SWORD_LENGTH = 1.5; // 원하는 칼 길이
const SWORD_RADIUS = 0.02; // 칼 두께
const HAND_RADIUS = 0.12;

function createSword() {
  // 원통(캡 없음) — 길이는 SWORD_LENGTH, 반지름은 SWORD_RADIUS
  return createCylinder(
    SWORD_RADIUS,
    SWORD_RADIUS,
    SWORD_LENGTH, // height
    12, // radialSegments
    1, // heightSegments
    true // openEnded: 끝 막지 않음
  );
}

const sword = createSword();
const swordVAO = setupGeometry(sword);

function drawSphere(stack) {
  drawGeometry(stack, sphereVAO);
}

function drawCylinder(stack) {
  drawGeometry(stack, cylinderVAO);
}

function drawCube(stack) {
  drawGeometry(stack, cubeVAO);
}

function drawBody(stack) {
  stack.push();
  // Body: height 1.5, width and depth based on cylinder radius
  mat4.scale(stack.current, stack.current, [0.5, 1.5, 0.25]);
  drawCylinder(stack);
  stack.pop();
}

function drawHead(stack, headTilt = 0) {
  stack.push();
  // Position head relative to body's origin
  // Body top is at y = 0.75. Head center at y = 1.1.
  mat4.translate(stack.current, stack.current, [0, 1.1, 0]);
  // Add head tilt for running animation
  mat4.rotate(stack.current, stack.current, headTilt, [1, 0, 0]);
  drawSphere(stack);
  stack.pop();
}

function drawArm(stack, side = "left", shoulderAngle = 0, elbowAngle = 0) {
  const sign = side === "left" ? -1 : 1;
  const shoulderYOffset = 0.5; // Y-offset for shoulder from body center
  const shoulderXOffset = 0.3; // X-offset for shoulder (reduced)
  const shoulderZOffset = 0.3; // Z-offset for shoulder (added for side positioning)
  const upperArmLength = 0.6;
  const lowerArmLength = 0.6;
  const jointSize = 0.1; // Half-size of joint cubes

  stack.push(); // Save body's coordinate system matrix

  // Move to shoulder joint - positioned to the side (Z-axis) and slightly outward (X-axis)
  mat4.translate(stack.current, stack.current, [
    sign * shoulderXOffset,
    shoulderYOffset,
    sign * shoulderZOffset,
  ]);

  // Apply shoulder rotation (for running animation)
  mat4.rotate(stack.current, stack.current, shoulderAngle, [0, 0, 1]);

  // Shoulder Joint visual (sphere)
  stack.push();
  mat4.scale(stack.current, stack.current, [0.2, 0.2, 0.2]); // Shoulder joint size
  drawSphere(stack);
  stack.pop();

  // Upper Arm (cylinder) - positioned so its top face touches the shoulder joint
  stack.push();
  mat4.translate(stack.current, stack.current, [
    0,
    -(jointSize + upperArmLength / 2),
    0,
  ]);
  mat4.scale(stack.current, stack.current, [0.15, upperArmLength, 0.15]);
  drawCylinder(stack);

  stack.pop();

  // Move to Elbow Joint - positioned so it touches the bottom of upper arm
  mat4.translate(stack.current, stack.current, [
    0,
    -(jointSize + upperArmLength + jointSize),
    0,
  ]);

  // Apply elbow rotation
  mat4.rotate(stack.current, stack.current, elbowAngle, [0, 0, 1]);

  // Elbow Joint visual (sphere)
  stack.push();
  mat4.scale(stack.current, stack.current, [0.18, 0.18, 0.18]); // Elbow joint size
  drawSphere(stack);
  stack.pop();

  // Lower Arm (cylinder) - positioned so its top face touches the elbow joint
  stack.push();
  mat4.translate(stack.current, stack.current, [
    0,
    -(jointSize + lowerArmLength / 2),
    0,
  ]);

  if (side === "right") {
    /* ① 손-구 좌표계 */
    stack.push();
    // 손목까지 더 내려감 : 하완 절반 + jointSize
    mat4.translate(stack.current, stack.current, [
      0,
      -(lowerArmLength / 2 + jointSize),
      0,
    ]);

    /* 손-구 그리기 */
    stack.push();
    mat4.scale(stack.current, stack.current, [
      HAND_RADIUS,
      HAND_RADIUS,
      HAND_RADIUS,
    ]);
    drawSphere(stack);
    stack.pop();

    /* ② 구 중심에서 검 중심으로 이동 */
    // mat4.translate(stack.current, stack.current, [0, -SWORD_LENGTH / 2, 0]); // -Y 로 칼 길이 절반

    /* ── 손끝 위치로 이동 ──
       지금 stack.current 는 ‘팔꿈치 joint’ 좌표계에 있습니다.
       ① 하완 아래쪽 끝까지 : -(jointSize + lowerArmLength)
       ② 칼의 중심이 손끝에 오도록 칼 길이 절반만큼 더 ↓
    */
    mat4.translate(stack.current, stack.current, [
      0,
      -(jointSize + lowerArmLength),
      0,
    ]);

    /* ── 칼 그리기 ── */
    drawGeometry(stack, swordVAO);

    stack.pop();
  }
  mat4.scale(stack.current, stack.current, [0.12, lowerArmLength, 0.12]);
  drawCylinder(stack);
  stack.pop();

  stack.pop(); // Restore body's coordinate system matrix
}

function drawLeg(stack, side = "left", hipAngle = 0, kneeAngle = 0) {
  const sign = side === "left" ? -1 : 1;
  const hipYOffset = -0.75; // Hip joints at the bottom of the torso
  const hipXOffset = 0.2; // Hip joints slightly inset from torso sides (reduced)
  const hipZOffset = 0.25; // Z-offset for hip (added for side positioning)

  const upperLegLength = 0.8;
  const lowerLegLength = 0.7;
  const jointSize = 0.125; // Half-size of joint cubes

  stack.push(); // Save character's root coordinate system

  // Move to Hip Joint - positioned to the side (Z-axis) and slightly outward (X-axis)
  mat4.translate(stack.current, stack.current, [
    sign * hipXOffset,
    hipYOffset,
    sign * hipZOffset,
  ]);

  // Apply hip rotation (for running animation)
  mat4.rotate(stack.current, stack.current, hipAngle, [0, 0, 1]);

  // Hip Joint visual (sphere)
  stack.push();
  mat4.scale(stack.current, stack.current, [0.25, 0.25, 0.25]); // Hip joint sphere size
  drawSphere(stack);
  stack.pop();

  // Upper Leg (cylinder) - positioned so its top face touches the hip joint
  stack.push();
  mat4.translate(stack.current, stack.current, [
    0,
    -(jointSize + upperLegLength / 2),
    0,
  ]);
  mat4.scale(stack.current, stack.current, [0.18, upperLegLength, 0.18]);
  drawCylinder(stack);
  stack.pop();

  // Move to Knee Joint - positioned so it touches the bottom of upper leg
  mat4.translate(stack.current, stack.current, [
    0,
    -(jointSize + upperLegLength + jointSize),
    0,
  ]);

  // Apply knee rotation
  mat4.rotate(stack.current, stack.current, kneeAngle, [0, 0, 1]);

  // Knee Joint visual (sphere)
  stack.push();
  mat4.scale(stack.current, stack.current, [0.2, 0.2, 0.2]); // Knee joint sphere size
  drawSphere(stack);
  stack.pop();

  // Lower Leg (cylinder) - positioned so its top face touches the knee joint
  stack.push();
  mat4.translate(stack.current, stack.current, [
    0,
    -(jointSize + lowerLegLength / 2),
    0,
  ]);
  mat4.scale(stack.current, stack.current, [0.15, lowerLegLength, 0.15]);
  drawCylinder(stack);
  stack.pop();

  // Move to Ankle Joint - positioned at the bottom of lower leg
  mat4.translate(stack.current, stack.current, [
    0,
    -(jointSize + lowerLegLength),
    0,
  ]);

  // Ankle Joint visual (sphere)
  stack.push();
  mat4.scale(stack.current, stack.current, [0.15, 0.15, 0.15]); // Ankle joint sphere size
  drawSphere(stack);
  stack.pop();

  stack.pop(); // Restore character's root coordinate system
}

function drawCharacter(stack, animations = {}) {
  stack.push(); // Save the incoming transformation (world placement)

  // Draw Body as the root
  drawBody(stack);

  // Draw Head, relative to Body's origin
  drawHead(stack, animations.headTilt || 0);

  // Draw Arms, relative to Body's origin
  drawArm(
    stack,
    "left",
    animations.leftShoulderAngle || 0,
    animations.leftElbowAngle || 0
  );
  drawArm(
    stack,
    "right",
    animations.rightShoulderAngle || 0,
    animations.rightElbowAngle || 0
  );

  // Draw Legs, relative to Body's origin
  drawLeg(
    stack,
    "left",
    animations.leftHipAngle || 0,
    animations.leftKneeAngle || 0
  );
  drawLeg(
    stack,
    "right",
    animations.rightHipAngle || 0,
    animations.rightKneeAngle || 0
  );

  stack.pop(); // Restore the original incoming transformation
}

const stack = new MatrixStack();
gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.05, 0.05, 0.1, 1);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Handle window resize
function resizeCanvasToDisplaySize(canvas) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    mat4.perspective(projection, Math.PI / 4, width / height, 0.1, 100);
  }
}

const startPose = {
  // 팔·다리 약간 벌린 자연 자세
  leftShoulder: (-20 * Math.PI) / 180,
  rightShoulder: (20 * Math.PI) / 180,
  leftElbow: 0,
  rightElbow: 0,

  leftHip: (-10 * Math.PI) / 180,
  rightHip: (10 * Math.PI) / 180,
  leftKnee: 0,
  rightKnee: 0,

  bodyLean: 0, // 몸통 기울임
  headTilt: (0 * Math.PI) / 180,
};

const lungePose = {
  // 현재 쓰고 있는 “룽지” 값
  leftShoulder: (-65 * Math.PI) / 180,
  rightShoulder: (90 * Math.PI) / 180,
  leftElbow: 0,
  rightElbow: 0,

  leftHip: (-45 * Math.PI) / 180,
  rightHip: (60 * Math.PI) / 180,
  leftKnee: 0,
  rightKnee: (-105 * Math.PI) / 180,

  bodyLean: (20 * Math.PI) / 180, // X-축 20°
  headTilt: (-5 * Math.PI) / 180,
};

const duration = 0.8;
let startTime = null;

// function render(time) {
//   // 1) 뷰·투영 매트릭스 세팅 (기존과 동일)
//   resizeCanvasToDisplaySize(canvas);
//   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

//   mat4.identity(view);
//   mat4.translate(view, view, [0, 0, -8]);
//   mat4.rotateX(view, view, cameraRotationX);
//   mat4.rotateY(view, view, cameraRotationY);

//   // 2) 월드 스택 초기화
//   stack.loadIdentity();

//   // → 몸통을 앞으로 살짝 기울여 룽지의 전형적인 포워드 리치 연출
//   //    (X축 기준 시계방향으로 20° 기울이기)
//   mat4.rotate(stack.current, stack.current, (20 * Math.PI) / 180, [1, 0, 0]);

//   // 3) 고정된 룽지 각도 설정
//   const animations = {
//     // 어깨: 오른팔 앞으로 뻗기 (-60°), 왼팔은 자연스럽게 뒤
//     leftShoulderAngle: (-65 * Math.PI) / 180, // 살짝 뒤로
//     rightShoulderAngle: (90 * Math.PI) / 180, // 앞으로
//     // 팔꿈치: 완전 펴기
//     leftElbowAngle: 0,
//     rightElbowAngle: 0,

//     // 엉덩이(hip): 오른다리 앞으로 45°, 왼다리는 뒤로 15°
//     leftHipAngle: (-45 * Math.PI) / 180,
//     rightHipAngle: (60 * Math.PI) / 180,

//     // 무릎: 앞다리(오른쪽) 60° 정도 굽힘, 뒷다리는 펴기
//     leftKneeAngle: 0,
//     rightKneeAngle: (-105 * Math.PI) / 180,

//     // 머리: 살짝 위를 쏘듯 고개 살짝 듦 (optional)
//     headTilt: (-5 * Math.PI) / 180,
//   };

//   // 4) 캐릭터 그리기
//   drawCharacter(stack, animations);

//   // 5) 다음 프레임 (정적 포즈라 time 무시해도 무방)
//   requestAnimationFrame(render);
// }

function render(time) {
  if (startTime === null) startTime = time;
  const sec = (time - startTime) / 1000;
  const t = Math.min(sec / duration, 1.0);

  resizeCanvasToDisplaySize(canvas);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  mat4.identity(view);
  mat4.translate(view, view, [0, 0, -8]);
  mat4.rotateX(view, view, cameraRotationX);
  mat4.rotateY(view, view, cameraRotationY);

  stack.loadIdentity();

  const bodyLean = lerp(startPose.bodyLean, lungePose.bodyLean, t);
  mat4.rotate(stack.current, stack.current, bodyLean, [1, 0, 0]);

  const animations = {
    leftShoulderAngle: lerp(startPose.leftShoulder, lungePose.leftShoulder, t),
    rightShoulderAngle: lerp(
      startPose.rightShoulder,
      lungePose.rightShoulder,
      t
    ),
    leftElbowAngle: lerp(startPose.leftElbow, lungePose.leftElbow, t),
    rightElbowAngle: lerp(startPose.rightElbow, lungePose.rightElbow, t),

    leftHipAngle: lerp(startPose.leftHip, lungePose.leftHip, t),
    rightHipAngle: lerp(startPose.rightHip, lungePose.rightHip, t),
    leftKneeAngle: lerp(startPose.leftKnee, lungePose.leftKnee, t),
    rightKneeAngle: lerp(startPose.rightKnee, lungePose.rightKnee, t),

    headTilt: lerp(startPose.headTilt, lungePose.headTilt, t),
  };

  drawCharacter(stack, animations);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
