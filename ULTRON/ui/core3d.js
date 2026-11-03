// The original concentric-ring artwork, lifted into shallow 3D layers.
// Radii, tick counts, arc lengths, hexagon and particle placement match v1.
const canvas = $("#core"),
  ctx = canvas.getContext("2d");
let width = 0,
  height = 0,
  last = 0,
  phase = 0,
  visualTime = 0,
  tiltX = 0,
  tiltY = 0,
  depthScale = 1,
  angularSpeed = 0.28;
let pointerX = 0,
  pointerY = 0;
const stage = $(".core-stage"),
  TAU = Math.PI * 2;
stage.addEventListener("pointermove", (e) => {
  const b = stage.getBoundingClientRect();
  const reach = Math.min(b.width, b.height) * 0.55;
  pointerX = Math.max(
    -0.8,
    Math.min(0.8, (e.clientX - b.left - b.width / 2) / reach),
  );
  pointerY = Math.max(
    -0.8,
    Math.min(0.8, (e.clientY - b.top - b.height / 2) / reach),
  );
});
stage.addEventListener("pointerleave", () => {
  pointerX = pointerY = 0;
});
function resize() {
  const rect = canvas.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio || 1, 2);
  width = rect.width;
  height = rect.height;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
new ResizeObserver(resize).observe(canvas);
resize();
const particles = Array.from({ length: 85 }, (_, i) => ({
  a: i * 2.39996,
  r: 0.54 + ((i * 37) % 100) / 190,
  s: 0.35 + (i % 3) * 0.3,
  z: (((i * 17) % 11) - 5) * 0.07,
}));
const modes = {
  idle: { speed: 0.28, depth: 1 },
  listening: { speed: 1.1, depth: 1.4 },
  thinking: { speed: 1.9, depth: 1.18 },
  speaking: { speed: 0.42, depth: 1.2 },
  error: { speed: 0.14, depth: 1 },
};
const pointPool = [],
  objectPool = [],
  objects = [];
let pointCount = 0,
  objectCount = 0,
  animationTimer,
  animationFrame;
