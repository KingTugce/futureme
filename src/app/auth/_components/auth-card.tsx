import type { ReactNode } from 'react';

type AuthCardProps = {
  badge: string;
  children: ReactNode;
  description: string;
  title: string;
};

export function AuthCard({ badge, children, description, title }: AuthCardProps) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-[linear-gradient(135deg,#f8fafc,#eef2ff)] p-4 dark:bg-[linear-gradient(135deg,#0b0e11,#111827)]">
      <section
        aria-labelledby="auth-card-title"
        className="w-full max-w-md rounded-3xl border border-white/20 bg-white/70 shadow-[0_10px_35px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:bg-white/5"
      >
        <header className="px-8 pb-6 pt-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/70 px-3 py-1 text-[11px] text-neutral-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300">
            {badge}
          </div>
          <h1
            id="auth-card-title"
            className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50"
          >
            {title}
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            {description}
          </p>
        </header>
        <div className="px-8 pb-8">{children}</div>
      </section>
    </div>
  );
}
