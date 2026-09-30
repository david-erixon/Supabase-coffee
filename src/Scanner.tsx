import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

type Props = {
  onClose: () => void;
  onScan: (ean: string) => void;
};

export default function Scanner({ onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let active = true;

    reader
      .decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current!,
        (result) => {
          if (active && result) {
            active = false;
            controlsRef.current?.stop();
            onScan(result.getText());
          }
        },
      )
      .then((controls) => {
        controlsRef.current = controls;
      })
      .catch(() => setError("Kameran kunde inte startas. Skriv in koden i stället."));

    return () => {
      active = false;
      controlsRef.current?.stop();
    };
  }, [onScan]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = manual.replace(/\D/g, "");
    if (value.length < 8) return setError("Ange minst 8 siffror.");
    controlsRef.current?.stop();
    onScan(value);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Skanna streckkod">
      <div className="scanner-sheet">
        <div className="sheet-heading">
          <div>
            <span className="eyebrow">Ny påse</span>
            <h2>Rikta mot streckkoden</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Stäng">×</button>
        </div>
        <div className="camera-frame">
          <video ref={videoRef} muted playsInline />
          <span className="scan-line" />
          <span className="corner c1" /><span className="corner c2" />
          <span className="corner c3" /><span className="corner c4" />
        </div>
        <p className="camera-help">EAN-8, EAN-13 och UPC stöds.</p>
        <form className="manual-code" onSubmit={submit}>
          <label htmlFor="manual-ean">Eller skriv in koden</label>
          <div>
            <input id="manual-ean" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="7312345678901" />
            <button className="button secondary" type="submit">Fortsätt</button>
          </div>
        </form>
        {error && <p className="message error">{error}</p>}
      </div>
    </div>
  );
}
