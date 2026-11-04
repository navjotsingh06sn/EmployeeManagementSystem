
"""Universal Local OCR for document images."""

import io
import re

import pytesseract
from fastapi import HTTPException, status
from PIL import (
    Image,
    ImageEnhance,
    ImageOps,
    UnidentifiedImageError,
)

from backend.app.config import TESSERACT_CMD


# Configure local Tesseract OCR
if TESSERACT_CMD:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD


def extract_document_text(image_bytes: bytes, document_type: str = "aadhaar") -> str:
    """
    Extract text from document images or PDFs using local OCR.

    PDFs with embedded text are read directly. Scanned PDF pages and images
    are processed locally by Tesseract.

    Extracted text is returned as recognized so the signed-in employee and
    administrators can read the document details.
    """

    def ocr_image(image):
        if image.width * image.height > 25_000_000:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Image is too large. Upload a smaller image.",
            )
        image = ImageOps.exif_transpose(image).convert("RGB")
        if document_type == "aadhaar" and image.height > image.width:
            image = image.rotate(90, expand=True)
        largest_side = max(image.size)
        scale = min(3.0, 1800 / largest_side) if largest_side < 1800 else min(1.0, 2800 / largest_side)
        if scale != 1.0:
            image = image.resize(
                (round(image.width * scale), round(image.height * scale)),
                Image.Resampling.LANCZOS,
            )
        grayscale = ImageOps.autocontrast(ImageOps.grayscale(image))
        grayscale = ImageEnhance.Sharpness(grayscale).enhance(1.5)

        thresholded = grayscale.point(lambda value: 255 if value > 165 else 0)
        best_text = ""
        best_score = float("-inf")
        for candidate in (grayscale, thresholded):
            page_modes = (6, 11, 4) if document_type == "aadhaar" else (6, 11)
            for page_mode in page_modes:
                data = pytesseract.image_to_data(
                    candidate,
                    lang="eng",
                    config=f"--oem 3 --psm {page_mode}",
                    output_type=pytesseract.Output.DICT,
                )
                grouped_lines = {}
                confidences = []
                token_count = 0
                for index, raw_word in enumerate(data["text"]):
                    word = raw_word.strip()
                    if not word:
                        continue
                    key = (
                        data["block_num"][index],
                        data["par_num"][index],
                        data["line_num"][index],
                    )
                    grouped_lines.setdefault(key, []).append(word)
                    token_count += 1
                    try:
                        confidence = float(data["conf"][index])
                    except (TypeError, ValueError):
                        continue
                    if confidence >= 0:
                        confidences.append(confidence)

                text = "\n".join(" ".join(words) for words in grouped_lines.values())
                average_confidence = (
                    sum(confidences) / len(confidences) if confidences else 0
                )
                score = average_confidence * 0.25 + min(token_count, 30) * 1.5
                normalized = text.lower()
                if document_type == "aadhaar":
                    if re.search(r"(?<!\d)(?:\d[\s-]*){11}\d(?!\d)", text):
                        score += 18
                    score += sum(
                        3 for label in ("aadhaar", "government of india", "date of birth", "gender")
                        if label in normalized
                    )
                if score > best_score:
                    best_text, best_score = text, score
        return best_text

    try:
        if image_bytes.startswith(b"%PDF-"):
            try:
                import fitz
            except ImportError as error:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="PDF reading is unavailable. Install the PyMuPDF dependency.",
                ) from error

            try:
                with fitz.open(stream=image_bytes, filetype="pdf") as pdf:
                    if not pdf.page_count:
                        raise HTTPException(
                            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            detail="This PDF has no pages.",
                        )
                    if pdf.page_count > 15:
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail="Resumes must contain 15 pages or fewer.",
                        )

                    page_text = []
                    for page in pdf:
                        text = page.get_text("text").strip()
                        if not text:
                            page_area = max(page.rect.width * page.rect.height, 1)
                            scale = min(2.0, (25_000_000 / page_area) ** 0.5)
                            pixmap = page.get_pixmap(
                                matrix=fitz.Matrix(scale, scale),
                                alpha=False,
                            )
                            image = Image.frombytes(
                                "RGB",
                                (pixmap.width, pixmap.height),
                                pixmap.samples,
                            )
                            text = ocr_image(image)
                        page_text.append(text)
                    extracted_text = "\n\n".join(page_text)
            except (
                HTTPException,
                pytesseract.TesseractNotFoundError,
                pytesseract.TesseractError,
            ):
                raise
            except Exception as error:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail="This PDF could not be opened. Upload a valid PDF file.",
                ) from error
        else:
            with Image.open(io.BytesIO(image_bytes)) as source_image:
                extracted_text = ocr_image(source_image)

    except pytesseract.TesseractNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Tesseract OCR not found. Check your installation path."
        ) from error

    except pytesseract.TesseractError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="OCR could not process this document."
        ) from error

    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
    ) as error:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Invalid image. Upload a valid document photo."
        ) from error

    # Remove only excessive blank lines; preserve the recognized values.
    cleaned_text = re.sub(
        r"\n{3,}",
        "\n\n",
        extracted_text
    ).strip()

    if not cleaned_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No readable text found. Upload a clearer document image."
        )

    return cleaned_text


# Backward compatibility for existing Aadhaar OCR routes
def extract_masked_aadhaar_text(image_bytes: bytes) -> str:
    return extract_document_text(image_bytes)
