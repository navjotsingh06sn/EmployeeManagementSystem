"""Local OCR for Aadhaar card images."""

import io
import re

import pytesseract
from fastapi import HTTPException, status
from PIL import Image, ImageEnhance, ImageOps, UnidentifiedImageError

from backend.app.config import TESSERACT_CMD

if TESSERACT_CMD:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

AADHAAR_NUMBER_PATTERN = re.compile(r"(?<!\d)(?:\d[\s-]*){11}\d(?!\d)")
AADHAAR_LABEL_PATTERN = re.compile(
    r"aad[h]?aar|uidai|unique identification", re.IGNORECASE
)


def extract_masked_aadhaar_text(image_bytes: bytes) -> str:
    """Read a card locally and return its text with full Aadhaar numbers masked."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as source_image:
            if source_image.width * source_image.height > 25_000_000:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="This image is too large to process. Choose a smaller Aadhaar image.",
                )

            image = ImageOps.exif_transpose(source_image).convert("RGB")
            image.thumbnail((2400, 2400))
            image = ImageOps.grayscale(image)
            image = ImageEnhance.Contrast(image).enhance(1.6)
            extracted_text = pytesseract.image_to_string(
                image,
                lang="eng",
                config="--psm 6",
            )
    except pytesseract.TesseractNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Local OCR is not installed. Install Tesseract OCR and restart the backend."
            ),
        ) from error
    except pytesseract.TesseractError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not read this image. Upload a clear Aadhaar card photo.",
        ) from error
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="This image could not be opened. Upload a JPG or PNG Aadhaar image.",
        ) from error

    normalized_text = re.sub(r"\s+", " ", extracted_text).lower()
    has_aadhaar_label = bool(AADHAAR_LABEL_PATTERN.search(normalized_text))
    has_aadhaar_number = any(
        len(re.sub(r"\D", "", number)) == 12
        for number in AADHAAR_NUMBER_PATTERN.findall(extracted_text)
    )
    has_government_label = "government of india" in normalized_text

    if not has_aadhaar_label and not (has_government_label and has_aadhaar_number):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Only Aadhaar card images are accepted. Upload a clear Aadhaar card photo."
            ),
        )

    return AADHAAR_NUMBER_PATTERN.sub("XXXX XXXX XXXX", extracted_text).strip()
