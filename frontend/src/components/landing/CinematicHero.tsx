import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, ShieldCheck, Truck, Package, BarChart3 } from 'lucide-react';
import Hero3DScene from '@/components/3d/Hero3DScene';

export default function CinematicHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });
  
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section ref={containerRef} className="relative min-h-screen overflow-hidden bg-gradient-to-b from-night-950 via-night-900 to-night-950">
      <div className="absolute inset-0">
        <Hero3DScene />
      </div>
      
      <div aria-hidden className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-royal-500/20 blur-3xl motion-safe:animate-aurora" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-1/3 h-[26rem] w-[26rem] rounded-full bg-cyan-500/15 blur-3xl motion-safe:animate-aurora" style={{ animationDelay: '-8s' }} />
      <div aria-hidden className="absolute inset-0 grid-overlay opacity-70" />
      <div className="absolute inset-0 bg-gradient-to-t from-night-950/85 via-transparent to-night-950/65" />
      
      <motion.div style={{ y, opacity }} className="relative z-10 mx-auto max-w-7xl px-4 pt-40 pb-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-400/40 bg-royal-500/10 px-4 py-2 text-sm font-semibold text-brand-200 backdrop-blur-xl"
          >
            <Sparkles className="h-4 w-4 animate-glow" />
            Next-Gen Pharmaceutical Distribution Platform
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="text-5xl font-black leading-[1.05] tracking-[-0.04em] sm:text-6xl lg:text-7xl xl:text-8xl"
          >
            <span className="bg-gradient-to-r from-white via-brand-100 to-cyan-200 bg-clip-text text-transparent">
              Smarter Medical Supply.
            </span>
            <br />
            <span className="animate-gradient-x bg-[linear-gradient(90deg,#2f6ff2,#14b8a6,#48a4ff,#2f6ff2)] bg-[length:220%_100%] bg-clip-text text-transparent text-glow">
              Faster Business.
            </span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mx-auto mt-8 max-w-2xl text-xl leading-9 text-white/75"
          >
            Experience the future of B2B pharmaceutical distribution. AI-powered supply chain orchestration, 
            real-time tracking, and intelligent inventory management across your entire network.
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Link
              to="/login"
              className="shine group relative inline-flex h-14 items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-royal-600 via-royal-500 to-cyan-600 px-8 py-4 text-base font-bold text-white shadow-glow transition-all duration-300 ease-smooth hover:scale-105 hover:brightness-110"
            >
              <span className="relative z-10">Explore Platform</span>
              <ArrowRight className="relative z-10 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/register"
              className="group inline-flex h-14 items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/5 px-8 py-4 text-base font-bold text-white backdrop-blur-xl transition-all duration-300 ease-smooth hover:scale-105 hover:border-cyan-400/50 hover:bg-white/10"
            >
              Get Started
              <Sparkles className="h-5 w-5 transition-transform duration-500 group-hover:rotate-12" />
            </Link>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.0 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm text-white/50"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-medical-400" />
              <span>Enterprise Security</span>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-cyan-400" />
              <span>Real-time Tracking</span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-brand-300" />
              <span>Smart Inventory</span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-teal-400" />
              <span>Advanced Analytics</span>
            </div>
          </motion.div>
        </div>
      </motion.div>
      
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-night-950 to-transparent" />
    </section>
  );
}
