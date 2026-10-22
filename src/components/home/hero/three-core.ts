// The parts of three.js the hero's scene uses besides its renderer, from three.js's own source
// files. HeroLoader loads this first and the scene (with the renderer) after a pause, so the
// browser runs three.js's code in two shorter tasks instead of one long one (PLAN §10.5: no task
// over 50 ms during setup).
export { BufferAttribute } from 'three/src/core/BufferAttribute.js'
export { BufferGeometry } from 'three/src/core/BufferGeometry.js'
export { Color } from 'three/src/math/Color.js'
export { GLSL3 } from 'three/src/constants.js'
export { Group } from 'three/src/objects/Group.js'
export { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js'
export { Points } from 'three/src/objects/Points.js'
export { RawShaderMaterial } from 'three/src/materials/RawShaderMaterial.js'
export { Scene } from 'three/src/scenes/Scene.js'
export { Vector3 } from 'three/src/math/Vector3.js'
