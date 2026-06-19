import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Hammer, Radio, DoorOpen, Users, ArrowRight, Wand2, Store } from 'lucide-react';
import { PageShell } from '@/components/ui';
import { Wordmark, LighthouseMark } from '@/components/brand';
import { GlowOrb, Starfield, FogLayer } from '@/components/atmosphere';
import { useRosterStore, useDraftStore } from '@/store';
import { usePrefersReducedMotion } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PortalCard } from './home/PortalCard';

/** Staggered entrance for the centered hero column. */
const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export default function HomeScreen() {
  const navigate = useNavigate();
  const heroCount = useRosterStore((s) => s.characters.length);
  const reduced = usePrefersReducedMotion();

  const forgeHero = () => {
    useDraftStore.getState().startNew();
    navigate('/forge');
  };

  return (
    <PageShell center contentClassName="px-4 py-12 sm:py-16">
      {/* Atmospheric depth layered above the PageShell's BeamBackground. */}
      <Starfield count={70} tone="mixed" className="z-0" />
      <GlowOrb tone="beam" size={520} top="-12%" left="50%" intensity={0.32} className="-translate-x-1/2" />
      <GlowOrb tone="arcane" size={360} bottom="2%" left="-6%" intensity={0.22} />
      <GlowOrb tone="mystic" size={320} bottom="6%" right="-4%" intensity={0.18} />
      <FogLayer position="bottom" tone="abyss" intensity={0.7} />

      {/* Faint lighthouse silhouette far behind the title for depth. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-1/2 top-1/2 -z-0 -translate-x-1/2 -translate-y-[60%] opacity-[0.06]',
          !reduced && 'animate-float',
        )}
      >
        <LighthouseMark size={460} glow={false} beam={false} />
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center text-center"
      >
        {/* Title + tagline */}
        <motion.div variants={item}>
          <Wordmark
            size="xl"
            layout="stacked"
            glow
            tagline="A Luminous Tabletop RPG"
          />
        </motion.div>

        <motion.p
          variants={item}
          className="mt-5 max-w-xl text-balance text-base leading-relaxed text-ink-muted sm:text-lg"
        >
          Gather your party and play in the browser. Forge heroes from light and
          shadow, host a table, and let the beam guide your story.
        </motion.p>

        {/* Three portals */}
        <motion.div
          variants={item}
          className="mt-12 grid w-full grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <PortalCard
            icon={Hammer}
            title="Forge a Hero"
            description="Craft a character — stats, skills, and gear — in the Forge."
            accent="beam"
            onClick={forgeHero}
          />
          <PortalCard
            icon={Radio}
            title="Host a Table"
            description="Light the beacon and run a session as the Game Master."
            accent="arcane"
            onClick={() => navigate('/host')}
          />
          <PortalCard
            icon={DoorOpen}
            title="Join a Table"
            description="Answer the beam with a room code and bring your hero."
            accent="mystic"
            onClick={() => navigate('/join')}
          />
        </motion.div>

        {/* Create & share — Worldforge + Marketplace */}
        <motion.div
          variants={item}
          className="mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <PortalCard
            icon={Wand2}
            title="Worldforge"
            description="Build your own system — reskin every stat, skill, and item."
            accent="arcane"
            onClick={() => navigate('/worldforge')}
          />
          <PortalCard
            icon={Store}
            title="Marketplace"
            description="Discover and share community-made systems."
            accent="mystic"
            onClick={() => navigate('/marketplace')}
          />
        </motion.div>

        {/* Secondary: roster */}
        <motion.div variants={item} className="mt-8 w-full">
          <button
            type="button"
            onClick={() => navigate('/roster')}
            className={cn(
              'group mx-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-line bg-surface/50 px-5 py-3.5',
              'text-left backdrop-blur-xl transition-colors duration-300 tap-highlight-none',
              'hover:border-beam/40 focus-visible:outline-none focus-visible:border-beam/40',
            )}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line-strong bg-void/50 text-ink-muted transition-colors group-hover:text-beam-soft [&_svg]:h-5 [&_svg]:w-5">
              <Users />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-sm font-semibold tracking-wide text-ink">
                Your Roster
              </span>
              <span className="block text-xs text-ink-muted">
                {heroCount === 0
                  ? 'No heroes yet — forge your first'
                  : `${heroCount} ${heroCount === 1 ? 'hero' : 'heroes'} ready to play`}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint transition-all duration-300 group-hover:translate-x-1 group-hover:text-beam-soft" />
          </button>
        </motion.div>
      </motion.div>

      {/* Footer line */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="relative z-10 mt-16 text-center text-xs uppercase tracking-[0.3em] text-ink-faint"
      >
        Let your light reach the far shore
      </motion.footer>
    </PageShell>
  );
}
