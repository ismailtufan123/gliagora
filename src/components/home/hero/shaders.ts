// The hero's two shaders (PLAN §10.3, §10.5): each brain point is a soft dot, lit from the upper
// left and darker in the depth of a fold; points turned away from the viewer fade out, so the far
// side never shows through. One calcium wave runs from its cell across the cortex (F2), magenta at
// its front and DAPI blue behind it, and another runs to a window's label (F3). Colours come from
// the design tokens at run time (scene.ts); nothing here is a colour of its own.

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
uniform float uWave;
uniform float uWaveWidth;
uniform vec3 uFocus;
uniform float uFocusRun;
uniform float uFocusStrength;
in vec3 position;
in vec3 normal;
in float shade;
out float vBase;
out float vWave;
out float vTrail;

float hash(float n) { return fract(sin(n) * 43758.5453); }

// A wave's band around its front at distance d: sharp ahead, softer behind.
float band(float d, float front, float width) {
  float x = (d - front) / (d > front ? width * 0.55 : width * 1.3);
  return exp(-x * x);
}

void main() {
  float id = float(gl_VertexID);
  float r1 = hash(id * 0.1031 + 0.7);
  float r2 = hash(id * 0.1173 + 3.1);
  float r3 = hash(id * 0.1279 + 5.3);

  // Arrival (F2): each point starts a little outside its place and arrives at a time of its own,
  // so the brain condenses from a haze of its own shape.
  float g = clamp((uGather - r1 * 0.35) / 0.65, 0.0, 1.0);
  g = 1.0 - (1.0 - g) * (1.0 - g) * (1.0 - g);
  vec3 drift = normalize(vec3(r2 - 0.5, r3 - 0.5, r1 - 0.5) + 0.0001);
  vec3 p = position + (normal * (0.02 + 0.06 * r2) + drift * 0.03) * (1.0 - g);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  vec3 n = normalize(normalMatrix * normal);
  float facing = dot(n, normalize(-mv.xyz));
  float front = smoothstep(-0.1, 0.3, facing);
  float light = 0.34 + 0.66 * max(dot(n, normalize(vec3(-0.45, 0.6, 0.66))), 0.0);
  vBase = front * light * mix(0.2, 1.0, shade * shade) * mix(0.2, 1.0, g);

  // The calcium wave (F2): its front, uneven like a real one, and the trail it leaves behind.
  float d = distance(position, uOrigin) + (r2 - 0.5) * uWaveWidth * 0.8 + (1.0 - shade) * uWaveWidth * 0.5;
  float wave = uWave < 0.0 ? 0.0 : band(d, uWave, uWaveWidth);
  float trail = uWave > d ? exp((d - uWave) / (uWaveWidth * 4.0)) : 0.0;

  // The wave to a label (F3): a ring from the brain's centre, lit on the label's side only, and a
  // glow where it arrives.
  vec3 toFocus = uFocus - uCentre;
  float reach = max(length(toFocus), 0.0001);
  vec3 rel = position - uCentre;
  float side = smoothstep(0.6, 0.95, dot(normalize(rel + 0.0001), toFocus / reach));
  float ring = band(length(rel) + (r2 - 0.5) * uWaveWidth * 0.6, uFocusRun * reach, uWaveWidth);
  ring *= side * (1.0 - smoothstep(0.85, 1.0, uFocusRun));
  float glow = smoothstep(0.7, 1.0, uFocusRun) * exp(-pow(distance(position, uFocus) / (uWaveWidth * 1.9), 2.0));
  float focus = uFocusStrength * max(ring, glow);

  vWave = front * max(wave, focus);
  vTrail = front * trail * (1.0 - wave);
  gl_PointSize = uSize * (0.72 + 0.4 * shade + 1.1 * vWave + 0.35 * vTrail) * uDistance / -mv.z;
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
in float vWave;
in float vTrail;
out vec4 colour;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  // A soft dot; a lit one has a softer, wider edge, like a glow.
  float soft = 1.0 - smoothstep(mix(0.45, 0.05, vWave), 1.0, r2);
  vec3 rgb = mix(uInk, uDapi, clamp(vTrail * 0.9, 0.0, 1.0));
  rgb = mix(rgb, uAccent, clamp(vWave * 1.2, 0.0, 1.0));
  // On paper the wave is lighter (less of the colour), on the night background brighter.
  float lit = max(vWave * mix(0.6, 0.92, uDark), vTrail * mix(0.72, 0.6, uDark));
  float a = clamp(max(vBase, lit), 0.0, 1.0) * soft * uOpacity;
  colour = vec4(rgb * a, a);
}
`
