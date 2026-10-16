#!/usr/bin/env python3
"""Import the reviewed 15-card Impersonae batch from a public Google Drive folder."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SELECTION_PATH = ROOT / "catalog" / "impersonae-drive-selection-2026-10-16.json"
CATALOGUE_PATH = ROOT / "catalog" / "impersonae-v1.json"
CARDS_DIR = ROOT / "public" / "cards"
TARGET_SIZE = (432, 640)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def download_pdf(card: dict[str, object], destination: Path) -> None:
    local_source = os.environ.get("BIG_MATCH_CARD_SOURCE_DIR")
    if local_source:
        source = Path(local_source) / f"{card['slug']}.pdf"
        if not source.is_file():
            raise RuntimeError(f"Missing local source PDF: {source}")
        destination.write_bytes(source.read_bytes())
    else:
        import gdown
        result = gdown.download(id=str(card["driveId"]), output=str(destination), quiet=False)
        if not result or not destination.is_file():
            raise RuntimeError(f"Google Drive download failed for {card['name']}")
    if destination.read_bytes()[:4] != b"%PDF":
        raise RuntimeError(f"Downloaded source is not a PDF for {card['name']}")
    if digest(destination) != card["sourceSha256"]:
        raise RuntimeError(f"Source checksum mismatch for {card['name']}")


def render_card(pdf: Path, output: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="big-match-render-") as temporary:
        prefix = Path(temporary) / "page"
        subprocess.run(
            ["pdftoppm", "-f", "1", "-singlefile", "-r", "180", "-png", str(pdf), str(prefix)],
            check=True,
        )
        rendered = prefix.with_suffix(".png")
        with Image.open(rendered) as source:
            image = source.convert("RGB")
            target_ratio = TARGET_SIZE[0] / TARGET_SIZE[1]
            source_ratio = image.width / image.height
            if source_ratio > target_ratio:
                width = round(image.height * target_ratio)
                left = (image.width - width) // 2
                image = image.crop((left, 0, left + width, image.height))
            elif source_ratio < target_ratio:
                height = round(image.width / target_ratio)
                top = (image.height - height) // 2
                image = image.crop((0, top, image.width, top + height))
            image = image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary_output = output.with_suffix(".tmp.jpg")
            image.save(
                temporary_output,
                "JPEG",
                quality=86,
                optimize=True,
                progressive=True,
                subsampling=2,
            )
            temporary_output.replace(output)
    with Image.open(output) as checked:
        if checked.size != TARGET_SIZE or checked.mode != "RGB":
            raise RuntimeError(f"Unexpected rendered dimensions for {output.name}")
    data = output.read_bytes()
    if not (data.startswith(b"\xff\xd8") and data.endswith(b"\xff\xd9")):
        raise RuntimeError(f"Invalid JPEG output for {output.name}")


def update_catalogue(selection: dict[str, object]) -> None:
    catalogue = json.loads(CATALOGUE_PATH.read_text(encoding="utf-8"))
    if catalogue.get("deckVersion") != selection.get("deckVersion"):
        raise RuntimeError("Deck version mismatch")
    cards = catalogue.get("cards")
    if not isinstance(cards, list):
        raise RuntimeError("Invalid catalogue")
    original = [card for card in cards if int(card.get("id", 0)) <= 13]
    if [card.get("id") for card in original] != list(range(1, 14)):
        raise RuntimeError("The original stable IDs 1–13 are incomplete or reordered")
    expected = []
    for source in selection["cards"]:
        expected.append(
            {
                "id": source["id"],
                "slug": source["slug"],
                "name": source["name"],
                "image": f"cards/{source['slug']}.jpg",
                "alt": f"{source['name']} — original Impersonae card artwork by Chiara Zhu",
                "ordinal": source["id"],
            }
        )
    existing_extension = [card for card in cards if int(card.get("id", 0)) > 13]
    if existing_extension and existing_extension != expected:
        raise RuntimeError("The existing extension differs from the reviewed 15-card selection")
    catalogue["cards"] = original + expected
    CATALOGUE_PATH.write_text(
        json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    selection = json.loads(SELECTION_PATH.read_text(encoding="utf-8"))
    cards = selection.get("cards")
    if not isinstance(cards, list) or [card.get("id") for card in cards] != list(range(14, 29)):
        raise RuntimeError("Selection must contain stable IDs 14–28")
    if len({card.get("slug") for card in cards}) != 15:
        raise RuntimeError("Selection contains duplicate slugs")
    CARDS_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="big-match-drive-") as temporary:
        source_dir = Path(temporary)
        for card in cards:
            pdf = source_dir / f"{card['slug']}.pdf"
            output = CARDS_DIR / f"{card['slug']}.jpg"
            print(f"Importing {card['id']}: {card['name']}", flush=True)
            download_pdf(card, pdf)
            render_card(pdf, output)
    update_catalogue(selection)
    print("Imported 15 original Impersonae artworks and expanded the manifest to 28 cards.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Card import failed: {error}", file=sys.stderr)
        raise
