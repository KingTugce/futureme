import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import SiteHeader from '@/components/SiteHeader';
import AuthSessionProvider from '@/components/AuthSessionProvider';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'FutureMe',
  description: 'Write honestly. Get a thoughtful reflection.',
};

export default function RootLayout({ children } : { children: React.ReactNode }) {
  return (
    
    <html lang="en" className="bg-neutral-50 text-neutral-900">
      <body className={`${inter.className} antialiased`}>
        
        <AuthSessionProvider>
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">{children}</main>
        
        <footer className="mt-16 border-t  border-neutral-200 py-8 text-xs text-neutral-500">
          <div className="mx-auto max-w-6xl px-5" >
            © {new Date().getFullYear()} FutureMe · Privacy-first journaling
          </div>
        </footer>
        </AuthSessionProvider>
      
      </body>
    </html>
  );
}
