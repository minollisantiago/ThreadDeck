// THROWAWAY: study 09 on the existing startup screen. Only a background shader;
// original markup, copy, table, colors, and dimensions are left intact.
(() => {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.id = 'startup-loom'
  canvas.style.cssText = 'position:fixed;inset:38px 0 0;width:100%;height:calc(100% - 38px);pointer-events:none;z-index:-1'
  document.body.style.isolation = 'isolate'
  document.body.prepend(canvas)
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' })
  if (!gl) { canvas.remove(); return }

  const vertex = `attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}`
  const fragment = `precision highp float;
    uniform vec2 resolution,mouse;
    uniform vec3 ground,accent,muted;
    uniform float time,hold,light;
    mat2 rotate(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
    void main(){
      vec2 uv=gl_FragCoord.xy/resolution;
      float aspect=resolution.x/resolution.y;
      vec2 p=(uv-.5)*vec2(aspect,1.);
      vec2 hand=(mouse-.5)*vec2(aspect,1.);
      vec2 delta=p-hand;
      float influence=exp(-length(delta)*3.);
      vec2 q=p-vec2(.28,0.);
      q+=delta*influence*(.2+hold*.55);
      q=rotate(-.28)*q;
      float warp=.08*sin(q.y*4.+time*.3)+.035*sin(q.y*9.-time*.2);
      float weft=.06*sin(q.x*4.+time*.2);
      float x=abs(sin((q.x+warp)*115.));
      float y=abs(sin((q.y+weft)*115.));
      float threads=pow(1.-x,6.);
      float cross=pow(1.-y,8.);
      float shimmer=.5+.5*sin(q.y*8.-q.x*6.+time*.45);
      // Keep the exact application ground; weave only with existing theme tokens.
      float center=smoothstep(.08,.42,abs(p.x));
      float envelope=smoothstep(0.,.13,uv.y)*(1.-smoothstep(.85,1.,uv.y));
      float weight=(.35+.65*center)*envelope;
      float threadLight=threads*(.16+shimmer*.3)*weight;
      float crossLight=cross*.11*weight;
      float selected=exp(-abs(q.x+warp-.12)*700.)*(.32+hold*.5)*weight;
      vec3 color=mix(ground,accent,clamp(threadLight+selected,0.,.85));
      color=mix(color,muted,crossLight*(1.-light*.25));
      gl_FragColor=vec4(color,1.);
    }`
  function compile(type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
    return shader
  }
  let program
  try {
    program = gl.createProgram()
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  } catch (error) { console.error(error); canvas.remove(); return }
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const uniforms = Object.fromEntries(['resolution', 'mouse', 'ground', 'accent', 'muted', 'time', 'hold', 'light'].map(name => [name, gl.getUniformLocation(program, name)]))
  const style = getComputedStyle(document.documentElement)
  function rgb(token) { return style.getPropertyValue(token).trim().slice(1).match(/../g).map(value => parseInt(value, 16) / 255) }
  for (const name of ['ground', 'accent', 'muted']) gl.uniform3fv(uniforms[name], rgb(`--${name}`))
  gl.uniform1f(uniforms.light, document.documentElement.dataset.appearance === 'light' ? 1 : 0)
  function resize() {
    const scale = Math.min(devicePixelRatio, 1.5, 1600 / innerWidth)
    canvas.width = Math.round(innerWidth * scale)
    canvas.height = Math.round((innerHeight - 38) * scale)
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  resize()
  addEventListener('resize', resize)
  const pointer = [.5, .5], target = [.5, .5]
  let pressed = 0, strength = 0, elapsed = 18, last = 0, painted = 0
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  addEventListener('pointermove', event => {
    target[0] = event.clientX / innerWidth
    target[1] = 1 - (event.clientY - 38) / (innerHeight - 38)
  })
  addEventListener('pointerdown', event => { if (!event.target.closest('button,header')) pressed = 1 })
  for (const event of ['pointerup', 'pointercancel', 'blur']) addEventListener(event, () => { pressed = 0 })
  function frame(now) {
    requestAnimationFrame(frame)
    const dt = Math.min((now - last) / 1000, .1)
    last = now
    if (document.hidden) return
    if (!reducedMotion.matches) elapsed += dt
    const ease = 1 - Math.exp(-dt * 7)
    pointer[0] += (target[0] - pointer[0]) * ease
    pointer[1] += (target[1] - pointer[1]) * ease
    strength += (pressed - strength) * ease
    if (now - painted < 32) return
    painted = now
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
    gl.uniform2f(uniforms.mouse, ...pointer)
    gl.uniform1f(uniforms.time, elapsed)
    gl.uniform1f(uniforms.hold, strength)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
  requestAnimationFrame(frame)
})()
