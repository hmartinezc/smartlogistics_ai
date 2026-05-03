import React, { useState, useEffect } from 'react';
import { Lock, ArrowRight, BrainCircuit, AlertCircle, Zap, Globe, Shield } from './Icons';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<string | null>;
}

/* ── Typewriter cycling messages ────────────────────── */
const terminalMessages = [
  '> Inicializando motor de IA cognitiva...',
  '> Escaneando estructura de factura comercial...',
  '> Validando campos fiscales con Gemini Vision...',
  '> Procesando 2,847 documentos en cola...',
  '> Red neuronal: precisión 99.7 %...',
  '> Pipeline de extracción listo ✓',
];

/* ── Constellation particle field (pure SVG) ──────── */
const ParticleField: React.FC = () => {
  const particles = React.useMemo(() => {
    const pts: { cx: number; cy: number; r: number; delay: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const seed1 = ((i * 7 + 13) * 17) % 100;
      const seed2 = ((i * 11 + 7) * 23) % 100;
      pts.push({
        cx: seed1,
        cy: seed2,
        r: 1 + (i % 3),
        delay: (i % 5) * 0.8,
      });
    }
    return pts;
  }, []);

  return (
    <svg
      className="absolute inset-0 w-full h-full z-0 opacity-40"
      xmlns="http://www.w3.org/2000/svg"
    >
      {particles.map((p, i) => (
        <circle
          key={i}
          cx={`${p.cx}%`}
          cy={`${p.cy}%`}
          r={p.r}
          fill="cyan"
          opacity={0.3 + (i % 4) * 0.15}
          style={{ animation: `float-up ${3 + (i % 4)}s ease-in-out ${p.delay}s infinite` }}
        />
      ))}
      {particles.slice(0, 15).map((p, i) => {
        const next = particles[(i * 3 + 1) % particles.length];
        return (
          <line
            key={`l-${i}`}
            x1={`${p.cx}%`}
            y1={`${p.cy}%`}
            x2={`${next.cx}%`}
            y2={`${next.cy}%`}
            stroke="rgba(99,210,255,0.12)"
            strokeWidth="0.5"
          />
        );
      })}
    </svg>
  );
};

/* ── Floating hexagon shapes ──────────────────────── */
const Hexagon: React.FC<{ size: number; x: string; y: string; delay: number; opacity: number }> = ({
  size,
  x,
  y,
  delay,
  opacity,
}) => (
  <svg
    className="absolute animate-hex-float"
    style={{ left: x, top: y, animationDelay: `${delay}s`, width: size, height: size }}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
  >
    <polygon
      points="50,2 93,25 93,75 50,98 7,75 7,25"
      fill="none"
      stroke={`rgba(139, 92, 246, ${opacity})`}
      strokeWidth="1.5"
    />
  </svg>
);

