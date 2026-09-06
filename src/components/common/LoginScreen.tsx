import React from 'react';
import { motion } from 'motion/react';
import { Building2 } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-orange-500/20">
            <Building2 className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white">KhataBook Pro</h1>
          <div className="flex flex-col items-center">
            <p className="text-zinc-500 text-sm">Business Management Software</p>
            <p className="text-zinc-600 text-[10px]">made by VaibhavK</p>
          </div>
        </div>

        <form onSubmit={onLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Username</label>
            <input 
              name="username" 
              type="text" 
              defaultValue="admin"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
              placeholder="Enter username"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Password</label>
            <input 
              name="password" 
              type="password" 
              defaultValue="admin123"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
              placeholder="Enter password"
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-orange-500/20 active:scale-95"
          >
            Login to Dashboard
          </button>
        </form>
        <div className="mt-8 text-center text-zinc-600 text-xs space-y-1">
          <p>Default: admin / admin123</p>
          <p>Default user: user / user123</p>
        </div>
      </motion.div>
    </div>
  );
}
