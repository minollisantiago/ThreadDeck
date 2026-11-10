// Decorative only: service progress and startup controls never depend on WebGL.
(() => {
  const canvas = document.getElementById('startup-loom')
  if (!canvas) return
  let gl
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' }) }
  catch { canvas.remove(); return }
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

  const shaders = []
  let program, buffer, animation = null, disposed = false
  const events = new AbortController()
  function stop() {
    if (animation !== null) cancelAnimationFrame(animation)
    animation = null
  }
  function dispose() {
    if (disposed) return
    disposed = true
    stop()
    events.abort()
    if (buffer) gl.deleteBuffer(buffer)
    if (program) gl.deleteProgram(program)
    for (const shader of shaders) gl.deleteShader(shader)
    canvas.remove()
  }
  function compile(type, source) {
    const shader = gl.createShader(type)
    if (!shader) throw new Error('Shader unavailable')
    shaders.push(shader)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed')
    return shader
  }

  try {
    program = gl.createProgram()
    if (!program) throw new Error('Shader program unavailable')
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader linking failed')
    gl.useProgram(program)
    buffer = gl.createBuffer()
    if (!buffer) throw new Error('Shader buffer unavailable')
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const uniforms = Object.fromEntries(['resolution', 'mouse', 'ground', 'accent', 'muted', 'time', 'hold', 'light'].map(name => [name, gl.getUniformLocation(program, name)]))
    const style = getComputedStyle(document.documentElement)
    for (const name of ['ground', 'accent', 'muted']) {
      const hex = style.getPropertyValue(`--${name}`).trim()
      const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      gl.uniform3fv(uniforms[name], rgb)
    }
    gl.uniform1f(uniforms.light, document.documentElement.dataset.appearance === 'light' ? 1 : 0)

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    const pointer = [.5, .5], target = [.5, .5]
    let pressed = 0, strength = 0, elapsed = 18, last = null, painted = null
    function draw() {
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
      gl.uniform2f(uniforms.mouse, ...pointer)
      gl.uniform1f(uniforms.time, elapsed)
      gl.uniform1f(uniforms.hold, strength)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    function resize() {
      const bounds = canvas.getBoundingClientRect()
      const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height)
      const scale = Math.min(devicePixelRatio || 1, 1.5, 1600 / width, 1200 / height)
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      gl.viewport(0, 0, canvas.width, canvas.height)
      if (!document.hidden) draw()
    }
    function frame(now) {
      animation = null
      if (disposed || document.hidden || reducedMotion.matches) return
      const dt = last === null ? 0 : Math.min((now - last) / 1000, .1)
      last = now
      elapsed += dt
      const ease = 1 - Math.exp(-dt * 7)
      pointer[0] += (target[0] - pointer[0]) * ease
      pointer[1] += (target[1] - pointer[1]) * ease
      strength += (pressed - strength) * ease
      if (painted === null || now - painted >= 1000 / 30) { painted = now; draw() }
      animation = requestAnimationFrame(frame)
    }
    function resume() {
      stop()
      last = null
      painted = null
      pressed = 0
      if (document.hidden || disposed) return
      if (reducedMotion.matches) {
        pointer[0] = target[0] = .5
        pointer[1] = target[1] = .5
        strength = 0
        draw()
      } else animation = requestAnimationFrame(frame)
    }
    const options = { signal: events.signal }
    window.addEventListener('resize', resize, options)
    window.addEventListener('pointermove', event => {
      if (reducedMotion.matches) return
      const bounds = canvas.getBoundingClientRect()
      target[0] = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)))
      target[1] = 1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)))
    }, options)
    window.addEventListener('pointerdown', event => {
      if (!reducedMotion.matches && !event.target.closest('button,header')) pressed = 1
    }, options)
    for (const event of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(event, () => { pressed = 0 }, options)
    document.addEventListener('visibilitychange', resume, options)
    reducedMotion.addEventListener('change', resume, options)
    canvas.addEventListener('webglcontextlost', dispose, options)
    window.addEventListener('pagehide', dispose, options)
    resize()
    resume()
  } catch {
    // Keep the unmodified startup UI on unsupported GPUs or initialization failure.
    dispose()
  }
})()