/* ── Main Login Screen ────────────────────────────── */
const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [msgIndex, setMsgIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');

  /* Typewriter effect */
  useEffect(() => {
    const fullText = terminalMessages[msgIndex];
    let charIdx = 0;
    setDisplayText('');

    const typeInterval = setInterval(() => {
      charIdx++;
      setDisplayText(fullText.slice(0, charIdx));
      if (charIdx >= fullText.length) {
        clearInterval(typeInterval);
        setTimeout(() => {
          setMsgIndex((prev) => (prev + 1) % terminalMessages.length);
        }, 2000);
      }
    }, 35);

    return () => clearInterval(typeInterval);
  }, [msgIndex]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    const authError = await onLogin(email, password);
    if (authError) setError(authError);
    setIsLoading(false);
  };

  return (
    <div className="flex h-screen w-full bg-white dark:bg-slate-900 overflow-hidden">
      {/* ───── Left Side – Form ───── */}
      <div className="w-full lg:w-[45%] flex flex-col justify-center items-center p-8 lg:p-12 relative z-10">
        <div className="w-full max-w-md space-y-8 animate-in slide-in-from-left duration-700">
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold uppercase tracking-wide mb-4 border border-indigo-100 dark:border-indigo-800">
              <BrainCircuit className="w-3 h-3" />
              Powered by Kynreh Lab AI
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
              Smart Invoice AI
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg">
              Plataforma de procesamiento documental inteligente.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm flex items-center gap-2 animate-pulse">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email Corporativo
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                placeholder="admin@smart.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                  placeholder="••••••••"
                  required
                />
                <Lock className="absolute right-4 top-4 w-5 h-5 text-slate-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Verificando...
                </span>
              ) : (
                <>
                  Acceder a Plataforma <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Inicia sesión con tus credenciales para acceder al sistema.
          </div>
        </div>
      </div>

      {/* ───── Right Side – Futuristic Visual ───── */}
      <div className="hidden lg:flex w-[55%] relative items-center justify-center overflow-hidden bg-black">
        {/* Deep gradient base */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-black to-slate-950" />

        {/* Animated particle constellation */}
        <ParticleField />

        {/* Perspective grid floor */}
        <div
          className="absolute bottom-0 left-0 right-0 h-60 opacity-20 overflow-hidden"
          style={{
            backgroundImage:
              'linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            animation: 'grid-scroll 3s linear infinite',
            transform: 'perspective(500px) rotateX(60deg)',
            transformOrigin: 'bottom',
          }}
        />

        {/* Horizontal scan line */}
        <div
          className="absolute left-0 right-0 h-px z-20 animate-scan"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(6,182,212,0.8) 30%, rgba(6,182,212,1) 50%, rgba(6,182,212,0.8) 70%, transparent)',
            boxShadow: '0 0 20px 3px rgba(6,182,212,0.5)',
          }}
        />

        {/* Floating hexagons */}
        <Hexagon size={80} x="10%" y="15%" delay={0} opacity={0.2} />
        <Hexagon size={50} x="75%" y="10%" delay={1.5} opacity={0.15} />
        <Hexagon size={100} x="80%" y="65%" delay={3} opacity={0.12} />
        <Hexagon size={60} x="5%" y="70%" delay={2} opacity={0.18} />
        <Hexagon size={40} x="60%" y="85%" delay={4} opacity={0.15} />

        {/* ── Central Orb with orbiting rings ── */}
        <div className="relative z-10 flex flex-col items-center">
          {/* Orbiting ring system */}
          <div className="relative w-56 h-56 flex items-center justify-center mb-8">
            {/* Outer ring */}
            <div className="absolute inset-0 rounded-full border border-cyan-500/20 animate-orbit-slow" />
            <div
              className="absolute rounded-full animate-orbit"
              style={{ width: '100%', height: '100%' }}
            >
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_12px_rgba(6,182,212,0.8)]" />
            </div>

            {/* Middle ring */}
            <div className="absolute inset-6 rounded-full border border-indigo-400/25 animate-orbit-reverse" />
            <div className="absolute animate-orbit-reverse" style={{ inset: '24px' }}>
              <div className="absolute -bottom-1 right-0 w-2 h-2 bg-violet-400 rounded-full shadow-[0_0_10px_rgba(139,92,246,0.8)]" />
            </div>

            {/* Inner ring */}
            <div className="absolute inset-12 rounded-full border border-purple-500/20 animate-orbit" />

            {/* Central glowing brain icon */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 flex items-center justify-center animate-pulse-glow shadow-2xl">
              <BrainCircuit className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
          </div>

          {/* Title block */}
          <h2 className="text-3xl font-bold text-white mb-1 tracking-tight">
            IA Financiera Cognitiva
          </h2>
          <p className="text-cyan-300/70 text-sm mb-8 tracking-widest uppercase font-mono">
            Neural Document Engine v3.0
          </p>

          {/* Stats row */}
          <div className="flex gap-6 mb-8">
            {[
              { icon: <Zap className="w-4 h-4" />, label: 'Velocidad', value: '< 2s' },
              { icon: <Shield className="w-4 h-4" />, label: 'Precisión', value: '99.7%' },
              { icon: <Globe className="w-4 h-4" />, label: 'Documentos', value: '50k+' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="flex items-center justify-center gap-1 text-cyan-400 mb-1">
                  {stat.icon}
                  <span className="text-xs uppercase tracking-wider text-cyan-400/60">
                    {stat.label}
                  </span>
                </div>
                <span className="text-white text-lg font-bold font-mono">{stat.value}</span>
              </div>
            ))}
          </div>

          {/* Terminal typewriter card */}
          <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-cyan-500/20 rounded-2xl p-5 shadow-[0_0_40px_rgba(6,182,212,0.08)]">
            {/* Terminal header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
              <span className="ml-2 text-[10px] text-slate-500 font-mono uppercase tracking-widest">
                smart-ai-terminal
              </span>
            </div>

            {/* Animated log lines */}
            <div className="space-y-2 font-mono text-xs">
              {terminalMessages.slice(0, msgIndex).map((msg, i) => (
                <div key={i} className="text-cyan-600/50 truncate">
                  {msg}
                </div>
              ))}
              <div className="text-cyan-300 flex">
                <span>{displayText}</span>
                <span className="ml-0.5 w-2 h-4 bg-cyan-400 inline-block animate-cursor-blink" />
              </div>
            </div>

            {/* Status bar */}
            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
                <span className="text-[10px] text-green-400/80 font-mono">SISTEMA ACTIVO</span>
              </div>
              <span className="text-[10px] text-slate-600 font-mono">
                GPU: 94% &middot; MEM: 12.4 GB
              </span>
            </div>
          </div>
        </div>

        {/* Corner accent lines */}
        <div className="absolute top-8 left-8 w-16 h-16 border-l-2 border-t-2 border-cyan-500/30 rounded-tl-lg" />
        <div className="absolute bottom-8 right-8 w-16 h-16 border-r-2 border-b-2 border-indigo-500/30 rounded-br-lg" />

        {/* Subtle vignette */}
        <div
          className="absolute inset-0 pointer-events-none z-30"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)',
          }}
        />
      </div>
    </div>
  );
};

export default LoginScreen;
