import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Sparkles,
  RotateCcw,
  Camera,
  Layers,
  Palette,
  Eye,
  Info,
} from 'lucide-react';

export type FlowerPaletteId = 'original' | 'florify' | 'meadow' | 'sunset';
export type BackgroundThemeId = 'midnight' | 'blossom' | 'pure_white' | 'transparent';

interface FlowerCanvasProps {
  className?: string;
  initialPalette?: FlowerPaletteId;
  initialBackground?: BackgroundThemeId;
  fullscreen?: boolean;
  showControls?: boolean;
}

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
  uniform int u_palette;
  uniform vec3 u_bg_color;
  uniform float u_use_bg;

  uniform sampler2D u_texture;
  varying vec2 vUv;

  // --------------------------------
  // 2D simplex noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
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
    vec2 flower_size_range = vec2(.03, .1);
    float size = flower_size_range[0] + u_stop_randomizer[0] * flower_size_range[1];
    float flower_radial_shape = pow(length(_p) / size, 2.);
    flower_radial_shape -= .1 * sin(8. * a);
    flower_radial_shape = max(.1, flower_radial_shape);
    flower_radial_shape += smoothstep(0., 0.03, -_p.y + .2 * abs(_p.x));
    float grow_time = step(.25, u_stop_time) * pow(u_stop_time, .3);
    float flower_shape = 1. - smoothstep(0., flower_sectoral_shape, _outline * flower_radial_shape / max(grow_time, 1e-4));
    flower_shape *= step(1e-4, grow_time) * (1. - step(1., grow_time));
    return flower_shape;
  }

  float get_stem_shape(vec2 _p, vec2 _uv, float _w, float _angle) {
    _w = max(.004, _w);
    float x_offset = _p.y * sin(_angle);
    x_offset *= pow(3. * _uv.y, 2.);
    _p.x -= x_offset;

    float noise_power = .5;
    float cursor_horizontal_noise = noise_power * snoise(2. * _uv * u_stop_randomizer[0]);
    cursor_horizontal_noise *= pow(dot(_p.y, _p.y), .6);
    cursor_horizontal_noise *= pow(dot(_uv.y, _uv.y), .3);
    _p.x += cursor_horizontal_noise;

    float left = smoothstep(-_w, 0., _p.x);
    float right = 1. - smoothstep(0., _w, _p.x);
    float stem_shape = left * right;

    float grow_time = 1. - smoothstep(0., .2, u_stop_time);
    float stem_top_mask = smoothstep(0., pow(grow_time, .5), .03 -_p.y);
    stem_shape *= stem_top_mask;
    stem_shape *= (1. - step(.17, u_stop_time));
    return stem_shape;
  }

  void main() {
    vec4 base = texture2D(u_texture, vUv);

    vec2 uv = vUv;
    uv.x *= u_ratio;
    vec2 cursor = vUv - u_cursor.xy;
    cursor.x *= u_ratio;

    // Palette evaluation: Retaining vibrant colors or Florify theme
    vec3 stem_color;
    vec3 flower_color;

    if (u_palette == 1) {
      // Florify Signature Palette: Coral Pink (#FF5C89) & Deep Berry (#C72C5E) with Emerald foliage
      stem_color = vec3(0.02 + u_stop_randomizer[0] * 0.15, 0.65 + u_stop_randomizer[1] * 0.15, 0.38);
      flower_color = mix(
        vec3(1.0, 0.361, 0.537),  // #FF5C89
        vec3(0.78, 0.173, 0.369), // #C72C5E
        u_stop_randomizer[1]
      );
    } else if (u_palette == 2) {
      // Meadow Wildflower: Golden Daisy, Sunflower & Poppy
      stem_color = vec3(0.25 + u_stop_randomizer[0] * 0.2, 0.62, 0.18);
      flower_color = mix(
        vec3(0.98, 0.82, 0.25),
        vec3(0.99, 0.45, 0.20),
        u_stop_randomizer[1]
      );
    } else if (u_palette == 3) {
      // Sunset Peach & Lavender
      stem_color = vec3(0.18, 0.58, 0.28);
      flower_color = mix(
        vec3(0.95, 0.45, 0.70),
        vec3(0.60, 0.35, 0.90),
        u_stop_randomizer[1]
      );
    } else {
      // Original CodePen Formula: Retains 100% of the exact original colors!
      stem_color = vec3(.1 + u_stop_randomizer[0] * .6, .6, .2);
      flower_color = vec3(.6 + .5 * u_stop_randomizer[1], .1, .9 - .5 * u_stop_randomizer[1]);
    }

    float angle = .5 * (u_stop_randomizer[0] - .5);

    float stem_shape = get_stem_shape(cursor, uv, .003, angle);
    stem_shape += get_stem_shape(cursor + vec2(0., .2 + .5 * u_stop_randomizer[0]), uv, .003, angle);
    float stem_mask = 1. - get_stem_shape(cursor, uv, .004, angle);
    stem_mask -= get_stem_shape(cursor + vec2(0., .2 + .5 * u_stop_randomizer[0]), uv, .004, angle);

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
    color += (flower_back_shape * (flower_color + vec3(0., .8 * u_stop_time, 0.)));
    color += (flower_front_shape * flower_color);

    color.r *= 1. - (.5 * flower_back_shape * flower_front_shape);
    color.b *= 1. - (flower_back_shape * flower_front_shape);

    // Compute cumulative coverage alpha
    float new_coverage = clamp(stem_shape + flower_back_shape + flower_front_shape, 0.0, 1.0);
    float combined_alpha = clamp(base.w * stem_mask * flower_back_mask * flower_front_mask + new_coverage, 0.0, 1.0);

    color *= u_clean;
    combined_alpha *= u_clean;

    // Output with optional background color blend
    if (u_use_bg > 0.5) {
      vec3 final_rgb = mix(u_bg_color, color, combined_alpha);
      gl_FragColor = vec4(final_rgb, 1.0);
    } else {
      gl_FragColor = vec4(color, combined_alpha);
    }
  }