function record(
  kind,
  p,
  q,
  z,
  color,
  alpha,
  width = 1,
  size = 0,
  glow = false,
) {
  const o = objectPool[objectCount] || (objectPool[objectCount] = {});
  o.kind = kind;
  o.p = p;
  o.q = q;
  o.z = z;
  o.color = color;
  o.alpha = alpha;
  o.width = width;
  o.size = size;
  o.glow = glow;
  objects[objectCount++] = o;
}
function scheduleDraw() {
  if (!document.hidden)
    animationTimer = setTimeout(
      () => {
        animationFrame = requestAnimationFrame(draw);
      },
      reduced ? 120 : state === "idle" ? 42 : 33,
    );
}
document.addEventListener("visibilitychange", () => {
  clearTimeout(animationTimer);
  cancelAnimationFrame(animationFrame);
  if (!document.hidden) {
    last = performance.now();
    scheduleDraw();
  }
});
function draw(now) {
  if (document.hidden) return;
  scheduleDraw();
  pointCount = objectCount = 0;
  const dt = Math.min((now - last) / 1000, 0.06);
  last = now;
  const active = state,
    mode = modes[active];
  if (analyser && levels) {
    analyser.getByteTimeDomainData(levels);
    let sum = 0;
    for (const v of levels) sum += ((v - 128) / 128) ** 2;
    amplitude = Math.min(1, Math.sqrt(sum / levels.length) * 5);
  } else
    amplitude =
      active === "speaking"
        ? 0.25 + Math.sin(now * 0.008) ** 2 * 0.6
        : active === "thinking"
          ? 0.22
          : 0;
  const smooth = 1 - Math.exp(-dt * 5);
  depthScale += (mode.depth - depthScale) * smooth;
  angularSpeed += (mode.speed - angularSpeed) * smooth;
  if (!reduced) {
    phase += dt * angularSpeed;
    visualTime += dt;
    tiltX += (pointerY * 0.45 - tiltX) * smooth;
    tiltY += (pointerX * 0.57 - tiltY) * smooth;
  } else tiltX = tiltY = 0;
  const t = reduced ? 0 : visualTime,
    rotation = reduced ? 0 : phase,
    r = Math.min(width * 0.32, height * 0.33, 185),
    pulse = reduced ? 1 : 1 + Math.sin(t * 1.7) * 0.012 + amplitude * 0.035;
  // Small shared tilt keeps every ring concentric and recognisably front-facing.
  const ax = reduced ? 0 : -0.15 + Math.sin(t * 0.27) * 0.055 + tiltX,
    ay = reduced ? 0 : 0.19 + Math.cos(t * 0.22) * 0.055 + tiltY,
    depth = reduced ? 1 : depthScale;
  const sinX = Math.sin(ax),
    cosX = Math.cos(ax),
    sinY = Math.sin(ay),
    cosY = Math.cos(ay);
  function project(x, y, z) {
    z *= depth;
    const y1 = y * cosX - z * sinX,
      z1 = y * sinX + z * cosX;
    const x1 = x * cosY + z1 * sinY,
      z2 = -x * sinY + z1 * cosY;
    const scale = 7 / (7 - z2);
    const point = pointPool[pointCount] || (pointPool[pointCount] = {});
    pointCount++;
    point.x = x1 * r * scale * pulse + tiltY * 22;
    point.y = y1 * r * scale * pulse + tiltX * 18;
    point.z = z2;
    point.scale = scale;
    return point;
  }
  const polar = (radius, a, z) =>
    project(Math.cos(a) * radius, Math.sin(a) * radius, z);

  function line(p, q, color, alpha = 1, width = 1) {
    record("line", p, q, (p.z + q.z) / 2, color, alpha, width);
  }
  function face(points, color, alpha = 1) {
    const o = objectPool[objectCount] || (objectPool[objectCount] = {});
    const stable = o.facePoints || (o.facePoints = []);
    for (let i = 0; i < points.length; i++) stable[i] = points[i];
    stable.length = points.length;
    record(
      "face",
      stable,
      null,
      points.reduce((sum, p) => sum + p.z, 0) / points.length,
      color,
      alpha,
    );
  }
  function fault(radius, a) {
    const angle = (((a - radius * 2.7) % TAU) + TAU) % TAU;
    const cuts = [
      [0.34, 0.4],
      [2.18, 2.26],
      [4.57, 4.66],
    ];
    return cuts.some(([lo, hi]) => angle > lo && angle < hi);
  }
  function shard(radius, a, z) {
    const angle = (((a - radius * 2.7) % TAU) + TAU) % TAU;
    const detached = angle > 4.66 && angle < 4.88;
    return polar(
      radius + (detached ? 0.018 : 0),
      a,
      z + (detached ? 0.035 : 0),
    );
  }
  function raisedArc(
    radius,
    start,
    end,
    z,
    color,
    width = 1,
    thickness = 0.045,
  ) {
    const count = Math.ceil((end - start) * radius * 64);
    for (let j = 0; j < count; j++) {
      const a = start + ((end - start) * j) / count,
        b = start + ((end - start) * (j + 1)) / count;
      if (fault(radius, (a + b) / 2)) continue;
      const fa = shard(radius, a, z),
        fb = shard(radius, b, z),
        ba = shard(radius, a, z - thickness),
        bb = shard(radius, b, z - thickness);
      face([ba, bb, fb, fa], "90,30,30", 0.4);
      line(ba, bb, "61,27,29", 0.6, width);
      line(fa, fb, color, 1, width);
    }
  }
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.5);
  glow.addColorStop(0, "rgba(255,52,40," + (0.09 + amplitude * 0.1) + ")");
  glow.addColorStop(0.6, "rgba(224,44,32,.035)");
  glow.addColorStop(1, "rgba(240,40,30,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
  particles.forEach((p, i) => {
    const a = p.a + rotation * (i % 2 ? 1 : -1) * 0.12,
      pt = polar(p.r * 1.7, a, p.z);
    record(
      "dot",
      pt,
      null,
      pt.z,
      "255,122,101",
      0.12 + (i % 6) * 0.065,
      1,
      p.s,
    );
  });
  // Original 72 outer indexing marks and continuous outer rings.
  for (let i = 0; i < 72; i++) {
    if ([13, 14, 43, 67].includes(i)) continue;
    const a = (i * Math.PI) / 36 + rotation * 0.05;
    line(
      polar(1.18, a, -0.19),
      polar(1.18 + (i % 6 ? 3 : 7) / r, a, -0.19),
      i % 6 ? "66,37,38" : "134,80,68",
      1,
      1,
    );
  }
  raisedArc(1.13, 0, TAU, -0.13, "80,38,40", 0.6, 0.035);
  raisedArc(0.98, 0, TAU, -0.07, "79,42,40", 0.8, 0.035);
  // Same three rings, three broken arcs per ring, same opposing rotation.
  for (let ring = 0; ring < 3; ring++) {
    for (let j = 0; j < 3; j++) {
      const a = rotation * (ring % 2 ? -0.7 : 1) + (j * TAU) / 3 + ring;
      raisedArc(
        1.05 - ring * 0.12,
        a,
        a + 0.8 + ring * 0.12,
        -0.04 + ring * 0.105,
        ring === 0 ? "238,103,84" : ring === 1 ? "125,51,47" : "174,76,64",
        ring === 0 ? 2 : 1,
        0.045,
      );
    }
  }
  // Original 90 radial bars on the inner raised dial.
  for (let i = 0; i < 90; i++) {
    if ([16, 17, 45, 70, 71].includes(i)) continue;
    const a = (i * Math.PI) / 45 - rotation * 0.6,
      len =
        3 +
        (i % 9 === 0 ? 7 : 0) +
        amplitude * (3 + Math.sin(i * 0.7 + t * 8) * 3);
    line(
      polar(0.73, a, 0.22),
      polar(0.73 + len / r, a, 0.22),
      i % 3 ? "158,68,58" : "237,121,99",
      1,
      1.4,
    );
  }
  raisedArc(0.65, 0, TAU, 0.23, "78,40,41", 1, 0.045);
  raisedArc(0.59, 0, TAU, 0.28, "221,102,82", 0.8, 0.045);
  raisedArc(0.55, 0, TAU, 0.31, "84,43,43", 0.6, 0.035);
  // Original outlined hexagon, with a subtle dark side edge and no new solid shape.
  const front = [],
    back = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2 + rotation * 0.14;
    front.push(polar(0.49, a, 0.35));
    back.push(polar(0.49, a, 0.28));
  }
  for (let i = 0; i < 6; i++) {
    const n = (i + 1) % 6;
    face([back[i], back[n], front[n], front[i]], "56,23,26", 0.65);
    line(back[i], back[n], "55,26,28", 0.5, 0.6);
    if (i === 1 || i === 4) {
      const mix = (t) => ({
        x: front[i].x + (front[n].x - front[i].x) * t,
        y: front[i].y + (front[n].y - front[i].y) * t,
        z: front[i].z + (front[n].z - front[i].z) * t,
        scale: front[i].scale,
      });
      line(front[i], mix(0.43), "102,51,47", 1, 0.6);
      line(mix(0.56), front[n], "102,51,47", 1, 0.6);
    } else line(front[i], front[n], "102,51,47", 1, 0.6);
  }
  // The five original orbit lights remain on their original ring radii.
  for (let i = 0; i < 5; i++) {
    const a = rotation * 0.3 + i * 1.256,
      pt = polar(i % 2 ? 1.06 : 0.87, a, i % 2 ? -0.035 : 0.17);
    record("dot", pt, null, pt.z, "255,149,125", 1, 1, 2, true);
  }
  objects.length = objectCount;
  objects.sort((a, b) => a.z - b.z);
  for (const o of objects) {
    ctx.globalAlpha = o.alpha;
    if (o.kind === "face") {
      ctx.beginPath();
      o.p.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = "rgb(" + o.color + ")";
      ctx.fill();
    } else if (o.kind === "line") {
      ctx.beginPath();
      ctx.moveTo(o.p.x, o.p.y);
      ctx.lineTo(o.q.x, o.q.y);
      ctx.lineWidth = (o.width * (o.p.scale + o.q.scale)) / 2;
      ctx.strokeStyle = "rgb(" + o.color + ")";
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgb(" + o.color + ")";
      if (o.glow) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#ff6850";
      }
      ctx.beginPath();
      ctx.arc(o.p.x, o.p.y, o.size * o.p.scale, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // Preserve original title typography while aligning it to the raised centre.
  const title = project(0, 0, 0.35);
  $("#core-button").style.transform =
    "translate(calc(-50% + " +
    title.x.toFixed(2) +
    "px), calc(-50% + " +
    title.y.toFixed(2) +
    "px)) perspective(700px) rotateX(" +
    ((-ax * 180) / Math.PI).toFixed(2) +
    "deg) rotateY(" +
    ((ay * 180) / Math.PI).toFixed(2) +
    "deg)";
  wave.forEach((bar, i) => {
    const h = reduced
      ? 3
      : 3 +
        (active === "idle" || active === "error" ? 1.5 : 20) *
          amplitude *
          (0.25 + 0.75 * Math.sin(i * 0.5 + t * 7) ** 2) *
          Math.sin((Math.PI * i) / wave.length);
    bar.style.height = h + "px";
    bar.style.background = active === "speaking" ? "#ff7461" : "#a73f38";
  });
}
scheduleDraw();
