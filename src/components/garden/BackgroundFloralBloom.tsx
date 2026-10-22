import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Sparkles, Trash2, ChevronDown, ChevronUp, Flower } from 'lucide-react';

// Procedural Flower Growth Shader
const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  #define PI 3.14159265359

  uniform float u_ratio;
  uniform vec2 u_cursor;
  uniform float u_stop_time;
  uniform float u_clean;
  uniform vec2 u_stop_randomizer;
  uniform vec3 u_bg_color;

  uniform sampler2D u_texture;
  varying vec2 vUv;

  // 2D simplex noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float get_flower_shape(vec2 _p, float _pet_n, float _angle, float _outline) {
    _angle *= 3.;
    _p = vec2(_p.x * cos(_angle) - _p.y * sin(_angle),
              _p.x * sin(_angle) + _p.y * cos(_angle));
    float a = atan(_p.y, _p.x);
    float flower_sectoral_shape = pow(abs(sin(a * _pet_n)), .4) + .25;
    vec2 flower_size_range = vec2(.03, .085);
    float size = flower_size_range[0] + u_stop_randomizer[0] * flower_size_range[1];
    float flower_radial_shape = pow(length(_p) / size, 2.);
    flower_radial_shape -= .1 * sin(8. * a);
    flower_radial_shape = max(.1, flower_radial_shape);
    flower_radial_shape += smoothstep(0., 0.03, -_p.y + .2 * abs(_p.x));
    float grow_time = step(.22, u_stop_time) * pow(u_stop_time, .3);
    float flower_shape = 1. - smoothstep(0., flower_sectoral_shape, _outline * flower_radial_shape / max(grow_time, 1e-4));
    flower_shape *= step(1e-4, grow_time) * (1. - step(1., grow_time));
    return flower_shape;
  }

  float get_stem_shape(vec2 _p, vec2 _uv, float _w, float _angle) {
    _w = max(.004, _w);
    float x_offset = _p.y * sin(_angle);
    x_offset *= pow(3. * _uv.y, 2.);
    _p.x -= x_offset;

    float noise_power = .4;
    float cursor_horizontal_noise = noise_power * snoise(2. * _uv * u_stop_randomizer[0]);
    cursor_horizontal_noise *= pow(dot(_p.y, _p.y), .6);
    cursor_horizontal_noise *= pow(dot(_uv.y, _uv.y), .3);
    _p.x += cursor_horizontal_noise;

    float left = smoothstep(-_w, 0., _p.x);
    float right = 1. - smoothstep(0., _w, _p.x);
    float stem_shape = left * right;

    float grow_time = 1. - smoothstep(0., .2, u_stop_time);
    float stem_top_mask = smoothstep(0., pow(grow_time, .5), .03 - _p.y);
    stem_shape *= stem_top_mask;
    stem_shape *= (1. - step(.18, u_stop_time));
    return stem_shape;
  }

  void main() {
    vec4 base = texture2D(u_texture, vUv);

    vec2 uv = vUv;
    uv.x *= u_ratio;
    vec2 cursor = vUv - u_cursor.xy;
    cursor.x *= u_ratio;

    // Signature Florify Pink Palette: Coral Blossom (#FF5C89) & Deep Rose (#C72C5E)
    vec3 stem_color = vec3(0.08 + u_stop_randomizer[0] * 0.12, 0.62 + u_stop_randomizer[1] * 0.14, 0.36);
    vec3 flower_color = mix(
      vec3(1.0, 0.361, 0.537),  // #FF5C89
      vec3(0.78, 0.173, 0.369), // #C72C5E
      u_stop_randomizer[1]
    );

    float angle = .45 * (u_stop_randomizer[0] - .5);

    float stem_shape = get_stem_shape(cursor, uv, .003, angle);
    stem_shape += get_stem_shape(cursor + vec2(0., .2 + .4 * u_stop_randomizer[0]), uv, .003, angle);
    float stem_mask = 1. - get_stem_shape(cursor, uv, .004, angle);
    stem_mask -= get_stem_shape(cursor + vec2(0., .2 + .4 * u_stop_randomizer[0]), uv, .004, angle);

    float petals_back_number = 1. + floor(u_stop_randomizer[0] * 2.);
    float angle_offset = -(2. * step(0., angle) - 1.) * .1 * u_stop_time;
    float flower_back_shape = get_flower_shape(cursor, petals_back_number, angle + angle_offset, 1.5);
    float flower_back_mask = 1. - get_flower_shape(cursor, petals_back_number, angle + angle_offset, 1.6);

    float petals_front_number = 2. + floor(u_stop_randomizer[1] * 2.);
    float flower_front_shape = get_flower_shape(cursor, petals_front_number, angle, 1.);
    float flower_front_mask = 1. - get_flower_shape(cursor, petals_front_number, angle, .95);

    vec3 color = base.xyz;
    color *= stem_mask;
    color *= flower_back_mask;
    color *= flower_front_mask;

    color += (stem_shape * stem_color);
    color += (flower_back_shape * (flower_color + vec3(0., .6 * u_stop_time, 0.)));
    color += (flower_front_shape * flower_color);

    color.r *= 1. - (.4 * flower_back_shape * flower_front_shape);
    color.b *= 1. - (flower_back_shape * flower_front_shape);

    float new_coverage = clamp(stem_shape + flower_back_shape + flower_front_shape, 0.0, 1.0);
    float combined_alpha = clamp(base.w * stem_mask * flower_back_mask * flower_front_mask + new_coverage, 0.0, 1.0);

    color *= u_clean;
    combined_alpha *= u_clean;

    // Blend seamlessly over Florify pink background #FFF7F9
    vec3 final_rgb = mix(u_bg_color, color, combined_alpha);
    gl_FragColor = vec4(final_rgb, 1.0);
  }
