// Renderer for the bundled CareCircle glTF. The portrait atlas bakes the
// studio lighting while the JawOpen morph deforms the actual mouth geometry.
type Accessor = { bufferView: number; byteOffset?: number; componentType: number; count: number };
type View = { byteOffset?: number; byteLength: number; byteStride?: number };
type Primitive = { indices: number; attributes: { POSITION: number }; targets?: { POSITION: number }[] };
type Bust = {
  bufferViews: View[];
  accessors: Accessor[];
  meshes: { primitives: Primitive[] }[];
  nodes: { mesh: number; scale?: number[]; translation?: number[] }[];
};
const vertexShader = `
attribute vec3 position, jaw;
uniform vec3 offset, scale;
uniform float opening, turn;
varying vec2 uvA, uvB;
varying float blend;
const vec3 center = vec3(0., 1.74, 0.);
vec3 project(vec3 p) {
  vec3 back = normalize(vec3(.34,.54,7.5));
  vec3 right = normalize(cross(vec3(0.,1.,0.),back));
  vec3 up = cross(back,right);
  vec3 d = p-center;
  return vec3(2./3.68*vec2(dot(d,right),dot(d,up)), -dot(d,back)/4.);
}
vec2 atlas(vec3 p, float pose) {
  vec2 xy = project(p).xy * vec2(.5,-.5) + .5;
  return (vec2(mod(pose,3.),floor(pose/3.)) + clamp(xy, vec2(.0012),vec2(.9988))) / vec2(3.,2.);
}
void main() {
  float frame = clamp(opening,0.,1.)*5.;
  float a = floor(frame), b = min(5.,a+1.);
  vec3 neutral=position*scale+offset;
  vec3 delta=jaw*scale;
  uvA=atlas(neutral+delta*(a/5.),a);
  uvB=atlas(neutral+delta*(b/5.),b);
  blend=fract(frame);
  vec3 p=neutral+delta*opening;
  p.xz=mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*p.xz;
  gl_Position=vec4(project(p),1.);
}`;
const fragmentShader = `
precision mediump float;
uniform sampler2D portrait;
varying vec2 uvA,uvB;
varying float blend;
void main() {
  vec4 c=mix(texture2D(portrait,uvA),texture2D(portrait,uvB),blend);
  if(c.a<.08) discard;
  gl_FragColor=vec4(c.rgb*c.a,c.a);
}`;
export async function prepareAvatar(canvas: HTMLCanvasElement, signal: AbortSignal) {
  const context = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
  });
  if (!context) return;
  const gl: WebGLRenderingContext = context;
  const assets = await Promise.all(
    ["/avatars/lia.glb", "/avatars/lia-poses.webp"].map(async url => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error("Avatar indisponível");
      return response.blob();
    }),
  );
  const [binary, bitmap] = await Promise.all([
    assets[0].arrayBuffer(),
    createImageBitmap(assets[1]),
  ]);
  if (signal.aborted || gl.isContextLost()) {
    bitmap.close();
    return;
  }

  const header = new DataView(binary);
  const jsonSize = header.getUint32(12, true);
  const model: Bust = JSON.parse(
    new TextDecoder().decode(new Uint8Array(binary, 20, jsonSize)),
  );
  const geometryStart = 28 + jsonSize;
  const buffers: WebGLBuffer[] = [];
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram()!;
  const texture = gl.createTexture();

  function dispose() {
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    for (const shader of shaders) gl.deleteShader(shader);
    gl.deleteTexture(texture);
    gl.deleteProgram(program);
  }

  function upload(index: number, target: number) {
    const accessor = model.accessors[index];
    const view = model.bufferViews[accessor.bufferView];
    const buffer = gl.createBuffer()!;
    buffers.push(buffer);
    gl.bindBuffer(target, buffer);
    const bytes = new Uint8Array(binary, geometryStart + (view.byteOffset || 0), view.byteLength);
    gl.bufferData(target, bytes, gl.STATIC_DRAW);
    return {
      buffer,
      type: accessor.componentType,
      count: accessor.count,
      offset: accessor.byteOffset || 0,
      stride: view.byteStride || 0,
    };
  }

  function attribute(location: number, accessor: ReturnType<typeof upload>) {
    gl.enableVertexAttribArray(location);
    gl.bindBuffer(gl.ARRAY_BUFFER, accessor.buffer);
    gl.vertexAttribPointer(location, 3, accessor.type, false, accessor.stride, accessor.offset);
  }

  try {
    const stages = [[gl.VERTEX_SHADER, vertexShader], [gl.FRAGMENT_SHADER, fragmentShader]] as const;
    for (const [kind, code] of stages) {
      const shader = gl.createShader(kind)!;
      shaders.push(shader);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Shader indisponível");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Renderização indisponível");
    gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) {
      gl.texParameteri(gl.TEXTURE_2D, axis, gl.CLAMP_TO_EDGE);
    }
    for (const filter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) {
      gl.texParameteri(gl.TEXTURE_2D, filter, gl.LINEAR);
    }
    gl.enable(gl.DEPTH_TEST);

    const position = gl.getAttribLocation(program, "position");
    const jaw = gl.getAttribLocation(program, "jaw");
    const scale = gl.getUniformLocation(program, "scale");
    const offset = gl.getUniformLocation(program, "offset");
    const opening = gl.getUniformLocation(program, "opening");
    const turn = gl.getUniformLocation(program, "turn");
    const parts = model.nodes.flatMap(node =>
      model.meshes[node.mesh].primitives.map(primitive => {
        const indices = upload(primitive.indices, gl.ELEMENT_ARRAY_BUFFER);
        if (indices.type === gl.UNSIGNED_INT && !gl.getExtension("OES_element_index_uint")) {
          throw new Error("Índices indisponíveis");
        }
        return {
          indices,
          position: upload(primitive.attributes.POSITION, gl.ARRAY_BUFFER),
          jaw: primitive.targets ? upload(primitive.targets[0].POSITION, gl.ARRAY_BUFFER) : null,
          scale: node.scale || [1, 1, 1],
          offset: node.translation || [0, 0, 0],
        };
      }),
    );
    return {
      dispose,
      draw(amount: number, angle: number) {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const size = Math.min(600, Math.max(1, Math.round(canvas.clientWidth * ratio)));
        if (canvas.width !== size || canvas.height !== size) {
          canvas.width = size;
          canvas.height = size;
        }
        gl.viewport(0, 0, size, size);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform1f(opening, amount);
        gl.uniform1f(turn, angle);
        for (const part of parts) {
          gl.uniform3fv(scale, part.scale);
          gl.uniform3fv(offset, part.offset);
          attribute(position, part.position);
          if (part.jaw) {
            attribute(jaw, part.jaw);
          } else {
            gl.disableVertexAttribArray(jaw);
            gl.vertexAttrib3f(jaw, 0, 0, 0);
          }
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.indices.buffer);
          gl.drawElements(gl.TRIANGLES, part.indices.count, part.indices.type, part.indices.offset);
        }
      },
    };
  } catch (error) {
    dispose();
    throw error;
  } finally {
    bitmap.close();
  }
}
