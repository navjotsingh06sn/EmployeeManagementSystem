export default function OcrDetails({
  text,
  documentType = "aadhaar",
  adminOnly = false,
  fileName = "document",
  details = {},
}) {
  if (!adminOnly || !text?.trim()) return null;

  const isAadhaar = documentType === "aadhaar";
  const isPan = documentType === "pan";
  const isResume = documentType === "resume";
  const aadhaarNumber = (isAadhaar
    ? [...text.matchAll(/(?<!\d)(?:\d[\s-]*){11}\d(?!\d)/g)]
    : [])
    .map(([value]) => value.replace(/\D/g, ""))
    .find((value) => value.length === 12);
  const detailLabels = {
    name: "Name",
    father_name: "Father / care of",
    address: "Address",
    phone: "Phone number",
    date_of_birth: "Date of birth",
    gender: "Gender",
    aadhaar_number: "Aadhaar number",
    pan_number: "PAN number",
    email: "Email",
    education: "Education",
    experience: "Experience",
    skills: "Skills",
  };
  const extractedDetails = Object.entries(detailLabels)
    .filter(([key]) => details[key]?.trim())
    .map(([key, label]) => [label, details[key].trim()]);
  const visibleDetails = extractedDetails.filter(([label]) => label !== "Aadhaar number" && label !== "PAN number");
  const numberLabel = isAadhaar ? "Aadhaar number" : isPan ? "PAN number" : "";
  const numberValue = isAadhaar
    ? details.aadhaar_number || (aadhaarNumber ? aadhaarNumber.match(/.{1,4}/g)?.join(" ") : "")
    : isPan
      ? details.pan_number || text.match(/\b[A-Z]{5}\s?\d{4}\s?[A-Z]\b/i)?.[0]?.replace(/\s/g, "").toUpperCase()
      : "";
  const textFileContents = [
    "Extracted document details",
    "==========================",
    ...(extractedDetails.length
      ? extractedDetails.map(([label, value]) => `${label}: ${value}`)
      : ["No labeled details could be confidently identified."]),
    "",
    "Full OCR text",
    "==============",
    text.trim(),
    "",
  ].join("\n");

  function openTextFile() {
    const textUrl = URL.createObjectURL(
      new Blob([textFileContents], { type: "text/plain;charset=utf-8" })
    );
    window.open(textUrl, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(textUrl), 60_000);
  }

  function saveTextFile() {
    const safeName = fileName.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_");
    const textUrl = URL.createObjectURL(
      new Blob([textFileContents], { type: "text/plain;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = textUrl;
    link.download = `${safeName}-ocr.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(textUrl), 1000);
  }

  return (
    <section className={`aadhaar-ocr-result document-template-${documentType}`} aria-label={`Extracted ${documentType} details`}>
      <article className="aadhaar-preview-card">
        <div className="aadhaar-card-topline" />
        <header className="aadhaar-card-header">
          <div className="aadhaar-card-mark" aria-hidden="true">{isAadhaar ? "ID" : isPan ? "PAN" : isResume ? "CV" : "DOC"}</div>
          <div>
            <strong>{isAadhaar ? "Government of India" : isPan ? "Income Tax Department" : isResume ? "Resume" : "Document"}</strong>
            <span>{isAadhaar ? "आधार · Aadhaar" : isPan ? "Permanent Account Number" : "Administrator-only extracted text"}</span>
          </div>
          <span className="aadhaar-card-chip">{isAadhaar ? "AADHAAR" : isPan ? "PAN CARD" : isResume ? "RESUME" : "DOCUMENT"}</span>
        </header>

        {numberValue && (
          <div className="aadhaar-number-block">
            <span>{numberLabel}</span>
            <strong aria-label={`${numberLabel} ${numberValue}`}>
              {isAadhaar ? numberValue.replace(/\D/g, "").match(/.{1,4}/g)?.join(" ") : numberValue}
            </strong>
          </div>
        )}

        <div className="ocr-details-heading">
          <div>
            <strong>{isAadhaar || isPan ? "Identity card details" : isResume ? "Resume details" : "Detected document details"}</strong>
            <small>Fields shown only when found in the scan</small>
          </div>
        </div>

        <>
            {visibleDetails.length > 0 ? (
              <dl className="ocr-details-lines admin-ocr-fields">
                {visibleDetails.map(([label, value]) => (
                  <div className="ocr-detail-row" key={label}>
                    <dt>{label}</dt><dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="ocr-number-note">No labeled fields could be identified. The full OCR text is still available below.</p>}
            <details className="admin-ocr-raw"><summary>Show full OCR text</summary><pre>{text}</pre></details>
            <div className="ocr-admin-actions">
              <button className="refresh-button" type="button" onClick={openTextFile}>Open as text file</button>
              <button className="refresh-button" type="button" onClick={saveTextFile}>Save .txt</button>
            </div>
        </>
      </article>
    </section>
  );
}
