import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper de shadcn: combina clases condicionales y resuelve conflictos de Tailwind.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
