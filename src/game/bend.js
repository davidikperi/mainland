// Curved road. The race runs on a straight track in physics (z along the road, x across it), and the renderer bends
// the world around the road's centreline as it draws: every vertex at distance d ahead is moved onto the curve and
// turned with it, so the road, buildings, traffic, gantries and shadows all sweep through the bends together.
// The bend is patched into three.js's shared vertex code (meshes, shadows and sprites), so every material gets the
// same change and no extra shader programs are compiled.
import * as T from 'three'

// The bend is sampled every STEP metres from FROM to FROM + STEP * (N - 1) ahead of the player (behind when negative).
export const BEND_STEP = 30, BEND_FROM = -60, BEND_N = 20
const offset = new Float32Array(BEND_N), heading = new Float32Array(BEND_N)
const uniforms = { bendD: { value: offset }, bendA: { value: heading } }

const GLSL = `
uniform float bendD[ ${BEND_N} ];
uniform float bendA[ ${BEND_N} ];
// A point at distance d ahead and x across the road, placed on the curve: centreline offset D(d), turned by its heading A(d).
vec4 bendWorld( vec4 w ) {
  float d = - w.z, f = clamp( ( d - (${BEND_FROM.toFixed(1)}) ) / ${BEND_STEP.toFixed(1)}, 0.0, ${(BEND_N - 1.001).toFixed(3)} );
  int i = int( floor( f ) );
  float t = f - float( i ), D = mix( bendD[ i ], bendD[ i + 1 ], t ), A = mix( bendA[ i ], bendA[ i + 1 ], t );
  return vec4( D + w.x * cos( A ), w.y, - d + w.x * sin( A ), w.w );
}
`
let installed = false
export function installBend() {
  if (installed) return; installed = true
  const C = T.ShaderChunk
  C.common = C.common + GLSL
  C.project_vertex = C.project_vertex.replace('mvPosition = modelViewMatrix * mvPosition;', 'mvPosition = viewMatrix * bendWorld( modelMatrix * mvPosition );')
  C.worldpos_vertex = C.worldpos_vertex.replace('worldPosition = modelMatrix * worldPosition;', 'worldPosition = bendWorld( modelMatrix * worldPosition );')
  const sprite = T.ShaderLib.sprite
  sprite.vertexShader = sprite.vertexShader.replace('vec4 mvPosition = modelViewMatrix[ 3 ];', 'vec4 mvPosition = viewMatrix * bendWorld( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) );')
  // Every material shares the two bend tables (the same function for all, so the shader cache keys don't change).
  T.Material.prototype.onBeforeCompile = function (shader) { shader.uniforms.bendD = uniforms.bendD; shader.uniforms.bendA = uniforms.bendA }
}

// Recompute the bend for a player at road position s, from the road's curvature (1/radius, + bends right).
export function updateBend(curvature, s) {
  const step = 5
  const integrate = target => {   // heading and offset at distance target from the player
    let a = 0, dist = 0; const dir = Math.sign(target), n = Math.round(Math.abs(target) / step)
    for (let k = 0; k < n; k++) { const mid = s + dir * (k + .5) * step, da = curvature(mid) * step * dir; dist += dir * step * Math.sin(a + da / 2); a += da }
    return [dist, a]
  }
  for (let i = 0; i < BEND_N; i++) { const [D, A] = integrate(BEND_FROM + i * BEND_STEP); offset[i] = D; heading[i] = A }
}
export function clearBend() { offset.fill(0); heading.fill(0) }
