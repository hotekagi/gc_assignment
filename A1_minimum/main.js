let CANVAS;
let GL;
let LEGACY_GL;
let DRAW_UTIL;
let CAMERA;
let IS_DRAGGING = false;

function init() {
  // OpenGL context
  CANVAS = document.getElementById("canvas");
  GL = CANVAS.getContext("experimental-webgl");
  if (!GL) alert("Could not initialise WebGL, sorry :-(");

  GL.viewport(0, 0, CANVAS.width, CANVAS.height);
  GL.clearColor(1, 1, 1, 1);

  const vertex_shader_src =
    "\
    attribute vec3 a_vertex;\
    attribute vec3 a_color;\
    varying vec3 v_color;\
    uniform mat4 u_modelview;\
    uniform mat4 u_projection;\
    void main(void) {\
      gl_Position = u_projection * u_modelview * vec4(a_vertex, 1.0);\
      v_color = a_color;\
      gl_PointSize = 5.0;\
    }\
    ";
  const fragment_shader_src =
    "\
    precision mediump float;\
    varying vec3 v_color;\
    void main(void) {\
      gl_FragColor = vec4(v_color, 1.0);\
    }\
    ";
  LEGACY_GL = get_legacygl(GL, vertex_shader_src, fragment_shader_src);

  LEGACY_GL.add_uniform("modelview", "Matrix4f");
  LEGACY_GL.add_uniform("projection", "Matrix4f");
  LEGACY_GL.add_vertex_attribute("color", 3);
  LEGACY_GL.vertex2 = function (p) {
    this.vertex(p[0], p[1], 0);
  };

  DRAW_UTIL = get_drawutil(GL, LEGACY_GL);
  CAMERA = get_camera(CANVAS.width);
  CAMERA.center = [2, 0, 0];
  CAMERA.eye = [2, 0, 7];

  update_position();

  // Event handlers
  CANVAS.onmousedown = function () {
    IS_DRAGGING = true;
  };

  CANVAS.onmousemove = function (evt) {
    if (!IS_DRAGGING) return;

    const mouse_win = this.get_mousepos(evt);
    mouse_win.push(1);

    const viewport = [0, 0, CANVAS.width, CANVAS.height];
    const mouse_obj = glu.unproject(
      mouse_win,
      LEGACY_GL.uniforms.modelview.value,
      LEGACY_GL.uniforms.projection.value,
      viewport
    );
    const plane_origin = [0, 0, 0];
    const plane_normal = [0, 0, 1];
    const eye_to_mouse = vec3.sub([], mouse_obj, CAMERA.eye);
    const eye_to_origin = vec3.sub([], plane_origin, CAMERA.eye);
    const s1 = vec3.dot(eye_to_mouse, plane_normal);
    const s2 = vec3.dot(eye_to_origin, plane_normal);
    const eye_to_intersection = vec3.scale([], eye_to_mouse, s2 / s1);
    let target_position = vec3.add([], CAMERA.eye, eye_to_intersection);

    const target_distance = vec2.length(target_position);
    const min_distance = LINKAGES.slice(0, SELECTED + 1).reduce(function (
      acc,
      linkage
    ) {
      return acc + linkage.length;
    },
    0);
    if (target_distance < min_distance) {
      target_position = vec2.scale(
        [],
        target_position,
        min_distance / target_distance
      );
    }

    compute_ik([target_position[0], target_position[1]]);
    draw();

    LEGACY_GL.begin(GL.LINES);
    LEGACY_GL.color(0, 1, 0);
    LEGACY_GL.vertex(0, 0, 0);
    LEGACY_GL.vertex2(target_position);
    LEGACY_GL.end();
  };
  document.onmouseup = function () {
    IS_DRAGGING = false;
  };
}