`;

export const FlowerCanvas: React.FC<FlowerCanvasProps> = ({
  className = '',
  initialPalette = 'original',
  initialBackground = 'midnight',
  fullscreen = false,
  showControls = true,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [palette, setPalette] = useState<FlowerPaletteId>(initialPalette);
  const [backgroundTheme, setBackgroundTheme] = useState<BackgroundThemeId>(initialBackground);
  const [flowerCount, setFlowerCount] = useState<number>(1);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isVanishActive, setIsVanishActive] = useState(false);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);

  // References to Three.js instances for dynamic updates
  const shaderMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const pointerRef = useRef<{
    x: number;
    y: number;
    clicked: boolean;
    vanishCanvas: boolean;
  }>({
    x: 0.66,
    y: 0.35,
    clicked: true,
    vanishCanvas: false,
  });

  // Background RGB map
  const getBgRgb = (theme: BackgroundThemeId): THREE.Vector3 => {
    switch (theme) {
      case 'blossom':
        return new THREE.Vector3(1.0, 0.969, 0.976); // #FFF7F9 (Florify cream)
      case 'pure_white':
        return new THREE.Vector3(1.0, 1.0, 1.0);
      case 'midnight':
      default:
        return new THREE.Vector3(0.059, 0.031, 0.071); // #0F0712
    }
  };

  const getPaletteIndex = (p: FlowerPaletteId): number => {
    switch (p) {
      case 'florify':
        return 1;
      case 'meadow':
        return 2;
      case 'sunset':
        return 3;
      case 'original':
      default:
        return 0;
    }
  };

  // Sync palette uniform
  useEffect(() => {
    if (shaderMaterialRef.current) {
      shaderMaterialRef.current.uniforms.u_palette.value = getPaletteIndex(palette);
    }
  }, [palette]);

  // Sync background theme uniform
  useEffect(() => {
    if (shaderMaterialRef.current) {
      shaderMaterialRef.current.uniforms.u_bg_color.value = getBgRgb(backgroundTheme);
      shaderMaterialRef.current.uniforms.u_use_bg.value = backgroundTheme === 'transparent' ? 0.0 : 1.0;
    }
  }, [backgroundTheme]);

  // WebGL Lifecyle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
    } catch (e) {
      console.error('WebGL initialization failed:', e);
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

    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_stop_time: { value: 0.0 },
        u_stop_randomizer: { value: new THREE.Vector2(Math.random(), Math.random()) },
        u_cursor: { value: new THREE.Vector2(pointerRef.current.x, pointerRef.current.y) },
        u_ratio: { value: window.innerWidth / window.innerHeight },
        u_texture: { value: null },
        u_clean: { value: 1.0 },
        u_palette: { value: getPaletteIndex(palette) },
        u_bg_color: { value: getBgRgb(backgroundTheme) },
        u_use_bg: { value: backgroundTheme === 'transparent' ? 0.0 : 1.0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
    });
    shaderMaterialRef.current = shaderMaterial;

    const basicMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
    });

    const planeGeometry = new THREE.PlaneGeometry(2, 2);
    const planeBasic = new THREE.Mesh(planeGeometry, basicMaterial);
    const planeShader = new THREE.Mesh(planeGeometry, shaderMaterial);
    sceneBasic.add(planeBasic);
    sceneShader.add(planeShader);

    const updateSize = () => {
      const container = mountRef.current;
      const width = container ? container.clientWidth : window.innerWidth;
      const height = container ? container.clientHeight : window.innerHeight;

      shaderMaterial.uniforms.u_ratio.value = width / Math.max(1, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height, false);

      const pixelRatio = renderer.getPixelRatio();
      const rw = Math.round(width * pixelRatio);
      const rh = Math.round(height * pixelRatio);
      renderTargets[0].setSize(rw, rh);
      renderTargets[1].setSize(rw, rh);
    };

    updateSize();

    // Trigger initial preview flower
    const initialTimer = window.setTimeout(() => {
      pointerRef.current.x = 0.5;
      pointerRef.current.y = 0.45;
      pointerRef.current.clicked = true;
    }, 400);

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

      // Swap buffers
      const tmp = renderTargets[0];
      renderTargets[0] = renderTargets[1];
      renderTargets[1] = tmp;

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      updateSize();
    };
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

  // Pointer / Click Handler
  const handlePointerAction = (clientX: number, clientY: number) => {
    const container = mountRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    pointerRef.current.x = Math.max(0.01, Math.min(0.99, x));
    pointerRef.current.y = Math.max(0.01, Math.min(0.99, y));
    pointerRef.current.clicked = true;

    setFlowerCount((prev) => prev + 1);
    if (!hasInteracted) {
      setHasInteracted(true);
    }
  };

  const handleClean = () => {
    setIsVanishActive(true);
    pointerRef.current.vanishCanvas = true;
    setTimeout(() => {
      pointerRef.current.vanishCanvas = false;
      setIsVanishActive(false);
      setFlowerCount(0);
    }, 60);
  };

  const handleScatterSeeds = () => {
    // Generate 4 staggered flowers
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        const rx = 0.2 + Math.random() * 0.6;
        const ry = 0.3 + Math.random() * 0.45;
        pointerRef.current.x = rx;
        pointerRef.current.y = ry;
        pointerRef.current.clicked = true;
        setFlowerCount((prev) => prev + 1);
        setHasInteracted(true);
      }, i * 380);
    }
  };

  const handleSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `florify-blossoms-${Date.now()}.png`;
      a.click();
    } catch (e) {
      console.warn('Canvas snapshot blocked:', e);
    }
  };

  const bgClass =
    backgroundTheme === 'midnight'
      ? 'bg-[#0E0713]'
      : backgroundTheme === 'blossom'
      ? 'bg-[#FFF7F9]'
      : backgroundTheme === 'pure_white'
      ? 'bg-white'
      : 'bg-transparent';

  return (
    <div
      ref={mountRef}
      className={`relative overflow-hidden select-none touch-none ${
        fullscreen ? 'fixed inset-0 z-40 w-screen h-screen' : 'w-full h-full min-h-[420px]'
      } ${bgClass} ${className}`}
      onClick={(e) => {
        // Only trigger if click was directly on the canvas background
        if ((e.target as HTMLElement).tagName === 'CANVAS') {
          handlePointerAction(e.clientX, e.clientY);
        }
      }}
      onTouchStart={(e) => {
        if ((e.target as HTMLElement).tagName === 'CANVAS') {
          const touch = e.touches[0];
          handlePointerAction(touch.clientX, touch.clientY);
        }
      }}
    >
      {/* Three.js Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block cursor-crosshair"
      />

      {/* Floating Center Prompt from CodePen */}
      <div
        className={`pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center transition-all duration-700 ${
          hasInteracted ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-90 scale-100'
        }`}
      >
        <span
          className={`font-serif text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight block drop-shadow-md ${
            backgroundTheme === 'blossom' || backgroundTheme === 'pure_white'
              ? 'text-[#C72C5E]'
              : 'text-white'
          }`}
        >
          Click To Add Flowers
        </span>
        <span
          className={`text-xs sm:text-sm font-sans tracking-wide block mt-1.5 opacity-80 ${
            backgroundTheme === 'blossom' || backgroundTheme === 'pure_white'
              ? 'text-[#826674]'
              : 'text-pink-200'
          }`}
        >
          Tap anywhere on screen to watch stems and blossoms sprout
        </span>
      </div>

      {/* Clean Button (Direct CodePen Style + Modern Florify Touches) */}
      <div className="absolute bottom-5 left-5 z-20 flex items-center gap-3">
        <button
          onClick={handleClean}
          title="Clear all blooming flowers from canvas"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs ${
            backgroundTheme === 'blossom' || backgroundTheme === 'pure_white'
              ? 'bg-white border border-[#FDC3D1] text-[#C72C5E] hover:bg-[#FFF7F9]'
              : 'bg-black/50 border border-white/20 text-white hover:bg-black/70 backdrop-blur-xs'
          } ${isVanishActive ? 'scale-90 opacity-60' : ''}`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          clean the screen
        </button>

        <span
          className={`text-[11px] font-mono px-2 py-1 rounded-md ${
            backgroundTheme === 'blossom' || backgroundTheme === 'pure_white'
              ? 'bg-[#FFF7F9] text-[#C72C5E] border border-[#FDC3D1]/60'
              : 'bg-white/10 text-white/90 border border-white/10'
          }`}
        >
          🌸 {flowerCount} {flowerCount === 1 ? 'Bloom' : 'Blooms'}
        </span>
      </div>

      {/* Floating Toolbar Controls */}
      {showControls && (
        <div className="absolute top-4 right-4 z-20 flex flex-wrap items-center justify-end gap-2 max-w-[calc(100%-2rem)]">
          {/* Quick Actions */}
          <button
            onClick={handleScatterSeeds}
            title="Auto scatter flower blossoms across screen"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs ${
              backgroundTheme === 'blossom' || backgroundTheme === 'pure_white'
                ? 'bg-white/90 border border-[#FDC3D1] text-[#C72C5E] hover:bg-[#FFF7F9]'
                : 'bg-white/15 border border-white/20 text-white hover:bg-white/25 backdrop-blur-xs'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-[#FF5C89]" />
            Scatter Seeds
          </button>

          <button
            onClick={handleSnapshot}
            title="Export snapshot of your floral creation"
            className={`p-2 rounded-lg text-xs transition-all active:scale-95 cursor-pointer shadow-xs ${
              backgroundTheme === 'blossom' || backgroundTheme === 'pure_white'
                ? 'bg-white/90 border border-[#FDC3D1] text-[#C72C5E] hover:bg-[#FFF7F9]'
                : 'bg-white/15 border border-white/20 text-white hover:bg-white/25 backdrop-blur-xs'
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
          </button>

          {/* Palette Picker */}
          <div className="relative group">
            <div
              className={`p-1 rounded-lg border flex items-center gap-1 shadow-xs ${
                backgroundTheme === 'blossom' || backgroundTheme === 'pure_white'
                  ? 'bg-white/90 border-[#FDC3D1]'
                  : 'bg-black/60 border-white/20 backdrop-blur-xs text-white'
              }`}
            >
              <Palette className="h-3.5 w-3.5 ml-1 text-[#FF5C89]" />
              <button
                onClick={() => setPalette('original')}
                title="Original CodePen Palette (Neon Violet & Magenta)"
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  palette === 'original'
                    ? 'bg-[#FF5C89] text-white'
                    : 'text-[#826674] hover:text-[#C72C5E]'
                }`}
              >
                Original
              </button>
              <button
                onClick={() => setPalette('florify')}
                title="Florify Rose & Peony Brand Palette"
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  palette === 'florify'
                    ? 'bg-[#C72C5E] text-white'
                    : 'text-[#826674] hover:text-[#C72C5E]'
                }`}
              >
                Florify Rose
              </button>
              <button
                onClick={() => setPalette('meadow')}
                title="Sunlit Meadow (Golden Sunflower & Amber)"
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  palette === 'meadow'
                    ? 'bg-amber-600 text-white'
                    : 'text-[#826674] hover:text-[#C72C5E]'
                }`}
              >
                Meadow
              </button>
            </div>
          </div>

          {/* Background Theme Picker */}
          <div
            className={`p-1 rounded-lg border flex items-center gap-1 shadow-xs ${
              backgroundTheme === 'blossom' || backgroundTheme === 'pure_white'
                ? 'bg-white/90 border-[#FDC3D1]'
                : 'bg-black/60 border-white/20 backdrop-blur-xs text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5 ml-1 text-[#826674]" />
            <button
              onClick={() => setBackgroundTheme('midnight')}
              title="Midnight Velvet Canvas (Original CodePen style)"
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                backgroundTheme === 'midnight'
                  ? 'bg-slate-800 text-white'
                  : 'text-[#826674] hover:text-[#C72C5E]'
              }`}
            >
              Midnight
            </button>
            <button
              onClick={() => setBackgroundTheme('blossom')}
              title="Florify Blossom Cream Canvas (#FFF7F9)"
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                backgroundTheme === 'blossom'
                  ? 'bg-[#FDC3D1] text-[#C72C5E]'
                  : 'text-[#826674] hover:text-[#C72C5E]'
              }`}
            >
              Blossom
            </button>
            <button
              onClick={() => setBackgroundTheme('pure_white')}
              title="Pure Alabaster White Canvas"
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                backgroundTheme === 'pure_white'
                  ? 'bg-slate-200 text-[#2E1826]'
                  : 'text-[#826674] hover:text-[#C72C5E]'
              }`}
            >
              White
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
