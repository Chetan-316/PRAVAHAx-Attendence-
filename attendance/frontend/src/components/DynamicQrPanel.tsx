import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { RefreshCw, QrCode } from 'lucide-react';

interface DynamicQrPanelProps {
  token: string;
  secondsRemaining: number;
  rotationInterval: number;
}

export const DynamicQrPanel: React.FC<DynamicQrPanelProps> = ({
  token,
  secondsRemaining,
  rotationInterval = 5
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(secondsRemaining || rotationInterval);
  const currentTokenRef = useRef<string>('');

  // Update QR image ONLY when the token string changes (zero flicker)
  useEffect(() => {
    if (!token || token === currentTokenRef.current) return;
    currentTokenRef.current = token;

    QRCode.toDataURL(token, {
      width: 320,
      margin: 1.5,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR Render Error:', err));
  }, [token]);

  // Synchronize countdown when server updates secondsRemaining
  useEffect(() => {
    setCountdown(secondsRemaining);
  }, [secondsRemaining]);

  // Smooth local tick every 100ms
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        const next = Math.max(0, prev - 0.1);
        return parseFloat(next.toFixed(1));
      });
    }, 100);

    return () => clearInterval(timer);
  }, []);

  const progressPercent = Math.min(100, Math.max(0, (countdown / rotationInterval) * 100));

  return (
    <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between w-full max-w-[320px]">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Dynamic QR
          </span>
        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Refreshes every {rotationInterval}s
        </span>
      </div>

      {/* QR Code Container */}
      <div className="relative flex h-[320px] w-[320px] items-center justify-center rounded-xl border border-slate-100 bg-white p-2 shadow-inner dark:border-slate-800 dark:bg-white">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="Dynamic Attendance QR"
            className="h-full w-full object-contain rounded-lg"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <RefreshCw className="h-8 w-8 animate-spin" />
            <span className="text-xs">Generating code...</span>
          </div>
        )}
      </div>

      {/* Progress & Countdown Indicator */}
      <div className="mt-4 w-full max-w-[320px]">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-mono">
          <span>Next refresh</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{countdown.toFixed(1)}s</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-indigo-600 transition-all duration-100 ease-linear dark:bg-indigo-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
