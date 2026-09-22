import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  isScanningLocked: boolean;
}

export const QrScanner: React.FC<QrScannerProps> = ({ onScanSuccess, isScanningLocked }) => {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarted, setCameraStarted] = useState<boolean>(false);
  const [cameras, setCameras] = useState<any[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState<number>(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerElementId = 'qr-reader-container';

  const initScanner = async () => {
    try {
      setCameraError(null);
      
      // Query available video devices
      const devices = await Html5Qrcode.getCameras().catch(() => []);
      let chosenIndex = 0;
      if (devices && devices.length > 0) {
        setCameras(devices);
        // Automatically prefer the rear/environment camera on phones
        const rearIdx = devices.findIndex((d: any) => 
          d.label?.toLowerCase().includes('back') || 
          d.label?.toLowerCase().includes('rear') ||
          d.label?.toLowerCase().includes('environment')
        );
        if (rearIdx !== -1) chosenIndex = rearIdx;
        setCurrentCameraIndex(chosenIndex);
      }

      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop().catch(() => {});
      }

      const html5QrCode = new Html5Qrcode(scannerElementId);
      scannerRef.current = html5QrCode;

      const cameraConfig = devices && devices.length > 0 
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
          if (!isScanningLocked) {
            onScanSuccess(decodedText);
          }
        },
        () => {}
      );

      setCameraStarted(true);
    } catch (err: any) {
      console.warn('Camera start error:', err);
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission') || err?.name === 'PermissionDeniedError') {
        setCameraError('Camera permission denied. Please allow camera access in your browser address bar settings.');
      } else if (err?.name === 'NotFoundError' || err?.message?.includes('devices')) {
        setCameraError('No camera detected on this device. You can still use the manual token fallback below.');
      } else {
        setCameraError(err?.message || 'Unable to access camera. Please check camera permissions.');
      }
    }
  };

  useEffect(() => {
    initScanner();

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch((e) => console.warn('Scanner stop error', e));
      }
    };
  }, []);

  const switchCamera = async () => {
    if (!cameras || cameras.length <= 1 || !scannerRef.current) return;
    const nextIndex = (currentCameraIndex + 1) % cameras.length;
    setCurrentCameraIndex(nextIndex);

    try {
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
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
          if (!isScanningLocked) {
            onScanSuccess(decodedText);
          }
        },
        () => {}
      );
    } catch (e) {
      console.warn('Camera switch error', e);
    }
  };

  return (
    <div style={{ marginTop: 10, textAlign: 'center', position: 'relative' }}>
      <style>{`
        #${scannerElementId} {
          position: relative;
          width: 100% !important;
          max-width: 290px !important;
          aspect-ratio: 1 / 1 !important;
          margin: 0 auto !important;
          border-radius: 18px !important;
          overflow: hidden !important;
          background: #0d1117 !important;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        }
        #${scannerElementId} video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 18px !important;
        }
        @keyframes laserSweep {
          0% { top: 15%; opacity: 0.8; }
          50% { top: 80%; opacity: 1; }
          100% { top: 15%; opacity: 0.8; }
        }
        .scanner-laser-line {
          position: absolute;
          left: 10%;
          width: 80%;
          height: 2px;
          background: linear-gradient(90deg, transparent, #00e676, #00c853, transparent);
          box-shadow: 0 0 12px #00e676, 0 0 4px #b9f6ca;
          animation: laserSweep 2s ease-in-out infinite;
          pointer-events: none;
          z-index: 10;
        }
        .scanner-corner {
          position: absolute;
          width: 28px;
          height: 28px;
          border-color: #00e676;
          border-style: solid;
          pointer-events: none;
          z-index: 10;
          box-shadow: 0 0 10px rgba(0, 230, 118, 0.5);
        }
        .top-left { top: 22px; left: 22px; border-width: 3px 0 0 3px; border-top-left-radius: 8px; }
        .top-right { top: 22px; right: 22px; border-width: 3px 3px 0 0; border-top-right-radius: 8px; }
        .bottom-left { bottom: 22px; left: 22px; border-width: 0 0 3px 3px; border-bottom-left-radius: 8px; }
        .bottom-right { bottom: 22px; right: 22px; border-width: 0 3px 3px 0; border-bottom-right-radius: 8px; }
      `}</style>

      {/* Viewfinder Frame with Overlay */}
      <div style={{ position: 'relative', display: 'inline-block', width: '100%', maxWidth: 290 }}>
        <div id={scannerElementId} />

        {cameraStarted && (
          <>
            {/* Cyber Reticle Corners */}
            <div className="scanner-corner top-left" />
            <div className="scanner-corner top-right" />
            <div className="scanner-corner bottom-left" />
            <div className="scanner-corner bottom-right" />
            
            {/* Animated Laser Scan Line */}
            {!isScanningLocked && <div className="scanner-laser-line" />}
          </>
        )}

        {/* Locked / Verifying Overlay */}
        {isScanningLocked && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            borderRadius: 18,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20
          }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.2)',
              borderTopColor: '#00e676',
              animation: 'spin 0.8s linear infinite',
              marginBottom: 12
            }} />
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, letterSpacing: 0.5 }}>
              Verifying QR Credential...
            </span>
          </div>
        )}
      </div>

      {/* Switch Camera Button (if device has front + back) */}
      {cameras.length > 1 && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={switchCamera}
            style={{
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: 20,
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: 500,
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            🔄 Switch Camera
          </button>
        </div>
      )}

      {cameraError && (
        <div style={{ 
          margin: '12px auto 0', 
          maxWidth: 290, 
          padding: 14, 
          background: 'rgba(239, 68, 68, 0.12)', 
          color: '#fca5a5', 
          borderRadius: 14, 
          fontSize: 13, 
          textAlign: 'left', 
          border: '1px solid rgba(239, 68, 68, 0.3)' 
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📷</span> Camera Notice
          </div>
          <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 10, lineHeight: 1.4 }}>
            {cameraError}
          </div>
          <button
            onClick={initScanner}
            style={{
              padding: '6px 12px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            🔄 Retry Camera Permission
          </button>
        </div>
      )}
    </div>
  );
};
