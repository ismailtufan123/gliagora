// The hero's two shaders (PLAN §10.3, §10.5): each brain point is a soft dot, lit from the upper
// left and darker in the depth of a fold; points turned away from the viewer fade out, so the far
// side never shows through, and so does the cut end of the brainstem. One calcium wave runs from
// its cell across the cortex (F2), its front uneven like a real one: magenta near the cell, turning
// DAPI blue as it reaches the back of the brain, as the poster's wave does, with a fading wake.
// Another runs from the brain's centre to a window's label and settles there as a small glow (F3).
// A lit point takes the wave's colour itself, so on paper the wave is the brand's magenta, never
// darkened by the ink. Colours come from the design tokens at run time (scene.ts).

export const VERTEX = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float uSize;
uniform float uDistance;
uniform float uGather;
uniform vec3 uOrigin;
uniform vec3 uCentre;
uniform float uReach;
uniform float uFloor;
uniform float uWave;
uniform float uWaveFade;
uniform float uWaveWidth;
uniform vec3 uFocus;
uniform float uFocusRun;
uniform float uFocusStrength;
uniform float uDark;
in vec3 position;
in vec3 normal;
in float shade;
out float vBase;
out float vLit;
out float vHue;

float hash(float n) { return fract(sin(n) * 43758.5453); }

// Smooth value noise in 3D (-1…1), so the wave's front bends and frays like a real one.
float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z) * 2.0 - 1.0;
}

// A wave's band around its front at distance d: sharp ahead, softer behind.
float band(float d, float front, float width) {
  float x = (d - front) / (d > front ? width * 0.6 : width * 1.4);
  return exp(-x * x);
}

void main() {
  float id = float(gl_VertexID);
  float r1 = hash(id * 0.1031 + 0.7);
  float r2 = hash(id * 0.1173 + 3.1);

  // Arrival (F2): each point starts a little inside the brain and settles onto its surface at a
  // time of its own, so the brain condenses within its own outline.
  float g = clamp((uGather - r1 * 0.4) / 0.6, 0.0, 1.0);
  g = 1.0 - (1.0 - g) * (1.0 - g) * (1.0 - g);
  vec3 p = position - normal * (0.015 + 0.05 * r2) * (1.0 - g);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  vec3 n = normalize(normalMatrix * normal);
  float facing = dot(n, normalize(-mv.xyz));
  float front = smoothstep(-0.1, 0.3, facing) * smoothstep(uFloor, uFloor + 0.07, position.y);
  float light = 0.34 + 0.66 * max(dot(n, normalize(vec3(-0.45, 0.6, 0.66))), 0.0);
  vBase = front * light * mix(0.2, 1.0, shade * shade) * mix(0.15, 1.0, g) * mix(1.0, 0.82, uDark);

  // The calcium wave (F2): its distance from the cell, bent by the noise and frayed per point.
  float d = distance(position, uOrigin);
  float path = clamp(d / uReach, 0.0, 1.0);
  d += noise(position * 7.0) * uWaveWidth * 1.3 + (r2 - 0.5) * uWaveWidth * 0.9;
  float wave = uWave < 0.0 ? 0.0 : band(d, uWave, uWaveWidth) * uWaveFade;
  float wake = uWave > d ? exp((d - uWave) / (uWaveWidth * 7.0)) * 0.42 * uWaveFade : 0.0;

  // The wave to a label (F3): one soft pulse from the brain's centre, on the label's side, then a
  // small steady glow where it arrives.
  vec3 toFocus = uFocus - uCentre;
  float reach = max(length(toFocus), 0.0001);
  vec3 rel = position - uCentre;
  float side = smoothstep(0.45, 0.95, dot(normalize(rel + 0.0001), toFocus / reach));
  float ring = band(length(rel) + noise(position * 9.0) * uWaveWidth * 0.8, uFocusRun * reach, uWaveWidth * 1.2);
  ring *= side * (1.0 - smoothstep(0.8, 1.0, uFocusRun));
  float glow = smoothstep(0.75, 1.0, uFocusRun) * exp(-pow(distance(position, uFocus) / (uWaveWidth * 1.1), 2.0));
  float focus = uFocusStrength * max(ring, glow * 0.9);

  vLit = front * max(max(wave, wake), focus);
  // Magenta near the cell, DAPI blue at the back (the poster's gradient); a label's wave is magenta.
  vHue = focus > max(wave, wake) ? 0.0 : smoothstep(0.35, 0.85, path);
  gl_PointSize = uSize * (0.72 + 0.4 * shade + 0.9 * front * max(wave, focus)) * uDistance / -mv.z;
}
`

export const FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uInk;
uniform vec3 uAccent;
uniform vec3 uDapi;
uniform float uOpacity;
uniform float uDark;
in float vBase;
in float vLit;
in float vHue;
out vec4 colour;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  // A soft dot; a lit one is softer still, like a small glow.
  float soft = 1.0 - smoothstep(mix(0.45, 0.1, vLit), 1.0, r2);
  // A lit point takes the wave's colour outright (never a mix with the ink, which would darken it);
  // how lit it is shows in how strongly it is drawn.
  float lit = smoothstep(0.08, 0.3, vLit);
  vec3 rgb = mix(uInk, mix(uAccent, uDapi, vHue), lit);
  float a = clamp(max(vBase, vLit * mix(0.85, 1.0, uDark)), 0.0, 1.0) * soft * uOpacity;
  colour = vec4(rgb * a, a);
}
`
