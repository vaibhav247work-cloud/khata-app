import { Smartphone, Download, AlertCircle } from 'lucide-react';

export function AdminApkSection() {
  return (
    <div className="pt-10 border-t border-zinc-800/50">
      <h4 className="font-bold mb-4 text-sm flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-orange-500" />
        Android Mobile App (APK)
      </h4>
      <div className="bg-gradient-to-br from-orange-500/10 via-zinc-900 to-zinc-900 border border-orange-500/30 p-6 rounded-[28px] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-white">KhataBook Pro APK</span>
              <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full">v1.0 Ready</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Install on any Android smartphone for offline ledger accounting & auto Google Sheets sync.
            </p>
          </div>
          <a
            href="/Khatabook.apk"
            download="Khatabook.apk"
            className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-sm px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/25 shrink-0"
          >
            <Download className="w-4 h-4" /> Download APK
          </a>
        </div>
        <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl p-4 text-[11px] text-zinc-400 space-y-1.5">
          <p className="font-bold text-zinc-300 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
            Quick Install Guide:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-zinc-400 ml-1">
            <li>Tap <strong className="text-zinc-200">Download APK</strong> to save file to your phone</li>
            <li>Open Downloads & tap <strong className="text-zinc-200">Khatabook.apk</strong></li>
            <li>If prompted, enable <strong className="text-zinc-200">&apos;Allow from this source&apos;</strong> in settings</li>
            <li>Tap <strong className="text-zinc-200">Install</strong> — your KhataBook app is ready!</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
