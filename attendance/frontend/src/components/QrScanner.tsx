/**
 * QrScanner — Stable lifecycle QR scanner for PRAVAHAx student attendance.
 *
 * Design invariants:
 * - Camera initialises ONCE on mount (or on explicit key-prop change from parent).
 * - onScanSuccess is stored in a ref so parent re-renders never trigger re-initialisation.
 * - Scanner pauses immediately on first decode; it does NOT auto-resume after errors.
 * - "Scan Again" is surfaced to the parent; the parent re-mounts this component via key change.
 * - Cleanup calls stop() (or clear() from paused state) on unmount, method-switch, or success.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { SwitchCamera, AlertTriangle, RefreshCw, Loader2, ShieldCheck } from 'lucide-react';

interface QrScannerProps {
  /** Called with decoded text exactly once before the scanner pauses. */
  onScanSuccess: (decodedText: string) => void;
  /**
   * When true the scanner is paused and shows a "Verifying…" overlay.
   * When false (after an error / explicit reset) the scanner does NOT auto-resume;
   * the parent must remount this component via a key change.
   */
  isScanningLocked: boolean;
}

export const QrScanner: React.FC<QrScannerProps> = ({ onScanSuccess, isScanningLocked }) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState<number>(0);
  const [initialized, setInitialized] = useState(false);

  // ── Stable refs ──────────────────────────────────────────────────────────────
  const scannerRef = useRef<Html5Qrcode | null>(null);

  /**
   * Always points to the latest onScanSuccess without making initScanner depend on it.
   * This ensures the mount effect runs exactly once.
   */
  const onScanSuccessRef = useRef(onScanSuccess);
  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  });

  /**
   * Tracks whether a decode has already fired this session.
   * Prevents a paused scanner from calling onScanSuccess a second time.
   */
  const hasDecodedRef = useRef(false);

  const scannerElementId = 'qr-reader-container';

  // ── Stop helper ───────────────────────────────────────────────────────────────
  const stopScanner = useCallback(async () => {
    const sc = scannerRef.current;
    if (!sc) return;
    try {
      if (sc.isScanning) {
        await sc.stop();
      } else {
        // Was paused — still need to release camera tracks
        await sc.clear();
      }
    } catch (err) {
      console.warn('[QrScanner] Stop/clear error:', err);
    }
  }, []);

  // ── Init ─────────────────────────────────────────────────────────────────────
  const initScanner = useCallback(async () => {
    setCameraError(null);
    hasDecodedRef.current = false;

    // Stop any existing instance first
    await stopScanner();

    try {
      // Enumerate cameras
      const devices = await Html5Qrcode.getCameras().catch(() => [] as { id: string; label: string }[]);
      let chosenIndex = 0;
      if (devices && devices.length > 0) {
        setCameras(devices);
        // Prefer rear / environment camera on mobile
        const rearIdx = devices.findIndex((d) => {
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
          qrbox: (w: number, h: number) => {
            // Cap scanning box so it fits within narrow screens
            const edge = Math.floor(Math.min(w, h, 280) * 0.8);
            return { width: edge, height: edge };
          },
          aspectRatio: 1.0
        },
        // Decode success callback — fires from inside html5-qrcode library
        (decodedText: string) => {
          if (hasDecodedRef.current) return; // guard against double-fire
          hasDecodedRef.current = true;

          // Pause immediately so the camera does not re-scan the same QR
          try {
            html5QrCode.pause(true);
          } catch {
            // ignore pause errors
          }

          // Notify parent via stable ref — does not depend on prop identity
          onScanSuccessRef.current(decodedText);
        },
        // Decode failure callback — called for every non-QR frame; suppress
        () => {}
      );

      setInitialized(true);
    } catch (err: any) {
      console.warn('[QrScanner] Camera initialization error:', err);
      let msg = 'Unable to access camera. Please ensure HTTPS is enabled and camera permissions are granted.';
      if (
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        err?.message?.includes('Permission')
      ) {
        msg = 'Camera permission denied. Please allow camera access in your browser settings and reload.';
      } else if (err?.name === 'NotFoundError' || err?.message?.includes('devices')) {
        msg = 'No camera detected on this device. Please use the Attendance Code instead.';
      }
      setCameraError(msg);
    }
  // initScanner intentionally does NOT list onScanSuccess as a dep —
  // it reads it via onScanSuccessRef so the camera is never restarted on parent rerenders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopScanner]);

  // ── Mount once / Cleanup ─────────────────────────────────────────────────────
  useEffect(() => {
    initScanner();
    return () => {
      stopScanner().catch((e) => console.warn('[QrScanner] Unmount stop error:', e));
    };
    // Empty dep array: runs exactly once on mount, cleans up on unmount.
    // initScanner is stable (stopScanner has no deps either).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Switch camera ─────────────────────────────────────────────────────────────
  const handleSwitchCamera = async () => {
    if (!cameras || cameras.length <= 1) return;
    const nextIndex = (currentCameraIndex + 1) % cameras.length;
    setCurrentCameraIndex(nextIndex);
    hasDecodedRef.current = false;

    try {
      await stopScanner();
      const html5QrCode = new Html5Qrcode(scannerElementId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { deviceId: { exact: cameras[nextIndex].id } },
        {
          fps: 15,
          qrbox: (w: number, h: number) => {
            const edge = Math.floor(Math.min(w, h, 280) * 0.8);
            return { width: edge, height: edge };
          },
          aspectRatio: 1.0
        },
        (decodedText: string) => {
          if (hasDecodedRef.current) return;
          hasDecodedRef.current = true;
          try { html5QrCode.pause(true); } catch { /* ignore */ }
          onScanSuccessRef.current(decodedText);
        },
        () => {}
      );
    } catch (e) {
      console.warn('[QrScanner] Camera switch error:', e);
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      {/* Viewfinder wrapper — responsive, no horizontal overflow */}
      <div className="relative w-full max-w-xs mx-auto">
        <div
          id={scannerElementId}
          className="aspect-square w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-sm dark:border-slate-800"
          style={{ minHeight: '200px' }}
        />

        {/* Verifying / Locked overlay */}
        {isScanningLocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-slate-900/85 p-4 text-white backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mb-2" aria-hidden="true" />
            <span className="text-sm font-semibold">Verifying attendance…</span>
            <span className="mt-1 text-xs text-slate-400">Please wait</span>
          </div>
        )}

        {/* Success overlay (scanner is done) */}
        {initialized && !isScanningLocked && !cameraError && hasDecodedRef.current && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-emerald-900/80 p-4 text-white backdrop-blur-sm">
            <ShieldCheck className="h-8 w-8 text-emerald-300 mb-2" aria-hidden="true" />
            <span className="text-sm font-semibold">QR Scanned</span>
          </div>
        )}
      </div>

      {/* Switch Camera */}
      {cameras.length > 1 && !isScanningLocked && (
        <div className="mt-3">
          <button
            type="button"
            onClick={handleSwitchCamera}
            disabled={isScanningLocked}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <SwitchCamera className="h-3.5 w-3.5" />
            <span>Switch Camera</span>
          </button>
        </div>
      )}

      {/* Camera error state */}
      {cameraError && (
        <div className="mt-3 w-full max-w-xs rounded-lg border border-rose-200 bg-rose-50 p-3 text-left text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Camera Unavailable</span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{cameraError}</p>
          <button
            type="button"
            onClick={initScanner}
            className="mt-2.5 inline-flex items-center gap-1 rounded bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 active:bg-rose-800"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry Camera</span>
          </button>
        </div>
      )}
    </div>
  );
};
