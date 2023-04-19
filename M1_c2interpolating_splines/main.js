var gl;
var canvas;
var legacygl;
var drawutil;
var camera;

var points = [
  [2.1, -0.2],
  [1.6, 0.4],
  [0.3, 0.1],
  [-0.2, 0.5],
];
var selected = null;

function circleFromPoints(points) {
  var [p1, p2, p3] = points;
  var [x1, y1] = p1;
  var [x2, y2] = p2;
  var [x3, y3] = p3;

  var denom = x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2);
  var num1 = (x1 ** 2 + y1 ** 2) * (y2 - y3);
  var num2 = (x2 ** 2 + y2 ** 2) * (y3 - y1);
  var num3 = (x3 ** 2 + y3 ** 2) * (y1 - y2);
  var num = num1 + num2 + num3;

  var centerX = num / (2 * denom);
  var centerY =
    ((x3 - x2) * (x1 ** 2 + y1 ** 2) +
      (x1 - x3) * (x2 ** 2 + y2 ** 2) +
      (x2 - x1) * (x3 ** 2 + y3 ** 2)) /
    (2 * denom);
  var radius = Math.sqrt((x1 - centerX) ** 2 + (y1 - centerY) ** 2);

  return { center: [centerX, centerY], radius };
}

function draw() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // projection & camera position
  mat4.perspective(
    legacygl.uniforms.projection.value,
    Math.PI / 6,
    canvas.aspect_ratio(),
    0.1,
    1000
  );
  var modelview = legacygl.uniforms.modelview;
  camera.lookAt(modelview.value);

  // xy grid
  gl.lineWidth(1);
  legacygl.color(0.5, 0.5, 0.5);
  drawutil.xygrid(100);

  var prev_curve = [];
  for (var i = 0; i < points.length - 2; i++) {
    var numsteps = Number(document.getElementById("input_numsteps").value);
    var current_curve = [];

    var targets = points.slice(i, i + 3);
    var circle = circleFromPoints(targets);

    var centerX = circle.center[0];
    var centerY = circle.center[1];
    var radius = circle.radius;

    legacygl.color(0.5, 0.5, 0.5);
    legacygl.begin(gl.POINTS);
    document.getElementById("input_show_samplepoints").checked &&
      legacygl.vertex2([centerX, centerY]);
    legacygl.end();

    var srtAngle = Math.atan2(targets[0][1] - centerY, targets[0][0] - centerX);
    var endAngle = Math.atan2(targets[1][1] - centerY, targets[1][0] - centerX);

    if (Math.abs(endAngle - srtAngle) >= Math.PI) {
      if (endAngle < 0) {
        endAngle += 2 * Math.PI;
      }
      if (Math.abs(endAngle - srtAngle) >= Math.PI) {
        // alert("do not use acute angle");
        if (srtAngle < 0) {
          srtAngle += 2 * Math.PI;
        }
      }
    }

    legacygl.color(1, 0.6, 0.2);
    legacygl.begin(gl.LINE_STRIP);
    for (var j = 0; j < numsteps + 1; j++) {
      var theta = (j / numsteps) * (endAngle - srtAngle) + srtAngle;
      var x = centerX + radius * Math.cos(theta);
      var y = centerY + radius * Math.sin(theta);
      document.getElementById("input_show_samplepoints").checked &&
        legacygl.vertex2([x, y]);
      current_curve.push([x, y]);
    }
    legacygl.end();
    var srtAngle = Math.atan2(targets[1][1] - centerY, targets[1][0] - centerX);
    var endAngle = Math.atan2(targets[2][1] - centerY, targets[2][0] - centerX);

    if (Math.abs(endAngle - srtAngle) >= Math.PI) {
      if (endAngle < 0) {
        endAngle += 2 * Math.PI;
      }
      if (Math.abs(endAngle - srtAngle) >= Math.PI) {
        // alert("do not use acute angle");
        if (srtAngle < 0) {
          srtAngle += 2 * Math.PI;
        }
      }
    }

    legacygl.color(1, 0.6, 0.2);
    legacygl.begin(gl.LINE_STRIP);
    for (var j = 0; j < numsteps + 1; j++) {
      var theta = (j / numsteps) * (endAngle - srtAngle) + srtAngle;
      var x = centerX + radius * Math.cos(theta);
      var y = centerY + radius * Math.sin(theta);
      document.getElementById("input_show_samplepoints").checked &&
        legacygl.vertex2([x, y]);
      current_curve.push([x, y]);
    }
    legacygl.end();

    if (prev_curve.length > 0) {
      legacygl.color(1, 0, 0);
      legacygl.begin(gl.LINE_STRIP);
      for (var j = 0; j < numsteps + 1; j++) {
        var plot = vec2.scaleAndAdd_ip(
          vec2.scale(
            [],
            prev_curve[j + numsteps + 1],
            Math.cos((Math.PI * j) / 2 / numsteps) ** 2
          ),
          current_curve[j],
          Math.sin((Math.PI * j) / 2 / numsteps) ** 2
        );
        legacygl.vertex2(plot);
      }
      legacygl.end();
    }
    prev_curve = current_curve.slice();
  }

  // draw control points
  if (document.getElementById("input_show_controlpoints").checked) {
    legacygl.color(0.2, 0.5, 1);
    legacygl.begin(gl.LINE_STRIP);
    points.forEach(function (p) {
      legacygl.vertex2(p);
    });
    legacygl.end();
    legacygl.begin(gl.POINTS);
    points.forEach(function (p) {
      legacygl.vertex2(p);
    });
    legacygl.end();
  }
}

