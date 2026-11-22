import type { Mouth } from "./avatar-speech";

type IndexView = { bufferView: number; componentType: number };
type Accessor = {
  bufferView?: number;
  componentType: number;
  count: number;
  sparse?: { count: number; indices: IndexView; values: { bufferView: number } };
};
type Primitive = {
  indices: number;
  attributes: { POSITION: number };
  targets: { POSITION: number }[];
};
type Bust = {
  bufferViews: { byteOffset?: number; byteLength: number }[];
  accessors: Accessor[];
  meshes: { primitives: Primitive[] }[];
};

// The asset is registered to a front orthographic portrait. Its five glTF
// morph targets also work in other 3D viewers independently of the RTC client.
const vertexShader = `
attribute vec3 position, jaw, rounded, spread, teethLip, lids;
uniform mediump vec4 mouth;
uniform mediump float blink, nod;
varying mediump vec2 uv;
void main() {
  vec3 p = position + jaw*mouth.x + rounded*mouth.y + spread*mouth.z + teethLip*mouth.w + lids*blink;
  uv = p.xy * vec2(.5,-.5) + .5;
  p.y += nod * clamp(p.z,0.,.8);
  gl_Position = vec4(p.xy, -.6*p.z, 1.);
}`;
const fragmentShader = `
precision mediump float;
uniform sampler2D portraits;
uniform mediump vec4 mouth;
uniform mediump float blink;
varying mediump vec2 uv;
vec3 frame(vec2 cell) {
  return texture2D(portraits,(cell+clamp(uv,vec2(.001),vec2(.999)))/vec2(3.,2.)).rgb;
}
void main() {
  vec3 base = frame(vec2(0.,0.));
  vec3 color = base;
  if(uv.y>.58 && uv.y<.84 && uv.x>.31 && uv.x<.70) {
    color += mouth.x*(frame(vec2(1.,0.))-base) + mouth.y*(frame(vec2(2.,0.))-base)
           + mouth.z*(frame(vec2(0.,1.))-base) + mouth.w*(frame(vec2(1.,1.))-base);
  }
  if(uv.y>.42 && uv.y<.57) color += blink*(frame(vec2(2.,1.))-base);
  gl_FragColor=vec4(color,1.);
}`;

export async function prepareAvatar(canvas: HTMLCanvasElement, signal: AbortSignal) {
  const context = canvas.getContext("webgl", {alpha:true, antialias:true});
  if (!context) return;
  const gl: WebGLRenderingContext = context;
  const [modelResponse, imageResponse] = await Promise.all(
    ["/avatars/lia-realista.glb", "/avatars/lia-expressoes.webp"].map(url => fetch(url, {signal})),
  );
  if (!modelResponse.ok || !imageResponse.ok) throw new Error("Retrato indisponível");
  const [binary, bitmap] = await Promise.all([
    modelResponse.arrayBuffer(), imageResponse.blob().then(blob => createImageBitmap(blob)),
  ]);
  if (signal.aborted || gl.isContextLost()) { bitmap.close(); return; }

  const size = new DataView(binary).getUint32(12,true);
  const model: Bust = JSON.parse(new TextDecoder().decode(new Uint8Array(binary,20,size)));
  const binStart = size + 28;
  const buffers: WebGLBuffer[] = [];
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram()!;
  const texture = gl.createTexture();
  const attributes = new Map<number, WebGLBuffer | null>();

  function dispose() {
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    for (const shader of shaders) gl.deleteShader(shader);
    gl.deleteTexture(texture);
    gl.deleteProgram(program);
  }
  function makeBuffer(target: number, data: ArrayBufferView<ArrayBuffer>) {
    const buffer = gl.createBuffer()!;
    buffers.push(buffer);
    gl.bindBuffer(target,buffer);
    gl.bufferData(target,data,gl.STATIC_DRAW);
    return buffer;
  }
  function offset(view: number) { return binStart + (model.bufferViews[view].byteOffset || 0); }
  function vector(index: number) {
    if (attributes.has(index)) return attributes.get(index)!;
    const a = model.accessors[index];
    let values: Float32Array<ArrayBuffer> | undefined;
    if (a.bufferView !== undefined) {
      values = new Float32Array(binary,offset(a.bufferView),a.count*3);
    } else if (a.sparse) {
      const sparse = a.sparse;
      const ids = new Uint16Array(binary,offset(sparse.indices.bufferView),sparse.count);
      const deltas = new Float32Array(binary,offset(sparse.values.bufferView),sparse.count*3);
      values = new Float32Array(a.count*3);
      for (let i=0; i<ids.length; i++) {
        for (let axis=0; axis<3; axis++) values[ids[i]*3+axis] = deltas[i*3+axis];
      }
    }
    const buffer = values ? makeBuffer(gl.ARRAY_BUFFER,values) : null;
    attributes.set(index,buffer);
    return buffer;
  }
  try {
    for (const [kind, source] of [[gl.VERTEX_SHADER,vertexShader],[gl.FRAGMENT_SHADER,fragmentShader]] as const) {
      const shader=gl.createShader(kind)!;
      shaders.push(shader);
      gl.shaderSource(shader,source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error("Shader indisponível");
      gl.attachShader(program,shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error("Renderização indisponível");
    gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,bitmap);
    for (const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,axis,gl.CLAMP_TO_EDGE);
    for (const filter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,filter,gl.LINEAR);
    gl.enable(gl.DEPTH_TEST);
    const locs = ["position","jaw","rounded","spread","teethLip","lids"].map(key => gl.getAttribLocation(program,key));
    const lip = gl.getUniformLocation(program,"mouth");
    const lid = gl.getUniformLocation(program,"blink");
    const head = gl.getUniformLocation(program,"nod");
    const parts = model.meshes[0].primitives.map(part => {
      const a = model.accessors[part.indices];
      const ids = new Uint16Array(binary,offset(a.bufferView!),a.count);
      return {
        vectors: [vector(part.attributes.POSITION), ...part.targets.map(t=>vector(t.POSITION))],
        indices: makeBuffer(gl.ELEMENT_ARRAY_BUFFER,ids),
        count: a.count,
      };
    });
    return {
      dispose,
      draw(mouth: Mouth, blink: number, nod: number) {
        const pixels = Math.min(720,Math.max(1,Math.round(canvas.clientWidth*Math.min(2,window.devicePixelRatio || 1))));
        if (canvas.width!==pixels || canvas.height!==pixels) { canvas.width=pixels; canvas.height=pixels; }
        gl.viewport(0,0,pixels,pixels);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform4f(lip,mouth.open,mouth.round,mouth.wide,mouth.teeth);
        gl.uniform1f(lid,blink);
        gl.uniform1f(head,nod);
        for (const part of parts) {
          part.vectors.forEach((buffer,i)=>{
            if (buffer) {
              gl.enableVertexAttribArray(locs[i]);
              gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
              gl.vertexAttribPointer(locs[i],3,gl.FLOAT,false,0,0);
            } else {
              gl.disableVertexAttribArray(locs[i]);
              gl.vertexAttrib3f(locs[i],0,0,0);
            }
          });
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,part.indices);
          gl.drawElements(gl.TRIANGLES,part.count,gl.UNSIGNED_SHORT,0);
        }
      },
    };
  } catch (error) { dispose(); throw error; }
  finally { bitmap.close(); }
}
