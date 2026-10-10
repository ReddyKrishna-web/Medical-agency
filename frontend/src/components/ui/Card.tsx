import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
export function Card({ children, className }: { children: ReactNode; className?: string }) { return <section className={cn('rounded-2xl border border-slate-200/80 bg-white shadow-soft', className)}>{children}</section>; }
export function CardHeader({ title, description, action, className }: { title: string; description?: string; action?: ReactNode; className?: string }) { return <div className={cn('flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between', className)}><div><h2 className="font-bold text-ink">{title}</h2>{description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}</div>{action}</div>; }
export function CardBody({ children, className }: { children: ReactNode; className?: string }) { return <div className={cn('p-5', className)}>{children}</div>; }
