"""
Streaming Demo Downloader and On-the-Fly Decompressor per SPEC §4 and Phase 2.
Directly decompresses zstd, gzip, or raw PBDE streams to target .dem file in 1 MiB chunks.
Enforces max_bytes limit and guarantees partial file cleanup on abort.
"""

import zlib
import logging
from pathlib import Path
import httpx
import zstandard as zstd

logger = logging.getLogger("ingest.download")

ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"
GZIP_MAGIC = b"\x1f\x8b"
RAW_DEMO_MAGIC = b"PBDE"
CHUNK_SIZE = 1024 * 1024  # 1 MiB (1,048,576 bytes)


async def stream_and_decompress(
    url: str,
    dest_dem_path: Path,
    client: httpx.AsyncClient,
    max_bytes: int = 1_500_000_000,
) -> None:
    """
    Streams from `url`, sniffs magic bytes, and decompresses in 1 MiB chunks directly to `dest_dem_path`.
    Never writes the compressed archive to disk.
    Aborts and raises ValueError if total decompressed bytes exceed `max_bytes` or on invalid magic bytes.
    """
    dest_dem_path.parent.mkdir(parents=True, exist_ok=True)
    total_written = 0

    try:
        async with client.stream("GET", url, timeout=180.0, follow_redirects=True) as response:
            response.raise_for_status()

            first_chunk = None
            async for chunk in response.aiter_bytes(chunk_size=CHUNK_SIZE):
                if chunk:
                    first_chunk = chunk
                    break

            if not first_chunk:
                raise ValueError("Downloaded demo stream is empty")

            # Sniff first 4 bytes
            mode = "raw"
            decompressor = None
            if first_chunk.startswith(ZSTD_MAGIC):
                mode = "zstd"
                decompressor = zstd.ZstdDecompressor().decompressobj()
            elif first_chunk.startswith(GZIP_MAGIC):
                mode = "gzip"
                decompressor = zlib.decompressobj(31)  # 31 enables gzip header support
            elif first_chunk.startswith(RAW_DEMO_MAGIC):
                mode = "raw"
            else:
                raise ValueError("Unsupported demo stream magic bytes")

            with open(dest_dem_path, "wb") as f_out:
                # Process first chunk
                if mode in ("zstd", "gzip"):
                    unpacked = decompressor.decompress(first_chunk)
                else:
                    unpacked = first_chunk

                if unpacked:
                    total_written += len(unpacked)
                    if total_written > max_bytes:
                        raise ValueError("Decompressed demo exceeds max_dem_bytes")
                    f_out.write(unpacked)

                # Process remaining stream chunks
                async for chunk in response.aiter_bytes(chunk_size=CHUNK_SIZE):
                    if not chunk:
                        continue

                    if mode in ("zstd", "gzip"):
                        unpacked = decompressor.decompress(chunk)
                    else:
                        unpacked = chunk

                    if unpacked:
                        total_written += len(unpacked)
                        if total_written > max_bytes:
                            raise ValueError("Decompressed demo exceeds max_dem_bytes")
                        f_out.write(unpacked)

                # Flush any leftover buffered bytes
                if mode == "gzip" and decompressor:
                    tail = decompressor.flush()
                    if tail:
                        total_written += len(tail)
                        if total_written > max_bytes:
                            raise ValueError("Decompressed demo exceeds max_dem_bytes")
                        f_out.write(tail)

    except Exception:
        dest_dem_path.unlink(missing_ok=True)
        raise
