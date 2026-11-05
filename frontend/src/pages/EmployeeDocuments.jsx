import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, downloadFile, uploadFile, viewFile } from "../api";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import useAutoRefresh from "../hooks/useAutoRefresh";

const documentLabels = {
  auto: "document",
  aadhaar: "Aadhaar card",
  pan: "PAN card",
  resume: "Resume",
  document: "Document",
};

export default function EmployeeDocuments({ email, onBack, onOpenSettings, onLogout }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState("");
  const [busyDocumentId, setBusyDocumentId] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cameraType, setCameraType] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [pendingScan, setPendingScan] = useState(null);
  const [pendingScanPreviewUrl, setPendingScanPreviewUrl] = useState("");
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  const loadDocuments = useCallback(async () => {
    try {
      setDocuments(await apiRequest("/employees/me/documents"));
      setError("");
    } catch (err) {
      setError(err.message || "Could not load your documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useAutoRefresh(loadDocuments, 10000, !busyType && !cameraType);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (pendingScanPreviewUrl) URL.revokeObjectURL(pendingScanPreviewUrl);
    };
  }, [pendingScanPreviewUrl]);

  useEffect(() => {
    if (!cameraType) return undefined;
    let active = true;
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is unavailable. Open this page over HTTPS or use localhost.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setCameraError(err.name === "NotAllowedError"
          ? "Camera permission was blocked. Allow camera access in your browser and try again."
          : "Could not start the camera. Check that a camera is connected and not in use.");
      }
    }
    setCameraReady(false);
    setCameraError("");
    startCamera();
    return () => {
      active = false;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [cameraType]);

  function closeCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraType("");
    setCameraError("");
    setCameraReady(false);
  }

  async function captureDocument() {
    try {
      const video = videoRef.current;
      const type = cameraType;
      if (!video || !type || !video.videoWidth) {
        setCameraError("Wait for the camera preview to appear, then capture again.");
        return;
      }
      let sx = 0;
      let sy = 0;
      let sw = video.videoWidth;
      let sh = video.videoHeight;
      if (type === "aadhaar") {
        const targetRatio = 1.586;
        if (sw / sh > targetRatio) {
          const cropWidth = sh * targetRatio;
          sx = (sw - cropWidth) / 2;
          sw = cropWidth;
        } else {
          const cropHeight = sw / targetRatio;
          sy = (sh - cropHeight) / 2;
          sh = cropHeight;
        }
      }
      const captureScale = Math.min(1, 2200 / Math.max(sw, sh));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw * captureScale);
      canvas.height = Math.round(sh * captureScale);
      const context = canvas.getContext("2d");
      if (!context) {
        setCameraError("The camera could not prepare the scan. Please try again.");
        return;
      }
      context.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const toJpeg = (source, quality) => new Promise((resolve) => {
        source.toBlob(resolve, "image/jpeg", quality);
      });
      let blob = await toJpeg(canvas, 0.88);
      for (const quality of [0.78, 0.68]) {
        if (!blob || blob.size > 9 * 1024 * 1024) {
          blob = await toJpeg(canvas, quality);
        }
      }
      if (blob?.size > 9 * 1024 * 1024) {
        const reducedScale = Math.min(1, 1600 / Math.max(canvas.width, canvas.height));
        const reduced = document.createElement("canvas");
        reduced.width = Math.round(canvas.width * reducedScale);
        reduced.height = Math.round(canvas.height * reducedScale);
        const reducedContext = reduced.getContext("2d");
        if (!reducedContext) throw new Error("Could not resize the camera image.");
        reducedContext.drawImage(canvas, 0, 0, reduced.width, reduced.height);
        blob = await toJpeg(reduced, 0.76);
        if (blob?.size > 9 * 1024 * 1024) blob = await toJpeg(reduced, 0.64);
      }
      if (!blob) {
        setCameraError("The camera image could not be captured. Please try again.");
        return;
      }
      if (blob.size > 9 * 1024 * 1024) {
        setCameraError("The captured image is too large to upload. Move closer to the document and scan again.");
        return;
      }
      closeCamera();
      const file = new File([blob], `document-scan-${Date.now()}.jpg`, { type: "image/jpeg" });
      setPendingScan(file);
      setPendingScanPreviewUrl(URL.createObjectURL(file));
      await uploadDocument("auto", file);
    } catch {
      setCameraError("The camera could not prepare the scan. Please try again or choose a photo from your device.");
    }
  }

  async function uploadDocument(documentType, file) {
    setError("");
    setNotice("");
    setBusyType(documentType);
    try {
      const uploaded = await uploadFile("/employees/me/documents", file, documentType);
      setDocuments((current) => [uploaded, ...current]);
      const detectedLabel = documentLabels[uploaded.document_type] || "Document";
      setNotice(`${detectedLabel} detected and uploaded. Your administrator can review the extracted text.`);
      setPendingScan(null);
      setPendingScanPreviewUrl("");
    } catch (err) {
      setError(err.message || `Could not upload the ${documentLabels[documentType].toLowerCase()}.`);
    } finally {
      setBusyType("");
    }
  }

  async function addDocument(documentType, event) {
    const file = event.target.files?.[0];
    if (!file) return;

    await uploadDocument(documentType, file);
    event.target.value = "";
  }

  async function togglePreview(documentFile) {
    if (previewId === documentFile.id) {
      setPreviewId("");
      setPreviewUrl("");
      return;
    }

    setError("");
    setBusyDocumentId(documentFile.id);
    try {
      const url = await viewFile(`/employees/me/documents/${documentFile.id}`);
      setPreviewId(documentFile.id);
      setPreviewUrl(url);
    } catch (err) {
      setError(err.message || "Could not preview this document.");
    } finally {
      setBusyDocumentId("");
    }
  }

  function discardPendingScan() {
    setPendingScan(null);
    setPendingScanPreviewUrl("");
    setError("");
  }

  async function removeDocument(documentFile) {
    if (!window.confirm(`Delete ${documentLabels[documentFile.document_type] || documentFile.filename}?`)) return;

    setError("");
    setNotice("");
    try {
      await apiRequest(`/employees/me/documents/${documentFile.id}`, {
        method: "DELETE",
      });
      setDocuments((current) => current.filter((item) => item.id !== documentFile.id));
      if (previewId === documentFile.id) {
        setPreviewId("");
        setPreviewUrl("");
      }
      setNotice("Document deleted.");
    } catch (err) {
      setError(err.message || "Could not delete this document.");
    }
  }

  async function downloadDocument(documentFile) {
    setError("");
    try {
      await downloadFile(
        `/employees/me/documents/${documentFile.id}`,
        documentFile.filename
      );
    } catch (err) {
      setError(err.message || "Could not download this document.");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <ThemeToggle />
          <span className="user-badge"><span className="live-dot" /> {email}</span>
          <button className="refresh-button" type="button" onClick={onBack}>Dashboard</button>
          <button className="refresh-button" type="button" onClick={onOpenSettings}>Settings</button>
          <button className="logout-button" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="dashboard employee-dashboard employee-documents-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">MY WORKSPACE / DOCUMENTS</p>
            <h1>My documents</h1>
            <p className="page-description">Upload or scan a document. Common document types are identified from the text for administrator review.</p>
          </div>
          <div className="heading-badge"><span className="live-dot" /> Private to your account</div>
        </section>

        {error && <div className="alert" role="alert">{error}</div>}
        {notice && <div className="success-alert" role="status">{notice}</div>}

        {pendingScan && (
          <section className="panel scan-retry-panel" aria-label="Captured document scan">
            <div className="aadhaar-photo-preview">
              <img src={pendingScanPreviewUrl} alt="Captured document scan preview" />
              <p>{busyType ? "Uploading the scan and extracting text…" : "This captured scan is saved here until upload succeeds or you discard it."}</p>
            </div>
            {!busyType && (
              <div className="employee-document-actions">
                <button className="refresh-button" type="button" onClick={() => uploadDocument("auto", pendingScan)}>Retry scan and upload</button>
                <button className="delete-button" type="button" onClick={discardPendingScan}>Discard scan</button>
              </div>
            )}
          </section>
        )}

        <section className="panel document-panel">
          <div className="directory-heading">
            <div>
              <p className="panel-kicker">ADD A DOCUMENT</p>
              <h2>Upload any document</h2>
            </div>
          </div>
          <div className="document-upload-options">
            <div className="document-upload-option">
              <span className="document-option-icon">OCR</span>
              <span className="document-option-copy">
                <strong>Aadhaar · PAN · Resume · other</strong>
                <small>PDF, JPG or PNG · up to 10 MB</small>
                <em>Document type is detected from its text. Readable fields are only shown to your administrator.</em>
              </span>
              <div className="document-option-actions">
                <button type="button" className="document-option-action" disabled={busyType !== ""} onClick={() => setCameraType("auto")}>Scan with camera</button>
                <label className="document-option-action">{busyType ? "Reading…" : "Choose file"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    disabled={busyType !== ""}
                    onChange={(event) => addDocument("auto", event)}
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="panel document-panel">
          <div className="directory-heading">
            <div>
              <p className="panel-kicker">YOUR FILES</p>
              <h2>Uploaded documents</h2>
            </div>
          </div>
          {loading ? (
            <p className="document-empty-copy">Loading your documents…</p>
          ) : documents.length === 0 ? (
            <p className="document-empty-copy">No documents uploaded yet.</p>
          ) : (
            <ul className="employee-document-list">
              {documents.map((documentFile) => {
                const label = documentLabels[documentFile.document_type] || documentFile.filename;
                const isPreviewOpen = previewId === documentFile.id;
                return (
                  <li key={documentFile.id}>
                    <div className="employee-document-info">
                      <strong>{label}</strong>
                      <small>{documentFile.filename} · {(documentFile.size_bytes / (1024 * 1024)).toFixed(2)} MB · {new Date(documentFile.uploaded_at).toLocaleDateString()}</small>
                    </div>
                    <div className="employee-document-actions">
                      <button className="refresh-button" type="button" onClick={() => togglePreview(documentFile)} disabled={busyDocumentId === documentFile.id}>
                        {busyDocumentId === documentFile.id ? "Loading…" : isPreviewOpen ? "Hide preview" : "View scan"}
                      </button>
                      <button className="refresh-button" type="button" onClick={() => downloadDocument(documentFile)}>Download</button>
                      <button className="delete-button" type="button" onClick={() => removeDocument(documentFile)}>Delete</button>
                    </div>
                    {isPreviewOpen && previewUrl && (
                      <div className="aadhaar-photo-preview">
                        {documentFile.content_type === "application/pdf" ? (
                          <iframe src={previewUrl} title={`Preview of ${documentFile.filename}`} />
                        ) : (
                          <img src={previewUrl} alt={`Your uploaded ${label} scan`} />
                        )}
                        <p>The document is shown only while this preview is open.</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
      {cameraType && (
        <div className="camera-scan-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCamera(); }}>
          <section className="camera-scan-modal" role="dialog" aria-modal="true" aria-labelledby="camera-scan-title">
            <div className="camera-scan-heading"><div><p className="panel-kicker">DOCUMENT SCANNER</p><h2 id="camera-scan-title">Scan {documentLabels[cameraType]}</h2></div><button type="button" className="camera-close" onClick={closeCamera} aria-label="Close camera">×</button></div>
            <p className="camera-scan-help">Place the document flat, fit it inside the guide, and keep the text in focus.</p>
            <div className={`camera-preview-wrap ${cameraType === "aadhaar" ? "aadhaar-guide" : cameraType === "auto" ? "auto-guide" : "resume-guide"}`}>
              <video ref={videoRef} autoPlay muted playsInline onLoadedMetadata={() => setCameraReady(true)} />
              <span className="camera-document-guide" aria-hidden="true" />
            </div>
            {cameraError && <p className="camera-scan-error" role="alert">{cameraError}</p>}
            <div className="camera-scan-actions"><button type="button" className="refresh-button" onClick={closeCamera}>Cancel</button><button type="button" className="primary-button" onClick={captureDocument} disabled={Boolean(cameraError) || !cameraReady || busyType !== ""}>{cameraReady ? "Capture and scan" : "Starting camera…"}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
