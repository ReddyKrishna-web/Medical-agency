import { motion } from 'framer-motion';
import { Building2, Users, ShoppingBag, Truck, Package, BarChart3, Activity, Zap } from 'lucide-react';

const features = [
  {
    icon: Building2,
    title: 'Agency Administrators',
    description: 'Complete control over your distribution network with advanced analytics and multi-user management.',
    gradient: 'from-royal-600 to-royal-800',
    delay: 0.1
  },
  {
    icon: Users,
    title: 'Sales Representatives',
    description: 'Empower your field team with CRM tools, route optimization, and real-time order management.',
    gradient: 'from-brand-500 to-royal-700',
    delay: 0.2
  },
  {
    icon: ShoppingBag,
    title: 'Medical Shops',
    description: 'Seamless ordering experience with smart reordering, inventory alerts, and transparent pricing.',
    gradient: 'from-cyan-500 to-medical-600',
    delay: 0.3
  },
  {
    icon: Truck,
    title: 'Order Tracking',
    description: 'End-to-end visibility with live GPS tracking, delivery status updates, and automated notifications.',
    gradient: 'from-teal-500 to-cyan-700',
    delay: 0.4
  },
  {
    icon: Package,
    title: 'Inventory Management',
    description: 'AI-powered stock optimization with FEFO allocation, expiry alerts, and predictive replenishment.',
    gradient: 'from-cyan-400 to-teal-600',
    delay: 0.5
  },
  {
    icon: BarChart3,
    title: 'Business Analytics',
    description: 'Data-driven insights with interactive dashboards, sales forecasting, and performance metrics.',
    gradient: 'from-royal-500 to-cyan-600',
    delay: 0.6
  }
];

export default function PremiumFeatures() {
  return (
    <section className="relative py-32 overflow-hidden bg-gradient-to-b from-night-950 to-night-900">
      <div aria-hidden className="absolute inset-0 opacity-30">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-royal-500/25 blur-3xl motion-safe:animate-aurora" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl motion-safe:animate-aurora" style={{ animationDelay: '-9s' }} />
      </div>
      <div aria-hidden className="absolute inset-0 grid-overlay opacity-50" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center mb-20"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 backdrop-blur-xl">
            <Activity className="h-4 w-4" />
            Comprehensive Platform Solutions
          </div>
          <h2 className="font-display text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              Built for Every
            </span>
            <br />
            <span className="animate-gradient-x bg-[linear-gradient(90deg,#2f6ff2,#14b8a6,#48a4ff,#2f6ff2)] bg-[length:220%_100%] bg-clip-text text-transparent">
              Stakeholder
            </span>
          </h2>
          <p className="mt-6 text-xl leading-8 text-white/65">
            A unified ecosystem designed to streamline pharmaceutical distribution across all touchpoints
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial={{ opacity: 0, y: 60 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: feature.delay }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.04, rotateY: 4 }}
              className="group relative overflow-hidden rounded-3xl glass-card p-8 hover:shadow-glow"
            >
              <div aria-hidden className="pointer-events-none absolute -right-14 -top-14 h-32 w-32 rounded-full bg-gradient-to-br from-royal-500/30 to-cyan-400/20 blur-2xl transition-transform duration-700 group-hover:scale-150" />

              <div className="relative">
                <div className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.gradient} shadow-glow-sm transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`}>
                  <feature.icon className="h-7 w-7 text-white" />
                </div>

                <h3 className="mb-4 font-display text-xl font-bold text-white transition-all group-hover:text-cyan-200">
                  {feature.title}
                </h3>

                <p className="text-[15px] leading-7 text-white/60 transition-colors group-hover:text-white/80">
                  {feature.description}
                </p>

                <div className="mt-6 flex items-center gap-2 text-sm font-bold text-cyan-300 opacity-0 transition-all duration-500 ease-smooth group-hover:translate-x-2 group-hover:opacity-100">
                  Learn more <Zap className="h-4 w-4" />
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
