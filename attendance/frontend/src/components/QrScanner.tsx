import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { SwitchCamera, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  isScanningLocked: boolean;
}

export const QrScanner: React.FC<QrScannerProps> = ({ onScanSuccess, isScanningLocked }) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<any[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState<number>(0);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isLockedRef = useRef<boolean>(isScanningLocked);
  const scannerElementId = 'qr-reader-container';

  // Keep ref synchronized with current lock state to avoid stale closure in decode callback
  useEffect(() => {
    isLockedRef.current = isScanningLocked;
  }, [isScanningLocked]);

  // Clean stop helper
  const stopScanner = useCallback(async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.warn('Scanner stop error:', err);
      }
    }
  }, []);

  const initScanner = useCallback(async () => {
    try {
      setCameraError(null);

      await stopScanner();

      // Query available video devices
      const devices = await Html5Qrcode.getCameras().catch(() => []);
      let chosenIndex = 0;
      if (devices && devices.length > 0) {
        setCameras(devices);
        // Automatically prefer the rear / environment camera on mobile
        const rearIdx = devices.findIndex((d: any) => {
          const lbl = (d.label || '').toLowerCase();
          return lbl.includes('back') || lbl.includes('rear') || lbl.includes('environment');
        });
        if (rearIdx !== -1) chosenIndex = rearIdx;
        setCurrentCameraIndex(chosenIndex);
      }

      const html5QrCode = new Html5Qrcode(scannerElementId);
      scannerRef.current = html5QrCode;

      const cameraConfig =
        devices && devices.length > 0
          ? { deviceId: { exact: devices[chosenIndex].id } }
          : { facingMode: 'environment' };

      await html5QrCode.start(
        cameraConfig,
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.75);
            return { width: edge, height: edge };
          },
          aspectRatio: 1.0
        },
        (decodedText) => {
          // Check authoritative latest lock state
          if (!isLockedRef.current) {
            isLockedRef.current = true; // immediately lock
            // Stop scanning to release camera resources
            html5QrCode.pause(true);
            onScanSuccess(decodedText);
          }
        },
        () => {}
      );
    } catch (err: any) {
      console.warn('Camera initialization error:', err);
      if (
        err?.name === 'NotAllowedError' ||
        err?.message?.includes('Permission') ||
        err?.name === 'PermissionDeniedError'
      ) {
        setCameraError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (err?.name === 'NotFoundError' || err?.message?.includes('devices')) {
        setCameraError('No camera detected on this device. Please inform your faculty.');
      } else {
        setCameraError(err?.message || 'Unable to access camera. Please ensure HTTPS is enabled and permissions are granted.');
      }
    }
  }, [onScanSuccess, stopScanner]);

  useEffect(() => {
    initScanner();

    // Clean teardown on unmount
    return () => {
      stopScanner().catch((e) => console.warn('Unmount stop error:', e));
    };
  }, [initScanner, stopScanner]);

  // Handle resume scanning when lock released after error
  useEffect(() => {
    if (!isScanningLocked && scannerRef.current) {
      try {
        scannerRef.current.resume();
      } catch {}
    }
  }, [isScanningLocked]);

  const handleSwitchCamera = async () => {
    if (!cameras || cameras.length <= 1 || !scannerRef.current) return;
    const nextIndex = (currentCameraIndex + 1) % cameras.length;
    setCurrentCameraIndex(nextIndex);

    try {
      await stopScanner();
      await scannerRef.current.start(
        { deviceId: { exact: cameras[nextIndex].id } },
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.75);
            return { width: edge, height: edge };
          },
          aspectRatio: 1.0
        },
        (decodedText) => {
          if (!isLockedRef.current) {
            isLockedRef.current = true;
            scannerRef.current?.pause(true);
            onScanSuccess(decodedText);
          }
        },
        () => {}
      );
    } catch (e) {
      console.warn('Camera switch error:', e);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative mx-auto w-full max-w-[280px]">
        {/* Viewfinder Container */}
        <div
          id={scannerElementId}
          className="aspect-square w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-sm dark:border-slate-800"
        />

        {/* Verifying / Locked State Overlay */}
        {isScanningLocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-slate-900/80 p-4 text-white backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mb-2" />
            <span className="text-xs font-semibold">Verifying attendance...</span>
          </div>
        )}
      </div>

      {/* Switch Camera Button (if multiple cameras detected) */}
      {cameras.length > 1 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={handleSwitchCamera}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <SwitchCamera className="h-3.5 w-3.5" />
            <span>Switch Camera</span>
          </button>
        </div>
      )}

      {/* Error state */}
      {cameraError && (
        <div className="mt-3 w-full max-w-[280px] rounded-lg border border-rose-200 bg-rose-50 p-3 text-left text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Camera Notice</span>
          </div>
          <p className="mt-1 text-slate-600 dark:text-slate-400">{cameraError}</p>
          <button
            type="button"
            onClick={initScanner}
            className="mt-2.5 inline-flex items-center gap-1 rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry Camera</span>
          </button>
        </div>
      )}
    </div>
  );
};