function draw() {
  GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
  mat4.perspective(
    LEGACY_GL.uniforms.projection.value,
    Math.PI / 6,
    CANVAS.aspect_ratio(),
    0.1,
    1000
  );
  const modelview = LEGACY_GL.uniforms.modelview;
  CAMERA.lookAt(modelview.value);

  GL.lineWidth(1);
  LEGACY_GL.color(0.5, 0.5, 0.5);
  DRAW_UTIL.xygrid(100);

  LEGACY_GL.begin(GL.LINES);
  LINKAGES.forEach(function (linkage, index) {
    LEGACY_GL.color(1, 0, 0);
    if (index == 0) LEGACY_GL.vertex(0, 0, 0);
    else LEGACY_GL.vertex2(LINKAGES[index - 1].position);
    LEGACY_GL.vertex2(linkage.position);
  });
  LEGACY_GL.end();

  LEGACY_GL.begin(GL.LINE_STRIP);
  LEGACY_GL.color(0, 0, 1);
  for (let idx = SELECTED; idx < LINKAGES.length; idx++) {
    LEGACY_GL.vertex2(LINKAGES[idx].position);
  }
  LEGACY_GL.end();

  LEGACY_GL.begin(GL.POINTS);
  LEGACY_GL.color(0, 0, 1);
  LEGACY_GL.vertex(0, 0, 0);
  LINKAGES.forEach(function (linkage) {
    LEGACY_GL.color(1, 0, 0);
    LEGACY_GL.vertex2(linkage.position);
  });
  LEGACY_GL.color(0, 1, 0);
  LEGACY_GL.vertex2(LINKAGES[SELECTED].position);
  LEGACY_GL.end();
}

const LINKAGES = [
  { position: [0, 0], angle: 0, length: 0.3 },
  { position: [0, 0], angle: 0, length: 0.5 },
  { position: [0, 0], angle: 0, length: 0.4 },
  { position: [0, 0], angle: 0, length: 0.6 },
  { position: [0, 0], angle: 0, length: 0.5 },
];
let SELECTED = LINKAGES.length - 2;

function decrease_selected() {
  SELECTED = Math.max(0, SELECTED - 1);
}
function increase_selected() {
  SELECTED = Math.min(LINKAGES.length - 1, SELECTED + 1);
}
function reset_angles() {
  LINKAGES.forEach(function (linkage) {
    linkage.angle = 0;
  });
  update_position();
  draw();
}

function update_position() {
  LINKAGES.forEach(function (linkage, idx) {
    linkage.position[0] =
      root_position(idx)[0] +
      linkage.length * Math.cos((linkage.angle * Math.PI) / 180);
    linkage.position[1] =
      root_position(idx)[1] +
      linkage.length * Math.sin((linkage.angle * Math.PI) / 180);
  });
}

function root_position(idx) {
  return idx > 0 ? LINKAGES[idx - 1].position : [0, 0];
}

function compute_ik(target_position) {
  let idx;
  let angle_to_target;
  let angle_to_leaf;

  const max_iter = 10;
  for (_ = 0; _ < max_iter; ++_) {
    idx = SELECTED;

    angle_to_target = Math.atan2(
      target_position[1] - root_position(idx)[1],
      target_position[0] - root_position(idx)[0]
    );

    LINKAGES[idx].angle = (angle_to_target * 180) / Math.PI;
    update_position();

    for (idx = SELECTED - 1; idx >= 0; --idx) {
      angle_to_target = Math.atan2(
        target_position[1] - root_position(idx)[1],
        target_position[0] - root_position(idx)[0]
      );
      angle_to_leaf = Math.atan2(
        LINKAGES[LINKAGES.length - 1].position[1] - root_position(idx)[1],
        LINKAGES[LINKAGES.length - 1].position[0] - root_position(idx)[0]
      );
      LINKAGES[idx].angle = (angle_to_target - angle_to_leaf) * (180 / Math.PI);

      if (idx > 0) {
        LINKAGES[idx].angle += LINKAGES[idx - 1].angle;
      }
      update_position();
    }
  }
}