function init() {
  // OpenGL context
  canvas = document.getElementById("canvas");
  gl = canvas.getContext("experimental-webgl");
  if (!gl) alert("Could not initialise WebGL, sorry :-(");
  var vertex_shader_src =
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
  var fragment_shader_src =
    "\
  precision mediump float;\
  varying vec3 v_color;\
  void main(void) {\
      gl_FragColor = vec4(v_color, 1.0);\
  }\
  ";
  legacygl = get_legacygl(gl, vertex_shader_src, fragment_shader_src);
  legacygl.add_uniform("modelview", "Matrix4f");
  legacygl.add_uniform("projection", "Matrix4f");
  legacygl.add_vertex_attribute("color", 3);
  legacygl.vertex2 = function (p) {
    this.vertex(p[0], p[1], 0);
  };
  drawutil = get_drawutil(gl, legacygl);
  camera = get_camera(canvas.width);
  camera.eye = [0, 0, 7];

  // event handlers
  canvas.onmousedown = function (evt) {
    var mouse_win = this.get_mousepos(evt);

    if (evt.altKey) {
      camera.start_moving(mouse_win, evt.shiftKey ? "zoom" : "pan");
      return;
    }

    // pick nearest object
    var viewport = [0, 0, canvas.width, canvas.height];
    var dist_min = 10000000;
    for (var i = 0; i < points.length; i++) {
      var object_win = glu.project(
        [points[i][0], points[i][1], 0],
        legacygl.uniforms.modelview.value,
        legacygl.uniforms.projection.value,
        viewport
      );
      var dist = vec2.dist(mouse_win, object_win);
      if (dist < dist_min) {
        dist_min = dist;
        selected = points[i];
      }
    }

    if (evt.shiftKey && dist_min > 10) {
      var _source = [points[0][0], points[1][1]];
      var _mouse_win = this.get_mousepos(evt);
      var _viewport = [0, 0, canvas.width, canvas.height];
      _mouse_win.push(1);
      var _mouse_obj = glu.unproject(
        _mouse_win,
        legacygl.uniforms.modelview.value,
        legacygl.uniforms.projection.value,
        _viewport
      );

      // just reuse the same code as the 3D case
      var plane_origin = [0, 0, 0];
      var plane_normal = [0, 0, 1];
      var _eye_to_mouse = vec3.sub([], _mouse_obj, camera.eye);
      var _eye_to_origin = vec3.sub([], plane_origin, camera.eye);
      var s1 = vec3.dot(_eye_to_mouse, plane_normal);
      var s2 = vec3.dot(_eye_to_origin, plane_normal);
      var _eye_to_intersection = vec3.scale([], _eye_to_mouse, s2 / s1);

      vec3.add(_source, camera.eye, _eye_to_intersection);
      points.push(_source);
      draw();
    }
  };

  canvas.onmousemove = function (evt) {
    var mouse_win = this.get_mousepos(evt);
    if (camera.is_moving()) {
      camera.move(mouse_win);
      draw();
      return;
    }
    if (selected != null && !evt.shiftKey) {
      var viewport = [0, 0, canvas.width, canvas.height];
      mouse_win.push(1);
      var mouse_obj = glu.unproject(
        mouse_win,
        legacygl.uniforms.modelview.value,
        legacygl.uniforms.projection.value,
        viewport
      );

      // just reuse the same code as the 3D case
      var plane_origin = [0, 0, 0];
      var plane_normal = [0, 0, 1];
      var eye_to_mouse = vec3.sub([], mouse_obj, camera.eye);
      var eye_to_origin = vec3.sub([], plane_origin, camera.eye);
      var s1 = vec3.dot(eye_to_mouse, plane_normal);
      var s2 = vec3.dot(eye_to_origin, plane_normal);
      var eye_to_intersection = vec3.scale([], eye_to_mouse, s2 / s1);

      vec3.add(selected, camera.eye, eye_to_intersection);
      draw();
    }
  };

  document.onmouseup = function (evt) {
    if (camera.is_moving()) {
      camera.finish_moving();
      return;
    }
    selected = null;
  };

  // init OpenGL settings
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(1, 1, 1, 1);
}