`;

// Petal Particle Interface for tactile click animation
interface PetalParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  vRot: number;
  alpha: number;
  decay: number;
  color: string;
}

export const BackgroundFloralBloom: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);

  const [bloomCount, setBloomCount] = useState<number>(0);
  const [isWidgetCollapsed, setIsWidgetCollapsed] = useState<boolean>(false);
  const [hintVisible, setHintVisible] = useState<boolean>(true);

  // Shader & Render references
  const pointerRef = useRef<{
    x: number;
    y: number;
    clicked: boolean;
    vanishCanvas: boolean;
  }>({
    x: 0.5,
    y: 0.5,
    clicked: false,
    vanishCanvas: false,
  });

  const particlesRef = useRef<PetalParticle[]>([]);
  const shaderMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  // Spawn tactile blossom petals on click
  const spawnPetals = useCallback((clientX: number, clientY: number) => {
    const colors = [
      '#FF5C89', // Coral Blossom
      '#FFA4BD', // Soft Sakura Pink
      '#C72C5E', // Deep Peony Rose
      '#FFE0E9', // Pale Petal Pink
      '#FF7E9F', // Bright Rose
    ];

    const count = 12 + Math.floor(Math.random() * 6);
    const newPetals: PetalParticle[] = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 1.8 + Math.random() * 3.5;
      newPetals.push({
        x: clientX,
        y: clientY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2, // slight upward burst
        size: 7 + Math.random() * 9,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.12,
        alpha: 1.0,
        decay: 0.012 + Math.random() * 0.012,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    particlesRef.current.push(...newPetals);
  }, []);

  // Trigger bloom function exposed to global click listener
  const triggerBloom = useCallback((clientX: number, clientY: number) => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    pointerRef.current.x = Math.max(0.02, Math.min(0.98, clientX / width));
    pointerRef.current.y = Math.max(0.02, Math.min(0.98, clientY / height));
    pointerRef.current.clicked = true;

    spawnPetals(clientX, clientY);
    setBloomCount((prev) => prev + 1);

    if (hintVisible) {
      setTimeout(() => setHintVisible(false), 2000);
    }
  }, [spawnPetals, hintVisible]);

  // Clean / Reset blooms
  const handleClear = useCallback(() => {
    pointerRef.current.vanishCanvas = true;
    particlesRef.current = [];
    setTimeout(() => {
      pointerRef.current.vanishCanvas = false;
      setBloomCount(0);
    }, 60);
  }, []);

  // WebGL Lifecycle Setup
  useEffect(() => {
    const canvas = webglCanvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
    } catch (e) {
      console.warn('WebGL init failed:', e);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const sceneShader = new THREE.Scene();
    const sceneBasic = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    const clock = new THREE.Clock();

    const renderTargets = [
      new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      }),
      new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      }),
    ];

    // Maintain Florify soft blush background: #FFF7F9 (1.0, 0.969, 0.976)
    const bgColor = new THREE.Vector3(1.0, 0.969, 0.976);

    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_stop_time: { value: 2.0 }, // start idle
        u_stop_randomizer: { value: new THREE.Vector2(0.5, 0.5) },
        u_cursor: { value: new THREE.Vector2(0.5, 0.5) },
        u_ratio: { value: window.innerWidth / window.innerHeight },
        u_texture: { value: null },
        u_clean: { value: 1.0 },
        u_bg_color: { value: bgColor },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });
    shaderMaterialRef.current = shaderMaterial;

    const basicMaterial = new THREE.MeshBasicMaterial();
    const planeGeometry = new THREE.PlaneGeometry(2, 2);
    const planeBasic = new THREE.Mesh(planeGeometry, basicMaterial);
    const planeShader = new THREE.Mesh(planeGeometry, shaderMaterial);

    sceneBasic.add(planeBasic);
    sceneShader.add(planeShader);

    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      shaderMaterial.uniforms.u_ratio.value = width / Math.max(1, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height, false);

      const pr = renderer.getPixelRatio();
      const rw = Math.round(width * pr);
      const rh = Math.round(height * pr);
      renderTargets[0].setSize(rw, rh);
      renderTargets[1].setSize(rw, rh);

      const pCanvas = particleCanvasRef.current;
      if (pCanvas) {
        pCanvas.width = width;
        pCanvas.height = height;
      }
    };

    handleResize();

    // Initial subtle ambient blossom to greet the user
    const initialTimer = setTimeout(() => {
      pointerRef.current.x = 0.85;
      pointerRef.current.y = 0.28;
      pointerRef.current.clicked = true;
      setBloomCount(1);
    }, 600);

    let animationFrameId: number;
    let isMounted = true;

    const render = () => {
      if (!isMounted) return;

      shaderMaterial.uniforms.u_clean.value = pointerRef.current.vanishCanvas ? 0.0 : 1.0;
      shaderMaterial.uniforms.u_texture.value = renderTargets[0].texture;

      if (pointerRef.current.clicked) {
        shaderMaterial.uniforms.u_cursor.value = new THREE.Vector2(
          pointerRef.current.x,
          1.0 - pointerRef.current.y
        );
        shaderMaterial.uniforms.u_stop_randomizer.value = new THREE.Vector2(
          Math.random(),
          Math.random()
        );
        shaderMaterial.uniforms.u_stop_time.value = 0.0;
        pointerRef.current.clicked = false;
      }

      shaderMaterial.uniforms.u_stop_time.value += clock.getDelta();

      // Ping-pong render pass
      renderer.setRenderTarget(renderTargets[1]);
      renderer.render(sceneShader, camera);

      basicMaterial.map = renderTargets[1].texture;
      renderer.setRenderTarget(null);
      renderer.render(sceneBasic, camera);

      // Swap buffer targets
      const tmp = renderTargets[0];
      renderTargets[0] = renderTargets[1];
      renderTargets[1] = tmp;

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    window.addEventListener('resize', handleResize);

    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderTargets[0].dispose();
      renderTargets[1].dispose();
      planeGeometry.dispose();
      basicMaterial.dispose();
      shaderMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  // 2D Petal particle physics animation loop
  useEffect(() => {
    const pCanvas = particleCanvasRef.current;
    if (!pCanvas) return;
    const ctx = pCanvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let isMounted = true;

    const drawPetal = (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      size: number,
      rot: number,
      color: string,
      alpha: number
    ) => {
      context.save();
      context.translate(x, y);
      context.rotate(rot);
      context.globalAlpha = Math.max(0, alpha);
      context.fillStyle = color;

      // Draw organic petal teardrop shape
      context.beginPath();
      context.moveTo(0, -size);
      context.bezierCurveTo(size * 0.6, -size * 0.7, size * 0.7, size * 0.3, 0, size);
      context.bezierCurveTo(-size * 0.7, size * 0.3, -size * 0.6, -size * 0.7, 0, -size);
      context.fill();

      // Center fold highlight
      context.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, -size * 0.7);
      context.lineTo(0, size * 0.6);
      context.stroke();

      context.restore();
    };

    const animateParticles = () => {
      if (!isMounted) return;

      ctx.clearRect(0, 0, pCanvas.width, pCanvas.height);

      if (particlesRef.current.length > 0) {
        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
          const p = particlesRef.current[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.08; // gentle gravity
          p.vx *= 0.98; // air drag
          p.rotation += p.vRot;
          p.alpha -= p.decay;

          drawPetal(ctx, p.x, p.y, p.size, p.rotation, p.color, p.alpha);

          if (p.alpha <= 0 || p.y > pCanvas.height + 20) {
            particlesRef.current.splice(i, 1);
          }
        }
      }

      animId = requestAnimationFrame(animateParticles);
    };

    animateParticles();

    return () => {
      isMounted = false;
      cancelAnimationFrame(animId);
    };
  }, []);

  // Global background click listener that ignores interactive buttons/inputs
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Check if click target is interactive
      const isInteractive = target.closest(
        'button, a, input, select, textarea, label, [role="button"], [role="menuitem"], [role="dialog"], [data-no-bloom="true"], .interactive-control'
      );

      if (isInteractive) {
        return;
      }

      // Valid background click: sprout bloom!
      triggerBloom(e.clientX, e.clientY);
    };

    window.addEventListener('click', handleDocumentClick, { passive: true });

    return () => {
      window.removeEventListener('click', handleDocumentClick);
    };
  }, [triggerBloom]);

  return (
    <>
      {/* Background Canvas Layer (Fixed fullscreen behind application content) */}
      <div
        ref={containerRef}
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#FFF7F9]"
        aria-hidden="true"
      >
        {/* Procedural WebGL Stems & Blooms Layer */}
        <canvas
          ref={webglCanvasRef}
          className="absolute inset-0 w-full h-full block"
        />

        {/* 2D Floating Petals Overlay */}
        <canvas
          ref={particleCanvasRef}
          className="absolute inset-0 w-full h-full block pointer-events-none"
        />
      </div>

      {/* Floating Interactive Background Control Badge (Bottom-Right) */}
      <aside
        data-no-bloom="true"
        aria-label="Background Bloom Controls"
        className="fixed bottom-4 right-4 z-40 select-none flex flex-col items-end gap-2"
      >
        {/* First-time friendly hint */}
        {hintVisible && (
          <div
            data-no-bloom="true"
            className="bg-white/95 backdrop-blur-md border border-[#FDC3D1] shadow-lg rounded-2xl px-3.5 py-2 text-xs text-[#2E1826] flex items-center gap-2 animate-bounce cursor-default"
          >
            <span className="text-base">🌸</span>
            <span>
              <strong>Tip:</strong> Click anywhere on the pink background to bloom flowers!
            </span>
            <button
              onClick={() => setHintVisible(false)}
              className="ml-1 text-[#826674] hover:text-[#C72C5E] font-bold text-xs"
              title="Dismiss tip"
            >
              ✕
            </button>
          </div>
        )}

        {/* Blossom Counter & Clear Toolbar */}
        <div
          data-no-bloom="true"
          className="bg-white/90 backdrop-blur-md border border-[#FDC3D1] shadow-md rounded-2xl p-1.5 flex items-center gap-1.5 transition-all text-xs"
        >
          <div className="flex items-center gap-1.5 px-2 py-1 text-[#C72C5E] font-semibold">
            <Flower className="h-4 w-4 text-[#FF5C89] animate-spin-slow" />
            <span className="whitespace-nowrap">
              {bloomCount} {bloomCount === 1 ? 'Blossom' : 'Blossoms'}
            </span>
          </div>

          {!isWidgetCollapsed && (
            <>
              <button
                type="button"
                onClick={handleClear}
                disabled={bloomCount === 0}
                className="px-2 py-1 rounded-xl bg-[#FFF7F9] hover:bg-[#FFE0E9] text-[#C72C5E] disabled:opacity-40 disabled:hover:bg-[#FFF7F9] transition-colors flex items-center gap-1 font-medium cursor-pointer"
                title="Clear flowers from background"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  // Sprout 3 random blooms across background
                  for (let i = 0; i < 3; i++) {
                    setTimeout(() => {
                      const rx = 0.15 + Math.random() * 0.7;
                      const ry = 0.2 + Math.random() * 0.6;
                      triggerBloom(rx * window.innerWidth, ry * window.innerHeight);
                    }, i * 350);
                  }
                }}
                className="px-2 py-1 rounded-xl bg-[#FF5C89] hover:bg-[#C72C5E] text-white transition-colors flex items-center gap-1 font-medium cursor-pointer shadow-2xs"
                title="Scatter random seeds"
              >
                <Sparkles className="h-3 w-3" />
                <span>Scatter</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsWidgetCollapsed(!isWidgetCollapsed)}
            className="p-1 rounded-lg hover:bg-[#FFF7F9] text-[#826674] transition-colors cursor-pointer"
            title={isWidgetCollapsed ? 'Expand controls' : 'Collapse controls'}
          >
            {isWidgetCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </aside>
    </>
  );
};
